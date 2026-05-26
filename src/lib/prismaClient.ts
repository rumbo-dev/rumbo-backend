/**
 * Singleton PrismaClient para reemplazar las instancias dispersas a lo largo
 * del código (server.ts + cada route file crea su propio cliente).
 *
 * Mantener el cliente base sin extensiones de tenancy — esas se aplican vía
 * `forOrg(organizationId)` en tenancy.ts. Esto permite tener un escape hatch
 * explícito para queries de admin/seed que necesitan cruzar tenants.
 */
import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __rumboPrisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__rumboPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__rumboPrisma = prisma
}
