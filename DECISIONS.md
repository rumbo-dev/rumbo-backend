# Rumbo — Architectural Decisions

Última actualización: 2026-05-16

Formato ADR ligero: cada decisión incluye contexto, decisión, alternativas
descartadas y consecuencias.

---

## ADR-001 — Modelo de tenancy: Organization → N Users vía Membership

**Fecha:** 2026-05-16

**Contexto:** El producto arrancó single-tenant (un `User` único, demo).
Para Sprint 1 hay que pasar a multi-tenant. ICP son forwarders de 20-200
empleados con equipos distribuidos.

**Decisión:**
- Nuevo modelo `Organization`
- Nuevo modelo `Membership` (join table entre `User` y `Organization` con `role`)
- `Operation.organizationId` (FK obligatorio). Las operations pertenecen a la
  Organization, NO al User individual
- Un `User` puede pertenecer a varias orgs (futuro: empleados que rotan)

**Alternativas descartadas:**
- `User = Organization` (1:1): no soporta equipos, contradice el ICP
- Operations atadas al User: rompe cuando un empleado se va de la empresa

**Consecuencias:**
- Migración compleja de las 4 ops demo (a "Demo Organization" seed)
- Todo query a `Operation`, `Task`, `EmailDraft`, etc. necesita filtro por
  `organizationId` — ver ADR-005 (Prisma middleware)
- JWT debe llevar `organizationId` actual del user (no solo `userId`)

---

## ADR-002 — Sistema de roles híbrido: team (User) + role (Membership)

**Fecha:** 2026-05-16

**Contexto:** Necesitamos separar "qué área funcional hace el usuario" (su
team operativo) de "qué permisos tiene sobre la Organization".

**Decisión:** Dos campos separados.
- `User.team`: `OPERATIONS | PRICING | SALES | CUSTOMER_SUPPORT | ADMIN`
  → función del usuario, su área operativa, no cambia entre orgs
- `Membership.role`: `OWNER | ADMIN | MEMBER`
  → permisos sobre la Organization específica, puede variar si el user está
    en varias orgs

**Alternativas descartadas:**
- Un solo campo combinado: mezcla preocupaciones; un OWNER de PRICING
  necesita los dos atributos por separado
- Solo `role` sin `team`: pierde la info de qué equipo dispara qué tareas
  (ya usado en `Operation.currentOwner`)

**Consecuencias:**
- `currentOwner` en `Operation` matchea con `User.team` (ya existe)
- Lógica de autorización: el `role` decide permisos administrativos (invitar
  usuarios, borrar ops); el `team` decide ruteo de tasks

---

## ADR-003 — Concierge first: sin signup público en Sprint 1

**Fecha:** 2026-05-16

**Contexto:** Faltan flujos de invitación, billing, email verification.
Construirlos en Sprint 1 alarga el timeline y los primeros 5-10 clientes
serán hand-picked.

**Decisión:**
- En Sprint 1: NO hay `/signup` público
- Admin (Agustín) crea Organizations desde un panel y manda credenciales por
  fuera del producto
- Login real sí está habilitado desde Sprint 1

**Consecuencias:**
- El panel admin se construye en Sprint 3 (no en Sprint 1)
- Hasta entonces, alta manual vía script o consola

---

## ADR-004 — Demo Organization compartida, cut limpio en auth

**Fecha:** 2026-05-16

**Contexto:** Las 4 ops curadas (OP-0142, 0173, 0184, 23714) se usan para
demos en vivo. Hoy son accesibles sin auth porque `/api/today` y
`/api/ai/chat` resuelven `userId` por `email: 'demo@example.com'` hardcoded.

**Decisión:**
- TODOS los endpoints requieren JWT post-Sprint 1 (sin "modo público" ad-hoc)
- Existe un user `demo-public@rumbo.io` con una `Demo Organization` que
  contiene las 4 ops curadas
- El frontend tiene un botón "Probar demo" que loguea con las credenciales de
  ese user
- Las credenciales del demo user son públicamente compartibles

**Alternativas descartadas:**
- Mantener `/api/today` público con feature flag: superficie de ataque
  innecesaria, fácil de olvidar en code review
- Demo Org en cada org admin: duplica data, complica seeds

**Consecuencias:**
- Hay que seedear `demo-public@rumbo.io` + `Demo Organization` antes del
  cutover de Sprint 1
- Cualquier cambio destructivo en la Demo Org afecta a todos los visitantes
  (read-only enforcement viene en Sprint 3 con panel admin)

---

## ADR-005 — Prisma middleware para inyectar organizationId automáticamente

**Fecha:** 2026-05-16

**Contexto:** Con multi-tenant, cada query tiene que filtrar por
`organizationId`. Hacerlo manual en cada `where` es frágil — un solo
copy/paste sin el filtro fuga data cross-tenant. Ya hay precedente del
problema en single-tenant: `aiChat.ts` resuelve userId dentro de
`executeTool` y si una tool nueva olvida pasarlo al `where`, se rompe.

**Decisión:** Prisma extension/middleware que inyecta `organizationId` en
queries automáticamente, a partir del context de auth. Si una query toca un
modelo tenant-scoped y no tiene `organizationId` explícito, Prisma tira error
en lugar de devolver data.

**Costo:** +1 día de implementación.

**Consecuencias:**
- Previene ~90% de brechas de autorización cross-tenant
- Tests de "intentar leer op de otra org" deben pasar
- Queries de seed/admin necesitan un escape hatch explícito
  (ej: `prisma.$extends(allowCrossTenant)`)

---

## ADR-006 — Migración JWT: hard cutover, invalidar todos los tokens

**Fecha:** 2026-05-16

**Contexto:** El refactor de auth cambia el shape del JWT (agrega
`organizationId`). Los tokens viejos no tienen ese campo.

**Decisión:** Invalidar todos los tokens existentes. Forzar re-login.

**Alternativas descartadas:**
- Compat layer permanente: deuda técnica que nunca se paga
- Migración blue-green con dos validators: complejidad innecesaria a esta
  escala (solo demo user activo)

**Consecuencias:**
- Compat layer durante el deploy de PR1 (corta ventana, no permanente)
- PR3 elimina el compat layer y rota el `JWT_SECRET` (efecto: invalida todo
  lo emitido antes)

---

## ADR-007 — Sprint 1 partido en 3 PRs con compat layer transitorio

**Fecha:** 2026-05-16

**Decisión:**
- **PR1 (backend):** Organization + Membership + auth refactor + Prisma
  middleware + migrar las 4 ops + endpoints actualizados, con compat layer
  durante deploy
- **PR2 (frontend):** Login real + selector de org en header + ajustar
  fetching
- **PR3 (cleanup):** Quitar compat layer, tests de paths críticos, rotar
  `JWT_SECRET`

**Por qué partido:** Un PR único es difícil de revisar y rollback;
back+front en paralelo se desincronizan. La compat layer es lo que permite
el split.

---

## ADR-008 — Postpone enum migration (String → Prisma enum) a Sprint 3

**Fecha:** 2026-05-16

**Contexto:** Hoy `status`, `subStatus`, `currentOwner`, `role`, `team`, etc.
son `String` en Prisma. Riesgo: seedear un valor inválido y descubrirlo en
producción. Síntoma actual: el frontend crashea si llega un `subStatus` no
listado en `SUB_STATUS_CONFIG`.

**Decisión:** No tocar en Sprint 1. Migrar a `enum` de Prisma en Sprint 3.

**Por qué postponer:**
- Migrar enums rompe mucho código de una vez
- Sprint 1 ya es grande (multi-tenant + auth)
- Workaround interino: validar en `zod` schemas a nivel de input handler

---

## ADR-009 — Stack: Anthropic SDK directo, sin wrappers de terceros

**Fecha:** Pre-existente (heredado de CLAUDE.md)

**Decisión:** No usar OpenRouter, LangChain, ni similares. API de Anthropic
directa. Solo modelos Claude (Sonnet, Opus, Haiku) — no Llama, Mistral, ni
open source.

**Por qué:** Control total sobre prompts, tool use, caching. Wrappers suelen
retrasar features nuevas (prompt caching, extended thinking).

---

## ADR-010 — Sprint 1 con Claude Code, auditoría de ingeniero antes de clientes con data real

**Fecha:** 2026-05-22

**Contexto:** Agustín (CPO) no revisa código, valida testeando experiencia.
Sprint 1 (multi-tenant + auth) es la zona más delicada del proyecto — bugs
de seguridad no se ven testeando.

**Decisión:** Sprint 1 se implementa con Claude Code. Antes de cargar data
real de un cliente (ej. Free Customs en la demo comprometida), un ingeniero
debe auditar el código de multi-tenant y auth.

**Razón:** no frenar el avance, pero poner un checkpoint de seguridad antes
de que un error sea costoso (data de un cliente visible para otro).

**Mitigaciones activas:** snapshot de Neon pre-Sprint-1, permisos con
comandos destructivos en deny, git como red de seguridad.
