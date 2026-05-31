import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    headers: {
      'Content-Security-Policy': 
        "default-src 'self' https://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com data:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "connect-src 'self' https://*.supabase.co https://app.bosta.co https://rehlaeg.online ws://localhost:5173 http://localhost:5000/api/; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https://*.supabase.co https://images.unsplash.com;"
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
