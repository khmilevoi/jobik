import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

const root = path.dirname(import.meta.filename)

export default defineConfig({
  root: path.resolve(root, 'src/studio'),
  base: './',
  resolve: { conditions: ['@jobik/source', ...defaultClientConditions] },
  plugins: [react()],
  build: { outDir: path.resolve(root, 'dist/studio'), emptyOutDir: true },
  // The Studio talks to the API same-origin. In dev the API is the Node server on its own port, so
  // `/api` is proxied; a built bundle served by that same server needs no proxy and no config.
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:4318', changeOrigin: false } },
  },
})
