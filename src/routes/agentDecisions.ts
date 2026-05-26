import { Router, Response } from 'express'
import { prisma } from '../lib/prismaClient.js'
import { optionalAuthMiddleware, type AuthRequest } from '../lib/auth.js'

const router = Router()
router.use(optionalAuthMiddleware) // compat layer PR1 — ver quotes.ts

// ============ GET /api/agent-decisions ============
// Lista paginada (default 20). Filtros opcionales: ?agent=X, ?decisionType=Y
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const where: any = { organizationId: req.organizationId }
    const { agent, decisionType } = req.query
    if (typeof agent === 'string' && agent.length > 0) where.agentName = agent
    if (typeof decisionType === 'string' && decisionType.length > 0) where.decisionType = decisionType

    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100)

    const decisions = await prisma.agentDecision.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        operation: { select: { operationCode: true, clientName: true } },
      },
    })

    res.json(decisions)
  } catch (error) {
    console.error('GET /api/agent-decisions error:', error)
    res.status(500).json({ error: 'Failed to fetch agent decisions' })
  }
})

// ============ GET /api/agent-decisions/:id ============
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const decision = await prisma.agentDecision.findFirst({
      where: { id: req.params.id, organizationId: req.organizationId },
      include: {
        operation: { select: { operationCode: true, clientName: true } },
      },
    })

    if (!decision) return res.status(404).json({ error: 'Not found' })
    res.json(decision)
  } catch (error) {
    console.error('GET /api/agent-decisions/:id error:', error)
    res.status(500).json({ error: 'Failed to fetch agent decision' })
  }
})

export default router
