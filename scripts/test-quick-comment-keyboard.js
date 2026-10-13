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
console.log('quick comment placement and keyboard tests passed');

}
module.exports = { fixture };
