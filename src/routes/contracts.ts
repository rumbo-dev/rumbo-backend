import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';

// ============ GET /api/contracts ============
// Filtros opcionales: ?status=X, ?carrier=Y
router.get('/', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' });

    const where: any = { userId: demoUser.id };
    const { status, carrier } = req.query;
    if (typeof status === 'string' && status.length > 0) where.status = status;
    if (typeof carrier === 'string' && carrier.length > 0) where.carrier = carrier;

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: [{ status: 'asc' }, { validUntil: 'asc' }],
    });

    res.json(contracts);
  } catch (error) {
    console.error('GET /api/contracts error:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// ============ GET /api/contracts/:id ============
// Acepta UUID o contractNumber (formato CTR-XXX).
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.findFirst({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });
    if (!demoUser) return res.status(500).json({ error: 'Demo user not found' });

    const param = req.params.id;
    const isContractNumber = /^CTR-/i.test(param);

    const contract = await prisma.contract.findFirst({
      where: isContractNumber
        ? { contractNumber: param, userId: demoUser.id }
        : { id: param, userId: demoUser.id },
    });

    if (!contract) return res.status(404).json({ error: 'Not found' });
    res.json(contract);
  } catch (error) {
    console.error('GET /api/contracts/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

export default router;
