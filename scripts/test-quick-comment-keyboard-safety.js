const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('./test-quick-comment-keyboard');
const s = fixture();
let saved = 0, retained = 0, replays = 0, rejected = 0;
function decorate(controller) {
  s.controller = controller;
  controller.webView.isFirstResponder = () => true;
  controller.webView.evaluateJavaScript = script => s.scripts.push(script);
  controller.view.removeFromSuperview = () => { s.studyView.subviews = s.studyView.subviews.filter(view => view !== controller.view); controller.view.superview = null; };
  return controller;
}
for (let cycle = 0; cycle < 120; cycle++) {
  let state = s.api.getState(s.controller);
  if (state.submission?.status === 'saved') { s.api.requestClose(s.controller, { sessionId: state.sessionId }); decorate(s.open()); state = s.api.getState(s.controller); }
  const old = s.controller, version = state.draftRevision, text = `连续打开关闭 ${cycle}\n保留中文组词`, markdown = cycle % 2 === 1;
  const earlier = { sessionId: state.sessionId, text: text + '旧', markdown, draftRevision: version + 1 };
  const final = { sessionId: state.sessionId, text, markdown, draftRevision: version + 2 };
  s.api.updateDraft(old, earlier); s.api.updateDraft(old, final); s.api.updateDraft(old, earlier);
  assert.equal(s.api.getState(old).draft, text);
  s.notify('WillShow', s.shown);
  let attempt;
  if (cycle % 3 === 2) {
    attempt = { ...final, submissionId: `intent-${cycle}` };
    s.saveError(cycle % 6 === 5);
    s.api.append(old, attempt); saved += 1;
    s.api.append(old, attempt); replays += 1;
    assert.equal(s.a.comments.length, 1 + saved);
  }
  s.notify('WillHide', s.hidden); const event = s.lastEvent();
  assert.equal(event.type, 'hide'); const count = s.scripts.length;
  s.notify('DidHide', s.hidden); assert.equal(s.scripts.length, count);
  const closing = { ...final, reason: 'keyboard', eventId: event.eventId };
  s.api.requestClose(old, closing); s.api.requestClose(old, closing);
  s.saveError(false); const next = decorate(s.open()); assert.notEqual(next, old);
  const restored = s.api.getState(next);
  if (attempt) {
    assert.equal(restored.draft, '');
    if (restored.sessionId === attempt.sessionId) s.api.append(next, attempt);
    else assert.throws(() => s.api.append(next, attempt), /失效/);
    replays += 1;
  } else { assert.equal(restored.draft, text); assert.equal(restored.markdown, markdown); retained += 1; }
  assert.throws(() => s.api.updateDraft(old, earlier), /失效/); rejected += 1;
  assert.throws(() => s.api.requestClose(next, closing), /失效/); rejected += 1;
  while (s.timers.length) s.timers.shift()();
  assert.equal(s.addon.quickCommentController, next); assert.equal(s.a.comments.length, 1 + saved);
}
assert(!s.events.includes('focus-host'));
const report = { cycles: 120, confirmedComments: saved, retainedDrafts: retained, replayedSubmissions: replays, rejectedLatePackets: rejected, addedComments: s.a.comments.length - 1, passed: true };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
