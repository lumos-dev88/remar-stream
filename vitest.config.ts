import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['attack/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx', '__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
  },
});
