const path = require('node:path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
module.exports = defineConfig({ plugins: [react()], root: __dirname,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: path.resolve(__dirname, '../src/web-dist/quick-assets'), emptyOutDir: true,
    target: 'safari11', cssCodeSplit: false,
    lib: { entry: path.resolve(__dirname, 'src/quick-comment-main.jsx'), name: 'MNQuickCommentApp', formats: ['iife'], fileName: 'quick-comment', cssFileName: 'quick-comment' } }
});
