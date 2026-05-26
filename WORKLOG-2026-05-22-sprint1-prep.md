# Worklog Sprint 1 Prep — 2026-05-22 (autonomous, 5h)

## Resumen

- **Hora inicio**: 19:41 (2026-05-25 en máquina; sesión etiquetada
  2026-05-22 según el contexto del proyecto)
- **Hora fin**: 22:18 (~2h 37m efectivos; bajo el budget de 5h)
- **Tarea 1 (docs)**: ✅ completada y pusheada a `main`
- **Tarea 2 (plan)**: ✅ completada y pusheada a `main`
- **Tarea 3 (PR1 código)**: ✅ completada, pusheada a la branch
  `feat/sprint1-multitenant` (NO a main), 6 commits, build limpio,
  19 tests pasan

---

## Tarea 1 — Docs

3 archivos editados, pusheados a main como `2655a4b`:

- `LEARNINGS.md` → sección nueva "Reunión Free Customs S.A. — 2026-05-20"
  con perfil, pain points, qué resonó, requisitos, próximos pasos e
  implicancia para producto.
- `DECISIONS.md` → ADR-010 (Sprint 1 con Claude Code + auditoría de
  ingeniero antes de data real).
- `ROADMAP.md` → demo del 2026-05-18 movida a sección "Histórico" al final;
  nota de URGENCIA DE NEGOCIO en Sprint 1; nueva tarea "crear BD de
  desarrollo separada (Neon branch)" al inicio de PR1.

---

## Tarea 2 — SPRINT1-PLAN.md

Archivo nuevo en `SPRINT1-PLAN.md` (555 líneas, pusheado a main como
`d19f772`). 8 secciones (A-H):

- A. Schema propuesto — Organization, Membership, organizationId nullable
  en 9 modelos
- B. Plan de migración — script idempotente con transacción + assertions
- C. Lista exhaustiva de archivos a tocar (backend + frontend) basada en
  exploración con sub-agentes (90+ referencias a userId mapeadas)
- D. Plan de rollback — snapshot Neon `pre-sprint-1-baseline`
- E. Orden de ejecución de PR1/PR2/PR3 + qué se rompe vs. compat layer
- F. **Los 4 pasos que requieren al usuario presente** (replicada abajo)
- G. Preguntas abiertas para Agustín (6 decisiones de scope)
- H. Definition of Done para PR1

---

## Tarea 3 — PR1 en `feat/sprint1-multitenant`

### Branch y push

- Nombre: `feat/sprint1-multitenant`
- Pusheada a `origin/feat/sprint1-multitenant`: ✅ sí
- URL para crear PR (cuando estés listo):
  https://github.com/rumbo-dev/rumbo-backend/pull/new/feat/sprint1-multitenant
- **NO mergeada a main** (per instrucciones)
- **NO migración aplicada a ninguna BD** (per instrucciones)

### 6 commits dentro de la branch (chronological)

```
983122d feat(schema): add Organization + Membership models + organizationId nullable
93c6ac3 feat(lib): tenancy extension + auth helpers + prisma singleton
22b8eab feat(server,agents): refactor for multi-tenant — server.ts + Orchestrator + EmailService
a2aa4b5 feat(routes): refactor today/aiChat/quotes/contracts/agentDecisions for multi-tenant
95d1995 feat(scripts): add sprint1 backfill + update seeds for organizationId
5c1168d test: add vitest setup + 19 tests (auth, tenancy helpers, cross-tenant)
```

Stats: 26 archivos cambiados, +2930 / -385 líneas.

### Qué quedó implementado y compila

✅ **Schema** (`prisma/schema.prisma`)
- `Organization` (id, name, slug unique, isDemo, timestamps)
- `Membership` (User ↔ Organization, role OWNER|ADMIN|MEMBER, isDefault)
- `organizationId String?` (nullable) en 9 modelos: Operation, Task, Quote,
  Contract, AgentDecision, EmailDraft, EmailInbound, JourneyStep,
  TimelineEvent
- Índices compuestos: `(organizationId, status)`, `(organizationId, isCritical)`, etc.
- Validado con `npx prisma validate` ✅
- Client regenerado con `npx prisma generate` ✅

✅ **Librerías core** (`src/lib/`)
- `prismaClient.ts` — singleton (reemplaza las instancias dispersas)
- `tenancy.ts` — `forOrg(organizationId)` con `$extends` que inyecta
  organizationId en findMany/findFirst/count/create/createMany/updateMany/
  deleteMany sobre los 9 modelos tenant-scoped + helpers exportados
  (isTenantModel, injectWhere, injectData) para testability
- `auth.ts` — JWT_SECRET **fail-fast** (throw al import si la env var falta),
  AuthRequest type, authMiddleware, optionalAuthMiddleware (compat layer),
  requireOperationOwnedBy / requireDraftOwnedBy / requireTaskOwnedBy,
  signToken con shape consistente (userId + organizationId + membershipId)

✅ **server.ts** — refactor completo
- Removido fallback inseguro de JWT_SECRET, todo viene de `lib/auth.ts`
- POST `/api/auth/login` ahora emite token con organizationId, devuelve
  organization + memberships en el response
- NUEVO endpoint **GET `/api/me`** (devuelve user + memberships + currentOrgId)
  para que el frontend pueble el selector en PR2
- Todos los endpoints autenticados filtran por `req.organizationId`
- Los 4 spots de "fetch-then-compare userId" → reemplazados por
  `requireOperationOwnedBy` / `requireTaskOwnedBy` / `requireDraftOwnedBy`
- **Fix crítico** en POST `/api/emails/webhook`: ya no hace
  `findMany({take:1})` sin filtro. Requiere `operationCode` en el body;
  si no matchea, devuelve 404 + log para review (Mailgun real wired en
  Sprint 2 con firma + threading)
- POST `/api/operations`: el auto-generator de OP-XXXX busca el max
  DENTRO de la org (no global), permitiendo que dos orgs distintas
  empiecen en OP-0001
- POST `/api/emails/process-and-create`: pasa organizationId al Orchestrator

✅ **agents y services**
- `Orchestrator.ts` → input requiere `organizationId`, lo setea en todos
  los creates (Operation, EmailInbound, EmailDraft, Task, TimelineEvent,
  AgentDecision); helpers internos `applyStatusUpdate` y
  `createInitialJourneySteps` también reciben org
- `EmailParser.ts` → match queries por `organizationId` (operationCode,
  container, BL, booking, sender_match) — cierra el riesgo de match
  cross-tenant
- `EmailService.ts` → lee `operation.organizationId` y lo setea en
  EmailInbound, TimelineEvent, Task, EmailDraft

✅ **routes** — todos refactoreados
- `today.ts`, `aiChat.ts`, `quotes.ts`, `contracts.ts`, `agentDecisions.ts`
- Aplicado `optionalAuthMiddleware` como **compat layer transitorio** (PR3
  lo quita): con token → org del user; sin token → Demo Org pública
- Removido el hardcoded `email: 'demo@example.com'` lookup
- aiChat: `executeTool` recibe `organizationId` como parámetro y filtra
  con ese campo en las 4 tools que tocan BD

✅ **scripts**
- `scripts/sprint1-migrate-to-multitenant.ts` (NUEVO, idempotente):
  upsert Demo Organization (`slug: "demo-org"`, `isDemo: true`), upsert
  user `demo-public@rumbo.io` (password via env `DEMO_PUBLIC_PASSWORD`,
  default `"rumbo-demo-2026"`), 2 Memberships, backfill organizationId
  en los 9 modelos, assertions al final (aborta con exit 1 si quedan
  orphans o Demo Org count ≠ 1)
- `seed-quotes.ts` / `seed-contracts.ts` / `seed-agent-decisions.ts`
  aceptan `--orgSlug=<slug>` (default `demo-org`) y setean
  organizationId en cada create

✅ **tests** (vitest)
- 19 tests, todos pasan (`npm test`: 19/19 en ~220ms)
- `tests/tenancy-helpers.test.ts` (12 tests): isTenantModel, injectWhere
  (incluido test de "tenancy violation" cuando un caller intenta otra
  org), injectData (idem)
- `tests/auth.test.ts` (3 tests): JWT_SECRET seteado, signToken emite
  JWT con shape correcto, token expira en 24h
- `tests/cross-tenant.test.ts` (4 tests): prisma mockeado con
  `vi.hoisted`; `requireOperationOwnedBy` filtra por organizationId
  + operationCode/id; devuelve null cuando la op pertenece a otra org;
  `requireDraftOwnedBy` y `requireTaskOwnedBy` filtran igual

### Qué quedó pendiente de verificar tras la migración

Estos puntos compilan limpio (`npm run build` y `npm test` pasan), pero
**no fueron ejecutados contra BD real** porque eso requiere los pasos del
usuario presente:

1. **Backfill script real**: el script de migración no se ejecutó. La
   primera corrida tiene que ser contra una BD dev (Neon branch). Si las
   assertions del script pasan ahí, después prod.
2. **Login con organización**: el response de POST `/api/auth/login` ahora
   incluye `organization` y `memberships[]`. El frontend PR2 lo va a
   consumir; hoy nadie lo testeó end-to-end.
3. **Endpoint /api/me**: no consumido por nadie todavía. PR2 lo va a usar
   para poblar el selector de org en el sidebar.
4. **Compat layer**: `optionalAuthMiddleware` ya está activo en
   today/quotes/contracts/aiChat/agentDecisions. La idea es que el
   frontend viejo siga funcionando sin token (cae a Demo Org pública).
   No testeado en vivo.
5. **/api/emails/webhook**: el fix del bug crítico está in place pero
   nadie disparó el webhook contra la BD migrada. Cuando se haga en
   Sprint 2 con Mailgun, validar que un email con `operationCode: "OP-XXXX"`
   en el body matchea correctamente.

### Preguntas abiertas para Agustín (decisiones que no podían inferirse)

(Replicadas de `SPRINT1-PLAN.md` sección G por conveniencia)

1. ¿Borramos `userId` de los modelos tenant-scoped en PR3, o lo dejamos
   renombrado como `createdByUserId` para auditoría? Mi recomendación:
   conservar como auditoría.
2. **Demo Org slug**: hardcodeé `demo-org`. ¿Cambiamos a `demo` o
   `rumbo-demo`?
3. **Email del user público**: hardcodeé `demo-public@rumbo.io`. ¿OK?
4. ¿`demo@example.com` sigue como OWNER de la Demo Org, o creamos
   `admin@rumbo.io` y bajamos a demo a MEMBER? Mi recomendación: dejarlo
   como OWNER.
5. **JWT_SECRET fail-fast en PR1**: ya está activo. Significa que si
   Railway no tiene la env var seteada cuando se deploye PR1, el server
   crashea en boot. Verificar antes del merge que `JWT_SECRET` está
   seteada en Railway.
6. **`optionalAuthMiddleware` activo en PR1**: confirmar OK que esto se
   quite recién en PR3 (mantiene compat durante demos).

---

## LOS 4 PASOS PARA CUANDO VUELVAS

Copiado de `SPRINT1-PLAN.md` sección F. Comandos exactos:

### Paso 1 — Crear BD de desarrollo (Neon branch)

1. Ir a Neon Console → proyecto Rumbo
2. Tab "Branches" → "Create branch"
3. Nombre: `sprint-1-dev`
4. Source: `main` (estado actual de prod)
5. Copiar la connection string
6. Guardarla como `.env.local`:
   ```bash
   echo "DATABASE_URL=\"<connection-string>\"" > rumbo-backend/.env.local
   ```

### Paso 2 — Aplicar migración de schema

Contra BD dev primero, después prod:

```bash
cd rumbo-backend
git checkout feat/sprint1-multitenant

# 1) Contra dev
DATABASE_URL="<dev-url>" npx prisma db push

# 2) Verificar (opcional)
DATABASE_URL="<dev-url>" npx prisma studio
# Chequear que aparecen Organization y Membership

# 3) Contra prod
DATABASE_URL="<prod-url>" npx prisma db push
```

`prisma db push` es aditivo (nuevas tablas + columnas nullable + índices).
No borra nada. Si Prisma pide confirmación interactiva, leer cuidadoso —
no debería ocurrir con este schema.

### Paso 3 — Correr script de backfill

Contra BD dev primero:

```bash
DATABASE_URL="<dev-url>" npx tsx scripts/sprint1-migrate-to-multitenant.ts

# Output esperado:
# ✓ Demo Organization upserted
# ✓ demo-public user upserted
# ✓ Membership demo@example.com OWNER default
# ✓ Membership demo-public@rumbo.io MEMBER default
# ✓ Operations backfilled: 4
# ✓ Quotes backfilled: 5
# ✓ Contracts backfilled: 8
# ✓ AgentDecisions backfilled: 10
# ✓ Tasks/JourneySteps/TimelineEvents/EmailDrafts/EmailsInbound backfilled: N
# ✓ Assertions passed (0 orphans).
# ✅ MIGRATION COMPLETE

# Si las assertions fallan, NO seguir. Revisar manualmente.

# Smoke test contra dev:
DATABASE_URL="<dev-url>" npm run build
DATABASE_URL="<dev-url>" npm run dev
# En otra terminal:
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"<password>"}'
# Verificar que el response trae token + organization + memberships

# Después, contra prod:
DATABASE_URL="<prod-url>" npx tsx scripts/sprint1-migrate-to-multitenant.ts
```

### Paso 4 — Merge a main + deploy + cutover de auth

```bash
# 4.1 — Smoke test final en dev
DATABASE_URL="<dev-url>" npm test
# 19/19 deberían pasar

# 4.2 — Merge a main
git checkout main
git pull origin main
git merge --no-ff feat/sprint1-multitenant -m "Merge feat/sprint1-multitenant (PR1)"
git push origin main
# → Railway auto-deploya

# 4.3 — Verificar deploy en Railway
# Railway Dashboard → check que JWT_SECRET está seteada. Si no, setearla
# ANTES de que el deploy arranque (el server crashea sin ella).
curl https://web-production-ad432.up.railway.app/api/today
# Con optionalAuthMiddleware activo: devuelve data Demo Org (no 401)
# Sin optionalAuth (PR3): debería devolver 401

# 4.4 — Cutover de auth (esto YA es PR3, no PR1)
# Sucede después de mergear PR2 (frontend con login real).
# - Cherry-pick los commits de PR3 (quitar optionalAuth, NOT NULL en
#   organizationId, rotate JWT_SECRET)
# - Rotar JWT_SECRET en Railway → Settings → Variables → JWT_SECRET = <nuevo>
# - Railway redeploya → invalida todos los tokens
# - Avisar a usuarios beta (cero) que re-loguen
```

---

## Riesgos detectados

1. **`optionalAuthMiddleware` puede ser permanente por accidente**: la
   tentación de no mergear PR3 es alta (rompe demos sin token). Sugiero
   dejar un TODO visible en el código y un issue en GitHub para no
   olvidarlo. Sprint 1 sin PR3 es deuda de seguridad.

2. **Bcrypt password del user demo-public**: el default
   `"rumbo-demo-2026"` está hardcoded en el script. Bajo en sensibilidad
   (es un user público de demos), pero conviene cambiarlo a algo único
   antes del primer cliente real via `DEMO_PUBLIC_PASSWORD` env var.

3. **Webhook de Mailgun (Sprint 2)**: el matching actual exige
   `operationCode` en el body. Hasta Sprint 2 con Mailgun + threading
   real, cualquier email externo que no traiga el código va a devolver
   404. Esto es comportamiento correcto pero podría sorprender si alguien
   intenta probar el endpoint sin contexto.

4. **JWT_SECRET fail-fast es agresivo**: si Railway pierde la env var por
   alguna razón, el server crashea en boot y el deploy falla.
   Trade-off consciente con la deuda crítica de seguridad. Vale la pena
   pero hay que monitorear el primer deploy.

5. **Tests vitest no tocan BD**: cubren la lógica de tenancy y los
   helpers críticos pero NO testean integración real. Tests de
   integración con BD viven en PR3.

6. **`findUnique` no recibe inyección de tenancy**: limitación
   documentada en `src/lib/tenancy.ts`. Si en el futuro alguien hace
   `prisma.operation.findUnique({ where: { id }})` en lugar de pasar
   por `requireOperationOwnedBy`, no hay defensa automática. Mitigación
   posible: un lint custom o un pre-commit hook que warna sobre
   `findUnique` en modelos tenant-scoped. No incluido en PR1.

7. **No revisado por engineer todavía** (ADR-010): antes de cargar data
   real de Free Customs, este código necesita ojos de ingeniero. Las 19
   tests son lo mínimo viable, no exhaustivas.

---

## Stats de la sesión

- **Tiempo efectivo**: ~2h 37m (de las 5h disponibles)
- **Commits en main**: 2 (docs)
- **Commits en feat/sprint1-multitenant**: 6
- **Archivos tocados en la branch**: 26
- **Líneas de código netas**: +2930 / -385
- **Tests pasando**: 19/19
- **Build pasando**: ✅ TypeScript clean
- **Pusheado a main**: solo docs (2 commits)
- **Pusheado a remoto en branch**: feat/sprint1-multitenant (6 commits)

---

## Próximo paso para Agustín

1. Leer `SPRINT1-PLAN.md` y este worklog.
2. Decidir las 6 preguntas abiertas (sección G del plan / arriba acá).
3. Ejecutar los 4 pasos en orden (Neon branch → schema → backfill → merge).
4. Después de merge, arrancar PR2 (frontend: login real + selector + auth
   headers en /today, /quotes, /contracts, AIChatButton).
5. Cuando PR2 esté en main: arrancar PR3 (cleanup: quitar optionalAuth,
   NOT NULL en organizationId, rotar JWT_SECRET).
6. **Antes de la demo con datos de Free Customs**: pedir auditoría de
   ingeniero al código de tenancy + auth (ADR-010). Esto bloquea el
   onboarding del primer cliente real.
