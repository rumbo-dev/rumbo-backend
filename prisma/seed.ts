import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// ============================================================================
// GUARD: este seed hace deleteMany sobre Operation/Task/User/etc.
// Bloqueado en producción para evitar pérdida de las 4 ops curadas
// (OP-0142, 0173, 0184, 23714) y resto de la BD.
// Para correr local: NODE_ENV=development npm run db:seed
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  console.error('❌ prisma/seed.ts blocked in production — would wipe all data.')
  console.error('   This script does deleteMany on User/Operation/Task/JourneyStep/TimelineEvent.')
  console.error('   If you really need to reseed prod (you almost certainly do not), remove this guard.')
  process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
  // Limpiar datos existentes
  await prisma.timelineEvent.deleteMany({})
  await prisma.journeyStep.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.operation.deleteMany({})
  await prisma.user.deleteMany({})

  // Crear usuario demo
  const password = await bcrypt.hash('demo123', 10)
  const user = await prisma.user.create({
    data: {
      email: 'demo@example.com',
      password,
      fullName: 'Demo User',
    },
  })

  // Crear operaciones de ejemplo
  const operations = await Promise.all([
    prisma.operation.create({
      data: {
        operationCode: 'OP-2024-001',
        containerNumber: 'CONT-LAB-001',
        userId: user.id,
        originPort: 'Shanghai, China',
        originCountry: 'CN',
        destinationPort: 'Buenos Aires, Argentina',
        destinationCountry: 'AR',
        clientName: 'Lab Biotech SA',
        clientEmail: 'contact@labiotech.com',
        weightKg: 18000,
        cbm: 120,
        incoterm: 'FOB',
        shippingLine: 'Maersk',
        status: 'IN_TRANSIT',
        currentStage: 'En océano',
        costEstimate: 45000,
        priority: 'HIGH',
        eta: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      },
      include: { journeySteps: true },
    }),
    prisma.operation.create({
      data: {
        operationCode: 'OP-2024-002',
        containerNumber: 'CONT-QUIM-002',
        userId: user.id,
        originPort: 'Rotterdam, Netherlands',
        originCountry: 'NL',
        destinationPort: 'Buenos Aires, Argentina',
        destinationCountry: 'AR',
        clientName: 'Química del Plata',
        clientEmail: 'shipping@quimica.com',
        weightKg: 22000,
        cbm: 140,
        incoterm: 'CIF',
        shippingLine: 'MSC',
        status: 'PENDING',
        currentStage: 'Documentación',
        costEstimate: 52000,
        priority: 'NORMAL',
      },
      include: { journeySteps: true },
    }),
  ])

  // Crear journey steps y tasks para la primera operación
  for (const operation of operations) {
    // Journey steps
    const steps = [
      { stepNumber: 1, stepName: 'Documentación', status: 'COMPLETED' },
      { stepNumber: 2, stepName: 'Booking', status: 'COMPLETED' },
      { stepNumber: 3, stepName: 'En océano', status: 'CURRENT' },
      { stepNumber: 4, stepName: 'En puerto destino', status: 'PENDING' },
      { stepNumber: 5, stepName: 'Aduanaje', status: 'PENDING' },
      { stepNumber: 6, stepName: 'Entrega', status: 'PENDING' },
    ]

    for (const step of steps) {
      await prisma.journeyStep.create({
        data: {
          ...step,
          operationId: operation.id,
        },
      })
    }

    // Tasks sugeridas por IA
    await prisma.task.createMany({
      data: [
        {
          operationId: operation.id,
          userId: user.id,
          title: 'Validar documentación aduanal',
          description: 'Revisar BL y factura comercial antes de arribo',
          priority: 'HIGH',
          status: 'PENDING',
          createdByAi: true,
          aiConfidence: 0.92,
          estimatedCost: 2500,
        },
        {
          operationId: operation.id,
          userId: user.id,
          title: 'Coordinar desembarque en puerto',
          description: 'Contactar terminales portuarias para confirmar fecha',
          priority: 'HIGH',
          status: 'PENDING',
          createdByAi: true,
          aiConfidence: 0.88,
          estimatedCost: 3500,
        },
        {
          operationId: operation.id,
          userId: user.id,
          title: 'Preparar trámite de importación',
          description: 'Completar formularios DUCA e información aduanal',
          priority: 'NORMAL',
          status: 'PENDING',
          createdByAi: true,
          aiConfidence: 0.85,
          estimatedCost: 1800,
        },
      ],
    })

    // Timeline events
    await prisma.timelineEvent.createMany({
      data: [
        {
          operationId: operation.id,
          title: 'Booking Confirmado',
          eventType: 'booking_confirmed',
          timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        },
        {
          operationId: operation.id,
          title: 'Recepción en puerto origen',
          eventType: 'port_reception',
          timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          location: 'Shanghai Port',
        },
        {
          operationId: operation.id,
          title: 'Partida del buque',
          eventType: 'vessel_departure',
          timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          location: 'Shanghai Port',
        },
      ],
    })
  }

  console.log('✓ Database seeded successfully')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
