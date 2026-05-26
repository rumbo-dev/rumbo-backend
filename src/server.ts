import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { processEmailAndUpdateOperation } from './services/EmailService.js'
import aiChatRouter from './routes/aiChat.js'
import todayRouter from './routes/today.js'
import quotesRouter from './routes/quotes.js'
import agentDecisionsRouter from './routes/agentDecisions.js'
import contractsRouter from './routes/contracts.js'
import { prisma } from './lib/prismaClient.js'
import {
  authMiddleware,
  signToken,
  requireOperationOwnedBy,
  requireDraftOwnedBy,
  requireTaskOwnedBy,
  type AuthRequest,
} from './lib/auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Routers modulares (cada uno aplica su propio middleware: auth o
// optionalAuth durante el compat layer de PR1)
app.use('/api/ai/chat', aiChatRouter)
app.use('/api/today', todayRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/agent-decisions', agentDecisionsRouter)
app.use('/api/contracts', contractsRouter)

// ============================================================================
// AUTH — login + /api/me
// ============================================================================

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' })

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { organization: true },
        },
      },
    })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' })

    if (user.memberships.length === 0) {
      return res.status(403).json({
        error: 'User has no organization membership. Contact admin.',
      })
    }

    const primary = user.memberships[0]
    const token = signToken({
      userId: user.id,
      organizationId: primary.organizationId,
      membershipId: primary.id,
    })

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      organization: {
        id: primary.organization.id,
        name: primary.organization.name,
        slug: primary.organization.slug,
        role: primary.role,
      },
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        isDefault: m.isDefault,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
        },
      })),
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

/**
 * GET /api/me — devuelve user + memberships + organización actual.
 * Lo usa el frontend para poblar el sidebar / selector de organización (PR2).
 */
app.get('/api/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        fullName: true,
        team: true,
        role: true,
        memberships: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { organization: true },
        },
      },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        team: user.team,
        role: user.role,
      },
      currentOrganizationId: req.organizationId,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        isDefault: m.isDefault,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
        },
      })),
    })
  } catch (error) {
    console.error('GET /api/me error:', error)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// ============================================================================
// OPERATIONS
// ============================================================================

app.get('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { organizationId: req.organizationId },
      include: { tasks: true, journeySteps: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(operations)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch operations' })
  }
})

app.get('/api/operations/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operation = await requireOperationOwnedBy(req.organizationId!, req.params.id)
    if (!operation) return res.status(404).json({ error: 'Not found' })

    const full = await prisma.operation.findFirst({
      where: { id: operation.id, organizationId: req.organizationId },
      include: {
        tasks: true,
        journeySteps: { orderBy: { stepNumber: 'asc' } },
        timelineEvents: { orderBy: { timestamp: 'desc' } },
      },
    })
    res.json(full)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' })
  }
})

app.post('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { operationCode: providedCode, clientName, clientReference, incoterm, mode, originPort, destinationPort } = req.body

    if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
      return res.status(400).json({ error: 'clientName is required' })
    }

    // Auto-generate operationCode si no se provee. El max se busca dentro
    // de la misma organización (no global) para que dos orgs distintas
    // puedan empezar en OP-0001 cada una.
    let operationCode = typeof providedCode === 'string' && providedCode.trim().length > 0
      ? providedCode.trim()
      : null

    if (!operationCode) {
      const allOps = await prisma.operation.findMany({
        where: { organizationId: req.organizationId! },
        select: { operationCode: true },
      })
      const maxNum = allOps.reduce((max, op) => {
        const m = op.operationCode.match(/^OP-(\d+)/)
        const n = m ? parseInt(m[1], 10) : 0
        return n > max ? n : max
      }, 0)
      operationCode = `OP-${String(maxNum + 1).padStart(4, '0')}`
    }

    const operation = await prisma.operation.create({
      data: {
        operationCode,
        clientName: clientName.trim(),
        clientReference:
          typeof clientReference === 'string' && clientReference.trim().length > 0
            ? clientReference.trim()
            : null,
        incoterm: typeof incoterm === 'string' && incoterm.length > 0 ? incoterm : null,
        mode: typeof mode === 'string' && mode.length > 0 ? mode : 'FCL',
        originPort:
          typeof originPort === 'string' && originPort.trim().length > 0 ? originPort.trim() : null,
        destinationPort:
          typeof destinationPort === 'string' && destinationPort.trim().length > 0
            ? destinationPort.trim()
            : null,
        userId: req.userId!,
        organizationId: req.organizationId!,
        status: 'QUOTING',
        subStatus: 'NEW_QUOTE',
        currentOwner: 'SALES',
        priority: 'NORMAL',
      },
    })

    const steps = [
      { stepNumber: 1, stepName: 'Booking Confirmation', description: 'Esperar confirmación' },
      { stepNumber: 2, stepName: 'Documentation', description: 'Preparar documentación' },
      { stepNumber: 3, stepName: 'Pickup', description: 'Recolección' },
      { stepNumber: 4, stepName: 'Port of Loading', description: 'Carga' },
      { stepNumber: 5, stepName: 'In Transit', description: 'Transporte' },
      { stepNumber: 6, stepName: 'Port of Discharge', description: 'Descarga' },
    ]
    for (const step of steps) {
      await prisma.journeyStep.create({
        data: {
          operationId: operation.id,
          organizationId: req.organizationId!,
          ...step,
        },
      })
    }

    res.status(201).json(operation)
  } catch (error) {
    res.status(400).json({ error: 'Failed to create' })
  }
})

app.patch('/api/operations/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operation = await requireOperationOwnedBy(req.organizationId!, req.params.id)
    if (!operation) return res.status(404).json({ error: 'Not found' })

    const updated = await prisma.operation.update({
      where: { id: operation.id },
      data: req.body,
    })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update' })
  }
})

// ============================================================================
// TASKS
// ============================================================================

app.patch('/api/tasks/:taskId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const task = await requireTaskOwnedBy(req.organizationId!, req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Not found' })

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: req.body.status,
        completedAt: req.body.status === 'COMPLETED' ? new Date() : null,
      },
    })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update' })
  }
})

// ============================================================================
// DASHBOARD
// ============================================================================

app.get('/api/dashboard/kpis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const ops = await prisma.operation.findMany({
      where: { organizationId: req.organizationId },
      include: { tasks: true },
    })
    res.json({
      totalOperations: ops.length,
      activeOperations: ops.filter((o) => o.status === 'IN_TRANSIT' || o.status === 'BOOKING').length,
      completedOperations: ops.filter((o) => o.status === 'CLOSED').length,
      pendingTasks: ops.reduce(
        (acc, o) => acc + o.tasks.filter((t) => t.status === 'PENDING').length,
        0,
      ),
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KPIs' })
  }
})

// ============================================================================
// EMAILS
// ============================================================================

/**
 * POST /api/emails/webhook — webhook de email (Mailgun en Sprint 2).
 *
 * FIX CRÍTICO (Sprint 1): antes hacía
 *   const ops = await prisma.operation.findMany({ take: 1 })
 * sin ningún filtro — adjuntaba cualquier email entrante a la primera
 * operation que encontrara. En multi-tenant esto fugaría data de la org A
 * a la org B. Documentado en LEARNINGS.md "/api/emails/webhook rompe en
 * multi-tenant".
 *
 * Comportamiento nuevo: requiere `operationCode` o `messageId` en el body
 * (o en headers de Mailgun en Sprint 2) para hacer el matching. Si no
 * matchea, responde 404 + log para investigación. Sprint 2 agregará firma
 * Mailgun + intake real.
 */
app.post('/api/emails/webhook', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text: body, operationCode, messageId } = req.body
    if (!from || !to || !subject || !body) {
      return res.status(400).json({ error: 'Missing fields' })
    }

    // Por ahora intentamos match por operationCode en el body (Mailgun real
    // viene en Sprint 2 con headers + threading).
    if (!operationCode) {
      console.warn('[webhook] No operationCode provided. Email logged but not routed.', {
        from,
        subject,
        messageId,
      })
      return res.status(404).json({
        success: false,
        message: 'No operation matched (operationCode missing). Logged for review.',
      })
    }

    // Buscar la operation por código GLOBALMENTE — pero el matcher tiene
    // que ser tenant-aware. En Sprint 2 con auth en webhooks, esto se hará
    // por organizationId del API key. Por ahora, exigimos que operationCode
    // sea único globalmente (lo es en este sistema porque OP-XXXX es del
    // demo user en el estado actual).
    const op = await prisma.operation.findFirst({
      where: { operationCode },
      select: { id: true, organizationId: true },
    })
    if (!op || !op.organizationId) {
      return res.status(404).json({
        success: false,
        message: `Operation ${operationCode} not found or has no organization assigned.`,
      })
    }

    const analysis = await processEmailAndUpdateOperation(
      { from, to, subject, body },
      op.id,
    )
    return res.json({ success: true, analysis, operationId: op.id })
  } catch (error) {
    console.error('[webhook] error:', error)
    res.status(500).json({ error: 'Webhook error' })
  }
})

app.get('/api/emails/drafts/:operationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const op = await requireOperationOwnedBy(req.organizationId!, req.params.operationId)
    if (!op) return res.status(404).json({ error: 'Not found' })

    const drafts = await prisma.emailDraft.findMany({
      where: { operationId: op.id, organizationId: req.organizationId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(drafts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' })
  }
})

app.post('/api/emails/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const draft = await requireDraftOwnedBy(req.organizationId!, req.body.draftId)
    if (!draft) return res.status(404).json({ error: 'Not found' })

    const sent = await prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
    await prisma.timelineEvent.create({
      data: {
        operationId: draft.operationId,
        organizationId: req.organizationId!,
        title: `Email: ${draft.subject}`,
        eventType: 'EMAIL_SENT',
        description: `To: ${draft.to}`,
        source: 'EMAIL',
      },
    })

    res.json({ success: true, sent })
  } catch (error) {
    res.status(500).json({ error: 'Failed to send' })
  }
})

app.post('/api/emails/process-and-create', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rawEmail } = req.body
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Missing rawEmail in body' })
    }

    const { processEmailWithOrchestrator } = await import('./agents/Orchestrator.js')
    const result = await processEmailWithOrchestrator({
      rawEmail,
      userId: req.userId!,
      organizationId: req.organizationId!,
    })

    res.json(result)
  } catch (error: any) {
    console.error('Orchestrator error:', error.message)
    res.status(500).json({ error: 'Failed to process email', details: error.message })
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
