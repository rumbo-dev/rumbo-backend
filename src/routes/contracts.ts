import { Router, Response } from 'express'
import { prisma } from '../lib/prismaClient.js'
import { optionalAuthMiddleware, type AuthRequest } from '../lib/auth.js'

const router = Router()
router.use(optionalAuthMiddleware) // compat layer PR1 — ver quotes.ts

// ============ GET /api/contracts ============
// Filtros opcionales: ?status=X, ?carrier=Y
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const where: any = { organizationId: req.organizationId }
    const { status, carrier } = req.query
    if (typeof status === 'string' && status.length > 0) where.status = status
    if (typeof carrier === 'string' && carrier.length > 0) where.carrier = carrier

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: [{ status: 'asc' }, { validUntil: 'asc' }],
    })

    res.json(contracts)
  } catch (error) {
    console.error('GET /api/contracts error:', error)
    res.status(500).json({ error: 'Failed to fetch contracts' })
  }
})

// ============ GET /api/contracts/:id ============
// Acepta UUID o contractNumber (formato CTR-XXX).
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const param = req.params.id
    const isContractNumber = /^CTR-/i.test(param)

    const contract = await prisma.contract.findFirst({
      where: isContractNumber
        ? { contractNumber: param, organizationId: req.organizationId }
        : { id: param, organizationId: req.organizationId },
    })

    if (!contract) return res.status(404).json({ error: 'Not found' })
    res.json(contract)
  } catch (error) {
    console.error('GET /api/contracts/:id error:', error)
    res.status(500).json({ error: 'Failed to fetch contract' })
  }
})

export default router
