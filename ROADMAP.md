# Rumbo — Roadmap

Última actualización: 2026-05-16

## Contexto inmediato

Próxima demo: **lunes 2026-05-18** con forwarder grande argentino. Entre hoy
y la demo, foco en *demo enhancements* sobre el producto actual (sin tocar
schema multi-tenant ni auth).

Sprint 1 arranca **martes 2026-05-19**, post-demo.

---

## Demo enhancements (2026-05-16 → 2026-05-18)

Trabajo encima del producto actual, single-tenant, sin tocar auth/tenancy.

1. **Página `/quotes`** con cotizaciones automáticas (mock, sin pipeline real)
2. **Mejoras en `/today`** para matchear el dashboard del deck (KPIs, agent feed)
3. **Modal "AI decision trace"** cuando se hace click en una acción

Restricciones durante esta ventana:
- No tocar `prisma/schema.prisma` (no agregar Organization, no romper compat)
- No tocar `authMiddleware` ni rutas `/api/auth/*`
- No borrar las 4 ops curadas (OP-0142, 0173, 0184, 23714)
- Build local antes de cada push (back y front)

---

## Sprint 1 — Multi-tenant + Auth (arranca 2026-05-19)

Partido en 3 PRs (ver `DECISIONS.md` ADR-007).

### PR1 — Backend: Organization + Auth refactor
- Modelo `Organization` y `Membership` en Prisma
- `Operation.organizationId` (FK obligatorio); migración de las 4 ops a "Demo Organization"
- Prisma extension/middleware que inyecta `organizationId` en queries (+1 día, previene ~90% de fugas cross-tenant)
- Quitar fallback inseguro de `JWT_SECRET` (require env var presente, fail-fast si falta)
- Endpoints `/api/today` y `/api/ai/chat` ahora exigen JWT (hoy son públicos y leen `demo@example.com` hardcoded)
- Fix `/api/emails/webhook`: hoy hace `findMany({ take: 1 })` sin filtro — bug crítico en multi-tenant
- Helper `requireOperationOwnedBy(orgId, opId)` para reemplazar el patrón frágil "fetch luego comparar userId"
- Compat layer durante deploy (token viejo sigue funcionando hasta cutover)
- Side task: versionar `scripts/` con `DATABASE_URL` como env var (no hardcoded)
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
