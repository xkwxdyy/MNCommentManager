const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sourceRoot = process.argv[2] || path.join(__dirname, '../src');
const frameKey = 'mn_web_template_mncommentmanageraddon_frame_config';
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const window = {}, otherWindow = {}, preferences = new Map(), logs = [], timers = [];
  const studyView = { bounds: { x: 0, y: 0, width: 1000, height: 740 }, addSubview(view) { view.superview = this; } };
  let rect = { x: 180, y: 20, width: 660, height: 50 };
  const capsule = { window, bounds: { x: 0, y: 0, width: 660, height: 50 }, superview: window, convertRectToView: () => copy(rect) };
  const runtime = { currentWindow: window, immersiveMode: true, immersiveNavCapsuleView: capsule };
  let methods;
  const context = vm.createContext({ console: { log(message) { logs.push(message); } }, MNUtil: runtime,
    Application: { sharedInstance: () => ({ studyController: target => { assert.equal(target, window); return { view: studyView }; } }) },
    JSB: { defineClass(_name, members) { methods = members; return {}; } },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: key => preferences.get(key), setObjectForKey(value, key) { preferences.set(key, value); } }) },
    NSTimer: { scheduledTimerWithTimeInterval(_delay, _repeat, callback) { timers.push(callback); } },
  });
  for (const name of ['PanelContentBounds', 'WebPanelController']) vm.runInContext(fs.readFileSync(path.join(sourceRoot, name + '.js'), 'utf8'), context);
  let frame = { x: 0, y: 0, width: 740, height: 620 };
  const view = { hidden: false, bounds: { x: 0, y: 0, width: 740, height: 620 }, setNeedsLayout() {} };
  Object.defineProperties(view, {
    frame: { get: () => copy(frame), set(value) { frame = copy(value); view.bounds = { x: 0, y: 0, width: frame.width, height: frame.height }; } },
    center: { get: () => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }), set(value) { frame.x = value.x - frame.width / 2; frame.y = value.y - frame.height / 2; } },
  });
  const controller = { addon: { window }, view, webView: { evaluateJavaScript() {} }, containerView: {}, titleBar: {}, titleLabel: {}, resizeHandle: {} };
  context.self = controller;
  return { context, controller, methods, window, otherWindow, studyView, runtime, capsule, preferences, logs,
    setRect(value) { rect = value; }, helper: context.__MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon,
    api: context.__MN_WEB_API_MNCommentManagerAddon };
}
{
  const s = fixture(), full = s.studyView.bounds;
  assert.deepEqual(copy(s.helper.available(s.controller, s.studyView, full)), { x: 0, y: 78, width: 1000, height: 662 });
  s.setRect({ x: 100, y: 30, width: 660, height: 80 });
  assert.equal(s.helper.available(s.controller, s.studyView, full).y, 118, 'geometry must refresh without a stale height cache');
  s.runtime.currentWindow = s.otherWindow;
  s.runtime.immersiveNavCapsuleView = { window: s.otherWindow, convertRectToView() { throw new Error('wrong window'); } };
  assert.equal(s.helper.available(s.controller, s.studyView, full).y, 118, 'background layout must use only its own cached native view');
  s.capsule.hidden = true;
  assert.deepEqual(copy(s.helper.available(s.controller, s.studyView, full)), full);
  s.capsule.hidden = false; s.runtime.currentWindow = s.window; s.runtime.immersiveMode = false;
  assert.deepEqual(copy(s.helper.available(s.controller, s.studyView, full)), full);
}
{
  const s = fixture(); s.runtime.immersiveNavCapsuleView = null;
  assert.deepEqual(copy(s.helper.available(s.controller, s.studyView, s.studyView.bounds)), s.studyView.bounds);
  s.helper.available(s.controller, s.studyView, s.studyView.bounds);
  assert.equal(s.logs.length, 1, 'unavailable geometry diagnostics must not repeat on every layout');
  s.runtime.immersiveNavCapsuleView = { ...s.capsule, window: s.otherWindow };
  assert.deepEqual(copy(s.helper.available(s.controller, s.studyView, s.studyView.bounds)), s.studyView.bounds);
}
{
  const s = fixture(); const saved = JSON.stringify({ x: 20, y: 0, width: 740, height: 620 }); s.preferences.set(frameKey, saved);
  s.api.showPanel(s.controller);
  assert(s.controller.view.frame.y >= 78, 'restored Native panel must avoid the capsule');
  assert.equal(s.preferences.get(frameKey), saved, 'opening must not rewrite the saved position');
  s.methods.handleTitleBarDoubleTap();
  assert.deepEqual(s.controller.view.frame, { x: 0, y: 78, width: 1000, height: 662 });
  s.setRect({ x: 180, y: 20, width: 660, height: 80 }); s.api.ensureLayout(s.controller);
  assert.equal(s.controller.view.frame.y, 108, 'maximized layout must follow changed capsule geometry');
  assert.equal(s.controller.view.frame.y + s.controller.view.frame.height, 740);
  s.methods.handleTitleBarDoubleTap();
  const move = { state: 2, translationInView: () => ({ x: 0, y: -1000 }), setTranslationInView() {} };
  s.methods.handlePan(move); s.api.ensureLayout(s.controller);
  assert(s.controller.view.frame.y < 108, 'intentional manual dragging into the protection zone must remain allowed');
}
{
  const s = fixture(); s.studyView.bounds = { x: 0, y: 0, width: 300, height: 240 };
  s.setRect({ x: 0, y: 0, width: 300, height: 50 }); s.api.showPanel(s.controller);
  const frame = s.controller.view.frame;
  assert(frame.y >= 58 && frame.x >= 0 && frame.x + frame.width <= 300 && frame.y + frame.height <= 240, 'compact safe area must not overflow due to desktop minimum dimensions');
}
console.log('panel top chrome compatibility tests passed');
