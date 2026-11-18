// Uses an isolated headless browser; never connects to MarginNote or the system clipboard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require(process.env.MN_PUPPETEER_MODULE || 'puppeteer');
const sampleFile = path.resolve(
  process.argv[2] || 'artifacts/rich-text-lifecycle-prototype/index.html',
);
const output = path.resolve(process.argv[3] || 'artifacts/rich-text-lifecycle-prototype/checks');
const target = (i) => `[aria-label="选择目标评论 #${i}"]`;
const copyRow = (i) => `[aria-label="复制评论 #${i} 的格式"]`;
const pasteRow = (i) => `[aria-label="粘贴格式到评论 #${i}"]`;
const editRow = (i) => `[aria-label="编辑富文本评论 #${i}"]`;
const undo = '[aria-label="撤销上次富文本修改"]';
const rows = (page) =>
  page.$$eval('[data-comment-index]', (els) =>
    els.map((el) => {
      const pre = el.querySelector('.plain-text-preview pre');
      return {
        index: el.dataset.commentIndex,
        type: el.querySelector('.type-pill').textContent,
        body: el.querySelector('.comment-body')?.textContent,
        foreground: pre?.style.color || '',
        background: pre?.style.backgroundColor || '',
        size: pre?.style.fontSize || '',
        markdown: el.querySelector('.markdown-content')?.innerHTML || '',
      };
    }),
  );
async function fill(page, selector, text) {
  await page.$eval(
    selector,
    (el, value) => {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    text,
  );
}
const closeDialog = (page) => page.waitForSelector('.rich-comment-dialog', { hidden: true });
async function switchCard(page, n) {
  await page.click(`.rich-demo-tabs button:nth-child(${n})`);
  await page.waitForFunction(
    (i) =>
      document
        .querySelector(`.rich-demo-tabs button:nth-child(${i})`)
        .getAttribute('aria-selected') === 'true',
    {},
    n,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('.rich-demo-panel .topbar-title')
      ?.textContent.includes(
        document.querySelector('.rich-demo-tabs button[aria-selected="true"]').textContent ===
          '命题卡'
          ? '有界算子'
          : document.querySelector('.rich-demo-tabs button[aria-selected="true"]').textContent ===
              '定义卡'
            ? '紧算子'
            : '空白卡片',
      ),
  );
  if (n !== 3) await page.waitForSelector(pasteRow(0));
  if (n === 1) await page.waitForSelector(editRow(0));
}
async function geometry(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.rich-comment-dialog');
    const r = el?.getBoundingClientRect(),
      f = el?.querySelector('footer').getBoundingClientRect();
    const b = el?.querySelector('.rich-comment-dialog-body');
    return {
      width: innerWidth,
      height: innerHeight,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      left: r?.left,
      right: r?.right,
      top: r?.top,
      bottom: r?.bottom,
      footerBottom: f?.bottom,
      bodyOverflowX: b ? b.scrollWidth > b.clientWidth + 1 : false,
    };
  });
}
function assertGeometry(g) {
  assert(
    !g.pageOverflow &&
      !g.bodyOverflowX &&
      g.left >= 0 &&
      g.top >= 0 &&
      g.right <= g.width + 1 &&
      g.bottom <= g.height + 1 &&
      g.footerBottom <= g.height + 1,
    JSON.stringify(g),
  );
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mncm-rich-browser-'));
  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.MN_CHROMIUM_EXECUTABLE ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile,
    args: ['--use-mock-keychain', '--password-store=basic'],
  });
  const report = [];
  try {
    for (const [width, height, color] of [
      [1280, 900, 'light'],
      [756, 620, 'light'],
      [390, 844, 'light'],
      [320, 640, 'light'],
      [600, 400, 'light'],
      [1280, 900, 'dark'],
    ]) {
      const page = await browser.newPage(),
        errors = [],
        failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('requestfailed', (request) =>
        failed.push({ url: request.url(), error: request.failure().errorText }),
      );
      await page.setViewport({ width, height });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: color }]);
      await page.goto(pathToFileURL(sampleFile).href);
      await page.waitForSelector(editRow(0));
      const originalProof = await rows(page);
      // The retained More menu closes before the prototype preview opens.
      await page.click('#comment-0 .selection-checkbox');
      await page.click('[aria-label="更多选区操作"]');
      await page.waitForSelector('.selection-actions-panel:not([hidden])');
      await page.evaluate(() =>
        [...document.querySelectorAll('.selection-actions-panel button')]
          .find((e) => e.textContent === '格式刷')
          .click(),
      );
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(await page.$eval('.selection-actions-panel', (e) => e.hidden), true);
      assert.equal(await page.$eval('#rich-comment-dialog-title', (e) => e.textContent), '格式刷');
      assert.equal(await page.$$('.brush-target').then((e) => e.length), 2);
      assert.equal(await page.$$('.rich-demo-paste').then((e) => e.length), 0);
      await page.keyboard.press('Escape');
      await closeDialog(page);
      await page.click('#comment-0 .selection-checkbox');
      assert.equal(await page.$$('.rich-format-clipboard.has-format').then((e) => e.length), 0);
      // Direct brush applies once without copying or changing the cross-card clipboard.
      await page.click('#comment-0-format-brush');
      await page.waitForSelector('.rich-comment-dialog');
      await page.click('[aria-label="选择目标评论 #2"]');
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-brush.png`) });
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.waitForFunction(
        () =>
          document.querySelector('#comment-2 pre')?.style.backgroundColor === 'rgb(227, 242, 253)',
      );
      assert.equal(await page.$$('.rich-format-clipboard.has-format').then((e) => e.length), 0);
      await page.click(undo);
      await page.waitForFunction(
        () =>
          document.querySelector('#comment-2 pre')?.style.backgroundColor === 'rgb(255, 240, 220)',
      );
      assert.deepEqual(await rows(page), originalProof);
      await page.click(copyRow(0));
      await page.waitForSelector(pasteRow(0));
      assert.equal(await page.$$('.rich-comment-dialog').then((e) => e.length), 0);
      const copiedStrip = await page.$eval('.rich-format-clipboard', (e) => e.textContent);
      await page.click('#comment-2-format-brush');
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(
        await page.$eval('.brush-source .rich-comment-sample', (e) => e.style.backgroundColor),
        'rgb(255, 240, 220)',
      );
      await page.click('[aria-label="选择目标评论 #0"]');
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.waitForFunction(
        () =>
          document.querySelector('#comment-0 pre')?.style.backgroundColor === 'rgb(255, 240, 220)',
      );
      assert.equal(
        await page.$eval(
          '.rich-format-clipboard .rich-clipboard-chip',
          (e) => e.style.backgroundColor,
        ),
        'rgb(227, 242, 253)',
      );
      assert.equal(await page.$eval('.rich-format-clipboard', (e) => e.textContent), copiedStrip);
      await page.click(undo);
      await page.waitForFunction(
        () =>
          document.querySelector('#comment-0 pre')?.style.backgroundColor === 'rgb(227, 242, 253)',
      );
      assert.deepEqual(await rows(page), originalProof);
      // Shared icons are present on all actions supplied by the approved pack.
      assert(await page.$('#comment-0-format-brush [data-action-icon="paintbrush"]'));
      assert(await page.$(`${editRow(0)} [data-action-icon="edit"]`));
      assert(await page.$('.rich-add-comment [data-action-icon="comment-add"]'));
      assert(await page.$(`${copyRow(0)} [data-rich-action="copy"]`));
      assert.equal(await page.$eval('#comment-0', (e) => e.getAttribute('aria-pressed')), 'false');
      assert.equal(await page.$eval(editRow(4), (e) => e.disabled), true);
      assert.equal(await page.$eval(pasteRow(5), (e) => e.disabled), true);
      // The captured format survives source changes and switching cards.
      await page.click('#comment-0 .comment-body', { clickCount: 2 });
      await page.waitForSelector('.rich-comment-dialog');
      await fill(page, '[aria-label="文字颜色"]', '#8A245C');
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.click(undo);
      await page.waitForFunction(
        () => document.querySelector('#comment-0 pre')?.style.color === 'rgb(23, 93, 98)',
      );
      assert.deepEqual(await rows(page), originalProof);
      await switchCard(page, 2);
      await page.waitForSelector(pasteRow(0));
      const originalDefinition = await rows(page);
      for (const i of [3, 4, 5, 6])
        assert.equal(await page.$eval(pasteRow(i), (e) => e.disabled), true);
      assert.match(await page.$eval(pasteRow(3), (e) => e.title), /图片/);
      assert.match(await page.$eval(pasteRow(4), (e) => e.title), /表格/);
      assert.match(await page.$eval(pasteRow(5), (e) => e.title), /链接/);
      // Batch conversion preview, select all eligibility, cancellation, and focus restoration.
      await page.click('.rich-format-clipboard .ghost');
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(
        await page.$eval('.rich-comment-dialog footer .primary', (e) => e.disabled),
        true,
      );
      await page.click('.brush-target-heading button');
      assert.equal(await page.$$eval('.brush-target input:checked', (e) => e.length), 3);
      await page.click('.brush-target-heading button');
      await page.click(target(0));
      await page.click(target(1));
      assert.equal(
        await page.$$eval('.brush-target-preview > div:nth-child(2)', (e) => e.length),
        2,
      );
      const pasteGeometry = await geometry(page);
      assertGeometry(pasteGeometry);
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-paste.png`) });
      // Last -> first and first -> last keyboard focus loop.
      await page.focus('.rich-comment-dialog footer .primary');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.ariaLabel), '关闭对话框');
      await page.keyboard.down('Shift');
      await page.keyboard.press('Tab');
      await page.keyboard.up('Shift');
      assert.equal(
        await page.$eval(
          '.rich-comment-dialog footer .primary',
          (e) => e === document.activeElement,
        ),
        true,
      );
      await page.keyboard.press('Escape');
      await closeDialog(page);
      assert.equal(
        await page.$eval('.rich-format-clipboard .ghost', (e) => e === document.activeElement),
        true,
      );
      assert.deepEqual(await rows(page), originalDefinition);
      await page.click(pasteRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(await page.$eval(target(0), (e) => e.checked), true);
      await page.click(target(1));
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.waitForFunction(
        () => document.querySelector('#comment-0 .type-pill')?.textContent === '富文本',
      );
      const applied = await rows(page);
      assert.equal(applied[0].body, '定义\n\n算子 T 将有界集映为相对紧集。');
      assert.equal(applied[1].body, originalDefinition[1].body);
      assert.equal(applied[0].background, 'rgb(227, 242, 253)');
      assert.deepEqual(applied.slice(2), originalDefinition.slice(2));
      assert.deepEqual(
        applied.map((c) => c.index),
        originalDefinition.map((c) => c.index),
      );
      await switchCard(page, 1);
      await switchCard(page, 2);
      await page.click(undo);
      await page.waitForFunction(
        () => document.querySelector('#comment-0 .type-pill')?.textContent === 'Markdown',
      );
      assert.deepEqual(await rows(page), originalDefinition);
      // Foreground/background, text and weight edit: draft changes are isolated until save.
      await switchCard(page, 1);
      await page.waitForSelector(editRow(0));
      await page.click(editRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      await fill(page, '[aria-label="评论正文"]', '证明修改后\n第二行完整保留。');
      await fill(page, '[aria-label="文字颜色"]', '#315D92');
      await fill(page, '[aria-label="背景颜色"]', '#D7EBFF');
      await fill(page, '[aria-label="字号"]', '21');
      await page.click('[aria-label="字体"]');
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="option"]')]
          .find((e) => e.textContent.includes('半粗体'))
          .click(),
      );
      assert.equal(
        await page.$eval('.rich-editor-preview pre', (e) => e.style.backgroundColor),
        'rgb(215, 235, 255)',
      );
      assert.deepEqual(await rows(page), originalProof);
      const editorGeometry = await geometry(page);
      assertGeometry(editorGeometry);
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-editor.png`) });
      await page.click('.rich-comment-dialog footer .secondary');
      await page.waitForSelector('.rich-editor-discard');
      assert.deepEqual(await rows(page), originalProof);
      await page.click('.rich-editor-discard');
      await closeDialog(page);
      assert.deepEqual(await rows(page), originalProof);
      assert.equal(await page.$eval(editRow(0), (e) => e === document.activeElement), true);
      await page.click(editRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      await fill(page, '[aria-label="评论正文"]', '证明修改后\n第二行完整保留。');
      await fill(page, '[aria-label="文字颜色"]', '#315D92');
      await fill(page, '[aria-label="背景颜色"]', '#D7EBFF');
      await fill(page, '[aria-label="字号"]', '21');
      await page.click('[aria-label="字体"]');
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="option"]')]
          .find((e) => e.textContent.includes('半粗体'))
          .click(),
      );
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.waitForFunction(() =>
        document.querySelector('#comment-0 pre')?.textContent.includes('修改后'),
      );
      const edited = await rows(page);
      assert.equal(edited[0].foreground, 'rgb(49, 93, 146)');
      assert.equal(edited[0].background, 'rgb(215, 235, 255)');
      assert.deepEqual(edited.slice(1), originalProof.slice(1));
      await page.click(editRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(await page.$eval('[aria-label="文字颜色"]', (e) => e.value), '#315D92');
      assert.equal(await page.$eval('[aria-label="背景颜色"]', (e) => e.value), '#D7EBFF');
      // Invalid colors fail without partial writes; default/transparent resets preview correctly.
      await fill(page, '[aria-label="文字颜色"]', '#XYZ');
      await page.click('.rich-comment-dialog footer .primary');
      await page.waitForSelector('[role="alert"]');
      assert.match(await page.$eval('[role="alert"]', (e) => e.textContent), /#RRGGBB/);
      assert.deepEqual(await rows(page), edited);
      await page.click('[aria-label="使用默认文字颜色"]');
      await page.click('[aria-label="移除背景色"]');
      assert.equal(
        await page.$eval('.rich-editor-preview pre', (e) => e.style.backgroundColor),
        'transparent',
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector('.rich-editor-discard');
      await page.click('.rich-editor-discard');
      await closeDialog(page);
      await page.click(undo);
      await page.waitForFunction(
        () => document.querySelector('#comment-0 pre')?.textContent === '证明',
      );
      assert.deepEqual(await rows(page), originalProof);
      // Creation starts with the captured source style, not the later edited source.
      await switchCard(page, 3);
      await page.click('.rich-add-comment');
      await page.waitForSelector('.rich-comment-dialog');
      assert.equal(await page.$eval('[aria-label="文字颜色"]', (e) => e.value), '#175D62');
      assert.equal(await page.$eval('[aria-label="背景颜色"]', (e) => e.value), '#E3F2FD');
      assert.equal(
        await page.$eval('.rich-comment-dialog footer .primary', (e) => e.disabled),
        true,
      );
      await fill(page, '[aria-label="评论正文"]', '空白卡片新增富文本\n换行与标点保持原样。');
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      await page.waitForSelector(editRow(0));
      assert.equal((await rows(page)).length, 1);
      await page.click(editRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      assert.match(await page.$eval('[aria-label="评论正文"]', (e) => e.value), /空白卡片新增/);
      await page.keyboard.press('Escape');
      await closeDialog(page);
      await switchCard(page, 1);
      await switchCard(page, 3);
      await page.click(undo);
      await page.waitForSelector('#comment-0', { hidden: true });
      // No-op save doesn't create an undo entry; reload resets the memory-only clipboard.
      await switchCard(page, 1);
      await page.click(editRow(0));
      await page.waitForSelector('.rich-comment-dialog');
      await page.click('.rich-comment-dialog footer .primary');
      await closeDialog(page);
      assert.equal(await page.$(undo), null);
      await page.screenshot({ path: path.join(output, `${width}x${height}-${color}-manager.png`) });
      const managerGeometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clipped: [
          ...document.querySelectorAll('.comment-is-module-title-anchor.comment-kind-html'),
        ].map((el) => {
          const body = el.querySelector('.comment-body'),
            pre = el.querySelector('pre');
          return {
            index: el.dataset.commentIndex,
            clipped:
              pre &&
              pre.getBoundingClientRect().height > body.getBoundingClientRect().height + 1 &&
              getComputedStyle(body).overflow === 'hidden',
          };
        }),
      }));
      assert(
        !managerGeometry.overflow && !managerGeometry.clipped.some((c) => c.clipped),
        JSON.stringify(managerGeometry),
      );
      await page.click('[aria-label="清除已复制格式"]');
      await page.waitForSelector('.rich-demo-paste', { hidden: true });
      assert.equal(await page.$(undo), null);
      await page.reload();
      await page.waitForSelector(editRow(0));
      assert.equal(await page.$$('.rich-demo-paste').then((x) => x.length), 0);
      assert.deepEqual(await rows(page), originalProof);
      assert.deepEqual(errors, []);
      assert.deepEqual(failed, []);
      report.push({
        width,
        height,
        color,
        pasteGeometry,
        editorGeometry,
        managerGeometry,
        passed: true,
        checks: [
          'copy-without-selection',
          'one-shot-brush-independent-from-copy',
          'brush-html-only-source-excluded',
          'shared-icon-system',
          'double-click-edit',
          'clear-format-clipboard',
          'cross-card-style-clipboard',
          'batch-markdown-and-text-conversion',
          'protected-complex-content',
          'unchanged-body-order-and-unselected',
          'full-batch-undo-after-card-switch',
          'edit-colors-text-size-weight',
          'cancel-and-live-preview',
          'invalid-color-no-write',
          'default-and-transparent',
          'create-on-empty-card',
          'undo-create',
          'no-op-no-history',
          'focus-trap-return-escape',
          'memory-only-reload',
          'no-page-errors-or-failed-requests',
        ],
      });
      await page.close();
      console.log(`Passed ${width}×${height} ${color}`);
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
