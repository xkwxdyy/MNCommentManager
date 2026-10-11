import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['web/demos/comment-modules/App.test.jsx'], environment: 'jsdom' } });
