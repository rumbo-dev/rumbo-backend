import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface EmailAnalysis {
  emailType: 'QUOTE' | 'BOOKING_CONFIRMATION' | 'SHIPMENT_STATUS' | 'DOCUMENTATION' | 'PAYMENT_REQUEST' | 'CUSTOMS_NOTIFICATION' | 'OTHER'
  operationCode?: string
  containerNumber?: string
  confidence: number
  extractedData: {
    weight?: number
    origin?: string
    destination?: string
    rate?: number
    eta?: string
    shippingLine?: string
    status?: string
    urgency?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
    nextStep?: string
  }
  suggestedTasks: Array<{
    title: string
    description: string
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
    estimatedCost?: number
  }>
  updatesSuggested: {
    operationStatus?: string
    currentStage?: string
    notes?: string
  }
}

export async function analyzeEmailWithClaude(
  emailSubject: string,
  emailBody: string,
  fromEmail: string,
  toEmail: string
): Promise<EmailAnalysis> {
  const prompt = `Analiza este email de freight forwarding y extrae información.

EMAIL:
De: ${fromEmail}
Para: ${toEmail}
Asunto: ${emailSubject}
Body:
${emailBody}

Responde en JSON con esta estructura:
{
  "emailType": "QUOTE|BOOKING_CONFIRMATION|SHIPMENT_STATUS|DOCUMENTATION|PAYMENT_REQUEST|CUSTOMS_NOTIFICATION|OTHER",
  "operationCode": "código de operación si está mencionado",
  "containerNumber": "número de container si está mencionado",
  "confidence": 0.0 a 1.0,
  "extractedData": {
    "weight": número en kg si se menciona,
    "origin": puerto/ciudad origen,
    "destination": puerto/ciudad destino,
    "rate": tarifa si se menciona,
    "eta": fecha estimada de arribo,
    "shippingLine": línea naviera,
    "status": estado del shipment (BOOKING|IN_TRANSIT|CUSTOMS|DELIVERED),
    "urgency": "LOW|NORMAL|HIGH|CRITICAL",
    "nextStep": próximo paso sugerido
  },
  "suggestedTasks": [
    {
      "title": "título de tarea",
      "description": "descripción",
      "priority": "LOW|NORMAL|HIGH|CRITICAL",
      "estimatedCost": número estimado
    }
  ],
  "updatesSuggested": {
    "operationStatus": "nuevo status si aplica",
    "currentStage": "nuevo stage si aplica",
    "notes": "notas a agregar"
  }
}

Sé específico y preciso. Si no hay información, omite el campo.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    // Extraer JSON de la respuesta
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No se pudo extraer JSON de la respuesta')
    }

    const analysis = JSON.parse(jsonMatch[0]) as EmailAnalysis
    return analysis
  } catch (error) {
    console.error('Error analyzing email with Claude:', error)
    throw error
  }
}

export async function processEmailAndUpdateOperation(
  emailSubject: string,
  emailBody: string,
  fromEmail: string,
  toEmail: string,
  userId: string
): Promise<{ success: boolean; operationId?: string; message: string }> {
  try {
    // Analizar email con Claude
    const analysis = await analyzeEmailWithClaude(emailSubject, emailBody, fromEmail, toEmail)

    console.log('Email analysis:', analysis)

    // Buscar operación por código o container
    let operation = null

    if (analysis.operationCode) {
      operation = await prisma.operation.findFirst({
        where: {
          userId,
          operationCode: {
            contains: analysis.operationCode,
            mode: 'insensitive',
          },
        },
      })
    }

    if (!operation && analysis.containerNumber) {
      operation = await prisma.operation.findFirst({
        where: {
          userId,
          containerNumber: {
            contains: analysis.containerNumber,
            mode: 'insensitive',
          },
        },
      })
    }

    // Si no encuentra operación exacta, busca por origen/destino como fallback
    if (!operation && analysis.extractedData.origin && analysis.extractedData.destination) {
      operation = await prisma.operation.findFirst({
        where: {
          userId,
          originPort: {
            contains: analysis.extractedData.origin,
            mode: 'insensitive',
          },
          destinationPort: {
            contains: analysis.extractedData.destination,
            mode: 'insensitive',
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!operation) {
      return {
        success: false,
        message: `No se encontró operación para este email. Se requiere código de operación o container en el email.`,
      }
    }

    // Actualizar operación si hay updates sugeridos
    if (analysis.updatesSuggested) {
      const updateData: any = {}
      if (analysis.updatesSuggested.operationStatus) {
        updateData.status = analysis.updatesSuggested.operationStatus
      }
      if (analysis.updatesSuggested.currentStage) {
        updateData.currentStage = analysis.updatesSuggested.currentStage
      }
      if (analysis.updatesSuggested.notes) {
        updateData.notes = (operation.notes || '') + '\n' + analysis.updatesSuggested.notes
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.operation.update({
          where: { id: operation.id },
          data: updateData,
        })
      }
    }

    // Actualizar journey steps si se menciona status
    if (analysis.extractedData.status) {
      const statusMap: { [key: string]: { stepName: string; stepStatus: string } } = {
        BOOKING: { stepName: 'Booking', stepStatus: 'COMPLETED' },
        IN_TRANSIT: { stepName: 'En océano', stepStatus: 'CURRENT' },
        CUSTOMS: { stepName: 'Aduanaje', stepStatus: 'CURRENT' },
        DELIVERED: { stepName: 'Entrega', stepStatus: 'COMPLETED' },
      }

      const mapping = statusMap[analysis.extractedData.status]
      if (mapping) {
        await prisma.journeyStep.updateMany({
          where: {
            operationId: operation.id,
            stepName: mapping.stepName,
          },
          data: {
            status: mapping.stepStatus,
          },
        })
      }
    }

    // Crear timeline event para el email
    await prisma.timelineEvent.create({
      data: {
        operationId: operation.id,
        title: `Email: ${emailSubject}`,
        eventType: analysis.emailType.toLowerCase(),
        description: `De: ${fromEmail}`,
        timestamp: new Date(),
        source: 'email',
      },
    })

    // Crear tasks sugeridas
    if (analysis.suggestedTasks && analysis.suggestedTasks.length > 0) {
      await prisma.task.createMany({
        data: analysis.suggestedTasks.map(task => ({
          operationId: operation!.id,
          userId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          createdByAi: true,
          aiConfidence: analysis.confidence,
          estimatedCost: task.estimatedCost,
        })),
      })
    }

    return {
      success: true,
      operationId: operation.id,
      message: `Email procesado exitosamente. Operación actualizada: ${operation.operationCode}`,
    }
  } catch (error) {
    console.error('Error processing email:', error)
    throw error
  }
}
