// ============================================================================
// SPECIALIST: EmailDrafter
// ============================================================================
//
// Modelo: Sonnet (calidad de redacción importante)
// Tarea: Generar drafts de emails en el tono y estilo del forwarder
//
// CALIBRACIÓN: Este prompt está calibrado con emails REALES de CICSA
// (cadenas pasadas por el usuario). El tono debe ser conversacional pero
// formal, en español argentino, con modismos del rubro.
//
// USA TOOL USE NATIVO para garantizar output estructurado.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  EmailDrafterOutput,
  ClassifiedAction,
  OperationContext,
} from '../types.js'
import { MODEL_NAMES, SUB_STATUS_LABELS } from '../types.js'

const client = new Anthropic()

interface DraftEmailInput {
  operationContext: OperationContext
  action: ClassifiedAction
  rawEmailContext?: string  // email entrante que disparó la action (si aplica)
}

const DRAFT_TOOL = {
  name: 'draft_email',
  description: 'Drafts a freight forwarding email in the style of a Latin American freight forwarder.',
  input_schema: {
    type: 'object' as const,
    properties: {
      to: {
        type: 'string',
        description:
          'Primary recipient email address. If unknown, return empty string and add to missingInfo.',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'CC recipients (typically internal team members like managers, pricing).',
      },
      subject: {
        type: 'string',
        description:
          'Email subject following CICSA format: "OP {number} // {type} // {client} // {summary}" or "RE: ..." for replies.',
      },
      body: {
        type: 'string',
        description:
          'Email body. Use signal words like "Buenos días" / "Buenas tardes" depending on context. Spanish only. Conversational but professional. Sign with the operator name and team. Use line breaks (\\n) appropriately.',
      },
      intent: {
        type: 'string',
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
        ],
      },
      recipientType: {
        type: 'string',
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
        ],
      },
      missingInfo: {
        type: 'array',
        description:
          'Fields that the human needs to complete before sending. E.g., if recipient email is unknown.',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Which field is missing (e.g., "to", "ETA")' },
            reason: { type: 'string', description: 'Why it\'s missing' },
          },
          required: ['field', 'reason'],
        },
      },
      reasoning: {
        type: 'string',
        description: 'Why this email is being drafted and what it accomplishes.',
      },
    },
    required: ['to', 'subject', 'body', 'intent', 'recipientType', 'reasoning'],
  },
}

const SYSTEM_PROMPT = `You are an email drafting specialist for "Rumbo", a freight forwarder in Argentina.

You write emails in the style of REAL Argentinian freight forwarders. Your style is calibrated against actual CICSA emails (a top freight forwarder in Argentina).

# STYLE GUIDELINES (CRITICAL — these are NOT generic SaaS templates)

## Tone
- Professional but conversational. NOT stiff corporate English-translated-to-Spanish.
- Spanish (Argentina). Use "vos" for internal communication when context fits.
- Friendly but to the point. Argentinians appreciate brevity in operations.

## Greetings (vary, don't be robotic)
- "Hola {Name}, buen día" — most common, daytime
- "Hola {Name}, buenas tardes" — afternoon
- "Hola {Name}, ¿cómo estás?" — for repeat contacts where rapport exists
- "Buenos días" / "Buenas tardes" — when starting fresh thread
- "Estimado/a {Name}" — only first contact or very formal contexts

## Closings (vary)
- "Saludos cordiales" — most common, slightly formal
- "Slds cordiales / Best Regards" — common with international agents
- "Saludos" — informal, repeat contacts
- "Abrazo" — internal team only, never external
- "Muchas gracias / Saludos" — when asking for something

## Subject line format (CRITICAL)
Always include OP code and key context. Real examples from CICSA:
- "DRAFT - 3335/6 // OP 24042 // CEG // 2*40HQ NINGBO"
- "RE: RESERVA DE BODEGA + DRAFT - 3335/6 // OP 24042 // CEG // 2*40HQ NINGBO"
- "OP 23659 // Poliresinas San Luis // 3x20'ST // PO# 4100000431 // Maleic Anhydride // Henan Foremost"
- "URGENTE MAIL EMC-CICSA // POLIRESINAS IMO Class 8 UN 2215 // OP 23657 DALIAN"

Use double-slash (//) as separator. Keep informative.

## Body structure
- Greeting on its own line
- Blank line
- 1-3 short paragraphs (NOT giant blocks of text)
- Use specific data (BL number, container number, dates) — never generic
- Blank line
- "Saludos cordiales" or similar
- Blank line
- Signature placeholder: "{userFullName}\\n{userTeam}\\nRumbo"

## Common phrases to use (these sound NATIVE)
- "Te dejo adjunto" / "Te paso adjunto" — when attaching
- "Aguardo confirmación" / "Quedo atento" — waiting response
- "Cualquier cosa avisame" — informal close
- "Por favor confirmar" — formal request
- "Mantenernos al tanto ante cualquier actualización" — update request
- "Notado y aguardo" — acknowledging
- "En breves" — soon (not "shortly")
- "Slds" abbreviated for casual replies

## Phrases to AVOID (sound like AI/translated)
- ❌ "Espero que se encuentre bien"
- ❌ "Quedamos a su entera disposición"
- ❌ "Le agradezco de antemano"
- ❌ "Por la presente le informo"
- ❌ "Adjunto a la presente"
- ❌ Long verbose corporate Spanish

## Rubro-specific language (use freely)
- BL = Bill of Lading
- HBL / MBL = House BL / Master BL
- OBL = Original BL
- DRAFT = borrador (often kept in English)
- ETD / ETA / POL / POD
- OP {number} = operation code reference
- "Reserva de bodega" = booking confirmation
- "Tomar booking" = book the cargo
- "Drop off" / "Drop-off" — kept in English
- "On-carriage" — kept in English
- "NCM" = código arancelario
- "Cnee" or "Consignee" interchangeable
- "Shipper" interchangeable with "embarcador"

# RECIPIENT-SPECIFIC ADAPTATIONS

## To IMPORTER (cliente)
- Slightly more formal
- Always Spanish
- Subject in Spanish
- Reference their PO# if known
- "Por favor revisar y confirmar si todo está en orden" pattern

## To CARRIER (naviera/línea)
- Mix of Spanish and English (most carrier reps in LATAM speak both)
- Often shorter, direct
- Reference booking number, vessel, ETA

## To ORIGIN_AGENT (international)
- ENGLISH (this is the exception to "always Spanish")
- Direct, transactional
- "Pls find attached" / "Noted thanks" / "TKS" / "Awaiting your response" common

## To CUSTOMS_BROKER (despachante)
- Spanish, professional but informal
- Reference NCM, DUCA, CUIT
- Cross-check with importer often

## To INTERNAL_FORWARDER (mismo equipo)
- Very informal, "Hola {firstname}"
- Often abbreviations
- "Abrazo" closing common
- Spanish always

# MANDATORY RULES

1. ALWAYS reference the operation by code in subject and (often) body
2. NEVER invent dates, container numbers, or BL numbers — use what's in context or leave [PENDIENTE]
3. ALWAYS sign with placeholder for operator name (will be filled by system)
4. If destination email unknown → set to: "" and add to missingInfo
5. If a key data point missing in context → mention "[PENDIENTE: {field}]" inline AND add to missingInfo
6. NEVER use bullet points unless replicating a list from the source email

# OUTPUT FORMAT
Use the draft_email tool. Subject must be informative. Body must read like a real human wrote it.`

export async function draftEmail(input: DraftEmailInput): Promise<EmailDrafterOutput> {
  const { operationContext: ctx, action, rawEmailContext } = input

  const contextSummary = buildContextSummary(ctx)
  const recipientHint = buildRecipientHint(action)

  const userMessage = `OPERATION CONTEXT:
${contextSummary}

ACTION TO DRAFT:
- Type: ${action.actionType}
- Title: ${action.title}
- Intent: ${action.emailIntent || 'INFO_REQUEST'}
- Reasoning: ${action.reasoning}
- Responsible party: ${action.responsibleParty || 'TBD'}

RECIPIENT INFO:
${recipientHint}

${
  rawEmailContext
    ? `RECENT EMAIL THAT TRIGGERED THIS ACTION:
${rawEmailContext.substring(0, 2000)}

Note: If this is a REPLY, mirror the conversational tone of the previous emails. Use "RE:" in subject.`
    : ''
}

Generate the email draft using the draft_email tool. Make it sound NATIVE, like a CICSA operations specialist wrote it.`

  const response = await client.messages.create({
    model: MODEL_NAMES.sonnet,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [DRAFT_TOOL as any],
    tool_choice: { type: 'tool', name: 'draft_email' } as any,
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUse = response.content.find((c: any) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('EmailDrafter: No tool use response')
  }

  const result = toolUse.input as any

  return {
    to: result.to || '',
    cc: result.cc || [],
    subject: result.subject,
    body: result.body,
    intent: result.intent,
    recipientType: result.recipientType,
    language: 'es',
    missingInfo: result.missingInfo || [],
    reasoning: result.reasoning || '',
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function buildContextSummary(ctx: OperationContext): string {
  const lines: string[] = []
  lines.push(`Operation: ${ctx.operationCode}`)
  lines.push(`Client: ${ctx.clientName}`)
  if (ctx.shippingLine) lines.push(`Carrier: ${ctx.shippingLine}`)
  if (ctx.vessel) lines.push(`Vessel: ${ctx.vessel}`)
  if (ctx.bookingNumber) lines.push(`Booking#: ${ctx.bookingNumber}`)
  if (ctx.blNumber) lines.push(`BL#: ${ctx.blNumber}`)
  if (ctx.containerNumber) lines.push(`Container: ${ctx.containerNumber}`)
  if (ctx.originPort) lines.push(`Origin: ${ctx.originPort}`)
  if (ctx.destinationPort) lines.push(`Destination: ${ctx.destinationPort}`)
  if (ctx.weightKg) lines.push(`Weight: ${ctx.weightKg} kg`)
  if (ctx.cbm) lines.push(`Volume: ${ctx.cbm} CBM`)
  if (ctx.incoterm) lines.push(`Incoterm: ${ctx.incoterm}`)
  lines.push(`Mode: ${ctx.mode}`)
  if (ctx.eta) lines.push(`ETA: ${ctx.eta.toISOString().split('T')[0]}`)
  if (ctx.etd) lines.push(`ETD: ${ctx.etd.toISOString().split('T')[0]}`)
  lines.push(`Status: ${SUB_STATUS_LABELS[ctx.subStatus] || ctx.subStatus}`)
  lines.push(`Owner: ${ctx.currentOwner}`)
  return lines.join('\n')
}

function buildRecipientHint(action: ClassifiedAction): string {
  const lines: string[] = []
  if (action.responsibleParty) {
    lines.push(`Recipient: ${action.responsibleParty}`)
  }
  if (action.executableAction?.type === 'EMAIL_OUT') {
    if (action.executableAction.to) {
      lines.push(`Email: ${action.executableAction.to}`)
    } else {
      lines.push(`Email: NOT FOUND in context — leave "to" empty and add to missingInfo`)
    }
    if (action.executableAction.recipientType) {
      lines.push(`Type: ${action.executableAction.recipientType}`)
    }
  }
  return lines.join('\n') || 'No specific recipient info — infer from context'
}
