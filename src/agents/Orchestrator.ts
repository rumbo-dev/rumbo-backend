// ============================================================================
// RUMBO AGENTS — Orchestrator
// ============================================================================
//
// El cerebro del sistema. Recibe un email crudo, decide qué specialists invocar,
// coordina sus outputs, y persiste todo en la BD.
//
// Flow:
//   1. EmailParser extrae datos del email + busca operación
//   2. Si no hay operación, crea una nueva
//   3. ActionClassifier clasifica las actions necesarias
//   4. TimelineUpdater decide si avanzar status (+ confidence threshold)
//   5. EmailDrafter genera drafts para cada action de tipo EMAIL_OUT
//   6. Persiste todo (operation update, tasks, drafts, timeline events)
//
// USAGE:
//   import { processEmailWithOrchestrator } from './agents/Orchestrator.js'
//   const result = await processEmailWithOrchestrator({ rawEmail, userId })
// ============================================================================

import { prisma } from '../lib/prismaClient.js'
import { parseEmail } from './specialists/EmailParser.js'
import { classifyActions } from './specialists/ActionClassifier.js'
import { draftEmail } from './specialists/EmailDrafter.js'
import { updateTimeline } from './specialists/TimelineUpdater.js'
import type {
  OrchestratorInput,
  OrchestratorOutput,
  OperationContext,
  ClassifiedAction,
  EmailDrafterOutput,
} from './types.js'

const AUTO_APPLY_CONFIDENCE_THRESHOLD = 0.9

export async function processEmailWithOrchestrator(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const startTime = Date.now()
  let totalTokensInput = 0
  let totalTokensOutput = 0

  // ==========================================================================
  // STEP 1: Parse email + route to operation
  // ==========================================================================
  console.log('[Orchestrator] Step 1: Parsing email...')
  
  const parsed = await parseEmail({
    rawEmail: input.rawEmail,
    userId: input.userId,
    organizationId: input.organizationId,
    existingOperationId: input.existingOperationId,
  })

  // ==========================================================================
  // STEP 2: Get or create operation
  // ==========================================================================
  let operation
  let isNew = false

  if (parsed.matchedOperation) {
    // Defensiva: aunque EmailParser ya scopea por org, re-verificamos en
    // el find para que un bug futuro no fugue una op de otra org.
    operation = await prisma.operation.findFirst({
      where: {
        id: parsed.matchedOperation.operationId,
        organizationId: input.organizationId,
      },
    })
  }

  if (!operation) {
    isNew = true
    console.log('[Orchestrator] Step 2: Creating new operation...')

    const opCode = parsed.operationCode || `OP-AUTO-${Date.now().toString().slice(-6)}`

    operation = await prisma.operation.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        operationCode: opCode,
        containerNumber: parsed.containerNumber,
        originPort: parsed.originPort,
        originCountry: parsed.originCountry,
        destinationPort: parsed.destinationPort,
        destinationCountry: parsed.destinationCountry,
        weightKg: parsed.weightKg,
        cbm: parsed.cbm,
        incoterm: parsed.incoterm,
        mode: parsed.mode || 'FCL',
        clientName: parsed.clientName || 'Cliente sin identificar',
        clientEmail: parsed.clientEmail,
        shippingLine: parsed.shippingLine,
        vessel: parsed.vessel,
        bookingNumber: parsed.bookingNumber,
        blNumber: parsed.blNumber,
        eta: parsed.etaDate ? new Date(parsed.etaDate) : null,
        etd: parsed.etdDate ? new Date(parsed.etdDate) : null,
        // Inicial defaults — el TimelineUpdater puede ajustarlos
        status: 'BOOKING',
        subStatus: 'BOOKING_PENDING',
        currentOwner: 'CUSTOMER',
        priority: 'NORMAL',
      },
    })

    // Crear journey steps iniciales
    await createInitialJourneySteps(operation.id, input.organizationId)
  }

  // ==========================================================================
  // STEP 3: Save inbound email to BD
  // ==========================================================================
  await prisma.emailInbound.create({
    data: {
      operationId: operation.id,
      organizationId: input.organizationId,
      from: parsed.fromEmail || 'unknown@unknown.com',
      to: 'rumbo@rumbocorp.com',
      subject: extractSubjectFromRaw(input.rawEmail) || 'Email recibido',
      body: input.rawEmail,
      rawEmail: input.rawEmail,
      status: 'PROCESSED',
      processedAt: new Date(),
      matchConfidence: parsed.matchedOperation?.confidence ?? null,
      matchedBy: parsed.matchedOperation?.matchedBy ?? null,
    },
  })

  // ==========================================================================
  // STEP 4: Build operation context for downstream agents
  // ==========================================================================
  const context: OperationContext = await buildOperationContext(operation.id)

  // ==========================================================================
  // STEP 5: Classify actions
  // ==========================================================================
  console.log('[Orchestrator] Step 5: Classifying actions...')
  
  const classification = await classifyActions({
    parsedEmail: parsed,
    rawEmail: input.rawEmail,
    operationContext: context,
  })

  // ==========================================================================
  // STEP 6: Update timeline (if classification suggests)
  // ==========================================================================
  let statusUpdate = null

  if (classification.suggestedStatusChange) {
    console.log('[Orchestrator] Step 6: Updating timeline...')
    
    statusUpdate = await updateTimeline({
      operationContext: context,
      suggestedChange: classification.suggestedStatusChange,
      flagsToToggle: classification.flagsToToggle,
      rawEmail: input.rawEmail,
    })

    // Apply auto if confidence high enough
    if (statusUpdate.confidence >= AUTO_APPLY_CONFIDENCE_THRESHOLD && statusUpdate.shouldAdvance) {
      await applyStatusUpdate(operation.id, input.organizationId, statusUpdate)
    }
    // Si confidence < 0.9, queda como sugerencia (se crea task de tipo INTERNAL_DECISION)
  }

  // Apply flags from classification (no need for confidence threshold for flags)
  await applyFlags(operation.id, classification.flagsToToggle)

  // ==========================================================================
  // STEP 7: Generate email drafts for EMAIL_OUT actions
  // ==========================================================================
  const drafts: EmailDrafterOutput[] = []
  const createdDraftIds: string[] = []

  for (const action of classification.actions) {
    if (action.actionType === 'EMAIL_OUT' && action.executableAction?.type === 'EMAIL_OUT') {
      console.log(`[Orchestrator] Drafting email: ${action.title}`)
      
      const draft = await draftEmail({
        operationContext: context,
        action,
        rawEmailContext: input.rawEmail,
      })
      drafts.push(draft)

      // Persistir draft
      const dbDraft = await prisma.emailDraft.create({
        data: {
          operationId: operation.id,
          organizationId: input.organizationId,
          to: draft.to,
          cc: draft.cc.join(', ') || null,
          subject: draft.subject,
          body: draft.body,
          intent: draft.intent,
          recipientType: draft.recipientType,
          language: draft.language,
          status: 'DRAFT',
          aiGenerated: true,
          aiReasoning: draft.reasoning,
          missingInfo: draft.missingInfo.length > 0 ? draft.missingInfo : undefined,
          originalBody: draft.body,
        },
      })
      createdDraftIds.push(dbDraft.id)
    }
  }

  // ==========================================================================
  // STEP 8: Persist tasks (one per classified action)
  // ==========================================================================
  const createdTaskIds: string[] = []

  for (const action of classification.actions) {
    const task = await prisma.task.create({
      data: {
        operationId: operation.id,
        userId: input.userId,
        organizationId: input.organizationId,
        title: action.title.substring(0, 200),
        description: action.description || action.reasoning,
        actionType: action.actionType,
        responsibleTeam: action.responsibleTeam,
        responsibleParty: action.responsibleParty,
        emailIntent: action.emailIntent,
        priority: action.priority,
        urgency: action.priority,
        status: 'PENDING',
        createdByAi: true,
        aiConfidence: 0.85,
        aiReasoning: action.reasoning,
        aiAgent: 'ActionClassifier',
        executableAction: action.executableAction
          ? (action.executableAction as any)
          : null,
      },
    })
    createdTaskIds.push(task.id)
  }

  // ==========================================================================
  // STEP 9: Create timeline event for the email itself
  // ==========================================================================
  const timelineEvent = await prisma.timelineEvent.create({
    data: {
      operationId: operation.id,
      organizationId: input.organizationId,
      title: isNew ? 'Operación creada desde email' : `Email recibido de ${parsed.fromEmail}`,
      description: extractSubjectFromRaw(input.rawEmail),
      eventType: isNew ? 'OPERATION_CREATED' : 'EMAIL_RECEIVED',
      source: 'AI_INTAKE',
      sourceTeam: classification.actions[0]?.responsibleTeam || 'CUSTOMER',
    },
  })

  const createdTimelineEventIds = [timelineEvent.id]

  // ==========================================================================
  // STEP 10: Save agent decision for tracking/debugging
  // ==========================================================================
  await prisma.agentDecision.create({
    data: {
      operationId: operation.id,
      userId: input.userId,
      organizationId: input.organizationId,
      agentName: 'Orchestrator',
      decisionType: 'PROCESS_EMAIL',
      inputData: { rawEmail: input.rawEmail.substring(0, 1000) },
      outputData: {
        parsed: parsed as any,
        classification: classification as any,
        statusUpdate: statusUpdate as any,
        draftsCount: drafts.length,
        tasksCount: createdTaskIds.length,
      },
      confidence: statusUpdate?.confidence ?? null,
      wasAutoApplied: (statusUpdate?.confidence ?? 0) >= AUTO_APPLY_CONFIDENCE_THRESHOLD,
      modelUsed: 'multi-agent',
      latencyMs: Date.now() - startTime,
    },
  })

  // ==========================================================================
  // RETURN
  // ==========================================================================
  return {
    operationId: operation.id,
    isNew,
    parsed,
    classification,
    drafts,
    statusUpdate,
    createdTaskIds,
    createdDraftIds,
    createdTimelineEventIds,
    totalLatencyMs: Date.now() - startTime,
    totalTokens: { input: totalTokensInput, output: totalTokensOutput },
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function buildOperationContext(operationId: string): Promise<OperationContext> {
  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    include: {
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      timelineEvents: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
      emailsInbound: {
        orderBy: { receivedAt: 'desc' },
        take: 5,
      },
    },
  })

  if (!op) throw new Error(`Operation ${operationId} not found`)

  return {
    id: op.id,
    operationCode: op.operationCode,
    containerNumber: op.containerNumber,
    status: op.status as any,
    subStatus: op.subStatus as any,
    currentOwner: op.currentOwner as any,
    awaitingFor: op.awaitingFor as any,
    isActionRequired: op.isActionRequired,
    actionRequiredFrom: op.actionRequiredFrom as any,
    isDelayed: op.isDelayed,
    isInDispute: op.isInDispute,
    clientName: op.clientName,
    clientEmail: op.clientEmail,
    shippingLine: op.shippingLine,
    originPort: op.originPort,
    originCountry: op.originCountry,
    destinationPort: op.destinationPort,
    destinationCountry: op.destinationCountry,
    weightKg: op.weightKg,
    cbm: op.cbm,
    incoterm: op.incoterm,
    mode: op.mode,
    eta: op.eta,
    etd: op.etd,
    bookingNumber: op.bookingNumber,
    blNumber: op.blNumber,
    recentEmails: op.emailsInbound.map((e) => ({
      from: e.from,
      to: e.to,
      subject: e.subject,
      body: e.body.substring(0, 500),
      receivedAt: e.receivedAt,
    })),
    recentTasks: op.tasks.map((t) => ({
      title: t.title,
      status: t.status,
      responsibleTeam: t.responsibleTeam as any,
      createdAt: t.createdAt,
    })),
    recentTimelineEvents: op.timelineEvents.map((e) => ({
      eventType: e.eventType,
      title: e.title,
      timestamp: e.timestamp,
    })),
  }
}

async function applyStatusUpdate(operationId: string, organizationId: string, update: any) {
  const data: any = {}
  if (update.newSubStatus) {
    data.subStatus = update.newSubStatus
    // Map back to macro
    const SUB_TO_MACRO: Record<string, string> = {
      NEW_QUOTE: 'QUOTING', QUOTE_REQUESTED: 'QUOTING', READY_TO_QUOTE: 'QUOTING',
      QUOTED: 'QUOTING', CONFIRMED: 'QUOTING', REJECTED: 'CLOSED',
      BOOKING_PENDING: 'BOOKING', BOOKING_RECEIVED: 'BOOKING',
      BOOKING_CONFIRMED: 'BOOKING', DOCS_PENDING: 'BOOKING', DOCS_APPROVED: 'BOOKING',
      ON_BOARD: 'IN_TRANSIT', DOCS_READY: 'IN_TRANSIT',
      ARRIVED: 'AT_DESTINATION', MANIFEST_PENDING: 'AT_DESTINATION',
      DESTINATION_PENDING: 'AT_DESTINATION', COMPLETED: 'CLOSED',
    }
    data.status = SUB_TO_MACRO[update.newSubStatus] || 'BOOKING'
  }
  if (update.newOwner) data.currentOwner = update.newOwner
  if (update.awaitingFor !== undefined) {
    data.awaitingFor = update.awaitingFor
    if (update.awaitingFor) {
      data.awaitingSince = new Date()
      data.awaitingFollowupDue = new Date(Date.now() + 48 * 60 * 60 * 1000)
    }
  }

  await prisma.operation.update({ where: { id: operationId }, data })

  // Create timeline event for the status change
  if (update.newSubStatus) {
    await prisma.timelineEvent.create({
      data: {
        operationId,
        organizationId,
        title: update.timelineEvent?.title || 'Estado actualizado',
        description: update.narrativeNote || update.reasoning,
        eventType: 'STATUS_CHANGED',
        source: 'AI_INTAKE',
        toValue: update.newSubStatus,
      },
    })
  }
}

async function applyFlags(operationId: string, flags: any) {
  if (!flags) return

  const data: any = {}
  if (flags.isActionRequired !== undefined) {
    data.isActionRequired = flags.isActionRequired
    if (flags.isActionRequired) {
      data.actionRequiredFrom = flags.actionRequiredFrom
      data.actionRequiredReason = flags.actionRequiredReason
      data.actionRequiredSince = new Date()
    } else {
      data.actionRequiredFrom = null
      data.actionRequiredReason = null
    }
  }
  if (flags.isDelayed !== undefined) {
    data.isDelayed = flags.isDelayed
    if (flags.delayReason) data.delayReason = flags.delayReason
  }
  if (flags.isInDispute !== undefined) {
    data.isInDispute = flags.isInDispute
    if (flags.disputeReason) data.disputeReason = flags.disputeReason
    if (flags.disputeWith) data.disputeWith = flags.disputeWith
  }
  if (flags.isQuoteExpired !== undefined) data.isQuoteExpired = flags.isQuoteExpired
  if (flags.isCancelled !== undefined) {
    data.isCancelled = flags.isCancelled
    if (flags.cancelReason) data.cancelReason = flags.cancelReason
  }

  if (Object.keys(data).length > 0) {
    await prisma.operation.update({ where: { id: operationId }, data })
  }
}

async function createInitialJourneySteps(operationId: string, organizationId: string) {
  const steps = [
    { stepNumber: 1, stepName: 'Cotización', description: 'Cotización con cliente' },
    { stepNumber: 2, stepName: 'Booking', description: 'Reserva con carrier' },
    { stepNumber: 3, stepName: 'Documentación', description: 'Recolección de documentos' },
    { stepNumber: 4, stepName: 'Embarque', description: 'Carga en origen' },
    { stepNumber: 5, stepName: 'En tránsito', description: 'Transporte hacia destino' },
    { stepNumber: 6, stepName: 'Arribo', description: 'Llegada a destino' },
    { stepNumber: 7, stepName: 'Despacho', description: 'Despacho aduanero' },
    { stepNumber: 8, stepName: 'Entrega', description: 'Entrega al consignatario' },
  ]

  for (const step of steps) {
    await prisma.journeyStep.create({
      data: { operationId, organizationId, ...step, status: 'PENDING' },
    })
  }
}

function extractSubjectFromRaw(rawEmail: string): string {
  const match = rawEmail.match(/^Subject:\s*(.+?)$/im)
  return match?.[1]?.trim() || 'Email sin asunto'
}
