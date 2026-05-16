import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { processEmailAndUpdateOperation } from './services/EmailService.js'
import aiChatRouter from './routes/aiChat.js'
import todayRouter from './routes/today.js'
import quotesRouter from './routes/quotes.js'

dotenv.config()

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

app.use(cors())
app.use(express.json())

// AI Chat route
app.use('/api/ai/chat', aiChatRouter)
app.use('/api/today', todayRouter)
app.use('/api/quotes', quotesRouter)

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
      },
    })
    if (!operation) return res.status(404).json({ error: 'Not found' })
    res.json(operation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' })
  }
})

app.post('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { operationCode, containerNumber, originPort, originCountry, destinationPort, destinationCountry, weightKg, cbm, incoterm, mode, clientName, clientEmail, shippingLine, costEstimate, priority } = req.body
    
    const operation = await prisma.operation.create({
      data: {
        operationCode, containerNumber, originPort, originCountry, destinationPort, destinationCountry,
        weightKg, cbm, incoterm, mode: mode || 'FCL', clientName, clientEmail, shippingLine, costEstimate, priority,
        userId: req.userId!,
        subStatus: 'BOOKING_PENDING',
        currentOwner: 'CUSTOMER',
        status: 'BOOKING',
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
