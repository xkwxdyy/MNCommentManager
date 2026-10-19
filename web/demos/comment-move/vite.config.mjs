import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ root, base: './', plugins: [react()], build: { outDir: path.resolve(root, '../../../dist/comment-move-prototype'), emptyOutDir: true }, server: { host: '127.0.0.1', port: 5186, strictPort: true } });
