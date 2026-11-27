import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022' },
  // tests/deno runs under Deno (Edge Function logic), not Vitest
  test: { exclude: ['node_modules/**', 'tests/deno/**'] },
});
