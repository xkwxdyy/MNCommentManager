// Trusted Chromium touch checks against a production bundle and a read-only
// native stand-in. Timings belong to desktop Chromium, never to an iPad.
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { defaultSettings } from '../web/src/lib/commentModules.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MN_GESTURE_PLAYWRIGHT || 'playwright');
const root = path.resolve(process.env.MN_GESTURE_BUILD || '/tmp/mn-two-finger-panel-build');
const output = path.resolve(process.env.MN_GESTURE_CHECK_OUTPUT || 'dist/two-finger-selection-checks');
await mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const filename = path.resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(filename)] || 'application/octet-stream';
    const bytes = await readFile(filename);
    res.writeHead(200, { 'Content-Type': type }); res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.MN_GESTURE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [], calls = [], checks = [];
const snapshot = {
  noteId: 'gesture-stress-500', noteTitle: '500 条混合评论', error: '',
  excerpt: { present: false, capabilities: {} }, moduleSettings: defaultSettings(), commentFold: { supported: true, revision: '1' },
  comments: Array.from({ length: 500 }, (_, index) => {
    const markdown = index === 1 || index % 3 === 0, html = index > 5 && index % 25 === 0;
    return { index, type: html ? 'HtmlComment' : markdown ? 'markdownComment' : 'textComment',
      text: html ? `模块 ${index}` : markdown ? `**评论 ${index}**\n\n[正文链接](https://example.com)\n\n完整内容供连续选择。` : `评论 ${index}\n\n完整内容供连续选择。`,
      htmlText: html ? `<h2>模块 ${index}</h2>` : '', collapsed: false,
      capabilities: { canSetCollapsed: true, canMove: true, canCopyText: true, isHtml: html, isMarkdown: markdown && !html },
    };
  }),
};
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__gestureNativeSend', (command) => {
    calls.push(command);
    if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return snapshot;
    return {};
  });
  await page.addInitScript(() => {
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function(node) {
      if (node.tagName === 'IFRAME' && node.src.startsWith('mnaddon://bridge?payload=')) {
        const message = JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
        window.__gestureNativeSend(message.command, message.payload).then(payload => window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({ requestId: message.requestId, payload })));
        return node;
      }
      return append.call(this, node);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#comment-499').waitFor({ state: 'attached' });
  const cdp = await context.newCDPSession(page);
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dispatch = async (type, touchPoints, wait = true) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints }); if (wait) await frame(); };
  const selected = () => page.locator('[data-comment-index][aria-pressed="true"]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.commentIndex)));
  const clear = async () => { await page.getByRole('button', { name: '清空', exact: true }).focus(); await page.keyboard.press('Enter'); await page.locator('#comment-pane').evaluate(el => { el.scrollTop = 0; }); await frame(); };
  const bodyPoint = async (index, selector = '.comment-body') => {
    const box = await page.locator(`#comment-${index} ${selector}`).boundingBox(); assert.ok(box);
    return { x: Math.round(box.x + Math.min(75, box.width / 3)), y: Math.round(box.y + Math.min(22, box.height / 2)) };
  };
  const pair = (p, gap = 60) => [{ x: p.x, y: p.y, id: 1 }, { x: p.x + gap, y: p.y, id: 2 }];
  await page.evaluate(() => {
    const original = Element.prototype.getBoundingClientRect;
    window.__gestureTiming = { rowReads: 0, latencies: [], moves: 0, lastMove: null };
    Element.prototype.getBoundingClientRect = function(...args) { if (this.hasAttribute('data-comment-index')) window.__gestureTiming.rowReads++; return original.apply(this, args); };
    document.addEventListener('touchmove', e => { if (e.touches.length === 2) { window.__gestureTiming.moves++; window.__gestureTiming.lastMove = performance.now(); } }, { capture: true, passive: true });
    // No-change moves must not be attributed to a later toolbar/keyboard edit.
    document.addEventListener('touchend', () => setTimeout(() => { window.__gestureTiming.lastMove = null; }, 0), { capture: true, passive: true });
    document.addEventListener('keydown', () => { window.__gestureTiming.lastMove = null; }, true);
    document.addEventListener('touchstart', () => { window.__gestureTiming.lastMove = null; }, { capture: true, passive: true });
    new MutationObserver(entries => {
      const metrics = window.__gestureTiming;
      if (metrics.lastMove !== null && entries.some(e => e.attributeName === 'aria-pressed')) {
        metrics.latencies.push(performance.now() - metrics.lastMove); metrics.lastMove = null;
      }
    }).observe(document.querySelector('#comment-pane'), { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  });
  const initialCalls = calls.length;
  const a = await bodyPoint(0), b = await bodyPoint(1);
  await dispatch('touchStart', pair(a)); await dispatch('touchMove', pair(b));
  assert.deepEqual(await selected(), [0, 1]);
  await dispatch('touchMove', pair({ ...b, y: b.y + 15 }, 78).reverse());
  assert.deepEqual(await selected(), [0, 1]); await dispatch('touchEnd', []);
  checks.push('coherent pan tolerates 18px separation drift and reordered contacts');
  await clear();
  await dispatch('touchStart', pair(a)); await dispatch('touchMove', pair({ x: a.x + 13, y: a.y + 10 }));
  await dispatch('touchMove', pair(b)); await dispatch('touchEnd', []); assert.deepEqual(await selected(), [0, 1]);
  checks.push('diagonal launch continues into a vertical range');
  for (const delay of [0, 30, 60, 90, 120]) {
    await clear(); await dispatch('touchStart', pair(a).slice(0, 1), false);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await dispatch('touchStart', pair(a)); await dispatch('touchMove', pair(b)); await dispatch('touchEnd', []);
    assert.deepEqual(await selected(), [0, 1]); checks.push(`staggered pair ${delay}ms before movement`);
  }
  await clear();
  const gap = await page.evaluate(() => { const a = document.querySelector('#comment-0').getBoundingClientRect(), b = document.querySelector('#comment-1').getBoundingClientRect(); return { x: a.left + 75, y: Math.round((a.bottom + b.top) / 2), size: b.top - a.bottom }; });
  assert.ok(gap.size > 0 && gap.size <= 32, `gap size ${gap.size}`);
  await dispatch('touchStart', pair(gap)); await dispatch('touchMove', pair(b)); await dispatch('touchEnd', []);
  assert.ok((await selected()).includes(1)); checks.push('narrow gap starts selection');
  await clear(); const linkBox = await page.locator('#comment-1 .comment-body a').boundingBox(); assert.ok(linkBox);
  const link = { x: Math.round(linkBox.x + 5), y: Math.round(linkBox.y + linkBox.height / 2) };
  await dispatch('touchStart', pair(link)); await dispatch('touchMove', pair({ ...link, y: link.y + 12 })); await dispatch('touchEnd', []);
  assert.deepEqual(await selected(), [1]); assert.equal(page.url(), `http://127.0.0.1:${server.address().port}/`); checks.push('body link starts selection without navigation');
  await clear();
  await dispatch('touchStart', pair(a)); await dispatch('touchMove', [{ x: a.x - 30, y: a.y, id: 1 }, { x: a.x + 90, y: a.y, id: 2 }]); await dispatch('touchEnd', []);
  assert.deepEqual(await selected(), []); checks.push('true pinch before recognition stays out of selection');
  await clear();
  await dispatch('touchStart', pair(a)); await dispatch('touchMove', pair(b));
  const before = await page.evaluate(() => window.__gestureTiming.rowReads);
  for (let i = 0; i < 30; i++) await dispatch('touchMove', pair({ ...b, y: b.y + (i % 5) }));
  const extraRowReads = (await page.evaluate(() => window.__gestureTiming.rowReads)) - before;
  assert.equal(extraRowReads, 0); await dispatch('touchEnd', []); checks.push('30 stationary-row touch frames perform zero extra row geometry reads');
  assert.equal(calls.length, initialCalls, 'selection must not call the native Bridge');
  await clear(); const pane = await page.locator('#comment-pane').boundingBox();
  await dispatch('touchStart', pair(a)); await dispatch('touchMove', pair({ ...a, y: Math.round(pane.y + pane.height - 8) }));
  await page.waitForFunction(() => document.querySelector('#comment-pane').scrollTop > 50);
  await dispatch('touchEnd', []); const stopped = await page.locator('#comment-pane').evaluate(el => el.scrollTop);
  await frame(); assert.equal(await page.locator('#comment-pane').evaluate(el => el.scrollTop), stopped); checks.push('edge scroll advances selection and stops on release');
  await clear();
  await dispatch('touchStart', [{ ...b, id: 1 }]); await dispatch('touchMove', [{ x: b.x, y: b.y - 80, id: 1 }]); await dispatch('touchMove', [{ x: b.x, y: b.y - 160, id: 1 }]); await dispatch('touchEnd', []);
  assert.ok(await page.locator('#comment-pane').evaluate(el => el.scrollTop > 0)); assert.deepEqual(await selected(), []); checks.push('one-finger native scrolling remains available');
  const timing = await page.evaluate(() => window.__gestureTiming);
  const sorted = [...timing.latencies].sort((x, y) => x - y);
  assert.deepEqual(errors, []);
  const report = { environment: 'desktop Chromium, trusted CDP touch, simulated native Bridge', realIPadMeasurement: false, browserVersion: browser.version(), commentCount: 500, checks, extraRowReads, latency: { samples: sorted.length, p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))], maxMs: sorted.at(-1) }, errors };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(output, 'panel.png'), fullPage: true }); console.log(JSON.stringify(report, null, 2));
  await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
