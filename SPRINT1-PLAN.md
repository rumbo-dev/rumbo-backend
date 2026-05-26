# Sprint 1 — Plan detallado (Multi-tenant + Auth)

Última actualización: 2026-05-22 (autonomous Sprint 1 prep)

> Documento de planificación. Las decisiones de arquitectura están en
> `DECISIONS.md` (ADR-001 a ADR-010). Este plan implementa esas decisiones
> de forma operable, con orden de ejecución, archivos puntuales y los
> 4 pasos que requieren al usuario presente.

---

## A) Schema propuesto

### Modelos nuevos

```prisma
model Organization {
  id            String   @id @default(cuid())
  name          String
  slug          String   @unique         // "demo-org", "free-customs-sa"
  isDemo        Boolean  @default(false) // marca la Demo Organization compartida
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships   Membership[]
  operations    Operation[]
  tasks         Task[]
  quotes        Quote[]
  contracts     Contract[]
  agentDecisions AgentDecision[]
  emailDrafts   EmailDraft[]
  emailsInbound EmailInbound[]
  timelineEvents TimelineEvent[]
  journeySteps  JourneyStep[]

  @@index([slug])
  @@index([isDemo])
}

model Membership {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role            String   @default("MEMBER")  // OWNER | ADMIN | MEMBER (ver ADR-002)
  isDefault       Boolean  @default(false)     // org "actual" si el user pertenece a varias
  invitedAt       DateTime?
  acceptedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, organizationId])
  @@index([userId])
  @@index([organizationId])
}
```

### Cambios en User

```prisma
model User {
  // ... campos existentes (id, email, password, fullName, role, team, createdAt, updatedAt)
  memberships   Membership[]
  // Las relaciones operations[], tasks[], quotes[], contracts[], agentDecisions[]
  // se MANTIENEN durante el compat layer (PR1). Se BORRAN en PR3 (cleanup).
}
```

> `User.team` (`OPERATIONS | PRICING | SALES | CUSTOMER_SUPPORT | ADMIN`)
> se mantiene en User porque es la función del usuario y no cambia entre orgs
> (ADR-002). El `role` por-org va en `Membership`.

### Cambios en modelos tenant-scoped

Para cada modelo abajo agregar campo `organizationId String?` (NULLABLE en
PR1 para permitir migración online; pasa a NOT NULL en PR3 después del
backfill verificado). Agregar relation + index.

Modelos a tocar:

| Modelo | userId existente | organizationId nuevo |
|---|---|---|
| `Operation` | sí (FK obligatorio) | agregar opcional, backfill, eventualmente NOT NULL |
| `Task` | sí (FK obligatorio) | agregar opcional |
| `Quote` | sí (FK obligatorio) | agregar opcional |
| `Contract` | sí (FK obligatorio) | agregar opcional |
| `AgentDecision` | sí (FK opcional) | agregar opcional |
| `EmailDraft` | implícito vía operation | agregar directo (más rápido) |
| `EmailInbound` | implícito vía operation | agregar directo |
| `JourneyStep` | implícito vía operation | agregar directo |
| `TimelineEvent` | implícito vía operation | agregar directo |

Patrón (ejemplo en Operation):

```prisma
model Operation {
  // ... campos existentes ...
  organizationId  String?      // PR1: opcional. PR3: NOT NULL después del backfill
  organization    Organization? @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([organizationId, status])         // queries de today/dashboard
  @@index([organizationId, isCritical])     // queries de today.critical
  @@index([organizationId, isActionRequired]) // queries de today.suggestions
}
```

> **Por qué nullable en PR1:** evitar bloquear el `prisma db push` con un
> NOT NULL sin default sobre filas existentes. El compat layer rellena el
> campo al vuelo y un script de backfill lo carga de forma masiva antes del
> cutover. PR3 lo pasa a NOT NULL después de verificar `count(where: { organizationId: null }) = 0`.

### Cambios al JWT (ADR-001)

Hoy: `jwt.sign({ userId }, ...)` (server.ts:58).
Sprint 1: `jwt.sign({ userId, organizationId, membershipId }, ...)`.

> `organizationId` representa la "org activa" del user en esa sesión. Si el
> user cambia de org en el selector (PR2), se emite un token nuevo con la
> org distinta. `membershipId` opcional pero útil para auth checks rápidas.

---

## B) Plan de migración de datos

### Estado actual (lo que hay que migrar)

Hay un único User `demo@example.com` (id `cmohshayf0000t6a0b2tqy5xw`,
documentado en CLAUDE.md backend) que posee TODA la data:

- 4 ops curadas: OP-0142, OP-0173, OP-0184, OP-23714
- 5 quotes (incluyendo Q-0204 Andes Trading)
- 8 contracts (CTR-MSC-2026-Q2 + 7 más)
- 10 agent decisions (ad-001..ad-010)
- N tasks, journeySteps, timelineEvents, emailDrafts, emailsInbound

### Estrategia: Demo Organization compartida (ADR-004)

Toda la data del demo user pasa a una `Demo Organization` con `isDemo: true`
y `slug: "demo-org"`. Adicionalmente se crea un user `demo-public@rumbo.io`
con `Membership(role: MEMBER)` en esa Demo Org, para el botón "Probar demo"
del PR2. El user original `demo@example.com` sigue siendo `OWNER` de la
Demo Org para que las herramientas de admin sigan funcionando.

### Script de migración: `scripts/sprint1-migrate-to-multitenant.ts`

Idempotente (chequea existencia antes de crear). Ejecutable con:

```bash
DATABASE_URL="..." npx tsx scripts/sprint1-migrate-to-multitenant.ts
```

Pasos del script (en orden, dentro de una transacción Prisma `$transaction`):

1. **Upsert Demo Organization**
   - `Organization.upsert({ where: { slug: "demo-org" }, ... })`
   - Set `isDemo: true`, `name: "Demo Organization"`.

2. **Upsert user `demo-public@rumbo.io`**
   - Password: bcrypt-hashed de un valor configurable (env var
     `DEMO_PUBLIC_PASSWORD`, default `"rumbo-demo-2026"`).
   - `team: "OPERATIONS"`, `role: "OPERATIONS"`.

3. **Upsert Memberships**
   - `demo@example.com` → Demo Org como `OWNER`, `isDefault: true`.
   - `demo-public@rumbo.io` → Demo Org como `MEMBER`, `isDefault: true`.

4. **Backfill `organizationId` en todos los modelos tenant-scoped**

   Para cada modelo (Operation, Task, Quote, Contract, AgentDecision,
   EmailDraft, EmailInbound, JourneyStep, TimelineEvent):

   ```ts
   await prisma.operation.updateMany({
     where: { organizationId: null, userId: demoUser.id },
     data: { organizationId: demoOrg.id },
   });
   ```

   Repetir para los 9 modelos. JourneyStep / EmailInbound / EmailDraft /
   TimelineEvent que se vinculan vía `operationId` heredan la org del
   operation; en la práctica se hace un `updateMany` directo porque la
   relación ya está cargada.

5. **Verificación post-backfill (assertions)**

   El script aborta con error si:
   - `Operation.count({ where: { organizationId: null } }) > 0`
   - `Task.count({ where: { organizationId: null } }) > 0`
   - ... (idem para todos los modelos)
   - `Organization.count({ where: { isDemo: true } }) !== 1` (debe haber
     exactamente UNA Demo Org)

6. **Log final**: imprime un resumen de cuántas filas se migraron por modelo.

### Qué pasa con data huérfana

- Si el script falla a mitad: la transacción Prisma hace rollback, no queda
  data parcial. La columna `organizationId` ya estará agregada por el
  `prisma db push` previo, pero como es nullable, las filas viejas siguen
  funcionando con la app vieja (compat layer).
- Si una fila tiene `userId` que no es del demo user (no debería pasar en
  esta etapa, pero defensive): el script imprime un warning y la deja con
  `organizationId: null`. El cutover de PR3 (pasar la columna a NOT NULL)
  va a fallar si esto ocurre, dándole al humano una oportunidad de
  intervenir.

---

## C) Lista de archivos a tocar

### Backend — schema y migración

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | + Organization, Membership; + organizationId en 9 modelos; índices compuestos |
| `scripts/sprint1-migrate-to-multitenant.ts` | NUEVO — backfill + Demo Org + users |
| `.gitignore` | excepción para `sprint1-migrate-to-multitenant.ts` |

### Backend — middleware y auth

| Archivo | Cambio |
|---|---|
| `src/server.ts` | JWT_SECRET fail-fast; JWT carry organizationId; authMiddleware setea req.organizationId; quitar fallback inseguro |
| `src/lib/tenancy.ts` | NUEVO — Prisma extension `$extends` con `query` middleware que inyecta `organizationId` en where/data (ADR-005) |
| `src/lib/auth.ts` | NUEVO — helpers: `requireAuth`, `requireOrgRole`, `requireOperationOwnedBy(orgId, opId)`, `getTenantPrisma(req)` |
| `src/lib/prismaClient.ts` | NUEVO — exporta un PrismaClient base + un factory `forOrg(orgId)` que devuelve el extendido |

### Backend — rutas

Todas las rutas abajo necesitan: (1) usar `req.organizationId` en lugar de
`req.userId` en filtros, (2) eliminar la resolución hardcoded por email
`demo@example.com`, (3) usar el helper `requireOperationOwnedBy` donde
aplique.

| Archivo | Cambios específicos |
|---|---|
| `src/server.ts` líneas 66-101 | GET /api/operations + GET /:id → filtrar por organizationId |
| `src/server.ts` líneas 101-160 | POST /api/operations → set organizationId en create |
| `src/server.ts` líneas 162-187 | PATCH /api/operations/:id + PATCH /api/tasks/:taskId → reemplazar fetch-then-compare por `requireOperationOwnedBy` |
| `src/server.ts` líneas 189-201 | GET /api/dashboard/kpis → filtrar por organizationId |
| `src/server.ts` líneas 203-217 | POST /api/emails/webhook → **bug crítico** `findMany({ take: 1 })` sin filtro. Cambiar a matching real por message-id o `404` si no matchea |
| `src/server.ts` líneas 219-243 | GET /api/emails/drafts + POST /api/emails/send → usar `requireOperationOwnedBy` |
| `src/server.ts` líneas 245-263 | POST /api/emails/process-and-create → pasar organizationId al Orchestrator |
| `src/routes/today.ts` | quitar `email: 'demo@example.com'` hardcoded; usar `req.organizationId`; aplicar `authMiddleware` desde server.ts |
| `src/routes/aiChat.ts` | reemplazar `executeTool` userId hardcoded por `req.organizationId`; aplicar middleware |
| `src/routes/quotes.ts` | quitar `DEMO_EMAIL`; usar `req.organizationId`; aplicar middleware |
| `src/routes/agentDecisions.ts` | idem quotes |
| `src/routes/contracts.ts` | idem quotes |

### Backend — agents y services

| Archivo | Cambios |
|---|---|
| `src/agents/Orchestrator.ts` | aceptar `organizationId` en input además de userId; pasar a todos los creates (Operation, EmailInbound, Task, EmailDraft, AgentDecision, TimelineEvent) |
| `src/agents/specialists/EmailParser.ts` | match queries por `organizationId` en lugar de userId (líneas 214-238) |
| `src/services/EmailService.ts` | leer organizationId del operation; setearlo en Task / TimelineEvent / EmailDraft creates |

### Backend — scripts versionados existentes

| Script | Cambio |
|---|---|
| `scripts/seed-quotes.ts` | aceptar `--orgSlug` (default `demo-org`); resolver `organizationId` y setearlo en cada create |
| `scripts/seed-agent-decisions.ts` | idem |
| `scripts/seed-contracts.ts` | idem |
| `scripts/fix-op-0184.ts` | filtrar por orgSlug si lo provee, no romper si no |

### Frontend — login + token

| Archivo | Cambio |
|---|---|
| `src/app/page.tsx` (login) | después de login exitoso: guardar `token` + `currentOrg` (id, name, slug) en localStorage; redirect a /today |
| `src/components/Sidebar.tsx` | fetchear `/api/today` con Authorization header (hoy no manda); leer `currentOrg` de localStorage para preparar el slot del selector |
| `src/app/today/page.tsx` | mandar Authorization header al fetch de `/api/today` (línea 52) |
| `src/app/quotes/page.tsx` | mandar Authorization header (línea 163) |
| `src/app/quotes/[id]/page.tsx` | idem |
| `src/app/contracts/page.tsx` | idem |
| `src/app/contracts/[id]/page.tsx` | idem |
| `src/components/AIChatButton.tsx` | mandar Authorization header al SSE POST /api/ai/chat |

> Selector visual de org en el header se hace en PR2 (no en PR1). PR1 deja
> el campo listo en localStorage y un endpoint backend `GET /api/me`
> (devuelve user + memberships + currentOrg) que el selector consumirá.

---

## D) Plan de rollback

### Snapshot pre-Sprint-1

El usuario ya tiene un snapshot de Neon llamado `pre-sprint-1-baseline`.
Para restaurar:

```
1. En Neon Console → proyecto rumbo → tab "Branches"
2. Encontrar la branch del snapshot `pre-sprint-1-baseline`
3. Opción A (no-destructive): "Reset main from this branch"
   → main vuelve al estado pre-Sprint-1, conservando el snapshot.
4. Opción B (preserve current state): "Promote this branch to main"
   → genera una nueva main, la actual queda como branch histórica.
```

### Rollback en caso de problema durante PR1

| Situación | Acción |
|---|---|
| `prisma db push` falla a mitad | Las migraciones aditivas de Prisma son seguras (nullable columns + new tables). Si falla, no debería haber data loss. Revisar el error y re-intentar. |
| Script de backfill falla | La transacción hace rollback. Las columnas nuevas quedan agregadas pero todas con NULL — la app vieja sigue funcionando (compat layer). |
| Detectamos fuga cross-tenant en prod | Hard rollback: revertir el merge del PR1 en main + Railway redeploy a la versión anterior + investigar antes de re-intentar |
| Token viejo no decodifica | El compat layer (ver sección E) garantiza que tokens viejos siguen funcionando hasta el cutover de PR3 |
| Pánico total | Restaurar `pre-sprint-1-baseline` (Opción A arriba) + revertir todos los commits de Sprint 1 + redeploy |

---

## E) Orden de ejecución y qué se rompe en cada paso

### Paso 1: Crear Neon database branch de desarrollo

**Quién:** Agustín cuando vuelva.
**Por qué primero:** todas las pruebas de schema/migración corren contra esa
branch, no contra prod. Hoy no existe.

### Paso 2: Aplicar schema cambios a la BD de desarrollo

**Quién:** Agustín cuando vuelva.
**Comando:** `DATABASE_URL=<dev-branch-url> npx prisma db push`
**Qué pasa:** se agregan tablas Organization + Membership y se agrega
columna `organizationId String?` (nullable) en los 9 modelos tenant-scoped
+ índices. **No hay data loss** porque es aditivo.

### Paso 3: Correr el script de backfill en la BD de desarrollo

**Quién:** Agustín.
**Comando:** `DATABASE_URL=<dev-branch-url> npx tsx scripts/sprint1-migrate-to-multitenant.ts`
**Qué pasa:** crea Demo Org, asocia data existente, crea user
`demo-public@rumbo.io`, verifica assertions. Si pasa: listo.

### Paso 4: Smoke test contra BD dev

**Quién:** Agustín.
**Cómo:** apuntar Railway preview env (o local) al dev branch, probar:
- Login con `demo@example.com` → token nuevo trae organizationId
- `/today` con Authorization devuelve la data esperada (4 ops, 5 quotes, etc.)
- `/api/today` sin Authorization devuelve 401 (ya no es público)
- Botón "Probar demo" (PR2) loguea con `demo-public@rumbo.io`

### Paso 5: Repetir pasos 2-4 contra BD de PROD

**Quién:** Agustín.
**Por qué este es el momento sensible:** los pasos previos validan que el
script funciona. Acá se aplica a prod.

### Paso 6: Merge feat/sprint1-multitenant → main + deploy a Railway

**Quién:** Agustín.

### Paso 7: Cutover de auth (PR3, no PR1)

PR1 deja activo el **compat layer**. Concretamente:
- Tokens viejos (solo userId) siguen funcionando: si el JWT no trae
  organizationId, el middleware resuelve la org default del user via
  Membership con `isDefault: true`.
- El frontend viejo (sin Authorization en /today, /quotes, /contracts)
  sigue funcionando: las rutas tienen un fallback `optionalAuth` que, si
  no hay token, resuelve la Demo Org pública. **Este fallback se quita
  en PR3.**

### Qué se rompe vs. qué sigue funcionando durante el deploy de PR1

| Cosa | Estado durante PR1 deploy |
|---|---|
| Login con demo@example.com | ✅ funciona, token nuevo trae orgId |
| /today, /quotes, /contracts sin token (demo público) | ✅ funciona vía optionalAuth → Demo Org pública |
| /today, /quotes, /contracts con token | ✅ funciona, filtra por orgId |
| Tokens viejos en localStorage (sin orgId) | ✅ funciona, middleware resuelve org default |
| POST /api/operations, PATCH, drafts/send | ✅ funcionan con req.organizationId derivado del token |
| Webhook /api/emails/webhook | ⚠️ devuelve 404 si no matchea por message-id (era el bug — antes adjuntaba a cualquier op random). Comportamiento correcto. |

### PR2 (frontend real)
- Login real funciona (ya funcionaba)
- Botón "Probar demo" loguea con demo-public@rumbo.io
- Selector de Organization visible en sidebar cuando user tiene >1 membership
- Todos los fetch del frontend mandan Authorization

### PR3 (cleanup)
- Quitar `optionalAuth` fallback → /today, /quotes, /contracts sin token devuelven 401
- Pasar `organizationId` de nullable a NOT NULL en los 9 modelos
- Rotar JWT_SECRET → invalida todos los tokens existentes
- Borrar relaciones `User.operations[]`, `User.quotes[]`, etc. (ya no se usan)
- Borrar columna `userId` de los modelos tenant-scoped (ya no se usa) — o
  mantenerla como auditoría de "quién creó esto" si se considera valioso.
  **Decisión pendiente — ver sección Preguntas abiertas**

---

## F) LOS 4 PASOS QUE REQUIEREN AL USUARIO PRESENTE

Estos son los pasos que NO se ejecutan durante esta sesión autónoma. Se
ejecutan cuando vuelva Agustín.

### Paso 1 — Crear una BD de desarrollo separada (Neon database branch)

**Por qué:** poder probar migraciones sin tocar prod.

**Cómo:**
1. Ir a Neon Console → proyecto Rumbo
2. Tab "Branches" → "Create branch"
3. Nombre: `sprint-1-dev`
4. Source: `main` (estado actual de prod)
5. Copiar la connection string que Neon genera
6. Guardarla como `DATABASE_URL` para local dev:
   ```bash
   echo "DATABASE_URL=\"<connection-string>\"" > rumbo-backend/.env.local
   ```

### Paso 2 — Aplicar migración de schema

**Contra BD dev primero**, después contra prod.

```bash
cd rumbo-backend
# 1) Contra dev
DATABASE_URL="<dev-url>" npx prisma db push

# 2) Verificar que no hay errores y que los modelos nuevos están
DATABASE_URL="<dev-url>" npx prisma studio
# (chequear que aparecen Organization y Membership)

# 3) Contra prod (solo si dev pasó)
DATABASE_URL="<prod-url>" npx prisma db push
```

**Qué hace `prisma db push`:** aplica el schema actual a la BD sin generar
archivos de migración. Es aditivo (nuevas tablas + columnas nullable), no
borra nada. Si una columna existente cambia su tipo o se vuelve NOT NULL,
Prisma pide confirmación interactiva.

### Paso 3 — Correr script de backfill

**Contra BD dev primero**, después contra prod.

```bash
# 1) Contra dev
DATABASE_URL="<dev-url>" npx tsx scripts/sprint1-migrate-to-multitenant.ts

# Output esperado:
# ✓ Demo Organization upserted (slug: demo-org)
# ✓ demo-public@rumbo.io user upserted
# ✓ Memberships created: 2
# ✓ Operations backfilled: 4
# ✓ Quotes backfilled: 5
# ✓ Contracts backfilled: 8
# ✓ AgentDecisions backfilled: 10
# ✓ Tasks backfilled: N
# ✓ JourneySteps backfilled: N
# ✓ TimelineEvents backfilled: N
# ✓ EmailDrafts backfilled: N
# ✓ EmailsInbound backfilled: N
# ✓ Assertions passed (0 orphans).

# 2) Smoke test rápido contra dev (ver Paso 4 abajo)

# 3) Contra prod
DATABASE_URL="<prod-url>" npx tsx scripts/sprint1-migrate-to-multitenant.ts
```

### Paso 4 — Merge a main + deploy + cutover de auth

```bash
# 4.1 — Smoke test final de la branch contra dev DB
cd rumbo-backend
git checkout feat/sprint1-multitenant
DATABASE_URL="<dev-url>" npm run build
DATABASE_URL="<dev-url>" npm run dev
# En otra terminal: probar /api/auth/login + /api/today con token + sin token
# (con token debe devolver data; sin token debe devolver 401 o data de Demo Org si optionalAuth está activo)

# 4.2 — Merge a main
git checkout main
git merge --no-ff feat/sprint1-multitenant -m "Merge feat/sprint1-multitenant (PR1)"
git push origin main
# → Railway auto-deploya

# 4.3 — Verificar deploy
curl https://web-production-ad432.up.railway.app/api/today
# Debe devolver 401 si optionalAuth está OFF, o data Demo Org si optionalAuth está ON.

# 4.4 — Cutover de auth (esto ya pertenece a PR3, NO PR1)
# Sucede después de que PR2 (frontend) esté mergeado.
# - Deploy PR3 que quita optionalAuth + pasa organizationId a NOT NULL
# - Rotar JWT_SECRET en Railway (Settings → Variables → JWT_SECRET = <nuevo>)
# - Railway redeploya automáticamente → invalida todos los tokens
# - Avisar a usuarios beta (cero) que re-loguen
```

---

## G) Preguntas abiertas para Agustín

1. **¿Borramos `userId` de los modelos tenant-scoped en PR3, o lo dejamos
   como auditoría "createdByUserId"?** Mi recomendación: renombrar a
   `createdByUserId String?` y dejarlo. Cuesta poco y ayuda a debugging.

2. **Demo Org slug:** propongo `demo-org`. ¿Mejor `demo` a secas, o
   `rumbo-demo`?

3. **Email del user público:** propongo `demo-public@rumbo.io`. ¿OK?

4. **¿El user `demo@example.com` original sigue siendo OWNER de la Demo
   Org, o creamos un user separado (ej. `admin@rumbo.io`) como OWNER y
   relegamos al demo user a MEMBER?** Mi recomendación: dejar `demo@example.com`
   como OWNER por simplicidad (no romper nada). Cuando se ponga un cliente
   real, ese cliente tendrá su propia Org con sus propios OWNERS.

5. **¿En PR1 ya se aplica el JWT_SECRET fail-fast, o lo dejamos para PR3?**
   El plan actual lo hace en PR1 — esto significa que si Railway no tiene
   `JWT_SECRET` seteado al boot, el server crashea. Hay que verificar que
   Railway tenga la env var antes del deploy.

6. **Compat layer `optionalAuth` para /today, /quotes, /contracts durante
   PR1:** propongo dejarlo activo en PR1, quitarlo en PR3. Esto hace que la
   demo en vivo NO se rompa durante la ventana entre PR1 deploy y PR2 + frontend
   actualizado. Confirmar.

---

## H) Definition of Done para PR1

- [ ] Schema compila (`npx prisma validate`)
- [ ] Prisma client se regenera (`npx prisma generate`)
- [ ] `npm run build` (TypeScript) pasa sin errores
- [ ] Script de migración corre limpio contra una BD vacía + contra un snapshot de la BD de prod (Agustín verifica esto contra la dev branch)
- [ ] Todos los endpoints autenticados filtran por `req.organizationId`
- [ ] Helper `requireOperationOwnedBy` se usa en los 4 spots de fetch-then-compare
- [ ] `/api/emails/webhook` ya no hace `findMany({ take: 1 })` sin filtro
- [ ] `JWT_SECRET` es required (no fallback)
- [ ] Compat layer activo para tokens viejos
- [ ] Tests de vitest mínimos en `tests/`: auth happy path, ownership cross-org (NEGATIVE — debe devolver 404), middleware injection

---

## Resumen ejecutivo

Sprint 1 está bien dimensionado para ~2-3 días de implementación. El paso
más riesgoso es el backfill de `organizationId` — está mitigado con el
script idempotente + transacción + assertions + nullable column.

El compat layer permite que PR1 y PR2 se deployen sin sincronizar: PR1
hace que la API sea multi-tenant manteniendo la API vieja funcional; PR2
moderniza el frontend; PR3 limpia.

**La urgencia comercial** (demo Free Customs con data real) hace que el
camino crítico sea: PR1 → migración de data → smoke test → PR2 → onboarding
manual de Free Customs como nueva Organization. PR3 puede esperar.
