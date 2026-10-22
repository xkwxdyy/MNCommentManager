const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const input = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../src');
const source = fs.readFileSync(path.join(input, 'WebPanelController.js'), 'utf8');
let lifecycle;
const scripts = [], timers = [];
const sandbox = vm.createContext({
  console,
  JSB: { defineClass(_name, methods) { lifecycle = methods; return {}; } },
  NSTimer: { scheduledTimerWithTimeInterval(_delay, _repeat, callback) { timers.push(callback); } },
  UIApplication: { sharedApplication: () => ({}) },
  NSUserDefaults: { standardUserDefaults: () => ({ setObjectForKey() {} }) },
});
vm.runInContext(source, sandbox);
const controller = { webView: { evaluateJavaScript(script) { scripts.push(script); } }, _requestedView: 'workflow' };
sandbox.self = controller;
lifecycle.webViewDidStartLoad();
assert.equal(controller._webContentReady, false);
assert.equal(scripts.length, 0);
lifecycle.webViewDidFinishLoad();
assert.equal(controller._webContentReady, true);
assert.equal(controller._requestedView, '');
assert.equal(scripts.length, 1);
const page = vm.createContext({ window: {} });
vm.runInContext(scripts[0], page);
assert.equal(page.window.__MNCommentManagerRequestedView, 'workflow', 'requests must survive a React receiver that is not ready yet');
lifecycle.webViewDidFinishLoad();
assert.equal(scripts.length, 1, 'ordinary page load callbacks must not repeatedly reopen the manager');
let opened = 0;
page.window.__MNCommentManagerOpenWorkflow = () => { opened += 1; page.window.__MNCommentManagerRequestedView = ''; };
vm.runInContext(scripts[0], page);
assert.equal(opened, 1);
assert.equal(page.window.__MNCommentManagerRequestedView, '');

const menuSandbox = vm.createContext({ console, __MN_WEB_API_MNCommentManagerAddon: {
  showPanel(target, options) { assert.equal(target, controller); assert.equal(options.requestedView, 'workflow'); },
} });
vm.runInContext(fs.readFileSync(path.join(input, 'CommentWorkflowMenu.js'), 'utf8'), menuSandbox);
assert.equal(menuSandbox.__MN_COMMENT_WORKFLOW_MENU__.openWorkflowManager({ webController: controller }), true);

// A native menu must leave before the Web manager is shown. Dismissing through
// the ordinary delegate path can otherwise invalidate its selected-card context.
for (const mode of ['single', 'batch']) for (const coordinated of [false, true]) {
  const events = [], selected = { token: mode + '-selection', notes: [{ noteId: 'a' }, { noteId: 'b' }], noteId: 'a' };
  const draft = { name: '未保存录制', steps: [{ actionId: 'clearAllComments' }] };
  const target = { view: { hidden: true }, recordingDraft: draft };
  const addon = { webController: target, dynamicCommentContext: selected, batchCommentContext: selected };
  const nativeDelegate = { popoverControllerDidDismissPopover() { addon.batchCommentContext = null; addon.dynamicCommentContext = null; target.view.hidden = true; } };
  const popover = { delegate: nativeDelegate, dismissPopoverAnimated(animated) {
    events.push(['dismiss', animated]);
    assert.equal(this.delegate, null, 'handoff must disable context-clearing dismissal delegates');
    assert.equal(addon.dynamicCommentMenuPopoverController, null);
    assert.equal(addon.batchCommentMenuPopoverController, null);
    if (this.delegate) this.delegate.popoverControllerDidDismissPopover(this);
  } };
  addon[mode === 'single' ? 'dynamicCommentMenuPopoverController' : 'batchCommentMenuPopoverController'] = popover;
  if (coordinated) addon.mncmActionPopover = popover;
  const context = vm.createContext({ console, __MN_WEB_API_MNCommentManagerAddon: { showPanel(received, options) {
    assert.equal(received, target); assert.equal(options.requestedView, 'workflow');
    assert.deepEqual(events, [['dismiss', false]], 'menu dismissal must finish before showing the Web panel');
    assert.equal(addon.mncmActionPopover, null);
    assert.equal(addon.dynamicCommentContext, selected); assert.equal(addon.batchCommentContext, selected);
    assert.equal(target.recordingDraft, draft); target.view.hidden = false; events.push(['show']);
  } } });
  vm.runInContext(fs.readFileSync(path.join(input, 'CommentWorkflowMenu.js'), 'utf8'), context);
  assert.equal(context.__MN_COMMENT_WORKFLOW_MENU__.openWorkflowManager(addon), true);
  assert.deepEqual(events, [['dismiss', false], ['show']]);
  assert.equal(target.view.hidden, false); assert.equal(target.recordingDraft, draft);
  assert.equal(addon.mncmWorkflowPanelOwnsEntries, true);
}
controller.view = { hidden: false };
controller._webContentReady = false;
controller._requestedView = 'workflow';
sandbox.__MN_WEB_API_MNCommentManagerAddon.hidePanel(controller);
assert.equal(controller._requestedView, '');
vm.runInContext(scripts[scripts.length - 1], page);
assert.equal(page.window.__MNCommentManagerRequestedView, '', 'closing the panel must cancel a queued request');
const scriptsAfterClose = scripts.length;
lifecycle.webViewDidFinishLoad();
assert.equal(scripts.length, scriptsAfterClose, 'a cancelled request must not reopen when the page finishes loading');
console.log('workflow manager native entry lifecycle tests passed');

// Batch mode must survive both first-load delivery and later generic snapshot refreshes.
{
  const emitted = [], delayed = [];
  let singleReads = 0, batchReads = 0;
  const state = { mode: 'batch', token: 'first-load', cards: [{ noteId: 'a' }, { noteId: 'b' }], noteIds: ['a', 'b'], catalog: [], workflows: [] };
  const target = { panelMode: 'batch', addon: { batchCommentContext: { token: 'first-load', notes: [{ noteId: 'a' }, { noteId: 'b' }] } },
    view: { hidden: false }, webView: { evaluateJavaScript(script) { emitted.push(script); } } };
  const native = vm.createContext({ console,
    JSB: { defineClass() { return {}; } },
    NSTimer: { scheduledTimerWithTimeInterval(_delay, _repeat, callback) { delayed.push(callback); } },
    NSUserDefaults: { standardUserDefaults: () => ({ setObjectForKey() {} }) },
    __MN_COMMENT_DATA__: { getCurrentNoteSnapshot() { singleReads += 1; return { noteId: 'single', comments: [] }; } },
    __MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon: { commands: { getBatchCommentEditorState() { batchReads += 1; return state; } } },
  });
  vm.runInContext(source, native);
  const api = native.__MN_WEB_API_MNCommentManagerAddon;
  api.syncBatch(target, 'first-open');
  const initialPage = vm.createContext({ window: {} });
  vm.runInContext(emitted.at(-1), initialPage);
  api.syncCurrentNote(target, 'generic-refresh'); delayed.shift()();
  assert.equal(singleReads, 0, 'batch mode must not serialize a single-card snapshot');
  assert.equal(batchReads, 2);
  assert(!emitted.at(-1).includes('window.__MNCommentManagerNativeSync('), 'generic refresh must keep the batch projection');
  assert.equal(JSON.parse(initialPage.window.__MNCommentManagerPendingBatchSync).state.token, 'first-load', 'first batch payload must wait for React to install its receiver');
  target.panelMode = 'single';
  api.syncCurrentNote(target, 'back-to-single'); delayed.shift()();
  vm.runInContext(emitted.at(-1), initialPage);
  assert.equal(initialPage.window.__MNCommentManagerPendingBatchSync, null, 'single-card mode must cancel an unconsumed batch payload');
  target.panelMode = 'batch'; api.syncBatch(target, 'queued-before-close');
  vm.runInContext(emitted.at(-1), initialPage);
  api.syncCurrentNote(target, 'delayed-before-close');
  const staleRefresh = delayed.shift();
  api.hidePanel(target);
  vm.runInContext(emitted.at(-1), initialPage);
  assert.equal(initialPage.window.__MNCommentManagerPendingBatchSync, null, 'closing must cancel an unconsumed first-load batch payload');
  const countAfterClose = emitted.length;
  staleRefresh(); api.syncBatch(target, 'late-batch-refresh');
  assert.equal(emitted.length, countAfterClose, 'neither a delayed single refresh nor a stale batch push may revive a closed editor');
}
console.log('batch panel initial delivery and mode lifecycle tests passed');

{
  let methods;
  const emitted = [];
  const native = vm.createContext({ console,
    JSB: { defineClass(_name, callbacks) { methods = callbacks; return {}; } },
    NSTimer: { scheduledTimerWithTimeInterval() {} },
    NSUserDefaults: { standardUserDefaults: () => ({ setObjectForKey() {} }) },
  });
  vm.runInContext(source, native);
  const target = { panelMode: 'batch', addon: { batchCommentContext: { token: 'draft-protected' } }, view: { hidden: false },
    webView: { evaluateJavaScript(script) { emitted.push(script); } } };
  native.self = target;
  assert.equal(typeof native.__MN_WEB_API_MNCommentManagerAddon.requestHidePanel, 'function', 'toolbar closing needs a guarded request distinct from force cleanup');
  native.__MN_WEB_API_MNCommentManagerAddon.requestHidePanel(target);
  assert.equal(target.view.hidden, false, 'user-requested toolbar closing must wait for the Web draft guard');
  methods.closeWindow();
  assert.equal(target.view.hidden, false, 'the native batch close control must wait for the Web draft guard');
  assert.equal(target.addon.batchCommentContext.token, 'draft-protected');
  const page = vm.createContext({ window: {} });
  vm.runInContext(emitted.at(-1), page);
  assert.equal(page.window.__MNCommentManagerPendingNativeClose, true, 'early close requests must wait for the editor receiver');
  let guardedCloseRequests = 0;
  page.window.__MNCommentManagerNativeRequestClose = () => { guardedCloseRequests += 1; };
  methods.closeWindow(); vm.runInContext(emitted.at(-1), page);
  assert.equal(guardedCloseRequests, 1);
  let releasedTargets = 0;
  native.__MN_DYNAMIC_COMMENT_ACTIONS__ = { hideButton(addon) { assert.equal(addon.mncmWorkflowPanelOwnsEntries, false); releasedTargets++; } };
  native.__MN_BATCH_COMMENT_ACTIONS__ = { hideButton(addon) { assert.equal(addon.mncmWorkflowPanelOwnsEntries, false); releasedTargets++; } };
  target.addon.mncmWorkflowPanelOwnsEntries = true;
  target.panelMode = 'single'; methods.closeWindow();
  assert.equal(target.view.hidden, true, 'single-card native closing must retain its original immediate path');
  assert.equal(target.addon.mncmWorkflowPanelOwnsEntries, false, 'closing the workflow panel must release entry ownership');
  assert.equal(releasedTargets, 2, 'closing invalidates old follow targets before another card can reveal fresh entries');
  vm.runInContext(emitted.at(-1), page);
  assert.equal(page.window.__MNCommentManagerPendingNativeClose, null);
}
console.log('native batch close draft-guard routing tests passed');
