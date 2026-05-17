// Fix de OP-0184: timeline (BL del agente en origen, discrepancia mismo día)
// y multa breakdown más completa.
// Idempotente: borra timelineEvents existentes y los reemplaza por los nuevos.
//
// Correr con:
//   DATABASE_URL="postgresql://..." npx tsx scripts/fix-op-0184.ts

import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está seteada.')
  process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Fix OP-0184...\n')

  const op = await prisma.operation.findFirst({
    where: { operationCode: 'OP-0184' },
    select: { id: true, operationCode: true, criticalImpact: true, exposureUsd: true },
  })

  if (!op) {
    throw new Error('OP-0184 no existe en la BD')
  }

  console.log('Antes:', op)

  // 1. Update operation
  const updated = await prisma.operation.update({
    where: { id: op.id },
    data: {
      criticalImpact:
        'Multa potencial: $930 USD (Amendment Fee al carrier $300 + Multa AFIP declaración inexacta $450 + Almacenaje extra terminal $180)',
      exposureUsd: 930,
    },
    select: { criticalImpact: true, exposureUsd: true },
  })
  console.log('\nOperation actualizada:', updated)

  // 2. Delete existing timelineEvents
  const deleted = await prisma.timelineEvent.deleteMany({
    where: { operationId: op.id },
  })
  console.log(`\nTimeline events borrados: ${deleted.count}`)

  // 3. Create new timelineEvents
  const events = [
    {
      title: 'Operación creada',
      eventType: 'OPERATION_CREATED',
      source: 'MANUAL',
      sourceTeam: 'SALES',
      timestamp: new Date('2026-04-08T10:00:00Z'),
    },
    {
      title: 'Booking confirmado por Hapag-Lloyd',
      eventType: 'EMAIL_RECEIVED',
      source: 'EMAIL',
      timestamp: new Date('2026-04-10T12:00:00Z'),
    },
    {
      title: 'Cliente envió Packing List + Commercial Invoice',
      eventType: 'DOCUMENT_RECEIVED',
      source: 'EMAIL',
      sourceTeam: 'CUSTOMER',
      timestamp: new Date('2026-04-14T11:20:00Z'),
    },
    {
      title: 'BL recibido del agente en origen (Schenker Shanghai)',
      eventType: 'DOCUMENT_RECEIVED',
      source: 'EMAIL',
      sourceTeam: 'EXTERNAL',
      timestamp: new Date('2026-04-16T09:30:00Z'),
    },
    {
      title: '⚠ Discrepancia detectada (350 kg entre BL y PL/Invoice)',
      eventType: 'DISPUTE_OPENED',
      source: 'AI_INTAKE',
      timestamp: new Date('2026-04-16T09:45:00Z'),
    },
  ]

  for (const e of events) {
    await prisma.timelineEvent.create({
      data: { ...e, operationId: op.id },
    })
    console.log(`  ✓ ${e.timestamp.toISOString().slice(0, 10)} · ${e.title}`)
  }

  const total = await prisma.timelineEvent.count({ where: { operationId: op.id } })
  console.log(`\n✅ Fix complete. Total timeline events de OP-0184: ${total}`)
}

main()
  .catch((e) => { console.error('❌ Fix failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
