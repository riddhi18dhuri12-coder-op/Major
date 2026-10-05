import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In development the API runs on :4000; proxying keeps everything same-origin (no CORS setup needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js', globalSetup: './src/test/globalSetup.js', env: { VITE_API_ORIGIN: 'http://127.0.0.1:4011' }, testTimeout: 20000, fileParallelism: false },
})
