/**
 * Sprint 1 — Migración a multi-tenant.
 *
 * Crea la Demo Organization, el user público demo-public@rumbo.io, y rellena
 * `organizationId` en toda la data existente del demo user.
 *
 * Es IDEMPOTENTE: corré las veces que quieras, el resultado final es el
 * mismo. Usa upsert + updateMany con filtro `organizationId: null`.
 *
 * USO:
 *   DATABASE_URL="..." npx tsx scripts/sprint1-migrate-to-multitenant.ts
 *
 * VARIABLES DE ENTORNO:
 *   DATABASE_URL              — connection string (Neon dev branch o prod)
 *   DEMO_PUBLIC_PASSWORD      — password para demo-public@rumbo.io
 *                                (default: "rumbo-demo-2026")
 *   DEMO_ORG_SLUG             — slug de la Demo Org (default: "demo-org")
 *
 * ANTES DE CORRER CONTRA PROD:
 *   1. Aplicar el schema: `DATABASE_URL=... npx prisma db push`
 *   2. Correr este script contra una BD dev primero (ver SPRINT1-PLAN.md).
 *   3. Verificar el output: todas las assertions deben pasar.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_EMAIL = 'demo@example.com'
const DEMO_PUBLIC_EMAIL = 'demo-public@rumbo.io'
const DEMO_ORG_SLUG = process.env.DEMO_ORG_SLUG || 'demo-org'
const DEMO_ORG_NAME = 'Demo Organization'
const DEMO_PUBLIC_PASSWORD = process.env.DEMO_PUBLIC_PASSWORD || 'rumbo-demo-2026'

async function main() {
  console.log('\n=== Sprint 1 multi-tenant migration ===\n')
  console.log(`Target: ${process.env.DATABASE_URL?.slice(0, 40)}...`)
  console.log(`Demo org slug: ${DEMO_ORG_SLUG}\n`)

  // ============ 1. Demo user check ============
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!demoUser) {
    throw new Error(
      `No se encontró el user ${DEMO_EMAIL}. ¿Estás apuntando a la BD correcta?`,
    )
  }
  console.log(`✓ Demo user encontrado (id ${demoUser.id})`)

  // ============ 2. Upsert Demo Organization ============
  const demoOrg = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    create: {
      slug: DEMO_ORG_SLUG,
      name: DEMO_ORG_NAME,
      isDemo: true,
    },
    update: { isDemo: true },
  })
  console.log(`✓ Demo Organization upserted (id ${demoOrg.id}, slug ${demoOrg.slug})`)

  // ============ 3. Upsert demo-public user ============
  const hashedPassword = await bcrypt.hash(DEMO_PUBLIC_PASSWORD, 10)
  const demoPublicUser = await prisma.user.upsert({
    where: { email: DEMO_PUBLIC_EMAIL },
    create: {
      email: DEMO_PUBLIC_EMAIL,
      password: hashedPassword,
      fullName: 'Demo Público',
      role: 'OPERATIONS',
      team: 'OPERATIONS',
    },
    update: {
      // Re-hashear el password en cada corrida por si la env var cambió.
      password: hashedPassword,
    },
  })
  console.log(`✓ Demo public user upserted (id ${demoPublicUser.id})`)

  // ============ 4. Memberships ============
  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: demoUser.id, organizationId: demoOrg.id },
    },
    create: {
      userId: demoUser.id,
      organizationId: demoOrg.id,
      role: 'OWNER',
      isDefault: true,
      acceptedAt: new Date(),
    },
    update: { role: 'OWNER', isDefault: true },
  })
  console.log(`✓ Membership demo@example.com → Demo Org (OWNER, default)`)

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: demoPublicUser.id,
        organizationId: demoOrg.id,
      },
    },
    create: {
      userId: demoPublicUser.id,
      organizationId: demoOrg.id,
      role: 'MEMBER',
      isDefault: true,
      acceptedAt: new Date(),
    },
    update: { role: 'MEMBER', isDefault: true },
  })
  console.log(`✓ Membership demo-public@rumbo.io → Demo Org (MEMBER, default)`)

  // ============ 5. Backfill organizationId ============
  console.log('\nBackfilling organizationId...')

  const backfills = [
    { model: 'operation', op: () =>
      prisma.operation.updateMany({
        where: { organizationId: null, userId: demoUser.id },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'task', op: () =>
      prisma.task.updateMany({
        where: { organizationId: null, userId: demoUser.id },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'quote', op: () =>
      prisma.quote.updateMany({
        where: { organizationId: null, userId: demoUser.id },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'contract', op: () =>
      prisma.contract.updateMany({
        where: { organizationId: null, userId: demoUser.id },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'agentDecision', op: () =>
      prisma.agentDecision.updateMany({
        where: { organizationId: null, userId: demoUser.id },
        data: { organizationId: demoOrg.id },
      }),
    },
  ]

  for (const { model, op } of backfills) {
    const result = await op()
    console.log(`  ✓ ${model.padEnd(15)} → ${result.count} filas`)
  }

  // Modelos sin userId directo: heredan org del operation asociado.
  // En la práctica, todas las ops de la BD pertenecen al demoUser, así que
  // todos los registros de estos modelos deben caer en demoOrg.
  const operationIds = (
    await prisma.operation.findMany({
      where: { organizationId: demoOrg.id },
      select: { id: true },
    })
  ).map((o) => o.id)

  const inheritedModels = [
    { model: 'journeyStep', op: () =>
      prisma.journeyStep.updateMany({
        where: { organizationId: null, operationId: { in: operationIds } },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'timelineEvent', op: () =>
      prisma.timelineEvent.updateMany({
        where: { organizationId: null, operationId: { in: operationIds } },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'emailDraft', op: () =>
      prisma.emailDraft.updateMany({
        where: { organizationId: null, operationId: { in: operationIds } },
        data: { organizationId: demoOrg.id },
      }),
    },
    { model: 'emailInbound', op: () =>
      prisma.emailInbound.updateMany({
        where: { organizationId: null, operationId: { in: operationIds } },
        data: { organizationId: demoOrg.id },
      }),
    },
  ]

  for (const { model, op } of inheritedModels) {
    const result = await op()
    console.log(`  ✓ ${model.padEnd(15)} → ${result.count} filas`)
  }

  // ============ 6. Assertions ============
  console.log('\nAssertions:')

  const checks: { model: string; count: () => Promise<number> }[] = [
    { model: 'operation', count: () => prisma.operation.count({ where: { organizationId: null } }) },
    { model: 'task', count: () => prisma.task.count({ where: { organizationId: null } }) },
    { model: 'quote', count: () => prisma.quote.count({ where: { organizationId: null } }) },
    { model: 'contract', count: () => prisma.contract.count({ where: { organizationId: null } }) },
    { model: 'agentDecision', count: () => prisma.agentDecision.count({ where: { organizationId: null } }) },
    { model: 'journeyStep', count: () => prisma.journeyStep.count({ where: { organizationId: null } }) },
    { model: 'timelineEvent', count: () => prisma.timelineEvent.count({ where: { organizationId: null } }) },
    { model: 'emailDraft', count: () => prisma.emailDraft.count({ where: { organizationId: null } }) },
    { model: 'emailInbound', count: () => prisma.emailInbound.count({ where: { organizationId: null } }) },
  ]

  const violations: string[] = []
  for (const { model, count } of checks) {
    const n = await count()
    if (n > 0) {
      violations.push(`  ✗ ${model}: ${n} filas todavía con organizationId NULL`)
    } else {
      console.log(`  ✓ ${model.padEnd(15)} sin orphans`)
    }
  }

  // Exactamente UNA Demo Org
  const demoOrgs = await prisma.organization.count({ where: { isDemo: true } })
  if (demoOrgs !== 1) {
    violations.push(`  ✗ isDemo=true count: ${demoOrgs} (esperado 1)`)
  } else {
    console.log(`  ✓ exactly 1 Demo Org`)
  }

  if (violations.length > 0) {
    console.error('\n❌ MIGRATION INCOMPLETE\n')
    violations.forEach((v) => console.error(v))
    console.error(
      '\nRevisar los rows con organizationId NULL — pueden pertenecer a un user',
      'distinto al demo. NO mergear PR1 a main hasta resolverlos.\n',
    )
    process.exit(1)
  }

  console.log('\n✅ MIGRATION COMPLETE\n')
  console.log(`Demo Org: id=${demoOrg.id}, slug=${demoOrg.slug}`)
  console.log(`Demo user (OWNER): ${DEMO_EMAIL}`)
  console.log(`Demo public user (MEMBER): ${DEMO_PUBLIC_EMAIL}`)
  console.log(`Password de demo-public: ${DEMO_PUBLIC_PASSWORD === 'rumbo-demo-2026' ? '"rumbo-demo-2026" (default)' : '(custom, env)'}`)
}

main()
  .catch((err) => {
    console.error('Migration error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
