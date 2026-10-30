const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:5174/quick-comment.html?demo=1';
const output = path.resolve(process.argv[3] || 'dist/quick-input-browser');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MN_CHROMIUM_EXECUTABLE || undefined });
  const report = [];
  try {
    for (const [width, height, colorScheme] of [[1100,700,'light'], [375,812,'light'], [320,568,'light'], [768,1024,'light'], [1024,768,'dark'], [560,300,'light'], [375,240,'dark']]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme, hasTouch: width < 800 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url); await page.getByRole('textbox', { name: '评论内容' }).waitFor();
      await page.waitForFunction(() => document.querySelector('textarea') === document.activeElement);
      await page.locator('.quick-card').evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      const layout = await page.evaluate(() => {
        const rect = document.querySelector('.quick-card').getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          backdrop: getComputedStyle(document.querySelector('.quick-backdrop')).backgroundColor,
          surface: getComputedStyle(document.querySelector('.quick-card')).backgroundColor,
          ink: getComputedStyle(document.querySelector('textarea')).color,
          overflow: document.documentElement.scrollWidth > innerWidth,
          controls: [...document.querySelectorAll('.quick-card button')].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
      });
      assert(!layout.overflow); assert(layout.left >= 0 && layout.top >= 0 && layout.right <= width && layout.bottom <= height);
      assert.equal(layout.backdrop, 'rgba(0, 0, 0, 0)');
      assert.equal(layout.surface, colorScheme === 'dark' ? 'rgb(37, 43, 53)' : 'rgb(252, 252, 253)');
      assert.equal(layout.ink, colorScheme === 'dark' ? 'rgb(237, 240, 245)' : 'rgb(32, 38, 50)');
      assert(layout.controls.every(rect => rect.width >= 43.99 && rect.height >= 43.99), JSON.stringify({ width, height, layout }));
      await page.getByRole('textbox', { name: '评论内容' }).fill('第一行');
      await page.getByRole('button', { name: '插入换行' }).click();
      await page.getByRole('textbox', { name: '评论内容' }).press('End');
      await page.getByRole('textbox', { name: '评论内容' }).type('第二行');
      assert.equal(await page.getByRole('textbox', { name: '评论内容' }).inputValue(), '第一行\n第二行');
      if (width === 1100 || width === 375 && height === 812 || colorScheme === 'dark' && height === 768) await page.screenshot({ path: path.join(output, `${width}x${height}-${colorScheme}.png`) });
      await page.getByRole('textbox', { name: '评论内容' }).press('Escape');
      await page.waitForSelector('.quick-closed', { state: 'attached' });
      await page.locator('#quick-demo-open').click();
      await page.waitForFunction(() => document.querySelector('textarea').value === '第一行\n第二行');
      await page.getByRole('textbox', { name: '评论内容' }).press('Enter');
      await page.waitForSelector('.quick-success');
      const directed = await page.locator('.quick-fly').count();
      await page.waitForSelector('.quick-closed', { state: 'attached' });
      assert.equal(await page.locator('#quick-demo-comments p').count(), 1);
      assert.equal(await page.locator('#quick-demo-comments').textContent(), '第一行\n第二行');
      assert.deepEqual(errors, []);
      report.push({ width, height, colorScheme, layout, directed: !!directed, errors, passed: true });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 375, height: 600 }, reducedMotion: 'reduce' });
    await page.goto(url); await page.getByRole('textbox', { name: '评论内容' }).fill('减少动态效果');
    await page.getByRole('textbox', { name: '评论内容' }).press('Enter'); await page.waitForSelector('.quick-closed', { state: 'attached' });
    assert.equal(await page.locator('#quick-demo-comments p').count(), 1);
    report.push({ reducedMotion: true, passed: true }); await page.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
