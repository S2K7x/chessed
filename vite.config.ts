/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
