import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Version = build time. The client compares it with /version.json to show an "update available" banner.
const BUILD = process.argv.includes('build') ? new Date().toISOString().slice(0, 16).replace('T', ' ') : 'dev';
const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

/** Dev server proxies the API + socket to the Node server (npm run dev starts both). */
const API = `http://127.0.0.1:${process.env.DEV_SERVER_PORT ?? 3330}`;

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  resolve: {
    alias: { '@sdk': path.resolve(import.meta.dirname, 'src/sdk') },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor chunks change rarely; rebuilding a game only invalidates that game's chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          if (/framer-motion|motion-dom|motion-utils|canvas-confetti/.test(id)) return 'motion';
          if (/socket\.io|engine\.io/.test(id)) return 'net';
          return 'vendor';
        },
      },
    },
  },
  server: {
    host: true,
    port: 5330,
    proxy: {
      '/socket.io': { target: API, ws: true },
      '/api': { target: API },
    },
  },
});
