import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { processEmailAndUpdateOperation } from './services/EmailService.js'

dotenv.config()

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

app.use(cors())
app.use(express.json())

app.use((req, res, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || String(Date.now())
  next()
})

interface AuthRequest extends Request {
  userId?: string
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const CreateOperationSchema = z.object({
  operationCode: z.string(),
  containerNumber: z.string(),
  originPort: z.string(),
  originCountry: z.string(),
  destinationPort: z.string(),
  destinationCountry: z.string(),
  weightKg: z.number().positive(),
  cbm: z.number().positive().optional(),
  incoterm: z.string(),
  clientName: z.string(),
  clientEmail: z.string().email().optional(),
  shippingLine: z.string(),
  costEstimate: z.number().positive(),
  priority: z.string().default('NORMAL'),
})

const UpdateOperationSchema = z.object({
  status: z.string().optional(),
  currentStage: z.string().optional(),
  eta: z.string().datetime().optional(),
  costActual: z.number().optional(),
  notes: z.string().optional(),
})

const UpdateTaskSchema = z.object({
  status: z.string(),
})

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}


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
    const { id } = req.params
    const operation = await prisma.operation.findUnique({
      where: { id },
      include: {
        tasks: true,
        journeySteps: { orderBy: { stepNumber: 'asc' } },
        timelineEvents: { orderBy: { timestamp: 'desc' } },
      },
    })
    if (!operation || operation.userId !== req.userId) {
      return res.status(404).json({ error: 'Operation not found' })
    }
    res.json(operation)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch operation' })
  }
})

app.post('/api/operations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = CreateOperationSchema.parse(req.body)
    const operation = await prisma.operation.create({
      data: {
        ...data,
        userId: req.userId!,
        currentStage: 'BOOKING',
        status: 'ACTIVE',
      },
    })
    const steps = [
      { stepNumber: 1, stepName: 'Booking Confirmation', description: 'Esperar confirmación del booking' },
      { stepNumber: 2, stepName: 'Documentation', description: 'Preparar documentación' },
      { stepNumber: 3, stepName: 'Pickup', description: 'Recolección de carga' },
      { stepNumber: 4, stepName: 'Port of Loading', description: 'Carga en puerto' },
      { stepNumber: 5, stepName: 'In Transit', description: 'Transporte marítimo' },
      { stepNumber: 6, stepName: 'Port of Discharge', description: 'Descarga en puerto destino' },
    ]
    for (const step of steps) {
      await prisma.journeyStep.create({
        data: { operationId: operation.id, ...step },
      })
    }
    const aiTasks = [
      { title: 'Confirm booking with shipping line', description: 'Contact shipping line to confirm booking' },
      { title: 'Prepare export documentation', description: 'Gather and prepare all export documents' },
      { title: 'Arrange pickup logistics', description: 'Coordinate pickup with client' },
    ]
    for (const task of aiTasks) {
      await prisma.task.create({
        data: {
          operationId: operation.id,
          userId: req.userId!,
          ...task,
          priority: 'HIGH',
          createdByAi: true,
          aiConfidence: 0.85,
        },
      })
    }
    res.status(201).json(operation)
  } catch (error) {
    res.status(400).json({ error: 'Failed to create operation' })
  }
})

app.patch('/api/operations/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const data = UpdateOperationSchema.parse(req.body)
    const operation = await prisma.operation.findUnique({ where: { id } })
    if (!operation || operation.userId !== req.userId) {
      return res.status(404).json({ error: 'Operation not found' })
    }
    const updated = await prisma.operation.update({
      where: { id },
      data,
    })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update operation' })
  }
})

app.patch('/api/tasks/:taskId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params
    const { status } = UpdateTaskSchema.parse(req.body)
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { operation: true },
    })
    if (!task || task.operation.userId !== req.userId) {
      return res.status(404).json({ error: 'Task not found' })
    }
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
    })
    res.json(updated)
  } catch (error) {
    res.status(400).json({ error: 'Failed to update task' })
  }
})

app.get('/api/dashboard/kpis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { userId: req.userId },
      include: { tasks: true },
    })
    const totalOperations = operations.length
    const activeOperations = operations.filter((op) => op.status === 'ACTIVE').length
    const completedOperations = operations.filter((op) => op.status === 'COMPLETED').length
    const pendingTasks = operations.reduce((acc, op) => acc + op.tasks.filter((t) => t.status === 'PENDING').length, 0)
    res.json({
      totalOperations,
      activeOperations,
      completedOperations,
      pendingTasks,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KPIs' })
  }
})

app.post('/api/emails/webhook', async (req: Request, res: Response) => {
  try {
    const { from, to, subject, text: body } = req.body
    if (!from || !to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const operations = await prisma.operation.findMany({ take: 1 })
    const operationId = operations[0]?.id
    if (operationId) {
      const analysis = await processEmailAndUpdateOperation(
        { from, to, subject, body },
        operationId
      )
      return res.json({
        success: true,
        analysis,
        operationId,
      })
    }
    res.json({ success: true, message: 'Email received but no operation matched' })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Failed to process webhook' })
  }
})

app.get('/api/emails/drafts/:operationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { operationId } = req.params
    const operation = await prisma.operation.findUnique({ where: { id: operationId } })
    if (!operation || operation.userId !== req.userId) {
      return res.status(404).json({ error: 'Operation not found' })
    }
    const drafts = await prisma.emailDraft.findMany({
      where: { operationId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(drafts)
  } catch (error) {
    console.error('Error fetching drafts:', error)
    res.status(500).json({ error: 'Failed to fetch drafts' })
  }
})

app.post('/api/emails/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { draftId } = req.body
    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      include: { operation: true },
    })
    if (!draft || draft.operation.userId !== req.userId) {
      return res.status(404).json({ error: 'Draft not found' })
    }
    const sent = await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    })
    await prisma.timelineEvent.create({
      data: {
        operationId: draft.operationId,
        title: `Email enviado: ${draft.subject}`,
        eventType: 'EMAIL_SENT',
        description: `Para: ${draft.to}`,
        source: 'EMAIL',
      },
    })
    res.json({ success: true, sent })
  } catch (error) {
    console.error('Error sending email:', error)
    res.status(500).json({ error: 'Failed to send email' })
  }
})

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})
