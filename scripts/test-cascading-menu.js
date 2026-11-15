'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.resolve(__dirname, '../src/CascadingMenu.js'), 'utf8');
class Menu {
  constructor(width) { this.width = width; }
  static new(anchor, width) { return new this(width); }
  addItems(items) { this._panels = [{ items, width: this.width }]; }
  addSubmenuItem() {}
  _makeColumn() {}
  _layoutColumns() {}
  _closePanelsDeeperThan() {}
  _columnWidth() { return 250; }
  _selectRow(panel, index) {
    const item = panel.items[index];
    if (item.submenu) {
      this._panels.splice(this._panels.indexOf(panel) + 1);
      this._panels.push({ items: item.submenu, width: this._columnWidth(item.submenu) });
    } else this.resolve({ isCanceled: false, item });
  }
  show() { return new Promise(resolve => { this.resolve = resolve; }); }
  dismiss() { if (this.resolve) this.resolve({ isCanceled: true }); }
}
const view = { bounds: { width: 1200, height: 800 } };
const errors = [];
const ctx = vm.createContext({ console, MenuDev: Menu, MNUtil: { studyView: view, currentWindow: 'A', currentNotebookId: 'N' } });
vm.runInContext(code, ctx);
const api = ctx.__MN_CASCADING_MENU_MNCommentManagerAddon;
const originalSelect = Menu.prototype._selectRow;
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const owner = {}, anchor = {};
  const payload = { nested: { preserve: true } };
  let calls = [], canceled = 0, built = 0, expanded = 0;
  const leaf = { title: 'Leaf', object: { run(value) { calls.push(value); } }, selector: 'run:', param: payload, checked: true };
  const rootRows = [{ title: 'Header', selector: 'noopMenuAction:' }, { title: 'Branch', selector: 'open:' }, { title: 'Other', selector: 'other:' }];
  const options = { width: 300, children: row => row.selector === 'open:' || row.selector === 'other:' ? () => { built++; return [leaf]; } : null,
    expand() { expanded++; }, cancel() { canceled++; }, report(error) { errors.push(error); } };
  // Native callbacks exist only in the JSB registration table. The instance
  // deliberately has no same-named ordinary JavaScript method.
  const nativeInvocations = [], originalPayload = { nested: { intact: true } };
  const nativeOnly = {
    performSelectorWithObject(selector, value) { nativeInvocations.push({ selector, value, target: this }); },
    performSelector(selector) { nativeInvocations.push({ selector, target: this }); }
  };
  assert.equal(typeof nativeOnly.nativeAction, 'undefined');
  await api.dispatch({ object: nativeOnly, selector: 'nativeAction:', param: originalPayload });
  assert.equal(nativeInvocations.length, 1);
  assert.equal(nativeInvocations[0].selector, 'nativeAction:');
  assert.equal(nativeInvocations[0].target, nativeOnly);
  assert.equal(nativeInvocations[0].value, originalPayload, 'the adapter must not JSON-clone or normalize parameters');
  await api.dispatch({ object: nativeOnly, selector: 'noArgument' });
  assert.equal(nativeInvocations[1].selector, 'noArgument');
  assert.throws(() => api.dispatch({ object: {}, selector: 'unavailable:' }), /unavailable/);
  assert.throws(() => api.dispatch({ object: nativeOnly, selector: 'bad:two:' }), /Invalid/);

  let handle = api.present(owner, anchor, rootRows, options);
  assert(handle);assert.equal(built, 0, 'children are built on demand');
  const root = handle.menu._panels[0];
  handle.menu._selectRow(root, 0);assert.equal(handle.menu._panels.length, 1, 'headers cannot dismiss the menu');
  handle.menu._selectRow(root, 1);assert.equal(handle.menu._panels.length, 2);assert.equal(calls.length, 0);assert.equal(expanded, 1);
  assert.equal(handle.menu._panels[0], root, 'parent stays present');
  handle.menu._selectRow(root, 2);assert.equal(handle.menu._panels.length, 2, 'sibling replaces the deeper branch');
  assert.equal(handle.menu._panels[1].items[0].checked, true);
  handle.menu._selectRow(handle.menu._panels[1], 0);await flush();
  assert.equal(calls.length, 1);assert.equal(calls[0], payload, 'the original parameter object reaches the existing action');
  assert.equal(Menu.prototype._selectRow, originalSelect, 'shared MenuDev prototype stays unchanged');
  handle = api.present(owner, anchor, rootRows, options);handle.menu.dismiss();await flush();assert.equal(canceled, 1);
  handle = api.present(owner, anchor, [leaf], options);api.dismiss(owner);handle.menu.resolve({ isCanceled: false, item: handle.menu._panels[0].items[0] });await flush();assert.equal(calls.length, 1, 'closed menus cannot execute late actions');
  handle = api.present(owner, anchor, [leaf], options);ctx.MNUtil.currentWindow = 'B';handle.menu._selectRow(handle.menu._panels[0], 0);await flush();assert.equal(calls.length, 1, 'window changes invalidate pending selections');
  ctx.MNUtil.currentWindow = 'A';
  handle = api.present(owner, anchor, [leaf], options);ctx.MNUtil.currentNotebookId = 'Other';handle.menu._selectRow(handle.menu._panels[0], 0);await flush();assert.equal(calls.length, 1);ctx.MNUtil.currentNotebookId = 'N';
  const first = api.present(owner, anchor, [leaf], options), second = api.present(owner, anchor, [leaf], options);
  first.menu.resolve({ isCanceled: false, item: first.menu._panels[0].items[0] });await flush();assert.equal(calls.length, 1);api.dismiss(owner);
  view.bounds.width = 400;assert.equal(api.present(owner, anchor, rootRows, options), null);view.bounds.width = 1200;
  ctx.MenuDev = undefined;assert.equal(api.present(owner, anchor, rootRows, options), null, 'ordinary older MNUtils keeps its old menu');
  ctx.MenuDev = { new() { throw Error('must not construct partial API'); }, prototype: { show() {} } };assert.equal(api.present(owner, anchor, rootRows, options), null);
  ctx.MenuDev = class extends Menu { static new() { return { addItems() {}, show() {}, dismiss() {} }; } };assert.equal(api.present(owner, anchor, rootRows, options), null);
  ctx.MenuDev = class extends Menu { show() { throw Error('native creation failed'); } };assert.equal(api.present(owner, anchor, rootRows, options), null);assert.equal(errors.length, 1);errors.length = 0;
  let fallback = 0;
  ctx.MenuDev = class extends Menu { show() { return Promise.reject(Error('failed async')); } };
  assert(api.present(owner, anchor, rootRows, { ...options, fallback() { fallback++; } }));await flush();assert.equal(fallback, 1);assert.equal(errors.length, 1);errors.length = 0;
  ctx.MenuDev = Menu;
  let valid = true;handle = api.present(owner, anchor, [leaf], { ...options, valid: () => valid });valid = false;handle.menu._selectRow(handle.menu._panels[0], 0);await flush();assert.equal(calls.length, 1);

  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../src/CommentActionUI.js'), 'utf8'), ctx);
  const ui = ctx.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
  ui.image = () => null;
  let actual = [], mode;
  ctx.__MN_COMMENT_WORKFLOW_MENU__ = { buildItems(owner, context, currentMode) {
    mode = currentMode;
    return [{ title: 'Back', selector: 'backSingleWorkflowMenu:' }, { title: 'Saved', object: owner,
      selector: currentMode === 'single' ? 'runSingleWorkflow:' : 'runBatchWorkflow:', param: { token: context.token, noteId: context.noteId || '' } }];
  } };
  const app = { dynamicCommentContext: { token: 'single-token', noteId: 'A' }, runSingleWorkflow(value) { actual.push(value); }, runBatchWorkflow(value) { actual.push(value); } };
  let popup = ui.present(app, {}, [{ title: 'Workflow', selector: 'openSingleWorkflows:', param: { noteId: 'A', token: 'single-token' } }], 280, 0);
  popup.menu._selectRow(popup.menu._panels[0], 0);assert.equal(mode, 'single');assert.equal(actual.length, 0);
  assert.equal(popup.menu._panels[1].items.length, 1, 'parallel menus omit the legacy Back entry');
  popup.menu._selectRow(popup.menu._panels[1], 0);await flush();assert.equal(actual[0].token, 'single-token');
  app.batchCommentContext = { token: 'batch-token', notes: ['A', 'B'] };
  popup = ui.present(app, {}, [{ title: 'Workflow', selector: 'openBatchWorkflows:', param: { token: 'batch-token' } }], 280, 0);
  popup.menu._selectRow(popup.menu._panels[0], 0);assert.equal(mode, 'batch');
  app.batchCommentContext.token = 'stale';popup.menu._selectRow(popup.menu._panels[1], 0);await flush();assert.equal(actual.length, 1);
  ctx.MenuDev = undefined;let legacy = 0;ctx.MNUtil.getPopoverAndPresent = () => { legacy++;return {}; };
  ui.present(app, {}, [{ title: 'Workflow' }], 280, 0);assert.equal(legacy, 1);ctx.MenuDev = Menu;
  const cleanupOrder = [];
  ctx.__MN_BATCH_COMMENT_ACTIONS__ = { menuDismissed(owner, controller) { cleanupOrder.push('batch');return !!owner.batchConsumes; } };
  ctx.__MN_COMMENT_MOVE_MNCommentManagerAddon = { menuDismissed(owner, controller) { cleanupOrder.push('move');return !!owner.moveConsumes; } };
  ctx.__MN_DYNAMIC_COMMENT_ACTIONS__ = { handleMenuDismissed(owner, controller) { cleanupOrder.push('dynamic'); } };
  for (const mode of ['dynamic', 'batch', 'move']) {
    const originalHandle = { menu: {}, dismissPopoverAnimated() {} };originalHandle.self = originalHandle;
    const nativeOwner = { mncmActionPopover: originalHandle, batchConsumes: mode === 'batch', moveConsumes: mode === 'move' };
    cleanupOrder.length = 0;ui.menuDismissed(nativeOwner, originalHandle);
    assert.equal(nativeOwner.mncmActionPopover, null);
    assert.equal(cleanupOrder.join(','), mode === 'batch' ? 'batch' : mode === 'move' ? 'batch,move' : 'batch,move,dynamic');
  }
  console.log('CommentManager cascading menu compatibility passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
