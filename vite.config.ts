import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'SEED_ADMIN_EMAIL'])
  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    define: {
      // Only the admin email is public. Never expose SEED_ADMIN_PASSWORD or service keys.
      'import.meta.env.VITE_ADMIN_EMAIL': JSON.stringify(env.VITE_ADMIN_EMAIL || env.SEED_ADMIN_EMAIL || ''),
    },
  }
})
