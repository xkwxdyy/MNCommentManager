// Verify the production page with an in-memory Bridge; no real note writes.
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { defaultSettings } from '../web/src/lib/commentModules.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MN_MODULE_DEMO_PLAYWRIGHT || 'playwright');
const root = path.resolve(process.env.MN_HTML_SELECT_OUTPUT || '/tmp/mn-html-select-web');
const output = path.resolve('dist/html-select-checks');
await mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const filename = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
    if (!filename.startsWith(root + path.sep)) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(filename)] || 'application/octet-stream';
    const bytes = await readFile(filename);
    res.writeHead(200, { 'Content-Type': type }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
const results = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.MN_MODULE_DEMO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const [width, height, dark, touch] of [[985, 800, false, false], [768, 700, false, true], [375, 480, true, true], [320, 360, false, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', hasTouch: touch });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(e.message));
    let snapshot = { noteId: 'test', noteTitle: '评论控件验证', moduleSettings: defaultSettings(), commentFold: { supported: true, revision: 'r' }, excerpt: { present: false }, comments: [{ index: 0, type: 'HtmlComment', text: '模块标题', htmlText: '模块标题', collapsed: false, capabilities: { isHtml: true, canSetCollapsed: true } }, { index: 1, type: 'textComment', text: '评论正文', collapsed: false, capabilities: { canSetCollapsed: true } }] };
    await page.exposeFunction('__testNativeSend', async (command, payload) => {
      if (command === 'saveCommentModuleSettings') { snapshot = { ...snapshot, moduleSettings: { ...payload.settings, revision: payload.expectedRevision + 1 } }; return { persisted: true, moduleSettings: snapshot.moduleSettings }; }
      if (command === 'setCommentsCollapsed') { snapshot = { ...snapshot, comments: snapshot.comments.map(c => payload.indices.includes(c.index) ? { ...c, collapsed: payload.collapsed } : c) }; return { persisted: true, snapshot }; }
      return snapshot;
    });
    await page.addInitScript(() => {
      const append = Node.prototype.appendChild;
      Node.prototype.appendChild = function (node) {
        if (node.tagName === 'IFRAME' && node.src.startsWith('mnaddon://bridge?payload=')) {
          const message = JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
          window.__testNativeSend(message.command, message.payload).then(payload => window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({ requestId: message.requestId, payload })));
          return node;
        }
        return append.call(this, node);
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const trigger = page.getByRole('button', { name: '模块划分设置', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    const settleAnimations = () => page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    await settleAnimations();
    assert.equal(await page.locator('select').count(), 0);
    const combos = dialog.getByRole('combobox');
    assert.equal(await combos.count(), 3);
    const scope = combos.nth(0);
    if (touch) await scope.tap(); else await scope.click();
    const list = page.getByRole('listbox'); await list.waitFor();
    const rect = await list.boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, JSON.stringify(rect));
    const option = page.getByRole('option', { name: '当前卡片', exact: true });
    if (touch) await option.tap(); else await option.click();
    assert.ok((await scope.textContent()).includes('当前卡片'));
    await combos.nth(1).click();
    await page.keyboard.press('End'); await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1); assert.equal(await page.getByRole('listbox').count(), 0);
    await combos.nth(1).click();
    await page.getByRole('option', { name: 'HTML＋Markdown', exact: true }).click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await dialog.count(), 0); assert.equal(snapshot.moduleSettings.cardOverrides.test.profileId, 'nested');
    // The ordinary comment disclosure remains available after settings refresh.
    await page.locator('#comment-1 .comment-fold-button').click();
    await page.waitForFunction(() => document.querySelector('#comment-1 .comment-fold-button')?.getAttribute('aria-expanded') === 'false');
    assert.equal(snapshot.comments[1].collapsed, true);
    await trigger.click(); await settleAnimations(); await combos.nth(0).click();
    await page.screenshot({ path: path.join(output, `${width}x${height}-${dark ? 'dark' : 'light'}.png`) });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.ok(await trigger.evaluate(node => document.activeElement === node));
    results.push({ width, height, dark, touch, status: 'passed' }); await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
