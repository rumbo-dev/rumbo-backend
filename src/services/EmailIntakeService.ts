import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const client = new Anthropic()
const prisma = new PrismaClient()

interface IntakeResult {
  operationId: string
  isNew: boolean
  operation: any
  extractedData: any
  draftEmail?: any
  suggestedTasks: string[]
  reasoning: string
}

export async function processEmailIntake(rawEmail: string, userId: string): Promise<IntakeResult> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `You are a freight forwarding AI. Analyze this email and extract ALL shipment information. Respond ONLY with valid JSON, no markdown.

EMAIL:
${rawEmail}

Extract and respond with this exact JSON structure:
{
  "operationCode": "extracted code like OP-2024-001 or null if not found",
  "containerNumber": "extracted container number or null",
  "originPort": "port of origin or 'Unknown'",
  "originCountry": "ISO 2-letter country code or 'XX'",
  "destinationPort": "port of destination or 'Unknown'",
  "destinationCountry": "ISO 2-letter country code or 'XX'",
  "weightKg": numeric weight in kg or 0,
  "incoterm": "FOB/CIF/EXW/DDP or 'FOB'",
  "mode": "FCL/LCL/AIR/LAND or 'FCL'",
  "clientName": "client/consignee name or 'Unknown Client'",
  "clientEmail": "client email if found or null",
  "shippingLine": "carrier name or 'Unknown'",
  "costEstimate": numeric estimate in USD or 0,
  "priority": "LOW/NORMAL/HIGH/CRITICAL",
  "currentStage": "BOOKING/DOCUMENTATION/PICKUP/IN_TRANSIT/CUSTOMS/DELIVERED",
  "etaDate": "ISO date string or null",
  "suggestedTasks": ["task 1", "task 2", "task 3"],
  "draftEmailSubject": "subject for response email",
  "draftEmailBody": "professional response body in Spanish",
  "fromEmail": "sender email extracted from email",
  "reasoning": "brief explanation"
}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Bad response type')

  let extracted
  try {
    const cleaned = content.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    extracted = JSON.parse(cleaned)
  } catch {
    throw new Error('Failed to parse AI response')
  }

  let operation
  let isNew = false

  // Check if operation exists
  if (extracted.operationCode && extracted.operationCode !== 'null') {
    operation = await prisma.operation.findFirst({
      where: { operationCode: extracted.operationCode, userId },
    })
  }

  // If not found, create new
  if (!operation) {
    isNew = true
    const opCode = extracted.operationCode && extracted.operationCode !== 'null' 
      ? extracted.operationCode 
      : `OP-AUTO-${Date.now().toString().slice(-6)}`
    
    const containerNum = extracted.containerNumber && extracted.containerNumber !== 'null'
      ? extracted.containerNumber
      : `AUTO-${Date.now().toString().slice(-6)}`

    operation = await prisma.operation.create({
      data: {
        userId,
        operationCode: opCode,
        containerNumber: containerNum,
        originPort: extracted.originPort || 'Unknown',
        originCountry: extracted.originCountry || 'XX',
        destinationPort: extracted.destinationPort || 'Unknown',
        destinationCountry: extracted.destinationCountry || 'XX',
        weightKg: Number(extracted.weightKg) || 0,
        incoterm: extracted.incoterm || 'FOB',
        mode: extracted.mode || 'FCL',
        clientName: extracted.clientName || 'Unknown Client',
        clientEmail: extracted.clientEmail !== 'null' ? extracted.clientEmail : null,
        shippingLine: extracted.shippingLine || 'Unknown',
        costEstimate: Number(extracted.costEstimate) || 0,
        priority: extracted.priority || 'NORMAL',
        status: 'ACTIVE',
        currentStage: extracted.currentStage || 'BOOKING',
        eta: extracted.etaDate && extracted.etaDate !== 'null' ? new Date(extracted.etaDate) : null,
      },
    })

    // Create journey steps
    const steps = [
      { stepNumber: 1, stepName: 'Booking Confirmation', status: 'COMPLETED' },
      { stepNumber: 2, stepName: 'Documentation', status: extracted.currentStage === 'DOCUMENTATION' ? 'CURRENT' : 'PENDING' },
      { stepNumber: 3, stepName: 'Pickup', status: 'PENDING' },
      { stepNumber: 4, stepName: 'Port of Loading', status: 'PENDING' },
      { stepNumber: 5, stepName: 'In Transit', status: extracted.currentStage === 'IN_TRANSIT' ? 'CURRENT' : 'PENDING' },
      { stepNumber: 6, stepName: 'Port of Discharge', status: 'PENDING' },
    ]
    for (const step of steps) {
      await prisma.journeyStep.create({ data: { operationId: operation.id, ...step } })
    }
  }

  // Save inbound email
  await prisma.emailInbound.create({
    data: {
      operationId: operation.id,
      from: extracted.fromEmail || 'unknown@unknown.com',
      to: 'rumbo@rumbocorp.com',
      subject: extracted.draftEmailSubject?.replace(/^RE:\s*/i, '') || 'Email recibido',
      body: rawEmail,
      status: 'PROCESSED',
      processedAt: new Date(),
    },
  })

  // Timeline event
  await prisma.timelineEvent.create({
    data: {
      operationId: operation.id,
      title: isNew ? 'Operación creada desde email' : 'Email recibido y procesado',
      eventType: isNew ? 'OPERATION_CREATED' : 'EMAIL_RECEIVED',
      description: `Procesado por IA · ${extracted.fromEmail || 'sender'}`,
      source: 'AI_INTAKE',
    },
  })

  // Tasks
  if (Array.isArray(extracted.suggestedTasks)) {
    for (const taskTitle of extracted.suggestedTasks) {
      if (typeof taskTitle === 'string' && taskTitle.length > 0) {
        await prisma.task.create({
          data: {
            operationId: operation.id,
            userId,
            title: taskTitle.substring(0, 200),
            description: taskTitle,
            priority: extracted.priority || 'NORMAL',
            status: 'PENDING',
            createdByAi: true,
            aiConfidence: 0.85,
            aiReasoning: extracted.reasoning,
          },
        })
      }
    }
  }

  // Draft
  let draft = null
  if (extracted.draftEmailBody) {
    draft = await prisma.emailDraft.create({
      data: {
        operationId: operation.id,
        to: extracted.fromEmail || 'unknown@unknown.com',
        subject: extracted.draftEmailSubject || `RE: Operation ${operation.operationCode}`,
        body: extracted.draftEmailBody,
        status: 'DRAFT',
        aiGenerated: true,
        aiReasoning: extracted.reasoning,
      },
    })
  }

  return {
    operationId: operation.id,
    isNew,
    operation,
    extractedData: extracted,
    draftEmail: draft,
    suggestedTasks: extracted.suggestedTasks || [],
    reasoning: extracted.reasoning || '',
  }
}
