import { Router, Response } from 'express'
import { prisma } from '../lib/prismaClient.js'
import { optionalAuthMiddleware, type AuthRequest } from '../lib/auth.js'

const router = Router()

// Compat layer (PR1): hoy el frontend de /quotes NO manda Authorization
// header. optionalAuth lo cubre — con token filtra por la org del user,
// sin token filtra por la Demo Org pública. PR3 quita esto.
router.use(optionalAuthMiddleware)

// ============ GET /api/quotes ============
// Lista quotes de la organización del request.
// Filtros opcionales: ?status=X, ?channel=Y, ?isNewClient=true|false
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const where: any = { organizationId: req.organizationId }

    const { status, channel, isNewClient } = req.query
    if (typeof status === 'string' && status.length > 0) where.status = status
    if (typeof channel === 'string' && channel.length > 0) where.channel = channel
    if (isNewClient === 'true') where.isNewClient = true
    if (isNewClient === 'false') where.isNewClient = false

    const quotes = await prisma.quote.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
    })

    res.json(quotes)
  } catch (error) {
    console.error('GET /api/quotes error:', error)
    res.status(500).json({ error: 'Failed to fetch quotes' })
  }
})

// ============ GET /api/quotes/:id ============
// Acepta UUID o quoteCode (formato Q-XXXX). 404 si no existe o pertenece a otra org.
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const param = req.params.id
    const isQuoteCode = /^Q-/i.test(param)

    const quote = await prisma.quote.findFirst({
      where: isQuoteCode
        ? { quoteCode: param, organizationId: req.organizationId }
        : { id: param, organizationId: req.organizationId },
    })

    if (!quote) return res.status(404).json({ error: 'Not found' })
    res.json(quote)
  } catch (error) {
    console.error('GET /api/quotes/:id error:', error)
    res.status(500).json({ error: 'Failed to fetch quote' })
  }
})

export default router
