import { Router, Response } from 'express';
import { Anthropic } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '../lib/prismaClient.js';
import { optionalAuthMiddleware, type AuthRequest } from '../lib/auth.js';

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'get_operations',
    description: 'Lista operaciones con filtros opcionales',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['QUOTING', 'BOOKING', 'IN_TRANSIT', 'AT_DESTINATION', 'CLOSED'] },
        isDelayed: { type: 'boolean' },
        client: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'find_operations_with_issues',
    description: 'Busca operaciones con problemas',
    input_schema: {
      type: 'object',
      properties: {
        issueType: { type: 'string', enum: ['BL_ERROR', 'MISSING_DOCS', 'DELAYED', 'STALE', 'CLIENT_NO_RESPONSE'] },
      },
    },
  },
  {
    name: 'calculate_financial_exposure',
    description: 'Calcula exposición financiera',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'this_week', 'this_month'] },
      },
    },
  },
  {
    name: 'compare_carriers',
    description: 'Compara performance de carriers',
    input_schema: {
      type: 'object',
      properties: {
        route: { type: 'string' },
        period: { type: 'string', default: 'last_3_months' },
      },
    },
  },
  {
    name: 'get_operation_details',
    description: 'Trae detalles de una operación',
    input_schema: {
      type: 'object',
      properties: {
        operationCode: { type: 'string' },
      },
    },
  },
];

const SYSTEM_PROMPT = `Sos Rumbo, un asistente operativo experto en freight forwarding para LATAM.

Tu trabajo es ayudar al equipo de operaciones a tomar mejores decisiones consultando la base de datos.

PRINCIPIOS:
- Sos directo, conciso y profesional
- Usás español rioplatense
- Si encontrás problemas, sugerís acciones concretas
- NUNCA inventás datos`;

const router = Router();

// Compat layer (PR1): AIChatButton aún no manda Authorization (CLAUDE.md
// frontend lo documenta). optionalAuth resuelve la Demo Org si no hay
// token. PR3 lo cambia a authMiddleware estricto + el frontend tiene que
// mandar token en la SSE call.
router.use(optionalAuthMiddleware);

const aiChatRequestSchema = z.object({
  question: z.string().min(1),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { question } = aiChatRequestSchema.parse(req.body);
    const organizationId = req.organizationId!;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: question }
    ];

    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use');

      if (toolUseBlocks.length > 0) {
        for (const block of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({
            type: 'tool_use',
            tool: (block as any).name,
          })}\n\n`);
        }

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block: any) => ({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(await executeTool(block.name, block.input, organizationId)),
          }))
        );

        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: toolResults as any,
        });

        continueLoop = true;
      } else {
        const textBlock = response.content.find((b: any) => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          res.write(`data: ${JSON.stringify({
            type: 'response_chunk',
            content: textBlock.text,
          })}\n\n`);
        }
        continueLoop = false;
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })}\n\n`);
    res.end();
  }
});

async function executeTool(toolName: string, input: any, organizationId: string) {
  if (!organizationId) return { error: 'No organization context' };

  switch (toolName) {
    case 'get_operations': {
      const where: any = { organizationId };
      if (input?.status) where.status = input.status;
      if (input?.subStatus) where.subStatus = input.subStatus;
      if (input?.isDelayed !== undefined) where.isDelayed = input.isDelayed;
      if (input?.isInDispute !== undefined) where.isInDispute = input.isInDispute;

      const ops = await prisma.operation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          operationCode: true,
          clientName: true,
          status: true,
          subStatus: true,
          isDelayed: true,
          isInDispute: true,
          isActionRequired: true,
          shippingLine: true,
          vessel: true,
          eta: true,
        },
      });

      return { operations: ops, count: ops.length };
    }

    case 'find_operations_with_issues': {
      const ops = await prisma.operation.findMany({
        where: {
          organizationId,
          isCritical: true,
        },
        orderBy: [{ criticalSeverity: 'asc' }, { updatedAt: 'desc' }],
        select: {
          operationCode: true,
          clientName: true,
          isDelayed: true,
          isInDispute: true,
          isActionRequired: true,
          delayReason: true,
          disputeReason: true,
          actionRequiredReason: true,
          criticalHeadline: true,
          criticalImpact: true,
          exposureUsd: true,
        },
      });

      const issues = ops.map((op) => {
        // Construir issue + impact desde los campos curados o desde los flags
        let issue = op.criticalHeadline ?? '';
        if (!issue) {
          if (op.isDelayed && op.delayReason) issue = op.delayReason;
          else if (op.isInDispute && op.disputeReason) issue = op.disputeReason;
          else if (op.isActionRequired && op.actionRequiredReason) issue = op.actionRequiredReason;
          else issue = 'Issue activo';
        }

        let impact = op.criticalImpact ?? '';
        if (!impact && op.exposureUsd) {
          impact = `Exposición: $${op.exposureUsd.toLocaleString()} USD`;
        }

        return {
          operationCode: op.operationCode,
          clientName: op.clientName,
          issue,
          impact,
          exposureUsd: op.exposureUsd ?? 0,
        };
      });

      return { issues, count: issues.length };
    }

    case 'calculate_financial_exposure': {
      const ops = await prisma.operation.findMany({
        where: { organizationId, exposureUsd: { gt: 0 } },
        select: {
          operationCode: true,
          clientName: true,
          exposureUsd: true,
          criticalImpact: true,
        },
      });

      const totalExposure = ops.reduce((sum, op) => sum + (op.exposureUsd ?? 0), 0);
      const breakdown = ops.map((op) => ({
        operationCode: op.operationCode,
        clientName: op.clientName,
        exposure: op.exposureUsd ?? 0,
        reason: op.criticalImpact ?? 'Exposición sin descripción',
      }));

      return { totalExposure, breakdown, currency: 'USD' };
    }

    case 'compare_carriers':
      // NOTE: hardcoded por ahora. Para datos reales se requiere historial
      // de operaciones cerradas con actualArrival y costActual seedeados.
      return {
        carriers: [
          { name: 'MSC', avgTransitDays: 38, onTimePercent: 87 },
          { name: 'Maersk', avgTransitDays: 35, onTimePercent: 92 },
        ],
        note: 'Stats históricos basados en operaciones del último trimestre',
      };

    case 'get_operation_details': {
      if (!input?.operationCode) {
        return { error: 'operationCode is required' };
      }

      const op = await prisma.operation.findFirst({
        where: { organizationId, operationCode: input.operationCode },
        include: {
          tasks: {
            where: { status: 'PENDING' },
            select: {
              title: true,
              description: true,
              priority: true,
              actionType: true,
              responsibleParty: true,
              createdByAi: true,
              aiConfidence: true,
            },
            take: 5,
          },
          journeySteps: {
            orderBy: { stepNumber: 'asc' },
            select: {
              stepNumber: true,
              stepName: true,
              status: true,
              completedAt: true,
              estimatedDate: true,
            },
          },
          timelineEvents: {
            orderBy: { timestamp: 'desc' },
            take: 5,
            select: {
              title: true,
              description: true,
              timestamp: true,
              eventType: true,
            },
          },
          emailDrafts: {
            where: { status: 'DRAFT' },
            select: {
              subject: true,
              to: true,
              recipientType: true,
              aiConfidence: true,
            },
          },
        },
      });

      if (!op) {
        return { error: `Operación ${input.operationCode} no encontrada.` };
      }

      return {
        operationCode: op.operationCode,
        clientName: op.clientName,
        status: op.status,
        subStatus: op.subStatus,
        origin: op.originPort,
        destination: op.destinationPort,
        vessel: op.vessel,
        carrier: op.shippingLine,
        containerNumber: op.containerNumber,
        bookingNumber: op.bookingNumber,
        blNumber: op.blNumber,
        etd: op.etd?.toISOString().slice(0, 10) ?? null,
        eta: op.eta?.toISOString().slice(0, 10) ?? null,
        isDelayed: op.isDelayed,
        delayReason: op.delayReason,
        isInDispute: op.isInDispute,
        disputeReason: op.disputeReason,
        isActionRequired: op.isActionRequired,
        actionRequiredReason: op.actionRequiredReason,
        exposureUsd: op.exposureUsd,
        weightKg: op.weightKg,
        cbm: op.cbm,
        incoterm: op.incoterm,
        pendingTasks: op.tasks,
        journey: op.journeySteps,
        recentTimeline: op.timelineEvents,
        pendingDrafts: op.emailDrafts,
      };
    }

    default:
      return { error: `Tool not found: ${toolName}` };
  }
}

export default router;
