// ============================================================================
// SPECIALIST: ActionClassifier
// ============================================================================
//
// Modelo: Sonnet (razonamiento de calidad para clasificación)
// Tarea: Dado un email + operación, clasificar qué actions son necesarias
//        y sugerir cambios de status/owner.
//
// ESTE ES EL AGENTE MÁS CRÍTICO. Define la calidad de las suggested actions
// y por ende del valor del producto.
//
// USA TOOL USE NATIVO con un schema rico para garantizar outputs estructurados.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  ActionClassifierOutput,
  ClassifiedAction,
  EmailParserOutput,
  OperationContext,
} from '../types.js'
import { MODEL_NAMES, SUB_STATUS_LABELS } from '../types.js'

const client = new Anthropic()

interface ClassifyInput {
  parsedEmail: EmailParserOutput
  rawEmail: string
  operationContext: OperationContext
}

const CLASSIFY_TOOL = {
  name: 'classify_actions',
  description:
    'Classifies the actions a freight forwarder needs to take based on an incoming email and the operation context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      actions: {
        type: 'array',
        description:
          'Array of action items the forwarder needs to take. Each action should be specific and executable. Avoid generic "follow up" actions.',
        items: {
          type: 'object',
          properties: {
            actionType: {
              type: 'string',
              enum: [
                'EMAIL_OUT',
                'DOCUMENT_REQUEST',
                'DOCUMENT_REVIEW',
                'DOCUMENT_GENERATE',
                'STATUS_CHECK',
                'PAYMENT_ACTION',
                'INTERNAL_DECISION',
                'DATA_ENTRY',
                'ESCALATION',
              ],
            },
            title: {
              type: 'string',
              description:
                'Short imperative title in Spanish, max 100 chars. E.g., "Solicitar Packing List al importador", "Revisar BL recibido de Maersk".',
            },
            description: {
              type: 'string',
              description: 'Brief description of what this action involves.',
            },
            responsibleTeam: {
              type: 'string',
              enum: ['SALES', 'PRICING', 'CUSTOMER', 'OPS'],
              description: 'Which team within the forwarder should handle this action.',
            },
            responsibleParty: {
              type: ['string', 'null'],
              description:
                'External party involved if applicable (e.g., "Lab Biotech SA" if email goes to client, "Maersk" if to carrier).',
            },
            emailIntent: {
              type: ['string', 'null'],
              enum: [
                'COORDINATION',
                'INFO_REQUEST',
                'INFO_PROVIDE',
                'STATUS_UPDATE',
                'INSTRUCTION',
                'CONFIRMATION',
                'ESCALATION_INTERNAL',
                'QUOTATION_REQUEST',
                'QUOTATION_PROVIDE',
                'INVOICE_FOLLOWUP',
                'DISPUTE',
                null,
              ],
              description:
                'If actionType is EMAIL_OUT, what is the intent of the email. Otherwise null.',
            },
            priority: {
              type: 'string',
              enum: ['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'CRITICAL'],
              description:
                'Urgency level. HIGH/CRITICAL only if there\'s explicit urgency or a delay/issue.',
            },
            recipientType: {
              type: ['string', 'null'],
              enum: [
                'IMPORTER',
                'EXPORTER',
                'ORIGIN_AGENT',
                'CARRIER',
                'CUSTOMS_BROKER',
                'TRUCKING',
                'WAREHOUSE',
                'INSURANCE',
                'INTERNAL_FORWARDER',
                null,
              ],
              description: 'If actionType is EMAIL_OUT, who is the recipient.',
            },
            reasoning: {
              type: 'string',
              description: 'Why this action is needed (1-2 sentences).',
            },
          },
          required: ['actionType', 'title', 'responsibleTeam', 'priority', 'reasoning'],
        },
      },
      suggestedStatusChange: {
        type: ['object', 'null'],
        description:
          'If this email implies the operation should advance to a new sub-status, suggest it here. Only suggest if confident.',
        properties: {
          newSubStatus: {
            type: 'string',
            enum: [
              'NEW_QUOTE',
              'QUOTE_REQUESTED',
              'READY_TO_QUOTE',
              'QUOTED',
              'CONFIRMED',
              'REJECTED',
              'BOOKING_PENDING',
              'BOOKING_RECEIVED',
              'BOOKING_CONFIRMED',
              'DOCS_PENDING',
              'DOCS_APPROVED',
              'ON_BOARD',
              'DOCS_READY',
              'ARRIVED',
              'MANIFEST_PENDING',
              'DESTINATION_PENDING',
              'COMPLETED',
            ],
          },
          newOwner: {
            type: 'string',
            enum: ['SALES', 'PRICING', 'CUSTOMER', 'OPS'],
          },
          confidence: {
            type: 'number',
            description: 'Confidence 0-1. Use >=0.9 only when the email explicitly states the change.',
          },
          reasoning: { type: 'string' },
        },
        required: ['newSubStatus', 'newOwner', 'confidence', 'reasoning'],
      },
      flagsToToggle: {
        type: 'object',
        description: 'Flags to set on the operation based on the email.',
        properties: {
          isActionRequired: { type: 'boolean' },
          actionRequiredFrom: {
            type: ['string', 'null'],
            enum: ['SALES', 'PRICING', 'CUSTOMER', 'OPS', null],
          },
          actionRequiredReason: { type: ['string', 'null'] },
          isDelayed: { type: 'boolean' },
          delayReason: { type: ['string', 'null'] },
          isInDispute: { type: 'boolean' },
          disputeReason: { type: ['string', 'null'] },
          disputeWith: { type: ['string', 'null'] },
          awaitingFor: {
            type: ['string', 'null'],
            enum: [
              'agent_booking_confirmation',
              'client_info',
              'client_docs',
              'client_approval_docs',
              'client_etd_confirmation',
              'carrier_documents',
              'MANI_filing',
              'demurrage_authorization',
              'customs_release',
              'delivery_confirmation',
              null,
            ],
          },
        },
      },
      reasoning: {
        type: 'string',
        description: 'Overall analysis of the email and what it triggers.',
      },
    },
    required: ['actions', 'reasoning'],
  },
}

const SYSTEM_PROMPT = `You are an expert freight forwarding operations AI assistant working for "Rumbo", a freight forwarder in Latin America.

Your role: Given an incoming email and the current state of an operation, classify what concrete actions the freight forwarder team needs to take.

KEY PRINCIPLES:

1. **Be specific, not generic.** Instead of "Follow up with carrier", say "Solicitar a Maersk confirmación de booking pendiente desde 28-abr".

2. **Identify the responsible team.** Each forwarder has 4 teams:
   - SALES: Closes quotes with clients
   - PRICING: Gets prices from carriers/agents
   - CUSTOMER: Coordinates booking and docs (most action items)
   - OPS: Tracks shipment from ETD to arrival

3. **Always think: "Who actually does this?"**
   - If responsibility is on the FORWARDER → action helps the team execute
   - If responsibility is on EXTERNAL party (client, agent, carrier) → action is to send them an email asking/instructing
   - NEVER create tasks like "Wait for client to send invoice" — instead create "Email client requesting invoice"

4. **Use the operation's current sub-status to inform decisions.**
   - In BOOKING_PENDING: actions usually involve coordinating with agent/client
   - In ON_BOARD: actions involve tracking and notifying client of changes
   - In ARRIVED: actions involve customs/delivery coordination

5. **Status changes are rare and need high confidence.**
   - Only suggest a status change when the email EXPLICITLY signals the change
   - Examples that warrant change:
     * "Booking confirmed, BKG#12345" → BOOKING_PENDING → BOOKING_RECEIVED (high confidence)
     * "Container loaded on board" → BOOKING_CONFIRMED → ON_BOARD (high confidence)
     * "Cliente acepta cotización" → QUOTED → CONFIRMED (high confidence)
   - Examples that DON'T warrant change:
     * "Working on the docs" → no change, just update awaitingFor
     * "We'll get back to you" → no change

6. **Flags are powerful.** Use them when appropriate:
   - isActionRequired + actionRequiredFrom: when client/external party requests action from a specific team
   - isDelayed: when there's an explicit delay or schedule change
   - isInDispute: when there's pricing/billing/damage dispute mentioned
   - awaitingFor: ALWAYS update this when waiting on something specific

7. **Email tone for drafts:**
   - Formal but conversational
   - Spanish always (for now)
   - "Estimado/a" greeting, "Saludos cordiales" closing
   - Sign with operator's name + role + "Rumbo"

8. **Common patterns to recognize:**
   - Booking confirmation from carrier → action: notify client + status change to BOOKING_RECEIVED
   - Client requests quote change → action: forward to PRICING + flag isActionRequired from PRICING
   - Origin agent sends BL draft → action: review + send to client + status change to DOCS_PENDING
   - Client approves docs → action: confirm + status change to DOCS_APPROVED
   - Schedule change notice → action: notify client + flag isDelayed if >2 days late
   - Customs broker reports issue → action: review + escalation`

export async function classifyActions(input: ClassifyInput): Promise<ActionClassifierOutput> {
  const { parsedEmail, rawEmail, operationContext } = input

  const contextSummary = buildContextSummary(operationContext)

  const userMessage = `INCOMING EMAIL:
${rawEmail}

PARSED EMAIL DATA:
${JSON.stringify(parsedEmail, null, 2)}

CURRENT OPERATION CONTEXT:
${contextSummary}

Based on this email and the operation context, classify what actions need to happen. Use the classify_actions tool.`

  const response = await client.messages.create({
    model: MODEL_NAMES.sonnet,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL as any],
    tool_choice: { type: 'tool', name: 'classify_actions' } as any,
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUse = response.content.find((c: any) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('ActionClassifier: No tool use response')
  }

  const result = toolUse.input as any

  return {
    actions: (result.actions || []).map((a: any) => ({
      actionType: a.actionType,
      title: a.title,
      description: a.description,
      responsibleTeam: a.responsibleTeam,
      responsibleParty: a.responsibleParty,
      emailIntent: a.emailIntent,
      priority: a.priority,
      reasoning: a.reasoning,
      // executableAction se completa después por el Orchestrator (con el draft del EmailDrafter)
      executableAction:
        a.actionType === 'EMAIL_OUT'
          ? {
              type: 'EMAIL_OUT',
              to: '',
              subject: '',
              body: '',
              intent: a.emailIntent || 'INFO_REQUEST',
              recipientType: a.recipientType || 'INTERNAL_FORWARDER',
            }
          : undefined,
    })),
    suggestedStatusChange: result.suggestedStatusChange
      ? {
          fromSubStatus: operationContext.subStatus,
          toSubStatus: result.suggestedStatusChange.newSubStatus,
          fromOwner: operationContext.currentOwner,
          toOwner: result.suggestedStatusChange.newOwner,
          confidence: result.suggestedStatusChange.confidence,
          reasoning: result.suggestedStatusChange.reasoning,
        }
      : null,
    flagsToToggle: result.flagsToToggle || {},
    reasoning: result.reasoning || '',
  }
}

function buildContextSummary(ctx: OperationContext): string {
  const lines: string[] = []
  
  lines.push(`Operation: ${ctx.operationCode} (${ctx.clientName})`)
  lines.push(`Status actual: ${SUB_STATUS_LABELS[ctx.subStatus] || ctx.subStatus} (owner: ${ctx.currentOwner})`)
  
  if (ctx.awaitingFor) lines.push(`Awaiting: ${ctx.awaitingFor}`)
  
  if (ctx.shippingLine) lines.push(`Carrier: ${ctx.shippingLine}`)
  if (ctx.originPort && ctx.destinationPort) {
    lines.push(`Route: ${ctx.originPort} (${ctx.originCountry}) → ${ctx.destinationPort} (${ctx.destinationCountry})`)
  }
  if (ctx.eta) lines.push(`ETA: ${ctx.eta.toISOString().split('T')[0]}`)
  if (ctx.bookingNumber) lines.push(`Booking#: ${ctx.bookingNumber}`)
  if (ctx.blNumber) lines.push(`BL#: ${ctx.blNumber}`)

  if (ctx.isActionRequired) lines.push(`⚠ Action required from: ${ctx.actionRequiredFrom}`)
  if (ctx.isDelayed) lines.push(`⚠ Operation is delayed`)
  if (ctx.isInDispute) lines.push(`⚠ Operation has active dispute`)

  if (ctx.recentEmails && ctx.recentEmails.length > 0) {
    lines.push(`\nRecent emails (most recent first):`)
    ctx.recentEmails.slice(0, 3).forEach((e) => {
      lines.push(`- ${e.receivedAt?.toISOString().split('T')[0]}: ${e.from} → "${e.subject}"`)
    })
  }

  if (ctx.recentTasks && ctx.recentTasks.length > 0) {
    const pending = ctx.recentTasks.filter((t) => t.status === 'PENDING')
    if (pending.length > 0) {
      lines.push(`\nPending tasks:`)
      pending.slice(0, 3).forEach((t) => {
        lines.push(`- [${t.responsibleTeam}] ${t.title}`)
      })
    }
  }

  return lines.join('\n')
}
