import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    exclude: ['src/workflows/**', 'src/i18n/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Lazily loaded chunks and in-process engine runs take seconds while other suites share the
    // CPU. A passing test never waits for these limits, so they cost nothing when the CPU is free.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    expect: { poll: { timeout: 5_000 } },
    restoreMocks: true,
  },
});
