import { defineConfig } from 'vitest/config';

export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], include: ['src/**/*.test.tsx'], restoreMocks: true, minWorkers: 1, maxWorkers: 2, testTimeout: 15000 } });
