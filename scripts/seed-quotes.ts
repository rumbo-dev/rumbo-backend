// Seed de 5 quote requests para el feature /quotes.
// Idempotente vía upsert por quoteCode.
// Lee DATABASE_URL del entorno — no hardcodear URLs.
//
// Correr con:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-quotes.ts

import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está seteada.')
  console.error('   Correr como:')
  console.error('   DATABASE_URL="postgresql://..." npx tsx scripts/seed-quotes.ts')
  process.exit(1)
}

const prisma = new PrismaClient()
const DEMO_EMAIL = 'demo@example.com'

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
const hoursMinutesAgo = (h: number, m: number) =>
  new Date(now.getTime() - (h * 60 + m) * 60 * 1000)
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

const quoteSpecs = [
  // ============ Q-0203 — Quest Industries (WhatsApp, INCOMPLETO) ============
  {
    quoteCode: 'Q-0203',
    clientName: 'Quest Industries',
    clientEmail: 'mariano@questind.com.ar',
    isNewClient: false,
    channel: 'WHATSAPP',
    originalMessage:
      'Hola Mariana, necesito cotizar urgente 2x40 HC de Shanghai a BS AS. Te paso después los demás detalles.',
    receivedAt: minutesAgo(15),
    status: 'WAITING_FOR_DATA',

    origin: 'Shanghai',
    originCountry: 'CN',
    destination: 'Buenos Aires',
    destinationCountry: 'AR',
    containerType: 'FCL_40HC',
    containerCount: 2,

    aiParsedFields: {
      origin: 1.0,
      destination: 1.0,
      containerType: 1.0,
      containerCount: 1.0,
    },
    aiParsingConfidence: 0.65,
    missingFields: ['product', 'ncmCode', 'weightKg', 'cbm', 'incoterm', 'readyDate'],

    draftSubject: null,
    draftBody: `Hola Mariano! Anotamos el pedido. Antes de armarte la cotización necesito 6 datos:

1. Producto a transportar
2. NCM
3. Peso aproximado (kg)
4. Volumen aproximado (m³)
5. Incoterm (FOB / CIF / EXW...)
6. Fecha estimada de ready

Apenas me los pases, te paso opciones de carriers (tenemos contrato MSC con buenos rates Shanghai-BUE) en menos de 10 min.

Saludos,
Agustín — Rumbo Operaciones`,
    draftAiConfidence: 0.94,
  },

  // ============ Q-0204 — Andes Trading (Email, COMPLETO — DEMO STAR) ============
  {
    quoteCode: 'Q-0204',
    clientName: 'Andes Trading SA',
    clientEmail: 'jorge@andestrading.com.ar',
    isNewClient: false,
    channel: 'EMAIL',
    originalMessage: `Hola Mariana, espero que andés bien.

Te escribo para pedirte cotización de un cargo desde Hamburgo a Buenos Aires. Son repuestos automotores (NCM 8708.30.90), un 40' HC, peso bruto aprox 18.400 kg y 32 m³. Incoterm FOB, ready el 25 de mayo.

Pediría que sea predecible en transit más que un poco más barato (ya sabés cómo manejamos planning). Si tenés cupo con MSC, sería ideal seguir con ellos.

Quedamos en contacto, cualquier cosa me marcás.

Jorge — Andes Trading`,
    receivedAt: hoursMinutesAgo(1, 20),
    status: 'QUOTED_DRAFT',

    origin: 'Hamburgo',
    originCountry: 'DE',
    destination: 'Buenos Aires',
    destinationCountry: 'AR',
    product: 'Repuestos automotores',
    ncmCode: '8708.30.90',
    containerType: 'FCL_40HC',
    containerCount: 1,
    weightKg: 18400,
    cbm: 32,
    incoterm: 'FOB',
    readyDate: new Date('2026-05-25T00:00:00Z'),

    aiParsedFields: {
      origin: 1.0,
      destination: 1.0,
      product: 0.98,
      ncmCode: 1.0,
      containerType: 1.0,
      containerCount: 1.0,
      weightKg: 0.97,
      cbm: 0.96,
      incoterm: 1.0,
      readyDate: 0.99,
    },
    aiParsingConfidence: 0.98,
    missingFields: [],

    recommendedCarrier: 'MSC',
    recommendedReason: `Recomendamos MSC a $3,800 USD aunque hay opciones más baratas en spot ($150 menos con CMA-CGM). Razones: (1) Volumen committed — te quedan 240 TEU del contrato anual MSC. Mover este cargo en contrato preserva la negociación de Q3. (2) Reliability — 87% on-time es aceptable y MSC nunca falló con Andes Trading (3 operaciones cerradas exitosamente este año). (3) Transit — 27 días dentro de lo que Andes maneja en su planificación; CMA-CGM es 32 días con transshipment y riesgo agregado. (4) Relación cliente — Andes prefiere transit predecible vs ahorro marginal (confirmado en últimas 3 cotizaciones).`,
    carrierComparison: [
      {
        name: 'MSC',
        isRecommended: true,
        via: 'direct',
        transitDays: 27,
        sailingsPerWeek: 2,
        onTimePct12m: 87,
        contractRate: 3800,
        contractRef: 'CTR-MSC-2026-Q2',
        spotRate: 3920,
        yourFinalCost: 3800,
        status: '240 TEU committed remaining',
      },
      {
        name: 'Maersk',
        isRecommended: false,
        via: 'direct',
        transitDays: 25,
        sailingsPerWeek: 3,
        onTimePct12m: 92,
        contractRate: null,
        contractRef: null,
        spotRate: 3720,
        yourFinalCost: 3720,
        status: 'spot available',
      },
      {
        name: 'Hapag-Lloyd',
        isRecommended: false,
        via: 'direct',
        transitDays: 26,
        sailingsPerWeek: 2,
        onTimePct12m: 89,
        contractRate: 4150,
        contractRef: 'CTR-HL-2026-H1',
        spotRate: 4200,
        yourFinalCost: 4150,
        status: 'next month allocation full',
      },
      {
        name: 'CMA-CGM',
        isRecommended: false,
        via: 'transshipment',
        viaDetail: 'Hamburg → Algeciras → BUE',
        transitDays: 32,
        sailingsPerWeek: 1,
        onTimePct12m: 78,
        contractRate: null,
        contractRef: null,
        spotRate: 3650,
        yourFinalCost: 3650,
        status: 'spot only',
      },
    ],
    markupPercent: 12,
    markupAmount: 456,
    baseCarrierCost: 3800,
    surchargesTotal: 625,
    surchargesBreakdown: [
      { name: 'BAF (Bunker Adjustment Factor)', amount: 180, description: null },
      { name: 'CAF (Currency Adjustment Factor)', amount: 0, description: 'estable' },
      { name: 'THC origen Hamburg', amount: 145, description: null },
      { name: 'THC destino BUE', amount: 190, description: null },
      { name: 'Documentation fee', amount: 85, description: null },
      { name: 'ISPS', amount: 25, description: null },
    ],
    quoteFinalUsd: 4881,
    quoteValidDays: 7,

    draftSubject:
      "Cotización Q-0204 — Hamburgo → Buenos Aires (1×40'HC) — Vigencia 7 días",
    draftBody: `Hola Jorge,

Tenemos lista la cotización para tu carga de repuestos automotores Hamburgo → Buenos Aires:

**Detalles del shipment:**
- 1×40' HC · 18.400 kg · 32 CBM
- Origen: Hamburgo · Destino: Buenos Aires
- ETD estimado: 1 jun · ETA estimado: 28 jun
- Transit: 27 días (servicio directo)
- Incoterm: FOB

**Pricing:**
- Flete marítimo: USD 3.800
- Recargos (BAF, THC origen/destino, doc fee, ISPS): USD 625
- Servicios de gestión Rumbo: incluidos
- **Total: USD 4.881**

Cotización válida 7 días. Te adjunto el detalle en PDF.

Cualquier consulta o ajuste, escribime.

Saludos,
Agustín
Rumbo Operaciones`,
    draftAiConfidence: 0.94,

    clientHistoryWinRate: 0.78,
    clientPreferredCarrier: 'MSC',
    clientAverageMarkup: 11.5,
  },

  // ============ Q-0205 — DistriPlast (Web form, cliente NUEVO) ============
  {
    quoteCode: 'Q-0205',
    clientName: 'DistriPlast SA',
    clientEmail: 'contacto@distriplast.com.ar',
    isNewClient: true,
    channel: 'WEB_FORM',
    originalMessage:
      'Solicitud automática desde formulario web del sitio rumbo.com/cotizar',
    receivedAt: hoursAgo(3),
    status: 'READY_TO_QUOTE',

    origin: 'Houston',
    originCountry: 'US',
    destination: 'Buenos Aires',
    destinationCountry: 'AR',
    product: 'Plásticos industriales',
    ncmCode: '3923.10.10',
    containerType: 'FCL_40GP',
    containerCount: 1,
    weightKg: 16200,
    incoterm: 'FOB',

    aiParsedFields: {
      origin: 1.0,
      destination: 1.0,
      product: 0.99,
      ncmCode: 1.0,
      containerType: 1.0,
      containerCount: 1.0,
      weightKg: 1.0,
      incoterm: 1.0,
    },
    aiParsingConfidence: 0.99,
    missingFields: [],
  },

  // ============ Q-0206 — Importadora del Sur (Email, RF refrigerado) ============
  {
    quoteCode: 'Q-0206',
    clientName: 'Importadora del Sur SA',
    clientEmail: 'carlos@importadoradelsur.com.ar',
    isNewClient: false,
    channel: 'EMAIL',
    originalMessage: `Hola Mariana, cómo va.

Necesito cotizar 4 contenedores 40' refrigerados Valencia → Buenos Aires, productos perecederos a -18°C continuos. Total estimado 65.000 kg.

Incoterm CIF. Igual que las últimas, te pido que prioricemos integridad de cadena de frío sobre precio — si MSC tiene cupo en su servicio West Med Express me cierra.

Ready a confirmar, te aviso en cuanto el proveedor me confirme fechas (estimo 2-3 semanas vista).

Abrazo,
Carlos — Importadora del Sur`,
    receivedAt: hoursAgo(5),
    status: 'READY_TO_QUOTE',

    origin: 'Valencia',
    originCountry: 'ES',
    destination: 'Buenos Aires',
    destinationCountry: 'AR',
    product: 'Productos perecederos (-18°C)',
    containerType: 'FCL_40RF',
    containerCount: 4,
    weightKg: 65000,
    incoterm: 'CIF',
    specialHandling: 'Refrigerados -18°C continuos',

    aiParsedFields: {
      origin: 1.0,
      destination: 1.0,
      product: 0.96,
      containerType: 1.0,
      containerCount: 1.0,
      weightKg: 0.95,
      incoterm: 1.0,
      specialHandling: 1.0,
    },
    aiParsingConfidence: 0.96,
    missingFields: ['readyDate'],

    clientPreferredCarrier: 'MSC',
  },

  // ============ Q-0207 — Quest Industries (WhatsApp, YA COTIZADA AWAITING) ============
  {
    quoteCode: 'Q-0207',
    clientName: 'Quest Industries',
    clientEmail: 'mariano@questind.com.ar',
    isNewClient: false,
    channel: 'WHATSAPP',
    originalMessage: `Hola Mariana, te paso los datos que te debía:
- Producto: filtros automotores
- NCM: 8421.23.00
- Peso: 22.500 kg / 58 m³
- Incoterm: FOB
- Ready: 18/05

Necesito que esté en BUE para fin de mayo. Avisame.

Mariano — Quest Industries`,
    receivedAt: daysAgo(2),
    status: 'SENT_AWAITING_CLIENT',

    origin: 'Shanghai',
    originCountry: 'CN',
    destination: 'Buenos Aires',
    destinationCountry: 'AR',
    product: 'Filtros automotores',
    ncmCode: '8421.23.00',
    containerType: 'FCL_40HC',
    containerCount: 2,
    weightKg: 22500,
    cbm: 58,
    incoterm: 'FOB',
    readyDate: new Date('2026-05-18T00:00:00Z'),

    aiParsedFields: {
      origin: 1.0,
      destination: 1.0,
      product: 1.0,
      ncmCode: 1.0,
      containerType: 1.0,
      containerCount: 1.0,
      weightKg: 1.0,
      cbm: 1.0,
      incoterm: 1.0,
      readyDate: 1.0,
    },
    aiParsingConfidence: 0.99,
    missingFields: [],

    recommendedCarrier: 'Maersk',
    recommendedReason:
      'Maersk con mejor on-time (92%) y transit de 25 días directo. Spot disponible.',
    markupPercent: 12,
    markupAmount: 438,
    baseCarrierCost: 3650,
    surchargesTotal: 192,
    quoteFinalUsd: 4280,
    quoteValidDays: 7,

    draftSubject:
      "Cotización Q-0207 — Shanghai → Buenos Aires (2×40'HC) — Vigencia 7 días",
    draftBody: `Hola Mariano,

Te paso la cotización para el cargo Shanghai → Buenos Aires (2×40'HC, filtros automotores, NCM 8421.23.00, 22.500 kg / 58 m³, FOB, ready 18/05).

Cotización final: USD 4.280
Vigencia: 7 días corridos

Recomiendo Maersk (spot, transit 25d, on-time 92%). Directo sin transbordo.

Avisame si OK para reservar booking.

Agustín — Rumbo Operaciones`,
    draftAiConfidence: 0.92,

    clientHistoryWinRate: 0.65,
    clientPreferredCarrier: 'Maersk',
    clientAverageMarkup: 12.0,
  },
] as const

async function main() {
  console.log('🌱 Seeding quote requests...\n')

  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) {
    throw new Error(
      `No existe el demo user (${DEMO_EMAIL}). Seedear primero el user demo.`,
    )
  }
  console.log(`✓ Demo user: ${demoUser.email} (${demoUser.id})`)

  // Sprint 1 multi-tenant: cada quote también necesita organizationId.
  // Aceptamos --orgSlug=<slug> en argv; si no, default "demo-org".
  const orgSlug =
    process.argv.find((a) => a.startsWith('--orgSlug='))?.split('=')[1] ?? 'demo-org'
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
  if (!org) {
    throw new Error(
      `No existe la Organization slug=${orgSlug}. Correr primero scripts/sprint1-migrate-to-multitenant.ts`,
    )
  }
  console.log(`✓ Organization: ${org.name} (slug ${org.slug}, id ${org.id})\n`)

  for (const spec of quoteSpecs) {
    const { quoteCode, ...rest } = spec
    const data: any = { ...rest, userId: demoUser.id, organizationId: org.id }
    const result = await prisma.quote.upsert({
      where: { quoteCode },
      update: data,
      create: { quoteCode, ...data },
    })
    console.log(`  ✓ ${result.quoteCode} — ${result.clientName} (${result.status})`)
  }

  const total = await prisma.quote.count({ where: { organizationId: org.id } })
  console.log(`\n✅ Seed complete. Total quotes para ${org.slug}: ${total}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
