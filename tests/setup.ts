/**
 * Vitest setup — corre antes de cargar cualquier test.
 *
 * src/lib/auth.ts hace fail-fast si JWT_SECRET no está seteado al
 * importarse. En tests forzamos un valor para que el import no rompa.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod'
process.env.NODE_ENV = 'test'
