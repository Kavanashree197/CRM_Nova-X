import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server. In the Z.ai workspace preview it must run on port 3000 (the
// preview gateway routes :81 -> :3000). In VS Code you can use any free port
// via the VITE_PORT env var (defaults to 3000 for parity).
//
// /api is proxied to the Flask backend (VITE_API_TARGET, default :5000) so
// the frontend uses same-origin relative paths in dev.
//
// allowedHosts accepts any host so the preview gateway + localhost both work.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_PORT || 3000)
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:5000'
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: true, // accept any host (preview gateway, localhost, etc.)
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
