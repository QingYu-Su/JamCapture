import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { murekaProxy } from './server/murekaProxy'

export default defineConfig({
  plugins: [react(), murekaProxy()],
  publicDir: 'demo',
  preview: {
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
