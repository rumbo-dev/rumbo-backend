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
          { operationCode: 'OP-0173', clientName: 'Quest Industries', status: 'QUOTING', daysWithoutResponse: 7 },
          { operationCode: 'OP-0184', clientName: 'Distribuidora Norte SA', status: 'AT_DESTINATION' },
        ]
      };
    case 'find_operations_with_issues':
      return {
        issues: [
          { operationCode: 'OP-0142', issue: 'Delayed 2 days', impact: '$500 USD demurrage' },
          { operationCode: 'OP-0173', issue: 'Cliente sin responder 7 días', impact: '$12,000 USD riesgo cancelación' },
        ]
      };
    case 'calculate_financial_exposure':
      return {
        totalExposure: 18000,
        breakdown: [
          { operationCode: 'OP-0173', exposure: 12000, reason: 'Riesgo cancelación' },
          { operationCode: 'OP-0142', exposure: 4200, reason: 'Demurrage por delay' },
          { operationCode: 'OP-0184', exposure: 1800, reason: 'Multa aduana potencial' },
        ],
      };
    case 'compare_carriers':
      return {
        carriers: [
          { name: 'MSC', avgTransitDays: 38, onTimePercent: 87 },
          { name: 'Maersk', avgTransitDays: 35, onTimePercent: 92 },
        ],
      };
    case 'get_operation_details':
      return {
        operationCode: input.operationCode,
        clientName: 'Importadora del Sur',
        status: 'IN_TRANSIT',
        vessel: 'Hamburg Süd Buenos Aires',
      };
    default:
      return { error: `Tool not found: ${toolName}` };
  }
}

export default router;
