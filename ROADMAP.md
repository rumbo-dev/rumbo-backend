# Rumbo — Roadmap

Última actualización: 2026-05-22

## Contexto inmediato

Sprint 1 (multi-tenant + auth) arranca esta semana. Estado:
- Demo del **lunes 2026-05-18** con forwarder grande argentino: ✅ ejecutada,
  exitosa. Reunión Free Customs 2026-05-20: temperatura alta, comprometida
  una **demo con datos reales del cliente** como próximo paso
  (ver `LEARNINGS.md`).
- Esa demo con data real **requiere multi-tenant**. Sprint 1 ahora tiene
  urgencia comercial, no solo técnica.

---

## Sprint 1 — Multi-tenant + Auth (arranca 2026-05-19)

> **URGENCIA DE NEGOCIO:** el próximo paso comprometido con Free Customs
> (cliente caliente) es una demo con sus datos reales, lo cual requiere
> multi-tenant. Sprint 1 habilita ese compromiso comercial.

Partido en 3 PRs (ver `DECISIONS.md` ADR-007).

### PR1 — Backend: Organization + Auth refactor
- **Crear una BD de desarrollo separada (Neon database branch)** para que las
  migraciones se prueben sin tocar la BD de producción.
- Modelo `Organization` y `Membership` en Prisma
- `Operation.organizationId` (FK obligatorio); migración de las 4 ops a "Demo Organization"
- Prisma extension/middleware que inyecta `organizationId` en queries (+1 día, previene ~90% de fugas cross-tenant)
- Quitar fallback inseguro de `JWT_SECRET` (require env var presente, fail-fast si falta)
- Endpoints `/api/today` y `/api/ai/chat` ahora exigen JWT (hoy son públicos y leen `demo@example.com` hardcoded)
- Fix `/api/emails/webhook`: hoy hace `findMany({ take: 1 })` sin filtro — bug crítico en multi-tenant
- Helper `requireOperationOwnedBy(orgId, opId)` para reemplazar el patrón frágil "fetch luego comparar userId"
- Compat layer durante deploy (token viejo sigue funcionando hasta cutover)
- Side task: versionar `scripts/` con `DATABASE_URL` como env var (no hardcoded). **Iniciado parcialmente en demo enhancements 2026-05-16: `scripts/seed-quotes.ts` ya está versionado con env var. El resto sigue gitignored hasta Sprint 1.**
- Tests mínimos (vitest, primer setup del repo): auth, ownership cross-org, middleware

### PR2 — Frontend: Login real + selector de org
- Login real con `demo@example.com` + alta concierge
- Selector de Organization en el header (cuando User está en varias orgs)
- Botón "Probar demo" que loguea con credenciales públicas (`demo-public@rumbo.io`)
- Ajustar fetching de `/today` para mandar `Authorization` header (hoy no manda)
- Token sigue en `localStorage` (httpOnly cookies → Sprint 3)

### PR3 — Cleanup
- Quitar compat layer del PR1
- Invalidar todos los tokens (re-login forzado) + rotar `JWT_SECRET`
- Más tests de paths críticos
- Smoke test de la Demo Organization seed

---

## Sprint 2 — Email ingest + hardening de seguridad

- Webhook Mailgun → pipeline multi-agente → guarda operación
- Validación de firma Mailgun en `/api/emails/webhook`
- Rate limiting en `/api/auth/login` (brute-force prevention)
- Validación de tamaño de input en `/api/ai/chat`

---

## Sprint 3 — Onboarding + DX + seguridad final

- Panel admin para crear Organization + cargar operaciones iniciales (concierge)
- Onboarding wizard de primera vez (post-auth)
- Refresh tokens + cookies httpOnly (mover JWT fuera de `localStorage`)
- Migración de enums `String` a Prisma `enum` (status, subStatus, currentOwner, role, team, etc.) — postpuesto hasta acá porque rompe mucho
- Refactor de design tokens y componentes reusables (CSS variables aguantan demos cortas, no escala)
- Partir `operations/[id]/page.tsx` (902 líneas) en sub-componentes

---

## Sprints 4+ (orden tentativo)

- WhatsApp ingest (Twilio Business API)
- Tracking real (jobs programados con MarineTraffic + carrier APIs)
- `compare_carriers` real (requiere data histórica de operaciones cerradas)

---

## ICP

Forwarders argentinos / regionales de 20-200 empleados con equipos
distribuidos entre OPS, PRICING, SALES y CUSTOMER_SUPPORT. Onboarding
concierge para los primeros 5-10 clientes; signup público después.

---

## Histórico

### Demo enhancements 2026-05-16 → 2026-05-18 — ✅ Completado

Trabajo encima del producto actual, single-tenant, sin tocar auth/tenancy.
Ejecutado el overnight del 2026-05-16 + fixes round 2 del 2026-05-17.
Detalle en `WORKLOG-2026-05-16-overnight.md`.

1. ✅ **Página `/quotes`** con cotizaciones automáticas (P1)
2. ✅ **Mejoras en `/today`** (KPIs, agent feed, growth opportunities — P2)
3. ✅ **Modal "AI decision trace"** (P3)
4. ✅ **Página `/contracts`** (P4, no estaba en el plan original, agregada)
5. ✅ **Round 2 de fixes** post visual QA (8 issues + side task — 2026-05-17)
