import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**', 'src/scripture/**', 'src/songs/**', 'src/plan/**', 'src/transport/**',
        'src/overlay/style-math.js', 'src/overlay/split-lines.js', 'src/dock/live/session.js', 'src/dock/shared/diagnostics.js', 'src/dock/style/settings-store.js',
        'src/overlay/timer-clock.js', 'src/dock/plan/timer-run.js', 'src/dock/plan/extras-tab.js', 'src/dock/plan/logo-store.js', 'src/dock/plan/picture-folder.js',
      ],
      exclude: ['src/scripture/offline.js'],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
