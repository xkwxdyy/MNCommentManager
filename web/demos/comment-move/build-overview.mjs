import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(directory, '../../..');
const output = path.join(project, 'dist/comment-move-overview');
await build({ configFile: false, plugins: [react()], define: { 'process.env.NODE_ENV': '"production"' }, build: {
  outDir: output, emptyOutDir: false, cssCodeSplit: false,
  lib: { entry: path.join(directory, 'overview.jsx'), name: 'MNCommentOverview', formats: ['iife'], fileName: 'overview' },
} });
const css = fs.readFileSync(path.join(output, 'overview.css'), 'utf8');
const js = fs.readFileSync(path.join(output, 'overview.iife.js'), 'utf8').replaceAll('</script', '<\\/script');
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>评论移动 · 压缩列表原型</title><style>' + css + '</style></head><body><div id="root"></div><script>' + js + '</script></body></html>';
const destination = path.join(project, 'Resources/comment-move-prototype/compressed-overview/preview.html');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, html);
console.log(destination);
