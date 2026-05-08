import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============ Helpers ============

const DAY_LABELS_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTH_LABELS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatArrivingLabel(date: Date): string {
  const day = DAY_LABELS_ES[date.getUTCDay()];
  const num = date.getUTCDate();
  const mon = MONTH_LABELS_ES[date.getUTCMonth()];
  return `${day} ${num} ${mon}`;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

// ============ Handler ============

router.get('/', async (req: Request, res: Response) => {
  try {
    // 1. User — para MVP devolvemos el demo user
    const demoUser = await prisma.user.findFirst({
      where: { email: 'demo@example.com' },
      select: { id: true, fullName: true },
    });

    const userName = demoUser?.fullName?.split(' ')[0] ?? 'Agustín';

    // 2. Critical operations
    const criticalOps = await prisma.operation.findMany({
      where: {
        userId: demoUser?.id,
        isCritical: true,
      },
      orderBy: [
        { criticalSeverity: 'asc' }, // 'high' < 'low' alfabéticamente, ajustamos abajo
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        operationCode: true,
        clientName: true,
        criticalSeverity: true,
        criticalHeadline: true,
        criticalImpact: true,
      },
    });

    // 3. Pending suggestions = AI-generated tasks PENDING + drafts in DRAFT status
    const [aiTasksCount, draftsCount] = await Promise.all([
      prisma.task.count({
        where: {
          userId: demoUser?.id,
          createdByAi: true,
          status: 'PENDING',
        },
      }),
      prisma.emailDraft.count({
        where: {
          status: 'DRAFT',
          operation: { userId: demoUser?.id },
        },
      }),
    ]);

    const totalSuggestions = aiTasksCount + draftsCount;
    const estimatedMinutes = Math.max(1, Math.ceil(totalSuggestions * 0.6));

    // 4. Arriving this week (next 7 days)
    const today = startOfDayUTC(new Date());
    const weekFromNow = addDays(today, 7);

    const arrivingOps = await prisma.operation.findMany({
      where: {
        userId: demoUser?.id,
        eta: { gte: today, lt: weekFromNow },
      },
      select: { eta: true, blNumber: true },
    });

    // Group by date
    const arrivingByDate: Record<string, { operations: number; docsReady: number }> = {};
    for (const op of arrivingOps) {
      if (!op.eta) continue;
      const dateKey = op.eta.toISOString().slice(0, 10);
      if (!arrivingByDate[dateKey]) {
        arrivingByDate[dateKey] = { operations: 0, docsReady: 0 };
      }
      arrivingByDate[dateKey].operations += 1;
      if (op.blNumber) arrivingByDate[dateKey].docsReady += 1;
    }

    const arrivingThisWeek = Object.entries(arrivingByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, counts]) => ({
        date: dateStr,
        label: formatArrivingLabel(new Date(dateStr + 'T00:00:00Z')),
        operations: counts.operations,
        docsReady: counts.docsReady,
      }));

    // 5. Yesterday stats — TODO: compute from EmailInbound, Task, Operation, TimelineEvent
    // Por ahora valores fijos hasta que el ingest pipeline esté completo
    const yesterdayStats = {
      emails: 23,
      actions: 8,
      closed: 3,
      alerts: 2,
    };

    // ============ Response ============
    res.json({
      user: { name: userName },
      timestamp: new Date().toISOString(),
      critical: criticalOps.map((op) => ({
        id: op.id,
        operationCode: op.operationCode,
        clientName: op.clientName,
        severity: op.criticalSeverity ?? 'medium',
        headline: op.criticalHeadline ?? '',
        impact: op.criticalImpact ?? '',
      })),
      pendingSuggestions: {
        total: totalSuggestions,
        breakdown: { tasks: aiTasksCount, drafts: draftsCount },
        estimatedMinutes,
      },
      arrivingThisWeek,
      yesterdayStats,
    });
  } catch (err) {
    console.error('[/api/today] error:', err);
    res.status(500).json({ error: 'Failed to load today data' });
  }
});

export default router;
