import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  resolve: {
    alias: {
      'ogl': path.resolve(__dirname, './node_modules/ogl/src/index.js')
    }
  },
  server: {
    proxy: {
      // Backend API proxy (existing)
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      // Proxy AI API calls to avoid CORS (use different path to avoid conflict)
      '/ai/claude': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai\/claude/, '/v1'),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Add Anthropic-specific headers
            proxyReq.setHeader('anthropic-version', '2023-06-01');
          });
        }
      },
      '/ai/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai\/groq/, '/openai/v1')
      },
      '/ai/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai\/gemini/, '/v1beta')
      },
      '/ai/cerebras': {
        target: 'https://api.cerebras.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai\/cerebras/, '/v1')
      }
    },
  },
})
