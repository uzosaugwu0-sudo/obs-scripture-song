import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**', 'src/scripture/**', 'src/songs/**', 'src/plan/**', 'src/transport/**',
        'src/overlay/style-math.js', 'src/overlay/split-lines.js', 'src/dock/session.js', 'src/dock/diagnostics.js', 'src/dock/settings-store.js',
      ],
      exclude: ['src/scripture/offline.js'],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
