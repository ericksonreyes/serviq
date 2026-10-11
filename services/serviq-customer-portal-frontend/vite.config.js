import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Containerized E2E + LAN/mobile dev testing reach vite by service name.
  server: { allowedHosts: true },
  plugins: [react()],
})
