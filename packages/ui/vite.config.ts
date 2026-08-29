import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.dirname(import.meta.filename)

export default defineConfig({
  root: path.resolve(root, 'src/studio'),
  base: './',
  plugins: [react()],
  build: { outDir: path.resolve(root, 'dist/studio'), emptyOutDir: true },
})
