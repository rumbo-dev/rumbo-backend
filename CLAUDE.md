# Rumbo Backend

## Quick orientation
Si es la primera vez que ves este repo, antes de tocar nada lee:
1. Este archivo entero
2. `prisma/schema.prisma` (modelo de datos)
3. `src/server.ts` (rutas + middleware)
4. `src/routes/today.ts` y `src/routes/aiChat.ts` (los dos endpoints más complejos)

Después de leer, si vas a hacer un cambio no trivial, **proponé el plan antes de escribir código**. Te voy a aprobar o ajustar el plan, después implementás.

## Stack
- Node.js + Express + TypeScript
- Prisma ORM con Neon Postgres (serverless)
- Anthropic SDK directo (Claude Sonnet 4.5 + Opus 4.5, sin wrappers)
- Deploy: Railway (auto-deploy desde `main`)
- URL prod: https://web-production-ad432.up.railway.app

## Arquitectura
Multi-agente con orchestrator determinístico:
- El orchestrator rutea inputs (emails, docs, cron, webhooks) a agentes especialistas
- Specialists actuales: ActionClassifier, EmailParser, EmailDrafter, TimelineUpdater
- Cada specialist implementa contrato `SpecialistAgent<TInput, TOutput>`
- Agregar un specialist nuevo = ~200 líneas + un case en orchestrator routing
- Decisión consciente: NO usar APIs de terceros que envuelven LLMs (OpenRouter, etc.). API de Anthropic directo.

## Modelos de Prisma clave
- `User`: hoy single-tenant (demo user único)
- `Operation`: tabla central. Campos clave:
  - Flags: `isCritical`, `isDelayed`, `isInDispute`, `isActionRequired`, `isCancelled`, `isQuoteExpired`
  - Curados manualmente: `criticalHeadline`, `criticalImpact`, `criticalSeverity`, `exposureUsd`
  - Status canónico: `status` (5 valores) + `subStatus` (17 valores granulares)
  - Ownership: `currentOwner` (SALES | PRICING | CUSTOMER | OPS)
  - Awaiting dinámico: `awaitingFor`, `awaitingSince`, `awaitingFollowupDue`
- `Task`: tareas que los agentes generan, status PENDING|APPROVED|SENT|REJECTED
- `JourneyStep`: pasos del lifecycle ordenados (stepNumber). `narrativeNote` se renderiza en el feed visual
- `TimelineEvent`: eventos cronológicos con timestamp explícito
- `EmailDraft`: borradores AI listos para aprobar
- `EmailInbound`: emails recibidos (input del pipeline)
- `AgentDecision`: log de decisiones de los specialists con confidence

## State actual (pre-multi-tenant)
- **Single-tenant**: todo usa hardcoded `demo@example.com` (user ID `cmohshayf0000t6a0b2tqy5xw`)
- 4 ops curadas seedeadas en producción: OP-0142, OP-0173, OP-0184, OP-23714
- `/api/today`: lee de BD (con cliente real, KPIs reales, arrivingThisWeek real). `yesterdayStats` sigue hardcoded como TODO.
- `/api/ai/chat`: 5 tools (`get_operations`, `find_operations_with_issues`, `calculate_financial_exposure`, `compare_carriers`, `get_operation_details`). 4 con queries Prisma reales. `compare_carriers` sigue hardcoded ("histórico hasta tener data suficiente").
- Endpoint `/api/operations/:id` acepta UUID OR operationCode (detecta con regex `/^OP-/i`)
- En `executeTool` (aiChat.ts) hay un TODO para reemplazar el hardcoded userId con auth real

## Convenciones del proyecto
- **NUNCA** `git push --force`. Si el push es rechazado, frenar y diagnosticar.
- Build local antes de cada push: `npm run build`
- Surgical edits en archivos grandes (preferí str_replace sobre rewrites)
- Scripts one-off van a `scripts/` (ignorado en .gitignore por contener URLs viejas de DB)
- Variables de entorno: `DATABASE_URL` apunta a localhost por default. Para correr scripts contra prod se pasa explícito: `DATABASE_URL="..." npx tsx scripts/...`

## Roadmap actual (en orden de prioridad)
1. **Multi-tenant + Auth**: Organization model, JWT con organizationId, middleware
2. **Email ingest**: webhook Mailgun → pipeline multi-agente → guarda operación
3. **Onboarding**: panel admin para crear org + cargar operaciones iniciales (concierge first)
4. **WhatsApp ingest**: Twilio Business API
5. **Tracking real**: jobs programados con MarineTraffic + carrier APIs
6. **`compare_carriers` real**: requiere data histórica de operaciones cerradas

## Lo que NO hacer
- No agregar wrappers de LLM (OpenRouter, etc.) — vamos directo a Anthropic
- No agregar Llama, Mistral, ni modelos open source — solo Claude
- No borrar las 4 ops curadas (OP-0142, 0173, 0184, 23714) — son para demos
- No tocar el deploy de Railway sin avisar (rompe demos en vivo)
- No mezclar features en un commit (uno por concepto)

## Workflow para cambios no triviales
1. **Leé el código relevante** antes de proponer (no asumas estado)
2. **Proponé el plan** en chat (qué archivos vas a tocar, qué riesgos ves, qué tests vas a correr)
3. **Esperá aprobación** del plan
4. **Implementá** paso por paso, mostrando diffs
5. **Build local** (`npm run build`)
6. **Commit con mensaje claro** (un concepto por commit)
7. **Push** solo cuando todo lo anterior pasó

## Bugs/deudas técnicas conocidas
- `aiChat.ts` hardcodea el demo user (TODO: leer de auth middleware)
- `today.ts` hardcodea `yesterdayStats` (TODO: computar desde EmailInbound + Task + Operation + TimelineEvent)
- No hay rate limiting en endpoints públicos
- No hay validación de tamaño de input en `/api/ai/chat`
- Frontend bug conocido: `TimelineNarrative` mergea journeyStep.narrativeNote con timelineEvents pero usa `new Date()` para journeySteps en vez de `completedAt`. Workaround actual: vaciar narrativeNote si duplica un timelineEvent.
