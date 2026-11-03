import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration files share one Docker host; run files one at a time.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          // Starting Postgres in Docker and migrating takes a while on a cold machine.
          hookTimeout: 180_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
