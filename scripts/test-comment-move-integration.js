const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.env.MNCM_RUNTIME_DIR || path.join(__dirname, '..', 'src');

function setup(options = {}) {
  let now = 10000, timerSequence = 0, focusId = 'one', tracking = false;
  const timers = [], hud = [], undoGroups = [], nativeMoves = [], stateObjectWrites = [], runLoopRegistrations = [];
  class View {
    constructor(frame = {}) {
      this.frame = frame; this.bounds = { x: 0, y: 0, width: frame.width, height: frame.height };
      this.layer = {}; this.titleLabel = {}; this.subviews = []; this.gestureRecognizers = []; this.events = [];
    }
    addSubview(view) { view.removeFromSuperview(); view.superview = this; this.subviews.push(view); }
    removeFromSuperview() { if (this.superview) this.superview.subviews = this.superview.subviews.filter(view => view !== this); this.superview = null; }
    addTargetActionForControlEvents(target, selector, mask) { this.events.push({ target, selector, mask }); }
    setTitleForState(title) { this.title = title; }
    setTitleColorForState() {}
    setImageForState() {}
    addGestureRecognizer(gesture) { gesture.view = this; this.gestureRecognizers.push(gesture); }
    bringSubviewToFront() {}
    viewWithTag(tag) { for (const view of this.subviews) { if (view.tag === tag) return view; const nested = view.viewWithTag(tag); if (nested) return nested; } return null; }
    convertRectToView(rect) { return { x: this.frame.x + Number(rect.x || 0), y: this.frame.y + Number(rect.y || 0), width: rect.width, height: rect.height }; }
    resignFirstResponder() { this.resigned = true; }
  }
  const host = new View({ x: 0, y: 0, width: options.width || 600, height: options.height || 600 });
  const window = {}, notes = {}, commentCount = options.count || 7;
  for (const id of ['one', 'two']) {
    notes[id] = {
      noteId: id, notebookId: 'book', foldRevision: 0, comments: Array.from({ length: commentCount }, (_, index) => ({ text: String.fromCharCode(65 + index), type: 'TextNote' })),
      moveComment(from, to) { nativeMoves.push({ noteId: id, text: this.comments[from].text, from, to }); this.comments.splice(to, 0, this.comments.splice(from, 1)[0]); if (options.foldRevision) this.foldRevision++; },
      refresh() {},
    };
  }
  const mindmap = new View({ x: 0, y: 0, width: host.bounds.width, height: host.bounds.height });
  host.addSubview(mindmap);
  function updateNodes() {
    for (const selected of mindmap.selViewLst || []) selected.view.removeFromSuperview();
    mindmap.selViewLst = [];
    if (options.selectedViews) {
      const view = new View(options.cardFrame || { x: 100, y: 110, width: Math.min(260, host.bounds.width - 80), height: Math.min(340, host.bounds.height - 140) });
      view.noteId = focusId;
      host.addSubview(view);
      mindmap.selViewLst = [{ note: { note: { noteId: focusId } }, view }];
      mindmap.mindmapNodes = [{ note: { noteId: 'root-only' }, frame: { x: 20, y: 20, width: 40, height: 40 } }];
      return;
    }
    mindmap.mindmapNodes = Object.values(notes).map(note => {
      const node = new View({ x: 100, y: 110, width: Math.min(260, host.bounds.width - 80), height: Math.min(340, host.bounds.height - 140) });
      node.note = note; node.noteId = note.noteId;
      return node;
    });
  }
  updateNodes();
  const study = { notebookController: { mindmapView: mindmap } };
  const settings = { enableDynamicSingleCardButton: true, showQuickCommentButton: true };
  function bridgeCopy(value, seen = new WeakMap()) {
    if (!value || typeof value !== 'object' || value instanceof View || value === window) return value;
    if (seen.has(value)) return seen.get(value);
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) if (typeof value[key] !== 'function') copy[key] = bridgeCopy(value[key], seen);
    return copy;
  }
  const addonTarget = { window };
  const addon = options.nativeBridge ? new Proxy(addonTarget, {
    set(target, key, value) {
      const isState = value && typeof value === 'object' && (value.panelToken || value.geometry && value.comments);
      if (isState) stateObjectWrites.push(String(key));
      target[key] = isState ? bridgeCopy(value) : value;
      return true;
    },
    get(target, key) {
      const value = target[key];
      return value && typeof value === 'object' && (value.panelToken || value.geometry && value.comments) ? bridgeCopy(value) : value;
    },
  }) : addonTarget;
  const context = {
    console: { log() {} }, JSB: { defineClass(_name, methods) { return methods; } },
    Date: { now: () => now },
    UIView: View, UILabel: View, UITextField: View, UIImageView: View, UIScrollView: View,
    UIButton: { buttonWithType: () => new View() },
    UIImage: { imageWithData: data => ({ data }) },
    UIPanGestureRecognizer: class { constructor(target, selector) { this.target = target; this.selector = selector; } },
    UITapGestureRecognizer: class {},
    UIFont: { boldSystemFontOfSize() {}, systemFontOfSize() {} }, UIColor: { clearColor() {} },
    NSTimer: {
      scheduledTimerWithTimeInterval(seconds, repeats, callback) {
        const interval = Math.max(0, Number(seconds)) * 1000;
        const timer = { at: now + interval, interval, repeats, callback, sequence: timerSequence++, valid: true, hostTracking: !!options.runLoopUnavailable, controllerTimer: /CommentMoveController\.js/.test(new Error().stack), invalidate() { this.valid = false; } };
        timers.push(timer); return timer;
      },
    },
    NSRunLoop: { mainRunLoop: () => ({ addTimerForMode(timer, mode) { runLoopRegistrations.push({ timer, mode }); if (mode === 'kCFRunLoopCommonModes') timer.commonMode = true; } }) },
    Application: { sharedInstance: () => ({ studyController: () => study }) },
    MNUtil: { currentWindow: window, studyView: host, currentNotebookId: 'book', hexColorAlpha: value => value, getImage() {}, getMediaByHash() {}, showHUD: text => hud.push(text), refreshAfterDBChanged() {} },
    MNNote: { new: id => notes[id], getFocusNote: () => notes[focusId] },
    __MN_COMMENT_ACTION_SETTINGS__: { getSettings: () => settings },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById: id => notes[id],
      getNoteSnapshot(note) { return { noteId: note.noteId, commentFold: options.foldRevision ? { revision: String(note.foldRevision) } : undefined, comments: note.comments.map((comment, index) => ({ ...comment, index, originalType: comment.type, type: 'textComment', capabilities: { canMove: true } })) }; },
    },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(name, _options, block) { undoGroups.push(name); return block(); } },
  };
  if (options.runLoopUnavailable) delete context.NSRunLoop;
  vm.createContext(context);
  for (const file of ['FloatingControlLayout.js', 'CommentMutations.js', 'CommentMoveGesture.js', 'CommentMoveViews.js', 'CommentMoveController.js', 'DynamicCommentActions.js', 'MNCommentManagerAddon.js']) {
    vm.runInContext(fs.readFileSync(path.join(runtime, file), 'utf8'), context, { filename: file });
  }
  context.self = addon;
  Object.assign(addon, context.createMNCommentManagerAddon(runtime));
  const controller = context.__MN_COMMENT_MOVE_MNCommentManagerAddon, actions = context.__MN_DYNAMIC_COMMENT_ACTIONS__;
  function advance(ms) {
    const until = now + ms;
    for (let executions = 0; ; executions++) {
      assert(executions < 10000, 'timer callback loop did not settle');
      const due = timers.filter(timer => timer.valid && timer.at <= until && (!tracking || timer.commonMode || timer.hostTracking)).sort((a, b) => a.at - b.at || a.sequence - b.sequence)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      if (due.repeats) due.at += Math.max(due.interval, 1); else due.valid = false;
      due.callback(due);
    }
    now = until;
  }
  function selectCard(id = 'one') {
    focusId = id; updateNodes();
    actions.handlePopupMenuOnNote(addon, { userInfo: { noteId: id, winRect: { x: 100, y: 110, width: 120, height: 50 } } });
    advance(400);
  }
  function state() { return controller.stateFor(addon); }
  function open() { return addon.dynamicMoveCommentButtonTapped(addon.dynamicMoveCommentButton); }
  function choose(index = 0) {
    if (!state()) open();
    return addon.openMoveCommentActions({ param: { panelToken: state().panelToken, index } });
  }
  function press(direction = 1) { const sender = direction < 0 ? state().views.up : state().views.down; tracking = true; addon.dynamicMoveStepBegan(sender); return sender; }
  function release(sender) { try { return addon.dynamicMoveStepEnded(sender); } finally { tracking = false; } }
  function tap(direction = 1) { return release(press(direction)); }
  function drag(targetIndex, phase = 3, horizontalCancel = false) {
    const current = state(), knob = current.views.knob;
    const start = { x: current.geometry.rail.x + 22, y: current.geometry.rail.y + 66 };
    let point = { ...start };
    const gesture = { state: 1, view: knob, locationInView: () => point, translationInView: () => ({ x: point.x - start.x, y: point.y - start.y }) };
    tracking = true;
    addon.dynamicMoveSourceTouchDown(knob);
    addon.dynamicMoveRailPanned(gesture);
    const layout = state().geometry;
    const y = layout.trackTop + targetIndex / (current.comments.length - 1) * (layout.trackBottom - layout.trackTop);
    point = { x: horizontalCancel ? layout.rail.x + 600 : layout.rail.x + 22, y };
    gesture.state = 2; addon.dynamicMoveRailPanned(gesture);
    if (phase !== 2) { gesture.state = phase; addon.dynamicMoveRailPanned(gesture); tracking = false; }
    return gesture;
  }
  selectCard();
  return { addon, addonTarget, controller, actions, context, settings, host, mindmap, notes, hud, undoGroups, nativeMoves, stateObjectWrites, timers, runLoopRegistrations,
    advance, selectCard, state, open, choose, press, release, tap, drag,
    focus(id) { focusId = id; }, order(id = 'one') { return notes[id].comments.map(comment => comment.text); } };
}

let cases = 0;
const failures = [];
function textOf(view) { return [view.text || '', ...view.subviews.map(textOf)].join('\n'); }
function intersects(left, right) { return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y; }
function test(name, run) {
  cases++;
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + ': ' + error.message); }
}

test('opening starts with an unselected source and keeps the original main-panel route available', () => {
  const s = setup(); s.open();
  assert.equal(s.state().sourceIndex, -1);
  assert.equal(s.state().views.up.enabled, false);
  assert.equal(s.state().views.down.enabled, false);
  assert.ok(s.state().views.picker);
  assert.equal(typeof s.addon.dynamicCommentButtonTapped, 'function');
  assert.ok(s.addon.dynamicCommentButton);
});

test('short arrow presses move one item, keep the source selected and allow reversal', () => {
  const s = setup(); s.choose(1); s.tap();
  assert.deepEqual(s.order(), ['A', 'C', 'B', 'D', 'E', 'F', 'G']);
  assert.equal(s.state().sourceIndex, 2);
  assert.equal(s.nativeMoves.length, 1);
  assert.equal(s.undoGroups.length, 1);
  s.tap(-1); assert.deepEqual(s.order(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('move results stay inside the permanent sidebar without adding a host overlay', () => {
  const s = setup(); s.choose(0);
  const rail = s.state().views.rail, undo = s.state().views.undo, originalViews = s.host.subviews.slice();
  assert.equal(undo.enabled, false);
  s.tap();
  assert.deepEqual(s.host.subviews, originalViews);
  assert.equal(s.state().views.preview, null);
  assert.equal(s.state().views.undo, undo);
  assert.equal(undo.enabled, true);
  assert.equal(undo.superview, rail);
  assert.equal(undo.frame.width, 44);
  assert.equal(undo.frame.height, 44);
  assert.equal(intersects(rail.frame, s.state().geometry.card), false);
  assert.match(s.state().views.status.text, /2\s*\/\s*7/);
  s.addon.undoQuickCommentMove(undo);
  assert.deepEqual(s.host.subviews, originalViews);
  assert.equal(s.state().views.undo, undo);
  assert.equal(undo.enabled, false);
  assert.match(s.state().views.status.text, /1\s*\/\s*7/);
});

test('long press previews multiple positions and commits once on release', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.advance(449); assert.equal(s.nativeMoves.length, 0);
  s.advance(650); assert.equal(s.nativeMoves.length, 0);
  assert(s.state().targetIndex > 1);
  assert.ok(s.state().views.preview);
  const target = s.state().targetIndex;
  s.release(sender);
  assert.equal(s.nativeMoves.length, 1);
  assert.equal(s.undoGroups.length, 1);
  assert.equal(s.order()[target], 'A');
  s.advance(1500); assert.equal(s.nativeMoves.length, 1);
});

test('hold expansion preserves the pressed arrow global frame and visibility in compact and rich sidebars', () => {
  for (const options of [
    {},
    { width: 390, height: 844, selectedViews: true, cardFrame: { x: 8, y: 150, width: 300, height: 400 } },
    { width: 800, height: 844, selectedViews: true, cardFrame: { x: 500, y: 120, width: 260, height: 400 } },
  ]) {
    const s = setup(options); s.choose(0);
    const globalFrame = view => ({ ...view.frame, x: s.state().views.rail.frame.x + view.frame.x, y: s.state().views.rail.frame.y + view.frame.y });
    const before = globalFrame(s.state().views.down), hostViews = s.host.subviews.slice(), sender = s.press();
    s.advance(800);
    assert.deepEqual(globalFrame(sender), before);
    assert.equal(sender.hidden, false);
    assert.equal(intersects(s.state().views.rail.frame, s.state().geometry.card), false);
    assert.deepEqual(s.host.subviews, hostViews);
    s.release(sender);
    assert.equal(s.nativeMoves.length, 1);
    assert.equal(s.state().views.rail.frame.width, 44);
    assert.equal(s.state().views.preview, null);
  }
});

test('controller timers register common modes and still run during native touch tracking', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  let defaultTimerRan = false;
  s.context.NSTimer.scheduledTimerWithTimeInterval(0.1, false, () => { defaultTimerRan = true; });
  s.advance(800);
  assert.equal(defaultTimerRan, false, 'a default-mode timer must be suspended while tracking');
  assert(s.state().targetIndex > 0, 'the common-mode hold timer must run while tracking');
  const controllerTimers = s.timers.filter(timer => timer.controllerTimer);
  assert(controllerTimers.length > 1);
  assert(controllerTimers.every(timer => timer.commonMode), 'all controller timers must be registered in common modes');
  assert(s.runLoopRegistrations.every(registration => registration.mode === 'kCFRunLoopCommonModes'));
  s.release(sender); s.advance(1);
  assert.equal(defaultTimerRan, true);
});

test('missing NSRunLoop uses the host NSTimer contract for open, taps, holds and cancellation', () => {
  const s = setup({ runLoopUnavailable: true });
  assert.equal(typeof s.context.NSRunLoop, 'undefined');
  s.choose(0); s.tap();
  assert.equal(s.nativeMoves.length, 1);
  const cancelled = s.press();
  const pending = s.timers.filter(timer => timer.controllerTimer && timer.valid && timer.interval === 450).at(-1);
  assert.ok(pending);
  s.addon.dynamicMoveStepCancelled(cancelled);
  assert.equal(pending.valid, false, 'native timer invalidation must cancel the scheduled hold');
  s.advance(1000); s.release(cancelled);
  assert.equal(s.nativeMoves.length, 1);
  const held = s.press(), source = s.state().sourceIndex;
  s.advance(800);
  assert(s.state().targetIndex > source, 'the mocked host timer contract allows tracking callbacks');
  assert.equal(s.nativeMoves.length, 1);
  s.release(held);
  assert.equal(s.nativeMoves.length, 2);
  assert.deepEqual(s.runLoopRegistrations, []);
});

test('drag jumps across the list, previews before release and suppresses the following synthetic tap', () => {
  const s = setup(); s.choose(0);
  const gesture = s.drag(5, 2);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state().targetIndex, 5);
  assert.ok(s.state().views.preview);
  gesture.state = 3; s.addon.dynamicMoveRailPanned(gesture);
  assert.deepEqual(s.order(), ['B', 'C', 'D', 'E', 'F', 'A', 'G']);
  assert.equal(s.nativeMoves.length, 1);
  s.addon.backMoveCommentMenu(s.state().views.knob);
  assert.equal(s.state().views.picker, null);
  s.addon.dynamicMoveSourceTouchDown(s.state().views.knob);
  s.addon.backMoveCommentMenu(s.state().views.knob);
  assert.ok(s.state().views.picker);
});

test('drag commits the exact requested order for every source and destination pair', () => {
  for (let source = 0; source < 7; source++) for (let target = 0; target < 7; target++) {
    const s = setup(); s.choose(source); s.drag(target);
    const expected = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expected.splice(target, 0, expected.splice(source, 1)[0]);
    assert.deepEqual(s.order(), expected, 'source=' + source + ', target=' + target);
    assert.equal(s.nativeMoves.length, source === target ? 0 : 1);
    assert.equal(s.undoGroups.length, source === target ? 0 : 1);
  }
});

for (const phase of [4, 5]) test('cancelled and failed drags never mutate comments: ' + phase, () => {
  const s = setup(); s.choose(0); s.drag(6, phase);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state().targetIndex, s.state().sourceIndex);
});

test('fourteen-comment drags use equal spacing for every source and destination and undo restores the list', () => {
  for (let source = 0; source < 14; source++) {
    for (let target = 0; target < 14; target++) {
      const s = setup();
      s.notes.one.comments = Array.from({ length: 14 }, (_, index) => ({ text: 'item-' + index, type: 'TextNote' }));
      const original = s.order(); s.choose(source);
      const g = s.drag(target, 2), layout = s.state().geometry;
      assert.equal(s.state().targetIndex, target, source + ' -> ' + target);
      if (source !== target) {
        const actualThumb = s.state().views.rail.frame.y + s.state().views.knob.frame.y + 22;
        const expectedThumb = layout.trackTop + target / 13 * (layout.trackBottom - layout.trackTop);
        assert(Math.abs(actualThumb - expectedThumb) < 0.001);
        assert.equal(s.nativeMoves.length, 0);
      }
      g.state = 3; s.addon.dynamicMoveRailPanned(g);
      assert.equal(s.order()[target], 'item-' + source);
      assert.equal(s.nativeMoves.length, source === target ? 0 : 1);
      if (source !== target) s.addon.undoQuickCommentMove(s.state().views.undo);
      assert.deepEqual(s.order(), original);
    }
  }
});

test('last-comment track midpoint previews the middle in tall, edge and constrained layouts', () => {
  for (const options of [
    {},
    { width: 390, height: 844, selectedViews: true, cardFrame: { x: 8, y: 150, width: 300, height: 400 } },
    { width: 390, height: 844, selectedViews: true, cardFrame: { x: 8, y: 200, width: 374, height: 444 } },
  ]) {
    const s = setup(options);
    s.notes.one.comments = Array.from({ length: 14 }, (_, index) => ({ text: 'item-' + index, type: 'TextNote' }));
    s.choose(13);
    const original = s.order();
    const g = s.drag(7, 2), layout = s.state().geometry;
    assert.equal(s.state().targetIndex, 7);
    assert.match(s.state().views.status.text, /8\/14/);
    assert.equal(intersects(s.state().views.rail.frame, layout.card), false);
    const spacing = (layout.trackBottom - layout.trackTop) / 13;
    assert(Math.abs(s.state().views.rail.frame.y + s.state().views.knob.frame.y + 22 - layout.trackTop - 7 * spacing) < 0.001);
    g.state = 4; s.addon.dynamicMoveRailPanned(g);
    assert.deepEqual(s.order(), original);
    assert.equal(s.nativeMoves.length, 0);
    const sender = s.press(-1); s.advance(450); s.release(sender);
    assert.equal(s.state().sourceIndex, 12, 'immediate hold after selecting the last comment must not be cancelled by layout polling');
    s.addon.undoQuickCommentMove(s.state().views.undo);
    assert.deepEqual(s.order(), original);
  }
});

test('horizontal release cancels a previewed destination', () => {
  const s = setup(); s.choose(0); s.drag(5, 3, true);
  assert.equal(s.nativeMoves.length, 0);
  assert.deepEqual(s.order(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('cancelling a long press invalidates future repeat callbacks', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.advance(700); s.addon.dynamicMoveStepCancelled(sender); s.advance(2000); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
});

test('closing during a hold prevents queued callbacks and removes all quick-move views', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.advance(500); s.addon.closeMoveCommentRail(s.state().views.close); s.advance(2000); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state(), null);
  assert.equal(s.addon.dynamicMoveRailView, null);
});

test('losing the current window during a hold prevents a write', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.context.MNUtil.currentWindow = {};
  s.advance(900); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
});

test('scene deactivation closes a held interaction before queued callbacks execute', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.advance(500); s.addon.sceneWillResignActive(); s.advance(2000); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state(), null);
});

test('changing cards discards the old session and ignores its stale close and arrow controls', () => {
  const s = setup(); s.choose(0); const old = s.state(), oldDown = old.views.down, oldClose = old.views.close;
  s.selectCard('two'); s.choose(1); const next = s.state();
  s.addon.dynamicMoveStepBegan(oldDown); s.addon.dynamicMoveStepEnded(oldDown); s.addon.closeMoveCommentRail(oldClose);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state(), next);
});

for (const modification of ['reorder', 'append', 'edit', 'identity', 'wrapper']) test('changed comment data rejects an in-flight move: ' + modification, () => {
  const s = setup(); s.choose(0); const sender = s.press();
  if (modification === 'reorder') s.notes.one.comments.reverse();
  if (modification === 'append') s.notes.one.comments.push({ text: 'H', type: 'TextNote' });
  if (modification === 'edit') s.notes.one.comments[0].text = 'edited';
  if (modification === 'identity') s.notes.one.comments[0].noteid = 'replacement-note';
  if (modification === 'wrapper') s.notes.one = { ...s.notes.one, comments: s.notes.one.comments.slice().reverse() };
  s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
});

test('undo reverses only the matching latest move and rejects a changed signature', () => {
  const s = setup(); s.choose(0); s.tap();
  assert.ok(s.state().views.undo, 'retain the JS wrapper carrying the native callback parameters');
  s.addon.undoQuickCommentMove(s.state().views.undo);
  assert.deepEqual(s.order(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  s.tap(); s.notes.one.comments[2].text = 'external edit';
  const count = s.nativeMoves.length;
  s.addon.undoQuickCommentMove(s.state().views.undo);
  assert.equal(s.nativeMoves.length, count);
  assert.equal(s.order()[2], 'external edit');
});

test('successive undo remains available when every native move increments the fold revision', () => {
  const s = setup({ foldRevision: true }); s.choose(0); s.tap(); s.tap();
  const undo = s.state().views.undo;
  assert.equal(undo.frame.width, 44);
  assert.equal(undo.frame.height, 44);
  assert.deepEqual(s.order(), ['B', 'C', 'A', 'D', 'E', 'F', 'G']);
  assert.equal(s.notes.one.foldRevision, 2);
  s.addon.undoQuickCommentMove(undo);
  assert.deepEqual(s.order(), ['B', 'A', 'C', 'D', 'E', 'F', 'G']);
  assert.equal(s.state().history.length, 1);
  assert.equal(s.state().views.undo, undo);
  assert.equal(undo.enabled, true);
  s.addon.undoQuickCommentMove(undo);
  assert.deepEqual(s.order(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.equal(s.notes.one.foldRevision, 4);
  assert.equal(s.nativeMoves.length, 4);
  assert.equal(s.state().history.length, 0);
  assert.equal(s.state().views.undo, undo);
  assert.equal(undo.enabled, false);
});

test('quick-move sessions survive Native object bridging because only their identifier is stored on the addon', () => {
  const s = setup({ nativeBridge: true }); s.choose(0); s.tap(); s.tap();
  assert.equal(s.state().sourceIndex, 2);
  assert.equal(s.nativeMoves.length, 2);
  assert.deepEqual(s.stateObjectWrites, []);
  assert.ok(Object.keys(s.addonTarget).some(key => /move/i.test(key) && typeof s.addonTarget[key] === 'string'));
});

test('phone and tablet layouts keep quick-move surfaces inside host bounds', () => {
  for (const [width, height] of [[320, 600], [375, 240], [768, 1024]]) {
    const s = setup({ width, height }); s.open();
    assert.ok(s.state(), s.hud.join('; '));
    for (const key of ['rail', 'picker']) {
      const frame = s.state().views[key].frame;
      assert(frame.x >= 0 && frame.x + frame.width <= width);
      assert(frame.y >= 0 && frame.y + frame.height <= height);
    }
    s.choose(0); s.drag(5, 2);
    const frame = s.state().views.rail.frame;
    assert(frame.x >= 0 && frame.x + frame.width <= width);
    assert(frame.y >= 0 && frame.y + frame.height <= height);
    assert.equal(intersects(frame, s.state().geometry.card), false);
  }
});

test('edge sidebars expand away from the card and keep the control column fixed in host coordinates', () => {
  for (const [width, cardFrame] of [
    [390, { x: 8, y: 150, width: 300, height: 400 }],
    [390, { x: 82, y: 150, width: 300, height: 400 }],
    [800, { x: 40, y: 120, width: 260, height: 400 }],
    [800, { x: 500, y: 120, width: 260, height: 400 }],
  ]) {
    const s = setup({ width, height: 844, selectedViews: true, cardFrame }); s.choose(3);
    const columnX = s.state().geometry.expanded.x, count = s.host.subviews.length;
    s.drag(5, 2);
    const { sidebar, card, expanded } = s.state().geometry, rail = s.state().views.rail.frame;
    assert([44, 224, 244, 264, 284].includes(sidebar.width));
    assert.equal(rail.x, sidebar.x);
    assert.equal(rail.width, sidebar.width);
    assert(sidebar.x <= expanded.x && sidebar.x + sidebar.width >= expanded.x + expanded.width);
    assert(sidebar.y <= expanded.y && sidebar.y + sidebar.height >= expanded.y + expanded.height);
    assert.equal(intersects(rail, card), false);
    assert.equal(rail.x + s.state().views.knob.frame.x, columnX);
    assert.equal(s.host.subviews.length, count);
    assert.match(textOf(s.state().views.rail), /F/);
    assert.match(textOf(s.state().views.rail), /G/);
  }
});

test('readable sidebar space is reserved before selecting a narrow placement near the screen edge', () => {
  for (const cardFrame of [
    { x: 740, y: 180, width: 220, height: 490 },
    { x: 8, y: 180, width: 220, height: 490 },
    { x: 438, y: 180, width: 220, height: 490 },
  ]) {
    for (const source of [0, 6, 13]) {
      const s = setup({ width: 1024, height: 768, selectedViews: true, cardFrame });
      s.notes.one.comments = Array.from({ length: 14 }, (_, index) => ({ text: 'full-context-' + index, type: 'TextNote' }));
      s.choose(source);
      const g = s.state().geometry, grip = g.rail.y + 66;
      assert(Math.abs(g.trackTop + source / 13 * (g.trackBottom - g.trackTop) - grip) < 0.001, 'source must align to the grip without a pointer offset');
      s.drag(7, 2);
      assert(s.state().views.preview.frame.width >= 180, 'a readable column must be used when blank space exists');
      assert.equal(intersects(s.state().views.rail.frame, cardFrame), false);
      assert.match(textOf(s.state().views.preview), /上方：/);
      assert.match(textOf(s.state().views.preview), /下方：/);
    }
  }
});

test('external controls restrict sidebar growth without losing compact destination content', () => {
  const s = setup(); s.choose(0);
  const normal = s.state().geometry.rail, control = s.context.UIButton.buttonWithType(0);
  control.frame = { x: normal.x + 52, y: normal.y + 88, width: 44, height: 44 };
  control.bounds = { x: 0, y: 0, width: 44, height: 44 };
  control.addTargetActionForControlEvents({}, 'externalControl:', 1 << 6);
  s.host.addSubview(control); s.controller.layout(s.addon);
  s.drag(5, 2);
  const sidebar = s.state().views.rail.frame;
  assert.equal(sidebar.width, 44);
  assert.equal(intersects(sidebar, control.frame), false);
  assert.equal(intersects(sidebar, s.state().geometry.card), false);
  assert.match(textOf(s.state().views.rail), /F/);
  assert.match(textOf(s.state().views.rail), /G/);
  assert.equal(s.nativeMoves.length, 0);
});

test('external controls entering an expanded sidebar shrink it and cancel pending input without moving the rail', () => {
  const s = setup(); s.choose(0); s.drag(5, 2);
  const { rail, card, expanded } = s.state().geometry;
  assert(s.state().views.rail.frame.width > 44);
  const control = s.context.UIButton.buttonWithType(0);
  control.frame = { x: expanded.x + 52, y: expanded.y + 88, width: 44, height: 44 };
  control.bounds = { x: 0, y: 0, width: 44, height: 44 };
  control.addTargetActionForControlEvents({}, 'externalControl:', 1 << 6);
  s.host.addSubview(control); s.controller.layout(s.addon);
  assert.deepEqual(s.state().geometry.rail, rail);
  assert.deepEqual(s.state().geometry.card, card);
  assert.deepEqual(s.state().geometry.expanded, expanded);
  assert.equal(s.state().geometry.sidebar.width, 44);
  assert.equal(s.state().geometry.holdSidebar.width, 44);
  assert.equal(s.state().views.rail.frame.width, 44);
  assert.equal(s.state().views.preview, null);
  assert.equal(s.state().targetIndex, s.state().sourceIndex);
  assert.equal(s.nativeMoves.length, 0);
  s.drag(5, 2);
  assert.equal(s.state().views.rail.frame.width, 44);
  assert.equal(intersects(s.state().views.rail.frame, control.frame), false);
});

test('selected child-card views open without a flat node entry and follow card movement while cancelling in-flight input', () => {
  const s = setup({ selectedViews: true });
  assert.equal(s.mindmap.mindmapNodes.some(node => node.note.noteId === 'one'), false);
  const selected = s.mindmap.selViewLst[0];
  assert.equal(selected.note.note.noteId, 'one');
  assert.equal(selected.view.superview, s.host);
  s.open(); assert.ok(s.state(), s.hud.join('; ')); s.choose(0);
  const oldRail = { ...s.state().geometry.rail }, sender = s.press();
  s.advance(600); assert(s.state().targetIndex > 0);
  selected.view.frame = { ...selected.view.frame, x: 140, y: 140 };
  s.controller.layout(s.addon);
  assert.equal(s.state().geometry.card.x, 140);
  assert.equal(s.state().geometry.card.y, 140);
  assert.notDeepEqual(s.state().geometry.rail, oldRail);
  s.advance(1000); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
  assert.equal(s.state().targetIndex, s.state().sourceIndex);
});

test('nearly full-width phone cards keep above-or-below expanded tracks outside the card', () => {
  const s = setup({ width: 390, height: 844, selectedViews: true, cardFrame: { x: 8, y: 240, width: 374, height: 300 } });
  s.choose(3);
  const intersects = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
  const { card, rail, expanded } = s.state().geometry;
  assert(rail.y + rail.height <= card.y || rail.y >= card.y + card.height, 'the normal rail must be above or below a nearly full-width card');
  assert.equal(intersects(expanded, card), false);
  s.drag(0, 2);
  assert.equal(s.state().targetIndex, 0);
  assert.equal(intersects(s.state().views.rail.frame, card), false);
  s.addon.dynamicMoveStepCancelled(s.state().views.up);
  s.drag(6, 2);
  assert.equal(s.state().targetIndex, 6);
  assert.equal(intersects(s.state().views.rail.frame, card), false);
  assert.equal(s.nativeMoves.length, 0);
});

test('limited vertical space falls back to a 176-point rail with working holds, undo and a reachable close', () => {
  const s = setup({ width: 390, height: 844, selectedViews: true, cardFrame: { x: 8, y: 200, width: 374, height: 444 } });
  s.open(); assert.ok(s.state(), s.hud.join('; ')); s.choose(3);
  assert.equal(s.state().geometry.compactControls, true);
  assert.equal(s.state().geometry.rail.height, 176);
  assert.equal(s.state().views.rail.frame.height, 176);
  assert.equal(intersects(s.state().views.rail.frame, s.state().geometry.card), false);
  assert.equal(s.state().views.undo.frame.width, 44);
  assert.equal(s.state().views.undo.frame.height, 44);
  assert.equal(s.state().views.close.hidden, true);
  for (const direction of [1, -1]) {
    s.choose(3);
    const source = s.state().sourceIndex, sender = direction > 0 ? s.state().views.down : s.state().views.up;
    const before = { x: s.state().views.rail.frame.x + sender.frame.x, y: s.state().views.rail.frame.y + sender.frame.y };
    s.press(direction); s.advance(500);
    assert.equal(sender.hidden, false);
    assert.equal(s.state().views.rail.frame.x + sender.frame.x, before.x);
    assert.equal(s.state().views.rail.frame.y + sender.frame.y, before.y);
    assert.equal(s.state().targetIndex, source + direction);
    s.release(sender);
    assert.equal(s.state().sourceIndex, source + direction);
    assert.equal(s.state().views.close.hidden, true);
  }
  assert.equal(s.nativeMoves.length, 2);
  s.addon.dynamicMoveSourceTouchDown(s.state().views.knob);
  s.addon.backMoveCommentMenu(s.state().views.knob);
  const close = s.state().views.pickerClose;
  assert.ok(close.events.some(event => event.selector === 'closeMoveCommentRail:' && event.mask === 64));
  s.addon.closeMoveCommentRail(close);
  assert.equal(s.state(), null);
});

test('expanded drag track avoids external buttons above and below the normal rail while retaining both endpoints', () => {
  const s = setup(); s.choose(3);
  const initial = s.state().geometry, normal = initial.rail;
  const intersects = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
  const obstacles = [normal.y - 53, normal.y + normal.height + 9].map(y => {
    const button = s.context.UIButton.buttonWithType(0);
    button.frame = { x: normal.x, y, width: 44, height: 44 };
    button.bounds = { x: 0, y: 0, width: 44, height: 44 };
    button.addTargetActionForControlEvents({}, 'externalAction:', 1 << 6);
    s.host.addSubview(button);
    assert.equal(intersects(normal, button.frame), false, 'fixture must leave the normal rail unobstructed');
    return button.frame;
  });
  s.controller.layout(s.addon);
  s.drag(0, 2);
  const expanded = s.state().views.rail.frame;
  assert.equal(s.state().targetIndex, 0);
  assert(obstacles.every(obstacle => !intersects(expanded, obstacle)));
  s.addon.dynamicMoveStepCancelled(s.state().views.up);
  s.drag(6, 2);
  assert.equal(s.state().targetIndex, 6);
  assert(obstacles.every(obstacle => !intersects(s.state().views.rail.frame, obstacle)));
  assert.equal(s.nativeMoves.length, 0);
});

test('silent native no-op and thrown writes cannot report a successful move', () => {
  for (const fail of [() => {}, () => { throw new Error('native write failed'); }]) {
    const s = setup(); s.choose(0); s.notes.one.moveComment = fail; s.tap();
    assert.deepEqual(s.order(), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    assert.equal(s.state(), null);
    assert.ok(s.hud.length > 0);
  }
});

test('original main-panel batch mutation preserves its insertion and selection semantics', () => {
  const s = setup();
  const result = s.context.__MN_COMMENT_MUTATIONS__.moveComments('one', [0, 2], 5);
  assert.deepEqual(s.order(), ['B', 'D', 'E', 'A', 'C', 'F', 'G']);
  assert.deepEqual(Array.from(result.selectedIndices), [3, 4]);
  assert.equal(s.state(), null);
});

test('host resizing cancels in-flight input and notebook close cleans up the session', () => {
  const s = setup(); s.choose(0); const sender = s.press();
  s.host.bounds.width = 480; s.controller.layout(s.addon); s.advance(900); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
  if (s.state()) {
    const rail = s.state().views.rail.frame;
    assert(rail.x >= 0 && rail.x + rail.width <= 480);
  }
  s.selectCard(); s.choose(1); s.addon.notebookWillClose();
  assert.equal(s.state(), null);
});

test('production floating layout honors every button combination and order after live changes', () => {
  const s = setup(), ids = ['management', 'add', 'move'];
  const properties = ['dynamicCommentButton', 'dynamicAddCommentButton', 'dynamicMoveCommentButton'];
  const keys = ['showManagementButton', 'showQuickCommentButton', 'showMoveCommentButton'];
  const permutations = ids.flatMap(first => ids.filter(id => id !== first).map(second => [first, second, ids.find(id => id !== first && id !== second)]));
  for (const order of permutations) for (let mask = 0; mask < 8; mask++) {
    s.settings.dynamicButtonOrder = order;
    keys.forEach((key, index) => { s.settings[key] = !!(mask & (1 << index)); });
    s.actions.beginInteraction(s.addon);
    s.actions.refreshButtons(s.addon);
    const visible = properties.filter(property => !s.addon[property].hidden).sort((a, b) => s.addon[a].frame.x - s.addon[b].frame.x);
    assert.deepEqual(visible, order.filter(id => s.settings[keys[ids.indexOf(id)]]).map(id => properties[ids.indexOf(id)]));
    properties.forEach(property => {
      assert.equal(s.addon[property].enabled, visible.includes(property));
      assert.equal(s.addon[property].userInteractionEnabled, visible.includes(property));
    });
    visible.forEach((property, index) => {
      assert.equal(s.addon[property].frame.x, s.addon[visible[0]].frame.x + index * 48);
      assert(s.addon[property].frame.x >= 0);
      assert(s.addon[property].frame.x + 44 <= s.host.bounds.width);
    });
  }
});

test('disabling the move button cancels pending holds and blocks delayed native selectors', () => {
  const s = setup(), before = s.order(); s.choose(1);
  const sender = s.press(); s.advance(500);
  s.settings.showMoveCommentButton = false;
  s.actions.refreshButtons(s.addon);
  assert.equal(s.state(), null);
  assert.equal(s.addon.dynamicMoveCommentButton.hidden, true);
  assert.equal(s.open(), false);
  s.advance(1000); s.release(sender);
  assert.equal(s.nativeMoves.length, 0);
  assert.deepEqual(s.order(), before);
  s.settings.enableDynamicSingleCardButton = false;
  assert.equal(s.open(), false);
});

test('large cards retain floating buttons while the native menu remains unobstructed', () => {
  const s = setup(), bounds = s.host.bounds;
  const menu = new s.context.UIView({ x: 100, y: 10, width: 280, height: 40 });
  menu.visible = true; menu.targetWinRect = { x: 0, y: 0, width: bounds.width, height: bounds.height };
  s.host.addSubview(menu); s.context.PopupMenu = { currentMenu: () => menu };
  s.actions.hideButton(s.addon, 'large-card.reset');
  s.actions.handlePopupMenuOnNote(s.addon, { userInfo: { noteId: 'one', winRect: menu.targetWinRect } });
  s.advance(400);
  assert.equal(s.addon.dynamicCommentButton.hidden, false, 'deferred layout must retain the large-card fallback');
  for (const view of [s.addon.dynamicCommentButton, s.addon.dynamicAddCommentButton, s.addon.dynamicMoveCommentButton]) {
    assert(!intersects(view.frame, menu.frame), 'card-edge fallback must still avoid the native menu');
    assert(view.frame.x >= 0 && view.frame.x + 44 <= bounds.width);
    assert(view.frame.y >= 0 && view.frame.y + 44 <= bounds.height);
  }
});

test('current click geometry outranks a previous popup target', () => {
  const s = setup(), bounds = s.host.bounds;
  s.context.PopupMenu = { currentMenu: () => ({ targetWinRect: { ...bounds }, frame: { x: 10, y: 10, width: 280, height: 40 } }) };
  const clicked = { x: 200, y: 200, width: 80, height: 40 };
  s.actions.handlePopupMenuOnNote(s.addon, { userInfo: { noteId: 'one', winRect: clicked } });
  s.advance(400);
  assert.deepEqual(JSON.parse(JSON.stringify(s.addon.dynamicCommentContext.anchorRect)), clicked);
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
});

test('a popup created after the notification can supply a missing anchor', () => {
  const s = setup(); let popup = null;
  s.context.PopupMenu = { currentMenu: () => popup };
  assert.equal(s.actions.handlePopupMenuOnNote(s.addon, { userInfo: { noteId: 'one' } }), true);
  assert(s.addon.dynamicCommentContext, 'retain the card while geometry is pending');
  s.advance(30);
  popup = { visible: true, targetWinRect: { x: 200, y: 200, width: 100, height: 40 }, frame: { x: 200, y: 140, width: 280, height: 40 } };
  s.advance(100);
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
});

test('replaced-menu close notifications do not clear a currently visible popup', () => {
  const s = setup();
  const popup = { visible: true, targetWinRect: { x: 100, y: 110, width: 120, height: 50 }, frame: { x: 100, y: 50, width: 280, height: 40 } };
  s.context.PopupMenu = { currentMenu: () => popup };
  s.actions.handlePopupMenuClosed(s.addon); s.advance(200);
  assert(s.addon.dynamicCommentContext);
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
  popup.visible = false;
  s.actions.handlePopupMenuClosed(s.addon); s.advance(200);
  assert.equal(s.addon.dynamicCommentContext, null);
});

test('the shared layout path never walks card or mindmap content to find external controls', () => {
  const s = setup(); let reads = 0;
  const content = new s.context.UIView({ ...s.host.bounds }); content.className = 'MindmapView';
  Object.defineProperty(content, 'subviews', { get() { reads++; return []; } });
  s.host.addSubview(content); s.actions.disposeButton(s.addon, 'first-reveal.reset'); s.selectCard();
  assert.equal(reads, 0, 'legacy recursive scans must not precede the bounded shared layout');
});

test('visible-panel sync runs after floating reveal and cannot prevent button activation', () => {
  const s = setup(); let syncs = 0;
  s.addon.webController = { view: { window: s.addon.window, hidden: false } };
  s.context.__MN_BATCH_COMMENT_ACTIONS__ = { hideButton() {} };
  s.context.__MN_WEB_API_MNCommentManagerAddon = { syncCurrentNote() { syncs++; throw new Error('test snapshot failure'); } };
  s.actions.hideButton(s.addon, 'initial-reveal.reset');
  s.addon.onPopupMenuOnNote({ userInfo: { noteId: 'one', winRect: { x: 100, y: 110, width: 120, height: 50 } } });
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
  assert.equal(syncs, 0, 'snapshot serialization must not run in the notification call');
  s.advance(100);
  assert.equal(syncs, 1);
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
});

test('switching cards dismisses the previous action menu before revealing the new buttons', () => {
  const s = setup(); let dismissed = 0;
  const previous = { dismissPopoverAnimated() { dismissed++; s.actions.handleMenuDismissed(s.addon, previous); } };
  s.addon.dynamicCommentMenuPopoverController = previous;
  s.addon.dynamicCommentMenuAnchor = s.addon.dynamicAddCommentButton;
  s.actions.handlePopupMenuOnNote(s.addon, { userInfo: { noteId: 'two', winRect: { x: 300, y: 200, width: 100, height: 50 } } });
  assert.equal(dismissed, 1);
  assert.equal(s.addon.dynamicCommentMenuPopoverController, null);
  assert.equal(s.addon.dynamicCommentMenuAnchor, null);
  assert.equal(s.addon.dynamicCommentContext.noteId, 'two');
  assert.equal(s.addon.dynamicCommentButton.hidden, false);
  s.actions.handleMenuDismissed(s.addon, previous); s.advance(400);
  assert.equal(s.addon.dynamicCommentContext.noteId, 'two', 'a late delegate cannot clear the new card');
});

if (failures.length) throw new AggregateError(failures.map(failure => failure.error), failures.length + ' of ' + cases + ' quick-move integration cases failed');
console.log('Comment quick-move integration: ' + cases + ' cases passed');
