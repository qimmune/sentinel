// Bundles the Medplum Bot into a single file for pasting into the Bot Editor.
//
// Uses vite (already installed) rather than esbuild + @medplum/cli, so this
// needs no new dependency and works on venue wifi. @medplum/core is external
// because the Medplum bot layer provides it at runtime.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/bots/triageBot.ts',
      formats: ['es'],
      fileName: () => 'triageBot.js',
    },
    outDir: 'dist/bot',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: ['@medplum/core', '@medplum/fhirtypes'],
    },
  },
});
