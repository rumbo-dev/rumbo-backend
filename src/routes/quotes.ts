import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';

// ============ GET /api/quotes ============
// Lista quotes del demo user, ordenadas por receivedAt desc.
// Filtros opcionales: ?status=X, ?channel=Y, ?isNewClient=true|false
router.get('/', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' });

    const where: any = { userId: demoUser.id };

    const { status, channel, isNewClient } = req.query;
    if (typeof status === 'string' && status.length > 0) where.status = status;
    if (typeof channel === 'string' && channel.length > 0) where.channel = channel;
    if (isNewClient === 'true') where.isNewClient = true;
    if (isNewClient === 'false') where.isNewClient = false;

    const quotes = await prisma.quote.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
    });

    res.json(quotes);
  } catch (error) {
    console.error('GET /api/quotes error:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// ============ GET /api/quotes/:id ============
// Acepta UUID o quoteCode (formato Q-XXXX). 404 si no existe.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' });

    const param = req.params.id;
    const isQuoteCode = /^Q-/i.test(param);

    const quote = await prisma.quote.findFirst({
      where: isQuoteCode
        ? { quoteCode: param, userId: demoUser.id }
        : { id: param, userId: demoUser.id },
    });

    if (!quote) return res.status(404).json({ error: 'Not found' });
    res.json(quote);
  } catch (error) {
    console.error('GET /api/quotes/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// ============ GET /api/quotes/:id/attachments ============
function buildPublicUrl(req: Request, storedPath: string): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/static/${storedPath.replace(/^\/+/, '')}`;
}

router.get('/:id/attachments', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' });

    const param = req.params.id;
    const isQuoteCode = /^Q-/i.test(param);

    const quote = await prisma.quote.findFirst({
      where: isQuoteCode
        ? { quoteCode: param, userId: demoUser.id }
        : { id: param, userId: demoUser.id },
      select: { id: true },
    });
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const attachments = await prisma.attachment.findMany({
      where: { quoteId: quote.id },
      orderBy: { receivedAt: 'asc' },
    });

    res.json(attachments.map((a) => ({
      ...a,
      publicUrl: buildPublicUrl(req, a.storedPath),
    })));
  } catch (error) {
    console.error('GET /api/quotes/:id/attachments error:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

export default router;
