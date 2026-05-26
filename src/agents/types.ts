// ============================================================================
// RUMBO AGENTS — Shared Types
// ============================================================================
//
// Estos tipos son compartidos por todos los agentes (orchestrator + specialists).
// Reflejan el modelo de datos de Prisma + las decisiones de la arquitectura.
//
// IMPORT: import { ... } from '../types.js'
// ============================================================================

// ============================================================================
// STATUS / OWNERSHIP
// ============================================================================

export type MacroStatus = 
  | 'QUOTING' 
  | 'BOOKING' 
  | 'IN_TRANSIT' 
  | 'AT_DESTINATION' 
  | 'CLOSED'

export type SubStatus =
  // QUOTING
  | 'NEW_QUOTE'
  | 'QUOTE_REQUESTED'
  | 'READY_TO_QUOTE'
  | 'QUOTED'
  | 'CONFIRMED'
  | 'REJECTED'
  // BOOKING
  | 'BOOKING_PENDING'
  | 'BOOKING_RECEIVED'
  | 'BOOKING_CONFIRMED'
  | 'DOCS_PENDING'
  | 'DOCS_APPROVED'
  // IN_TRANSIT
  | 'ON_BOARD'
  | 'DOCS_READY'
  // AT_DESTINATION
  | 'ARRIVED'
  | 'MANIFEST_PENDING'
  | 'DESTINATION_PENDING'
  // CLOSED
  | 'COMPLETED'

export type Team = 'SALES' | 'PRICING' | 'CUSTOMER' | 'OPS'

// Map sub-status → macro-status (for dashboards/reports)
export const SUB_TO_MACRO: Record<SubStatus, MacroStatus> = {
  NEW_QUOTE: 'QUOTING',
  QUOTE_REQUESTED: 'QUOTING',
  READY_TO_QUOTE: 'QUOTING',
  QUOTED: 'QUOTING',
  CONFIRMED: 'QUOTING',
  REJECTED: 'CLOSED',
  BOOKING_PENDING: 'BOOKING',
  BOOKING_RECEIVED: 'BOOKING',
  BOOKING_CONFIRMED: 'BOOKING',
  DOCS_PENDING: 'BOOKING',
  DOCS_APPROVED: 'BOOKING',
  ON_BOARD: 'IN_TRANSIT',
  DOCS_READY: 'IN_TRANSIT',
  ARRIVED: 'AT_DESTINATION',
  MANIFEST_PENDING: 'AT_DESTINATION',
  DESTINATION_PENDING: 'AT_DESTINATION',
  COMPLETED: 'CLOSED',
}

// Display labels in Spanish for UI
export const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  NEW_QUOTE: 'Nueva cotización',
  QUOTE_REQUESTED: 'Cotizando',
  READY_TO_QUOTE: 'Listo para cotizar',
  QUOTED: 'Cotización enviada',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
  BOOKING_PENDING: 'Booking pendiente',
  BOOKING_RECEIVED: 'Booking recibido',
  BOOKING_CONFIRMED: 'Booking confirmado',
  DOCS_PENDING: 'Documentos pendientes',
  DOCS_APPROVED: 'Documentos aprobados',
  ON_BOARD: 'En tránsito',
  DOCS_READY: 'Documentos listos',
  ARRIVED: 'Arribada',
  MANIFEST_PENDING: 'MANI pendiente',
  DESTINATION_PENDING: 'Acción en destino',
  COMPLETED: 'Completada',
}

export const TEAM_LABELS: Record<Team, string> = {
  SALES: 'Sales',
  PRICING: 'Pricing',
  CUSTOMER: 'Customer',
  OPS: 'Operaciones',
}

export const TEAM_INITIALS: Record<Team, string> = {
  SALES: 'S',
  PRICING: 'P',
  CUSTOMER: 'CS',
  OPS: 'OPS',
}

// ============================================================================
// AWAITING FOR
// ============================================================================

export type AwaitingFor =
  | 'agent_booking_confirmation'
  | 'client_info'
  | 'client_docs'
  | 'client_approval_docs'
  | 'client_etd_confirmation'
  | 'carrier_documents'
  | 'MANI_filing'
  | 'demurrage_authorization'
  | 'customs_release'
  | 'delivery_confirmation'

export const AWAITING_LABELS: Record<AwaitingFor, string> = {
  agent_booking_confirmation: 'Esperando confirmación del agente',
  client_info: 'Esperando información del cliente',
  client_docs: 'Esperando documentos del cliente',
  client_approval_docs: 'Esperando aprobación de drafts',
  client_etd_confirmation: 'Esperando confirmación de ETD',
  carrier_documents: 'Esperando documentos del carrier',
  MANI_filing: 'Esperando presentación de MANI',
  demurrage_authorization: 'Esperando autorización demurrage',
  customs_release: 'Esperando libramiento aduanero',
  delivery_confirmation: 'Esperando confirmación de delivery',
}

// ============================================================================
// ACTIONS
// ============================================================================

export type ActionType =
  | 'EMAIL_OUT'
  | 'DOCUMENT_REQUEST'
  | 'DOCUMENT_REVIEW'
  | 'DOCUMENT_GENERATE'
  | 'STATUS_CHECK'
  | 'PAYMENT_ACTION'
  | 'INTERNAL_DECISION'
  | 'DATA_ENTRY'
  | 'ESCALATION'

export type EmailIntent =
  | 'COORDINATION'
  | 'INFO_REQUEST'
  | 'INFO_PROVIDE'
  | 'STATUS_UPDATE'
  | 'INSTRUCTION'
  | 'CONFIRMATION'
  | 'ESCALATION_INTERNAL'
  | 'QUOTATION_REQUEST'
  | 'QUOTATION_PROVIDE'
  | 'INVOICE_FOLLOWUP'
  | 'DISPUTE'

export type RecipientType =
  | 'IMPORTER'
  | 'EXPORTER'
  | 'ORIGIN_AGENT'
  | 'CARRIER'
  | 'CUSTOMS_BROKER'
  | 'TRUCKING'
  | 'WAREHOUSE'
  | 'INSURANCE'
  | 'INTERNAL_FORWARDER'

export type Priority = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// ============================================================================
// EXECUTABLE ACTIONS (varies by actionType)
// ============================================================================

export interface EmailOutAction {
  type: 'EMAIL_OUT'
  to: string  // empty if missing
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  intent: EmailIntent
  recipientType: RecipientType
  attachmentsNeeded?: string[]
  missingInfo?: { field: string; reason: string }[]
}

export interface DocumentRequestAction {
  type: 'DOCUMENT_REQUEST'
  documentType: string  // 'PACKING_LIST' | 'INVOICE' | 'BL' | 'MSDS' | etc
  fromParty: string
  emailDraft?: EmailOutAction  // suele venir con el draft listo
}

export interface DocumentReviewAction {
  type: 'DOCUMENT_REVIEW'
  documentRef: string
  documentType: string
  validations: string[]  // ['weight_match', 'container_match', 'incoterm_consistency']
}

export interface DocumentGenerateAction {
  type: 'DOCUMENT_GENERATE'
  documentType: string
  template: string
  dataPoints: { field: string; value: string }[]
}

export interface StatusCheckAction {
  type: 'STATUS_CHECK'
  system: 'CARRIER_PORTAL' | 'CUSTOMS_SYSTEM' | 'TRACKING_API'
  identifier: string  // booking number, container number, etc
  fieldsToVerify: string[]
}

export type ExecutableAction =
  | EmailOutAction
  | DocumentRequestAction
  | DocumentReviewAction
  | DocumentGenerateAction
  | StatusCheckAction
  | { type: 'INTERNAL_DECISION'; description: string }
  | { type: 'PAYMENT_ACTION'; amount: number; recipient: string; description: string }
  | { type: 'DATA_ENTRY'; system: string; fields: Record<string, string> }
  | { type: 'ESCALATION'; reason: string; escalateTo: string }

// ============================================================================
// INPUT TYPES (for agent calls)
// ============================================================================

export interface ParsedEmail {
  from: string
  to: string
  cc?: string
  subject: string
  body: string
  rawEmail?: string
  receivedAt?: Date
}

export interface OperationContext {
  id: string
  operationCode: string
  containerNumber?: string | null
  status: MacroStatus
  subStatus: SubStatus
  currentOwner: Team
  awaitingFor?: AwaitingFor | null
  isActionRequired: boolean
  actionRequiredFrom?: Team | null
  isDelayed: boolean
  isInDispute: boolean
  clientName: string
  clientEmail?: string | null
  shippingLine?: string | null
  vessel?: string | null
  originPort?: string | null
  originCountry?: string | null
  destinationPort?: string | null
  destinationCountry?: string | null
  weightKg?: number | null
  cbm?: number | null
  incoterm?: string | null
  mode: string
  eta?: Date | null
  etd?: Date | null
  bookingNumber?: string | null
  blNumber?: string | null
  // ... otros campos relevantes
  recentEmails?: ParsedEmail[]  // contexto de emails previos en el thread
  recentTasks?: TaskSummary[]
  recentTimelineEvents?: TimelineEventSummary[]
}

export interface TaskSummary {
  title: string
  status: string
  responsibleTeam: Team
  createdAt: Date
}

export interface TimelineEventSummary {
  eventType: string
  title: string
  timestamp: Date
}

// ============================================================================
// OUTPUT TYPES (what agents return)
// ============================================================================

export interface EmailParserOutput {
  // Datos extraídos del email
  operationCode: string | null
  quoteCode: string | null
  containerNumber: string | null
  bookingNumber: string | null
  blNumber: string | null
  
  originPort: string | null
  originCountry: string | null  // ISO 2 letras
  destinationPort: string | null
  destinationCountry: string | null
  
  weightKg: number | null
  cbm: number | null
  incoterm: string | null
  mode: string | null  // FCL | LCL | AIR | LAND
  
  clientName: string | null
  clientEmail: string | null
  shippingLine: string | null
  vessel: string | null
  
  etaDate: string | null  // ISO date string
  etdDate: string | null
  
  fromEmail: string
  
  // Routing — a qué operación pertenece este email
  matchedOperation: {
    operationId: string
    matchedBy: 'operationCode' | 'container' | 'bl' | 'thread' | 'sender_match' | 'ai_inference'
    confidence: number
  } | null
  
  reasoning: string
}

export interface ActionClassifierOutput {
  actions: ClassifiedAction[]
  suggestedStatusChange: StatusChangeSuggestion | null
  flagsToToggle: FlagsToggle
  reasoning: string
}

export interface ClassifiedAction {
  actionType: ActionType
  title: string
  description?: string
  responsibleTeam: Team
  responsibleParty?: string
  emailIntent?: EmailIntent
  priority: Priority
  executableAction?: ExecutableAction
  reasoning: string
}

export interface StatusChangeSuggestion {
  fromSubStatus: SubStatus
  toSubStatus: SubStatus
  fromOwner: Team
  toOwner: Team
  confidence: number  // 0-1
  reasoning: string
}

export interface FlagsToggle {
  isActionRequired?: boolean
  actionRequiredFrom?: Team
  actionRequiredReason?: string
  isDelayed?: boolean
  delayReason?: string
  isInDispute?: boolean
  disputeReason?: string
  disputeWith?: string
  isQuoteExpired?: boolean
  isCancelled?: boolean
  cancelReason?: string
  awaitingFor?: AwaitingFor | null
}

export interface EmailDrafterOutput {
  to: string
  cc: string[]
  subject: string
  body: string
  intent: EmailIntent
  recipientType: RecipientType
  language: 'es' | 'en' | 'pt'
  missingInfo: { field: string; reason: string }[]
  reasoning: string
}

export interface TimelineUpdaterOutput {
  shouldAdvance: boolean
  newSubStatus: SubStatus | null
  newOwner: Team | null
  flagsToToggle: FlagsToggle
  awaitingFor: AwaitingFor | null
  confidence: number
  reasoning: string
  narrativeNote: string  // for journey step description
  timelineEvent: {
    eventType: string
    title: string
    description: string
  }
}

// ============================================================================
// ORCHESTRATOR TYPES
// ============================================================================

export interface OrchestratorInput {
  rawEmail: string
  userId: string
  // Multi-tenant (Sprint 1) — organización a la que pertenece este email.
  // El Orchestrator usa este id en TODOS los creates (Operation, EmailInbound,
  // Task, EmailDraft, AgentDecision, TimelineEvent) y en los matches de
  // EmailParser para evitar fugas cross-tenant.
  organizationId: string
  // Optional: existing operation context if already routed
  existingOperationId?: string
}

export interface OrchestratorOutput {
  operationId: string
  isNew: boolean
  
  // Aggregated results from all specialists
  parsed: EmailParserOutput
  classification: ActionClassifierOutput
  drafts: EmailDrafterOutput[]  // 0-N drafts, one per EMAIL_OUT action
  statusUpdate: TimelineUpdaterOutput | null
  
  // Database IDs of created entities
  createdTaskIds: string[]
  createdDraftIds: string[]
  createdTimelineEventIds: string[]
  
  // Metadata
  totalLatencyMs: number
  totalTokens: { input: number; output: number }
}

// ============================================================================
// AGENT CONFIG
// ============================================================================

export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export const MODEL_NAMES: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
}

export interface AgentConfig {
  modelTier: ModelTier
  maxTokens: number
  temperature?: number
}

export const DEFAULT_CONFIGS: Record<string, AgentConfig> = {
  EmailParser: { modelTier: 'haiku', maxTokens: 1500 },
  ActionClassifier: { modelTier: 'sonnet', maxTokens: 2500 },
  EmailDrafter: { modelTier: 'sonnet', maxTokens: 2000 },
  TimelineUpdater: { modelTier: 'haiku', maxTokens: 1000 },
  DocumentReviewer: { modelTier: 'opus', maxTokens: 3000 },
  DocumentGenerator: { modelTier: 'opus', maxTokens: 3000 },
}
