import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root, base: './', plugins: [react()],
  build: { outDir: process.env.MN_MODULE_DEMO_OUTPUT || path.resolve(root, '../../..', 'dist/comment-modules-demo'), emptyOutDir: true, target: 'es2020' },
});
