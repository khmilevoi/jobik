import path from 'node:path'
import { defineJobikConfig } from '@jobik/ui/server'

/**
 * The Jobik repository's own Studio configuration.
 *
 * It points at the `examples/publication` flow, which is the flow every artboard in the design
 * shows. `flow.ui.tsx` is named here before it exists: the UI entrypoint is a path the extension
 * bundler is handed, not a module this configuration loads.
 */

const root = path.dirname(import.meta.filename)

export default defineJobikConfig({
  server: { host: '127.0.0.1', port: 4318 },
  flows: [
    {
      binding: path.resolve(root, 'examples/publication/index.ts'),
      ui: path.resolve(root, 'examples/publication/flow.ui.tsx'),
    },
  ],
})
