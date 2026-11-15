const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require(process.env.MN_PUPPETEER_MODULE || 'puppeteer');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mncm-format-brush-'));
  const output = path.resolve(process.argv[3] || 'artifacts/format-brush-prototype/checks');
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.MN_CHROMIUM_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', userDataDir: profile, args: ['--use-mock-keychain', '--password-store=basic'] });
  const report = [];
  try {
    for (const [width, height, color] of [[1100, 800, 'light'], [390, 844, 'light'], [1100, 800, 'dark'], [600, 400, 'light']]) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', width, height, e.message); });
      await page.setViewport({ width, height });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: color }]);
      await page.goto(pathToFileURL(path.resolve(process.argv[2])).href);
      await page.waitForSelector('#comment-0');
      const contents = await page.$$eval('[data-comment-index] .plain-text-preview pre', els => els.map(el => el.textContent));
      const styles = () => page.$$eval('[data-comment-index] .plain-text-preview pre', els => els.map(el => ({ color: el.style.color, background: el.style.backgroundColor, size: el.style.fontSize })));
      const before = await styles();
      const openBrush = async () => {
        const visible = await page.$eval('.brush-entry', el => el.getBoundingClientRect().width > 0);
        if (visible) await page.click('.brush-entry');
        else { await page.click('[aria-label="更多选区操作"]'); await page.waitForSelector('.brush-menu-entry'); await page.click('.brush-menu-entry'); }
        await page.waitForSelector('.brush-dialog');
      };
      await page.click('#comment-0'); await page.waitForSelector('.brush-entry');
      assert.equal(await page.$eval('.brush-entry', el => el.disabled), false);
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-manager.png`) });
      await openBrush();
      assert.equal(await page.$$('.brush-target').then(x => x.length), 4);
      assert.equal(await page.$eval('[aria-label="选择目标评论 #5"]', e => e.disabled), true);
      assert.equal(await page.$eval('.brush-dialog-footer .primary', e => e.disabled), true);
      await page.click('[aria-label="选择目标评论 #2"]');
      await page.click('[aria-label="选择目标评论 #3"]');
      assert.equal(await page.$$('.brush-after').then(x => x.length), 2);
      const geometry = await page.$eval('.brush-dialog', el => { const r = el.getBoundingClientRect(), f = el.querySelector('footer').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, footerBottom: f.bottom, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
      assert(!geometry.overflow && geometry.left >= 0 && geometry.top >= 0 && geometry.right <= width + 1 && geometry.bottom <= height + 1 && geometry.footerBottom <= height + 1, JSON.stringify(geometry));
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-targets.png`) });
      // Cancellation and Escape never apply the live preview.
      await page.keyboard.press('Escape'); await page.waitForSelector('.brush-dialog', { hidden: true });
      assert.deepEqual(await styles(), before);
      await openBrush(); await page.click('[aria-label="选择目标评论 #2"]'); await page.click('[aria-label="选择目标评论 #3"]');
      await page.click('.brush-dialog-footer .primary'); await page.waitForSelector('.brush-dialog', { hidden: true });
      await page.waitForFunction(() => document.querySelector('#comment-2 pre')?.style.backgroundColor === 'rgb(227, 242, 253)');
      const applied = await styles();
      assert.deepEqual(applied[2], before[0]); assert.deepEqual(applied[3], before[0]); assert.deepEqual(applied[4], before[4]);
      assert.deepEqual(await page.$$eval('[data-comment-index] .plain-text-preview pre', els => els.map(el => el.textContent)), contents);
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-applied.png`) });
      await page.click('[aria-label="撤销格式刷"]');
      await page.waitForFunction(() => document.querySelector('#comment-2 pre')?.style.backgroundColor === 'rgb(255, 240, 220)');
      assert.deepEqual(await styles(), before);
      // The prototype is memory-only; a reload restores the original samples.
      await page.reload(); await page.waitForSelector('#comment-0');
      await page.click('#comment-0'); await page.waitForSelector('.brush-entry');
      await openBrush();
      await page.evaluate(() => [...document.querySelectorAll('.brush-target-heading button')].find(e => e.textContent === '全选').click());
      assert.equal(await page.$$eval('.brush-target input:checked', els => els.length), 3);
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
      report.push({ width, height, color, geometry, passed: true, checks: ['source-selection', 'target-filtering', 'multi-select', 'preview', 'cancel', 'apply', 'unchanged-text-order', 'unselected-unchanged', 'batch-undo', 'select-all', 'memory-only', 'no-page-errors'] });
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
