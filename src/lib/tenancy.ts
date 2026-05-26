/**
 * Tenancy — Prisma extension que inyecta `organizationId` automáticamente
 * en queries de modelos tenant-scoped (ADR-005).
 *
 * Uso típico:
 *   const tx = forOrg(req.organizationId)
 *   const ops = await tx.operation.findMany()  // filtra por org automático
 *
 * Para queries de admin/seed que necesitan cruzar tenants, usar el cliente
 * base `prisma` directamente (ej. el script de backfill, panel admin futuro).
 *
 * Limitación conocida: `findUnique` con campos únicos NO recibe inyección
 * automática (el `where` requiere shape específico). Para esos casos usar
 * `requireOperationOwnedBy` o convertir a `findFirst`. Este compromiso es
 * intencional para preservar la API de Prisma.
 */
import { prisma } from './prismaClient.js'

/**
 * Lista de modelos tenant-scoped. Si agregás un modelo nuevo con
 * organizationId, agregalo acá.
 */
const TENANT_MODELS = new Set<string>([
  'operation',
  'task',
  'quote',
  'contract',
  'agentDecision',
  'emailDraft',
  'emailInbound',
  'journeyStep',
  'timelineEvent',
])

export function isTenantModel(model: string | undefined): boolean {
  if (!model) return false
  return TENANT_MODELS.has(model[0].toLowerCase() + model.slice(1))
}

export function injectWhere(args: any, organizationId: string): any {
  if (!args) args = {}
  const existing = args.where ?? {}
  // Si ya tiene organizationId explícito y NO coincide, lanzamos error
  // duro — esto evita que un caller bypassee el filtro pasando otra org.
  if (
    existing.organizationId !== undefined &&
    existing.organizationId !== null &&
    existing.organizationId !== organizationId
  ) {
    throw new Error(
      `Tenancy violation: query intentó usar organizationId=${existing.organizationId} pero el contexto es ${organizationId}`,
    )
  }
  return { ...args, where: { ...existing, organizationId } }
}

export function injectData(args: any, organizationId: string): any {
  if (!args) args = {}
  const existing = args.data ?? {}
  if (Array.isArray(existing)) {
    // createMany
    return {
      ...args,
      data: existing.map((row: any) => ({ organizationId, ...row })),
    }
  }
  if (
    existing.organizationId !== undefined &&
    existing.organizationId !== null &&
    existing.organizationId !== organizationId
  ) {
    throw new Error(
      `Tenancy violation: data trae organizationId=${existing.organizationId} pero el contexto es ${organizationId}`,
    )
  }
  return { ...args, data: { ...existing, organizationId } }
}

/**
 * Devuelve un cliente Prisma extendido que inyecta organizationId en queries
 * de modelos tenant-scoped. Operaciones soportadas:
 *  - findMany, findFirst, count, aggregate, groupBy → inyecta en `where`
 *  - create, createMany → inyecta en `data`
 *  - updateMany, deleteMany → inyecta en `where`
 *  - findUnique, update, delete (by unique field) → NO inyecta (limitación
 *    de Prisma extensions). Usar `requireOperationOwnedBy` para esos casos.
 */
export function forOrg(organizationId: string) {
  if (!organizationId) {
    throw new Error('forOrg() requiere un organizationId no vacío')
  }

  return prisma.$extends({
    name: 'tenancy',
    query: {
      $allModels: {
        async findMany({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async findFirst({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async findFirstOrThrow({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async count({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async aggregate({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async groupBy({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async create({ args, query, model }) {
          if (isTenantModel(model)) args = injectData(args, organizationId)
          return query(args)
        },
        async createMany({ args, query, model }) {
          if (isTenantModel(model)) args = injectData(args, organizationId)
          return query(args)
        },
        async updateMany({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
        async deleteMany({ args, query, model }) {
          if (isTenantModel(model)) args = injectWhere(args, organizationId)
          return query(args)
        },
      },
    },
  })
}
