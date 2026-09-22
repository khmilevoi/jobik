import { defineConfig } from 'tsdown'

const packageExports = { devExports: '@jobik/source' }

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    platform: 'neutral',
    format: ['esm'],
    dts: true,
    exports: packageExports,
  },
  {
    entry: { server: 'src/server/index.ts' },
    platform: 'node',
    format: ['esm'],
    dts: true,
    exports: packageExports,
  },
])
