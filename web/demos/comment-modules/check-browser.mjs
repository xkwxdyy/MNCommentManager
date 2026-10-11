// Optional integration runner. Uses a fresh headless browser and temporary
// sample store; never borrows user tabs or touches a native MarginNote library.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MN_MODULE_DEMO_PLAYWRIGHT || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.MN_MODULE_DEMO_OUTPUT || path.join(here, '../../..', 'dist/comment-modules-demo'));
const artifacts = path.resolve(process.env.MN_MODULE_DEMO_REPORT || path.join(here, '../../..', 'dist/comment-modules-checks'));
await mkdir(artifacts, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), 'mn-module-browser-'));
const server = await createDemoServer({ root, filename: path.join(temporary, 'state.json') });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.MN_MODULE_DEMO_CHROME || (!existsSync(chromium.executablePath()) && existsSync(chromePath) ? chromePath : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
let currentPage;
const report = { base, checks: [], errors: [], limitations: ['Chromium 多点触摸模拟不代表真实 iPad 或 MarginNote 宿主验收。'] };
const record = (name, details = {}) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`); };
const watch = page => { page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); }); };
async function ready(page) { await page.locator('.demo-root').waitFor(); await page.waitForFunction(() => !document.querySelector('.status-message')?.textContent.includes('正在保存')); }
async function settings(page, profile, scope = 'card', includeTitle = true) {
  await page.getByRole('button', { name: '模块划分设置', exact: true }).click();
  await page.getByLabel('应用范围', { exact: true }).selectOption(scope);
  await page.getByLabel('划分方案', { exact: true }).selectOption(profile);
  await page.getByLabel('模块选择包含结构标题', { exact: true }).setChecked(includeTitle);
  await page.getByRole('button', { name: '保存方案', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function reset(page) {
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click();
  await page.getByRole('button', { name: '确认重置', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage(); currentPage = page; watch(page); await page.goto(base); await ready(page);
  assert.equal(await page.locator('[data-module-id]').count(), 6);
  await settings(page, 'nested');
  assert.ok(await page.locator('[data-module-id]').count() > 6);
  await page.screenshot({ path: path.join(artifacts, 'desktop.png') });
  const ids = await page.locator('[data-comment-id]').evaluateAll(nodes => nodes.map(n => n.dataset.commentId));
  assert.equal(ids.length, new Set(ids).size);
  record('嵌套结构与评论单次渲染');
  await page.getByRole('button', { name: '折叠评论 #3', exact: true }).click();
  await ready(page);
  const readSnapshot = async () => (await page.request.post(`${base}/api/bridge`, { data: { command: 'getState', payload: {} } })).json();
  const beforeVisibility = await readSnapshot();
  const moduleVisibility = page.locator('#module-mixed-2 > header .demo-module-visibility');
  await moduleVisibility.focus(); await page.keyboard.press('Enter');
  assert.equal(await moduleVisibility.textContent(), '');
  assert.equal(await moduleVisibility.getAttribute('aria-label'), '显示模块内容：方法一：直接估计');
  assert.equal(await moduleVisibility.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-comment-id="mixed-3"]').count(), 0);
  assert.match(await page.locator('#module-mixed-2 > .demo-module-summary').textContent(), /全文或摘要显示状态保持不变/);
  await page.keyboard.press('Enter');
  assert.equal(await moduleVisibility.textContent(), '');
  assert.equal(await moduleVisibility.getAttribute('aria-label'), '隐藏模块内容：方法一：直接估计');
  assert.equal(await page.locator('[data-comment-id="mixed-3"] .comment-fold-preview').count(), 1);
  assert.equal(await page.locator('[data-comment-id="mixed-4"] .demo-comment-body').count(), 1);
  assert.deepEqual(await readSnapshot(), beforeVisibility);
  await page.getByRole('button', { name: '撤销：评论折叠', exact: true }).click(); await ready(page);
  record('模块内容显隐与评论摘要独立，键盘切换不改写模拟数据');
  assert.equal(await page.getByRole('button', { name: '折叠模块评论：证明', exact: true }).count(), 0);
  await page.getByLabel('选择模块：证明（含标题）', { exact: true }).check();
  await page.getByRole('button', { name: '折叠模块评论：证明', exact: true }).focus(); await page.keyboard.press('Enter'); await ready(page);
  let foldedSnapshot = (await readSnapshot()).payload;
  assert.ok(foldedSnapshot.cards[0].comments.slice(1, 13).every(c => c.collapsed));
  assert.ok(foldedSnapshot.cards[0].comments.slice(13).every(c => !c.collapsed));
  assert.equal(await page.getByLabel('选择模块：证明（含标题）', { exact: true }).isChecked(), true);
  await page.getByRole('button', { name: '隐藏模块内容：证明', exact: true }).click();
  await page.getByRole('button', { name: '展开模块评论：证明', exact: true }).click(); await ready(page);
  foldedSnapshot = (await readSnapshot()).payload;
  assert.ok(foldedSnapshot.cards[0].comments.slice(1, 13).every(c => !c.collapsed));
  assert.equal(await page.getByRole('button', { name: '显示模块内容：证明', exact: true }).count(), 1);
  await page.getByRole('button', { name: '撤销：评论折叠', exact: true }).click(); await ready(page);
  assert.ok((await readSnapshot()).payload.cards[0].comments.slice(1, 13).every(c => c.collapsed));
  await page.getByRole('button', { name: '撤销：评论折叠', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: '显示模块内容：证明', exact: true }).click();
  record('模块全选后出现批量评论折叠箭头，支持隐藏模块操作与模拟撤销');
  await page.getByRole('button', { name: '图片', exact: true }).click();
  await page.getByLabel('选择模块：证明（含标题）', { exact: true }).check();
  assert.match(await page.locator('.demo-selection-summary').textContent(), /已选 12/);
  assert.ok(await page.locator('.demo-hidden-count').count());
  await page.getByRole('button', { name: '重置筛选', exact: true }).click();
  await page.getByRole('button', { name: '清空选区', exact: true }).click();
  await page.getByRole('button', { name: '模块操作：证明', exact: true }).click();
  await page.getByRole('button', { name: '仅选择正文（排除各级标题）', exact: true }).click();
  assert.match(await page.locator('.demo-selection-summary').textContent(), /已选 6/);
  await page.getByRole('button', { name: '移动所选正文', exact: true }).click();
  await page.getByLabel('目标模块', { exact: true }).selectOption('module-mixed-17');
  await page.getByRole('button', { name: '确认移动正文', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '撤销：正文移动', exact: true }).click();
  await ready(page); record('隐藏成员选择、正文移动与模拟撤销');
  await page.getByRole('button', { name: '模块操作：证明', exact: true }).click();
  await page.getByRole('button', { name: '提取模块为子卡片', exact: true }).click();
  await page.getByLabel('子卡片标题', { exact: true }).fill('浏览器验证子卡片');
  await page.getByRole('button', { name: '确认提取', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '查看子卡片', exact: true }).click();
  assert.match(await page.locator('.demo-card-picker option:checked').textContent(), /浏览器验证子卡片/);
  await page.getByLabel('样例卡片', { exact: true }).selectOption('mixed');
  await page.reload(); await ready(page);
  assert.match(await page.locator('.demo-profile-summary').textContent(), /HTML＋Markdown/);
  await page.getByRole('button', { name: '撤销：提取子卡片', exact: true }).click();
  await ready(page); record('子卡片查看与刷新恢复');
  await page.getByLabel('选择模块：证明（含标题）', { exact: true }).check();
  for (const [width, height] of [[1200, 800], [985, 600], [600, 480], [600, 360], [375, 480], [375, 360], [320, 360]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => {
      const pane = document.querySelector('.demo-pane').getBoundingClientRect();
      const footer = document.querySelector('.demo-footer').getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, paneWidth: pane.width, paneHeight: pane.height, footerBottom: footer.bottom, viewport: innerHeight };
    });
    assert.ok(bounds.width <= width + 1, `horizontal overflow ${width}x${height}: ${bounds.width}`);
    assert.ok(bounds.paneHeight >= 70, `pane too short ${width}x${height}: ${bounds.paneHeight}`);
    assert.ok(bounds.paneWidth >= width - (width > 700 ? 201 : 1), `pane too narrow ${width}x${height}: ${bounds.paneWidth}`);
    assert.ok(bounds.footerBottom <= height + 1);
    const foldBounds = await page.getByRole('button', { name: '折叠模块评论：证明', exact: true }).boundingBox();
    assert.ok(foldBounds && foldBounds.width >= 32 && foldBounds.x + foldBounds.width <= width);
    await page.getByRole('button', { name: '模块操作：证明', exact: true }).click();
    await page.getByRole('button', { name: '整体下移模块', exact: true }).waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    record(`窗口 ${width}×${height}`, bounds);
  }
  await page.screenshot({ path: path.join(artifacts, 'narrow.png') });
  await page.getByRole('button', { name: '模块划分设置', exact: true }).focus();
  await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: '模块划分设置', exact: true }).evaluate(el => el === document.activeElement), true);
  record('键盘打开、焦点约束与返回');

  const touchContext = await browser.newContext({ viewport: { width: 985, height: 800 }, hasTouch: true });
  const touchPage = await touchContext.newPage(); currentPage = touchPage; watch(touchPage); await touchPage.goto(base); await ready(touchPage); await reset(touchPage);
  await touchPage.getByLabel('样例卡片', { exact: true }).selectOption('long');
  const cdp = await touchContext.newCDPSession(touchPage);
  await touchPage.evaluate(() => {
    window.__demoTouchTrace = [];
    for (const name of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.querySelector('.demo-pane').addEventListener(name, event => {
      window.__demoTouchTrace.push({ type: name, cancelable: event.cancelable, prevented: event.defaultPrevented, points: [...event.touches].map(p => ({ id: p.identifier, x: p.clientX, y: p.clientY })) });
    });
  });
  const dispatchTouch = async(type, points) => {await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });if(type==='touchMove')await touchPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const point = async id => {
    const rect = await touchPage.locator(`[data-comment-id="${id}"] .demo-comment-body`).boundingBox();
    assert.ok(rect); return { x: Math.round(rect.x + 60), y: Math.round(rect.y + Math.min(25, rect.height / 2)) };
  };
  const pair = (p, gap = 28) => [{ x: p.x, y: p.y, id: 1 }, { x: p.x + gap, y: p.y, id: 2 }];
  const check = id => touchPage.locator(`[data-comment-id="${id}"] .comment-head input`);
  await check('long-1').check();
  const a = await point('long-2'), b = await point('long-3');
  report.touchStart = { a, b };
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair(b));
  await touchPage.waitForFunction(() => document.querySelector('[data-comment-id="long-2"] .comment-head input').checked, undefined, { timeout: 3000 });
  await dispatchTouch('touchEnd', []);
  assert.equal(await check('long-1').isChecked(), true); assert.equal(await check('long-2').isChecked(), true); assert.equal(await check('long-3').isChecked(), true);
  record('Chromium 双指增选并保留范围外选区');
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair(b));
  assert.equal(await check('long-2').isChecked(), false); assert.equal(await check('long-3').isChecked(), false);
  await dispatchTouch('touchMove', pair(a)); await dispatchTouch('touchEnd', []);
  assert.equal(await check('long-2').isChecked(), false); assert.equal(await check('long-3').isChecked(), true);
  record('Chromium 双指取消选择与反向回缩');
  await dispatchTouch('touchStart', pair(a));
  await dispatchTouch('touchMove', pair(a, 85)); await dispatchTouch('touchEnd', []);
  assert.equal(await check('long-2').isChecked(), false); assert.equal(await check('long-3').isChecked(), true);
  record('Chromium 识别前捏合不进入多选');
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair(b));
  await dispatchTouch('touchStart', [...pair(b), { x: b.x + 100, y: b.y, id: 3 }]); await dispatchTouch('touchEnd', []);
  assert.equal(await check('long-2').isChecked(), false); record('Chromium 额外触点取消');
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair(b));
  await touchPage.getByRole('button', { name: '操作说明与验证边界', exact: true }).focus(); await touchPage.keyboard.press('Enter');
  await touchPage.getByRole('dialog').waitFor();
  assert.equal(await check('long-2').isChecked(), false); assert.equal(await check('long-3').isChecked(), true);
  await dispatchTouch('touchEnd', []); await touchPage.keyboard.press('Escape'); await touchPage.getByRole('dialog').waitFor({ state: 'hidden' });
  record('Chromium 弹窗中断恢复原选区');
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair(b));
  await touchPage.getByLabel('样例卡片', { exact: true }).selectOption('plain'); await dispatchTouch('touchEnd', []);
  assert.match(await touchPage.locator('.demo-selection-summary').textContent(), /已选 0/);
  await touchPage.getByLabel('样例卡片', { exact: true }).selectOption('long');
  record('Chromium 卡片切换中断并清空选区');
  const pane = await touchPage.locator('.demo-pane').boundingBox();
  await dispatchTouch('touchStart', pair(a)); await dispatchTouch('touchMove', pair({ x: a.x, y: Math.round(pane.y + pane.height - 8) }));
  await touchPage.waitForFunction(() => document.querySelector('.demo-pane').scrollTop > 45);
  await dispatchTouch('touchEnd', []); record('Chromium 边缘自动滚动');
  await touchPage.locator('.demo-pane').evaluate(el => { el.scrollTop = 0; });
  const one = await point('long-2');
  await dispatchTouch('touchStart', [{ ...one, id: 1 }]);
  await dispatchTouch('touchMove', [{ x: one.x, y: one.y - 60, id: 1 }]);
  await dispatchTouch('touchMove', [{ x: one.x, y: one.y - 120, id: 1 }]); await dispatchTouch('touchEnd', []);
  await touchPage.waitForFunction(() => document.querySelector('.demo-pane').scrollTop > 30);
  record('Chromium 单指滚动保留');
  // Start a separate scenario after native momentum scrolling. A touch during
  // committed inertia may be noncancelable; that is intentionally rejected.
  await touchPage.reload(); await ready(touchPage);
  await touchPage.getByLabel('样例卡片', { exact: true }).selectOption('long');
  await touchPage.getByRole('button', { name: '图片', exact: true }).click();
  await touchPage.locator('.demo-pane').evaluate(el => { el.scrollTop = 0; });
  const imageA = await point('long-4'), imageB = await point('long-8');
  await dispatchTouch('touchStart', pair(imageA)); await dispatchTouch('touchMove', pair(imageB)); await dispatchTouch('touchEnd', []);
  assert.match(await touchPage.locator('.demo-selection-summary').textContent(), /已选 2/);
  assert.equal(await check('long-4').isChecked(), true); assert.equal(await check('long-8').isChecked(), true);
  record('Chromium 筛选后双指仅选择显示项');
  await touchPage.screenshot({ path: path.join(artifacts, 'touch-selection.png') });
  // Finish the touch compatibility-click suppression before the separate
  // mouse-driven layout scenario starts selecting a complete module.
  await touchPage.waitForTimeout(550);
  await touchPage.getByLabel('选择模块：章节 1（含标题）', { exact: true }).check();
  for (const [width, height] of [[375, 480], [375, 360], [320, 360]]) {
    await touchPage.setViewportSize({ width, height });
    const metrics = await touchPage.evaluate(() => ({ width: document.documentElement.scrollWidth, paneHeight: document.querySelector('.demo-pane').getBoundingClientRect().height, footer: document.querySelector('.demo-footer').getBoundingClientRect().bottom }));
    assert.ok(metrics.width <= width + 1); assert.ok(metrics.paneHeight >= 65, JSON.stringify(metrics)); assert.ok(metrics.footer <= height + 1);
    const arrow = touchPage.getByRole('button', { name: '折叠模块评论：章节 1', exact: true });
    const arrowBounds = await arrow.boundingBox();
    assert.ok(arrowBounds && arrowBounds.width >= 42 && arrowBounds.height >= 42 && arrowBounds.x + arrowBounds.width <= width);
    await arrow.click(); await ready(touchPage);
    assert.equal(await touchPage.getByRole('button', { name: '展开模块评论：章节 1', exact: true }).count(), 1);
    await touchPage.getByRole('button', { name: '展开模块评论：章节 1', exact: true }).click(); await ready(touchPage);
    record(`触屏布局 ${width}×${height}`, metrics);
  }
  await touchPage.screenshot({ path: path.join(artifacts, 'touch-narrow.png') });
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await rm(path.join(artifacts, 'failure.png'), { force: true });
} catch (error) {
  if (currentPage) {
    await currentPage.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
    report.lastStatus = await currentPage.locator('.status-message').textContent().catch(() => null);
    report.touchTrace = await currentPage.evaluate(() => window.__demoTouchTrace).catch(() => null);
  }
  report.passed = false; report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true });
}
