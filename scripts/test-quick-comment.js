const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(preferences = new Map(), nativePropertyBridge = false) {
  const timers = [], events = [], notes = new Map();
  let saveError = false, appendError = false, mismatch = false, preferenceError = false;
  const db = { savedb() { events.push('save'); if (saveError) throw new Error('save failed'); } };
  function note(id) {
    const raw = { noteId: id, notebookId: 'book', noteTitle: id, comments: [{ type: 'TextNote', text: 'original' }],
      appendMarkdownComment(text) { this.appendTextComment(text); this.comments[this.comments.length - 1].markdown = true; events.push(`markdown:${id}`); },
      appendTextComment(text) { if (appendError) throw new Error('append failed'); this.comments.push({ type: 'TextNote', text: mismatch ? 'wrong' : text }); events.push(`append:${id}`); } };
    notes.set(id, { noteId: id, notebookId: 'book', noteTitle: id, note: raw, refresh() { events.push('refresh'); } });
    return raw;
  }
  const a = note('a'), b = note('b');
  const studyView = { bounds: { x: 0, y: 0, width: 900, height: 600 }, addSubview(view) { view.superview = this; }, bringSubviewToFront() {}, becomeFirstResponder() { events.push('focus-host'); } };
  const nodes = [{ note: a, frame: { x: 600, y: 80, width: 200, height: 160 } }];
  const study = { view: studyView, notebookController: { view: { hidden: false }, mindmapView: { mindmapNodes: nodes, convertRectToView(rect) { return rect; } } } };
  const bindings = {}, nativeObjectWrites = [];
  function bridgeObject(value) {
    if (!value || typeof value !== 'object') return value === true ? 1 : value === false ? 0 : value;
    return new Proxy(value, { get(target, key) { return bridgeObject(target[key]); } });
  }
  const context = vm.createContext({ console: { log() {} }, Database: { sharedInstance: () => db },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: key => preferences.get(key), setBoolForKey(value, key) { if (preferenceError) throw new Error('preference write failed'); preferences.set(key, value); } }) },
    Application: { sharedInstance: () => ({ studyController: () => study }) },
    MNUtil: { showHUD(message) { events.push(message); }, refreshAfterDBChanged() { events.push('db-refresh'); } },
    NSTimer: { scheduledTimerWithTimeInterval(_duration, _repeat, callback) { timers.push(callback); } },
    UIView: { animateWithDurationDelayOptionsAnimationsCompletion(duration, _delay, _options, animations) { events.push(`native-fade:${duration}`); animations(); } },
    JSB: { defineClass(_name, members) { Object.assign(bindings, members); return { new() {
      const view = { alpha: 1, layer: { removeAllAnimations() {} }, bounds: { x: 0, y: 0, width: 900, height: 600 }, convertRectFromView(rect) { return rect; }, endEditing() {}, removeFromSuperview() { this.superview = null; } };
      const controller = { view, webView: { stopLoading() {}, evaluateJavaScript() { events.push('focus-input'); } } };
      return nativePropertyBridge ? new Proxy(controller, {
        get(target, key) { return ['quickSession', 'quickCommentSessions'].includes(key) ? bridgeObject(target[key]) : target[key]; },
        set(target, key, value) { if (value && typeof value === 'object' && ['quickSession', 'quickCommentSessions'].includes(key)) nativeObjectWrites.push(String(key)); target[key] = value; return true; }
      }) : controller;
    } }; } },
    __MN_COMMENT_DATA__: { getWrappedNoteById(id) { return notes.get(id); } },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(_name, _opts, callback) { events.push('undo-start'); const result = callback(); events.push('undo-end'); return result; } },
    __MN_DYNAMIC_COMMENT_ACTIONS__: { hideButton(addon) { addon.dynamicCommentContext = null; } },
  });
  for (const file of ['CommentActionSettings', 'CommentMutations', 'PanelContentBounds', 'QuickCommentController']) vm.runInContext(fs.readFileSync(`${process.env.MNCM_RUNTIME_DIR || 'src'}/${file}.js`, 'utf8'), context);
  const api = context.__MN_QUICK_COMMENT_MNCommentManagerAddon;
  const addon = { mainPath: '/addon', window: {} };
  const open = (id = 'a') => { addon.dynamicCommentContext = { noteId: id, anchorRect: { x: 20, y: 20, width: 120, height: 60 } }; api.open(addon, addon.dynamicCommentContext); return addon.quickCommentController; };
  const controller = open();
  const payload = { sessionId: api.getState(controller).sessionId, submissionId: 'submit-1', draftRevision: 1, text: '  first\nsecond  ' };
  return { api, addon, controller, payload, a, b, notes, studyView, nodes, timers, events, open, db, context, bindings, preferences, nativeObjectWrites,
    preferenceError(value) { preferenceError = value; },
    saveError(value) { saveError = value; }, appendError(value) { appendError = value; }, mismatch(value) { mismatch = value; } };
}

if (require.main === module) {
{
  const s = setup();
  assert.equal(s.addon.dynamicCommentContext, null);
  assert.equal(s.api.getState(s.controller).draft, '', 'new input must not load existing comments');
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'draft', draftRevision: 1 });
  s.payload.draftRevision = 2;
  assert.equal(s.api.getState(s.controller).draft, 'draft');
  const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.status, 'saved'); assert.equal(result.submission.receipt.persisted, true);
  assert.equal(s.a.comments[1].text, s.payload.text); assert.equal(s.b.comments.length, 1);
  assert.equal(result.targetRect.x, 600); assert.equal(result.draft, '');
  s.api.append(s.controller, s.payload); assert.equal(s.a.comments.length, 2);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, submissionId: 'submit-2' }), /已有提交/); assert.equal(s.a.comments.length, 2);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, text: 'different' }), /标识不能/);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, sessionId: 'stale' }), /失效/);
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId });
  assert.throws(() => s.api.append(s.controller, s.payload), /正在关闭/);
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId });
  assert.equal(s.timers.length, 1, 'closing twice must only schedule one removal');
  assert.equal(s.addon.quickCommentController, s.controller, 'bridge response must precede removal');
  s.timers.shift()(); assert.equal(s.addon.quickCommentController, null);
  s.timers.shift()(); assert(s.events.includes('focus-host'));
  assert(!s.events.includes('评论已添加'), 'successful delivery must not show a HUD');
  assert.notEqual(s.api.getState(s.open()).sessionId, s.payload.sessionId);
}
{
  const s = setup(); delete s.db.savedb;
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'failed'); assert.equal(s.a.comments.length, 1);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, text: ' \n ' }), /为空/);
}
{
  const s = setup(); s.saveError(true);
  const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.status, 'uncertain'); assert.equal(result.draft, s.payload.text); assert.equal(s.a.comments.length, 2);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, submissionId: 'retry' }), /已有提交/); assert.equal(s.a.comments.length, 2);
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId }); s.timers.shift()();
  const controller = s.open(); assert.equal(s.api.getState(controller).sessionId, s.payload.sessionId);
  s.saveError(false);
  assert.equal(s.api.getState(controller).submission.status, 'saved'); assert.equal(s.a.comments.length, 2);
  assert(s.events.includes('db-refresh'), 'recovering an uncertain save must refresh the visible notebook');
}
{
  const s = setup(); s.mismatch(true);
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'uncertain');
  assert.throws(() => s.api.append(s.controller, { ...s.payload, submissionId: 'retry' }), /已有提交/); assert.equal(s.a.comments.length, 2);
}
{
  const s = setup(); s.appendError(true);
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'failed');
  s.appendError(false);
  assert.equal(s.api.append(s.controller, { ...s.payload, submissionId: 'retry' }).submission.status, 'saved');
  assert.equal(s.a.comments.length, 2);
}
{
  const s = setup(); s.notes.delete('a');
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'failed'); assert.equal(s.a.comments.length, 1);
}
{
  const s = setup();
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId, text: 'retained', draftRevision: 1 }); s.timers.shift()();
  assert.equal(s.api.getState(s.open()).draft, 'retained');
  s.nodes.length = 0; s.studyView.bounds.width = 700;
  assert.equal(s.api.getState(s.addon.quickCommentController).targetRect, null);
  s.api.dispose(s.addon); assert.equal(s.addon.quickCommentController, null);
}
{
  const s = setup();
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'new draft', draftRevision: 2 });
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'stale draft', draftRevision: 1 });
  assert.equal(s.api.getState(s.controller).draft, 'new draft', 'delayed draft writes must not replace newer text');
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId, text: 'final draft', draftRevision: 3 });
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'late old text', draftRevision: 2 });
  s.timers.shift()();
  assert.equal(s.api.getState(s.open()).draft, 'final draft', 'close snapshot must survive delayed writes');
}
{
  const s = setup(); s.appendError(true);
  s.api.append(s.controller, s.payload);
  s.api.append(s.controller, { ...s.payload, submissionId: 'second-failure' });
  s.appendError(false);
  const replay = s.api.append(s.controller, s.payload);
  assert.equal(replay.submission.status, 'failed', 'replaying an old failed request must return its original record');
  assert.equal(s.a.comments.length, 1, 'an old request must never become a new append');
}
{
  const s = setup();
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'last draft', draftRevision: 4 });
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId, text: 'old close text', draftRevision: 3 });
  s.timers.shift()(); assert.equal(s.api.getState(s.open()).draft, 'last draft');
}
{
  const s = setup();
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'retained on failed hydration', draftRevision: 1 });
  s.api.requestClose(s.controller, {}); s.timers.shift()();
  assert.equal(s.api.getState(s.open()).draft, 'retained on failed hydration');
  assert.throws(() => s.api.updateDraft(s.addon.quickCommentController, { text: '' , draftRevision: 2 }), /参数/);
}
{
  const s = setup(); s.saveError(true);
  s.api.append(s.controller, s.payload);
  assert.equal(s.api.getState(s.controller, { submissionId: 'not-received' }).submission, null);
  assert.equal(s.api.getState(s.controller).draft, s.payload.text);
  s.saveError(false);
  const saved = s.api.append(s.controller, s.payload);
  assert.equal(saved.submission.text, s.payload.text); assert.equal(s.a.comments.length, 2);
}

{
  const s = setup(); s.payload.markdown = true;
  const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.status, 'saved'); assert.equal(result.submission.markdown, true);
  assert.equal(result.submission.receipt.markdown, true); assert.equal(s.a.comments[1].markdown, true);
  assert.equal(s.a.comments[1].text, s.payload.text);
  s.api.append(s.controller, s.payload); assert.equal(s.a.comments.length, 2);
  assert.throws(() => s.api.append(s.controller, { ...s.payload, markdown: false }), /评论类型/);
}
{
  const s = setup(); s.payload.markdown = false;
  const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.receipt.markdown, false); assert(!s.a.comments[1].markdown);
  assert(!s.events.some(e => e.startsWith('markdown:')));
}
{
  const s = setup();
  const draft = { sessionId: s.payload.sessionId, text: '**原正文**', markdown: true, draftRevision: 3 };
  s.api.updateDraft(s.controller, draft);
  s.api.updateDraft(s.controller, { ...draft, markdown: false, draftRevision: 2 });
  assert.equal(s.api.getState(s.controller).markdown, true);
  assert.throws(() => s.api.updateDraft(s.controller, { ...draft, markdown: false }), /版本冲突/);
  s.api.requestClose(s.controller, draft); s.timers.shift()();
  const reopened = s.api.getState(s.open()); assert.equal(reopened.markdown, true); assert.equal(reopened.draft, draft.text);
}
{
  const s = setup(); delete s.a.appendMarkdownComment; s.payload.markdown = true;
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'failed');
  assert.equal(s.a.comments.length, 1); assert.equal(s.api.getState(s.controller).draft, s.payload.text);
  const result = s.api.append(s.controller, { ...s.payload, markdown: false, submissionId: 'explicit-text', draftRevision: 2 });
  assert.equal(result.submission.status, 'saved'); assert(!s.a.comments[1].markdown);
}
{
  const s = setup(); s.a.appendMarkdownComment = s.a.appendTextComment; s.payload.markdown = true;
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'uncertain');
  s.api.append(s.controller, s.payload); assert.equal(s.a.comments.length, 2, 'type readback failure must never append again');
  assert.equal(s.api.getState(s.controller).draft, s.payload.text);
}
{
  const s = setup(); s.saveError(true); s.payload.markdown = true;
  assert.equal(s.api.append(s.controller, s.payload).submission.status, 'uncertain');
  assert.throws(() => s.api.append(s.controller, { ...s.payload, markdown: false }), /评论类型/);
  s.api.updateDraft(s.controller, { ...s.payload, markdown: false, draftRevision: 2 });
  assert.equal(s.api.getState(s.controller).markdown, true);
  s.saveError(false); const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.status, 'saved'); assert.equal(result.submission.receipt.markdown, true); assert.equal(s.a.comments.length, 2);
}
{
  const s = setup();
  assert.throws(() => s.api.append(s.controller, { ...s.payload, markdown: 'true' }), /参数/);
  assert.throws(() => s.api.updateDraft(s.controller, { ...s.payload, markdown: 1 }), /参数/);
  assert.equal(s.a.comments.length, 1);
}

const closeInput = s => { s.api.requestClose(s.addon.quickCommentController, { sessionId: s.api.getState(s.addon.quickCommentController).sessionId }); while (s.timers.length) s.timers.shift()(); };
{
  const s = setup(); s.payload.markdown = true;
  s.api.append(s.controller, s.payload); closeInput(s);
  assert.equal(s.api.getState(s.open()).markdown, true, 'successful submission must retain the last choice for the next input');
  assert.equal(s.api.getState(s.addon.quickCommentController).draft, '', 'saved content must not become the next draft');
  closeInput(s);
  assert.equal(s.api.getState(s.open('b')).markdown, true, 'the preference must apply across cards');
  const reloaded = setup(s.preferences);
  assert.equal(reloaded.api.getState(reloaded.controller).markdown, true, 'Native preferences must survive a new plugin instance');
  reloaded.api.updateDraft(reloaded.controller, { sessionId: reloaded.payload.sessionId, text: '', markdown: false, draftRevision: 1 });
  closeInput(reloaded); assert.equal(reloaded.api.getState(reloaded.open('b')).markdown, false);
  const latest = setup(s.preferences); assert.equal(latest.api.getState(latest.controller).markdown, false);
}
{
  const s = setup();
  s.api.updateDraft(s.controller, { sessionId: s.payload.sessionId, text: 'old text draft', markdown: false, draftRevision: 1 }); closeInput(s);
  const b = s.open('b');
  s.api.updateDraft(b, { sessionId: s.api.getState(b).sessionId, text: '', markdown: true, draftRevision: 1 }); closeInput(s);
  const reopened = s.api.getState(s.open('a'));
  assert.equal(reopened.draft, 'old text draft'); assert.equal(reopened.markdown, true, 'editable old drafts must follow the most recent choice');
  assert.equal(reopened.draftRevision, 2, 'mode adoption must invalidate old draft snapshots');
}
{
  const s = setup(); s.saveError(true); s.payload.markdown = true;
  s.api.append(s.controller, s.payload); closeInput(s);
  s.context.__MN_COMMENT_ACTION_SETTINGS__.setQuickCommentMarkdown(false);
  const reopened = s.api.getState(s.open());
  assert.equal(reopened.markdown, true); assert.equal(reopened.submission.markdown, true, 'an unresolved submission must retain its original type');
  assert.equal(s.context.__MN_COMMENT_ACTION_SETTINGS__.getQuickCommentMarkdown(), false);
}
{
  const s = setup(); s.preferenceError(true);
  const draft = { sessionId: s.payload.sessionId, text: 'preserved on preference failure', markdown: true, draftRevision: 1 };
  assert.throws(() => s.api.updateDraft(s.controller, draft), /偏好未保存/);
  assert.equal(s.api.getState(s.controller).draft, draft.text); assert.equal(s.api.getState(s.controller).markdown, true);
  assert(s.context.__MN_COMMENT_ACTION_SETTINGS__.getQuickCommentMarkdown() === false);
  s.preferenceError(false); s.api.requestClose(s.controller, draft); while (s.timers.length) s.timers.shift()();
  assert.equal(setup(s.preferences).context.__MN_COMMENT_ACTION_SETTINGS__.getQuickCommentMarkdown(), true, 'closing must retry an unconfirmed preference write');
}

{
  const s = setup(new Map(), true); s.payload.markdown = true;
  const result = s.api.append(s.controller, s.payload);
  assert.equal(result.submission.status, 'saved');
  assert.strictEqual(result.submission.markdown, true); assert.strictEqual(result.submission.receipt.markdown, true);
  assert.strictEqual(result.submission.receipt.persisted, true); assert.strictEqual(s.a.comments[1].markdown, true);
  assert.deepEqual(s.nativeObjectWrites, [], 'business state must not round-trip through Native dictionary properties');
  s.api.append(s.controller, s.payload); assert.equal(s.a.comments.length, 2);
  closeInput(s); assert.equal(s.api.getState(s.open('b')).markdown, true);
}

{
  const s = setup(), exit = { sessionId: s.payload.sessionId, submissionId: s.payload.submissionId, active: true, directed: true };
  s.api.present(s.controller, { sessionId: s.payload.sessionId });
  assert.throws(() => s.api.setExit(s.controller, exit), /尚未确认保存/);
  assert.equal(s.controller.view.alpha, 1);
  s.api.append(s.controller, s.payload);
  assert.throws(() => s.api.setExit(s.controller, { ...exit, submissionId: 'other' }), /尚未确认保存/);
  s.api.setExit(s.controller, exit); s.api.setExit(s.controller, exit);
  assert.equal(s.controller.view.alpha, 0); assert.equal(s.events.filter(e => e === 'native-fade:0.52').length, 1);
  s.api.setExit(s.controller, { ...exit, active: false }); assert.equal(s.controller.view.alpha, 1);
  s.api.setExit(s.controller, { ...exit, reducedMotion: true }); assert(s.events.includes('native-fade:0.12'));
  while (s.timers.length) s.timers.shift()();
  assert.equal(s.controller.view.alpha, 0, 'lost close delivery must not reveal a blank Native canvas');
  assert.equal(s.addon.quickCommentController, null, 'a confirmed save must eventually finish closing');
  assert.equal(s.a.comments.length, 2, 'visibility recovery must never append again');
}
{
  const s = setup(); s.api.append(s.controller, s.payload);
  s.context.UIView.animateWithDurationDelayOptionsAnimationsCompletion = () => { throw new Error('animation unavailable'); };
  const result = s.api.setExit(s.controller, { sessionId: s.payload.sessionId, submissionId: s.payload.submissionId, active: true });
  assert.equal(result.started, false); assert.equal(s.controller.view.alpha, 1); assert.equal(s.a.comments.length, 2);
}
{
  const s = setup();
  assert.equal(s.controller.view.alpha, 0, 'the Native canvas must be hidden before insertion');
  const request = { sessionId: s.payload.sessionId, reducedMotion: false };
  s.api.present(s.controller, request); s.api.present(s.controller, request);
  assert.equal(s.controller.view.alpha, 1); assert.equal(s.events.filter(e => e === 'native-fade:0.3').length, 1);
  assert(s.events.includes('focus-input'));
  s.api.requestClose(s.controller, { sessionId: s.payload.sessionId }); while (s.timers.length) s.timers.shift()();
  const next = s.open(); assert.equal(next.view.alpha, 0);
  s.api.present(next, { sessionId: s.api.getState(next).sessionId, reducedMotion: true });
  assert(s.events.includes('native-fade:0.12')); assert.equal(s.a.comments.length, 1);
}
{
  const s = setup(); s.context.self = s.controller; s.bindings.webViewDidFinishLoad();
  assert.equal(s.controller.view.alpha, 0); s.timers.shift()(); assert.equal(s.controller.view.alpha, 0, 'fallback must wait for a ready page rather than reveal a blank canvas');
  s.api.present(s.controller); assert.equal(s.controller.view.alpha, 1);
  s.api.append(s.controller, s.payload);
  s.api.setExit(s.controller, { sessionId: s.payload.sessionId, submissionId: s.payload.submissionId, active: true });
  s.api.present(s.controller, { sessionId: s.payload.sessionId }); assert.equal(s.controller.view.alpha, 0, 'late readiness must not reverse an exit');
}
{
  const s = setup(); s.context.UIView.animateWithDurationDelayOptionsAnimationsCompletion = () => { throw new Error('animation unavailable'); };
  s.api.present(s.controller); assert.equal(s.controller.view.alpha, 1, 'opening animation failure must leave the input accessible');
}
console.log('quick comment native tests passed');
}
module.exports = { setup };
