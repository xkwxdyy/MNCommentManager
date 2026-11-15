import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mncm-brush-build-'));
try {
  await build({ configFile: false, root: path.join(root, 'web'), plugins: [react()], base: './', build: {
    outDir: temporary, emptyOutDir: true, assetsInlineLimit: 10000000, cssCodeSplit: false,
    rolldownOptions: { input: path.join(directory, 'index.html'), output: { codeSplitting: false } },
  } });
  const entry = path.join(temporary, 'demos/format-brush/index.html');
  let html = await fs.readFile(entry, 'utf8');
  const resolve = url => path.resolve(path.dirname(entry), url);
  for (const match of [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
    const js = (await fs.readFile(resolve(match[1]), 'utf8')).replaceAll('</script', '<\\/script');
    html = html.replace(match[0], () => `<script type="module">${js}</script>`);
  }
  for (const match of [...html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)]) {
    const css = await fs.readFile(resolve(match[1]), 'utf8');
    html = html.replace(match[0], () => `<style>${css}</style>`);
  }
  const output = path.join(root, 'artifacts/format-brush-prototype');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'index.html'), html);
  console.log(`Standalone prototype: ${path.join(output, 'index.html')}`);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
