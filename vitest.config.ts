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
          testTimeout: 20000,
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
          testTimeout: 20000,
          include: ['packages/ui/src/**/*.test.{ts,tsx}'],
          exclude: ['packages/ui/src/server/**'],
        },
      },
      {
        test: {
          name: 'example',
          root: import.meta.dirname,
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          testTimeout: 20000,
          include: ['examples/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'example-ui',
          root: import.meta.dirname,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          testTimeout: 20000,
          include: ['examples/**/*.test.tsx'],
        },
      },
    ],
  },
})
