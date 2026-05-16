# Rumbo — Learnings y deudas técnicas detectadas

Última actualización: 2026-05-16

Catálogo de problemas, anti-patrones y riesgos detectados durante el
onboarding del 2026-05-16. Cada item tiene severidad, ubicación, y sprint
en el que se aborda.

Convención de severidad:
- 🔴 Crítico — bloquea o expone data
- 🟡 Importante — degrada calidad o seguridad
- 🟢 Cosmético / mejora futura

---

## Seguridad

### 🔴 JWT_SECRET con fallback inseguro
**Ubicación:** `rumbo-backend/src/server.ts:16`
**Síntoma:** `JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'`.
Si la env var no está seteada en Railway, los tokens se firman con el string
literal del repo. Cualquiera con el repo puede forjar tokens válidos.
**Fix:** Sprint 1. Require env var presente, fail-fast en boot si falta.

### 🔴 `/api/emails/webhook` sin validación de firma
**Ubicación:** `rumbo-backend/src/server.ts:169`
**Síntoma:** Cualquiera puede `POST` al webhook y meter emails arbitrarios
en el pipeline AI.
**Fix:** Sprint 2 (cuando Mailgun esté wired).

### 🔴 `/api/emails/webhook` rompe en multi-tenant
**Ubicación:** `rumbo-backend/src/server.ts:174`
**Síntoma:** `prisma.operation.findMany({ take: 1 })` toma la primera op
del global sin filtrar. En multi-tenant esto adjunta emails de la org A a
operations de la org B.
**Fix:** Sprint 1 (mientras se hace el refactor de tenancy).

### 🟡 `/api/today` y `/api/ai/chat` son públicos hoy
**Ubicación:** `rumbo-backend/src/routes/today.ts:35`,
`rumbo-backend/src/routes/aiChat.ts:159`
**Síntoma:** Ambos resuelven `userId` por `email: 'demo@example.com'`
hardcoded; el frontend de `/today` ni siquiera manda Authorization header.
**Fix:** Sprint 1. Es breaking change para la demo en vivo — se mitiga con
el botón "Probar demo" en el frontend (ver ADR-004).

### 🟡 Sin rate limiting en `/api/auth/login`
**Síntoma:** Brute-force libre.
**Fix:** Sprint 2.

### 🟡 Sin validación de tamaño de input en `/api/ai/chat`
**Síntoma:** Un cliente puede mandar prompts gigantes y disparar el costo
de API.
**Fix:** Sprint 2.

### 🟡 JWT en `localStorage` (vulnerable a XSS)
**Síntoma:** El propio CLAUDE.md frontend ya marca que `localStorage` no es
persistente entre dispositivos.
**Fix:** Sprint 3. Mover a cookies `httpOnly` + refresh tokens.

### 🟡 `operationCode` enumerable en URLs
**Síntoma:** `/operations/OP-0142` — si la auth no es tight, alguien itera
códigos.
**Fix:** Mitigado por auth real (Sprint 1).

---

## Autorización transversal

### 🟡 Patrón frágil "fetch sin filtro, comparar después"
**Ubicación:** `rumbo-backend/src/server.ts:130` (PATCH operations),
`rumbo-backend/src/server.ts:187` (drafts), entre otros.
**Síntoma:** `findUnique({ where: { id }})` y después comparar `userId` en
código. Funciona pero un copy/paste sin el chequeo fuga data.
**Fix:** Sprint 1. Helper `requireOperationOwnedBy(orgId, opId)` + Prisma
middleware que inyecta filtro de tenancy (ver ADR-005).

### 🟡 Resolución de userId/orgId en lugares profundos del código
**Ubicación:** `rumbo-backend/src/routes/aiChat.ts:159-164` (executeTool
resuelve userId hardcoded por email).
**Síntoma:** Si una tool nueva se agrega y olvida pasar `userId` al `where`
de Prisma, lee data de otros tenants.
**Fix:** Sprint 1 vía Prisma middleware (ADR-005).

---

## Calidad de código

### 🟡 Cero tests en ambos repos
**Síntoma:** No hay vitest/jest/playwright instalado, ni carpeta
`__tests__`, ni archivos `*.test.ts`.
**Fix:** Sprint 1. Introducir vitest, tests mínimos de auth + ownership
cross-org.

### 🟡 `operations/[id]/page.tsx` tiene 902 líneas
**Ubicación:** `rumbo-frontend/src/app/operations/[id]/page.tsx`
**Síntoma:** Types + `SUB_STATUS_CONFIG` hardcoded + fetching + hero +
journey + timeline + drafts todo junto.
**Fix:** Sprint 3 (refactor a sub-componentes).

### 🟡 Frontend crashea si llega un subStatus no listado
**Ubicación:** `rumbo-frontend/src/app/operations/[id]/page.tsx:109`
**Síntoma:** `SUB_STATUS_CONFIG` está hardcoded. Si el backend devuelve un
valor no listado, falla render.
**Fix:** Quick fix con fallback genérico (cuando se pueda). Fix estructural
en Sprint 3 con enums Prisma (ADR-008).

### 🟡 Schema usa `String` para todos los enums
**Ubicación:** `rumbo-backend/prisma/schema.prisma`
**Síntoma:** `status`, `subStatus`, `currentOwner`, `role`, `team`, etc.
son `String`. Fácil seedear un valor inválido y descubrir el bug en prod.
**Fix:** Sprint 3 (ADR-008).

### 🟢 Bug conocido: `TimelineNarrative` usa `new Date()` en vez de `completedAt`
**Ubicación:** `rumbo-frontend/src/app/operations/[id]/page.tsx` y
mencionado en ambos CLAUDE.md.
**Síntoma:** JourneySteps aparecen con fecha = hoy en lugar de su fecha
real.
**Workaround actual:** vaciar `narrativeNote` cuando duplica un
`timelineEvent`.
**Fix:** Sin sprint asignado. No bloquea demo.

---

## Higiene del repo

### 🟢 Archivos backup sucios — LIMPIAR ANTES DE SPRINT 1
**Ubicación:**
- `rumbo-frontend/src/app/operations/[id]/page.backup.tsx`
- `rumbo-frontend/src/app/operations/[id]/page.tsx.bakE1`
- `rumbo-frontend/src/app/page.backup.tsx`
- `rumbo-frontend/fix-map.js`
- `rumbo-frontend/fix-map-final.js`
- `rumbo-frontend/patch-map.js`
- `rumbo-frontend-BACKUP-HOY/` (directorio entero, hermano de los repos)
- `rumbo-backend/prisma/schema.backup-20260430.prisma`
**Síntoma:** Generan ruido, confusión sobre cuál es el archivo vivo.
**Fix:** Borrar ahora (acordado 2026-05-16).

### 🟢 `scripts/` no versionado
**Ubicación:** `rumbo-backend/.gitignore`
**Síntoma:** Contiene URLs viejas de DB hardcoded, por eso está ignorado.
Resultado: los seeds que construyeron las 4 ops curadas "que no se pueden
borrar" no están versionados.
**Fix:** Sprint 1 side task. Re-versionar con `DATABASE_URL` como env var
explícita (no hardcoded).
**Progreso parcial (2026-05-16):** `scripts/seed-quotes.ts` ya está
versionado con la convención env-var como excepción explícita en
`.gitignore`. Los otros scripts siguen ignorados hasta Sprint 1.

### 🟢 Sin design system formal
**Síntoma:** CSS variables + estilos inline en JSX. Aguanta demos cortas,
no escala.
**Fix:** Sprint 2 o 3. Refactor de tokens + componentes reusables.

### 🟢 `yesterdayStats` hardcoded
**Ubicación:** `rumbo-backend/src/routes/today.ts`
**Síntoma:** Documentado como TODO en CLAUDE.md.
**Fix:** Sin sprint asignado. Computar desde EmailInbound + Task + Operation
+ TimelineEvent.

### 🟢 `compare_carriers` tool hardcoded
**Ubicación:** `rumbo-backend/src/routes/aiChat.ts`
**Síntoma:** Documentado como TODO. Requiere data histórica de ops
cerradas.
**Fix:** Roadmap post-Sprint 3.

---

## Patrones que SÍ funcionan (no tocar)

- **Specialist contract `SpecialistAgent<TInput, TOutput>`**: agregar un
  agent nuevo son ~200 líneas + un case en orchestrator routing. Decisión
  consciente y validada.
- **Anthropic SDK directo, sin wrappers** (ADR-009): control total sobre
  prompts y tool use.
- **`/api/operations/:id` acepta UUID OR operationCode**: regex `/^OP-/i`
  detecta cuál es. Permite URLs compartibles legibles.
- **`AgentDecision` log con confidence + human override**: estructura ya
  preparada para tracking de calidad de agents.
