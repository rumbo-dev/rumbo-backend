// Seed de 10 AgentDecisions con razonamientos detallados.
// IDs predecibles (ad-001..ad-010) para que today.ts pueda referenciar.
// Idempotente vía upsert.
//
// Correr con:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-agent-decisions.ts

import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está seteada.')
  process.exit(1)
}

const prisma = new PrismaClient()
const DEMO_EMAIL = 'demo@example.com'

const now = new Date()
const minsAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)

const decisions = [
  {
    id: 'ad-001',
    agentName: 'READ',
    decisionType: 'PARSE_DOCUMENT',
    operationCode: 'OP-0156',
    confidence: 0.94,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 1840,
    tokensInput: 4200,
    tokensOutput: 380,
    minutesAgo: 2,
    wasAutoApplied: true,
    inputData: {
      label: 'PDF BL de Maersk',
      body: 'BL_MAEU_2614W.pdf · 2.3MB · 4 páginas · vessel MSC Beatrice voyage 2614W',
    },
    outputData: {
      action: 'Match a OP-0156 + extracción de 12 campos confirmada',
      summary: 'BL parseado con éxito y validado contra Commercial Invoice.',
      reasoning:
        'Input: PDF BL de Maersk Beatrice voyage 2614W. Extraje 12 campos con confidence promedio 94%. Validé contra Commercial Invoice cargada hace 2 días: peso difiere en 350kg (BL: 18,200kg vs CI: 18,550kg). Threshold de tolerancia para AFIP: ±100kg. Flag como discrepancia para revisión manual del despachante. No bloqueé el flow porque la operación todavía está en tránsito (ETA 12 may), hay tiempo para corregir antes del arribo.',
      alternatives: [
        { option: 'Bloquear flow y forzar fix antes de arribo', why_rejected: 'Vessel todavía en tránsito (10 días), hay margen de corrección sin urgencia' },
        { option: 'Auto-corregir el BL contra el CI', why_rejected: 'No tengo permiso para modificar documentos del carrier, requiere acción manual del despachante' },
        { option: 'Ignorar discrepancia', why_rejected: '350kg supera 3.5x el threshold AFIP, riesgo de multa real' },
      ],
    },
  },
  {
    id: 'ad-002',
    agentName: 'WATCH',
    decisionType: 'FLAG_RISK',
    operationCode: 'OP-0142',
    confidence: 0.91,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 2210,
    tokensInput: 3100,
    tokensOutput: 420,
    minutesAgo: 7,
    wasAutoApplied: true,
    inputData: {
      label: 'Position update + free time analysis',
      body: 'AIS MarineTraffic: MSC Beatrice retrasada 48h en Algeciras. Free time terminal BUE: 7 días calendario. Cliente Importadora del Sur.',
    },
    outputData: {
      action: 'Escalated to CRITICAL + draft de notificación al cliente generado',
      summary: 'Risk de demurrage ARS 8-12k/día si cliente no coordina pickup el día de arribo.',
      reasoning:
        'OP-0142 ETA original 4 jun. Vessel MSC Beatrice retrasada 48h en Algeciras según AIS data de MarineTraffic. Free time terminal Buenos Aires: 7 días calendario. Si el cliente Importadora del Sur no coordina pickup el día de arribo, riesgo de demurrage ARS 8,000-12,000 por día. Decisión: escalar a critical, generar draft de notificación al cliente, mantener watch activo para re-evaluar en 24hs.',
      alternatives: [
        { option: 'Esperar a tener más data antes de notificar', why_rejected: 'Demurrage compone rápido; mejor pre-avisar al cliente para coordinar logística' },
        { option: 'Llamar al cliente automáticamente', why_rejected: 'Customer Success prefiere flow async — sales mismo confirma timing del call' },
      ],
    },
  },
  {
    id: 'ad-003',
    agentName: 'CLEAR',
    decisionType: 'VALIDATE_FILINGS',
    confidence: 0.96,
    modelUsed: 'claude-haiku-4-5',
    latencyMs: 980,
    tokensInput: 5800,
    tokensOutput: 220,
    minutesAgo: 14,
    wasAutoApplied: true,
    inputData: {
      label: '3 filings pendientes',
      body: 'Filings: OP-0142 (NCM 8708.30.90), OP-0156 (NCM 8421.23.00), OP-0173 (NCM 3923.10.10)',
    },
    outputData: {
      action: '3/3 validados sin observaciones · listos para presentar',
      summary: 'Cross-check contra base AFIP vigente — todos coherentes con descripción de mercadería y origen.',
      reasoning:
        'Validé los 3 filings contra la base AFIP de tariff codes vigente al 2026-05-15. Para cada uno: 1) NCM matchea con descripción de mercadería, 2) origen coherente con tratado vigente, 3) valor declarado dentro de rango histórico ±15% de comparables del mismo NCM, 4) sin alertas activas en el padrón. Confidence 96% — el 4% restante es la incertidumbre sobre cambios no publicados en el padrón.',
      alternatives: [
        { option: 'Re-validar manualmente todos los filings cada vez', why_rejected: 'Costo operativo alto sin agregar accuracy — el padrón AFIP se actualiza una vez al mes' },
      ],
    },
  },
  {
    id: 'ad-004',
    agentName: 'QUOTE',
    decisionType: 'DRAFT_REPLY',
    confidence: 0.88,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 3120,
    tokensInput: 2400,
    tokensOutput: 680,
    minutesAgo: 22,
    wasAutoApplied: false,
    inputData: {
      label: 'WhatsApp incompleto de Quest Industries',
      body: '"Necesito cotizar 2x40 HC Shanghai-BA". Faltan 6 datos para cotizar.',
    },
    outputData: {
      action: 'Draft de respuesta generado · pidiendo los 6 datos faltantes',
      summary: 'Texto conversacional matching tono usado con este cliente en última conversación.',
      reasoning:
        'Cliente Quest Industries (recurrente, 4 ops cerradas). Histórico de tono: usa "Mariana" como referencia interna, prefiere mensajes cortos numerados sobre prosa. Genero draft con 6 ítems numerados + estimado de tiempo de respuesta una vez que tengamos data. Menciono que tenemos contrato MSC con buenos rates en esta lane para incentivar la respuesta rápida. NO menciono precios — antes necesito todos los datos para no anclar mal la negociación.',
      alternatives: [
        { option: 'Cotizar con asunciones default', why_rejected: 'Sin NCM no puedo calcular impuestos correctos, sin incoterm no sé qué incluyo' },
        { option: 'Llamar al cliente', why_rejected: 'Cliente prefiere WhatsApp confirmado en últimas 3 interacciones' },
      ],
    },
  },
  {
    id: 'ad-005',
    agentName: 'REPLY',
    decisionType: 'ANSWER_QUERY',
    confidence: 0.92,
    modelUsed: 'claude-haiku-4-5',
    latencyMs: 720,
    tokensInput: 1800,
    tokensOutput: 240,
    minutesAgo: 31,
    wasAutoApplied: true,
    inputData: {
      label: 'WhatsApp: "¿cuándo llega mi container?"',
      body: 'Cliente: Andes Trading. Container: TCLU8821704. Operación: OP-23714.',
    },
    outputData: {
      action: 'Respuesta enviada en español rioplatense con ETA + tracking link',
      summary: 'Auto-aprobado (confidence > 0.9, info no sensible, query es factual).',
      reasoning:
        'Query factual ("¿cuándo llega?"). Tengo data de tracking actualizada (ETA 8 jun, vessel a 4 días de BUE). Respuesta corta tutea (tono confirmado para Andes Trading), incluye ETA, vessel y un link al tracking. No menciono surcharges ni pricing — fuera de scope de la query. Auto-aprobado porque: 1) confidence 92%, 2) info no sensible (ETA es público), 3) cliente ya en operación activa (no es una cotización).',
      alternatives: [
        { option: 'Pedir aprobación humana antes de mandar', why_rejected: 'Auto-aprobado por threshold; query simple, info pública, sin compromiso comercial' },
      ],
    },
  },
  {
    id: 'ad-006',
    agentName: 'RANK',
    decisionType: 'REPRIORITIZE_QUEUE',
    confidence: 0.84,
    modelUsed: 'claude-haiku-4-5',
    latencyMs: 1140,
    tokensInput: 6200,
    tokensOutput: 180,
    minutesAgo: 38,
    wasAutoApplied: true,
    inputData: {
      label: 'Queue de 23 operaciones activas',
      body: 'Ordenadas por createdAt desc. Re-evaluación de prioridad por cost-at-risk.',
    },
    outputData: {
      action: '4 ops movidas hacia arriba en la queue por exposure',
      summary: 'OP-0142 ($1,800 demurrage risk), OP-0184 ($1,800 multa), OP-0173 ($12,400 cancel risk), OP-23714 ($890 follow-up).',
      reasoning:
        'Re-orden de la queue basado en cost-at-risk computado en tiempo real. Las 4 ops que subieron: 1) OP-0142 con demurrage acumulando, 2) OP-0184 con discrepancia BL pendiente, 3) OP-0173 cotización sin responder hace 7 días (60% chance de cancel), 4) OP-23714 con cliente esperando respuesta de tracking. Total exposure activado: $16,890. El orden anterior por createdAt no reflejaba urgencia financiera real.',
      alternatives: [
        { option: 'Mantener orden por createdAt', why_rejected: 'Trata todas las ops como iguales — pierde foco en las que cuestan plata' },
        { option: 'Ordenar solo por exposure absoluto', why_rejected: 'Una op de $50 con SLA roto es más urgente que una de $5000 sin compromiso firmado' },
      ],
    },
  },
  {
    id: 'ad-007',
    agentName: 'CLEAR',
    decisionType: 'CATCH_DOCUMENT_MISMATCH',
    operationCode: 'OP-0184',
    confidence: 0.97,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 2680,
    tokensInput: 5400,
    tokensOutput: 320,
    minutesAgo: 45,
    wasAutoApplied: true,
    inputData: {
      label: 'Cross-check BL vs Commercial Invoice vs Packing List',
      body: 'OP-0184. BL: NCM 8708.30.90. CI: NCM 8708.30.90. Packing List: NCM 8708.30.95 (variante restrictiva).',
    },
    outputData: {
      action: 'Flagged + escalated · draft de email a despachante generado',
      summary: 'Discrepancia entre BL/CI y Packing List puede triggerear inspección AFIP.',
      reasoning:
        'NCM 8708.30.90 (BL + CI) vs 8708.30.95 (PL). El sub-código .95 tiene tratamiento aduanero distinto: el .90 paga 16% AAII y el .95 paga 20% + requiere certificado SENASA específico. Una diferencia así durante el despacho desencadena inspección física automática (sucedió en operación CL-2025-1142, costó 6 días extra + USD 800 en demurrage). Decisión: escalar a OPS con draft listo para el despachante, recomendar consulta al cliente para confirmar cuál es el correcto antes del arribo. Confidence 97% porque la mismatch está bien documentada — el 3% es la chance de que sea typo del PL.',
      alternatives: [
        { option: 'Asumir que BL+CI están bien (mayoría)', why_rejected: 'Riesgo de inspección física + back-charges si AFIP encuentra discrepancia' },
        { option: 'Pedir nuevo PL al cliente', why_rejected: 'Mejor pasar por el despachante primero — él sabe cuál NCM corresponde realmente a la mercadería' },
      ],
    },
  },
  {
    id: 'ad-008',
    agentName: 'READ',
    decisionType: 'BATCH_PARSE',
    confidence: 0.93,
    modelUsed: 'claude-haiku-4-5',
    latencyMs: 4500,
    tokensInput: 18000,
    tokensOutput: 960,
    minutesAgo: 52,
    wasAutoApplied: true,
    inputData: {
      label: '12 emails inbound (batch)',
      body: '5 booking confirmations, 3 BL releases, 2 status updates, 1 invoice, 1 misc.',
    },
    outputData: {
      action: '12/12 procesados · matcheados a operaciones existentes',
      summary: 'Throughput: 12 emails en 4.5s. Sin errores.',
      reasoning:
        'Batch processing de 12 emails. Cada uno: 1) detectar tipo (booking/BL/status/invoice/misc), 2) buscar match contra operaciones activas por subject parsing + thread ID + sender, 3) extraer campos relevantes, 4) update operación o crear nuevo timeline event. 11/12 matchearon directamente, 1 (misc: notificación del puerto sobre paro de remolcadores) se asignó a watch list general porque afecta múltiples operaciones de origen BUE.',
      alternatives: [],
    },
  },
  {
    id: 'ad-009',
    agentName: 'GROWTH',
    decisionType: 'DETECT_CHURN_RISK',
    confidence: 0.79,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 2100,
    tokensInput: 4200,
    tokensOutput: 280,
    minutesAgo: 68,
    wasAutoApplied: false,
    inputData: {
      label: 'Análisis de cohort: Quest Industries',
      body: 'Frecuencia histórica de cotización: cada 5.3 días. Última cotización: hace 14 días.',
    },
    outputData: {
      action: 'Surfaced a Sales como growth opportunity · sugerencia de outreach',
      summary: 'Cliente recurrente con gap inusual. Acción sugerida: ping informal por WhatsApp.',
      reasoning:
        'Quest Industries cotizaba en promedio cada 5.3 días durante los últimos 6 meses. Última cotización fue hace 14 días (2.6x el ciclo normal). Causa potencial: 1) trasladaron volumen a otro forwarder, 2) bajaron de actividad estacional, 3) están con problema operativo. Mi confidence es 79% porque solo veo un punto de data (frecuencia) — no tengo señales de salud comercial completa. Recomiendo ping informal, NO oferta — preguntar cómo va el negocio sin presionar.',
      alternatives: [
        { option: 'Mandar oferta proactiva con descuento', why_rejected: 'Sin saber por qué dejaron de cotizar, una oferta puede leer mal (desesperación o asunción incorrecta)' },
        { option: 'Esperar a que cotizen', why_rejected: 'Costo de retención es ~5x más bajo que adquisición — vale el ping' },
      ],
    },
  },
  {
    id: 'ad-010',
    agentName: 'QUOTE',
    decisionType: 'RECOMMEND_CARRIER',
    confidence: 0.96,
    modelUsed: 'claude-sonnet-4-6',
    latencyMs: 2890,
    tokensInput: 4800,
    tokensOutput: 540,
    minutesAgo: 80,
    wasAutoApplied: false,
    inputData: {
      label: 'Quote request Q-0204: Andes Trading, Hamburgo→BUE, 40HC FOB',
      body: 'Comparé rates de 4 carriers (MSC, Maersk, Hapag-Lloyd, CMA-CGM) contra contrato y spot.',
    },
    outputData: {
      action: 'Recomendación: MSC $3,800 (contrato CTR-MSC-2026-Q2)',
      summary: 'Aunque hay opciones más baratas en spot, MSC contrato gana por relación cliente + commit anual.',
      reasoning:
        'Comparé MSC $3,800 (contrato CTR-MSC-2026-Q2) vs Maersk $3,720 (spot). Aunque Maersk es $80 más barato, el contrato MSC tiene 240 TEU committed pendientes hasta Q3. Penalty por no usar: $48/TEU. Si dejo de usar MSC ahora y volumen baja consistentemente, riesgo de renegociación menos favorable en Q4. Además: cliente Andes Trading aceptó MSC en 3 de 3 últimas cotizaciones, transit predecible es importante para su SLA con sus clientes. Decisión: MSC. Confidence: 96%. Alternativas consideradas: Maersk (descartado por contrato), CMA-CGM (descartado por transshipment +5 días).',
      alternatives: [
        { option: 'Maersk spot $3,720', why_rejected: 'Penalty implícita del contrato MSC supera el ahorro inmediato' },
        { option: 'CMA-CGM spot $3,650', why_rejected: 'Transshipment Hamburg-Algeciras-BUE agrega 5 días + riesgo de descoordinación' },
        { option: 'Hapag-Lloyd contrato $4,150', why_rejected: 'Allocation del próximo mes está full; arriesgaríamos delay si no entra en este sailing' },
      ],
    },
  },
]

async function main() {
  console.log('🌱 Seeding agent decisions...\n')

  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) throw new Error(`No existe demo user (${DEMO_EMAIL})`)

  // Resolver operationCodes a operationIds
  const opCodes = decisions
    .map((d: any) => d.operationCode)
    .filter((c: string | undefined): c is string => !!c)
  const ops = await prisma.operation.findMany({
    where: { operationCode: { in: opCodes } },
    select: { id: true, operationCode: true },
  })
  const opIdByCode: Record<string, string> = {}
  ops.forEach((o) => { opIdByCode[o.operationCode] = o.id })

  for (const d of decisions) {
    const { id, operationCode, minutesAgo, ...rest } = d as any
    const data: any = {
      ...rest,
      userId: demoUser.id,
      createdAt: minsAgo(minutesAgo),
      operationId: operationCode ? opIdByCode[operationCode] || null : null,
    }
    const result = await prisma.agentDecision.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    })
    console.log(`  ✓ ${result.id} · ${result.agentName} · ${result.decisionType}`)
  }

  const total = await prisma.agentDecision.count({ where: { userId: demoUser.id } })
  console.log(`\n✅ Seed complete. Total agent decisions for ${DEMO_EMAIL}: ${total}`)
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
