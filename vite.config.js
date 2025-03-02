import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'leaflet': path.resolve(__dirname, 'node_modules/leaflet')
    }
  },
  server: {
    port: 5200
  }
})