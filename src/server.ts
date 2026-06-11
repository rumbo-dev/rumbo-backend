import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { processEmailAndUpdateOperation } from './services/EmailService.js'
import aiChatRouter from './routes/aiChat.js'
import todayRouter from './routes/today.js'
import quotesRouter from './routes/quotes.js'
import agentDecisionsRouter from './routes/agentDecisions.js'
import contractsRouter from './routes/contracts.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

app.use(cors())
app.use(express.json())

// Static files (attachments for demo: HBL, MBL, Arrival Notice, etc.)
// __dirname en build apunta a /dist, así que subimos un nivel para llegar a /public.
app.use('/static', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) res.setHeader('Content-Type', 'application/pdf')
  },
}))

// AI Chat route
app.use('/api/ai/chat', aiChatRouter)
app.use('/api/today', todayRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/agent-decisions', agentDecisionsRouter)
app.use('/api/contracts', contractsRouter)

interface AuthRequest extends Request {
  userId?: string
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token' })
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' })
    
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' })
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { userId: req.userId },
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
    const param = req.params.id
    // Accept both UUIDs and operationCodes (e.g. "OP-0142") for shareable URLs
    const isOperationCode = /^OP-/i.test(param)
    const operation = await prisma.operation.findFirst({
      where: isOperationCode
        ? { operationCode: param, userId: req.userId }
        : { id: param, userId: req.userId },
      include: {
        tasks: true,
        journeySteps: { orderBy: { stepNumber: 'asc' } },
        timelineEvents: { orderBy: { timestamp: 'desc' } },
        attachments: { orderBy: { receivedAt: 'asc' } },
      },
    })
    if (!operation) return res.status(404).json({ error: 'Not found' })
    res.json(operation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' })
  }
})

// ============================================================================
// ATTACHMENTS — list per operation
// ============================================================================
// Endpoint público (mismo patrón que /api/quotes y /api/contracts) que devuelve
// los attachments de una operación + publicUrl construido. Igual que el resto
// de la API durante el periodo demo, resuelve via demo user.

function buildPublicUrl(req: Request, storedPath: string): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get('host')}`
  return `${base.replace(/\/$/, '')}/static/${storedPath.replace(/^\/+/, '')}`
}

app.get('/api/operations/:id/attachments', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: 'demo@example.com' },
      select: { id: true },
    })
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' })

    const param = req.params.id
    const isOperationCode = /^OP-/i.test(param)
    const operation = await prisma.operation.findFirst({
      where: isOperationCode
        ? { operationCode: param, userId: demoUser.id }
        : { id: param, userId: demoUser.id },
      select: { id: true },
    })
    if (!operation) return res.status(404).json({ error: 'Operation not found' })

    const attachments = await prisma.attachment.findMany({
      where: { operationId: operation.id },
      orderBy: { receivedAt: 'asc' },
    })

    res.json(attachments.map((a) => ({
      ...a,
      publicUrl: buildPublicUrl(req, a.storedPath),
    })))
  } catch (error) {
    console.error('GET /api/operations/:id/attachments error:', error)
    res.status(500).json({ error: 'Failed to fetch attachments' })
  }
})

app.post('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { operationCode: providedCode, clientName, clientReference, incoterm, mode, originPort, destinationPort } = req.body

    if (!clientName || typeof clientName !== 'string' || clientName.trim().length === 0) {
      return res.status(400).json({ error: 'clientName is required' })
    }

    // Auto-generate operationCode if not provided: max(numeric part of OP-XXXX) + 1
    let operationCode = typeof providedCode === 'string' && providedCode.trim().length > 0
      ? providedCode.trim()
      : null

    if (!operationCode) {
      const allOps = await prisma.operation.findMany({
        where: { userId: req.userId! },
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
        clientReference: typeof clientReference === 'string' && clientReference.trim().length > 0 ? clientReference.trim() : null,
        incoterm: typeof incoterm === 'string' && incoterm.length > 0 ? incoterm : null,
        mode: typeof mode === 'string' && mode.length > 0 ? mode : 'FCL',
        originPort: typeof originPort === 'string' && originPort.trim().length > 0 ? originPort.trim() : null,
        destinationPort: typeof destinationPort === 'string' && destinationPort.trim().length > 0 ? destinationPort.trim() : null,
        userId: req.userId!,
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
      await prisma.journeyStep.create({ data: { operationId: operation.id, ...step } })
    }
    
    res.status(201).json(operation)
  } catch (error) {
    res.status(400).json({ error: 'Failed to create' })
  }
})

app.patch('/api/operations/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operation = await prisma.operation.findUnique({ where: { id: req.params.id } })
    if (!operation || operation.userId !== req.userId) return res.status(404).json({ error: 'Not found' })
    
    const updated = await prisma.operation.update({ where: { id: req.params.id }, data: req.body })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update' })
  }
})

app.patch('/api/tasks/:taskId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId }, include: { operation: true } })
    if (!task || task.operation.userId !== req.userId) return res.status(404).json({ error: 'Not found' })
    
    const updated = await prisma.task.update({
      where: { id: req.params.taskId },
      data: { status: req.body.status, completedAt: req.body.status === 'COMPLETED' ? new Date() : null },
    })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update' })
  }
})

app.get('/api/dashboard/kpis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const ops = await prisma.operation.findMany({ where: { userId: req.userId }, include: { tasks: true } })
    res.json({
      totalOperations: ops.length,
      activeOperations: ops.filter(o => o.status === 'ACTIVE').length,
      completedOperations: ops.filter(o => o.status === 'COMPLETED').length,
      pendingTasks: ops.reduce((acc, o) => acc + o.tasks.filter(t => t.status === 'PENDING').length, 0),
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KPIs' })
  }
})

app.post('/api/emails/webhook', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text: body } = req.body
    if (!from || !to || !subject || !body) return res.status(400).json({ error: 'Missing fields' })
    
    const ops = await prisma.operation.findMany({ take: 1 })
    if (ops[0]) {
      const analysis = await processEmailAndUpdateOperation({ from, to, subject, body }, ops[0].id)
      return res.json({ success: true, analysis, operationId: ops[0].id })
    }
    res.json({ success: true, message: 'No operation matched' })
  } catch (error) {
    res.status(500).json({ error: 'Webhook error' })
  }
})

app.get('/api/emails/drafts/:operationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const op = await prisma.operation.findUnique({ where: { id: req.params.operationId } })
    if (!op || op.userId !== req.userId) return res.status(404).json({ error: 'Not found' })
    
    const drafts = await prisma.emailDraft.findMany({ where: { operationId: req.params.operationId }, orderBy: { createdAt: 'desc' } })
    res.json(drafts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' })
  }
})

app.post('/api/emails/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const draft = await prisma.emailDraft.findUnique({ where: { id: req.body.draftId }, include: { operation: true } })
    if (!draft || draft.operation.userId !== req.userId) return res.status(404).json({ error: 'Not found' })
    
    const sent = await prisma.emailDraft.update({ where: { id: req.body.draftId }, data: { status: 'SENT', sentAt: new Date() } })
    await prisma.timelineEvent.create({ data: { operationId: draft.operationId, title: `Email: ${draft.subject}`, eventType: 'EMAIL_SENT', description: `To: ${draft.to}`, source: 'EMAIL' } })
    
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
      userId: req.userId! 
    })
    
    res.json(result)
  } catch (error: any) {
    console.error('Orchestrator error:', error.message)
    res.status(500).json({ error: 'Failed to process email', details: error.message })
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
