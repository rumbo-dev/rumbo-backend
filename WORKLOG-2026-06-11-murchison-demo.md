# Worklog Murchison Demo — 2026-06-11

## Resumen

- **Hora inicio**: 18:14
- **Hora fin**: 18:32
- **Duración efectiva**: ~18 minutos
- **Tareas completadas**: T1 ✅ · T2 ✅ · T3 ✅ · T4 ✅ · T5 ✅ (este reporte)

Sin stop conditions activadas. Build limpio en ambos repos. Smoke tests
post-deploy: todos los endpoints responden 200, ninguna regresión en las 4
ops curadas previas.

---

## Tarea 1 — Attachments infra ✅

### Backend

**Schema** (`prisma/schema.prisma`)
- Nuevo modelo `Attachment` (filename, storedPath, mimeType, sizeBytes,
  documentType, description, source, receivedAt, operationId/quoteId FK).
- Back-relation `Operation.attachments[]` y `Quote.attachments[]`.
- Operation: campos opcionales nuevos para representar la op real con
  mayor detalle: `stakeholders` (JSON), `finalConsignee`, `portOrigin`,
  `portDestination`, `containerNumbers`, `hblNumbers`, `mblNumber`,
  `cartons`, `cargoDescription`, `imoClass`, `etdOrigin`, `etaDestination`.
  TODOS opcionales — no rompen ops existentes.
- Aplicado a prod con `npx prisma db push` (aditivo, sin data loss).

**Static serving** (`src/server.ts`)
- `app.use('/static', express.static('public/'))` con override de
  Content-Type para PDFs.

**Endpoints**
- `GET /api/operations/:id` ahora incluye `attachments[]` (orderBy
  receivedAt asc).
- `GET /api/operations/:id/attachments` — devuelve attachments con
  `publicUrl` construido (`PUBLIC_BASE_URL` env o `req.host` fallback).
- `GET /api/quotes/:id/attachments` — idem para quotes.

**Files**
- 7 archivos reales en `public/attachments/OP-024-026/`:
  HBL_NGBS076774_DRAFT.pdf, HBL_NGBS076774S_DRAFT.pdf,
  MBL_177NNMNMN02Z46A_DRAFT.doc, HBL_NGBS076774S_TLX_RELEASE.pdf,
  ArrivalNotice_MEDUWI744667.pdf, DebitNote_NGBSD148507.pdf,
  PGS_TelexRelease_Guarantee_CN_EN.docx (~1.1 MB total).

### Frontend

- `src/components/AttachmentsList.tsx` — card list con icon por mimeType,
  DocumentTypeBadge, source badge color-coded, click → publicUrl en nueva
  tab.
- `src/components/DocumentTypeBadge.tsx` — badge component por
  documentType (HBL_DRAFT, MBL_DRAFT, BL_TLX_RELEASE, ARRIVAL_NOTICE,
  DEBIT_NOTE, GUARANTEE, etc.) con color/label dedicado.
- Integrado en `/operations/[id]/page.tsx` en grid de 2 columnas
  (Stakeholders + Documents).

### SHAs

- Backend `ca68b14` feat(attachments): Attachment model + static serving + /api/.../attachments
- Frontend `a961de6` feat(attachments,stakeholders): AttachmentsList + DocumentTypeBadge + StakeholdersPanel + integration

---

## Tarea 2 — Seed Murchison ✅

**Script** `scripts/seed-murchison-op.ts` (idempotente, ~470 líneas).

Crea:
- **Q-024-026** (Quote): CLOSED_WON, channel EMAIL, 4-carrier comparison
  (ZIM/COSCO/MSC/Maersk con ZIM marcado como recomendado *inicial*),
  surcharges breakdown, draftBody en rioplatense.
- **OP-024-026** (Operation): CLOSED/COMPLETED, MSC AVNI V.FI607A, FOB
  NGB→BUE 1x40HQ, 458 cartons, 10.812,8 kg, 68 CBM, hair clips + li-battery
  (IMO 9), ETD 18-feb, ETA 7-abr.
- **22 TimelineEvent** records — full lifecycle desde 2026-01-29 19:08
  (pedido cotización) hasta 2026-04-06 13:49 (arribo confirmado). Incluye
  3 alertas críticas: detección de li-battery, servicio inicial perdido,
  MBL emit mismatch.
- **7 Attachment** records vinculados a los archivos físicos (sizeBytes
  leído del filesystem real con `statSync`).
- **10 AgentDecision** records (`ad-mur-001..ad-mur-010`) con outputData
  JSON detallado. `ad-mur-004` (re-cotización tras li-battery) tiene
  reasoning extra-detallado para ser EL modal destacado del demo.
- **15 stakeholders** en `Operation.stakeholders` JSON: Chic Parisien × 4
  (Marcia primary), Murchison × 4 (Natalia primary), Parisi NGB × 3,
  Onboard BSAS × 4.

**Idempotencia**:
- Quote: upsert por `quoteCode` unique.
- Operation: `findFirst` + update/create (no hay unique compuesto).
- TimelineEvents y Attachments: `deleteMany` por operationId + recreate.
- AgentDecisions: upsert por `id` estable (`ad-mur-XXX`).

**Aplicado a prod**:
```
Quote: cmqa0c9v50001q5xvm22dfmho
Operation: cmqa0cafb0003q5xvczw9v96f
```

Re-run safe: el script se puede correr múltiples veces sin duplicar nada.

NO TOCÓ las 4 ops curadas previas, 5 quotes previas, 8 contracts, 10
agent decisions previas. Suma, no reemplaza.

**SHA**: backend `6913524` feat(demo-murchison): seed real operation Ref 024/026

---

## Tarea 3 — Componentes UI ✅

### StakeholdersPanel (`src/components/StakeholdersPanel.tsx`)
- Agrupa contactos por empresa con color consistente (Chic Parisien
  coral, Murchison navy, Parisi NGB warning, Onboard BSAS info).
- Avatar con iniciales, nombre, rol, mailto link.
- Primary contacts con highlight + ícono estrella.
- Empresas ordenadas: cliente → forwarder → agente → despachante.

### TimelineNarrative — severity
- `deriveSeverity()` detecta "high" si el title contiene `⚠`/`ALERTA`
  o eventType es `DISPUTE_OPENED`.
- "medium" para `SCHEDULE_CHANGED` / `ITINERARY_CHANGED`.
- Severity high → border izquierdo coral/danger + bg tenue + badge
  "⚠ Alerta" en uppercase.
- Source labels con emoji + color (🌏 agent_origin coral, 🚢 carrier
  navy, 👤 customer success, 📦 destination_agent info, 🎯 forwarder
  warning).
- Backwards-compat: eventos sin `source` caen al `sourceTeam` legacy.

### DocumentTypeBadge (`src/components/DocumentTypeBadge.tsx`)
- 9 tipos: HBL_DRAFT (warning), MBL_DRAFT (warning), BL_TLX_RELEASE
  (success), ARRIVAL_NOTICE (info), DEBIT_NOTE (danger), GUARANTEE
  (navy), COMMERCIAL_INVOICE, PACKING_LIST, OTHER (neutral).

**SHA**: frontend `dd026c2` feat(timeline): severity badges + source labels

---

## Tarea 4 — Deploy + verificación ✅

### Merges a main

- Backend `c2af3cb` Merge feat/murchison-demo (Murchison Uruguay live demo)
- Frontend `9a4953d` Merge feat/murchison-demo (Murchison Uruguay live demo)

### Smoke tests post-deploy

Backend (Railway):
```
GET /api/quotes/Q-024-026                                   → 200
GET /api/quotes/Q-024-026/attachments                       → 200 (0 attachments, expected)
GET /static/attachments/OP-024-026/HBL_NGBS076774_DRAFT.pdf → 200
```

Backend regression (ops curadas previas siguen intactas):
```
GET /api/today                  → 200
GET /api/quotes/Q-0204          → 200
GET /api/contracts              → 200 (8 contratos)
GET /api/agent-decisions        → 200 (10 decisiones previas)
```

Frontend (Vercel):
```
GET /quotes/Q-024-026     → 200
GET /operations/OP-024-026 → 200
GET /today                → 200
GET /contracts            → 200
```

Auth check (login demo + fetch OP-024-026 con token):
```
OP: OP-024-026 · stakeholders: 15 · timeline: 22 · attachments: 7
```

Todo verde. Ninguna regresión.

---

## QUÉ ESPERAR EN VIVO

### MOMENTO 1: Cotización inicial
**URL**: https://rumbo-frontend.vercel.app/quotes/Q-024-026

**Qué se ve**:
- Hero con gradient navy→coral, código Q-024-026
- Status pill: `CLOSED_WON`
- ParsedDataGrid con 8 campos parseados (hair clips, NGB→BUE, 1x40HQ, FOB)
- AI parsing confidence pill: 96%
- CarrierComparisonTable con 4 carriers, ZIM ⭐ Recomendado, USD 1150
- RecommendationCard explicando ZIM (mejor precio + free time + frecuencia)
- SurchargesBlock: ISPS, BAF, Doc fee, total USD 210
- MarkupCalculator: 12.6%, USD 145 markup
- DraftEmailCard a Marcia con texto rioplatense

### MOMENTO 2: Operación en curso/cerrada
**URL**: https://rumbo-frontend.vercel.app/operations/OP-024-026

**Qué se ve**:
- HeroSection con OP-024-026, status COMPLETED
- Timeline completo (22 eventos) con 3 alertas críticas resaltadas:
  - "⚠ ALERTA: carga incluye baterías" (5-feb)
  - "Servicio inicial perdido" (10-feb)
  - "⚠ ALERTA: MBL no emitido en destino" (4-mar)
- Cada timeline event con source label (🌏 Agente origen / 🚢 Carrier / etc)
- Sección Stakeholders (panel izquierdo, 4 empresas, 15 contactos, primaries
  destacados)
- Sección Documentos asociados (panel derecho, 7 cards clickeables — PDFs
  reales que se abren en nueva tab desde Vercel cdn → Railway static).

### MOMENTO 3: Dashboard
**URL**: https://rumbo-frontend.vercel.app/today

**Qué se ve**:
- Performance KPIs (los que ya estaban)
- Sección "Operaciones críticas" mostrando OP-0142, OP-0173, OP-0184
- OP-024-026 NO aparece en críticas porque está CLOSED. Si querés
  destacarla en vivo, podés alternar `isCritical=true` y `criticalHeadline`
  manualmente desde la BD antes de la demo (es campo aditivo, no rompe).
  Comando rápido (no ejecutado, lo dejo listo):
  ```
  DATABASE_URL=... npx tsx -e "
    import('@prisma/client').then(async ({PrismaClient}) => {
      const p = new PrismaClient()
      await p.operation.update({
        where:{id:'cmqa0cafb0003q5xvczw9v96f'},
        data:{isCritical:true,criticalSeverity:'high',
              criticalHeadline:'Re-cotización urgente: li-battery detectado',
              criticalImpact:'+USD 300 vs cotización original'}
      })
      console.log('OP-024-026 marcada como crítica')
      await p.\$disconnect()
    })
  "
  ```

### MOMENTO 4: Modal Agent Decision
**URL**: desde `/today` o desde `/operations/OP-024-026`, click en cualquier
agent activity item con `decisionId` apuntando a `ad-mur-004`.

**Qué se ve**:
- Modal con 4 secciones:
  1. **Lo que vi**: cliente confirmó li-battery, ZIM rechazó.
  2. **Lo que consideré**: 4 alternativas evaluadas (MSC Carioca,
     MSC Ipanema, esperar ZIM, COSCO/Maersk).
  3. **Por qué decidí**: ETD evita CNY, free time 21d, histórico MSC
     0% incidentes, riesgo +USD 300 mitigado con aprobación explícita.
  4. **Lo que hice**: generé draft email, NO enviado (requiere aprobación
     humana).
- Footer: confidence 92%, timestamp 10-feb 15:00, agent QUOTE.

NOTA: para que `ad-mur-004` aparezca en el feed de Today, hay que tunear
el endpoint `/api/today` (hoy `AGENT_ACTIVITY` está hardcoded apuntando a
`ad-001..ad-010`). Workaround para demo en vivo: en `/operations/OP-024-026`
existe el agent feed real de la operación (si el frontend lo expone).

Si NO se ve, segundo workaround inmediato:
```
curl https://web-production-ad432.up.railway.app/api/agent-decisions/ad-mur-004
```
devuelve el JSON con todo el reasoning para mostrar.

---

## Estado de los deploys

| Repo | Branch | SHA main | Estado |
|---|---|---|---|
| rumbo-backend | main | c2af3cb | 🟢 Railway verde |
| rumbo-frontend | main | 9a4953d | 🟢 Vercel verde |

Ambos verificados con curl post-deploy.

---

## Riesgos detectados / Visual QA pendiente

1. **ad-mur-004 no aparece automático en `/today` agent activity feed**.
   El feed es hardcoded en `routes/today.ts` con `ad-001..ad-010`. Para
   que el modal destacado del demo (Momento 4) abra desde Today, hay que
   editar `AGENT_ACTIVITY` para incluir `ad-mur-004`. No lo toqué porque
   modifica el feed que va al primer scroll del usuario y no quería
   alterar la demo de las 4 ops curadas.

2. **OP-024-026 no aparece en "Operaciones críticas"** porque está
   CLOSED. Si Murchison espera ver el caso de li-battery como una alerta
   activa, hay que flipear `isCritical=true` manualmente. Dejé el snippet
   listo arriba.

3. **Visual QA cero**. No abrí browser. Layouts, especialmente la grid
   2-col Stakeholders+Documents en `/operations/OP-024-026`, no fueron
   verificados visualmente. Riesgo de overflow en mobile (1400px max-
   width pero stack vertical puede no ser ideal).

4. **publicUrl de attachments depende de `req.host`** (fallback) o
   `PUBLIC_BASE_URL` env. En Railway debería resolver a
   `https://web-production-ad432.up.railway.app` correctamente — pero
   si Vercel rewrites o algún proxy lo cambia, el link podría romper.
   Mitigación: setear `PUBLIC_BASE_URL=https://web-production-ad432.up.railway.app`
   en Railway env vars.

5. **`.doc` (Word) y `.docx` no se renderizan en browser** — se descargan.
   Esto es esperado para MBL_177NNMNMN02Z46A_DRAFT.doc y
   PGS_TelexRelease_Guarantee_CN_EN.docx. PDFs sí se ven inline en
   Chrome/Safari.

6. **`/api/operations/:id/attachments` está SIN auth** (mismo patrón que
   /api/quotes, /api/contracts). Para demo: OK. Para producción real:
   deuda — alguien con la op-code puede listar attachments. Documentado
   en LEARNINGS.md como deuda Sprint 1.

7. **Sprint 1 branch sigue sin mergear**. La branch
   `feat/sprint1-multitenant` con todo el refactor multi-tenant sigue
   intacta en remoto pero NO mergeada. Esta demo es single-tenant,
   compatible con prod actual. Cuando llegue Sprint 1 hay que re-aplicar
   estos cambios sobre la branch o cherry-pickear.

8. **No actualicé el endpoint `/api/operations/:id/attachments` para que
   sea consistente con el include en `/api/operations/:id`**. Hay dos
   maneras de obtener attachments: (a) embedded en la respuesta de la op
   (sin publicUrl, construir en cliente), o (b) endpoint dedicado (con
   publicUrl). El frontend usa (a). Funciona pero es divergente.

---

## Comandos útiles para re-correr si hace falta

```bash
# Re-correr seed (idempotente):
cd ~/Developer/Projects/rumbo-backend
DATABASE_URL="<prod>" npx tsx scripts/seed-murchison-op.ts

# Verificar attachments en BD:
curl -s https://web-production-ad432.up.railway.app/api/operations/OP-024-026/attachments

# Login demo y ver OP completa:
TOKEN=$(curl -s -X POST https://web-production-ad432.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"<password>"}' | jq -r '.token')
curl -s -H "Authorization: Bearer $TOKEN" \
  https://web-production-ad432.up.railway.app/api/operations/OP-024-026 | jq
```

---

## SHAs de commits

### Backend (rumbo-backend)
```
c2af3cb Merge feat/murchison-demo (Murchison Uruguay live demo)
6913524 feat(demo-murchison): seed real operation Ref 024/026
ca68b14 feat(attachments): Attachment model + static serving + /api/.../attachments
```

### Frontend (rumbo-frontend)
```
9a4953d Merge feat/murchison-demo (Murchison Uruguay live demo)
dd026c2 feat(timeline): severity badges + source labels
a961de6 feat(attachments,stakeholders): AttachmentsList + DocumentTypeBadge + StakeholdersPanel + integration
```

---

## Versiones temporales — 2026-06-11 (segunda sesión)

### Resumen

- **Hora inicio**: 20:14
- **Hora fin**: 20:28
- **Duración efectiva**: ~14 minutos
- **Tareas completadas**: T1 ✅ · T2 ✅ · T3 ✅ · T4 ✅ · T5 ✅

Sin stop conditions. Build limpio en ambos repos. Smoke tests post-deploy:
todas las versiones nuevas responden 200, ninguna regresión.

### Lo que se creó

**Schema** (`prisma/schema.prisma`):
- Modelo `SuggestedTask` con type/priority/draft completo/attachmentIds[]/
  isInformational/confidence/sortOrder/status. Back-relation
  `Operation.suggestedTasks[]`. Aditivo, db push a prod sin data loss.

**Backend** (`src/server.ts`):
- `GET /api/operations/:id/suggested-tasks` — devuelve tasks pending
  ordenadas + resuelve attachmentIds[] a Attachment records con publicUrl.
- `GET /api/operations` (lista del dashboard) ahora incluye `suggestedTasks`
  pendientes (select id+priority+title+type+isInformational) y ordena por
  `updatedAt desc` para que las 3 versiones aparezcan juntas.

**Seed** (`scripts/seed-murchison-versions.ts`):
- Idempotente, applied a prod via env.production.
- 3 operaciones nuevas:
  - `OP-024-026-T1` (5-feb): BOOKING_PENDING, isCritical, 6 timeline
    events, 0 attachments, 4 suggested tasks.
  - `OP-024-026-T2` (13-feb): BOOKING_CONFIRMED, 11 timeline events,
    3 attachments (HBL+HBL switch+MBL drafts), 3 suggested tasks.
  - `OP-024-026-T3` (4-mar): ON_BOARD, isCritical, 16 timeline events,
    4 attachments (los 3 anteriores + DebitNote), 4 suggested tasks.
- Total: **11 suggested tasks** (urgent: 2, high: 4, medium: 1, low: 4)
- Archivos físicos: `public/attachments/OP-024-026-T2/` (3) y
  `public/attachments/OP-024-026-T3/` (4).

**Frontend**:
- `src/components/SuggestedTasksPanel.tsx` — cards con border color por
  priority, agent badge con icon, draft preview con toggle "Ver mensaje",
  attachments pills clickeables, CTAs distintas por tipo (urgent/draft/
  action/informational). Urgentes empiezan con el body expandido por
  default.
- Integrado en `/operations/[id]/page.tsx` justo después del hero.
- `src/app/dashboard/page.tsx` getAlertInfo() ahora suma SuggestedTask al
  count (mapeo urgent/high→HIGH, medium→MEDIUM, low→LOW; isInformational
  ignoradas). Backwards-compat: ops sin suggested tasks se comportan igual.

### Smoke tests post-deploy

```
OP-024-026-T1 → 4 suggested tasks (1 urgent), 0 attachments
OP-024-026-T2 → 3 suggested tasks (0 urgent), 3 attachments
OP-024-026-T3 → 4 suggested tasks (1 urgent), 4 attachments
OP-024-026    → 0 suggested, 22 timeline, 7 attachments (intacta)

4 ops curadas (OP-0142/0173/0184/23714) → 200 OK
Q-0204, Q-024-026, /contracts, /today → 200 OK
Frontend /dashboard, /operations/OP-024-026-T{1,2,3} → 200 OK
Static PDFs T2/T3 servidos correctamente
```

`/api/operations` lista trae **8 operations totales**:
- 4 curadas (OP-0142, OP-0173, OP-0184, OP-23714)
- OP-024-026 (final DELIVERED)
- OP-024-026-T1, T2, T3 (nuevas versiones temporales)

Las 4 versiones de Ref 024/026 aparecen juntas al inicio del dashboard
por el orderBy updatedAt desc.

### QUÉ ESPERAR EN VIVO

**MOMENTO T1 (5-feb-2026 — crisis de baterías)**
URL: https://rumbo-frontend.vercel.app/operations/OP-024-026-T1
- Hero con status BOOKING_PENDING + alert crítico
- Panel "Tareas sugeridas · 4" con badge "1 urgente" rojo arriba
- Card 1 (urgente, expandida por default): REPLY a Patricia · draft en
  rioplatense pidiéndole confirmar tipo de baterías
- Card 2 (high): QUOTE · "Re-cotizar con MSC y Maersk" con CTA navy
- Card 3 (high): REPLY a Parisi NGB · draft en inglés pidiendo hold
- Card 4 (low informational): WATCH · "Programar follow-up en 24h"
- Timeline con 6 eventos hasta el 5-feb-2026
- 0 documentos asociados (todavía no llegaron drafts BL)
- Stakeholders panel intacto (15 contactos)

**MOMENTO T2 (13-feb-2026 — booking confirmado)**
URL: https://rumbo-frontend.vercel.app/operations/OP-024-026-T2
- Hero con status BOOKING_CONFIRMED (verde) — sin alerta
- Panel "Tareas sugeridas · 3"
- Card 1 (high): REPLY a Sofía con **3 attachments pills** clickeables
  (HBL, HBL switch, MBL drafts) — los PDFs abren la versión correcta
  desde public/attachments/OP-024-026-T2/
- Card 2 (high): REPLY a Maria Fernanda con HBL pdf adjunto
- Card 3 (low informational): CLEAR · "validó 3 documentos vs booking
  JSY260252 · sin discrepancias"
- Timeline con 11 eventos
- Sección Documentos con 3 attachments

**MOMENTO T3 (4-mar-2026 — discrepancia MBL)**
URL: https://rumbo-frontend.vercel.app/operations/OP-024-026-T3
- Hero con status ON_BOARD + alert crítico "MBL emitido en origen"
- Panel "Tareas sugeridas · 4" con badge "1 urgente"
- Card 1 (urgente, expandida): REPLY a Candy Xu · draft en INGLÉS
  reclamando emisión en destino
- Card 2 (high): REPLY a Sofía/Lucio · draft español
- Card 3 (medium informational): CLEAR · "detectó inconsistencia
  documental" con DebitNote como attachment
- Card 4 (low informational): WATCH · "follow-up en 12h"
- Timeline con 16 eventos
- Sección Documentos con 4 attachments

**MOMENTO Final**
URL: https://rumbo-frontend.vercel.app/operations/OP-024-026
- La operación final (DELIVERED) tal como estaba. 0 suggested tasks
  (no se le agregaron). El panel "Tareas sugeridas" NO se renderiza
  (condicional sobre tasks.length > 0).
- Timeline con 22 eventos, 7 attachments, stakeholders intactos.

### Riesgos detectados / Visual QA pendiente

1. **Visual QA cero**. No abrí browser. Layouts del SuggestedTasksPanel
   (especialmente en mobile) no fueron verificados.
2. **Botones "Aprobar y enviar" + "Descartar" no hacen nada todavía** —
   son visuales para el demo. Cuando Agustín quiera implementar la
   funcionalidad real, hay que wirear POST/PATCH al backend.
3. **Dashboard puede verse cargado**: ahora hay 8 ops totales (vs las 5
   anteriores). Las 4 versiones de Ref 024/026 aparecen juntas al inicio
   por updatedAt desc. Si Murchison quiere verlas agrupadas visualmente
   (ej. con un divider o subtítulo), no está implementado — solo aparecen
   adyacentes por timing.
4. **PROBLEMA conocido del Dashboard**: si una operation no tiene
   `tasks` array (como las nuevas versiones T1/T2/T3 que no tienen Tasks
   legacy), `getAlertInfo` ahora cae correctamente a `suggestedTasks`.
   Pero las ops curadas viejas tienen Tasks legacy + ningún SuggestedTask,
   así que la columna sigue mostrando lo que mostraba antes. Backwards-compat.
5. **Estados visuales del hero**: T1 dice "BOOKING_PENDING" mientras T2
   dice "BOOKING_CONFIRMED" y T3 "ON_BOARD". El badge de status (SUB_STATUS_CONFIG
   en /operations/[id]/page.tsx) reconoce estos 3. Si faltara alguno la
   página crashearía (es deuda conocida — LEARNINGS.md). Los 3 que uso
   están en el config.
6. **OrderBy cambió de createdAt → updatedAt en /api/operations**: las
   ops curadas que no se updatearon recientemente bajan en la lista del
   dashboard. Estéticamente las 4 versiones de Ref 024/026 quedan al
   inicio porque el seed las modificó hoy. Si querés volver a createdAt
   desc, cambiar en server.ts línea ~155.

### SHAs de commits

#### Backend (rumbo-backend)
```
d039cb7 Merge feat/murchison-versions (3 timed snapshots T1/T2/T3 + SuggestedTask)
9669984 feat(demo): seed Murchison operation versions T1, T2, T3 with 11 suggested tasks
c349c86 feat(suggested-tasks): GET /api/operations/:id/suggested-tasks endpoint + include in /api/operations
fb2f80f feat(suggested-tasks): add SuggestedTask model + Operation back-relation
```

#### Frontend (rumbo-frontend)
```
12297a5 Merge feat/murchison-versions (SuggestedTasksPanel + dashboard alerts)
0ffa551 feat(dashboard): incluir SuggestedTask en columna "Próxima acción"
5075e18 feat(operations): SuggestedTasksPanel with draft preview + attachments inline
```
