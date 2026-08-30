import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: import.meta.dirname,
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          include: ['packages/core/src/**/*.test.ts', 'packages/ui/src/server/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          root: import.meta.dirname,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['packages/ui/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/ui/src/server/**'],
          // The gate runs vitest concurrently with lint, typecheck and build across four
          // packages, which starves jsdom workers well past the 5000ms default. Every test
          // here passes in under a second when the suite runs alone. The same starvation can
          // time out a beforeEach hook, so the hook timeout is extended too.
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
      {
        test: {
          name: 'example',
          root: import.meta.dirname,
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          include: ['examples/**/*.test.ts'],
        },
      },
    ],
  },
})
