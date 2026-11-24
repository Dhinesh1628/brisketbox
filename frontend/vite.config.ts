import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  envDir: '../',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'es2022',
    cssMinify: true,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        // Customers must NEVER download or preload admin, rider, or partner code on initial visit
        return deps.filter(dep => {
          const lower = dep.toLowerCase();
          const isPortal = lower.includes('admin') ||
            lower.includes('rider') ||
            lower.includes('butcher') ||
            lower.includes('partner') ||
            lower.includes('tracking') ||
            lower.includes('cooler') ||
            lower.includes('modal');
          return !isPortal;
        });
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
