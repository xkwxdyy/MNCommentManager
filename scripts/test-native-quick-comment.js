const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { setup } = require('./test-quick-comment');

function fixture(platform = 'iphone', wrapActions = null) {
  const s = setup();
  s.api.dispose(s.addon); s.timers.length = 0;
  const root = s.context;
  class View {
    constructor(frame = { x: 0, y: 0, width: 900, height: 600 }) {
      this.frame = frame; this.layer = { removeAllAnimations() {} }; this.subviews = []; this.text = '';
    }
    get bounds() { return { x: 0, y: 0, width: this.frame.width, height: this.frame.height }; }
    addSubview(view) { this.subviews.push(view); view.superview = this; }
    removeFromSuperview() { this.superview = null; }
    endEditing() {}
    convertRectFromView(rect) { return rect; }
    setTitleForState(text) { this.title = text; }
    setTitleColorForState() {}
    addTargetActionForControlEvents(controller, selector, events) { this.target = controller; this.selector = selector; this.events = events; }
    addGestureRecognizer(gesture) { gesture.view = this; this.gestureRecognizers = (this.gestureRecognizers || []).concat(gesture); }
  }
  class Button extends View {
    constructor() { super(); this.titleLabel = {}; }
    static buttonWithType() { return new Button(); }
  }
  class TextView extends View {
    static new() { return new TextView(); }
    becomeFirstResponder() { this.firstResponder = true; s.events.push('native-focus'); return true; }
    resignFirstResponder() {
      if (this.finalComposition !== undefined) { this.text = this.finalComposition; delete this.finalComposition; s.change(); }
      this.firstResponder = false;
      if (this.delegate && this.delegate.callbacks.textViewDidEndEditing) {
        root.self = this.delegate; this.delegate.callbacks.textViewDidEndEditing(this);
      }
      return true;
    }
    isFirstResponder() { return !!this.firstResponder; }
  }
  View.animateWithDurationDelayOptionsAnimationsCompletion = root.UIView.animateWithDurationDelayOptionsAnimationsCompletion;
  root.UIView = View; root.UIScrollView = View; root.UILabel = View; root.UIButton = Button; root.UITextView = TextView;
  root.UIPanGestureRecognizer = class { constructor(target, selector) { this.target = target; this.selector = selector; } };
  root.UIColor = { clearColor: () => 'clear', whiteColor: () => 'white' };
  root.UIFont = { systemFontOfSize: size => size, boldSystemFontOfSize: size => size };
  root.MNUtil.hexColorAlpha = (hex, alpha) => ({ hex, alpha });
  root.MNUtil.isIOS = () => platform === 'iphone'; root.MNUtil.isIPadOS = () => platform === 'ipad';
  root.JSB.defineClass = (name, members) => {
    s.nativeBindings = members;
    return { new() { return { view: new View(), callbacks: members }; } };
  };
  vm.runInContext(fs.readFileSync(`${process.env.MNCM_RUNTIME_DIR || 'src'}/NativeQuickCommentController.js`, 'utf8'), root);
  s.native = root.__MN_NATIVE_QUICK_COMMENT_MNCommentManagerAddon;
  if (wrapActions) {
    const create = s.native.create;
    s.native.create = actions => create(wrapActions(actions));
  }
  const observers = new Set();
  root.NSNotificationCenter = { defaultCenter: () => ({
    addObserverSelectorName(controller, selector, name) { assert.equal(selector, 'mncmQuickKeyboardChanged:'); observers.add(name); },
    removeObserver() { observers.clear(); }
  }) };
  s.addon.window.keyWindow = 1; s.addon.window.screen = {};
  s.addon.window.convertRectFromWindow = rect => rect;
  s.controller = s.open();
  s.click = name => { root.self = s.controller; s.nativeBindings[name](); };
  s.change = () => s.click('textViewDidChange');
  s.input = () => s.native.input(s.controller);
  s.panel = () => s.native.panel(s.controller);
  s.state = () => s.api.getState(s.controller);
  s.flush = () => { while (s.timers.length) s.timers.shift()(); };
  s.notify = (type, rect, extra = {}) => {
    root.self = s.controller;
    s.nativeBindings.mncmQuickKeyboardChanged({ name: `UIKeyboard${type}Notification`,
      userInfo: { UIKeyboardFrameEndUserInfoKey: rect, ...extra } });
  };
  s.observers = observers;
  return s;
}
const nativeLayoutScenarios = [
  { id: 'portrait-docked', bounds: { width: 768, height: 900 }, keyboard: { x: 0, y: 590, width: 768, height: 310 } },
  { id: 'landscape-docked', bounds: { width: 1194, height: 500 }, keyboard: { x: 0, y: 220, width: 1194, height: 280 } },
  { id: 'split-narrow-docked', bounds: { width: 420, height: 600 }, keyboard: { x: 0, y: 340, width: 420, height: 260 } },
  { id: 'compact-accessory', bounds: { width: 900, height: 260 }, keyboard: { x: 0, y: 200, width: 900, height: 60 } },
  { id: 'floating-above', bounds: { width: 900, height: 600 }, keyboard: { x: 300, y: 100, width: 320, height: 180 } },
  { id: 'floating-below', bounds: { width: 900, height: 600 }, keyboard: { x: 300, y: 300, width: 320, height: 180 } },
  { id: 'floating-partly-offscreen', bounds: { width: 900, height: 600 }, keyboard: { x: 300, y: -30, width: 320, height: 200 } },
  { id: 'floating-no-horizontal-overlap', bounds: { width: 1000, height: 300 }, keyboard: { x: 0, y: 80, width: 180, height: 180 } },
  { id: 'floating-tall-center', bounds: { width: 1000, height: 300 }, keyboard: { x: 400, y: 50, width: 180, height: 220 } },
  { id: 'split-floating-narrow-side', bounds: { width: 600, height: 320 }, keyboard: { x: 200, y: 30, width: 180, height: 260 } },
  { id: 'landscape-floating-left', bounds: { width: 900, height: 500 }, keyboard: { x: 0, y: 120, width: 280, height: 260 } },
  { id: 'landscape-floating-outside-panel', bounds: { width: 900, height: 500 }, keyboard: { x: 870, y: 120, width: 280, height: 260 } },
];
const cases = [];
function test(name, fn) {
  if (require.main !== module) return;
  if (process.env.MNCM_NATIVE_CASE && !name.includes(process.env.MNCM_NATIVE_CASE)) return;
  fn(); cases.push(name);
}

for (const platform of ['iphone', 'ipad']) test(`${platform}: native input, draft, close and reopen`, () => {
  const s = fixture(platform);
  assert(s.controller._mncmNativeQuickId);
  assert.equal(s.controller.webView, undefined, 'mobile input must never create a WebView');
  assert.equal(s.input().firstResponder, true);
  assert.deepEqual(Array.from(s.observers).sort(), ['UIKeyboardWillShowNotification', 'UIKeyboardDidShowNotification', 'UIKeyboardWillHideNotification', 'UIKeyboardDidHideNotification', 'UIKeyboardWillChangeFrameNotification'].sort());
  s.input().text = '中文草稿\n第二行'; s.change();
  assert.equal(s.state().draft, '中文草稿\n第二行');
  s.click('mncmNativeClose'); s.flush(); assert.equal(s.addon.quickCommentController, null);
  s.controller = s.open(); assert.equal(s.input().text, '中文草稿\n第二行');
  assert.equal(s.input().accessibilityLabel, '评论内容');
});
test('macOS keeps the original WebView path', () => {
  const s = fixture('mac');
  assert.equal(s.controller._mncmNativeQuickId, undefined); assert(s.controller.webView);
  assert.equal(s.observers.size, 3); assert(!s.events.includes('native-focus'));
});
test('Chinese composition is committed before sending, duplicate taps append once', () => {
  const s = fixture();
  s.input().text = 'zhong'; s.change(); s.input().finalComposition = '中文最终正文';
  s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.a.comments[1].text, '中文最终正文');
  assert.equal(s.addon.quickCommentController, null);
  s.controller = s.open(); assert.equal(s.input().text, '', 'successful send opens an empty next draft');
});
test('closing commits composition and retains the final draft', () => {
  const s = fixture(); s.input().text = 'zu'; s.change(); s.input().finalComposition = '组词结果';
  s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
  assert.equal(s.input().text, '组词结果'); assert.equal(s.a.comments.length, 1);
});
test('Markdown preference persists and is used for the saved comment', () => {
  const s = fixture('ipad'); s.input().text = '**正文**'; s.change();
  s.click('mncmNativeMarkdown'); assert.equal(s.state().markdown, true);
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments[1].markdown, true);
  s.controller = s.open(); assert.equal(s.state().markdown, true);
});
test('failed save retains editable text; retry appends only once', () => {
  const s = fixture(); s.input().text = '失败后保留'; s.change(); s.appendError(true);
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.input().editable, true); assert.equal(s.input().text, '失败后保留'); assert.equal(s.a.comments.length, 1);
  s.appendError(false); s.click('mncmNativeSubmit'); s.flush(); assert.equal(s.a.comments.length, 2);
});
test('uncertain save locks editing and confirms the same submission without reappending', () => {
  const s = fixture(); s.input().text = '只追加一次'; s.change(); s.saveError(true);
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.input().editable, false); assert.equal(s.a.comments.length, 2);
  s.click('mncmNativeMarkdown'); assert.equal(s.state().markdown, false);
  s.click('mncmNativeSubmit'); s.flush(); assert.equal(s.a.comments.length, 2);
  s.saveError(false); s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.addon.quickCommentController, null);
});
test('edits after a failed submission survive reopening instead of reverting to the old attempt', () => {
  const s = fixture(); s.input().text = '原提交'; s.change(); s.appendError(true);
  s.click('mncmNativeSubmit'); s.flush();
  s.input().text = '失败后修改的正文'; s.change(); s.click('mncmNativeClose'); s.flush();
  s.controller = s.open(); assert.equal(s.input().text, '失败后修改的正文');
});
test('uncertain submission survives closing and reopening', () => {
  const s = fixture(); s.input().text = '待核对'; s.change(); s.saveError(true);
  s.click('mncmNativeSubmit'); s.flush(); s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
  assert.equal(s.input().text, '待核对'); assert.equal(s.input().editable, false);
  s.saveError(false); s.click('mncmNativeSubmit'); s.flush(); assert.equal(s.a.comments.length, 2);
});
test('newline replaces the selection after completing composition and retains the draft', () => {
  const s = fixture(); s.input().text = 'abc'; s.input().selectedRange = { location: 1, length: 1 }; s.change();
  s.click('mncmNativeNewline'); s.flush();
  assert.equal(s.input().text, 'a\nc'); assert.equal(s.state().draft, 'a\nc');
  assert.equal(s.input().selectedRange.location, 2); assert.equal(s.input().firstResponder, true);
});
test('owned keyboard dismissal closes with the latest composition; frames avoid the keyboard', () => {
  const s = fixture();
  s.notify('WillShow', { x: 0, y: 370, width: 900, height: 230 });
  const panel = s.panel().frame; assert(panel.y + panel.height <= 370);
  s.notify('WillChangeFrame', { x: 0, y: 320, width: 900, height: 280 });
  assert(s.panel().frame.y + s.panel().frame.height <= 320);
  s.input().text = '草稿'; s.input().finalComposition = '关闭前最终草稿';
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 230 }); s.flush();
  assert.equal(s.addon.quickCommentController, null); assert.equal(s.observers.size, 0);
  s.controller = s.open(); assert.equal(s.input().text, '关闭前最终草稿');
});
test('iPad keyboard geometry remains safe when WillShow arrives before first responder confirmation', () => {
  const s = fixture('ipad'), shown = { x: 0, y: 320, width: 900, height: 280 };
  s.input().firstResponder = false;
  s.notify('WillShow', shown);
  assert(s.panel().frame.y + s.panel().frame.height <= shown.y, 'geometry cannot wait for first responder ownership');
  s.input().firstResponder = true;
  s.notify('DidShow', shown);
  s.input().text = '焦点确认后保留草稿'; s.change();
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 280 }); s.flush();
  assert.equal(s.addon.quickCommentController, null, 'DidShow must confirm keyboard ownership for dismissal');
  s.controller = s.open(); assert.equal(s.input().text, '焦点确认后保留草稿');
});
test('a keyboard frame transition can establish native ownership without another WillShow', () => {
  const s = fixture('ipad');
  s.notify('WillChangeFrame', { x: 0, y: 330, width: 900, height: 270 });
  assert(s.panel().frame.y + s.panel().frame.height <= 330);
  s.input().text = '已有键盘切换到评论输入'; s.change();
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 270 }); s.flush();
  assert.equal(s.addon.quickCommentController, null, 'a visible owned keyboard must still close the input');
  s.controller = s.open(); assert.equal(s.input().text, '已有键盘切换到评论输入');
});
for (const confirmedAt of ['WillShow', 'DidShow']) test(`a refocused keyboard confirmed at ${confirmedAt} does not inherit suppression from an unowned programmatic dismissal`, () => {
  const s = fixture('ipad'), shown = { x: 0, y: 320, width: 900, height: 280 };
  s.input().firstResponder = false; s.notify('WillShow', shown);
  s.input().firstResponder = true; s.input().text = '焦点确认前保存失败仍保留'; s.change();
  s.appendError(true); s.click('mncmNativeSubmit'); s.flush();
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 280 });
  s.notify('DidHide', { x: 0, y: 600, width: 900, height: 280 });
  s.input().firstResponder = confirmedAt === 'WillShow'; s.notify('WillShow', shown);
  s.input().firstResponder = true; s.notify('DidShow', shown);
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 280 }); s.flush();
  assert.equal(!!s.addon.quickCommentController, false, 'the next user dismissal must close instead of consuming an old suppression flag');
  s.controller = s.open(); assert.equal(s.input().text, '焦点确认前保存失败仍保留');
});
test('native keyboard frames convert from screen to the content below the host capsule', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 100, width: 900, height: 500 };
  s.addon.window.convertRectFromWindow = rect => ({ ...rect, y: rect.y - 40 });
  s.controller.view.convertRectFromView = rect => ({ ...rect, y: rect.y - s.controller.view.frame.y });
  s.notify('DidShow', { x: 0, y: 470, width: 900, height: 270 });
  assert(s.panel().frame.y + s.panel().frame.height <= 330, 'screen frame must traverse window and content coordinate systems');
  s.notify('WillChangeFrame', { x: 400, y: 200, width: 300, height: 200 });
  assert(s.panel().frame.y >= 260, 'a floating keyboard with more space below must put the complete panel below it');
  assert(s.panel().frame.y + s.panel().frame.height <= 500);
});
test('an absent or malformed keyboard frame cannot remove active keyboard avoidance', () => {
  const s = fixture('ipad');
  s.notify('WillShow', { x: 0, y: 320, width: 900, height: 280 });
  for (const rect of [undefined, { x: 0, y: NaN, width: 900, height: 280 }]) {
    s.notify('WillChangeFrame', rect);
    assert(s.panel().frame.y + s.panel().frame.height <= 320, 'only a valid new frame may replace known keyboard geometry');
  }
});
test('a keyboard outside the current split-view content does not move the native panel', () => {
  const s = fixture('ipad'), initial = { ...s.panel().frame };
  s.notify('WillChangeFrame', { x: 950, y: 100, width: 300, height: 200 });
  assert.deepEqual({ ...s.panel().frame }, initial);
  s.notify('DidShow', { x: 0, y: 300, width: 900, height: 300 }, { UIKeyboardIsLocalUserInfoKey: false });
  assert.deepEqual({ ...s.panel().frame }, initial, 'nonlocal keyboard notifications must not affect geometry');
});
test('a short local keyboard accessory bar cannot cover the native input in a compact iPad window', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 0, width: 900, height: 260 };
  s.native.layout(s.controller);
  const keyboard = { x: 0, y: 200, width: 900, height: 60 };
  assert(s.panel().frame.y + s.panel().frame.height > keyboard.y, 'fixture must overlap before the keyboard frame is delivered');
  s.notify('WillChangeFrame', keyboard);
  assert(s.panel().frame.y + s.panel().frame.height <= keyboard.y, 'a visible accessory bar is an obstruction even when its height is below 80 points');
  assert(s.input().frame.height >= 40, 'compact avoidance keeps a readable native text area');
});
test('a save error keeps the native submit and close controls visible above a compact iPad keyboard', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 0, width: 900, height: 400 };
  s.notify('WillChangeFrame', { x: 0, y: 200, width: 900, height: 200 });
  s.input().text = '紧凑窗口失败后保留草稿'; s.change(); s.appendError(true);
  s.click('mncmNativeSubmit'); s.flush();
  const controls = s.panel().subviews, submit = controls.find(view => view.selector === 'mncmNativeSubmit');
  const close = controls.find(view => view.selector === 'mncmNativeClose');
  const error = controls.find(view => String(view.text).includes('append failed'));
  assert(error, 'the error must remain available with the preserved draft');
  assert(submit.frame.y + submit.frame.height <= s.panel().frame.height, 'retry cannot require discovering a hidden outer scroll after a failed save');
  assert(close.frame.y + close.frame.height <= s.panel().frame.height, 'close remains initially reachable');
  assert(error.frame.y + error.frame.height <= s.panel().frame.height, 'the visible error must share the available compact layout');
  s.appendError(false); s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
  assert.equal(s.input().text, '紧凑窗口失败后保留草稿');
});
test('a floating keyboard beside the default panel does not shrink or displace it', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 0, width: 1000, height: 300 };
  s.native.layout(s.controller); const initial = { ...s.panel().frame };
  s.native.keyboard(s.controller, { type: 'frame' }, { x: 0, y: 80, width: 180, height: 180 });
  assert.deepEqual({ ...s.panel().frame }, initial, 'a keyboard with no horizontal overlap must leave the usable input area intact');
});
test('a tall floating keyboard uses available side space before clipping native actions', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 0, width: 1000, height: 300 };
  s.native.keyboard(s.controller, { type: 'frame' }, { x: 400, y: 50, width: 180, height: 220 });
  const panel = s.panel();
  assert(panel.frame.width >= 204 && panel.frame.height >= 194, 'side space can fit the existing controls while top/bottom space cannot');
  for (const view of panel.subviews.filter(view => view.selector)) assert(view.frame.x >= 0 && view.frame.x + view.frame.width <= panel.frame.width && view.frame.y + view.frame.height <= panel.frame.height, 'input actions must be initially reachable');
  assert(s.input().frame.height >= 40);
});
test('iPad keyboard bands avoid docked and floating frames without changing text or selection', () => {
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const { bounds, keyboard } of nativeLayoutScenarios) {
    const s = fixture('ipad');
    s.controller.view.frame = { x: 0, y: 0, ...bounds };
    s.native.layout(s.controller); const unobstructed = { ...s.panel().frame };
    const text = '较长中文草稿\n'.repeat(80), selection = { location: text.length - 3, length: 2 };
    s.input().text = text; s.input().selectedRange = { ...selection }; s.change();
    s.native.keyboard(s.controller, { type: 'frame' }, keyboard);
    assert.equal(intersects(s.panel().frame, keyboard), false, JSON.stringify({ bounds, keyboard }));
    assert.equal(s.input().text, text); assert.deepEqual(s.input().selectedRange, selection);
    const panel = s.panel();
    for (const view of panel.subviews.filter(view => view.selector)) assert(view.frame.y + view.frame.height <= panel.contentSize.height, 'every action remains in scrollable content');
    s.native.keyboard(s.controller, { type: 'frame' }, { x: bounds.width + 50, y: 0, width: 320, height: 200 });
    assert.deepEqual({ ...s.panel().frame }, unobstructed, 'a keyboard moved outside this split-view area cannot leave stale avoidance');
    s.native.keyboard(s.controller, { type: 'frame' }, null);
    assert.deepEqual({ ...s.panel().frame }, unobstructed);
  }
});
test('each rotation split-view and floating keyboard transition preserves drafts and submits once after reopening', () => {
  const s = fixture('ipad'); s.click('mncmNativeMarkdown');
  for (const [index, scene] of nativeLayoutScenarios.entries()) {
    const text = scene.id + '\n' + '中文草稿与换行\n'.repeat(50), selection = { location: text.length - 6, length: 3 };
    s.input().text = text; s.input().selectedRange = { ...selection }; s.change();
    s.controller.view.frame = { x: 0, y: 0, ...scene.bounds };
    s.native.keyboard(s.controller, { type: 'frame' }, scene.keyboard);
    assert.equal(s.input().text, text, scene.id); assert.deepEqual(s.input().selectedRange, selection, scene.id);
    assert.equal(s.state().draft, text); assert.equal(s.state().markdown, true);
    const panel = s.panel();
    for (const view of panel.subviews.filter(view => view.selector)) assert(view.frame.x >= 0 && view.frame.x + view.frame.width <= panel.frame.width && view.frame.y + view.frame.height <= panel.frame.height, scene.id + ' must expose every native action');
    assert(s.input().frame.height >= 40);
    s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
    assert.equal(s.input().text, text, scene.id + ' draft must survive a real controller close/reopen');
    assert.equal(s.state().markdown, true);
    s.controller.view.frame = { x: 0, y: 0, ...scene.bounds };
    s.native.keyboard(s.controller, { type: 'frame' }, scene.keyboard);
    s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit'); s.flush();
    assert.equal(s.a.comments.length, index + 2); assert.equal(s.a.comments[index + 1].text, text);
    assert.equal(s.a.comments[index + 1].markdown, true); assert.equal(s.b.comments.length, 1);
    s.controller = s.open(); assert.equal(s.input().text, ''); assert.equal(s.state().markdown, true);
  }
  assert.equal(s.a.comments[0].text, 'original');
});
test('keyboard avoidance restores a user-resized height after floating and docked transitions', () => {
  const s = fixture('ipad'), gesture = { state: 1, translationInView: () => ({ x: 0, y: 0 }) };
  s.context.self = s.controller; s.nativeBindings.mncmNativeResize(gesture);
  gesture.state = 2; gesture.translationInView = () => ({ x: 0, y: -140 }); s.nativeBindings.mncmNativeResize(gesture);
  gesture.state = 3; s.nativeBindings.mncmNativeResize(gesture);
  assert.equal(s.panel().frame.height, 460);
  s.controller.view.frame = { x: 0, y: 0, width: 900, height: 500 };
  s.native.keyboard(s.controller, { type: 'frame' }, { x: 0, y: 120, width: 280, height: 260 });
  assert.equal(s.panel().frame.height, 460, 'side space preserves the requested height');
  s.native.keyboard(s.controller, { type: 'frame' }, { x: 0, y: 200, width: 900, height: 300 });
  assert.equal(s.panel().frame.height, 176);
  s.native.keyboard(s.controller, { type: 'frame' }, null);
  assert.equal(s.panel().frame.height, 460, 'temporary avoidance cannot replace the requested height');
  s.controller.view.frame = { x: 0, y: 0, width: 900, height: 600 }; s.native.layout(s.controller);
  s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
  assert.equal(s.panel().frame.height, 460);
});
test('an extremely short keyboard area retains scrollable actions and a reachable draft-preserving close', () => {
  const s = fixture('ipad');
  s.controller.view.frame = { x: 0, y: 0, width: 900, height: 200 };
  s.notify('WillChangeFrame', { x: 0, y: 100, width: 900, height: 100 });
  const panel = s.panel(), submit = panel.subviews.find(view => view.selector === 'mncmNativeSubmit');
  const close = panel.subviews.find(view => view.selector === 'mncmNativeClose');
  assert.equal(panel.frame.height, 76);
  assert(panel.contentSize.height > panel.frame.height && submit.frame.y + submit.frame.height <= panel.contentSize.height);
  assert(close.frame.y + close.frame.height <= panel.frame.height, 'the initial compact view still exposes the close button');
  const backdrop = s.controller.view.subviews.find(view => view.selector === 'mncmNativeClose');
  assert.equal(backdrop.enabled, true); assert.deepEqual({ ...backdrop.frame }, s.controller.view.bounds);
  s.input().text = 'zu'; s.change(); s.input().finalComposition = '极短窗口仍保留最终组词';
  s.click(backdrop.selector); s.flush(); s.controller = s.open();
  assert.equal(s.input().text, '极短窗口仍保留最终组词'); assert.equal(s.a.comments.length, 1);
});
test('native input actions expose their operation and Markdown state explicitly', () => {
  const s = fixture('ipad'), controls = s.panel().subviews;
  const markdown = controls.find(view => view.selector === 'mncmNativeMarkdown');
  const submit = controls.find(view => view.selector === 'mncmNativeSubmit');
  assert.equal(markdown.title, 'Markdown'); assert.equal(markdown.accessibilityValue, '未启用');
  assert.equal(submit.title, '添加'); assert.equal(submit.accessibilityLabel, '添加评论');
  assert(controls.some(view => view.text === '输入评论内容'));
  s.click('mncmNativeMarkdown'); assert.equal(markdown.accessibilityValue, '已启用');
  s.input().text = '等待核对'; s.change(); s.saveError(true); s.click('mncmNativeSubmit'); s.flush();
  assert.equal(submit.title, '核对'); assert.equal(submit.accessibilityLabel, '核对保存结果');
});
test('keyboard hide caused by submit does not race the save', () => {
  const s = fixture(); s.notify('WillShow', { x: 0, y: 370, width: 900, height: 230 });
  s.input().text = '提交'; s.change(); s.click('mncmNativeSubmit');
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 230 }); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.a.comments[1].text, '提交');
});
test('unowned keyboard and other windows do not close native input', () => {
  const s = fixture(); s.input().firstResponder = false;
  s.notify('WillShow', { x: 0, y: 370, width: 900, height: 230 }); s.notify('WillHide', { x: 0, y: 600, width: 900, height: 230 }); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller);
  s.input().firstResponder = true; s.addon.window.keyWindow = 0;
  s.notify('WillShow', { x: 0, y: 370, width: 900, height: 230 }); s.notify('WillHide', { x: 0, y: 600, width: 900, height: 230 }); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller);
});
test('a late keyboard-hide notification from a failed submit does not dismiss the error', () => {
  const s = fixture(); s.notify('WillShow', { x: 0, y: 370, width: 900, height: 230 });
  s.input().text = '保留失败提示'; s.change(); s.appendError(true);
  s.click('mncmNativeSubmit'); s.flush();
  s.notify('WillHide', { x: 0, y: 600, width: 900, height: 230 }); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller); assert.equal(s.input().text, '保留失败提示');
});
test('a delayed action from an old controller cannot write to a new target', () => {
  const s = fixture(); s.input().text = '原卡草稿'; s.change(); s.click('mncmNativeSubmit');
  s.api.dispose(s.addon); s.controller = s.open('b'); s.flush();
  assert.equal(s.a.comments.length, 1); assert.equal(s.b.comments.length, 1); assert.equal(s.state().noteId, 'b');
});
test('small landscape viewport keeps the native controls scrollable inside the available frame', () => {
  const s = fixture('ipad'); s.studyView.bounds = { x: 0, y: 0, width: 500, height: 260 }; s.api.layout(s.controller);
  s.notify('WillShow', { x: 0, y: 150, width: 500, height: 110 });
  assert(s.panel().frame.y >= 0); assert(s.panel().frame.y + s.panel().frame.height <= 150);
  assert(s.panel().contentSize.height > s.panel().frame.height);
});
test('refused editing termination cannot send marked text or close the draft', () => {
  const s = fixture(); s.input().text = 'zhong'; s.change();
  const originalResign = s.input().resignFirstResponder;
  s.input().resignFirstResponder = () => false;
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 1, 'a failed resignation must not submit unfinished composition');
  s.click('mncmNativeClose'); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller);
  assert.equal(s.input().text, 'zhong'); assert.equal(s.input().editable, true);
  s.input().resignFirstResponder = originalResign;
  s.input().finalComposition = '中文'; s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments[1].text, '中文');
});
test('deferred editing-end callback must finish composition before sending exactly once', () => {
  const s = fixture(); s.input().text = 'zu'; s.change();
  s.input().resignFirstResponder = () => { s.input().firstResponder = false; return true; };
  s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit');
  assert.equal(s.input().editable, true, 'waiting for editing end must not force a composition-changing editable toggle');
  // Process only the next turn, before UIKit delivers the editing-end callback.
  if (s.timers.length) s.timers.shift()();
  assert.equal(s.a.comments.length, 1, 'waiting one timer turn does not prove editing ended');
  s.input().text = '组词完成'; s.change();
  s.click('textViewDidEndEditing'); s.click('textViewDidEndEditing'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.a.comments[1].text, '组词完成');
});
test('late DidHide from an earlier programmatic blur cannot close the refocused input', () => {
  const s = fixture(); const shown = { x: 0, y: 370, width: 900, height: 230 }, hidden = { x: 0, y: 600, width: 900, height: 230 };
  s.notify('WillShow', shown); s.input().text = '保存失败后继续编辑'; s.change(); s.appendError(true);
  s.click('mncmNativeSubmit'); s.notify('WillHide', hidden); s.flush();
  s.notify('WillShow', shown); s.notify('DidHide', hidden); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller, 'old hide completion must not dismiss a new keyboard');
  s.notify('WillHide', hidden); s.flush();
  assert.equal(s.addon.quickCommentController, null, 'a later user dismissal must still close');
});
test('save acknowledgement failure keeps the original submission locked and never appends twice', () => {
  let failOnce = true;
  const s = fixture('ipad', actions => ({ ...actions, append(...args) {
    const result = actions.append(...args);
    if (failOnce) { failOnce = false; throw new Error('save acknowledgement failed'); }
    return result;
  } }));
  s.input().text = '写入成功但界面回执失败'; s.change(); s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.input().editable, false);
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.addon.quickCommentController, null);
});
test('close failure after a successful save permits checking and closing without enabling edits', () => {
  let failOnce = true;
  const s = fixture('iphone', actions => ({ ...actions, requestClose(...args) {
    if (failOnce) { failOnce = false; throw new Error('close failed'); }
    return actions.requestClose(...args);
  } }));
  s.input().text = '保存成功，关闭失败'; s.change(); s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.input().editable, false);
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 2); assert.equal(s.addon.quickCommentController, null);
});
test('missing editing-end callback leaves the draft editable instead of sending or closing', () => {
  const s = fixture(); s.input().text = '尚未确认的组词'; s.change();
  s.input().resignFirstResponder = () => { s.input().firstResponder = false; return true; };
  s.click('mncmNativeSubmit'); s.flush();
  assert.equal(s.a.comments.length, 1); assert.equal(s.addon.quickCommentController, s.controller);
  assert.equal(s.input().text, '尚未确认的组词'); assert.equal(s.input().editable, true);
  assert.equal(s.input().userInteractionEnabled, true);
});
test('Markdown preference failure preserves the draft and can close after storage recovers', () => {
  const s = fixture(); s.input().text = '偏好写入失败仍保留正文'; s.change(); s.preferenceError(true);
  s.click('mncmNativeMarkdown'); s.click('mncmNativeClose'); s.flush();
  assert.equal(s.addon.quickCommentController, s.controller); assert.equal(s.input().editable, true);
  s.preferenceError(false); s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
  assert.equal(s.input().text, '偏好写入失败仍保留正文'); assert.equal(s.state().markdown, true);
});
test('native drafts, recovery and duplicate submission remain isolated over repeated reopen cycles', () => {
  const s = fixture('ipad'); let saved = 0;
  for (let cycle = 0; cycle < 90; cycle += 1) {
    const text = `第${cycle}轮\n中文正文`, old = s.controller;
    s.input().text = '组词中'; s.change(); s.input().finalComposition = text;
    if (cycle % 3 === 0) {
      s.click('mncmNativeClose'); s.click('mncmNativeClose'); s.flush();
      s.controller = s.open(); assert.equal(s.input().text, text);
      s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit'); s.flush(); saved += 1;
    } else if (cycle % 3 === 1) {
      s.saveError(true); s.click('mncmNativeSubmit'); s.flush();
      s.click('mncmNativeClose'); s.flush();
      s.saveError(false); s.controller = s.open();
      s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit'); s.flush(); saved += 1;
    } else {
      s.appendError(true); s.click('mncmNativeSubmit'); s.flush();
      s.appendError(false); s.input().text = text + '修订'; s.change();
      s.click('mncmNativeClose'); s.flush(); s.controller = s.open();
      assert.equal(s.input().text, text + '修订');
      s.click('mncmNativeSubmit'); s.click('mncmNativeSubmit'); s.flush(); saved += 1;
    }
    assert.equal(s.a.comments.length, saved + 1);
    assert.equal(s.a.comments[saved].text, text + (cycle % 3 === 2 ? '修订' : ''));
    s.controller = s.open(); assert.equal(s.input().text, '');
    s.context.self = old; s.nativeBindings.textViewDidEndEditing(); s.nativeBindings.textViewDidChange(); s.flush();
    assert.equal(s.state().draft, '', 'old delegates cannot populate the new draft');
  }
});
test('resize remains within the keyboard area and restores height after reopening', () => {
  const s = fixture();
  const gesture = { state: 1, translationInView: () => ({ x: 0, y: 0 }) };
  s.context.self = s.controller; s.nativeBindings.mncmNativeResize(gesture);
  gesture.state = 2; gesture.translationInView = () => ({ x: 0, y: -140 }); s.nativeBindings.mncmNativeResize(gesture);
  assert.equal(s.panel().frame.height, 460);
  gesture.state = 3; s.nativeBindings.mncmNativeResize(gesture);
  s.click('mncmNativeClose'); s.flush(); s.controller = s.open(); assert.equal(s.panel().frame.height, 460);
  s.notify('WillShow', { x: 0, y: 380, width: 900, height: 220 }, { UIKeyboardAnimationDurationUserInfoKey: 0.25, UIKeyboardAnimationCurveUserInfoKey: 7 });
  assert(s.panel().frame.y + s.panel().frame.height <= 380);
  assert.equal(s.panel().frame.height, 356);
  s.context.self = s.controller; gesture.state = 1; gesture.translationInView = () => ({ x: 0, y: 0 }); s.nativeBindings.mncmNativeResize(gesture);
  gesture.state = 2; gesture.translationInView = () => ({ x: 0, y: 10000 }); s.nativeBindings.mncmNativeResize(gesture);
  assert.equal(s.panel().frame.height, 194);
  s.input().text = '调节高度后仍保留正文'; s.change();
  assert.equal(s.state().draft, '调节高度后仍保留正文');
});
test('pending composition and uncertain submissions cannot be resized or changed', () => {
  const s = fixture(); s.input().text = '待确认正文'; s.change();
  s.input().resignFirstResponder = () => true; s.click('mncmNativeSubmit');
  const height = s.panel().frame.height;
  s.context.self = s.controller; s.nativeBindings.mncmNativeResize({ state: 1, translationInView: () => ({ x: 0, y: -100 }) });
  s.nativeBindings.mncmNativeResize({ state: 2, translationInView: () => ({ x: 0, y: -200 }) });
  assert.equal(s.panel().frame.height, height); assert.equal(s.state().draft, '待确认正文');
});
if (require.main === module) console.log(JSON.stringify({ passed: cases.length, cases }, null, 2));
module.exports = { fixture, nativeLayoutScenarios };
