// Seed de 8 contratos con carriers.
// Idempotente vía upsert por contractNumber.
//
// Correr con:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-contracts.ts

import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está seteada.')
  process.exit(1)
}

const prisma = new PrismaClient()
const DEMO_EMAIL = 'demo@example.com'

const d = (iso: string) => new Date(iso + 'T00:00:00Z')

const contracts = [
  {
    contractNumber: 'CTR-MSC-2026-Q2',
    carrier: 'MSC',
    lane: 'Hamburgo → Buenos Aires',
    originPort: 'Hamburgo',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40HC',
    rateUsd: 3800,
    volumeCommittedTeu: 500,
    volumeUsedTeu: 240,
    validFrom: d('2026-04-01'),
    validUntil: d('2026-12-31'),
    status: 'ACTIVE',
    notes: 'Contrato Q2 2026 con MSC para lane Hamburgo-BUE en 40HC. Volumen committed 500 TEU, llevamos 240 (48%). Andes Trading es el mayor user.',
  },
  {
    contractNumber: 'CTR-MAEU-2026-H1',
    carrier: 'Maersk',
    lane: 'Shanghai → Buenos Aires',
    originPort: 'Shanghai',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40HC',
    rateUsd: 4200,
    volumeCommittedTeu: 1000,
    volumeUsedTeu: 850,
    validFrom: d('2026-01-01'),
    validUntil: d('2026-06-15'),
    status: 'EXPIRING_SOON',
    notes: 'Contrato H1 2026 con Maersk. Vence en menos de 30 días. Iniciar renegociación. Performance excelente: 92% on-time.',
  },
  {
    contractNumber: 'CTR-HL-2026-H1',
    carrier: 'Hapag-Lloyd',
    lane: 'Valencia → Buenos Aires',
    originPort: 'Valencia',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40RF',
    rateUsd: 5800,
    volumeCommittedTeu: 200,
    volumeUsedTeu: 40,
    validFrom: d('2026-01-01'),
    validUntil: d('2026-06-30'),
    status: 'UNDERUTILIZED',
    notes: 'Contrato refrigerado con HL. Usamos 40/200 TEU (20%). Riesgo de penalty por bajo volumen al vencer. Importadora del Sur es el único user activo.',
  },
  {
    contractNumber: 'CTR-CMA-2026-Q1',
    carrier: 'CMA-CGM',
    lane: 'Houston → Buenos Aires',
    originPort: 'Houston',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40HC',
    rateUsd: 3100,
    volumeCommittedTeu: 300,
    volumeUsedTeu: 290,
    validFrom: d('2026-01-01'),
    validUntil: d('2026-12-31'),
    status: 'ACTIVE',
    notes: 'Lane USA-BUE. Volumen casi al 97% — pedir extensión de cupo o evitar overage.',
  },
  {
    contractNumber: 'CTR-COSCO-2026-Y',
    carrier: 'COSCO',
    lane: 'Shenzhen → Buenos Aires',
    originPort: 'Shenzhen',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40HC',
    rateUsd: 3950,
    volumeCommittedTeu: 400,
    volumeUsedTeu: 150,
    validFrom: d('2026-01-01'),
    validUntil: d('2026-12-31'),
    status: 'ACTIVE',
    notes: 'Contrato anual con COSCO. Tracking de utilización al día.',
  },
  {
    contractNumber: 'CTR-HL-2025-H2',
    carrier: 'Hapag-Lloyd',
    lane: 'Hamburgo → Santos',
    originPort: 'Hamburgo',
    destinationPort: 'Santos',
    containerType: 'FCL_40HC',
    rateUsd: 3450,
    volumeCommittedTeu: 150,
    volumeUsedTeu: 148,
    validFrom: d('2025-07-01'),
    validUntil: d('2025-12-31'),
    status: 'EXPIRED',
    notes: 'Contrato anterior. No fue renovado porque la lane Hamburg-Santos se discontinuó en Q1 2026.',
  },
  {
    contractNumber: 'CTR-MAEU-2026-Q1',
    carrier: 'Maersk',
    lane: 'Rotterdam → Buenos Aires',
    originPort: 'Rotterdam',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_20GP',
    rateUsd: 2400,
    volumeCommittedTeu: 250,
    volumeUsedTeu: 200,
    validFrom: d('2026-01-01'),
    validUntil: d('2026-09-30'),
    status: 'ACTIVE',
    notes: 'Lane Rotterdam-BUE en 20GP. Utilización 80%.',
  },
  {
    contractNumber: 'CTR-MSC-2026-Q2-RF',
    carrier: 'MSC',
    lane: 'Algeciras → Buenos Aires',
    originPort: 'Algeciras',
    destinationPort: 'Buenos Aires',
    containerType: 'FCL_40RF',
    rateUsd: 6100,
    volumeCommittedTeu: 150,
    volumeUsedTeu: 75,
    validFrom: d('2026-04-01'),
    validUntil: d('2026-12-31'),
    status: 'ACTIVE',
    notes: 'Contrato refrigerado MSC para lane Algeciras-BUE. Volumen al 50%.',
  },
]

async function main() {
  console.log('🌱 Seeding contracts...\n')

  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) throw new Error(`No existe demo user (${DEMO_EMAIL})`)

  for (const c of contracts) {
    const data: any = { ...c, userId: demoUser.id }
    const result = await prisma.contract.upsert({
      where: { contractNumber: c.contractNumber },
      update: data,
      create: data,
    })
    console.log(`  ✓ ${result.contractNumber} · ${result.carrier} · ${result.status}`)
  }

  const total = await prisma.contract.count({ where: { userId: demoUser.id } })
  console.log(`\n✅ Seed complete. Total contracts: ${total}`)
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
