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

// ============ MIDDLEWARE ============
app.use(cors())
app.use(express.json())

// Request ID
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || `${Date.now()}`
  next()
})

// ============ TYPES ============
interface AuthRequest extends Request {
  userId?: string
}

// ============ VALIDATION SCHEMAS ============
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

// ============ MIDDLEWARE AUTH ============
const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: 'No token' })
    }
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.userId = decoded.userId
    next()
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ============ HEALTH ============
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// ============ AUTH ENDPOINTS ============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = LoginSchema.parse(req.body)
    
    let user = await prisma.user.findUnique({ where: { email } })
    
    if (!user) {
      // Demo user
      const hashedPassword = await bcrypt.hash(password, 10)
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName: 'Demo User',
        },
      })
    } else {
      const validPassword = await bcrypt.compare(password, user.password)
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid password' })
      }
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' })
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    })
  } catch (e) {
    res.status(400).json({ error: 'Login failed' })
  }
})

// ============ OPERATIONS ENDPOINTS ============

// GET ALL OPERATIONS
app.get('/api/operations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { userId: req.userId },
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
    })
    
    res.json({
      success: true,
      data: operations,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch operations' })
  }
})

// GET SINGLE OPERATION
app.get('/api/operations/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const operation = await prisma.operation.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: true,
        journeySteps: {
          orderBy: { stepNumber: 'asc' },
        },
        timelineEvents: {
          orderBy: { timestamp: 'desc' },
        },
      },
    })
    
    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' })
    }
    
    if (operation.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    
    res.json({
      success: true,
      data: operation,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch operation' })
  }
})

// CREATE OPERATION
app.post('/api/operations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = CreateOperationSchema.parse(req.body)
    
    const operation = await prisma.operation.create({
      data: {
        ...data,
        userId: req.userId!,
        currentStage: 'Documentación',
        status: 'DRAFT',
        // Auto-create journey steps
        journeySteps: {
          create: [
            { stepNumber: 1, stepName: 'Documentación', status: 'CURRENT' },
            { stepNumber: 2, stepName: 'Booking', status: 'PENDING' },
            { stepNumber: 3, stepName: 'En océano', status: 'PENDING' },
            { stepNumber: 4, stepName: 'En puerto destino', status: 'PENDING' },
            { stepNumber: 5, stepName: 'Aduanaje', status: 'PENDING' },
            { stepNumber: 6, stepName: 'Entrega', status: 'PENDING' },
          ],
        },
      },
      include: {
        journeySteps: true,
        tasks: true,
      },
    })
    
    // Auto-create suggested tasks
    await prisma.task.createMany({
      data: [
        {
          operationId: operation.id,
          userId: req.userId!,
          title: 'Validar documentación aduanal',
          description: 'Revisar BL y factura comercial antes de arribo',
          priority: 'HIGH',
          createdByAi: true,
          aiConfidence: 0.92,
          estimatedCost: 2500,
        },
        {
          operationId: operation.id,
          userId: req.userId!,
          title: 'Coordinar desembarque en puerto',
          description: 'Contactar terminales portuarias para confirmar fecha',
          priority: 'HIGH',
          createdByAi: true,
          aiConfidence: 0.88,
          estimatedCost: 3500,
        },
        {
          operationId: operation.id,
          userId: req.userId!,
          title: 'Preparar trámite de importación',
          description: 'Completar formularios DUCA e información aduanal',
          priority: 'NORMAL',
          createdByAi: true,
          aiConfidence: 0.85,
          estimatedCost: 1800,
        },
      ],
    })
    
    const fullOperation = await prisma.operation.findUnique({
      where: { id: operation.id },
      include: {
        journeySteps: true,
        tasks: true,
      },
    })
    
    res.status(201).json({
      success: true,
      data: fullOperation,
    })
  } catch (e: any) {
    console.error(e)
    res.status(400).json({ error: e.message || 'Failed to create operation' })
  }
})

// UPDATE OPERATION
app.patch('/api/operations/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = UpdateOperationSchema.parse(req.body)
    
    const operation = await prisma.operation.update({
      where: { id: req.params.id },
      data,
      include: {
        tasks: true,
        journeySteps: true,
      },
    })
    
    res.json({
      success: true,
      data: operation,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to update operation' })
  }
})

// UPDATE TASK STATUS
app.patch('/api/tasks/:taskId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = UpdateTaskSchema.parse(req.body)
    
    const task = await prisma.task.update({
      where: { id: req.params.taskId },
      data: { status },
    })
    
    res.json({
      success: true,
      data: task,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// DASHBOARD KPIs
app.get('/api/dashboard/kpis', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const operations = await prisma.operation.findMany({
      where: { userId: req.userId },
    })
    
    const kpis = {
      totalOperations: operations.length,
      inTransit: operations.filter(op => op.status === 'IN_TRANSIT').length,
      pending: operations.filter(op => op.status === 'PENDING').length,
      completed: operations.filter(op => op.status === 'COMPLETED').length,
      avgCost: operations.length ? operations.reduce((sum, op) => sum + op.costEstimate, 0) / operations.length : 0,
      totalRevenue: operations.reduce((sum, op) => sum + op.costEstimate, 0),
    }
    
    res.json({
      success: true,
      data: kpis,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch KPIs' })
  }
})

// ============ EMAIL PROCESSING (FASE 2) ============

const ProcessEmailSchema = z.object({
  emailSubject: z.string(),
  emailBody: z.string(),
  fromEmail: z.string().email(),
  toEmail: z.string().email(),
})

app.post('/api/emails/process', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { emailSubject, emailBody, fromEmail, toEmail } = ProcessEmailSchema.parse(req.body)

    const result = await processEmailAndUpdateOperation(
      emailSubject,
      emailBody,
      fromEmail,
      toEmail,
      req.userId!
    )

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        operationId: result.operationId,
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      })
    }
  } catch (e: any) {
    console.error('Error processing email:', e)
    res.status(500).json({
      success: false,
      error: e.message || 'Failed to process email',
    })
  }
})

// ============ ERROR HANDLING ============
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`✓ Backend running on port ${PORT}`)
})

export default app
