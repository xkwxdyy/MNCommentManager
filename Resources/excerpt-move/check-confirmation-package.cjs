const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'confirmation-package-report.json'), 'utf8'));
const bundle = require('node:child_process').execFileSync('unzip', ['-p', report.package, 'web-dist/assets/app.js'], { maxBuffer: 5 * 1024 * 1024 }).toString();
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
async function waitFor(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await pause(); }
  throw new Error('Timed out waiting for packaged UI');
}
(async () => {
  const reports = [];
  for (const type of ['text', 'image']) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, errors = [], calls = [];
    w.addEventListener('error', event => errors.push(event.message));
    let snapshot = { noteId: type, noteTitle: '打包确认测试', excerpt: { present: true, type, text: '原生摘录', conversion: { eligible: true } }, comments: [{ index: 0, text: '原评论', type: 'textComment', capabilities: { canMove: true } }] };
    const append = w.document.body.appendChild.bind(w.document.body);
    w.document.body.appendChild = node => {
      if (node.tagName !== 'IFRAME' || !node.src.startsWith('mnaddon://bridge?payload=')) return append(node);
      const request = JSON.parse(decodeURIComponent(node.src.split('payload=')[1])); calls.push(request);
      let payload = {};
      if (request.command === 'getCurrentNoteComments') payload = snapshot;
      if (request.command === 'getActionButtonSettings') payload = { showExcerptMoveNotice: true };
      if (request.command === 'moveContentSelection') {
        snapshot = { ...snapshot, noteId: `${type}-converted`, excerpt: { present: false }, comments: [...snapshot.comments, { index: 1, type: 'textComment', text: '原生摘录', capabilities: { canMove: true } }] };
        payload = { snapshot, noteId: snapshot.noteId, converted: true, actionCompleted: true, selectedIndices: [1] };
      }
      w.queueMicrotask(() => w.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({ requestId: request.requestId, payload })));
      return node;
    };
    w.eval(bundle);
    const arrow = () => w.document.querySelector('[aria-label="下移摘录"]');
    const dialog = () => w.document.querySelector('[role="dialog"]');
    const button = text => [...w.document.querySelectorAll('button')].find(node => node.textContent === text);
    const moves = () => calls.filter(call => call.command === 'moveContentSelection');
    await waitFor(arrow); arrow().click(); await waitFor(dialog);
    assert.equal(moves().length, 0); assert.match(dialog().textContent, /移动摘录前需转换卡片/);
    button('取消').click(); await waitFor(() => !dialog()); assert.equal(moves().length, 0);
    arrow().click(); await waitFor(dialog); button('转换并移动').click();
    await waitFor(() => moves().length === 1 && !w.document.querySelector('#native-excerpt'));
    assert.equal(dialog(), null); assert.equal(moves()[0].payload.noteId, type);
    assert.equal(moves()[0].payload.selection.excerptSelected, true); assert.deepEqual(errors, []);
    reports.push({ type, cancelledWithoutMutation: true, confirmedMoveRequests: moves().length, successNoticeAbsent: true, errors });
    w.close();
  }
  fs.writeFileSync(path.join(__dirname, 'confirmation-packed-ui-report.json'), JSON.stringify(reports, null, 2) + '\n');
  console.log(JSON.stringify(reports));
})().catch(error => { console.error(error); process.exitCode = 1; });
