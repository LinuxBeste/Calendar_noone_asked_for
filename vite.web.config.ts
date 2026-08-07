import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    root: 'web',
    base: './',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __DEMO__: JSON.stringify(demo)
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'shared') }
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      emptyOutDir: true
    }
  }
})
