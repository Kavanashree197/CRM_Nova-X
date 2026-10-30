import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server runs on port 3000 so the Z.ai preview gateway (Caddy :81 -> :3000)
// serves this React+Vite frontend. /api is proxied to the Flask backend on :5000.
// allowedHosts accepts the gateway hostname the preview URL forwards as.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Accept any host the preview gateway forwards as (Vite 5.4 needs explicit
    // array entries; the gateway presents its own internal hostname).
    allowedHosts: [
      'preview-chat-8bdb48f1-cf04-4c27-8a27-08499b17dbde.space-z.ai',
      '.space-z.ai',
      '.fcapp.run',
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
