import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    deps: {
      // Let vitest resolve workspace packages
      moduleDirectories: ['node_modules', path.resolve(__dirname, 'node_modules')],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'artifacts/arpg-game/src'),
      '@workspace/game-systems': path.resolve(__dirname, 'lib/game-systems/src/index.ts'),
      // Resolve three from the arpg-game workspace
      'three': path.resolve(__dirname, 'node_modules/three'),
    },
  },
});
