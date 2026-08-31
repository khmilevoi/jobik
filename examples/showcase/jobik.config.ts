import path from 'node:path'
import { defineJobikConfig } from '@jobik/ui/server'

/**
 * The showcase's Studio configuration, and the one this repository's `pnpm dev` loads.
 *
 * It declares the three flows this package ships: `publication`, which is the flow every artboard
 * in the design shows, plus `pokedex` and `forecast`. Each `flow.ui.tsx` is named here before it is
 * loaded: the UI entrypoint is a path the extension bundler is handed, not a module this
 * configuration imports.
 */

const root = path.dirname(import.meta.filename)

export default defineJobikConfig({
  server: { host: '127.0.0.1', port: 4318 },
  flows: [
    {
      binding: path.resolve(root, 'publication/index.ts'),
      ui: path.resolve(root, 'publication/flow.ui.tsx'),
    },
    {
      binding: path.resolve(root, 'pokedex/index.ts'),
      ui: path.resolve(root, 'pokedex/flow.ui.tsx'),
    },
    {
      binding: path.resolve(root, 'forecast/index.ts'),
      ui: path.resolve(root, 'forecast/flow.ui.tsx'),
    },
  ],
})
