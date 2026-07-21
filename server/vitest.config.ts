import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Las pruebas de integración comparten la misma BD de prueba (sistema_gaby_test);
    // correrlas en paralelo entre archivos pisaría datos de unas con otras.
    fileParallelism: false,
  },
});
