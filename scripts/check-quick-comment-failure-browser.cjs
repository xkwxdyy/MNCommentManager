const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const { setup } = require('./test-quick-comment');
const url = process.argv[2] || 'http://127.0.0.1:5176/quick-comment.html';
const output = path.resolve(process.argv[3] || 'dist/quick-input-review-browser');

async function connect(page, state, receive) {
  await page.exposeFunction('__quickNativeBridge', async message => {
    try {
      const custom = await receive?.(message);
      if (custom) return custom;
      const methods = { getQuickCommentState: 'getState', updateQuickCommentDraft: 'updateDraft', appendQuickComment: 'append', closeQuickComment: 'requestClose', setQuickCommentExit: 'setExit', presentQuickComment: 'present' };
      const payload = state.api[methods[message.command]](state.controller, message.payload);
      if (message.command === 'closeQuickComment') setTimeout(() => { while (state.timers.length) state.timers.shift()(); }, 100);
      return { payload };
    } catch (error) { return { error: { message: error.message } }; }
  });
  await page.addInitScript(() => {
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.tagName !== 'IFRAME' || !node.src.startsWith('mnaddon://bridge?payload=')) continue;
        const message = JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
        window.__quickNativeBridge(message).then(response => {
          if (!response.drop) window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({ requestId: message.requestId, payload: response.payload || null, error: response.error || null }));
        });
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('textarea').disabled);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.MN_CHROMIUM_EXECUTABLE || undefined, headless: true });
  const report = [];
  try {
    for (const markdown of [false, true]) for (const processOriginal of [false, true]) {
      const state = setup(), page = await browser.newPage({ viewport: { width: 375, height: 600 } });
      const requests = [], errors = []; page.on('pageerror', error => errors.push(error.message));
      await connect(page, state, message => {
        if (message.command !== 'appendQuickComment') return;
        requests.push(message.payload);
        if (requests.length === 1) {
          if (processOriginal) state.api.append(state.controller, message.payload);
          return { drop: true };
        }
      });
      await page.getByRole('textbox', { name: '评论内容' }).fill('固定正文\n第二行');
      if (markdown) await page.getByRole('switch', { name: 'Markdown 评论' }).click();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
      await page.getByRole('button', { name: '重试同次提交' }).waitFor({ timeout: 8000 });
      assert.equal(await page.getByRole('textbox', { name: '评论内容' }).inputValue(), '固定正文\n第二行');
      await page.getByRole('button', { name: '重试同次提交' }).click();
      await page.locator('.quick-closed').waitFor({ state: 'attached' });
      assert.deepEqual(requests[0], requests[1]); assert.equal(requests.length, 2);
      assert.equal(state.a.comments.length, 2); assert.equal(state.a.comments[1].text, '固定正文\n第二行'); assert.equal(state.a.comments[1].markdown === true, markdown); assert.equal(requests[0].markdown, markdown); assert.deepEqual(errors, []);
      report.push({ scenario: processOriginal ? 'saved-reply-lost-same-id-retry' : 'not-delivered-same-id-retry', passed: true, addedComments: 1, markdown });
      await page.close();
    }
    for (const markdown of [false, true]) {
      const state = setup(), page = await browser.newPage({ viewport: { width: 375, height: 600 } }); state.saveError(true);
      await connect(page, state);
      await page.getByRole('textbox', { name: '评论内容' }).fill('保存异常仍保留正文'); if (markdown) await page.getByRole('switch', { name: 'Markdown 评论' }).click(); await page.keyboard.press('Enter');
      await page.getByRole('button', { name: '核对保存' }).waitFor();
      await page.getByRole('button', { name: '重试同次提交' }).click(); await page.getByRole('button', { name: '核对保存' }).waitFor();
      assert.equal(state.a.comments.length, 2); assert.equal(state.api.getState(state.controller).draft, '保存异常仍保留正文');
      assert.equal(await page.getByRole('textbox', { name: '评论内容' }).inputValue(), '保存异常仍保留正文');
      await page.screenshot({ path: path.join(output, 'save-failure-retained.png') });
      state.saveError(false); await page.getByRole('button', { name: '核对保存' }).click();
      await page.locator('.quick-closed').waitFor({ state: 'attached' }); assert.equal(state.a.comments.length, 2); assert.equal(state.a.comments[1].markdown === true, markdown);
      report.push({ scenario: 'partial-write-save-failure-check-and-retry', passed: true, addedComments: 1, markdown }); await page.close();
    }
    {
      const state = setup(), page = await browser.newPage({ viewport: { width: 375, height: 600 } });
      const delayed = [];
      await connect(page, state, message => {
        if (message.command === 'updateQuickCommentDraft') { delayed.push(message.payload); return { drop: true }; }
      });
      await page.getByRole('textbox', { name: '评论内容' }).fill('旧正文');
      await page.getByRole('textbox', { name: '评论内容' }).fill('最后正文');
      await page.getByRole('switch', { name: 'Markdown 评论' }).click();
      const controller = state.controller;
      await page.getByRole('button', { name: '关闭输入并保留草稿' }).click();
      state.api.updateDraft(controller, delayed[2]); state.api.updateDraft(controller, delayed[1]); state.api.updateDraft(controller, delayed[0]);
      assert.equal(state.api.getState(controller).draft, '最后正文'); assert.equal(state.api.getState(controller).markdown, true);
      await page.waitForTimeout(150); state.controller = state.open();
      await page.goto(url); await page.waitForFunction(() => document.querySelector('textarea').value === '最后正文');
      assert.equal(state.a.comments.length, 1); assert.equal(await page.getByRole('switch', { name: 'Markdown 评论' }).getAttribute('aria-checked'), 'true');
      report.push({ scenario: 'close-snapshot-survives-delayed-draft-writes-and-reopen', passed: true, addedComments: 0 }); await page.close();
    }
    {
      const state = setup(), page = await browser.newPage({ viewport: { width: 375, height: 600 } });
      await connect(page, state);
      await page.getByRole('switch', { name: 'Markdown 评论' }).click();
      await page.getByRole('textbox', { name: '评论内容' }).fill('**记住类型**'); await page.keyboard.press('Enter');
      await page.locator('.quick-closed').waitFor({ state: 'attached' }); await page.waitForTimeout(150);
      state.controller = state.open('b'); await page.reload();
      await page.waitForFunction(() => !document.querySelector('textarea').disabled);
      assert.equal(await page.getByRole('switch', { name: 'Markdown 评论' }).getAttribute('aria-checked'), 'true');
      assert.equal(await page.getByRole('textbox', { name: '评论内容' }).inputValue(), '');
      await page.getByRole('switch', { name: 'Markdown 评论' }).click();
      await page.getByRole('textbox', { name: '评论内容' }).fill('记住纯文本'); await page.keyboard.press('Enter');
      await page.locator('.quick-closed').waitFor({ state: 'attached' }); await page.waitForTimeout(150);
      state.controller = state.open('a'); await page.reload();
      await page.waitForFunction(() => !document.querySelector('textarea').disabled);
      assert.equal(await page.getByRole('switch', { name: 'Markdown 评论' }).getAttribute('aria-checked'), 'false');
      assert.equal(state.a.comments[1].markdown, true); assert.equal(state.b.comments[1].markdown === true, false);
      assert.equal(state.a.comments.length, 2); assert.equal(state.b.comments.length, 2);
      report.push({ scenario: 'remember-mode-after-save-across-cards-and-webview-reload', passed: true, addedComments: 2 });
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'failure-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
