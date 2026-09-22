import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  platform: 'neutral',
  format: ['esm'],
  dts: true,
  exports: { devExports: '@jobik/source' },
})
