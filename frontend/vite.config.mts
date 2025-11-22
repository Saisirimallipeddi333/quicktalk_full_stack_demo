import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Polyfill `global` so sockjs-client works in the browser bundle
  define: {
    global: 'window',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
