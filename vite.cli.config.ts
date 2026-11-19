import { defineConfig } from 'vite';

/** Builds the command-line batch analyser (src/cli/analyse.ts) for Node. */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'src/cli/analyse.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node22',
    rolldownOptions: { output: { entryFileNames: 'analyse.mjs' } },
  },
  ssr: { noExternal: true, external: ['stockfish'] },
});
