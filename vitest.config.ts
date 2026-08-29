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
    ],
  },
})
