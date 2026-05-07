import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    user: { name: 'Agustín' },
    timestamp: new Date().toISOString(),

    critical: [
      {
        id: 'op_173',
        operationCode: 'OP-0173',
        clientName: 'Quest Industries',
        severity: 'high',
        headline: 'Cliente sin reconfirmar booking hace 4 días.',
        impact: 'Riesgo de cancelación: $300 USD',
      },
      {
        id: 'op_142',
        operationCode: 'OP-0142',
        clientName: 'Importadora del Sur SA',
        severity: 'high',
        headline: 'Operación demorada 2 días — cliente debe ser informado.',
        impact: 'Notificar al cliente demora de 48h',
      },
      {
        id: 'op_184',
        operationCode: 'OP-0184',
        clientName: 'Distribuidora Norte SA',
        severity: 'high',
        headline: 'Discrepancia de 350kg en BL.',
        impact: 'Multa potencial: $450 USD',
      },
    ],

    pendingSuggestions: {
      total: 12,
      breakdown: { tasks: 8, drafts: 4 },
      estimatedMinutes: 8,
    },

    arrivingThisWeek: [
      { date: '2026-05-05', label: 'MAR 5 may', operations: 2, docsReady: 2 },
      { date: '2026-05-07', label: 'JUE 7 may', operations: 2, docsReady: 1 },
      { date: '2026-05-08', label: 'VIE 8 may', operations: 1, docsReady: 1 },
    ],

    yesterdayStats: {
      emails: 23,
      actions: 8,
      closed: 3,
      alerts: 2,
    },
  });
});

export default router;
