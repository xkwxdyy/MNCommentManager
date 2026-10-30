const path = require('node:path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
if (!process.env.ADDON_WEB_OUTPUT_DIR) throw new Error("ADDON_WEB_OUTPUT_DIR is required for release builds");

module.exports = defineConfig({ plugins: [react()], root: __dirname,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: path.resolve(process.env.ADDON_WEB_OUTPUT_DIR, 'quick-assets'), emptyOutDir: true,
    target: 'safari11', cssCodeSplit: false,
    lib: { entry: path.resolve(__dirname, 'src/quick-comment-main.jsx'), name: 'MNQuickCommentApp', formats: ['iife'], fileName: 'quick-comment', cssFileName: 'quick-comment' } }
});
