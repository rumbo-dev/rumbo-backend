import { Router, Request, Response } from 'express';
import { Anthropic } from '@anthropic-ai/sdk';
import { z } from 'zod';

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

const aiChatRequestSchema = z.object({
  question: z.string().min(1),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { question } = aiChatRequestSchema.parse(req.body);

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
            content: JSON.stringify(await executeTool(block.name, block.input)),
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

async function executeTool(toolName: string, input: any) {
  switch (toolName) {
    case 'get_operations':
      return {
        operations: [
          { operationCode: 'OP-0142', clientName: 'Importadora del Sur', status: 'IN_TRANSIT', isDelayed: true },
          { operationCode: 'OP-0173', clientName: 'Quest Industries', status: 'BOOKING_CONFIRMED', daysWithoutReconfirm: 4 },
          { operationCode: 'OP-0184', clientName: 'Distribuidora Norte SA', status: 'AT_DESTINATION' },
        ]
      };
    case 'find_operations_with_issues':
      return {
        issues: [
          { operationCode: 'OP-0142', issue: 'Demora 48h vs schedule', impact: 'Notificar al cliente' },
          { operationCode: 'OP-0173', issue: 'Cliente sin reconfirmar booking hace 4 días', impact: '$300 USD penalty cancelación' },
          { operationCode: 'OP-0184', issue: 'Discrepancia 350 kg en BL', impact: '$450 USD multa potencial AFIP' },
        ]
      };
    case 'calculate_financial_exposure':
      return {
        totalExposure: 750,
        breakdown: [
          { operationCode: 'OP-0173', exposure: 300, reason: 'Penalty Maersk por cancelación de booking sin reconfirmar' },
          { operationCode: 'OP-0184', exposure: 450, reason: 'Multa potencial AFIP por discrepancia BL (350 kg)' },
        ],
      };
    case 'compare_carriers':
      return {
        carriers: [
          { name: 'MSC', avgTransitDays: 38, onTimePercent: 87 },
          { name: 'Maersk', avgTransitDays: 35, onTimePercent: 92 },
        ],
      };
    case 'get_operation_details': {
      const detailsByCode: Record<string, any> = {
        'OP-0142': {
          operationCode: 'OP-0142',
          clientName: 'Importadora del Sur SA',
          status: 'IN_TRANSIT',
          subStatus: 'ON_BOARD',
          origin: 'Hamburgo',
          destination: 'Buenos Aires',
          vessel: 'MSC Beatrice',
          carrier: 'MSC',
          containerNumber: 'MSCU7831204',
          etd: '2026-04-05',
          eta: '2026-06-06',
          isDelayed: true,
          delayReason: 'Vessel reporta atraso de 48h por congestión en Hamburgo',
        },
        'OP-0173': {
          operationCode: 'OP-0173',
          clientName: 'Quest Industries',
          status: 'BOOKING',
          subStatus: 'BOOKING_CONFIRMED',
          origin: 'Shanghai',
          destination: 'Buenos Aires',
          vessel: 'Maersk Buenos Aires',
          carrier: 'Maersk',
          containerNumber: 'MAEU3389104',
          etd: '2026-05-12',
          eta: '2026-06-08',
          actionRequired: 'Cliente sin reconfirmar booking hace 4 días. Riesgo penalty $300 USD.',
        },
        'OP-0184': {
          operationCode: 'OP-0184',
          clientName: 'Distribuidora Norte SA',
          status: 'IN_TRANSIT',
          subStatus: 'DOCS_PENDING',
          origin: 'Shanghai',
          destination: 'Buenos Aires',
          vessel: 'Hamburg Express',
          carrier: 'Hapag-Lloyd',
          containerNumber: 'TCLU8821704',
          etd: '2026-04-15',
          eta: '2026-05-12',
          isInDispute: true,
          disputeReason: 'Discrepancia 350 kg en BL. Multa potencial AFIP $450 USD. Corrección solicitada al agente en origen (Schenker Shanghai).',
        },
        'OP-23714': {
          operationCode: 'OP-23714',
          clientName: 'Andes Trading SA',
          status: 'BOOKING',
          subStatus: 'BOOKING_CONFIRMED',
          origin: 'Hamburgo',
          destination: 'Buenos Aires',
          vessel: 'MSC Beatrice',
          carrier: 'MSC',
          containerNumber: 'TCLU8821704',
          etd: '2026-05-02',
          eta: '2026-05-29',
          isInDispute: true,
          disputeReason: 'Discrepancia 200 kg en BL provisional. Borrador de corrección a MSC listo para aprobar.',
        },
      };
      return detailsByCode[input.operationCode] || {
        error: `Operación ${input.operationCode} no encontrada.`,
      };
    }
    default:
      return { error: `Tool not found: ${toolName}` };
  }
}

export default router;
