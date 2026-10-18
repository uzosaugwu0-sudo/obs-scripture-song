import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'smoke',
  testMatch: '*.spec.js',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'node smoke/serve.mjs', port: 4173, reuseExistingServer: true },
});
