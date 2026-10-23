import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['pi-web-access'] })],
    build: { rollupOptions: { output: { format: 'es' } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'noctua-development-csp',
        apply: 'serve',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            // Permit Vite's exact development preamble without allowing arbitrary
            // inline scripts. The packaged build keeps its original strict CSP.
            const hashes = [
              ...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)
            ].map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
            return html.replace("script-src 'self'", `script-src 'self' ${hashes.join(' ')}`)
          }
        }
      }
    ]
  }
})
