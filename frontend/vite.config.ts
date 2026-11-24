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
          const isPortal = dep.includes('page-admin') ||
            dep.includes('page-rider') ||
            dep.includes('page-partner') ||
            dep.includes('page-customer-dashboard') ||
            dep.includes('page-tracking') ||
            dep.includes('page-coolers') ||
            dep.includes('Modal');
          return !isPortal;
        });
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate back-office & portal dashboards so customer bundles never load them
          if (id.includes('/pages/AdminDashboardPage')) {
            return 'page-admin';
          }
          if (id.includes('/pages/RiderDeliveryPage')) {
            return 'page-rider';
          }
          if (id.includes('/pages/ButcherStationPage')) {
            return 'page-partner';
          }
          if (id.includes('/pages/CustomerDashboardPage')) {
            return 'page-customer-dashboard';
          }
          if (id.includes('/pages/OrderTrackingPage')) {
            return 'page-tracking';
          }
          if (id.includes('/pages/CoolerReturnsPage')) {
            return 'page-coolers';
          }
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer';
            }
          }
        }
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
