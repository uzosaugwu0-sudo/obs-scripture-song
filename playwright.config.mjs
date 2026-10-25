import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.js',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'node e2e/serve.mjs', port: 4173, reuseExistingServer: true },
});
