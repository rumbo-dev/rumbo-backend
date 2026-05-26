/**
 * Auth — middlewares y helpers compartidos para Sprint 1 multi-tenant.
 *
 * - `JWT_SECRET` requerido por env var (fail-fast si falta — fix de la deuda
 *   crítica documentada en LEARNINGS.md "JWT_SECRET con fallback inseguro").
 * - `authMiddleware` exige token. Si el token no trae organizationId
 *   (token viejo, compat layer), resuelve la org default del user via
 *   Membership.
 * - `optionalAuthMiddleware` es el compat layer transitorio para PR1:
 *   si no hay token, resuelve la Demo Organization pública. Se quita en PR3.
 * - `requireOperationOwnedBy` reemplaza el patrón frágil "findUnique luego
 *   comparar userId" (LEARNINGS.md, "Patrón frágil fetch sin filtro").
 */
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from './prismaClient.js'

const JWT_SECRET_ENV = process.env.JWT_SECRET
if (!JWT_SECRET_ENV) {
  throw new Error(
    'JWT_SECRET env var is required. Refusing to boot with insecure fallback. ' +
      'Set JWT_SECRET in Railway/local .env before starting the server.',
  )
}
// Cast a string una vez verificado. Cualquier uso posterior es seguro.
export const JWT_SECRET: string = JWT_SECRET_ENV

export interface AuthRequest extends Request {
  userId?: string
  organizationId?: string
  membershipRole?: string
}

interface JwtPayload {
  userId: string
  organizationId?: string
  membershipId?: string
}

/**
 * Resuelve organizationId desde un token. Si el token ya lo trae, lo devuelve.
 * Si no (compat layer para tokens viejos pre-Sprint-1), busca el Membership
 * default del user. Si el user no tiene membership default, devuelve el
 * primer Membership disponible.
 */
async function resolveOrgFromUser(userId: string): Promise<{ organizationId: string; role: string } | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    take: 1,
  })
  if (memberships.length === 0) return null
  return {
    organizationId: memberships[0].organizationId,
    role: memberships[0].role,
  }
}

/**
 * Resuelve la Demo Organization pública (compat layer para /today, /quotes,
 * /contracts sin token durante PR1). Devuelve null si no existe (la app
 * todavía no migró).
 */
async function resolvePublicDemoOrg(): Promise<{ organizationId: string } | null> {
  const demoOrg = await prisma.organization.findFirst({
    where: { isDemo: true },
    select: { id: true },
  })
  if (!demoOrg) return null
  return { organizationId: demoOrg.id }
}

/**
 * authMiddleware — exige token válido. Setea req.userId, req.organizationId,
 * req.membershipRole. Si el token no trae organizationId, lo deriva del
 * Membership default del user.
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token' })

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.userId = decoded.userId

    if (decoded.organizationId) {
      req.organizationId = decoded.organizationId
      // Resolver el role del Membership para autorización fina
      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: decoded.userId,
            organizationId: decoded.organizationId,
          },
        },
        select: { role: true },
      })
      if (membership) req.membershipRole = membership.role
    } else {
      // Compat: token viejo (solo userId). Resolver org default del user.
      const resolved = await resolveOrgFromUser(decoded.userId)
      if (resolved) {
        req.organizationId = resolved.organizationId
        req.membershipRole = resolved.role
      }
    }

    if (!req.organizationId) {
      // El user no tiene ningún Membership — esto NO debería ocurrir en
      // estado consistente post-migración. Bloqueamos defensivamente.
      return res.status(403).json({
        error: 'User has no organization membership',
      })
    }

    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/**
 * optionalAuthMiddleware — compat layer transitorio (PR1). Si hay token,
 * se comporta como authMiddleware. Si no hay token, resuelve la Demo Org
 * pública. PR3 quita esto: las rutas requerirán auth.
 *
 * Usar SOLO en /today, /quotes, /contracts mientras el frontend viejo
 * todavía no manda Authorization header.
 */
export const optionalAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    return authMiddleware(req, res, next)
  }
  // Sin token → fallback a Demo Org pública
  const demo = await resolvePublicDemoOrg()
  if (!demo) {
    return res.status(503).json({
      error: 'Demo Organization not seeded. Run sprint1-migrate-to-multitenant.ts',
    })
  }
  req.organizationId = demo.organizationId
  next()
}

/**
 * requireOperationOwnedBy — reemplaza el patrón frágil
 *   const op = await prisma.operation.findUnique({ where: { id }})
 *   if (op.userId !== req.userId) return 404
 *
 * por:
 *   const op = await requireOperationOwnedBy(req.organizationId!, opIdOrCode)
 *
 * Acepta UUID o operationCode (mismo regex que usa GET /api/operations/:id).
 * Devuelve null si la op no existe o pertenece a otra org. NUNCA hace un
 * find sin filtro de organizationId.
 */
export async function requireOperationOwnedBy(
  organizationId: string,
  idOrCode: string,
) {
  const isOperationCode = /^OP-/i.test(idOrCode)
  return prisma.operation.findFirst({
    where: isOperationCode
      ? { operationCode: idOrCode, organizationId }
      : { id: idOrCode, organizationId },
  })
}

/**
 * requireDraftOwnedBy — análogo a requireOperationOwnedBy para EmailDraft.
 */
export async function requireDraftOwnedBy(organizationId: string, draftId: string) {
  return prisma.emailDraft.findFirst({
    where: { id: draftId, organizationId },
    include: { operation: true },
  })
}

/**
 * requireTaskOwnedBy — análogo para Task.
 */
export async function requireTaskOwnedBy(organizationId: string, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, organizationId },
    include: { operation: true },
  })
}

/**
 * signToken — emite un JWT con userId + organizationId (+ membershipId opcional).
 * Usar siempre este helper en lugar de `jwt.sign` directo para asegurar el
 * shape consistente.
 */
export function signToken(payload: {
  userId: string
  organizationId: string
  membershipId?: string
}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
}
