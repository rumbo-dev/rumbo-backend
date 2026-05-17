# Worklog overnight 2026-05-16

## Resumen

- **Hora inicio**: ~17:30 (cuando arrancó P1 después del config check)
- **Hora fin**: ~20:10 (después de verificación final de deploys)
- **Features completadas**: P1, P2, P3, P4 — todas
- **Features parciales**: ninguna
- **Features no iniciadas**: ninguna

Las 4 features estaban deployadas y respondiendo HTTP 200 al cierre del worklog.

---

## P1 — /quotes/[id] detalle

**Status**: ✅ Completado y deployado.

**Branch**: `feat/quotes-detail` → merged a `main` con `--no-ff`.

**SHAs (frontend)**:
- `d93e4ca` — feat(quote): add /quotes/[id] detail page with status-conditional render
- `b50284c` — Merge feat/quotes-detail

**Archivos creados (11)**:
- `src/app/quotes/[id]/page.tsx` (orquestador con render condicional por status)
- `src/app/quotes/[id]/_helpers.ts` (timeAgo, formatContainerType, formatUsd, formatDate, channelLabel, STATUS_CONFIG)
- `src/app/quotes/[id]/components/QuoteHero.tsx`
- `src/app/quotes/[id]/components/ParsedDataGrid.tsx`
- `src/app/quotes/[id]/components/OriginalMessageCollapsible.tsx`
- `src/app/quotes/[id]/components/CarrierComparisonTable.tsx`
- `src/app/quotes/[id]/components/RecommendationCard.tsx`
- `src/app/quotes/[id]/components/MarkupCalculator.tsx`
- `src/app/quotes/[id]/components/SurchargesBlock.tsx`
- `src/app/quotes/[id]/components/DraftEmailCard.tsx`
- `src/app/quotes/[id]/components/QuoteSidebar.tsx`

**Issues encontrados**: ninguno bloqueante. La página `/quotes/[id]` quedó como ƒ (dynamic, 9.6 kB).

**Visual QA pendiente** (Agustín verifica al volver):
- [ ] Q-0204 muestra hero con gradient + status pill + AI confidence + CTA coral
- [ ] ParsedDataGrid muestra 8 campos con check verde en confidence ≥90%
- [ ] CarrierComparisonTable muestra 4 carriers, MSC con badge ⭐ Recomendado
- [ ] RecommendationCard parsea el reason en bullets numerados
- [ ] MarkupCalculator: cambiar input actualiza quote final y margen en vivo
- [ ] SurchargesBlock collapsible, total $625, quote final con surcharges $4,881 en coral grande
- [ ] DraftEmailCard muestra email con 3 botones — "Aprobar y enviar" → toast
- [ ] QuoteSidebar sticky con histórico cliente + acciones + agent activity (clickeable → modal)
- [ ] Q-0203 muestra hero + ParsedDataGrid (con badge de 6 missing) + draft pidiendo info
- [ ] Q-0205 (new client) muestra card "Validar referencias comerciales"
- [ ] Q-0206 (RF recurring) muestra "Cotización en preparación" + badge ❄️ Refrigerado
- [ ] Q-0207 muestra "Quote enviada" block + follow-up button

---

## P2 — /today mejorado

**Status**: ✅ Completado y deployado.

**Branches**: `feat/today-enhanced` (backend) y `feat/today-enhanced` (frontend) → merged a `main`.

**SHAs**:
- backend `2f4146f` — feat(today): add kpis, agentActivity, growthOpportunities to /api/today
- backend `7331cd3` — Merge feat/today-enhanced (backend)
- frontend `7ba3378` — feat(today): add PerformanceKpis, AgentActivityFeed, GrowthOpportunities
- frontend `fe5b500` — Merge feat/today-enhanced (frontend)

**Cambios backend**: `src/routes/today.ts` agrega 3 nuevos bloques al response: `kpis`, `agentActivity` (10 items), `growthOpportunities` (3 items). IDs de decisions están alineados con el seed de P3 (`ad-001`..`ad-010`).

**Cambios frontend**:
- `src/components/today/PerformanceKpis.tsx` (4 KPI cards con icon + accent strip)
- `src/components/today/AgentActivityFeed.tsx` (lista scrollable max 400px)
- `src/components/today/GrowthOpportunitiesCard.tsx` (3 items con icon + tipo)
- `src/app/today/page.tsx` — los nuevos blocks van ARRIBA de las 3 secciones existentes (críticas, suggestions, arriving, yesterday no se tocaron)

**Issues encontrados**: ninguno. Las nuevas secciones son backwards-compatible: si el backend deploy lags, los nuevos campos quedan `undefined` y la página sigue funcionando con las secciones originales.

**Visual QA pendiente**:
- [ ] /today sigue mostrando críticas + suggestions + arriving + yesterday (regresión)
- [ ] Aparece nueva section "Performance hoy" con 4 KPI cards
- [ ] Agent activity feed (60%) + Growth opportunities (40%) en grid de 2 columnas
- [ ] Click en agent item con `operationCode` navega a /operations/X
- [ ] Click en agent item con `decisionId` abre el modal (P3)

---

## P3 — Modal Agent Decision Trace

**Status**: ✅ Completado y deployado.

**Branches**: `feat/agent-decisions` (backend) y `feat/agent-decision-modal` (frontend) → merged a `main`.

**SHAs**:
- backend `e2cad5c` — feat(agent-decisions): add /api/agent-decisions endpoints + seed
- backend `3dafb66` — Merge feat/agent-decisions (backend)
- frontend `8f02b0b` — feat(agent-decisions): AgentDecisionModal with audit trail
- frontend `d8035eb` — Merge feat/agent-decision-modal

**Backend**:
- `scripts/seed-agent-decisions.ts` (versionado, env-var based, idempotente upsert por id)
- 10 decisiones con IDs `ad-001`..`ad-010`, razonamientos detallados (3-5 párrafos), alternativas evaluadas
- 7 agentes representados: READ, WATCH, CLEAR, QUOTE, REPLY, RANK, GROWTH
- `src/routes/agentDecisions.ts` — GET / (paginated default 20) + GET /:id
- `src/server.ts` registra el router en `/api/agent-decisions`
- `.gitignore` excepción para `seed-agent-decisions.ts`

**Frontend**:
- `src/components/AgentDecisionModal.tsx` — modal con 4 sections (Lo que vi, Lo que consideré, Por qué decidí, Lo que hice) + footer con metadata
- Cierre: ESC, click outside, X button
- Body scroll lock cuando está abierto
- Wired into `/today` AgentActivityFeed (decisionId → modal)
- Wired into `/quotes/[id]` QuoteSidebar (algunos items de agentActivity tienen decisionId apuntando a ad-004/ad-005/ad-008/ad-010)

**Schema notes**: el modelo `AgentDecision` ya existía en `prisma/schema.prisma`. NO se modificó. Se usa `outputData` (Json) para almacenar `reasoning`, `alternatives`, `action`, `summary`. Esto evita tocar el schema según las reglas.

**Issues encontrados**: ninguno.

**Visual QA pendiente**:
- [ ] En /today, click en cualquier item con decisionId abre el modal
- [ ] Modal muestra agent badge color-coded + decisionType + confidence pill + auto-aplicado pill
- [ ] Sections "Lo que vi" / "Lo que consideré" / "Por qué decidí" / "Lo que hice"
- [ ] Footer muestra timestamp, modelo, latencia, tokens, operación si aplica
- [ ] ESC cierra · click backdrop cierra · X cierra
- [ ] En /quotes/Q-0204, sidebar items con decisionId (ad-008 y ad-010) abren el modal

---

## P4 — /contracts

**Status**: ✅ Completado y deployado.

**Branches**: `feat/contracts` (backend) y `feat/contracts` (frontend) → merged a `main`.

**SHAs**:
- backend `13a79c0` — feat(contracts): add Contract model + /api/contracts endpoints + seed
- backend `773fab4` — Merge feat/contracts (backend)
- frontend `0db463b` — feat(contracts): add /contracts list + detail pages
- frontend `5f1f819` — Merge feat/contracts (frontend)

**Backend**:
- `prisma/schema.prisma` — agregado `model Contract` (aditivo) + back-relation `contracts Contract[]` en User
- `prisma db push` aplicado a prod (Neon, additive, sin data loss)
- `scripts/seed-contracts.ts` con 8 contratos (MSC/Maersk/HL/CMA-CGM/COSCO) variados en lanes + status (ACTIVE, EXPIRING_SOON, UNDERUTILIZED, EXPIRED)
- `src/routes/contracts.ts` — GET / (filtros status, carrier) + GET /:id (acepta UUID o CTR-XXX)
- `src/server.ts` registra el router en `/api/contracts`
- `.gitignore` excepción para `seed-contracts.ts`

**Frontend**:
- `src/types/contract.ts` con types matching backend
- `src/app/contracts/page.tsx` — KPI row (4 cards: total committed/total used/expiring/underutilized), filtros (status, carrier), tabla con progress bar de utilización color-coded
- `src/app/contracts/[id]/page.tsx` — hero con gradient + monospace contractNumber, data grid 4x2, utilization progress bar grande, monthly usage chart (SVG inline bars), associated operations card (hardcoded para CTR-MSC-2026-Q2)
- `src/components/Sidebar.tsx` — entrada "Contratos" con icono Anchor, entre Cotizaciones y Pricing

**Issues encontrados**: ninguno. Total contracts en BD: 8 después del seed.

**Visual QA pendiente**:
- [ ] Sidebar muestra "Contratos" entre Cotizaciones y Pricing, active cuando estás en /contracts
- [ ] /contracts muestra 4 KPIs en row
- [ ] Tabla muestra 8 contratos con progress bar (verde para 40-95%, amarillo <40%, rojo >95%)
- [ ] Filtros funcionan (status: ACTIVE/EXPIRING_SOON/UNDERUTILIZED/EXPIRED; carrier dropdown)
- [ ] Click en row → /contracts/CTR-XXX
- [ ] Detail page muestra hero + 8 data cells + progress bar grande + bar chart SVG + associated ops + notes

---

## Estado de los deploys

Verificado a las ~20:10 después de todos los pushes.

### Railway (backend)
- Deploy SHA: `773fab4` (Merge feat/contracts (backend))
- Estado: 🟢 verde
- Endpoints verificados HTTP 200:
  - `GET /api/today` (incluye `kpis` confirmado)
  - `GET /api/quotes` (lista)
  - `GET /api/quotes/Q-0204` (detalle)
  - `GET /api/agent-decisions` (lista)
  - `GET /api/agent-decisions/ad-010` (detalle)
  - `GET /api/contracts` (lista, 8 items)
  - `GET /api/contracts/CTR-MSC-2026-Q2` (detalle)

### Vercel (frontend)
- Deploy SHA: `5f1f819` (Merge feat/contracts (frontend))
- Estado: 🟢 verde
- Rutas verificadas HTTP 200:
  - `/today`
  - `/quotes`
  - `/quotes/Q-0204`
  - `/contracts`
  - `/contracts/CTR-MSC-2026-Q2`

---

## Riesgos para demo del lunes

1. **Modal de AgentDecision no testeado visualmente**. Las 4 sections (Lo que vi, Lo que consideré, Por qué decidí, Lo que hice) están armadas pero no las vi en browser. Riesgo: layout roto en algún edge case (decision sin alternatives, etc.). Mitigación: dejé fallbacks (`outputData?.alternatives && length > 0`).

2. **Regresión `/today` Demo Mode** (heredado de P3 anterior, no testeado en browser). El Demo Mode original de 65s con 9 toasts debe seguir funcionando vía `DEFAULT_TOASTS_TODAY`. Si rompió por el refactor de overlay/button, plan B es duplicar el componente.

3. **Markup calculator local-only**: si Agustín cambia el valor del markup y refresca la página, vuelve al inicial. Esto es por diseño (no persiste a BD en este sprint) pero puede confundir si no se aclara durante la demo.

4. **Bar chart de /contracts/[id] usa mock data** generada en el frontend (no del backend). Cualquier cambio en `volumeUsedTeu` no actualiza el gráfico (que asume reparto uniforme en 6 meses). Acceptable para demo, marcar como "mock data" en el subtitle ya lo dice.

5. **No-auth en /api/contracts, /api/agent-decisions y /api/quotes** sigue intencional (alineado con /api/today y /api/ai/chat). Documentado en LEARNINGS.md para fix en Sprint 1.

6. **Q-0206 y otros quotes sin recommendedCarrier**: el render fallback "Cotización en preparación" funciona pero es relativamente seco. Si te preguntan por qué Rumbo no lo cotizó automáticamente, la respuesta es "lo está haciendo, demoraría unos minutos en producción real".

---

## Próximos pasos sugeridos

1. **Visual QA pase completo** en browser (especialmente las pendientes listadas por feature). Recomiendo el orden: /today → /quotes → /quotes/Q-0204 (es la estrella) → /contracts → /contracts/CTR-MSC-2026-Q2.

2. **Iterar el polish** en lo que se vea raro:
   - Tablas en mobile (no testeado responsive)
   - Tipografía en headers (algunos h1 36px puede ser mucho)
   - Spacing entre sections

3. **Sprint 1 sigue siendo el siguiente paso** post-demo (multi-tenant + auth). Toda la deuda registrada en LEARNINGS.md sigue aplicando.

4. **Borrar `src/app/operations/[id]/page.tsx.bakE1`** del repo frontend (backup viejo, mencionado en LEARNINGS).

5. **Limpiar `rumbo-frontend-BACKUP-HOY/`** (directorio hermano de los repos, no entra en git pero genera ruido).

6. **Conectar el modal a real metrics**: hoy `today.ts` tiene los IDs hardcoded a `ad-001..ad-010` que matchean con el seed. Si querés data fresca, agregar un endpoint `GET /api/today/agent-activity` que query AgentDecision real con ordering por createdAt.

7. **Considerar partir `src/app/quotes/[id]/page.tsx`** (440 líneas) en sub-routers de render por status para evitar repetir el patrón de operations/[id]/page.tsx (902 líneas) — sigue siendo manejable pero está creciendo.

---

## Commits resumidos

### Backend (rumbo-backend) — 4 merges en main desde inicio del overnight

```
773fab4 Merge feat/contracts (backend)
13a79c0 feat(contracts): add Contract model + /api/contracts endpoints + seed
3dafb66 Merge feat/agent-decisions (backend)
e2cad5c feat(agent-decisions): add /api/agent-decisions endpoints + seed
7331cd3 Merge feat/today-enhanced (backend)
2f4146f feat(today): add kpis, agentActivity, growthOpportunities to /api/today
```

### Frontend (rumbo-frontend) — 4 merges en main desde inicio del overnight

```
5f1f819 Merge feat/contracts (frontend)
0db463b feat(contracts): add /contracts list + detail pages
d8035eb Merge feat/agent-decision-modal
8f02b0b feat(agent-decisions): AgentDecisionModal with audit trail
fe5b500 Merge feat/today-enhanced (frontend)
7ba3378 feat(today): add PerformanceKpis, AgentActivityFeed, GrowthOpportunities
b50284c Merge feat/quotes-detail
d93e4ca feat(quote): add /quotes/[id] detail page with status-conditional render
```

### Seeds aplicados a prod

```
DATABASE_URL="..." npx tsx scripts/seed-agent-decisions.ts  # 10 decisions (ad-001..ad-010)
DATABASE_URL="..." npx tsx scripts/seed-contracts.ts        # 8 contracts
```

---

Worklog creado autónomamente durante el overnight de 2026-05-16.

---

## Fixes round 2 — 2026-05-17

Pase de visual QA después del overnight. 8 issues + side task. Trabajados
directo en `main` (no branches por ser fixes chicos).

### Issue #1 — Cierre (diagnóstico OP-0184 desaparecidas)

**Status**: ✅ Confirmado falso positivo + side task aplicado.

Las 4 ops curadas **nunca desaparecieron**. Query directo a BD confirmó:
- OP-0184 Distribuidora Norte SA (IN_TRANSIT, isCritical)
- OP-0173 Quest Industries (BOOKING, isCritical)
- OP-0142 Importadora del Sur SA (IN_TRANSIT, isCritical)
- OP-23714 Andes Trading SA (BOOKING)

La "desaparición" era JWT expirado en el browser — el endpoint `/api/operations/:id`
requiere auth, y al expirar el token tira 401 que el componente renderiza como
"no encontrado". Usuario re-logueó y la data reapareció.

**Side task aplicado**: `prisma/seed.ts` (que tiene `deleteMany` sobre
User/Operation/Task/JourneyStep/TimelineEvent) ahora tiene un guard
`if (NODE_ENV === 'production')` al inicio que aborta con error.
SHA: `c783732`.

### Issue #2 — Reordenar /today

**Status**: ✅ Aplicado.

Orden final: Performance → Críticas → Suggested → Agent+Growth → Arriving → Yesterday.

**Commits (frontend)**:
- `2631004` fix(today): reorder sections per visual QA (#2)

**Archivos**: `src/app/today/page.tsx`

### Issue #3 — Cost avoided 24800 → 3500

**Status**: ✅ Aplicado (combinado con #4 backend).

**Commits (backend)**:
- `a9bf179` fix(today): expose user.fullName + team; lower costAvoided to $3,500

**Archivos**: `src/routes/today.ts`

Verificado en prod: `/api/today` devuelve `"costAvoidedMtd":3500`.

### Issue #4 — Nombre consistente "Agustín Baiocco"

**Status**: ✅ Aplicado.

DB ya tenía `fullName="Agustín Baiocco"` para demo@example.com. El problema
estaba en el Sidebar que hardcodeaba "Juan Pérez / Operations / JP".

**Cambios**:
- Backend: `/api/today` ahora devuelve `user.fullName` y `user.team` (no
  solo `user.name` que es el firstName)
- Frontend: Sidebar fetchea `/api/today` en mount, computa iniciales del
  fullName, formatea team via diccionario (OPERATIONS → "Operaciones", etc.)

**Commits**:
- backend `a9bf179` (combinado con #3)
- frontend `95fbdd8` fix(sidebar): read user fullName + team from /api/today (#4)

**Archivos**: `src/routes/today.ts`, `src/components/Sidebar.tsx`

Verificado en prod: `/api/today` devuelve `"fullName":"Agustín Baiocco"`.

### Issue #5 — Demo Mode /quotes narrativa Q-0204

**Status**: ✅ Aplicado.

Reemplazado el sequence de 12 toasts genéricos (Quest Industries WhatsApp)
por la narrativa específica de Q-0204 (Andes Trading email → MSC $3,800
contrato → surcharges → $4,881 final). Modal: "1 minuto 30 segundos.
45 minutos ahorrados vs manual."

**Commits (frontend)**:
- `e4507e9` fix(quotes): demo mode toasts ahora narran Q-0204 Andes Trading (#5)

**Archivos**: `src/app/quotes/page.tsx`

### Issue #6 — Traducciones EN → ES

**Status**: ✅ Aplicado.

Pase de traducción en 9 archivos:
- `PerformanceKpis`: Exceptions caught → Excepciones detectadas, Cost avoided → Costo evitado, Horas ahorradas → Horas operativas ahorradas
- `CarrierComparisonTable`: Transit → Tránsito, Sailings/sem → Salidas/sem, On-time 12m → Puntualidad 12m, Rate contrato → Tarifa contrato, Spot → Tarifa spot, Status → Estado
- `contracts/page`: Total committed → Total comprometido, Container → Tipo de contenedor, Rate → Tarifa, Lane → Ruta, Vence → Vigente hasta
- `contracts/[id]/page`: Container type → Tipo de contenedor, Rate USD → Tarifa USD, Volumen committed → Volumen comprometido, Vigencia desde/hasta → Vigente desde/hasta
- `quotes/page` + `QuoteSidebar`: Win rate → Tasa de cierre
- `QuoteSidebar` + `AgentActivityFeed`: Agent activity → Actividad de agentes
- `GrowthOpportunitiesCard`: Growth opportunities → Oportunidades de crecimiento

Términos del rubro mantenidos: FCL/LCL/FOB/CIF/EXW, TEU, BL, ETA/ETD, WhatsApp,
Demo Mode, Carrier, Pricing, Spot, Markup, Surcharges.

**Commits (frontend)**:
- `6f03d1f` fix(i18n): translate remaining English terms to Spanish (#6)

### Issue #7 — Fix OP-0184 timeline y multas

**Status**: ✅ Aplicado en BD prod.

**Cambios**:
- `criticalImpact`: "Multa potencial: $450 USD" → "Multa potencial: $930 USD (Amendment Fee al carrier $300 + Multa AFIP declaración inexacta $450 + Almacenaje extra terminal $180)"
- `exposureUsd`: 450 → 930
- Timeline rehecha (5 events vs 4 anteriores):
  - 8 abr → Operación creada
  - 10 abr → Booking confirmado por Hapag-Lloyd
  - 14 abr → Cliente envió Packing List + Commercial Invoice (nuevo)
  - 16 abr → BL recibido del agente en origen (Schenker Shanghai) (antes: del carrier)
  - 16 abr → ⚠ Discrepancia detectada (antes: 2 may)

**Implementado vía** `scripts/fix-op-0184.ts` (versionado, env-var based,
con excepción en `.gitignore`). Aplicado en BD prod durante esta sesión.

**Commits (backend)**:
- `c4f0827` fix(op-0184): timeline (BL del agente, discrepancia mismo día) + multa breakdown (#7)

### Issue #8 — Simplificar formulario "Nueva operación"

**Status**: ✅ Aplicado.

**Reporte previo (qué tenía el formulario)**:
- Está en `src/app/dashboard/page.tsx` líneas 469-498 (modal embebido)
- Se dispara desde sidebar `+ Nueva operación` o desde botones del dashboard
- Tenía 12 campos TODOS required: operationCode, containerNumber, clientName,
  shippingLine (Carrier), originPort, originCountry (ISO), destinationPort,
  destinationCountry (ISO), weightKg, costEstimate (USD), incoterm (FOB/CIF/EXW/DDP),
  mode (FCL/LCL/AIR/LAND)
- Submit hacía POST a `/api/operations` con todos los campos

**Cambios aplicados**:

Backend:
- Schema: `Operation.clientReference String?` agregado (aditivo, optional)
- `prisma db push` aplicado a prod (no data loss)
- `POST /api/operations`: `operationCode` ahora opcional — si no se provee,
  auto-genera el siguiente OP-NNNN buscando el max del user. Validación:
  solo `clientName` es required. Defaults: status=QUOTING, subStatus=NEW_QUOTE,
  currentOwner=SALES, priority=NORMAL, mode='FCL'.

Frontend:
- Form ahora tiene 7 campos visibles + 1 placeholder readonly:
  - **Obligatorios (sección)**:
    - Código de operación (placeholder gris: "Se asigna automáticamente al crear")
    - Cliente
    - Referencia del cliente (nuevo campo, mapped a clientReference)
  - **Opcionales (sección)**:
    - Incoterm dropdown (FOB/CIF/EXW/DDP/DAP — agregado DAP)
    - Modo dropdown (FCL/LCL/AIR — sin LAND)
    - Puerto de origen (texto libre)
    - Puerto de destino (texto libre)
- Submit handler manda solo los 7 campos relevantes

**Commits**:
- backend `9c09566` feat(operations): simplify POST + add clientReference (#8)
- frontend `da84e0a` fix(dashboard): simplify 'Nueva operación' form to 7 fields (#8)

### Cleanup paralelo

- `28b6f4e` (frontend) chore: remove page.tsx.bakE1 backup committed by accident
  - Se había colado en el commit de i18n por `git add -A`. Era cruft viejo
    flagado en LEARNINGS.md para limpieza.

### Estado deploys post-round-2

Verificado a las ~hora del worklog round 2 después de todos los pushes:

| Endpoint / Ruta | HTTP | Notas |
|---|---|---|
| `/api/today` | 200 | `fullName: Agustín Baiocco` + `costAvoidedMtd: 3500` |
| `/api/quotes` | 200 | 5 quotes |
| OP-0184 DB | ✅ | 5 timeline events + `exposureUsd: 930` |

### Visual QA pendiente (round 2)

Para verificar en browser cuando esté disponible:

- [ ] `/today` orden: Performance → Críticas → Suggested → Agent+Growth → Arriving → Yesterday
- [ ] Sidebar muestra "Agustín Baiocco / Operaciones" con iniciales "AB"
- [ ] `/today` KPI cost avoided dice `$3,500` (no `$24,800`)
- [ ] `/quotes` Demo Mode al clickear corre los 12 toasts nuevos de Andes Trading
- [ ] Modal final del Demo Mode dice "1 minuto 30 segundos. 45 minutos ahorrados vs manual."
- [ ] `/operations/OP-0184` timeline muestra los 5 events con fechas correctas
- [ ] `/operations/OP-0184` criticalImpact muestra el breakdown completo de $930
- [ ] Click en una crítica de `/today` navega bien a `/operations/OP-XXXX`
- [ ] CarrierComparisonTable columnas: Tránsito, Salidas/sem, Puntualidad 12m, Tarifa contrato, Tarifa spot, Estado
- [ ] `/contracts` tabla columnas: Tipo de contenedor, Tarifa, Vigente hasta, Estado
- [ ] `/contracts/[id]` data cells: Tipo de contenedor, Tarifa USD, Volumen comprometido, Vigente desde/hasta
- [ ] `/quotes` KPI dice "Tasa de cierre 30d"
- [ ] Sidebar `+ Nueva operación` abre el modal con 7 campos (3 obligatorios + 4 opcionales)
- [ ] Submit del form con solo Cliente + Referencia → crea operación con OP-XXXX auto, status QUOTING, subStatus NEW_QUOTE

### Commits resumen round 2

```
backend:
  c783732 chore(seed): guard prisma/seed.ts against production runs
  9c09566 feat(operations): simplify POST /api/operations + add clientReference field
  c4f0827 fix(op-0184): timeline + multa breakdown
  a9bf179 fix(today): expose user.fullName + team; lower costAvoided to $3,500

frontend:
  28b6f4e chore: remove page.tsx.bakE1 backup
  da84e0a fix(dashboard): simplify 'Nueva operación' form to 7 fields
  6f03d1f fix(i18n): translate remaining English terms to Spanish
  e4507e9 fix(quotes): demo mode toasts narran Q-0204 Andes Trading
  2631004 fix(today): reorder sections per visual QA
  95fbdd8 fix(sidebar): read user fullName + team from /api/today
```
