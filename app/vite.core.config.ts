// Bundles the shared clinical + FHIR logic for Node consumers (the telephony
// server). Same reasoning as vite.bot.config.ts: vite is already installed, so
// this needs no new dependency.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: 'src/server/core.ts', formats: ['es'], fileName: () => 'index.js' },
    outDir: 'dist/core',
    emptyOutDir: true,
    minify: false,
    ssr: true,
    rollupOptions: { external: ['@medplum/core', '@medplum/fhirtypes'] },
  },
});
