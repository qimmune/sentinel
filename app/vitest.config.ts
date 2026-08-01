import { defineConfig } from 'vitest/config';

// Scope tests to our own src/ only.
// Without this, vitest follows the medplum-link symlink and tries to run
// Medplum's entire monorepo test suite (~870 files).
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'medplum-link/**', '../medplum-src/**'],
  },
});
