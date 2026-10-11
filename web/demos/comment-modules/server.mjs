import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';

export async function createDemoServer({ root, filename }) {
  const store = await createStore(filename);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/bridge') {
        if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) { response.writeHead(405).end(); return; }
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}`) { response.writeHead(403).end(); return; }
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 256000) throw new Error('演示请求过大'); }
        const message = JSON.parse(body);
        const result = await store.send(message.command, message.payload);
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ payload: result }));
      } else {
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
        const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const filename = path.resolve(root, `.${name}`);
        if (!filename.startsWith(`${path.resolve(root)}${path.sep}`) || !mime[path.extname(filename)]) { response.writeHead(404).end(); return; }
        const bytes = await readFile(filename);
        response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      }
    } catch (error) {
      if (error.code === 'ENOENT') { response.writeHead(404).end(); return; }
      response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: error.message } }));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(process.env.MN_MODULE_DEMO_OUTPUT || path.join(here, '../../..', 'dist/comment-modules-demo'));
  const port = Number(process.env.MN_MODULE_DEMO_PORT || 5187);
  const host = process.env.MN_MODULE_DEMO_HOST || '127.0.0.1';
  const server = await createDemoServer({ root, filename: path.resolve(process.env.MN_MODULE_DEMO_STORE || path.join(root, '..', 'comment-modules-state.json')) });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`模块演示：http://${host}:${port} · 模拟 JSON 存储已启用`));
}
