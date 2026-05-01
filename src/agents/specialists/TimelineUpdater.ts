// ============================================================================
// SPECIALIST: TimelineUpdater
// ============================================================================
//
// Modelo: Haiku (decisión rápida y específica)
// Tarea: Dado un cambio de status sugerido por ActionClassifier, decidir
//        si aplicarlo automáticamente o requerir aprobación humana.
//
// Genera además la "narrative note" para el journey step (descripción
// ejecutiva de lo que pasó, en español, conciso).
//
// CONFIDENCE THRESHOLD: 0.9 — auto-apply. Below: requires human approval.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  TimelineUpdaterOutput,
  StatusChangeSuggestion,
  FlagsToggle,
  OperationContext,
} from '../types.js'
import { MODEL_NAMES, SUB_STATUS_LABELS } from '../types.js'

const client = new Anthropic()

interface UpdateTimelineInput {
  operationContext: OperationContext
  suggestedChange: StatusChangeSuggestion
  flagsToToggle: FlagsToggle
  rawEmail: string
}

const VALIDATE_TOOL = {
  name: 'validate_status_change',
  description:
    'Validates whether a status change should be auto-applied or requires human approval, and generates a narrative note.',
  input_schema: {
    type: 'object' as const,
    properties: {
      shouldAdvance: {
        type: 'boolean',
        description: 'Whether the status change is justified by the email evidence.',
      },
      confidence: {
        type: 'number',
        description:
          'Confidence 0-1. Use ≥0.9 only when the email EXPLICITLY signals the change with no ambiguity. Use 0.5-0.9 when reasonable inference. Use <0.5 when uncertain.',
      },
      reasoning: {
        type: 'string',
        description: 'Brief reasoning for the decision (1-2 sentences).',
      },
      narrativeNote: {
        type: 'string',
        description:
          'A concise, executive narrative of WHAT HAPPENED (NOT what to do). 1-2 sentences in Spanish. Should be informative and readable. Examples: "Maersk confirmó la reserva en el MAERSK LIMA con salida el 5 de mayo." / "El cliente aprobó el draft del BL sin observaciones." / "Origen confirmó la consolidación del contenedor con descripción corregida."',
      },
      timelineEventTitle: {
        type: 'string',
        description: 'Short title for the timeline event in Spanish.',
      },
      timelineEventDescription: {
        type: 'string',
        description: 'Description of the timeline event with key data.',
      },
      cautions: {
        type: 'array',
        description: 'Any cautions or red flags to surface to the operator.',
        items: { type: 'string' },
      },
    },
    required: ['shouldAdvance', 'confidence', 'reasoning', 'narrativeNote', 'timelineEventTitle', 'timelineEventDescription'],
  },
}

const SYSTEM_PROMPT = `You are a status validation specialist for "Rumbo", a freight forwarder.

Your job: Given a suggested status change for an operation (proposed by another agent), decide whether to auto-apply it (high confidence) or flag it for human approval (low/medium confidence).

# CONFIDENCE GUIDELINES

## Use 0.95+ (auto-apply) when:
- The email EXPLICITLY confirms the action with specific data
- Examples:
  * "Booking confirmed, BKG#12345" + email is from carrier → BOOKING_PENDING → BOOKING_RECEIVED
  * "Container loaded on board MAERSK LIMA, voyage 234E" → BOOKING_CONFIRMED → ON_BOARD
  * "Cliente acepta cotización, instruir booking" → QUOTED → CONFIRMED
  * Crosscheck or terminal confirms arrival with date → ON_BOARD → ARRIVED
  * "MANI presentado correctamente" → MANIFEST_PENDING → ARRIVED

## Use 0.7-0.9 (suggest, requires approval) when:
- Email implies but doesn't explicitly state
- Examples:
  * "Working on the docs" — implies but doesn't confirm DOCS_PENDING → DOCS_APPROVED
  * "Próximo a salir" — implies but doesn't confirm departure
  * "Todo ok" without specific data

## Use 0.4-0.7 (flag for review) when:
- Email is ambiguous
- Multiple interpretations possible
- Missing key confirming data

## Use <0.4 (reject) when:
- Email contradicts the suggested change
- No evidence supports the change

# NARRATIVE NOTE GUIDELINES

The narrative note appears in the operation timeline and should be:
- 1-2 sentences MAX
- Spanish, executive style
- Past tense (describes what HAPPENED)
- Specific (uses actual names, dates, numbers from the email)
- NOT operational instructions ("hay que hacer X")
- NOT generic ("Status cambió")

## Examples of GOOD narrative notes:
- "Maersk confirmó la reserva con booking #BKG-12345 en el MAERSK LIMA, ETD 5 de mayo."
- "El cliente aprobó el draft del BL sin observaciones tras revisar la corrección de la NCM."
- "Origen confirmó la consolidación del contenedor MSMU7640412 con descripción de mercadería actualizada."
- "EMC informó nueva cotización para el on-carriage Buenos Aires con drop off bonificado."
- "El cliente solicitó modificación del BL: cambio de descripción de 'VACUUM' a 'BATTERY CHARGER'."

## Examples of BAD narrative notes (avoid):
- ❌ "Status changed to BOOKING_RECEIVED" — generic, no info
- ❌ "Email recibido del carrier" — too vague
- ❌ "Hay que hacer follow up con el agente" — that's an action, not what happened
- ❌ "El forwarder debe coordinar..." — describing what to do, not what happened

# RED FLAGS to call out in cautions:
- Discrepancies between email content and operation context
- Suspicious timing (e.g., booking confirmed before request was made)
- Carrier/agent acting unilaterally (changes without consultation)
- Missing critical data (no vessel name, no booking number)`

export async function updateTimeline(input: UpdateTimelineInput): Promise<TimelineUpdaterOutput> {
  const { operationContext: ctx, suggestedChange, flagsToToggle, rawEmail } = input

  const contextSummary = `
Operation: ${ctx.operationCode} (${ctx.clientName})
Current sub-status: ${SUB_STATUS_LABELS[ctx.subStatus] || ctx.subStatus} (owner: ${ctx.currentOwner})
${ctx.awaitingFor ? `Awaiting: ${ctx.awaitingFor}` : ''}
${ctx.shippingLine ? `Carrier: ${ctx.shippingLine}` : ''}
${ctx.vessel ? `Vessel: ${ctx.vessel}` : ''}
${ctx.bookingNumber ? `Booking#: ${ctx.bookingNumber}` : ''}
`.trim()

  const userMessage = `CURRENT OPERATION:
${contextSummary}

PROPOSED STATUS CHANGE:
- From: ${SUB_STATUS_LABELS[suggestedChange.fromSubStatus]} (${suggestedChange.fromOwner})
- To: ${SUB_STATUS_LABELS[suggestedChange.toSubStatus]} (${suggestedChange.toOwner})
- Reasoning: ${suggestedChange.reasoning}
- Initial confidence: ${suggestedChange.confidence}

EMAIL EVIDENCE:
${rawEmail.substring(0, 3000)}

Validate this status change. Use validate_status_change tool.`

  const response = await client.messages.create({
    model: MODEL_NAMES.haiku,
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    tools: [VALIDATE_TOOL as any],
    tool_choice: { type: 'tool', name: 'validate_status_change' } as any,
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUse = response.content.find((c: any) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('TimelineUpdater: No tool use response')
  }

  const result = toolUse.input as any

  return {
    shouldAdvance: result.shouldAdvance && result.confidence >= 0.5,
    newSubStatus: result.shouldAdvance ? suggestedChange.toSubStatus : null,
    newOwner: result.shouldAdvance ? suggestedChange.toOwner : null,
    flagsToToggle,
    awaitingFor: flagsToToggle.awaitingFor || null,
    confidence: result.confidence,
    reasoning: result.reasoning,
    narrativeNote: result.narrativeNote,
    timelineEvent: {
      eventType: 'STATUS_CHANGED',
      title: result.timelineEventTitle,
      description: result.timelineEventDescription,
    },
  }
}
