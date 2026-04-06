import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiBaseURL = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiBaseURL,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiBaseURL,
        changeOrigin: true,
      },
    },
  },
});
