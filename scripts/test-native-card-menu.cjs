const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.argv[2] || path.resolve(__dirname, "../src");
let passed = 0;
function fixture() {
  let now = 100000;
  const calls = [], timers = [], events = [], notes = { A: { noteId: 'A' }, B: { noteId: 'B' }, empty: { noteId: 'empty' } };
  let focus = [notes.A], focusError = null;
  const addon = { window: 'window', mnCommentManagerSceneActive: true, webController: {} };
  class View { constructor(frame) { this.frame = frame; this.bounds = frame; this.subviews = []; this.gestures = []; }
    addSubview(v) { this.subviews.push(v); v.superview = this; }
    addGestureRecognizer(g) { this.gestures.push(g); g.view = this; }
    removeGestureRecognizer(g) { this.gestures = this.gestures.filter(x => x !== g); }
    removeFromSuperview() { if (this.superview) this.superview.subviews = this.superview.subviews.filter(x => x !== this); }
    convertRectToView() { return this.frame; }
    titleForState() { return this.title; }
  }
  const host = new View({ x: 0, y: 0, width: 1024, height: 768 });
  let menu;
  function rebuild(action = 'nativeCommentManager', duplicate = false) {
    const button = new View({ x: 20, y: 40, width: 80, height: 44 }); button.title = '评论管理';
    const add = new View(button.frame); add.title = '添加评论';
    menu = new View(host.bounds); menu.visible = true; menu.items = [{ title: button.title, actionString: 'addon.marginnote.extension.mncommentmanager.' + action + ':' }];
    menu.subviews = [button, add]; if (duplicate) { const other = new View(button.frame); other.title = button.title; menu.subviews.push(other); }
    return { menu, button, add };
  }
  rebuild();
  const context = vm.createContext({ console: { log() {} }, Date: { now: () => now }, Math, UIView: View,
    MNUtil: { currentWindow: 'window', currentNotebookId: 'notebook-A', immersiveMode: true,
      immersiveTemplateForAddon: { templateId: 'scene-A', allowed: true, config: {} },
      studyView: host, parseWinRect: JSON.parse, showHUD: message => calls.push(['error', message]) },
    MNNote: { getFocusNotes() { if (focusError) throw focusError; return focus; } },
    Database: { sharedInstance: () => ({ getNoteById: id => notes[id] }) },
    Application: { sharedInstance: () => ({ documentPath: '/docs' }) },
    NSFileManager: { defaultManager: () => ({ fileExistsAtPath: () => true }) },
    NSJSONSerialization: { dataWithJSONObjectOptions: report => ({ writeToFileAtomically() { events.splice(0, events.length, ...JSON.parse(JSON.stringify(report.events))); return true; } }) },
    PopupMenu: { currentMenu: () => menu },
    NSTimer: { scheduledTimerWithTimeInterval(seconds, repeat, cb) { const timer = { seconds, cb, invalid: false, invalidate() { this.invalid = true; } }; timers.push(timer); return timer; } },
    UITapGestureRecognizer: function(target, selector) { this.selector = selector; },
    UILongPressGestureRecognizer: function(target, selector) { this.selector = selector; },
    __MN_COMMENT_DATA__: { getWrappedNoteById: id => notes[id], getNoteSnapshot: note => ({ comments: note.noteId === 'empty' ? [] : [{}], excerpt: { present: false } }) },
    __MN_DYNAMIC_COMMENT_ACTIONS__: { relayout() {}, hideButton(a) { a.dynamicCommentContext = null; }, openExplicitAction(a, value, action) { calls.push(['full', value.noteId]); return true; } },
    __MN_BATCH_COMMENT_ACTIONS__: { hideButton() {} },
    __MN_COMMENT_MOVE_MNCommentManagerAddon: { open(a, value) { calls.push(['quick', value.noteId]); return true; } },
    __MN_QUICK_COMMENT_MNCommentManagerAddon: { getState: c => ({ noteId: c.noteId }), open(a, c) { if (!a.quickCommentController) { a.quickCommentController = { noteId: c.noteId }; calls.push(['add', c.noteId]); } } },
    __MN_COMMENT_WORKFLOW_MENU__: { buildItems: () => [{ title: '已有工作流', selector: 'runSingleWorkflow:', param: { workflowId: 'original' } }] },
    __MN_COMMENT_ACTION_UI_MNCommentManagerAddon: { present(a, anchor, items) { calls.push(['menu', items]); return { dismissPopoverAnimated() {} }; } }
  });
  Object.defineProperty(context.MNUtil, 'notebookController', { get() {
    if (focusError) throw focusError;
    if (!Array.isArray(focus)) throw new Error('native selection unavailable');
    return { notebookId: 'notebook-A', view: { hidden: false }, mindmapView: { selViewLst: focus.map(note => ({ note: { note } })) } };
  } });
  vm.runInContext(fs.readFileSync(path.join(runtime, 'NoteAccess.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(runtime, 'NativeCardMenuActions.js'), 'utf8'), context);
  const api = context.__MN_NATIVE_CARD_MENU_MNCommentManagerAddon;
  function tick(seconds = Infinity) { const pending = timers.splice(0); pending.forEach(t => { if (!t.invalid && t.seconds <= seconds) t.cb(); else if (!t.invalid) timers.push(t); }); }
  function open(id = 'A') { focus = [notes[id]].filter(Boolean); focusError = null; api.opened(addon, { userInfo: { noteid: id, winRect: { x: 20, y: 40, width: 80, height: 44 } } }); }
  return { api, addon, context, calls, events, notes, open, tick, rebuild,
    setFocus(value) { focus = value; focusError = null; }, setFocusError(error) { focusError = error; },
    advanceTime(ms) { now += ms; }, get menu() { return menu; } };
}
function test(name, body) { body(); console.log('PASS ' + name); passed++; }
test('catalog and missing targets do not depend on floating settings', () => {
  const f = fixture(); assert.deepEqual(Array.from(f.api.query(null), x => x.title), ['评论管理', '添加评论']);
  assert.equal(f.api.query('missing').length, 0); assert.equal(f.api.run(f.addon, 'other', 'A'), false);
  assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'missing'), false);
  f.open(); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), true); assert.deepEqual(f.calls.at(-1), ['quick', 'A']);
  f.open('empty'); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'empty'), true); assert.deepEqual(f.calls.at(-1), ['full', 'empty']);
});
test('recognizers attach only to management and retry without duplicates', () => {
  const f = fixture(); f.open(); f.tick(); f.tick();
  assert.equal(f.menu.subviews[0].gestures.length, 2); assert.equal(f.menu.subviews[1].gestures.length, 0);
  const [double, hold] = f.menu.subviews[0].gestures; assert.equal(double.numberOfTapsRequired, 2); assert(double.delaysTouchesBegan && double.delaysTouchesEnded && double.cancelsTouchesInView); assert.equal(hold.minimumPressDuration, .5);
});
test('double and hold dispatch exactly once and suppress a trailing native tap', () => {
  for (const kind of ['double', 'hold']) {
    const f = fixture(); f.open(); f.tick(); const binding = f.addon.mncmNativeCardMenuState.bindings[0], gesture = binding[kind];
    gesture.state = kind === 'double' ? 3 : 1; assert.equal(f.api.pressed(f.addon, gesture), true); f.api.pressed(f.addon, gesture);
    gesture.state = 3; f.api.pressed(f.addon, gesture);
    assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], kind === 'double' ? 'full' : 'menu');
    if (kind === 'hold') { const items = f.calls[0][1]; assert.deepEqual(Array.from(items.slice(0, 3), x => x.title), ['快捷面板', '完整面板', '添加评论']); assert.equal(items.at(-1).param.workflowId, 'original'); }
  }
});
test('menu callbacks validate payload and preserve the authoritative target', () => {
  const f = fixture(); f.open(); f.tick(); const hold = f.addon.mncmNativeCardMenuState.bindings[0].hold; hold.state = 1; f.api.pressed(f.addon, hold);
  const items = f.calls[0][1], value = items[0].param;
  assert.equal(f.api.fromMenu(f.addon, { ...value, token: 'old' }), false);
  assert.equal(f.api.fromMenu(f.addon, value), true); assert.deepEqual(f.calls.at(-1), ['quick', 'A']);
  assert.equal(f.api.fromMenu(f.addon, items[1].param), false, 'old menu cannot run after handoff creates a new token');
});
test('reopening the menu accepts the next interaction after closing a panel', () => {
  for (const kind of ['double', 'hold']) {
    const f = fixture(); f.open(); f.tick(); const binding = f.addon.mncmNativeCardMenuState.bindings[0], gesture = binding[kind];
    gesture.state = kind === 'double' ? 3 : 1; assert.equal(f.api.pressed(f.addon, gesture), true);
    f.advanceTime(12000);
    if (kind === 'hold') { assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false); gesture.state = 3; f.api.pressed(f.addon, gesture); }
    f.advanceTime(601); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), true);
    assert.deepEqual(f.calls.at(-1), ['quick', 'A']);
    f.advanceTime(601); f.addon.dynamicCommentMenuPopoverController = null; f.open(); f.tick(.02); const next = f.addon.mncmNativeCardMenuState.bindings[0][kind]; next.state = kind === 'double' ? 3 : 1; assert.equal(f.api.pressed(f.addon, next), true);
  }
});
test('switching cards, windows, deletion and terminal cancellation reject stale gestures', () => {
  for (const change of ['card', 'window', 'delete', 'cancel', 'inactive']) {
    const f = fixture(); f.open(); f.tick(); const gesture = f.addon.mncmNativeCardMenuState.bindings[0].double;
    if (change === 'card') f.open('B'); if (change === 'window') f.context.MNUtil.currentWindow = 'other';
    if (change === 'delete') delete f.notes.A; if (change === 'inactive') f.addon.mnCommentManagerSceneActive = false;
    gesture.state = change === 'cancel' ? 4 : 3; f.api.pressed(f.addon, gesture); assert.equal(f.calls.filter(x => x[0] !== 'error').length, 0);
  }
});
test('rebuild, ambiguous buttons, unrelated actions, close and disposal clean bindings', () => {
  const f = fixture(); f.open(); f.tick(.02); const old = f.menu.subviews[0]; f.rebuild(); f.tick();
  assert.equal(old.gestures.length, 0); assert.equal(f.menu.subviews[0].gestures.length, 2);
  f.api.closed(f.addon, { userInfo: { noteid: 'B' } }); f.tick(); assert.equal(f.menu.subviews[0].gestures.length, 2);
  f.api.closed(f.addon); f.tick(); assert.equal(f.menu.subviews[0].gestures.length, 0);
  for (const [command, duplicate] of [['unrelated', false], ['nativeCommentManager', true]]) { f.rebuild(command, duplicate); f.open(); f.tick(); assert.equal(f.menu.subviews[0].gestures.length, 0); }
  f.rebuild(); f.open(); f.api.dispose(f.addon); f.tick(); assert.equal(f.menu.subviews[0].gestures.length, 0);
});
test('add has no auxiliary recognizer and repeated commands reuse one input', () => {
  const f = fixture(); f.open(); f.tick(); f.api.run(f.addon, 'nativeAddComment', 'A'); f.api.run(f.addon, 'nativeAddComment', 'A');
  assert.equal(f.calls.filter(x => x[0] === 'add').length, 1); assert.equal(f.menu.subviews[1].gestures.length, 0);
});
test('another target cannot silently reuse an input belonging to the previous card', () => {
  const f = fixture(); f.open(); f.api.run(f.addon, 'nativeAddComment', 'A'); f.open('B');
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'B'), false); assert.equal(f.addon.quickCommentController.noteId, 'A');
  assert.equal(f.calls.filter(x => x[0] === 'add').length, 1);
});
test('long menu anchors to the native button and describes actual panel icons', () => {
  const f = fixture(); f.open(); f.tick(); const binding = f.addon.mncmNativeCardMenuState.bindings[0];
  binding.hold.state = 1; f.api.pressed(f.addon, binding.hold);
  assert.equal(f.addon.mncmNativeCardMenuState.anchor.frame, binding.button.frame);
  const items = f.calls.find(x => x[0] === 'menu')[1];
  const uiFile = fs.existsSync(path.join(runtime, 'CommentActionUI.js')) ? path.join(runtime, 'CommentActionUI.js') : path.resolve(__dirname, '../src/CommentActionUI.js');
  vm.runInContext(fs.readFileSync(uiFile, 'utf8'), f.context);
  const ui = f.context.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
  assert.deepEqual(Array.from(items.slice(0, 3), item => ui.describe(item).icon), ['organize', 'manager', 'add']);
  assert(items.slice(0, 3).every(item => ui.describe(item).group === '打开面板'));
});
if (fs.existsSync(path.join(runtime, "MNCommentManagerAddon.js"))) {
  const source = fs.readFileSync(path.join(runtime, 'MNCommentManagerAddon.js'), 'utf8');
  const f = fixture(); f.context.JSB = { defineClass: (_, members) => members }; f.context.self = f.addon;
  vm.runInContext(source, f.context); const callbacks = f.context.createMNCommentManagerAddon('/test');
  for (const key of ['queryCardCommandsForNote', 'runCardCommandForNote', 'mncmNativeCardMenuGesture', 'mncmNativeCardMenuAction']) assert.equal(typeof callbacks[key], 'function');
  assert.equal(callbacks.queryCardCommandsForNote(null).length, 2); passed++;
}
console.log(JSON.stringify({ passed, runtime }));
test('partial recognizer failures preserve the other gesture and native tap', () => {
  for (const missing of ['UITapGestureRecognizer', 'UILongPressGestureRecognizer']) {
    const f = fixture(); f.context[missing] = function () { throw new Error('unavailable'); }; f.open(); f.tick(.02);
    const binding = f.addon.mncmNativeCardMenuState.bindings[0];
    assert.equal(binding.gestures.length, 1);
    assert.equal(!!binding.double, missing !== 'UITapGestureRecognizer');
    assert.equal(!!binding.hold, missing !== 'UILongPressGestureRecognizer');
    assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), true);
  }
});
test('long release remains exclusive across menu close and layout changes', () => {
  const f = fixture(); f.open(); f.tick(.02);
  const binding = f.addon.mncmNativeCardMenuState.bindings[0], hold = binding.hold;
  hold.state = 1; assert.equal(f.api.pressed(f.addon, hold), true);
  f.menu.visible = false; f.api.closed(f.addon); f.api.refresh(f.addon); f.tick(.2); f.advanceTime(5000);
  assert.equal(f.addon.mncmNativeCardMenuState.holdActive, true);
  assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
  hold.state = 3; f.api.pressed(f.addon, hold);
  assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
  assert.equal(f.calls.filter(x => x[0] !== 'error').length, 1);
  assert.equal(binding.button.gestures.length, 0);
});
test('a command removed from an unchanged menu cannot leave stale gestures', () => {
  const f = fixture(); f.open(); f.tick(.02);
  const binding = f.addon.mncmNativeCardMenuState.bindings[0];
  f.menu.items = []; binding.double.state = 3;
  assert.equal(f.api.pressed(f.addon, binding.double), false);
  f.api.refresh(f.addon); assert.equal(binding.button.gestures.length, 0);
});
test('menu lifetime polling remains bounded and scene exit cancels the queue', () => {
  const f = fixture(); f.open();
  for (let i = 0; i < 1000; i++) f.tick(.25);
  assert(f.addon.mncmNativeCardMenuState.timers.length <= 5);
  f.api.dispose(f.addon); f.tick(); assert.equal(f.addon.mncmNativeCardMenuState.timers.length, 0);
});
console.log(JSON.stringify({ passed, runtime, extraRuntimeEdges: true }));
test('close cannot rebind a later menu to a previous card', () => {
  const f = fixture(); f.open(); f.tick(.02); const old = f.addon.mncmNativeCardMenuState.bindings[0].double;
  f.api.closed(f.addon); f.tick(); f.rebuild(); f.api.refresh(f.addon);
  assert.equal(f.addon.mncmNativeCardMenuState.noteId, ''); assert.equal(f.addon.mncmNativeCardMenuState.bindings.length, 0);
  old.state = 3; assert.equal(f.api.pressed(f.addon, old), false); assert.equal(f.calls.length, 0);
});
test('panel ownership ends native polling without changing the panel context', () => {
  const f = fixture(); f.open(); f.tick(.02); f.addon.quickCommentController = { noteId: 'A' }; const input = f.addon.quickCommentController;
  f.tick(.25); assert.equal(f.addon.mncmNativeCardMenuState.noteId, ''); assert.equal(f.addon.mncmNativeCardMenuState.timers.length, 0);
  assert.equal(f.addon.quickCommentController, input);
});
test('watch failures clean native state and make one fallback layout attempt', () => {
  const f = fixture(); f.open(); let layouts = 0;
  f.context.__MN_DYNAMIC_COMMENT_ACTIONS__.relayout = () => { layouts++; throw new Error('layout unavailable'); };
  f.tick(.25); assert.equal(layouts, 2); assert.equal(f.addon.mncmNativeCardMenuState.noteId, '');
  assert.equal(f.addon.mncmNativeCardMenuState.timers.length, 0); assert.equal(f.addon.mncmNativeCardMenuState.bindings.length, 0);
});
console.log(JSON.stringify({ passed, runtime, reviewedEdges: true }));
test('hold terminal cleans ownership even when the host omits close notification', () => {
  const f = fixture(); f.open(); f.tick(.02); const hold = f.addon.mncmNativeCardMenuState.bindings[0].hold;
  hold.state = 1; f.api.pressed(f.addon, hold); f.menu.visible = false; f.tick(.25);
  hold.state = 3; f.api.pressed(f.addon, hold);
  assert.equal(f.addon.mncmNativeCardMenuState.noteId, ''); assert.equal(f.addon.mncmNativeCardMenuState.bindings.length, 0);
  assert(f.addon.dynamicCommentContext); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
});
test('failed long action resumes one watcher until the next rebuild', () => {
  const f = fixture(); f.context.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon.present = () => null;
  f.open(); f.tick(.02); const old = f.menu.subviews[0], hold = f.addon.mncmNativeCardMenuState.bindings[0].hold;
  hold.state = 1; assert.equal(f.api.pressed(f.addon, hold), false); f.tick(.25);
  hold.state = 3; f.api.pressed(f.addon, hold); f.api.pressed(f.addon, hold);
  assert.equal(f.addon.mncmNativeCardMenuState.timers.filter(t => t.seconds === .25).length, 1);
  f.rebuild(); f.tick(.25); assert.equal(old.gestures.length, 0);
  assert.equal(f.menu.subviews[0].gestures.length, 2);
});
console.log(JSON.stringify({ passed, runtime, missingCloseEdges: true }));
test('switching notebooks invalidates the original command even when the scene is unchanged', () => {
  const f = fixture(); f.open(); f.tick(.02);
  f.context.MNUtil.currentNotebookId = 'notebook-B';
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  assert.equal(f.calls.filter(x => x[0] === 'add').length, 0);
  f.context.MNUtil.currentNotebookId = 'notebook-A';
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false, 'returning to the old scope cannot revive a rejected origin');
  f.open(); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), true);
  assert.deepEqual(f.calls.filter(x => x[0] === 'add'), [['add', 'A']]);
});
test('scene and immersive mode changes invalidate actions without changing the notebook', () => {
  for (const change of ['scene', 'immersive']) {
    const f = fixture(); f.open();
    if (change === 'scene') f.context.MNUtil.immersiveTemplateForAddon.templateId = 'scene-B';
    else f.context.MNUtil.immersiveMode = false;
    assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
    assert.equal(f.calls.filter(x => x[0] === 'quick' || x[0] === 'full').length, 0);
    f.context.MNUtil.immersiveTemplateForAddon.templateId = 'scene-A'; f.context.MNUtil.immersiveMode = true;
    assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
    f.open(); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), true);
  }
});
test('changing the selected card without another popup rejects the old command and requires a new origin', () => {
  const f = fixture(); f.open(); f.setFocus([f.notes.B]);
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  f.setFocus([f.notes.A]); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  assert.equal(f.calls.filter(x => x[0] === 'add').length, 0);
  f.open('B'); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'B'), true);
  assert.deepEqual(f.calls.filter(x => x[0] === 'add'), [['add', 'B']]);
});
test('empty, multiple, malformed and unavailable selections reject actions without changing content', () => {
  for (const invalid of ['empty', 'multiple', 'null', 'object', 'missing-id', 'exception']) {
    const f = fixture(); f.open();
    if (invalid === 'exception') f.setFocusError(new Error('focus unavailable'));
    else f.setFocus({ empty: [], multiple: [f.notes.A, f.notes.B], null: null, object: { 0: f.notes.A, length: 1 }, 'missing-id': [{}] }[invalid]);
    assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false, invalid);
    assert.equal(f.calls.filter(x => x[0] !== 'error').length, 0, invalid);
    assert.deepEqual(f.notes.A, { noteId: 'A' });
    f.setFocus([f.notes.A]); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false, invalid + ' origin remains invalid');
    f.open(); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), true, invalid + ' fresh popup recovers');
  }
});
test('disposal rejects old commands while the catalog remains available', () => {
  const f = fixture(); f.open(); f.api.dispose(f.addon);
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), false);
  assert.equal(f.api.query(null).length, 2);
  assert.equal(f.calls.filter(x => x[0] !== 'error').length, 0);
  f.open(); assert.equal(f.api.run(f.addon, 'nativeCommentManager', 'A'), true);
});
test('unknown scope rejects dispatch without removing the command catalog', () => {
  for (const missing of ['notebook', 'immersive', 'template', 'scope-exception']) {
    const f = fixture();
    if (missing === 'notebook') f.context.MNUtil.currentNotebookId = '';
    if (missing === 'immersive') f.context.MNUtil.immersiveMode = undefined;
    if (missing === 'template') f.context.MNUtil.immersiveTemplateForAddon = null;
    if (missing === 'scope-exception') Object.defineProperty(f.context.MNUtil, 'currentNotebookId', { get() { throw new Error('scope unavailable'); } });
    f.open(); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false, missing);
    assert.equal(f.calls.filter(x => x[0] !== 'error').length, 0, missing);
    assert.equal(f.api.query(null).length, 2, missing);
  }
});
test('a close notification before native dispatch preserves a valid same-scope origin', () => {
  const f = fixture(); f.open(); f.tick(.02); f.api.closed(f.addon); f.tick();
  assert.equal(f.addon.mncmNativeCardMenuState.noteId, '');
  assert.equal(f.addon.mncmNativeCardMenuState.bindings.length, 0);
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), true);
  assert.deepEqual(f.calls.filter(x => x[0] === 'add'), [['add', 'A']]);
});
test('scope invalidation detaches native watchers and hides only the matching stale dynamic context', () => {
  for (const [dynamicNoteId, hasInput] of [['A', false], ['B', false], ['A', true], ['B', true]]) {
    const f = fixture(); f.open(); f.tick(.02);
    const button = f.menu.subviews[0], input = hasInput ? { noteId: 'A' } : null, dynamic = { noteId: dynamicNoteId };
    f.addon.quickCommentController = input; f.addon.dynamicCommentContext = dynamic;
    f.context.MNUtil.currentNotebookId = 'notebook-B'; f.api.refresh(f.addon);
    assert.equal(button.gestures.length, 0);
    assert.equal(f.addon.mncmNativeCardMenuState.timers.length, 0);
    assert.equal(f.addon.mncmNativeCardMenuState.noteId, '');
    assert.equal(f.addon.quickCommentController, input, 'scope cleanup must not close an existing input');
    assert.equal(f.addon.dynamicCommentContext, dynamicNoteId === 'A' && !hasInput ? null : dynamic);
    f.context.MNUtil.currentNotebookId = 'notebook-A'; f.addon.quickCommentController = null;
    assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  }
});
test('gestures and menu commands share the same scope and selection revalidation', () => {
  for (const kind of ['double', 'hold', 'menu']) {
    const f = fixture(); f.open(); f.tick(.02);
    const binding = f.addon.mncmNativeCardMenuState.bindings[0];
    if (kind === 'menu') {
      binding.hold.state = 1; assert.equal(f.api.pressed(f.addon, binding.hold), true);
      const param = f.calls.find(x => x[0] === 'menu')[1][2].param;
      f.setFocus([f.notes.B]); assert.equal(f.api.fromMenu(f.addon, param), false);
      assert.equal(f.calls.filter(x => x[0] === 'add').length, 0);
    } else {
      f.context.MNUtil.currentNotebookId = 'notebook-B';
      const gesture = binding[kind]; gesture.state = kind === 'double' ? 3 : 1;
      assert.equal(f.api.pressed(f.addon, gesture), false);
      assert.equal(f.calls.filter(x => x[0] !== 'error').length, 0);
    }
  }
});
test('another card input cannot bypass permanent invalidation of an old native add command', () => {
  const f = fixture(); f.open(); f.tick(.02); f.api.closed(f.addon); f.tick();
  const input = { noteId: 'B' }; f.addon.quickCommentController = input;
  f.context.MNUtil.currentNotebookId = 'notebook-B';
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false);
  assert.equal(f.addon.mncmNativeCardMenuState.actionOrigin, null);
  assert.equal(f.addon.quickCommentController, input, 'rejecting an obsolete command must preserve the existing input');
  f.context.MNUtil.currentNotebookId = 'notebook-A'; f.addon.quickCommentController = null;
  assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), false, 'returning to the old scope does not revive its invalid origin');
  assert.equal(f.calls.filter(x => x[0] === 'add').length, 0);
  f.open(); assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), true);
});
test('generation changes during attachment stop the current watcher before relayout or rescheduling', () => {
  const f = fixture(); let layouts = 0;
  f.context.__MN_DYNAMIC_COMMENT_ACTIONS__.relayout = () => { layouts++; };
  f.open(); f.tick(.2); const generation = f.addon.mncmNativeCardMenuState.generation;
  f.context.MNUtil.currentNotebookId = 'notebook-B'; f.tick(.25);
  assert(f.addon.mncmNativeCardMenuState.generation > generation);
  assert.equal(f.addon.mncmNativeCardMenuState.noteId, '');
  assert.equal(f.addon.mncmNativeCardMenuState.timers.length, 0);
  assert.equal(f.addon.mncmNativeCardMenuState.watchTimer, null);
  assert.equal(layouts, 0);
  f.tick(); assert.equal(layouts, 0);
});
test('duplicate selections of one note in main and floating maps remain a unique target', () => {
  for (const duplicate of ['noteId', 'noteid']) {
    const f = fixture(); f.open();
    f.setFocus([f.notes.A, { [duplicate]: 'A' }]);
    assert.equal(f.api.run(f.addon, 'nativeAddComment', 'A'), true, duplicate);
    assert.deepEqual(f.calls.filter(x => x[0] === 'add'), [['add', 'A']]);
  }
});
console.log(JSON.stringify({ passed, runtime, staleActionContextEdges: true }));
