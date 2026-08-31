import path from 'node:path'
import { defineJobikConfig } from '#server/config.js'

/**
 * A config module the discovery tests load through `loadJobikConfig`, exercising the same dynamic
 * `import()` of a `.ts` file the real `jobik.config.ts` goes through.
 */

const repositoryRoot = path.resolve(import.meta.dirname, '../../../../..')
const example = path.resolve(repositoryRoot, 'examples/publication')

export default defineJobikConfig({
  server: { host: '127.0.0.1', port: 0 },
  flows: [
    {
      binding: path.resolve(example, 'index.ts'),
      ui: path.resolve(example, 'flow.ui.tsx'),
    },
  ],
})
