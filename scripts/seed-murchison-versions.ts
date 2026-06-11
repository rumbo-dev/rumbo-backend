/**
 * Seed de 3 VERSIONES TEMPORALES de OP-024-026 (Murchison · Chic Parisien).
 *
 * Las 3 versiones son "fotos" de la misma operación en momentos distintos:
 *   - OP-024-026-T1 → 5-feb-2026 (crisis de baterías recién detectada)
 *   - OP-024-026-T2 → 13-feb-2026 (booking confirmado, drafts BL llegaron)
 *   - OP-024-026-T3 → 4-mar-2026 (discrepancia en emisión MBL)
 *
 * NO TOCA OP-024-026 ni Q-024-026 ni las 4 ops curadas.
 *
 * IDEMPOTENTE: findFirst + update | create para las ops; deleteMany +
 * recreate para timeline events / attachments / suggested tasks de las 3
 * versiones específicamente.
 *
 * USO:
 *   DATABASE_URL="..." npx tsx scripts/seed-murchison-versions.ts
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

// 12 actores reales (mismos que en OP-024-026)
const STAKEHOLDERS = [
  { name: 'Marcia Costa',                   email: 'mcosta@chicparisien.com',           company: 'Chic Parisien', role: 'Cliente · Comercio Exterior',       isPrimary: true  },
  { name: 'Camila Freire',                  email: 'cfreire@chicparisien.com',          company: 'Chic Parisien', role: 'Comercio Exterior',                  isPrimary: false },
  { name: 'Maria Fernanda De Los Santos',   email: 'mdelossantos@chicparisien.com',     company: 'Chic Parisien', role: 'Jefe Comercio Exterior',             isPrimary: false },
  { name: 'Patricia Castiñeira',            email: 'pcastineira@indian.ar',             company: 'Chic Parisien', role: 'Coord. Comercio Ext. (Indian)',      isPrimary: false },
  { name: 'Natalia Montaña',                email: 'nmontana@murchison.com.uy',         company: 'Murchison',     role: 'Ejecutivo Comercial COMEX (owner)',  isPrimary: true  },
  { name: 'Mauricio Javier',                email: 'mjavier@murchison.com.uy',          company: 'Murchison',     role: 'Jefe Comercio Exterior',             isPrimary: false },
  { name: 'Daniel Cedeira',                 email: 'dcedeira@murchison.com.uy',         company: 'Murchison',     role: 'Supervisor',                         isPrimary: false },
  { name: 'Enzo Pizarro',                   email: 'epizarro@murchison.com.uy',         company: 'Murchison',     role: 'Administración',                     isPrimary: false },
  { name: 'Suey Jin',                       email: 'ngb-sueyjin@parisigs.com',          company: 'Parisi NGB',    role: 'Operativo (Ningbo)',                 isPrimary: false },
  { name: 'Candy Xu',                       email: 'ngb-candyxu@parisigs.com',          company: 'Parisi NGB',    role: 'Documentación',                      isPrimary: false },
  { name: 'Maniya Zhang',                   email: 'tlm-maniyazhang@parisigs.com',      company: 'Parisi NGB',    role: 'TLM',                                isPrimary: false },
  { name: 'Sofía Cobos',                    email: 'sofia@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Despachante destino',                isPrimary: false },
  { name: 'Wendy Brito',                    email: 'wendy@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Despachante destino',                isPrimary: false },
  { name: 'Lucio Lo Duca',                  email: 'lucio@onboard.com.ar',              company: 'Onboard BSAS',  role: 'Coord. terminal',                    isPrimary: false },
  { name: 'Francisco Merlo',                email: 'francisco@onboard.com.ar',          company: 'Onboard BSAS',  role: 'Operaciones',                        isPrimary: false },
]

// Campos compartidos por las 3 versiones
const SHARED = {
  clientReference: 'Ref 024/026',
  clientName: 'Chic Parisien S.A.',
  clientEmail: 'mcosta@chicparisien.com',
  finalConsignee: 'Badonel SA',
  mode: 'FCL',
  originPort: 'Ningbo',
  originCountry: 'CN',
  destinationPort: 'Buenos Aires',
  destinationCountry: 'AR',
  portOrigin: 'CN-NGB',
  portDestination: 'AR-BUE',
  incoterm: 'FOB',
  weightKg: 10812.8,
  cbm: 68,
  cartons: 458,
  cargoDescription: 'Hair clips + lámparas con baterías de litio (li-battery internas no removibles)',
  imoClass: '9',
  priority: 'NORMAL',
  stakeholders: STAKEHOLDERS,
}

// ============================================================================
// VERSIONES
// ============================================================================

const VERSIONS = [
  // --------- T1: 5-feb-2026 (crisis de baterías) -----------
  {
    operationCode: 'OP-024-026-T1',
    fields: {
      ...SHARED,
      status: 'BOOKING',
      subStatus: 'BOOKING_PENDING',
      currentOwner: 'OPS',
      isCritical: true,
      isInDispute: true,
      isDelayed: false,
      criticalSeverity: 'high',
      criticalHeadline: 'Carga incluye baterías de litio — booking inicial con ZIM cae',
      criticalImpact: 'Costo adicional estimado USD 300/40HQ (cambio a carrier que acepte IMO Class 9). Posible delay 5-7 días en booking.',
      exposureUsd: 300,
      shippingLine: null,
      vessel: null,
      mblNumber: null,
      blNumber: null,
      hblNumbers: null,
      bookingNumber: null,
      containerNumbers: null,
      containerNumber: null,
      etdOrigin: null,
      etaDestination: null,
      etd: null,
      eta: null,
      createdAt: new Date('2026-01-29T19:08:00Z'),
      updatedAt: new Date('2026-02-05T13:07:00Z'),
    },
    timeline: [
      { timestamp: '2026-01-29T19:08:00Z', title: 'Pedido de cotización recibido',          description: 'Marcia Costa (Chic Parisien) solicita cotización 1×40\'HQ FOB Ningbo→BUE',                        eventType: 'EMAIL_RECEIVED',  source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-01-29T19:11:00Z', title: 'Cotización solicitada al agente origen', description: 'Mauricio Javier envía a Parisi NGB con target rate USD 1100',                                       eventType: 'EMAIL_SENT',      source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T10:46:00Z', title: 'Primera oferta recibida',                description: 'Parisi confirma carga (hair clips, 458 ctns, 10.812,8 kg, 68 CBM). Ofrece ZIM USD 1150/40HQ',         eventType: 'EMAIL_RECEIVED',  source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T14:26:00Z', title: 'Booking aprobado por forwarder',         description: 'Natalia confirma proceder con ZIM. Pendiente confirmación de booking de Parisi.',                    eventType: 'STATUS_CHANGED',  source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T05:39:00Z', title: '⚠ ALERTA: carga incluye baterías',       description: 'Shipper informa li-battery. ZIM rechaza. Re-cotización requerida.',                                  eventType: 'DISPUTE_OPENED',  source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T13:07:00Z', title: 'Re-cotización enviada al cliente',       description: 'Mauricio envía tarifa ajustada USD 1200 + IMO USD 200 a Chic Parisien. Pendiente aprobación.',       eventType: 'EMAIL_SENT',      source: 'forwarder',         sourceTeam: 'SALES' },
    ],
    attachments: [],
    suggestedTasks: [
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'urgent', confidence: 96,
        title: 'URGENTE — Confirmar con cliente naturaleza de baterías',
        description: 'Patricia Castiñeira (Indian) debe confirmar tipo de baterías y si son removibles. Sin esa info no podemos elegir carrier ni cotizar.',
        draftSubject: 'Ref 024/026 — Confirmación urgente sobre baterías en la carga',
        draftTo: 'Patricia Castiñeira <pcastineira@indian.ar>',
        draftCc: 'Maria Fernanda De Los Santos <mdelossantos@chicparisien.com>; Camila Freire <cfreire@chicparisien.com>',
        draftBody: 'Hola Patricia, ¿cómo estás? Te escribo con urgencia sobre la Ref 024/026. El agente nos informó que la carga incluye baterías de litio. ZIM y COSCO rechazan este tipo de carga (IMO Class 9), por lo que tenemos que evaluar opciones con MSC o Maersk, que sí aceptan pero con surcharge IMO de USD 200.\n\nAntes de avanzar, necesito que el shipper confirme:\n(1) ¿Qué tipo de baterías son? ¿Litio o pila común?\n(2) ¿Están integradas al producto o son removibles para empaque separado?\n\nLa confirmación nos permite avanzar con cotización ajustada o, si fueran removibles, mantener la tarifa ZIM original. Quedo a la espera.\n\nBeso, Natalia.',
      },
      {
        type: 'QUOTE', agentSource: 'QUOTE', priority: 'high', confidence: 92,
        title: 'Re-cotizar con MSC y Maersk (carriers que aceptan IMO Class 9)',
        description: 'ZIM USD 1150 y COSCO USD 1180 quedan descartados. Re-evaluar con MSC (Ipanema service · ETD 18-feb · USD 1450) y Maersk (USD 1290). Aplicar surcharge IMO USD 200 a ambos.',
        actionLabel: 'Re-cotizar ahora',
      },
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'high', confidence: 94,
        title: 'Notificar a Parisi NGB pausa temporal del booking',
        description: 'Sin confirmación de baterías no podemos avanzar. Pedir hold del booking 24-48h.',
        draftSubject: 'Ref 024/026 — Hold booking pending cargo confirmation',
        draftTo: 'Suey Jin <ngb-sueyjin@parisigs.com>',
        draftCc: 'Mauricio Javier <mjavier@murchison.com.uy>; Daniel Cedeira <dcedeira@murchison.com.uy>',
        draftBody: 'Dear Suey,\n\nCnee is checking with shipper the exact nature of batteries (lithium or standard, integrated or removable). Please hold the booking until we receive confirmation. We expect their feedback within 24-48h.\n\nWill revert ASAP.\n\nBest regards,\nNatalia.',
      },
      {
        type: 'WATCH', agentSource: 'WATCH', priority: 'low', confidence: 88,
        title: 'Programar follow-up en 24h si cliente no responde',
        description: 'Si Patricia/Maria Fernanda no responden antes del 6-feb 14:00, escalar a Camila Freire.',
        actionLabel: 'Programar',
        isInformational: true,
      },
    ],
  },

  // --------- T2: 13-feb-2026 (booking confirmado + drafts) -----------
  {
    operationCode: 'OP-024-026-T2',
    fields: {
      ...SHARED,
      status: 'BOOKING',
      subStatus: 'BOOKING_CONFIRMED',
      currentOwner: 'OPS',
      isCritical: false,
      isInDispute: false,
      isDelayed: false,
      criticalSeverity: null,
      criticalHeadline: null,
      criticalImpact: null,
      exposureUsd: 0,
      shippingLine: 'MSC',
      vessel: 'MSC AVNI V.FI607A',
      mblNumber: '177NNMNMN02Z46A',
      blNumber: '177NNMNMN02Z46A',
      hblNumbers: 'NGBS076774, NGBS076774S',
      bookingNumber: 'JSY260252',
      containerNumbers: null,
      containerNumber: null,
      etdOrigin: new Date('2026-02-18T00:00:00Z'),
      etaDestination: new Date('2026-04-09T00:00:00Z'),
      etd: new Date('2026-02-18T00:00:00Z'),
      eta: new Date('2026-04-09T00:00:00Z'),
      createdAt: new Date('2026-01-29T19:08:00Z'),
      updatedAt: new Date('2026-02-13T15:46:00Z'),
    },
    timeline: [
      { timestamp: '2026-01-29T19:08:00Z', title: 'Pedido de cotización recibido',          description: 'Marcia Costa (Chic Parisien) solicita cotización 1×40\'HQ FOB Ningbo→BUE',                        eventType: 'EMAIL_RECEIVED',  source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-01-29T19:11:00Z', title: 'Cotización solicitada al agente origen', description: 'Mauricio Javier envía a Parisi NGB con target rate USD 1100',                                       eventType: 'EMAIL_SENT',      source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T10:46:00Z', title: 'Primera oferta recibida',                description: 'Parisi confirma carga. Ofrece ZIM USD 1150/40HQ',                                                    eventType: 'EMAIL_RECEIVED',  source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T14:26:00Z', title: 'Booking aprobado por forwarder',         description: 'Natalia confirma proceder con ZIM',                                                                   eventType: 'STATUS_CHANGED',  source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T05:39:00Z', title: '⚠ ALERTA: carga incluye baterías',       description: 'Shipper informa li-battery. ZIM rechaza. Re-cotización requerida.',                                  eventType: 'DISPUTE_OPENED',  source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T13:07:00Z', title: 'Re-cotización enviada al cliente',       description: 'Mauricio envía tarifa ajustada USD 1200 + IMO USD 200 a Chic Parisien',                              eventType: 'EMAIL_SENT',      source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-09T15:24:00Z', title: 'Cliente confirma naturaleza de la carga', description: 'Patricia (Indian) informa: lámparas con pilas internas no removibles',                              eventType: 'EMAIL_RECEIVED',  source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T14:00:00Z', title: 'Servicio inicial perdido',                description: 'MSC Carioca (USD 1200) ya no tiene espacio. Opción única: MSC Ipanema USD 1450',                    eventType: 'STATUS_CHANGED',  source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T15:32:00Z', title: 'Cliente aprueba nueva tarifa',            description: 'Maria Fernanda: "Si, OK por favor avanzar" · USD 1450 + IMO USD 200 + locales USD 850',           eventType: 'EMAIL_RECEIVED',  source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T16:05:00Z', title: 'Booking confirmado',                       description: 'MSC AVNI FI607A · Booking #JSY260252 · MBL 177NNMNMN02Z46A · CLS CY 16-feb · ETD 18-feb · ETA 09-abr', eventType: 'STATUS_CHANGED',  source: 'agent_origin',      sourceTeam: 'OPS' },
      { timestamp: '2026-02-13T10:31:00Z', title: 'Drafts BL recibidos',                      description: 'Candy Xu (Parisi) envía HBL NGBS076774, NGBS076774S y MBL 177NNMNMN02Z46A en draft',              eventType: 'DOCUMENT_RECEIVED', source: 'agent_origin',    sourceTeam: 'OPS' },
    ],
    attachments: [
      { file: 'HBL_NGBS076774_DRAFT.pdf',      mime: 'application/pdf',     docType: 'HBL_DRAFT',   desc: 'HBL hijo borrador (Ningbo Topwin → Badonel)',     source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
      { file: 'HBL_NGBS076774S_DRAFT.pdf',     mime: 'application/pdf',     docType: 'HBL_DRAFT',   desc: 'HBL hijo borrador switch (Badonel → destino)',    source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
      { file: 'MBL_177NNMNMN02Z46A_DRAFT.doc', mime: 'application/msword',  docType: 'MBL_DRAFT',   desc: 'MBL borrador',                                     source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
    ],
    suggestedTasks: [
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'high', confidence: 95,
        title: 'Validar drafts BL con despachante destino',
        description: 'Los 3 documentos llegaron del agente. Onboard (despachante BSAS) debe confirmar que datos coinciden con su sistema antes de aprobar emisión.',
        draftSubject: 'CMI015842 // Ref 024/026 — Drafts HBL y MBL para validación',
        draftTo: 'Sofía Cobos <sofia@onboard.com.ar>',
        draftCc: 'Wendy Brito <wendy@onboard.com.ar>; Ezequiel de Hoz <dehoz.e@onboard.com.ar>',
        draftBody: 'Sofi, ¿cómo estás?\n\nTenemos una nueva carga para CHIC PARISIEN desde Ningbo a Buenos Aires. Datos del booking:\n\nV/V MSC AVNI FI607A · BOOKING #177NNMNMN02Z46A · 1X40HQ · CLS CY 16-FEB · ETD NGB 18-FEB · ETA BUE 09-APR\n\nSe trata de carga con baterías de litio, ¿necesitan algo adicional a las coordinaciones normales? Adjunto los documentos en draft (HBL hijo, HBL switch y MBL). ¿Me confirmás si está todo ok?\n\nQuedo atenta. Beso, Natalia.',
        // attachmentRefs por filename — resolveremos a ids reales después de crear los attachments
        attachmentFilenames: ['HBL_NGBS076774_DRAFT.pdf', 'HBL_NGBS076774S_DRAFT.pdf', 'MBL_177NNMNMN02Z46A_DRAFT.doc'],
      },
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'high', confidence: 96,
        title: 'Compartir HBL con cliente para validación',
        description: 'Maria Fernanda debe confirmar datos del HBL hijo antes de emisión final.',
        draftSubject: 'Ref 024/026 — HBL para validación',
        draftTo: 'Maria Fernanda De Los Santos <mdelossantos@chicparisien.com>',
        draftCc: 'Camila Freire <cfreire@chicparisien.com>',
        draftBody: 'Fer, buen día.\n\nTe comparto el HBL para esta carga. Te pido que me confirmes si están ok los datos.\n\nQuedo atenta. Beso, Natalia.',
        attachmentFilenames: ['HBL_NGBS076774_DRAFT.pdf'],
      },
      {
        type: 'CLEAR', agentSource: 'CLEAR', priority: 'low', confidence: 97,
        title: 'CLEAR validó automáticamente los 3 documentos vs booking',
        description: 'Cruce automático entre HBL/MBL y booking JSY260252. Datos coinciden 100%: container type ✓, peso 10.812,8 kg ✓, NCM hair clip ✓, consignee OB Group SRL ✓, notify Murchison Uruguay ✓. Sin discrepancias detectadas.',
        actionLabel: 'Ver detalle de validación',
        isInformational: true,
      },
    ],
  },

  // --------- T3: 4-mar-2026 (discrepancia MBL) -----------
  {
    operationCode: 'OP-024-026-T3',
    fields: {
      ...SHARED,
      status: 'IN_TRANSIT',
      subStatus: 'ON_BOARD',
      currentOwner: 'OPS',
      isCritical: true,
      isInDispute: true,
      isDelayed: false,
      criticalSeverity: 'high',
      criticalHeadline: 'MBL emitido en origen — solicitamos emisión en destino',
      criticalImpact: 'Si no se corrige antes del arribo (7-abr), Onboard no puede liberar la carga en BSAS. Posible delay + costos de almacenaje terminal.',
      exposureUsd: 250,
      shippingLine: 'MSC',
      vessel: 'MSC AVNI V.FI607A',
      mblNumber: '177NNMNMN02Z46A',
      blNumber: '177NNMNMN02Z46A',
      hblNumbers: 'NGBS076774, NGBS076774S',
      bookingNumber: 'JSY260252',
      containerNumbers: 'FFAU4271913, FX46436623',
      containerNumber: 'FFAU4271913',
      etdOrigin: new Date('2026-02-18T00:00:00Z'),
      etaDestination: new Date('2026-04-09T00:00:00Z'),
      etd: new Date('2026-02-18T00:00:00Z'),
      eta: new Date('2026-04-09T00:00:00Z'),
      createdAt: new Date('2026-01-29T19:08:00Z'),
      updatedAt: new Date('2026-03-04T20:18:00Z'),
    },
    timeline: [
      // Mismos que T2 + 5 nuevos
      { timestamp: '2026-01-29T19:08:00Z', title: 'Pedido de cotización recibido',          description: 'Marcia Costa (Chic Parisien) solicita cotización 1×40\'HQ FOB Ningbo→BUE',                        eventType: 'EMAIL_RECEIVED',    source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-01-29T19:11:00Z', title: 'Cotización solicitada al agente origen', description: 'Mauricio Javier envía a Parisi NGB con target rate USD 1100',                                       eventType: 'EMAIL_SENT',        source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T10:46:00Z', title: 'Primera oferta recibida',                description: 'Parisi confirma carga. Ofrece ZIM USD 1150/40HQ',                                                    eventType: 'EMAIL_RECEIVED',    source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-02T14:26:00Z', title: 'Booking aprobado por forwarder',         description: 'Natalia confirma proceder con ZIM',                                                                   eventType: 'STATUS_CHANGED',    source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T05:39:00Z', title: '⚠ ALERTA: carga incluye baterías',       description: 'Shipper informa li-battery. ZIM rechaza.',                                                            eventType: 'DISPUTE_OPENED',    source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-05T13:07:00Z', title: 'Re-cotización enviada al cliente',       description: 'Mauricio envía tarifa ajustada USD 1200 + IMO USD 200',                                              eventType: 'EMAIL_SENT',        source: 'forwarder',         sourceTeam: 'SALES' },
      { timestamp: '2026-02-09T15:24:00Z', title: 'Cliente confirma naturaleza de la carga', description: 'Patricia (Indian) informa: lámparas con pilas internas no removibles',                              eventType: 'EMAIL_RECEIVED',    source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T14:00:00Z', title: 'Servicio inicial perdido',                description: 'MSC Carioca sin espacio. Opción única: MSC Ipanema USD 1450',                                       eventType: 'STATUS_CHANGED',    source: 'agent_origin',      sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T15:32:00Z', title: 'Cliente aprueba nueva tarifa',            description: 'Maria Fernanda OK con USD 1450 + IMO + locales',                                                    eventType: 'EMAIL_RECEIVED',    source: 'customer',          sourceTeam: 'SALES' },
      { timestamp: '2026-02-10T16:05:00Z', title: 'Booking confirmado',                       description: 'MSC AVNI FI607A · Booking #JSY260252',                                                              eventType: 'STATUS_CHANGED',    source: 'agent_origin',      sourceTeam: 'OPS' },
      { timestamp: '2026-02-13T10:31:00Z', title: 'Drafts BL recibidos',                      description: 'Candy Xu envía HBL drafts y MBL en draft',                                                          eventType: 'DOCUMENT_RECEIVED', source: 'agent_origin',      sourceTeam: 'OPS' },
      { timestamp: '2026-02-13T15:46:00Z', title: 'Despachante destino confirma datos OK',    description: 'Sofía (Onboard) revisa drafts y confirma datos correctos. No requiere tratamiento especial.',     eventType: 'DOCUMENT_RECEIVED', source: 'destination_agent', sourceTeam: 'OPS' },
      { timestamp: '2026-02-18T00:00:00Z', title: 'ETD Ningbo',                                description: 'Vessel MSC AVNI V.FI607A salió de Ningbo',                                                          eventType: 'SCHEDULE_CHANGED',  source: 'carrier',           sourceTeam: 'OPS' },
      { timestamp: '2026-02-28T14:29:00Z', title: 'Notificación de salida al cliente',        description: 'Murchison notifica Chic Parisien con ETD/ETA',                                                      eventType: 'EMAIL_SENT',        source: 'forwarder',         sourceTeam: 'CUSTOMER' },
      { timestamp: '2026-03-02T01:27:00Z', title: 'Debit note del agente recibida',          description: 'Parisi envía debit note. Indica MBL emitido en origen.',                                            eventType: 'DOCUMENT_RECEIVED', source: 'agent_origin',      sourceTeam: 'OPS' },
      { timestamp: '2026-03-04T19:40:00Z', title: '⚠ ALERTA: MBL no emitido en destino',     description: 'Lucio (Onboard) chequea con MSC y confirma que el MBL aún no tiene emisión en destino. Reclamo al agente.', eventType: 'DISPUTE_OPENED', source: 'destination_agent', sourceTeam: 'OPS' },
    ],
    attachments: [
      { file: 'HBL_NGBS076774_DRAFT.pdf',      mime: 'application/pdf',     docType: 'HBL_DRAFT',   desc: 'HBL hijo borrador (Ningbo Topwin → Badonel)',     source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
      { file: 'HBL_NGBS076774S_DRAFT.pdf',     mime: 'application/pdf',     docType: 'HBL_DRAFT',   desc: 'HBL hijo borrador switch (Badonel → destino)',    source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
      { file: 'MBL_177NNMNMN02Z46A_DRAFT.doc', mime: 'application/msword',  docType: 'MBL_DRAFT',   desc: 'MBL borrador',                                     source: 'agent_origin', receivedAt: '2026-02-13T10:31:00Z' },
      { file: 'DebitNote_NGBSD148507.pdf',     mime: 'application/pdf',     docType: 'DEBIT_NOTE',  desc: 'Nota de débito del agente origen',                source: 'agent_origin', receivedAt: '2026-03-02T01:27:00Z' },
    ],
    suggestedTasks: [
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'urgent', confidence: 96,
        title: 'URGENTE — Reclamar emisión MBL en destino a Parisi',
        description: 'Onboard verificó con MSC que el MBL no tiene emisión en destino. Sin corrección, no se puede liberar la carga al arribo (7-abr).',
        draftSubject: 'Ref 024/026 — URGENT: MBL release at POD required',
        draftTo: 'Candy Xu <ngb-candyxu@parisigs.com>',
        draftCc: 'Suey Jin <ngb-sueyjin@parisigs.com>',
        draftBody: 'Dear Candy,\n\nFollowing our request from 12-Feb, MBL 177NNMNMN02Z46A must be issued at destination (POD: Buenos Aires). However, our destination agent (Onboard) verified with MSC and confirmed the BL is still showing as issued at origin.\n\nThis is critical: vessel ETA BUE is 7-Apr and without correction we cannot release the cargo. Please confirm POD release urgently, we cannot wait further.\n\nBest regards,\nNatalia.',
      },
      {
        type: 'REPLY', agentSource: 'REPLY', priority: 'high', confidence: 94,
        title: 'Notificar a Onboard que reclamo está en curso',
        description: 'Mantener a Sofía y Lucio informados de la gestión con el agente.',
        draftSubject: 'RE: CMI015842 // Ref 024/026 — MBL release status',
        draftTo: 'Sofía Cobos <sofia@onboard.com.ar>',
        draftCc: 'Lucio Lo Duca <lucio@onboard.com.ar>; Wendy Brito <wendy@onboard.com.ar>',
        draftBody: 'Sofi,\n\nTe confirmo que ya escalé el reclamo a Candy en Parisi pidiendo corrección urgente de la emisión del MBL en destino. Te aviso cuando tenga novedades. Mientras tanto seguimos coordinando los próximos pasos.\n\nBeso, Natalia.',
      },
      {
        type: 'CLEAR', agentSource: 'CLEAR', priority: 'medium', confidence: 95,
        title: 'CLEAR detectó inconsistencia documental',
        description: 'Debit note de Parisi (recibida 2-mar) indica MBL "ORIGINAL/FREIGHT PREPAID" emitido en origen. Tu instrucción del 12-feb explícitamente solicitaba emisión en destino. Discrepancia detectada por CLEAR automáticamente al procesar la debit note.',
        actionLabel: 'Ver detalle de la discrepancia',
        isInformational: true,
        attachmentFilenames: ['DebitNote_NGBSD148507.pdf'],
      },
      {
        type: 'WATCH', agentSource: 'WATCH', priority: 'low', confidence: 90,
        title: 'Programar follow-up al agente en 12h si no responde',
        description: 'Si Candy no confirma corrección antes del 5-mar 09:00 BSAS, escalar a Suey Jin y Mauricio.',
        actionLabel: 'Programar',
        isInformational: true,
      },
    ],
  },
]

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n=== Seed Murchison versiones temporales (T1/T2/T3) ===\n')

  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) throw new Error(`No demo user (${DEMO_EMAIL})`)
  console.log(`✓ Demo user: ${demoUser.email}\n`)

  // Verificar que OP-024-026 final existe y NO tocarla
  const finalOp = await prisma.operation.findFirst({
    where: { operationCode: 'OP-024-026', userId: demoUser.id },
    select: { id: true },
  })
  if (!finalOp) {
    console.warn('⚠  OP-024-026 (final) no existe. Las versiones T1/T2/T3 se crean igual.')
  } else {
    console.log(`✓ OP-024-026 (final) intacta: ${finalOp.id}\n`)
  }

  for (const v of VERSIONS) {
    console.log(`\n--- ${v.operationCode} ---`)
    const existing = await prisma.operation.findFirst({
      where: { operationCode: v.operationCode, userId: demoUser.id },
    })
    const op = existing
      ? await prisma.operation.update({
          where: { id: existing.id },
          data: { ...v.fields, userId: demoUser.id } as any,
        })
      : await prisma.operation.create({
          data: { ...v.fields, operationCode: v.operationCode, userId: demoUser.id } as any,
        })
    console.log(`  ✓ Operation ${existing ? 'updated' : 'created'}: ${op.id}`)

    // Timeline
    await prisma.timelineEvent.deleteMany({ where: { operationId: op.id } })
    for (const evt of v.timeline) {
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
    console.log(`  ✓ ${v.timeline.length} timeline events`)

    // Attachments — crear primero, después usar sus IDs en suggested tasks
    await prisma.attachment.deleteMany({ where: { operationId: op.id } })
    const createdAttachments: Record<string, string> = {} // filename → id
    for (const att of v.attachments) {
      const fullPath = join(process.cwd(), 'public/attachments', v.operationCode, att.file)
      let sizeBytes = 0
      try { sizeBytes = statSync(fullPath).size } catch { console.warn(`  ⚠ file not found: ${fullPath}`) }
      const created = await prisma.attachment.create({
        data: {
          operationId: op.id,
          filename: att.file.replace(/_/g, ' '),
          storedPath: `attachments/${v.operationCode}/${att.file}`,
          mimeType: att.mime,
          sizeBytes,
          documentType: att.docType,
          description: att.desc,
          source: att.source,
          receivedAt: new Date(att.receivedAt),
        },
      })
      createdAttachments[att.file] = created.id
    }
    console.log(`  ✓ ${v.attachments.length} attachments`)

    // Suggested tasks
    await prisma.suggestedTask.deleteMany({ where: { operationId: op.id } })
    let order = 0
    for (const t of v.suggestedTasks as any[]) {
      const attIds: string[] = (t.attachmentFilenames || [])
        .map((fn: string) => createdAttachments[fn])
        .filter((x: string | undefined): x is string => !!x)
      await prisma.suggestedTask.create({
        data: {
          operationId: op.id,
          type: t.type,
          agentSource: t.agentSource || null,
          priority: t.priority,
          title: t.title,
          description: t.description || null,
          draftSubject: t.draftSubject || null,
          draftTo: t.draftTo || null,
          draftCc: t.draftCc || null,
          draftBody: t.draftBody || null,
          actionLabel: t.actionLabel || null,
          confidence: t.confidence ?? null,
          isInformational: t.isInformational ?? false,
          attachmentIds: attIds,
          sortOrder: order++,
        },
      })
    }
    console.log(`  ✓ ${v.suggestedTasks.length} suggested tasks`)
  }

  console.log('\n✅ DONE\n')
}

main()
  .catch((err) => { console.error('❌ Seed failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
