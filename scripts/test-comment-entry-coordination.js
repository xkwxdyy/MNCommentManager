const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.env.MNCM_RUNTIME_DIR || path.join(__dirname, '..', 'src');
function fixture(methodCells = true) {
  const allocated = [], nativeCalls = [], fallback = [];
  class View {
    constructor(frame = {}) { this.frame = frame; this.bounds = { x: 0, y: 0, width: frame.width, height: frame.height }; this.layer = {}; this.subviews = []; this.events = []; this.titleLabel = {}; allocated.push(this); }
    addSubview(view) { this.subviews.push(view); view.superview = this; }
    setTitleForState(value) { this.title = value; }
    setImageForState(value) { this.image = value; }
    addTargetActionForControlEvents(target, selector, events) { this.events.push({ target, selector, events }); }
    convertRectToView() { return this.frame; }
    sendActionToForEvent(selector, target, event) { nativeCalls.push({ selector, target, event, param: this.param }); }
  }
  class Popover {
    constructor(controller) { this.contentViewController = controller; this.dismissCalls = []; }
    dismissPopoverAnimated(value) { this.dismissCalls.push(value); assert.equal(this.delegate, null, 'replacement and dispatch must detach dismissal before closing'); }
    presentPopoverFromRect(rect, host, position) { this.anchor = { rect, host, position }; }
  }
  const host = new View({ x: 0, y: 0, width: 320, height: 480 });
  const c = vm.createContext({ console, UIView: View, UILabel: View, UIImageView: View, UIScrollView: View,
    MenuController: { new: () => { const controller = {}; Object.defineProperty(controller, 'menuTableView', { get() { if (!controller.cells) controller.cells = controller.commandTable.map((_, row) => ({ row, textLabel: {}, imageView: {} })); return { visibleCells: methodCells ? () => controller.cells : controller.cells, indexPathForCell: cell => ({ row: cell.row }) }; } }); return controller; } }, UIButton: { buttonWithType: () => new View() }, UIPopoverController: Popover,
    UIFont: { boldSystemFontOfSize: n => n, systemFontOfSize: n => n },
    MNUtil: { studyView: host, hexColorAlpha: v => v, getImage: file => ({ file }), getPopoverAndPresent: (...args) => { fallback.push(args); return { fallback: true }; } }
  });
  vm.runInContext(fs.readFileSync(path.join(runtime, 'CommentActionUI.js'), 'utf8'), c);
  return { ui: c.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon, c, allocated, nativeCalls, fallback, host, View };
}
const cases = [];
function test(name, body) { body(); cases.push(name); }
test('custom menus preserve native targets and exact workflow payloads while fitting narrow hosts', () => {
  const f = fixture(), addon = { mainPath: runtime, dynamicCommentContext: { noteId: 'one', token: 'current' } };
  const payload = { token: 'current', workflow: { id: 'user.custom', name: '清空所有评论', steps: [{ actionId: 'clearAllComments' }] } };
  const entries = [{ title: '── header ──', object: addon, selector: 'noopBatchCommentAction:' }, { title: '清空所有评论', object: addon, selector: 'runSingleWorkflow:', param: payload }, { title: '评论整理', object: addon, selector: 'openQuickCommentPanel:', param: { noteId: 'one' } }];
  const snapshot = () => JSON.stringify(entries.map(({ title, selector, param }) => ({ title, selector, param })));
  const before = snapshot();
  const popover = f.ui.present(addon, new f.View({ x: 10, y: 20, width: 44, height: 44 }), entries, 400, 2, { title: '整卡操作', subtitle: '当前卡片' });
  const rows = popover.contentViewController.commandTable.filter(item => item.selector !== 'noopBatchCommentAction:');
  assert.equal(rows.length, 2); assert.equal(rows[0].object, entries[1].object); assert.equal(rows[1].object, entries[2].object);
  assert.equal(rows[0].param, payload); assert.equal(rows[0].title.trim(), '清空所有评论', 'custom workflow names cannot be rewritten');
  assert.equal(snapshot(), before); assert.equal(popover.contentViewController.rowHeight, 44);
  assert(popover.contentViewController.preferredContentSize.width <= 304);
  assert(popover.contentViewController.preferredContentSize.height <= 416);
  assert.equal(f.ui.describe({ title: '清空所有评论', selector: 'runSingleWorkflow:', param: { workflow: { id: 'builtin.clearAllComments', steps: [{ actionId: 'clearAllComments' }] } } }).title, '清空评论…');
  assert.equal(rows[0].selector, 'runSingleWorkflow:'); assert.equal(rows[0].param, payload);
  const cells = popover.contentViewController.cells;
  assert(cells.filter(cell => !cell.userInteractionEnabled).length >= 2, 'scope and section headings cannot execute a command');
  assert.equal(addon.dynamicCommentContext.token, 'current');
});
test('native visibleCells method and property both preserve section hierarchy and indentation', () => {
  for (const method of [true, false]) {
    const f = fixture(method), addon = { mainPath: runtime };
    const entries = [{ title: '打开多卡评论编辑器', object: addon, selector: 'openBatchCommentEditor:' }, { title: '自定义动作', object: addon, selector: 'runBatchWorkflow:', param: { workflowId: 'saved' } }];
    const menu = f.ui.present(addon, new f.View({ x: 100, y: 200, width: 44, height: 44 }), entries, 280, 2).contentViewController;
    assert.equal(menu.commandTable.filter(row => row.selector !== 'noopBatchCommentAction:').length, entries.length);
    for (const cell of menu.cells) {
      if (cell.userInteractionEnabled) { assert.equal(cell.indentationLevel, 1); assert.equal(cell.indentationWidth, 20); assert(cell.imageView.image); }
      else { assert.equal(cell.indentationLevel, 0); assert.equal(cell.textLabel.font, 12); assert.match(cell.accessibilityLabel, /分组标题/); assert.equal(cell.imageView.image, null); }
    }
    assert(menu.commandTable.some(row => row.title === '── 打开面板 ──'));
    assert(!menu.commandTable.some(row => row.title.includes('评论工具')));
  }
});
test('selection commands keep their meaning and custom names cannot become hidden headers', () => {
  const f = fixture(), addon = { mainPath: runtime };
  assert.equal(f.ui.describe({ title: '全选评论', selector: 'runQuickCommentAction:', param: { action: 'selectAll' } }).icon, 'select-all');
  assert.equal(f.ui.describe({ title: '全选评论', selector: 'runQuickCommentAction:', param: { action: 'selectAll' } }).group, '选择范围');
  const deletion = f.ui.describe({ title: '删除所选评论…', selector: 'runQuickCommentAction:', param: { action: 'delete' } });
  assert.equal(deletion.group, '所选评论'); assert.equal(deletion.danger, true);
  const item = { title: '── 自定义工作流', object: addon, selector: 'runBatchWorkflow:', param: { workflow: { id: 'custom', steps: [] } } };
  const menu = f.ui.present(addon, new f.View({ width: 44, height: 44 }), [item], 280, 2).contentViewController;
  assert(menu.commandTable.some(row => row.selector === item.selector && row.title.trim() === item.title));
  assert.equal(f.ui.describe({ title: '  ↩ 原样保留 ➡️', selector: 'runBatchWorkflow:', param: { workflow: { id: 'custom', steps: [] } } }).title, '↩ 原样保留 ➡️');
});
test('menu replacement cannot clear the single-card selection and preserves configured order', () => {
  const f = fixture(), addon = { mainPath: runtime, dynamicCommentContext: { token: 'one' } }, anchor = new f.View({ width: 44, height: 44 });
  const entries = ['second', 'first'].map(id => ({ title: id, object: addon, selector: 'runSingleWorkflow:', param: { workflowId: id } }));
  const before = f.ui.present(addon, anchor, entries, 280, 2);
  const next = f.ui.present(addon, anchor, entries.slice().reverse(), 280, 2);
  assert.equal(before.dismissCalls.length, 1); assert.equal(addon.dynamicCommentContext.token, 'one'); assert.equal(addon.mncmActionPopover, next);
  assert.deepEqual(Array.from(next.contentViewController.commandTable.filter(item => item.selector !== 'noopBatchCommentAction:'), item => item.param.workflowId), ['first', 'second']);
});
test('missing native presentation support uses the existing menu without changing payloads', () => {
  const f = fixture(), entries = [{ title: 'Action', param: { token: 'one' }, selector: 'action:' }]; delete f.c.MenuController;
  assert.equal(f.ui.present({}, {}, entries, 280, 2).fallback, true); assert.equal(f.fallback[0][1], entries);
});
test('selected icon state remains semantic and all shipped images are valid PNG assets', () => {
  const f = fixture(), button = new f.View(); f.ui.icon({ mainPath: runtime }, button, 'multi', '结束多选', true);
  assert.equal(button.accessibilityLabel, '结束多选'); assert.equal(button.accessibilityValue, '已开启'); assert.equal(button.backgroundColor, '#edf3ff');
  for (const name of ['manager', 'add', 'organize', 'batch', 'down', 'edit', 'multi', 'empty', 'select-all', 'clear', 'copy', 'extract', 'fold', 'expand']) {
    const data = fs.readFileSync(path.join(runtime, 'action-icons', name + '.png')); assert.equal(data.subarray(1, 4).toString(), 'PNG'); assert.equal(data.readUInt32BE(16), 72); assert.equal(data.readUInt32BE(20), 72);
  }
});
test('immersive capsule bounds constrain popup height and near-edge presentation direction', () => {
  const f = fixture(), addon = {}; f.c.__MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon = { available: () => ({ x: 0, y: 90, width: 320, height: 390 }) };
  const side = f.ui.geometry(addon, f.host, new f.View({ x: 200, y: 260, width: 44, height: 44 }), 30, 300, 0);
  assert(side.height <= 308); assert(260 + 22 - side.height / 2 >= 90);
  const lower = f.ui.geometry(addon, f.host, new f.View({ x: 200, y: 420, width: 44, height: 44 }), 30, 300, 0);
  assert.equal(lower.position, 2); assert(lower.height <= 314);
});
process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY = '1';
const { setup } = require('./test-comment-move-integration'); delete process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY;
test('native multi-selection all and clear change only selection, retaining comments and media', () => {
  const f = setup({ count: 3, foldable: true, foldRevision: true }); f.open(); const state = f.state(), original = JSON.stringify(f.notes.one.comments);
  f.addon.toggleQuickCommentSelection(state.views.multi);
  assert.equal(state.views.undo.hidden, true, 'selection controls must never overlap the undo button');
  assert.equal(f.addon.selectAllQuickComments(state.views.selectAll), true);
  assert.deepEqual(Array.from(state.selectedIndices), [0, 1, 2]);
  assert.equal(state.views.selectAll.enabled, false); assert.equal(state.views.clearSelection.enabled, true);
  assert.equal(f.addon.clearQuickCommentSelection(state.views.clearSelection), true);
  assert.deepEqual(Array.from(state.selectedIndices), []); assert.equal(state.views.clearSelection.enabled, false);
  assert.equal(JSON.stringify(f.notes.one.comments), original); assert.equal(f.nativeMoves.length, 0);
  f.addon.toggleQuickCommentSelection(state.views.multi);
  assert.equal(state.views.selectAll.hidden, true); assert.equal(state.views.multi.accessibilityLabel, '多选评论');
});
test('long press cannot consume the following menu tap and notebook close invalidates batch selection', () => {
  const f = setup(); let opens = 0, menus = 0, closes = 0;
  f.context.__MN_BATCH_COMMENT_ACTIONS__ = {
    openEditor: () => { opens++; }, openMenu: () => { menus++; },
    beginLongPress: () => true, endInteraction: () => true, endLongPress: () => true,
    hideButton: addon => { addon.batchCommentContext = null; closes++; }
  };
  f.addon.batchCommentButtonLongPressed({ state: 1, view: {} });
  f.addon.batchCommentButtonTapped({});
  assert.equal(opens, 1); assert.equal(menus, 1);
  f.addon.batchCommentContext = { notes: ['old-a', 'old-b'], token: 'old' };
  f.addon.notebookWillClose();
  assert.equal(f.addon.batchCommentContext, null); assert.equal(closes, 1);
});
test('single-card labels follow saved tap and hold actions after settings change', () => {
  const f = setup();
  f.settings.managementTapAction = 'quickInput'; f.settings.managementHoldAction = 'none';
  f.selectCard(); f.advance(400);
  assert.equal(f.addon.dynamicCommentButton.accessibilityLabel, '添加评论');
  assert.equal(f.addon.dynamicCommentButton.accessibilityValue, '点按：添加评论；长按：不执行操作');
  f.settings.managementTapAction = 'manager'; f.settings.managementHoldAction = 'menu';
  f.selectCard(); f.advance(400);
  assert.equal(f.addon.dynamicCommentButton.accessibilityLabel, '评论管理器');
  assert.equal(f.addon.dynamicCommentButton.accessibilityValue, '点按：评论管理器；长按：整卡操作');
});
console.log(JSON.stringify({ passed: cases.length, cases }, null, 2));
