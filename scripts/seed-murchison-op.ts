/**
 * Seed de la operación REAL de Murchison Uruguay — Ref 024/026.
 *
 * Cliente: Chic Parisien (Grupo Parisien) — consignee real Badonel SA.
 * Ruta: Ningbo (China) → Buenos Aires (Argentina). FOB. 1×40'HQ.
 * Carga: hair clips + lámparas con baterías de litio (IMO Class 9).
 *
 * Crea:
 *  - 1 Quote (Q-024-026, CLOSED_WON)
 *  - 1 Operation (OP-024-026, status DELIVERED)
 *  - 22 TimelineEvent records
 *  - 7 Attachment records (vinculados a archivos en public/attachments/OP-024-026/)
 *  - 10 AgentDecision records (ad-mur-001..ad-mur-010)
 *  - Stakeholders JSON inline en la Operation (12 actores reales)
 *
 * IDEMPOTENTE:
 *  - Quote/Operation: upsert por code único
 *  - AgentDecisions: upsert por id estable
 *  - TimelineEvents y Attachments: deleteMany por operationId + recreate
 *    (no tienen un código natural único; el delete-recreate es seguro
 *    porque el script ES la fuente de verdad)
 *
 * USO:
 *   DATABASE_URL="..." npx tsx scripts/seed-murchison-op.ts
 *
 * NO BORRA NADA DE OTRAS OPS. Solo toca lo de OP-024-026.
 */
import { PrismaClient } from '@prisma/client'
import { statSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()
const DEMO_EMAIL = 'demo@example.com'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está seteada.')
  process.exit(1)
}

const QUOTE_CODE = 'Q-024-026'
const OPERATION_CODE = 'OP-024-026'

// ============================================================================
// STAKEHOLDERS — 12 actores reales
// ============================================================================
const STAKEHOLDERS = [
  // Cliente / Grupo Parisien
  { name: 'Marcia Costa',                   email: 'mcosta@chicparisien.com',           company: 'Chic Parisien', role: 'Cliente · Comercio Exterior',       isPrimary: true  },
  { name: 'Camila Freire',                  email: 'cfreire@chicparisien.com',          company: 'Chic Parisien', role: 'Comercio Exterior',                  isPrimary: false },
  { name: 'Maria Fernanda De Los Santos',   email: 'mdelossantos@chicparisien.com',     company: 'Chic Parisien', role: 'Jefe Comercio Exterior',             isPrimary: false },
  { name: 'Patricia Castiñeira',            email: 'pcastineira@indian.ar',             company: 'Chic Parisien', role: 'Coord. Comercio Ext. (Indian)',      isPrimary: false },

  // Forwarder / Murchison Uruguay
  { name: 'Natalia Montaña',                email: 'nmontana@murchison.com.uy',         company: 'Murchison',     role: 'Ejecutivo Comercial COMEX (owner)',  isPrimary: true  },
  { name: 'Mauricio Javier',                email: 'mjavier@murchison.com.uy',          company: 'Murchison',     role: 'Jefe Comercio Exterior',             isPrimary: false },
  { name: 'Daniel Cedeira',                 email: 'dcedeira@murchison.com.uy',         company: 'Murchison',     role: 'Supervisor',                         isPrimary: false },
  { name: 'Enzo Pizarro',                   email: 'epizarro@murchison.com.uy',         company: 'Murchison',     role: 'Administración',                     isPrimary: false },

  // Agente origen / Parisi NGB
  { name: 'Suey Jin',                       email: 'ngb-sueyjin@parisigs.com',          company: 'Parisi NGB',    role: 'Operativo (Ningbo)',                 isPrimary: false },
  { name: 'Candy Xu',                       email: 'ngb-candyxu@parisigs.com',          company: 'Parisi NGB',    role: 'Documentación',                      isPrimary: false },
  { name: 'Maniya Zhang',                   email: 'tlm-maniyazhang@parisigs.com',      company: 'Parisi NGB',    role: 'TLM',                                isPrimary: false },

  // Despachante destino / Onboard BSAS
  { name: 'Sofía Cobos',                    email: 'sofia@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Despachante destino',                isPrimary: false },
  { name: 'Wendy Brito',                    email: 'wendy@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Despachante destino',                isPrimary: false },
  { name: 'Lucio Lo Duca',                  email: 'lucio@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Coord. terminal',                    isPrimary: false },
  { name: 'Francisco Merlo',                email: 'francisco@onboard.com.ar',          company: 'Onboard BSAS',  role: 'Operaciones',                        isPrimary: false },
]

// ============================================================================
// QUOTE Q-024-026
// ============================================================================
const QUOTE_DATA = {
  quoteCode: QUOTE_CODE,
  clientName: 'Chic Parisien S.A.',
  clientEmail: 'mcosta@chicparisien.com',
  isNewClient: false,
  channel: 'EMAIL',
  // ACCEPTED (no CLOSED_WON) para matchear el enum del frontend
  // (src/app/quotes/page.tsx STATUS_CONFIG). El frontend solo conoce
  // WAITING_FOR_DATA | READY_TO_QUOTE | QUOTED_DRAFT | SENT_AWAITING_CLIENT |
  // ACCEPTED | LOST. Un valor desconocido hace que /quotes crashee.
  status: 'ACCEPTED',
  receivedAt: new Date('2026-01-29T19:08:00Z'),
  originalMessage:
    'Hola Mauricio, buen día.\n\nNecesitamos cotizar 1x40 HQ desde Ningbo a Buenos Aires, FOB. Carga aprox 458 cartons, 10.812 kg, 68 CBM. Ready date aprox 10 feb. Producto: hair clips. Quedo a la espera de tu propuesta. Saludos, Marcia.',
  origin: 'Ningbo, China',
  originCountry: 'CN',
  destination: 'Buenos Aires, Argentina',
  destinationCountry: 'AR',
  product: 'Hair clips + lámparas con baterías de litio (li-battery)',
  containerType: 'FCL_40HC',
  containerCount: 1,
  weightKg: 10812.8,
  cbm: 68,
  incoterm: 'FOB',
  readyDate: new Date('2026-02-10T00:00:00Z'),
  aiParsedFields: { origin: 1.0, destination: 1.0, containerType: 1.0, weightKg: 0.95, incoterm: 1.0 },
  aiParsingConfidence: 0.96,
  recommendedCarrier: 'ZIM',
  recommendedReason:
    'ZIM ofrece la mejor combinación precio-tránsito-frecuencia para ruta NGB-BUE 40HQ. USD 1150 es competitivo, 20 días de free time en destino, salidas semanales, transit 32d directo sin transbordos críticos. NOTA: esta recomendación inicial fue invalidada el 5-feb cuando shipper informó li-battery — ZIM rechaza IMO Class 9.',
  // Shape de CarrierOption (frontend/src/types/quote.ts):
  // { name, isRecommended?, via, viaDetail?, transitDays, sailingsPerWeek,
  //   onTimePct12m, contractRate?, contractRef?, spotRate, yourFinalCost, status }
  // Snapshot de la cotización INICIAL (pre-detección de li-battery). En esta
  // etapa ZIM era recomendado. Spot rates incluyen 12.6% markup. yourFinalCost
  // = mejor de (contractRate || spotRate).
  carrierComparison: [
    {
      name: 'ZIM',
      isRecommended: true,
      via: 'direct',
      transitDays: 32,
      sailingsPerWeek: 1,
      onTimePct12m: 87,
      contractRate: null,
      contractRef: null,
      spotRate: 1150,
      yourFinalCost: 1295,
      status: 'Mejor precio · free time 20d',
    },
    {
      name: 'COSCO',
      via: 'direct',
      transitDays: 35,
      sailingsPerWeek: 1,
      onTimePct12m: 91,
      contractRate: null,
      contractRef: null,
      spotRate: 1180,
      yourFinalCost: 1329,
      status: 'Free time bajo (14d)',
    },
    {
      name: 'MSC',
      via: 'direct',
      viaDetail: 'Ipanema service',
      transitDays: 38,
      sailingsPerWeek: 2,
      onTimePct12m: 85,
      // Sin contrato vigente con MSC para esta lane al momento de cotizar.
      // El precio efectivo es spot (USD 1450). El contrato CTR-MSC-2026-Q2
      // se firmó tiempo después y es de Andes Trading, no de Chic Parisien.
      contractRate: null,
      contractRef: null,
      spotRate: 1450,
      yourFinalCost: 1450,
      status: 'Acepta IMO Class 9',
    },
    {
      name: 'Maersk',
      via: 'direct',
      transitDays: 34,
      sailingsPerWeek: 1,
      onTimePct12m: 92,
      contractRate: null,
      contractRef: null,
      spotRate: 1290,
      yourFinalCost: 1453,
      status: 'Sin contrato vigente',
    },
  ],
  markupPercent: 12.6,
  markupAmount: 145,
  baseCarrierCost: 1150,
  surchargesTotal: 210,
  surchargesBreakdown: [
    { name: 'ISPS',     amount: 15,  description: 'Security charge' },
    { name: 'BAF',      amount: 120, description: 'Bunker adjustment factor' },
    { name: 'Doc fee',  amount: 75,  description: 'Documentation' },
  ],
  quoteFinalUsd: 1505,
  quoteValidDays: 7,
  draftSubject: 'RE: Cotización 1×40HQ Ningbo → Buenos Aires (Ref 024/026)',
  draftBody:
    'Hola Marcia,\n\nGracias por tu consulta. Te paso la cotización para tu embarque NGB→BUE:\n\n• Container: 1×40\'HQ\n• Flete marítimo: USD 1.505\n• Locales BSAS: USD 850\n• Free time destino: 20 días\n• Vigencia: 7 días\n\nAdjunto detalle completo. Quedo atento.\n\nSaludos,\nMauricio Javier — Murchison',
  draftAiConfidence: 0.92,
  clientHistoryWinRate: 0.78,
  clientPreferredCarrier: 'MSC',
  clientAverageMarkup: 12.6,
}

// ============================================================================
// OPERATION OP-024-026
// ============================================================================
const OPERATION_DATA: any = {
  operationCode: OPERATION_CODE,
  clientReference: 'Ref 024/026',
  clientName: 'Chic Parisien S.A.',
  clientEmail: 'mcosta@chicparisien.com',
  finalConsignee: 'Badonel SA',
  status: 'CLOSED',
  subStatus: 'COMPLETED',
  isCritical: false,
  isInDispute: false,
  isDelayed: false,
  currentOwner: 'OPS',
  mode: 'FCL',
  originPort: 'Ningbo',
  originCountry: 'CN',
  destinationPort: 'Buenos Aires',
  destinationCountry: 'AR',
  portOrigin: 'CN-NGB',
  portDestination: 'AR-BUE',
  containerNumbers: 'FFAU4271913, FX46436623',
  containerNumber: 'FFAU4271913', // primer container, mantiene compat con frontend que usa este campo
  incoterm: 'FOB',
  shippingLine: 'MSC',
  vessel: 'MSC AVNI V.FI607A',
  mblNumber: '177NNMNMN02Z46A',
  blNumber: '177NNMNMN02Z46A', // mismo, mantiene compat
  hblNumbers: 'NGBS076774, NGBS076774S',
  bookingNumber: 'JSY260252',
  weightKg: 10812.8,
  cbm: 68,
  cartons: 458,
  cargoDescription: 'Hair clips + lámparas con baterías de litio (li-battery internas no removibles)',
  imoClass: '9',
  etdOrigin: new Date('2026-02-18T00:00:00Z'),
  etaDestination: new Date('2026-04-07T00:00:00Z'),
  etd: new Date('2026-02-18T00:00:00Z'),
  eta: new Date('2026-04-07T00:00:00Z'),
  exposureUsd: 0,
  priority: 'NORMAL',
  stakeholders: STAKEHOLDERS,
}

// ============================================================================
// TIMELINE — 22 eventos cronológicos
// ============================================================================
const TIMELINE_EVENTS: Array<{
  timestamp: string
  title: string
  description: string
  eventType: string
  source: string
  sourceTeam?: string
}> = [
  { timestamp: '2026-01-29T19:08:00Z', title: 'Pedido de cotización recibido',           description: 'Marcia Costa (Chic Parisien) solicita cotización 1×40\'HQ FOB Ningbo→BUE',                                              eventType: 'EMAIL_RECEIVED',     source: 'customer',          sourceTeam: 'SALES' },
  { timestamp: '2026-01-29T19:11:00Z', title: 'Cotización solicitada al agente origen',  description: 'Mauricio Javier envía consulta a Parisi NGB (Suey Jin) con target rate USD 1100',                                       eventType: 'EMAIL_SENT',         source: 'forwarder',         sourceTeam: 'SALES' },
  { timestamp: '2026-02-02T10:46:00Z', title: 'Primera oferta recibida',                 description: 'Parisi confirma carga (hair clips, 458 ctns, 10.812,8 kg, 68 CBM) y ofrece ZIM USD 1150/40HQ',                            eventType: 'EMAIL_RECEIVED',     source: 'agent_origin',      sourceTeam: 'SALES' },
  { timestamp: '2026-02-02T14:26:00Z', title: 'Booking aprobado por forwarder',          description: 'Natalia Montaña confirma proceder con ZIM',                                                                            eventType: 'STATUS_CHANGED',     source: 'forwarder',         sourceTeam: 'SALES' },
  { timestamp: '2026-02-05T05:39:00Z', title: '⚠ ALERTA: carga incluye baterías',        description: 'Shipper informa que cargo incluye li-battery. ZIM rechaza. Re-cotización requerida.',                                   eventType: 'DISPUTE_OPENED',     source: 'agent_origin',      sourceTeam: 'SALES' },
  { timestamp: '2026-02-05T13:07:00Z', title: 'Re-cotización enviada al cliente',        description: 'Mauricio envía tarifa ajustada USD 1200 + IMO USD 200 a Chic Parisien',                                                  eventType: 'EMAIL_SENT',         source: 'forwarder',         sourceTeam: 'SALES' },
  { timestamp: '2026-02-09T15:24:00Z', title: 'Cliente confirma naturaleza de la carga', description: 'Patricia Castiñeira (Indian) informa que son lámparas con pilas internas no removibles',                                eventType: 'EMAIL_RECEIVED',     source: 'customer',          sourceTeam: 'SALES' },
  { timestamp: '2026-02-10T14:00:00Z', title: 'Servicio inicial perdido',                description: 'MSC Carioca (USD 1200) ya no tiene espacio. Opción única: MSC Ipanema USD 1450',                                          eventType: 'STATUS_CHANGED',     source: 'agent_origin',      sourceTeam: 'SALES' },
  { timestamp: '2026-02-10T15:32:00Z', title: 'Cliente aprueba nueva tarifa',            description: 'Maria Fernanda De Los Santos: "Si, OK por favor avanzar" · USD 1450 + IMO USD 200 + locales USD 850',                  eventType: 'EMAIL_RECEIVED',     source: 'customer',          sourceTeam: 'SALES' },
  { timestamp: '2026-02-10T16:05:00Z', title: 'Booking confirmado',                       description: 'MSC AVNI FI607A · Booking #JSY260252 · MBL 177NNMNMN02Z46A · CLS CY 16-feb · ETD NGB 18-feb · ETA BUE 09-abr',         eventType: 'STATUS_CHANGED',     source: 'agent_origin',      sourceTeam: 'OPS' },
  { timestamp: '2026-02-13T10:31:00Z', title: 'Drafts BL recibidos',                      description: 'Candy Xu envía HBL NGBS076774, NGBS076774S y MBL 177NNMNMN02Z46A en draft para revisión',                              eventType: 'DOCUMENT_RECEIVED',  source: 'agent_origin',      sourceTeam: 'OPS' },
  { timestamp: '2026-02-13T15:46:00Z', title: 'Despachante destino confirma datos OK',    description: 'Sofía Cobos (Onboard BSAS) revisa drafts y confirma datos correctos. No requiere tratamiento especial por baterías.', eventType: 'DOCUMENT_RECEIVED',  source: 'destination_agent', sourceTeam: 'OPS' },
  { timestamp: '2026-02-18T00:00:00Z', title: 'ETD Ningbo',                                description: 'Vessel MSC AVNI V.FI607A salió de Ningbo según schedule',                                                              eventType: 'SCHEDULE_CHANGED',   source: 'carrier',           sourceTeam: 'OPS' },
  { timestamp: '2026-02-28T14:29:00Z', title: 'Notificación de salida enviada al cliente', description: 'Notificación oficial de Murchison a Chic Parisien con ETD/ETA confirmados',                                          eventType: 'EMAIL_SENT',         source: 'forwarder',         sourceTeam: 'CUSTOMER' },
  { timestamp: '2026-03-04T19:40:00Z', title: '⚠ ALERTA: MBL no emitido en destino',     description: 'Lucio Lo Duca (Onboard) chequea con MSC y confirma que el MBL aún no tiene emisión en destino. Reclamo a Parisi.',     eventType: 'DISPUTE_OPENED',     source: 'destination_agent', sourceTeam: 'OPS' },
  { timestamp: '2026-03-05T02:24:00Z', title: 'Parisi confirma emisión MBL en destino',   description: 'Candy Xu confirma: "Yes, will issue the MBL at destination, the fee is USD 70"',                                      eventType: 'DISPUTE_RESOLVED',   source: 'agent_origin',      sourceTeam: 'OPS' },
  { timestamp: '2026-03-26T13:13:00Z', title: 'Carta de garantía Telex Release recibida', description: 'Parisi envía carta de garantía chino-inglés para que Chic Parisien firme y selle',                                    eventType: 'DOCUMENT_RECEIVED',  source: 'agent_origin',      sourceTeam: 'OPS' },
  { timestamp: '2026-03-27T12:16:00Z', title: 'Arrival Notice recibido del carrier',      description: 'MSC notifica arribo del B/L MEDUWI744667 a Enzo Pizarro (Murchison)',                                                  eventType: 'DOCUMENT_RECEIVED',  source: 'carrier',           sourceTeam: 'OPS' },
  { timestamp: '2026-03-30T02:56:00Z', title: 'HBL Telex Release final emitido',          description: 'Candy envía HBL NGBS076774S con Telex Release confirmado',                                                            eventType: 'DOCUMENT_RECEIVED',  source: 'agent_origin',      sourceTeam: 'OPS' },
  { timestamp: '2026-03-31T13:43:00Z', title: 'Notificación de arribo al cliente',        description: 'Murchison notifica Chic Parisien y Onboard: ETA actualizada 7 abr · vessel MSC AVNI FI615R',                          eventType: 'EMAIL_SENT',         source: 'forwarder',         sourceTeam: 'CUSTOMER' },
  { timestamp: '2026-04-07T00:00:00Z', title: 'ETA Buenos Aires (estimada)',              description: 'Vessel arriba a puerto BSAS',                                                                                            eventType: 'SCHEDULE_CHANGED',   source: 'carrier',           sourceTeam: 'OPS' },
  { timestamp: '2026-04-06T13:49:00Z', title: 'Confirmación de arribo de Onboard',         description: 'Wendy Brito confirma fecha de arribo actualizada. Operación cerrada exitosamente.',                                  eventType: 'TASK_COMPLETED',     source: 'destination_agent', sourceTeam: 'OPS' },
]

// ============================================================================
// ATTACHMENTS — 7 archivos físicos en public/attachments/OP-024-026/
// ============================================================================
const ATTACHMENTS = [
  { file: 'HBL_NGBS076774_DRAFT.pdf',        mime: 'application/pdf', docType: 'HBL_DRAFT',       desc: 'HBL hijo borrador (Ningbo Topwin → Badonel)',                  source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
  { file: 'HBL_NGBS076774S_DRAFT.pdf',       mime: 'application/pdf', docType: 'HBL_DRAFT',       desc: 'HBL hijo borrador switch (Badonel → destino)',                 source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
  { file: 'MBL_177NNMNMN02Z46A_DRAFT.doc',   mime: 'application/msword', docType: 'MBL_DRAFT',    desc: 'MBL borrador',                                                  source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
  { file: 'PGS_TelexRelease_Guarantee_CN_EN.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docType: 'GUARANTEE', desc: 'Carta de garantía Telex Release (chino-inglés)', source: 'agent_origin', receivedAt: '2026-03-26T13:13:00Z' },
  { file: 'ArrivalNotice_MEDUWI744667.pdf',  mime: 'application/pdf', docType: 'ARRIVAL_NOTICE',  desc: 'Aviso de arribo de MSC',                                         source: 'carrier',      receivedAt: '2026-03-27T12:16:00Z' },
  { file: 'HBL_NGBS076774S_TLX_RELEASE.pdf', mime: 'application/pdf', docType: 'BL_TLX_RELEASE',  desc: 'HBL con Telex Release final',                                    source: 'agent_origin', receivedAt: '2026-03-30T02:56:00Z' },
  { file: 'DebitNote_NGBSD148507.pdf',       mime: 'application/pdf', docType: 'DEBIT_NOTE',      desc: 'Nota de débito del agente origen',                               source: 'agent_origin', receivedAt: '2026-03-02T01:27:00Z' },
]

// ============================================================================
// AGENT DECISIONS (ad-mur-001..ad-mur-010)
// ============================================================================
const AGENT_DECISIONS = [
  {
    id: 'ad-mur-001', agentName: 'READ', decisionType: 'CLASSIFY_EMAIL',
    createdAt: new Date('2026-01-29T19:09:00Z'),
    confidence: 0.96,
    output: {
      summary: 'Parsed pedido inicial de cotización de Marcia Costa',
      reasoning:
        'Email entrante de mcosta@chicparisien.com identificado como pedido de cotización. Cliente existente (Chic Parisien) con 12 operaciones previas. Extraje: ruta Ningbo→Buenos Aires, 1×40\'HQ, FOB, 458 cartons, ~10.812 kg, 68 CBM, ready 10-feb. Producto declarado: hair clips. Confidence alto (0.96) — todos los campos críticos están explícitos en el body.',
      alternatives: ['Tratar como follow-up de operación previa (descartado: nuevo BL, sin referencia a otra op)'],
      action: 'Creé Quote Q-024-026 con status WAITING_FOR_DATA y disparé pipeline de cotización al agente origen.',
    },
  },
  {
    id: 'ad-mur-002', agentName: 'QUOTE', decisionType: 'DRAFT_EMAIL',
    createdAt: new Date('2026-02-02T14:00:00Z'),
    confidence: 0.93,
    output: {
      summary: 'Recomendó ZIM USD 1150 entre 4 carriers para NGB-BUE 40HQ',
      reasoning:
        'Comparé 4 carriers disponibles para la ruta NGB-BUE 40HQ con ready 10-feb: ZIM USD 1150 (semanal, 32d transit, 20d free time) vs COSCO USD 1180 (semanal, 35d, 14d free time) vs MSC USD 1450 (quincenal, 38d, 21d free time) vs Maersk USD 1290 (semanal, 34d, 14d free time). Recomendé ZIM por mejor precio + free time elevado + frecuencia semanal. Histórico de Chic Parisien con ZIM en otras rutas: 100% on-time.',
      alternatives: ['COSCO (descartado: free time 14d insuficiente para cliente que típicamente despacha en 17-19d)', 'MSC (descartado por precio en esta etapa)', 'Maersk (descartado: sin contrato vigente)'],
      action: 'Generé draft de email a Natalia Montaña proponiendo ZIM USD 1150 + USD 210 surcharges + 12.6% markup. Esperando aprobación humana antes de enviar al cliente.',
    },
  },
  {
    id: 'ad-mur-003', agentName: 'WATCH', decisionType: 'FLAG_RISK',
    createdAt: new Date('2026-02-05T06:00:00Z'),
    confidence: 0.98,
    output: {
      summary: '⚠ ALERTA: shipper informó li-battery, ZIM rechaza',
      reasoning:
        'Suey Jin (Parisi NGB) reportó que el shipper informó tarde que la carga incluye baterías de litio. ZIM rechazó el booking por política de no aceptar IMO Class 9. COSCO también rechaza. Solo MSC y Maersk aceptan IMO Class 9 con surcharge. Severidad ALTA: re-cotización urgente requerida porque vence ventana de booking pre-Chinese New Year.',
      alternatives: ['Esperar oferta MSC (mejor opción, tomó esta vía)', 'Maersk con surcharge (descartada por timing)'],
      action: 'Generé alerta crítica + draft de re-cotización a Natalia para enviar a Maria Fernanda con tarifa MSC ajustada.',
    },
  },
  {
    id: 'ad-mur-004', agentName: 'QUOTE', decisionType: 'DRAFT_EMAIL',
    createdAt: new Date('2026-02-10T15:00:00Z'),
    confidence: 0.92,
    output: {
      summary: 'Re-cotización tras detección de li-battery: MSC Ipanema USD 1450 (única opción viable)',
      reasoning:
        'Cliente confirmó (10 feb 15:00) que la carga incluye lámparas con baterías de litio internas no removibles. ZIM rechazó la carga el 5-feb por política de no aceptar IMO Class 9.\n\nEvalué alternativas: (1) MSC Carioca USD 1200 - mejor precio pero confirmado FULLY BOOKED por agente Parisi. (2) MSC Ipanema USD 1450 - mismo carrier, servicio diferente, ETD 18-feb, espacio confirmado. (3) Esperar próximo ZIM con baterías removidas - DESCARTADO porque cliente confirmó que las baterías son internas no removibles. (4) COSCO - también rechaza li-battery.\n\nRecomendé MSC Ipanema USD 1450 + IMO USD 200 + ISPS USD 15. Razones: (a) única opción viable con li-battery a tarifa razonable, (b) ETD 18-feb evita lockdown de Chinese New Year que afectaría próxima salida, (c) free time destino 21 días supera ampliamente los 14d típicos, (d) histórico de Chic Parisien con MSC en otras rutas: 100% on-time, sin incidentes.\n\nConfidence 92%. Riesgo principal: aumento de USD 300 vs cotización original. Mitigación: comuniqué claramente al cliente la razón del ajuste y obtuve aprobación escrita antes de avanzar.',
      alternatives: [
        'MSC Carioca USD 1200 (rechazado: sin espacio)',
        'Esperar nueva oferta ZIM sin baterías (rechazado: carga no permite)',
        'Maersk USD 1290 (no consultado por timing — booking debía cerrarse esa noche por CNY)',
      ],
      action: 'Generé draft de email a Natalia con tarifa ajustada para enviar a Maria Fernanda De Los Santos. Email NO enviado al cliente — requiere aprobación humana de Natalia.',
    },
  },
  {
    id: 'ad-mur-005', agentName: 'REPLY', decisionType: 'DRAFT_EMAIL',
    createdAt: new Date('2026-02-10T15:16:00Z'),
    confidence: 0.88,
    output: {
      summary: 'Generó email en español rioplatense con tarifa ajustada',
      reasoning:
        'Draft de re-cotización generado en español rioplatense matching tono histórico de comunicación Murchison-Chic Parisien. Estructura: (1) reconocer cambio (li-battery detectado), (2) explicar implicancia (ZIM rechaza, MSC Carioca sin espacio), (3) presentar opción única (MSC Ipanema con detalle de precio y razón), (4) pedir confirmación con deadline (CNY).',
      alternatives: ['Email en español neutro (descartado: histórico es rioplatense)'],
      action: 'Draft listo para review de Natalia. NO enviado.',
    },
  },
  {
    id: 'ad-mur-006', agentName: 'READ', decisionType: 'CLASSIFY_EMAIL',
    createdAt: new Date('2026-02-13T10:35:00Z'),
    confidence: 0.97,
    output: {
      summary: 'Parsed 3 attachments BL/MBL drafts de Candy Xu',
      reasoning:
        'Email de ngb-candyxu@parisigs.com con 3 attachments: HBL_NGBS076774_DRAFT.pdf, HBL_NGBS076774S_DRAFT.pdf, MBL_177NNMNMN02Z46A_DRAFT.doc. Detecté que NGBS076774S es el HBL switch (Badonel como shipper en destino). Clasifiqué cada documento por tipo y los vinculé a OP-024-026.',
      alternatives: ['Tratar todos como un único doc (descartado: switch HBL requiere validación distinta)'],
      action: 'Creé 3 Attachment records con documentType="HBL_DRAFT" / "MBL_DRAFT". Notifiqué a Sofía Cobos para revisión.',
    },
  },
  {
    id: 'ad-mur-007', agentName: 'CLEAR', decisionType: 'FLAG_INCONSISTENCY',
    createdAt: new Date('2026-03-04T19:45:00Z'),
    confidence: 0.91,
    output: {
      summary: 'Detectó inconsistencia entre solicitud y debit note (MBL emit origen vs destino)',
      reasoning:
        'Comparé la solicitud inicial de Natalia (MBL emit destino) con el debit note recibido de Parisi NGBSD148507 que figura "MBL emit origin USD 70". Discrepancia detectada. Riesgo: si el MBL se emite en origen no se puede liberar en destino sin Telex Release, lo que retrasaría el despacho.',
      alternatives: ['Asumir error en el debit note (descartado: el debit note es la fuente de verdad financiera)'],
      action: 'Generé alerta de severidad MEDIUM y disparé draft de reclamo a Candy Xu pidiendo corrección.',
    },
  },
  {
    id: 'ad-mur-008', agentName: 'REPLY', decisionType: 'DRAFT_EMAIL',
    createdAt: new Date('2026-03-04T19:50:00Z'),
    confidence: 0.89,
    output: {
      summary: 'Generó reclamo a Candy Xu por inconsistencia MBL',
      reasoning:
        'Draft en inglés (canal de comunicación con Parisi NGB) pidiendo corrección del debit note + confirmación de que el MBL se emite en destino según solicitud original. Tono firme pero profesional. Incluí referencia al booking JSY260252 y debit note NGBSD148507.',
      alternatives: ['Llamada en vez de email (descartado: necesitamos rastro escrito)'],
      action: 'Draft enviado a Natalia para review.',
    },
  },
  {
    id: 'ad-mur-009', agentName: 'READ', decisionType: 'CLASSIFY_EMAIL',
    createdAt: new Date('2026-03-27T12:20:00Z'),
    confidence: 0.98,
    output: {
      summary: 'Procesé Arrival Notice de MSC y actualicé ETA',
      reasoning:
        'Email de MSC a Enzo Pizarro con attachment ArrivalNotice_MEDUWI744667.pdf. Extraje: vessel MSC AVNI cambió de FI607A a FI615R (rotation update), ETA actualizada a 7-abr (vs 9-abr original). Vinculé al operationId OP-024-026 y actualicé el campo etaDestination.',
      alternatives: [],
      action: 'Creé Attachment + TimelineEvent + actualicé op.eta. Generé notificación al cliente.',
    },
  },
  {
    id: 'ad-mur-010', agentName: 'REPLY', decisionType: 'DRAFT_EMAIL',
    createdAt: new Date('2026-03-31T13:40:00Z'),
    confidence: 0.94,
    output: {
      summary: 'Generó notificación de arribo en español para Chic Parisien y Onboard',
      reasoning:
        'Draft de notificación de arribo final con detalle: vessel, ETA actualizada, MBL, HBL, despachante de destino contactado (Sofía Cobos). Audiencia: Chic Parisien (cliente) + Onboard (despachante). Lenguaje formal en español, con tono Murchison habitual.',
      alternatives: ['Notificación separada por audiencia (descartado: el mismo mensaje sirve para ambas)'],
      action: 'Draft listo. Esperando aprobación de Natalia para envío.',
    },
  },
]

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n=== Seed Murchison OP-024-026 ===\n')

  // 0. Verify demo user exists
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) {
    throw new Error(`No se encontró el demo user (${DEMO_EMAIL}). Apuntás a la BD correcta?`)
  }
  console.log(`✓ Demo user: ${demoUser.email} (${demoUser.id})\n`)

  // 1. Quote
  const quote = await prisma.quote.upsert({
    where: { quoteCode: QUOTE_CODE },
    create: { ...QUOTE_DATA, userId: demoUser.id },
    update: { ...QUOTE_DATA, userId: demoUser.id },
  })
  console.log(`✓ Quote upserted: ${quote.quoteCode} (${quote.id})`)

  // 2. Operation — no hay unique compuesto, usamos find + update/create
  const existingOp = await prisma.operation.findFirst({
    where: { operationCode: OPERATION_CODE, userId: demoUser.id },
  })
  const op = existingOp
    ? await prisma.operation.update({
        where: { id: existingOp.id },
        data: { ...OPERATION_DATA, userId: demoUser.id },
      })
    : await prisma.operation.create({
        data: { ...OPERATION_DATA, userId: demoUser.id },
      })
  console.log(`✓ Operation ${existingOp ? 'updated' : 'created'}: ${op.operationCode} (${op.id})`)

  // 3. Timeline events — delete + recreate (no tienen id estable)
  await prisma.timelineEvent.deleteMany({ where: { operationId: op.id } })
  for (const evt of TIMELINE_EVENTS) {
    await prisma.timelineEvent.create({
      data: {
        operationId: op.id,
        timestamp: new Date(evt.timestamp),
        title: evt.title,
        description: evt.description,
        eventType: evt.eventType,
        source: evt.source,
        sourceTeam: evt.sourceTeam,
      },
    })
  }
  console.log(`✓ ${TIMELINE_EVENTS.length} timeline events created`)

  // 4. Attachments — delete + recreate
  await prisma.attachment.deleteMany({ where: { operationId: op.id } })
  let attachmentsCreated = 0
  for (const att of ATTACHMENTS) {
    const fullPath = join(process.cwd(), 'public/attachments/OP-024-026', att.file)
    let sizeBytes = 0
    try {
      sizeBytes = statSync(fullPath).size
    } catch (err) {
      console.warn(`  ⚠ archivo no encontrado: ${fullPath} — usando size 0`)
    }
    await prisma.attachment.create({
      data: {
        operationId: op.id,
        filename: att.file.replace(/_/g, ' '),
        storedPath: `attachments/OP-024-026/${att.file}`,
        mimeType: att.mime,
        sizeBytes,
        documentType: att.docType,
        description: att.desc,
        source: att.source,
        receivedAt: new Date(att.receivedAt),
      },
    })
    attachmentsCreated++
  }
  console.log(`✓ ${attachmentsCreated} attachments created`)

  // 5. Agent decisions — upsert por id estable
  for (const dec of AGENT_DECISIONS) {
    await prisma.agentDecision.upsert({
      where: { id: dec.id },
      create: {
        id: dec.id,
        operationId: op.id,
        userId: demoUser.id,
        agentName: dec.agentName,
        decisionType: dec.decisionType,
        inputData: { operationCode: OPERATION_CODE },
        outputData: dec.output as any,
        confidence: dec.confidence,
        createdAt: dec.createdAt,
        wasAutoApplied: false,
      },
      update: {
        operationId: op.id,
        userId: demoUser.id,
        agentName: dec.agentName,
        decisionType: dec.decisionType,
        inputData: { operationCode: OPERATION_CODE },
        outputData: dec.output as any,
        confidence: dec.confidence,
        createdAt: dec.createdAt,
      },
    })
  }
  console.log(`✓ ${AGENT_DECISIONS.length} agent decisions upserted`)

  console.log(`\n✅ MURCHISON SEED COMPLETE\n`)
  console.log(`Q-024-026 → ${quote.id}`)
  console.log(`OP-024-026 → ${op.id}`)
}

main()
  .catch((err) => { console.error('❌ Seed failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
