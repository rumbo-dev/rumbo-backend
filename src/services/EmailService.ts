import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const client = new Anthropic()
const prisma = new PrismaClient()

interface EmailAnalysisResult {
  operationCode: string | null
  containerNumber: string | null
  suggestedTasks: string[]
  urgencyLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  draftEmail: {
    to: string
    subject: string
    body: string
  }
  reasoning: string
}

export async function processEmailAndUpdateOperation(
  inboundEmail: {
    from: string
    to: string
    subject: string
    body: string
  },
  operationId?: string
): Promise<EmailAnalysisResult> {
  try {
    // Llamar a Claude para analizar el email
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are an expert freight forwarding AI assistant. Analyze this incoming email and provide structured guidance.

INCOMING EMAIL:
From: ${inboundEmail.from}
To: ${inboundEmail.to}
Subject: ${inboundEmail.subject}
Body: ${inboundEmail.body}

Please respond with a JSON object containing:
1. operationCode: Extract the operation code if present (e.g., "OP-2024-001")
2. containerNumber: Extract container number if present
3. suggestedTasks: Array of 2-3 actionable tasks the freight forwarder should do
4. urgencyLevel: Set to LOW, NORMAL, HIGH, or CRITICAL based on the email content
5. draftEmail: Object with "to", "subject", "body" - a professional response email to send
6. reasoning: Brief explanation of your analysis

Respond ONLY with the JSON object, no markdown or extra text.`,
        },
      ],
    })

    // Extraer el contenido de la respuesta
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    const analysis = JSON.parse(content.text) as EmailAnalysisResult

    // Si tenemos operationId, actualizamos la operación
    if (operationId) {
      // Crear evento en timeline
      await prisma.timelineEvent.create({
        data: {
          operationId,
          title: `Email recibido: ${inboundEmail.subject}`,
          eventType: 'EMAIL_RECEIVED',
          description: `De: ${inboundEmail.from}`,
          source: 'EMAIL',
        },
      })

      // Crear tasks sugeridas
      for (const taskDescription of analysis.suggestedTasks) {
        await prisma.task.create({
          data: {
            operationId,
            userId: 'demo-user', // En producción, sería del usuario actual
            title: taskDescription.split('\n')[0].substring(0, 100),
            description: taskDescription,
            priority: analysis.urgencyLevel === 'CRITICAL' ? 'CRITICAL' : analysis.urgencyLevel === 'HIGH' ? 'HIGH' : 'NORMAL',
            status: 'PENDING',
            createdByAi: true,
            aiConfidence: 0.85,
            aiReasoning: analysis.reasoning,
          },
        })
      }

      // Crear draft de email
      await prisma.emailDraft.create({
        data: {
          operationId,
          to: analysis.draftEmail.to,
          subject: analysis.draftEmail.subject,
          body: analysis.draftEmail.body,
          status: 'DRAFT',
          aiGenerated: true,
          aiReasoning: analysis.reasoning,
        },
      })

      // Guardar email recibido
      await prisma.emailInbound.create({
        data: {
          operationId,
          from: inboundEmail.from,
          to: inboundEmail.to,
          subject: inboundEmail.subject,
          body: inboundEmail.body,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      })
    }

    return analysis
  } catch (error) {
    console.error('Error processing email:', error)
    throw error
  }
}
