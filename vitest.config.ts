import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Tests should run fast — Sprint 1 baseline son helpers + auth lógico.
    // Si agregás tests de integración con BD real, separá vía proyecto.
    testTimeout: 5_000,
  },
})
