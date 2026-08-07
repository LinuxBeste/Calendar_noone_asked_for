import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@shared': resolve(__dirname, 'shared') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
