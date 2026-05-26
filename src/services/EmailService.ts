import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prismaClient.js'

const client = new Anthropic()

export async function processEmailAndUpdateOperation(
  inboundEmail: { from: string; to: string; subject: string; body: string },
  operationId?: string
) {
  try {
    console.log('Processing email:', inboundEmail.subject)
    
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are a freight forwarding AI assistant. Analyze this email and respond ONLY with valid JSON (no markdown, no extra text).

EMAIL:
From: ${inboundEmail.from}
To: ${inboundEmail.to}
Subject: ${inboundEmail.subject}
Body: ${inboundEmail.body}

Respond with this JSON structure:
{
  "operationCode": "extracted code or null",
  "containerNumber": "extracted container or null",
  "suggestedTasks": ["task 1", "task 2"],
  "urgencyLevel": "NORMAL",
  "draftEmail": {
    "to": "${inboundEmail.from}",
    "subject": "RE: ${inboundEmail.subject}",
    "body": "Professional response in Spanish"
  },
  "reasoning": "Brief explanation"
}`,
        },
      ],
    })

    console.log('Claude response received')
    
    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let analysis
    try {
      const cleanedText = content.text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
      analysis = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error('JSON parse error:', content.text)
      throw new Error('Failed to parse Claude response')
    }

    if (operationId) {
      // Sprint 1: leemos también organizationId del operation. Todos los
      // creates derivados heredan esa org (single source of truth).
      const operation = await prisma.operation.findUnique({
        where: { id: operationId },
        select: { userId: true, organizationId: true },
      })

      if (!operation) {
        throw new Error('Operation not found')
      }

      // Save inbound email
      await prisma.emailInbound.create({
        data: {
          operationId,
          organizationId: operation.organizationId,
          from: inboundEmail.from,
          to: inboundEmail.to,
          subject: inboundEmail.subject,
          body: inboundEmail.body,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      })

      // Create timeline event
      await prisma.timelineEvent.create({
        data: {
          operationId,
          organizationId: operation.organizationId,
          title: `Email recibido: ${inboundEmail.subject}`,
          eventType: 'EMAIL_RECEIVED',
          description: `De: ${inboundEmail.from}`,
          source: 'EMAIL',
        },
      })

      // Create suggested tasks
      if (Array.isArray(analysis.suggestedTasks)) {
        for (const taskTitle of analysis.suggestedTasks) {
          if (typeof taskTitle === 'string' && taskTitle.length > 0) {
            await prisma.task.create({
              data: {
                operationId,
                userId: operation.userId,
                organizationId: operation.organizationId,
                title: taskTitle.substring(0, 200),
                description: taskTitle,
                priority: analysis.urgencyLevel || 'NORMAL',
                status: 'PENDING',
                createdByAi: true,
                aiConfidence: 0.85,
                aiReasoning: analysis.reasoning || '',
              },
            })
          }
        }
      }

      // Create email draft
      if (analysis.draftEmail) {
        await prisma.emailDraft.create({
          data: {
            operationId,
            organizationId: operation.organizationId,
            to: analysis.draftEmail.to || inboundEmail.from,
            subject: analysis.draftEmail.subject || `RE: ${inboundEmail.subject}`,
            body: analysis.draftEmail.body || '',
            status: 'DRAFT',
            aiGenerated: true,
            aiReasoning: analysis.reasoning || '',
          },
        })
      }
    }

    return analysis
  } catch (error: any) {
    console.error('Email processing error:', error.message)
    throw error
  }
}
