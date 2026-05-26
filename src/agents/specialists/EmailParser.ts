// ============================================================================
// SPECIALIST: EmailParser
// ============================================================================
//
// Modelo: Haiku (rápido y barato, tarea estructurada)
// Tarea: Extraer datos del email crudo + buscar a qué operación pertenece
//
// USA TOOL USE NATIVO de Claude para garantizar output estructurado.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prismaClient.js'
import type { EmailParserOutput, ParsedEmail } from '../types.js'
import { MODEL_NAMES } from '../types.js'

const client = new Anthropic()

interface ParseEmailInput {
  rawEmail: string
  userId: string
  // Multi-tenant (Sprint 1) — usado en los match queries para evitar
  // que un email de la org A matchee una operación de la org B.
  organizationId: string
  existingOperationId?: string
}

const EXTRACT_TOOL = {
  name: 'extract_email_data',
  description:
    'Extracts structured shipment information from a freight forwarding email. Returns null for fields not found in the email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      operationCode: {
        type: ['string', 'null'],
        description: 'Operation code if mentioned (format: OP-2024-001 or similar). Null if not found.',
      },
      quoteCode: {
        type: ['string', 'null'],
        description: 'Quote code if mentioned (format: QT- or pre-confirmation reference). Null if not found.',
      },
      containerNumber: {
        type: ['string', 'null'],
        description: 'Container number (4 letters + 7 digits, e.g., MSKU4567890). Null if not found.',
      },
      bookingNumber: {
        type: ['string', 'null'],
        description: 'Booking reference number from carrier. Null if not found.',
      },
      blNumber: {
        type: ['string', 'null'],
        description: 'Bill of Lading number. Null if not found.',
      },
      originPort: {
        type: ['string', 'null'],
        description: 'Port/city of origin. E.g., "Shanghai", "Hamburg".',
      },
      originCountry: {
        type: ['string', 'null'],
        description: 'Origin country as ISO 2-letter code. E.g., "CN", "DE".',
      },
      destinationPort: {
        type: ['string', 'null'],
        description: 'Port/city of destination.',
      },
      destinationCountry: {
        type: ['string', 'null'],
        description: 'Destination country as ISO 2-letter code.',
      },
      weightKg: {
        type: ['number', 'null'],
        description: 'Weight in kilograms (numeric, e.g., 22500). If in tons, convert to kg.',
      },
      cbm: {
        type: ['number', 'null'],
        description: 'Volume in cubic meters.',
      },
      incoterm: {
        type: ['string', 'null'],
        description: 'Incoterm code: FOB, CIF, EXW, DDP, etc.',
      },
      mode: {
        type: ['string', 'null'],
        description: 'Mode of transport: FCL, LCL, AIR, LAND.',
      },
      clientName: {
        type: ['string', 'null'],
        description: 'Client/consignee name (the importer).',
      },
      clientEmail: {
        type: ['string', 'null'],
        description: 'Client email address if mentioned.',
      },
      shippingLine: {
        type: ['string', 'null'],
        description: 'Carrier name (Maersk, MSC, Hapag-Lloyd, etc).',
      },
      vessel: {
        type: ['string', 'null'],
        description: 'Vessel name (e.g., "MAERSK LIMA").',
      },
      etaDate: {
        type: ['string', 'null'],
        description: 'ETA as ISO date string (YYYY-MM-DD). Convert relative dates to absolute.',
      },
      etdDate: {
        type: ['string', 'null'],
        description: 'ETD as ISO date string (YYYY-MM-DD).',
      },
      fromEmail: {
        type: 'string',
        description: 'Sender email address (extracted from From: header).',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of what type of email this is and what was extracted.',
      },
    },
    required: ['fromEmail', 'reasoning'],
  },
}

export async function parseEmail(input: ParseEmailInput): Promise<EmailParserOutput> {
  // ==========================================================================
  // STEP 1: Call Claude with tool use to extract data
  // ==========================================================================
  const response = await client.messages.create({
    model: MODEL_NAMES.haiku,
    max_tokens: 1500,
    tools: [EXTRACT_TOOL as any],
    tool_choice: { type: 'tool', name: 'extract_email_data' } as any,
    messages: [
      {
        role: 'user',
        content: `You are an expert freight forwarding email parser. Extract all shipment information from the email below using the extract_email_data tool.

EMAIL:
${input.rawEmail}

Important guidelines:
- For dates, convert any relative or natural language to ISO format (YYYY-MM-DD)
- For weight, always return in kilograms (convert tons if needed: 1 ton = 1000 kg)
- For country codes, use ISO 3166-1 alpha-2 (CN, AR, US, DE, NL, etc)
- For mode: FCL = full container, LCL = less than container, AIR = airfreight, LAND = trucking
- If data is genuinely missing, return null. Don't invent.
- Identify the type of email in the reasoning (e.g., "booking confirmation from Maersk", "client requesting quote", "BL draft from origin agent").`,
      },
    ],
  })

  // Extract tool use response
  const toolUse = response.content.find((c: any) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('EmailParser: No tool use response from Claude')
  }

  const extracted = toolUse.input as any

  // ==========================================================================
  // STEP 2: Match to existing operation
  // ==========================================================================
  let matchedOperation: EmailParserOutput['matchedOperation'] = null

  if (input.existingOperationId) {
    // Si vino routing pre-decidido (caso edge), usarlo
    matchedOperation = {
      operationId: input.existingOperationId,
      matchedBy: 'thread',
      confidence: 1.0,
    }
  } else {
    matchedOperation = await findMatchingOperation(extracted, input.organizationId, input.rawEmail)
  }

  // ==========================================================================
  // RETURN
  // ==========================================================================
  return {
    operationCode: extracted.operationCode || null,
    quoteCode: extracted.quoteCode || null,
    containerNumber: extracted.containerNumber || null,
    bookingNumber: extracted.bookingNumber || null,
    blNumber: extracted.blNumber || null,
    originPort: extracted.originPort || null,
    originCountry: extracted.originCountry || null,
    destinationPort: extracted.destinationPort || null,
    destinationCountry: extracted.destinationCountry || null,
    weightKg: extracted.weightKg || null,
    cbm: extracted.cbm || null,
    incoterm: extracted.incoterm || null,
    mode: extracted.mode || null,
    clientName: extracted.clientName || null,
    clientEmail: extracted.clientEmail || null,
    shippingLine: extracted.shippingLine || null,
    vessel: extracted.vessel || null,
    etaDate: extracted.etaDate || null,
    etdDate: extracted.etdDate || null,
    fromEmail: extracted.fromEmail || extractFromEmail(input.rawEmail),
    matchedOperation,
    reasoning: extracted.reasoning || '',
  }
}

// ============================================================================
// MATCHING LOGIC
// ============================================================================

async function findMatchingOperation(
  extracted: any,
  organizationId: string,
  rawEmail: string
): Promise<EmailParserOutput['matchedOperation']> {
  // Priority 1: operationCode match (scoped a la org del email)
  if (extracted.operationCode) {
    const op = await prisma.operation.findFirst({
      where: { operationCode: extracted.operationCode, organizationId },
    })
    if (op) return { operationId: op.id, matchedBy: 'operationCode', confidence: 0.98 }
  }

  // Priority 2: containerNumber match
  if (extracted.containerNumber) {
    const op = await prisma.operation.findFirst({
      where: { containerNumber: extracted.containerNumber, organizationId },
    })
    if (op) return { operationId: op.id, matchedBy: 'container', confidence: 0.95 }
  }

  // Priority 3: BL number match
  if (extracted.blNumber) {
    const op = await prisma.operation.findFirst({
      where: { blNumber: extracted.blNumber, organizationId },
    })
    if (op) return { operationId: op.id, matchedBy: 'bl', confidence: 0.92 }
  }

  // Priority 4: booking number match
  if (extracted.bookingNumber) {
    const op = await prisma.operation.findFirst({
      where: { bookingNumber: extracted.bookingNumber, organizationId },
    })
    if (op) return { operationId: op.id, matchedBy: 'bl', confidence: 0.9 }
  }

  // Priority 5: thread (In-Reply-To header)
  // TODO: implement thread matching when we save email message-ids

  // Priority 6: sender match (if email from same sender about recent operation)
  if (extracted.fromEmail) {
    const recentEmail = await prisma.emailInbound.findFirst({
      where: {
        from: extracted.fromEmail,
        operationId: { not: null },
        organizationId,
        receivedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
        },
      },
      orderBy: { receivedAt: 'desc' },
    })
    if (recentEmail?.operationId) {
      return {
        operationId: recentEmail.operationId,
        matchedBy: 'sender_match',
        confidence: 0.65,
      }
    }
  }

  return null
}

function extractFromEmail(rawEmail: string): string {
  const match = rawEmail.match(/^From:\s*(?:.*<)?([^>\s]+@[^>\s]+)/im)
  return match?.[1]?.trim() || 'unknown@unknown.com'
}
