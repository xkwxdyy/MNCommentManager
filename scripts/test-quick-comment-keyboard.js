const assert = require('node:assert/strict');
const { setup } = require('./test-quick-comment');

function fixture() {
  const s = setup(), scripts = [], animations = [], observers = new Set(), timerDurations = [];
  s.api.dispose(s.addon); s.timers.length = 0;
  const parent = s.studyView, content = { superview: parent, layer: {} }, reader = { superview: parent, layer: {} }, overlay = { superview: parent, layer: {} };
  const study = s.context.Application.sharedInstance().studyController();
  study.notebookController.view = { hidden: false, superview: content };
  study.readerController = { view: reader };
  parent.subviews = [content, reader, overlay]; parent.layer = {};
  parent.addSubview = view => { parent.subviews.push(view); view.superview = parent; };
  parent.insertSubviewAboveSubview = (view, anchor) => {
    parent.subviews = parent.subviews.filter(item => item !== view);
    parent.subviews.splice(parent.subviews.indexOf(anchor) + 1, 0, view); view.superview = parent;
  };
  parent.bringSubviewToFront = () => { throw new Error('must not force the input to the top'); };
  s.addon.window.keyWindow = 1; s.addon.window.screen = {};
  s.addon.window.convertRectFromWindow = rect => ({ ...rect, y: rect.y - 100 });
  s.context.NSNotificationCenter = { defaultCenter: () => ({ addObserverSelectorName(controller, selector, name) { observers.add(name); assert.equal(selector, 'mncmQuickKeyboardChanged:'); }, removeObserver() { observers.clear(); } }) };
  s.context.UIView.animateWithDurationDelayOptionsAnimationsCompletion = (duration, delay, options, fn) => { animations.push({ duration, options }); fn(); };
  s.context.NSTimer.scheduledTimerWithTimeInterval = (duration, repeat, fn) => { timerDurations.push(duration); s.timers.push(fn); };
  s.controller = s.open();
  s.controller.webView.isFirstResponder = () => true;
  s.controller.webView.evaluateJavaScript = script => { scripts.push(script); };
  s.controller.view.removeFromSuperview = () => { parent.subviews = parent.subviews.filter(view => view !== s.controller.view); s.controller.view.superview = null; };
  const notify = (name, info = {}, object = null, controller = s.controller) => {
    s.context.self = controller;
    s.bindings.mncmQuickKeyboardChanged({ name: 'UIKeyboard' + name + 'Notification', userInfo: { objectForKey: key => info[key] }, object });
  };
  const shown = { UIKeyboardFrameEndUserInfoKey: { CGRectValue: () => ({ x: 0, y: 500, width: 900, height: 200 }) } };
  const hidden = { UIKeyboardFrameBeginUserInfoKey: { x: 0, y: 500, width: 900, height: 200 }, UIKeyboardFrameEndUserInfoKey: { x: 0, y: 700, width: 900, height: 200 }, UIKeyboardAnimationDurationUserInfoKey: 0.4, UIKeyboardAnimationCurveUserInfoKey: 7 };
  const lastEvent = () => JSON.parse(scripts[scripts.length - 1].match(/Keyboard\((.*)\)$/)[1]);
  return Object.assign(s, { scripts, observers, animations, timerDurations, notify, shown, hidden, lastEvent, content, reader, overlay });
}

function nativeFixture(platform = 'ipad') {
  const s = fixture(), frames = [], nativeInputs = new Map();
  s.api.dispose(s.addon); s.timers.length = 0; s.scripts.length = 0;
  const viewTemplate = s.controller.view;
  s.context.MNUtil.isIOS = () => platform === 'iphone';
  s.context.MNUtil.isIPadOS = () => platform === 'ipad';
  s.context.__MN_NATIVE_QUICK_COMMENT_MNCommentManagerAddon = {
    create(actions) {
      const view = { ...viewTemplate, layer: { removeAllAnimations() {} }, superview: null };
      let frame = { x: 0, y: 0, width: 900, height: 600 };
      Object.defineProperty(view, 'frame', { get: () => frame, set(value) { frame = value; view.bounds = { x: 0, y: 0, width: value.width, height: value.height }; } });
      view.convertRectFromView = rect => ({ ...rect, x: rect.x - frame.x, y: rect.y - frame.y });
      view.removeFromSuperview = function () { if (this.superview) this.superview.subviews = this.superview.subviews.filter(child => child !== this); this.superview = null; };
      const controller = { view, _mncmNativeQuickId: 'native-' + nativeInputs.size };
      nativeInputs.set(controller, { actions, text: '', responder: false, isFirstResponder() { return this.responder; } });
      return controller;
    },
    mount(controller) { nativeInputs.get(controller).text = s.api.getState(controller).draft; },
    snapshot(controller) { const current = s.api.getState(controller), input = nativeInputs.get(controller); return { sessionId: current.sessionId, text: input.text, markdown: current.markdown, draftRevision: current.draftRevision + (input.text !== current.draft ? 1 : 0) }; },
    layout() {}, focus() {},
    keyboard(controller, event, rect) { frames.push({ controller, event, rect }); },
    input: controller => nativeInputs.get(controller), panel: controller => controller.view,
    unmount: controller => nativeInputs.delete(controller), dispose() {},
  };
  s.controller = s.open();
  s.nativeInput = () => nativeInputs.get(s.addon.quickCommentController);
  return Object.assign(s, { frames });
}

if (require.main === module) {

{
  const s = fixture();
  assert.deepEqual(s.studyView.subviews, [s.content, s.reader, s.controller.view, s.overlay]);
  s.open(); assert.equal(s.studyView.subviews[3], s.overlay, 'repeat opening must preserve the host overlay');
  assert.equal(s.observers.size, 3);
  s.notify('WillHide', s.hidden); assert.equal(s.scripts.length, 0, 'unowned keyboard must not close input');
  s.notify('WillShow', s.shown); assert.equal(s.lastEvent().type, 'show');
  s.notify('WillHide', s.hidden); const event = s.lastEvent();
  assert.equal(event.type, 'hide');
  const sessionId = s.api.getState(s.controller).sessionId;
  assert.throws(() => s.api.requestClose(s.controller, { sessionId, reason: 'keyboard', eventId: 'stale' }), /失效/);
  s.api.requestClose(s.controller, { sessionId, reason: 'keyboard', eventId: event.eventId, text: '最新草稿', draftRevision: 1, markdown: true });
  assert.equal(s.observers.size, 0);
  assert.equal(s.controller.webView.transform.ty, 200, 'coordinates must be converted from the screen');
  assert.equal(s.animations.at(-1).options, (7 << 16) | (1 << 2));
  assert(s.animations.at(-1).duration > 0.3 && s.animations.at(-1).duration <= 0.4);
  assert(s.timerDurations.at(-1) >= 0.4);
  while (s.timers.length) s.timers.shift()();
  const next = s.open(); assert.equal(s.api.getState(next).draft, '最新草稿');
  assert.equal(s.api.getState(next).markdown, true);
  const before = s.scripts.length; s.notify('WillHide', s.hidden, null, s.controller); assert.equal(s.scripts.length, before, 'old controller cannot close the new input');
}
for (const condition of ['other-window', 'other-screen', 'nonlocal', 'accessory-only', 'other-input', 'rotation', 'still-visible']) {
  const s = fixture();
  if (condition === 'other-window') s.addon.window.keyWindow = 0;
  if (condition === 'other-input') s.controller.webView.isFirstResponder = () => false;
  const shown = condition === 'accessory-only' ? { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 660, width: 900, height: 40 } } : s.shown;
  s.notify('WillShow', shown);
  if (condition === 'rotation') s.controller.view.bounds.height = 700;
  const hidden = condition === 'nonlocal' ? { ...s.hidden, UIKeyboardIsLocalUserInfoKey: false } : condition === 'still-visible' ? { ...s.hidden, ...s.shown } : s.hidden;
  s.notify('WillHide', hidden, condition === 'other-screen' ? {} : null);
  assert(!s.scripts.some(script => script.includes('"type":"hide"')), condition + ' must not close input');
}
{
  const s = fixture(); s.notify('WillShow', s.shown); s.notify('DidHide');
  const event = s.lastEvent(); const sessionId = s.api.getState(s.controller).sessionId;
  s.api.requestClose(s.controller, { sessionId, reason: 'keyboard', eventId: event.eventId, reducedMotion: true, text: '', draftRevision: 0 });
  assert.equal(s.controller.webView.transform, undefined); assert.equal(s.animations.at(-1).duration, 0.12);
  const count = s.scripts.length; s.notify('DidHide'); assert.equal(s.scripts.length, count);
}
{
  const s = fixture(); s.notify('WillShow', s.shown);
  const payload = { sessionId: s.api.getState(s.controller).sessionId, submissionId: 'once', text: '正文', draftRevision: 1 };
  s.api.append(s.controller, payload); s.api.setExit(s.controller, { ...payload, active: true });
  const count = s.scripts.length; s.notify('WillHide', s.hidden); assert.equal(s.scripts.length, count, 'save exit must remain in control');
}
{
  const s = fixture(); s.api.dispose(s.addon); assert.equal(s.observers.size, 0);
}
for (const platform of ['iphone', 'ipad']) {
  const s = nativeFixture(platform);
  assert(s.controller._mncmNativeQuickId); assert.equal(s.controller.webView, undefined, platform + ' must use the native input route');
  const bar = { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 650, width: 900, height: 50 } };
  s.notify('WillShow', bar);
  assert(s.frames.some(packet => packet.event.type === 'frame' && packet.rect.y === 550 && packet.rect.height === 50), 'native geometry must avoid a 50-point bar before first responder confirmation');
  s.nativeInput().responder = true;
  s.notify('DidShow', bar);
  assert.equal(s.frames.at(-1).event.type, 'show', 'a newly confirmed keyboard clears Native dismissal suppression');
  s.notify('WillHide', { ...s.hidden, UIKeyboardFrameBeginUserInfoKey: bar.UIKeyboardFrameEndUserInfoKey, UIKeyboardFrameEndUserInfoKey: { x: 0, y: 700, width: 900, height: 50 } });
  assert.equal(s.frames.at(-1).event.type, 'hide', 'owned native accessory bars must participate in keyboard dismissal');
}
{
  const s = nativeFixture(), bar = { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 650, width: 900, height: 50 } };
  s.notify('WillShow', bar);
  s.context.__MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon.available = () => ({ x: 20, y: 80, width: 780, height: 480 });
  s.api.layout(s.controller);
  assert.equal(s.frames.at(-1).event.type, 'frame', 'layout reprojection must not impersonate a new keyboard show');
  assert.equal(s.frames.at(-1).rect.y, 470, 'layout changes must reproject the original screen keyboard rectangle');
  assert.equal(s.frames.at(-1).rect.x, -20);
  for (const condition of ['other-window', 'other-screen', 'nonlocal']) {
    const count = s.frames.length;
    if (condition === 'other-window') s.addon.window.keyWindow = 0;
    s.notify('WillChangeFrame', { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 200, width: 900, height: 300 }, ...(condition === 'nonlocal' ? { UIKeyboardIsLocalUserInfoKey: false } : {}) }, condition === 'other-screen' ? {} : null);
    assert.equal(s.frames.length, count, condition + ' cannot change cached geometry'); s.addon.window.keyWindow = 1;
    s.api.layout(s.controller); assert.equal(s.frames.at(-1).rect.y, 470);
  }
}
{
  const s = nativeFixture(); s.nativeInput().responder = true;
  const bar = { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 650, width: 900, height: 50 } };
  s.notify('WillShow', bar); s.notify('WillHide', { ...s.hidden, UIKeyboardFrameEndUserInfoKey: { x: 0, y: 700, width: 900, height: 50 } });
  s.notify('WillShow', bar); s.notify('DidHide');
  s.context.__MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon.available = () => ({ x: 0, y: 80, width: 900, height: 480 });
  s.api.layout(s.controller); assert.equal(s.frames.at(-1).rect.y, 470, 'a consumed old DidHide cannot erase the newer keyboard cache');
}
{
  const s = nativeFixture(); s.nativeInput().responder = true;
  for (const rect of [{ x: 0, y: 650, width: 900, height: 0 }, { x: 0, y: 700, width: 900, height: 50 }]) {
    s.notify('WillShow', { UIKeyboardFrameEndUserInfoKey: rect }); s.notify('WillHide', s.hidden);
  }
  assert(!s.frames.some(packet => packet.event.type === 'hide'), 'zero-height and offscreen keyboards cannot own input dismissal');
}
const sequenceResults = [];
function sequenceTest(name, run) {
  try { run(); sequenceResults.push({ name, passed: true }); }
  catch (error) { sequenceResults.push({ name, passed: false, error: error.message }); }
}
function ownedDraft(s) {
  s.nativeInput().responder = true; s.nativeInput().text = '旋转与分屏草稿';
  s.api.updateDraft(s.controller, { sessionId: s.api.getState(s.controller).sessionId, text: s.nativeInput().text, markdown: true, draftRevision: 1 });
  s.notify('WillShow', s.shown);
}
function assertDraft(s) {
  assert.equal(s.api.getState(s.controller).draft, '旋转与分屏草稿');
  assert.equal(s.api.getState(s.controller).markdown, true); assert.equal(s.a.comments.length, 1);
}
sequenceTest('floating transition WillHide keeps ownership for the next actual hide', () => {
  const s = nativeFixture(); ownedDraft(s);
  s.notify('WillHide', { ...s.hidden, UIKeyboardFrameEndUserInfoKey: { x: 400, y: 300, width: 300, height: 200 } });
  assert(!s.frames.some(packet => packet.event.type === 'hide'));
  s.notify('WillHide', s.hidden);
  assert.equal(s.frames.filter(packet => packet.event.type === 'hide').length, 1, 'ignored floating transitions cannot drop keyboard ownership');
  assertDraft(s);
});
sequenceTest('completed hide clears its raw screen rectangle before viewport expansion', () => {
  const s = nativeFixture(); ownedDraft(s);
  s.notify('WillHide', s.hidden); s.notify('DidHide', s.hidden);
  s.context.__MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon.available = () => ({ x: 0, y: 0, width: 900, height: 900 });
  s.api.layout(s.controller);
  assert.equal(s.frames.at(-1).rect, null, 'a hidden keyboard cannot become a phantom overlap after expanding the viewport');
  assertDraft(s);
});
sequenceTest('unknown and duplicated DidHide never independently dismiss a native draft', () => {
  const s = nativeFixture(); ownedDraft(s);
  s.notify('DidHide', s.hidden); s.notify('DidHide', s.hidden);
  assert(!s.frames.some(packet => packet.event.type === 'hide'), 'unpaired DidHide must not initiate native closing');
  s.notify('WillHide', s.hidden);
  assert.equal(s.frames.filter(packet => packet.event.type === 'hide').length, 1, 'the next genuine WillHide must remain usable');
  assertDraft(s);
});
sequenceTest('rotation hide followed by a new frame and late DidHide retains the new geometry', () => {
  const s = nativeFixture(); ownedDraft(s);
  s.controller.view.frame = { x: 0, y: 0, width: 600, height: 400 };
  s.notify('WillHide', s.hidden);
  s.notify('WillChangeFrame', { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 400, width: 600, height: 100 } });
  const last = s.frames.at(-1);
  s.notify('DidHide', s.hidden);
  assert.equal(s.frames.at(-1), last, 'late rotation completion cannot replace a newer in-view keyboard');
  s.notify('WillHide', s.hidden);
  assert.equal(s.frames.filter(packet => packet.event.type === 'hide').length, 1); assertDraft(s);
});
sequenceTest('a new unowned keyboard frame cancels stale hide cleanup before focus confirmation', () => {
  const s = nativeFixture(); ownedDraft(s);
  s.notify('WillHide', s.hidden); s.nativeInput().responder = false;
  s.notify('WillShow', { UIKeyboardFrameEndUserInfoKey: { x: 0, y: 650, width: 900, height: 50 } });
  const last = s.frames.at(-1); s.notify('DidHide', s.hidden);
  assert.equal(s.frames.at(-1), last); assertDraft(s);
});
sequenceTest('explicit closing remains available after an unpaired DidHide and restores its draft', () => {
  const s = nativeFixture(); ownedDraft(s); s.notify('DidHide', s.hidden);
  s.api.requestClose(s.controller, { sessionId: s.api.getState(s.controller).sessionId });
  while (s.timers.length) s.timers.shift()();
  assert.equal(s.addon.quickCommentController, null);
  s.controller = s.open(); assertDraft(s);
});
console.log(JSON.stringify({ nativeNotificationSequences: sequenceResults }, null, 2));
if (sequenceResults.some(result => !result.passed)) process.exitCode = 1;
else console.log('quick comment placement and keyboard tests passed');

}
module.exports = { fixture, nativeFixture };
