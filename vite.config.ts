/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation enables SharedArrayBuffer, which the multi-threaded
// Stockfish build needs. Production hosting sends the same headers
// (public/_headers for Cloudflare Pages / Netlify).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Maia runs on the plain WASM backend; skip the WebGPU/JSEP build (~30 MB).
    alias: { 'onnxruntime-web': 'onnxruntime-web/wasm' },
  },
  // The opening book (≈730 kB, 86 kB gzipped) is its own lazily loaded chunk.
  build: { chunkSizeWarningLimit: 800 },
  preview: { headers: isolation },
  server: {
    headers: isolation,
    // Dev-only stand-in for the Cloudflare Worker proxy (proxy/worker.ts):
    // Chess.com's game callback endpoint sends no CORS headers.
    proxy: {
      '/proxy/chesscom': {
        target: 'https://www.chess.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/chesscom/, '/callback'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'proxy/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
