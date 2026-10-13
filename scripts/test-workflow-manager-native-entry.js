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
