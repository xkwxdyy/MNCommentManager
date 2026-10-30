const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY = '1';
const { setup } = require('./test-comment-move-integration');
delete process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY;
const runtime = process.env.MNCM_RUNTIME_DIR || path.join(__dirname, '..', 'src');
const cases = [];
function test(name, run) { run(); cases.push(name); }
function fixture(theme = 'Default', count = 4) {
  const f = setup({ count });
  f.routes = [];
  const app = f.context.Application.sharedInstance(); app.currentTheme = theme;
  f.context.Application.sharedInstance = () => app;
  f.context.MNUtil.getImage = file => ({ file });
  f.context.MNUtil.focusNoteInMindMapById = id => f.routes.push(['focus', id]);
  f.context.MNUtil.getPopoverAndPresent = (_sender, items) => { f.routes.push(['menu', items]); return { dismissPopoverAnimated() {} }; };
  f.context.__MN_COMMENT_WORKFLOW_MENU__ = { buildItems: (_addon, scope) => [{ title: 'Saved action', object: f.addon, selector: 'runSingleWorkflow:', param: { noteId: scope.noteId, token: scope.token } }] };
  f.context.__MN_WEB_API_MNCommentManagerAddon = {
    showPanel: () => f.routes.push(['manager']), syncCurrentNote() {},
  };
  f.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open: (_addon, scope) => { f.routes.push(['quickInput', scope.noteId]); return true; } };
  f.addon.layoutViewController = () => {};
  f.addon.webController = {};
  vm.runInContext(fs.readFileSync(path.join(runtime, 'CommentActionUI.js'), 'utf8'), f.context);
  f.actions.refreshButtons(f.addon);
  return f;
}
test('workflow panel handoff hides every follow entry and rejects delayed reattachment without losing its targets', () => {
  const f = fixture();
  for (const name of ['BatchCommentActions.js', 'CommentWorkflowMenu.js']) vm.runInContext(fs.readFileSync(path.join(runtime, name), 'utf8'), f.context);
  const context = f.addon.dynamicCommentContext;
  const batchContext = { token: 'workflow-batch', notes: [f.notes.one, f.notes.two] };
  f.addon.batchCommentContext = batchContext;
  for (const key of ['batchCommentButton', 'batchCommentMenuButton', 'batchCommentScopeLabel']) f.addon[key] = { hidden: false, enabled: true, userInteractionEnabled: true };
  f.addon.webController.view = { hidden: true, window: f.addon.window };
  f.context.__MN_WEB_API_MNCommentManagerAddon.showPanel = () => { f.addon.webController.view.hidden = false; f.routes.push(['manager']); };
  const button = f.addon.dynamicCommentMenuButton;
  f.addon.dynamicCommentButtonTouchDown(button); f.actions.handlePopupMenuClosed(f.addon);
  assert.equal(f.context.__MN_COMMENT_WORKFLOW_MENU__.openWorkflowManager(f.addon), true);
  const keys = ['dynamicCommentButton', 'dynamicCommentMenuButton', 'dynamicAddCommentButton', 'dynamicMoveCommentButton', 'batchCommentButton', 'batchCommentMenuButton', 'batchCommentScopeLabel'];
  for (const key of keys) { assert.equal(f.addon[key].hidden, true, key + ' must leave before the workflow panel opens'); assert.equal(f.addon[key].userInteractionEnabled, false); }
  f.advance(5000); f.actions.refreshButtons(f.addon); f.actions.relayout(f.addon);
  f.actions.handlePopupMenuOnNote(f.addon, { userInfo: { noteId: 'two' } });
  f.addon.onPopupMenuOnNote({ userInfo: { noteId: 'two' } });
  f.addon.onMindmapViewOnMultipleSelection({ userInfo: { selViewLst: [] } });
  f.context.__MN_BATCH_COMMENT_ACTIONS__.handleMultipleSelectionClosed(f.addon);
  f.advance(5000);
  assert.equal(f.addon.dynamicCommentContext, context); assert.equal(f.addon.batchCommentContext, batchContext);
  for (const key of keys) assert.equal(f.addon[key].hidden, true, key + ' cannot reattach over the panel');
  assert.equal(f.addon.dynamicCommentMenuButtonTapped(button), false);
  assert.equal(f.actions.openMenu(f.addon, button), false);
  assert.equal(f.routes.filter(route => route[0] === 'manager').length, 1);
  assert.equal(f.nativeMoves.length, 0);
  vm.runInContext(fs.readFileSync(path.join(runtime, 'WebBridgeCommands.js'), 'utf8'), f.context);
  f.context.__MN_WEB_API_MNCommentManagerAddon.syncCurrentNote = () => f.routes.push(['sync']);
  f.context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.workflowManagerClosed({ addon: f.addon, controller: f.addon.webController });
  assert.equal(f.addon.mncmWorkflowManagerModalOpen, false);
  assert.equal(f.addon.mncmWorkflowPanelOwnsEntries, true, 'inner closing keeps followers behind the main panel');
  const syncs = f.routes.filter(route => route[0] === 'sync').length;
  f.focus('two'); f.addon.onPopupMenuOnNote({ userInfo: { noteId: 'two' } }); f.advance(100);
  assert(f.routes.filter(route => route[0] === 'sync').length > syncs, 'ordinary manager selection synchronization resumes after inner closing');
  for (const key of keys) assert.equal(f.addon[key].hidden, true, 'inner closing must not revive ' + key);
  f.addon.mncmWorkflowPanelOwnsEntries = false; f.addon.webController.view.hidden = true;
  f.selectCard('two'); assert.equal(f.addon.dynamicCommentButton.hidden, false);
});
test('a plain dropdown or organize button stays alive throughout a native held touch', () => {
  for (const duration of [1300, 12000]) for (const [key, handler] of [['dynamicCommentMenuButton', 'dynamicCommentMenuButtonTapped'], ['dynamicMoveCommentButton', 'dynamicMoveCommentButtonTapped']]) {
    const f = fixture(), button = f.addon[key];
    f.addon.dynamicCommentButtonTouchDown(button);
    f.actions.handlePopupMenuClosed(f.addon);
    f.advance(duration);
    assert(f.addon.dynamicCommentContext, key + ' must survive past the former 900ms guard while still pressed');
    assert.equal(button.hidden, false);
    assert.notEqual(f.addon[handler](button), false);
    f.advance(100);
    assert(key === 'dynamicCommentMenuButton' ? f.addon.dynamicCommentMenuPopoverController : f.state(), 'release hands the target to its actual action');
    assert.equal(f.nativeMoves.length, 0);
  }
});
test('outside releases and control cancellations end held entries without running an action', () => {
  for (const key of ['dynamicCommentButton', 'dynamicCommentMenuButton', 'dynamicAddCommentButton', 'dynamicMoveCommentButton']) {
    const f = fixture(), button = f.addon[key];
    assert(button.events.some(event => event.selector === 'dynamicCommentButtonTouchEnded:' && event.mask === ((1 << 7) | (1 << 8))));
    assert.equal(typeof f.addon.dynamicCommentButtonTouchEnded, 'function');
    f.addon.dynamicCommentButtonTouchDown(button); f.actions.handlePopupMenuClosed(f.addon); f.advance(1300);
    assert(f.addon.dynamicCommentContext);
    f.addon.dynamicCommentButtonTouchEnded(button); f.advance(0);
    assert.equal(f.addon.dynamicCommentContext, null);
    assert.equal(f.routes.length, 0); assert.equal(f.nativeMoves.length, 0);
    f.selectCard('two');
    f.addon.dynamicCommentButtonTouchEnded(button); f.advance(1000);
    assert.equal(f.addon.dynamicCommentContext.noteId, 'two', 'a late end cannot close a new target');
  }
});
test('UIKit control cancellation preserves an active no-op long press until its terminal event', () => {
  for (const adding of [false, true]) for (const cancelFirst of [false, true]) for (const endState of [3, 4, 5]) {
    const f = fixture(), prefix = adding ? 'add' : 'management';
    f.settings[prefix + 'TapAction'] = 'quickInput'; f.settings[prefix + 'HoldAction'] = 'none'; f.actions.refreshButtons(f.addon);
    const button = f.addon[adding ? 'dynamicAddCommentButton' : 'dynamicCommentButton'];
    const long = adding ? 'dynamicAddCommentButtonLongPressed' : 'dynamicCommentButtonLongPressed';
    const click = adding ? 'dynamicAddCommentButtonTapped' : 'dynamicCommentButtonTapped';
    f.addon.dynamicCommentButtonTouchDown(button); f.actions.handlePopupMenuClosed(f.addon);
    if (cancelFirst) f.addon.dynamicCommentButtonTouchEnded(button);
    f.addon[long]({ state: 1, view: button });
    if (!cancelFirst) f.addon.dynamicCommentButtonTouchEnded(button);
    f.advance(12000);
    assert(f.addon.dynamicCommentContext, 'recognizing a long press cannot be confused with physical release');
    assert.equal(f.routes.length, 0);
    f.addon[long]({ state: endState, view: button });
    f.addon[click](button); f.advance(0);
    assert.equal(f.addon.dynamicCommentContext, null);
    assert.equal(f.routes.length, 0, 'a no-op hold cannot turn into an add action on release');
    f.selectCard('two'); f.addon.dynamicCommentButtonTouchDown(button); f.addon[click](button);
    assert.equal(f.routes.filter(row => row[0] === 'quickInput').length, 1);
  }
});
test('settings changes and deactivation clear held state without retaining a closed popup', () => {
  for (const changed of ['settings', 'disabled', 'inactive', 'card']) {
    const f = fixture(), button = f.addon.dynamicCommentMenuButton;
    f.addon.dynamicCommentButtonTouchDown(button); f.actions.handlePopupMenuClosed(f.addon); f.advance(1300);
    if (changed === 'settings') { f.settings.managementTapAction = 'none'; f.actions.refreshButtons(f.addon); }
    if (changed === 'disabled') { f.settings.enableDynamicSingleCardButton = false; f.actions.refreshButtons(f.addon); }
    if (changed === 'inactive') f.addon.sceneWillResignActive();
    if (changed === 'card') f.selectCard('two');
    f.advance(0);
    f.addon.dynamicCommentButtonTouchEnded(button); f.advance(1000);
    assert.equal(f.routes.length, 0);
    if (changed === 'card') assert.equal(f.addon.dynamicCommentContext.noteId, 'two');
    else assert.equal(f.addon.dynamicCommentContext, null);
  }
});
test('every saved tap and hold combination dispatches once with the current card', () => {
  const actions = ['manager', 'quickInput', 'menu', 'none'];
  let checks = 0;
  for (const adding of [false, true]) for (const tap of actions) for (const hold of actions) for (const holding of [false, true]) {
    const f = fixture(), prefix = adding ? 'add' : 'management';
    f.settings[prefix + 'TapAction'] = tap; f.settings[prefix + 'HoldAction'] = hold;
    const button = f.addon[adding ? 'dynamicAddCommentButton' : 'dynamicCommentButton'];
    f.addon.dynamicCommentButtonTouchDown(button);
    const wanted = holding ? hold : tap;
    const long = adding ? 'dynamicAddCommentButtonLongPressed' : 'dynamicCommentButtonLongPressed';
    const click = adding ? 'dynamicAddCommentButtonTapped' : 'dynamicCommentButtonTapped';
    const result = holding ? f.addon[long]({ state: 1, view: button }) : f.addon[click](button);
    assert.equal(result, wanted !== 'none', `${prefix} ${tap}/${hold} ${holding ? 'hold' : 'tap'}`);
    if (holding) {
      f.advance(1500);
      for (const state of [2, 3, 4, 5]) f.addon[long]({ state, view: button });
      f.addon[click](button);
    }
    const routed = f.routes.filter(row => ['manager', 'quickInput', 'menu'].includes(row[0]));
    assert.equal(routed.length, wanted === 'none' ? 0 : 1);
    if (wanted !== 'none') assert.equal(routed[0][0], wanted);
    assert.equal(f.nativeMoves.length, 0);
    checks++;
  }
  assert.equal(checks, 64);
});
test('a new touch after a cancelled long press works on the same or another control', () => {
  for (const target of ['dynamicCommentButton', 'dynamicAddCommentButton']) {
    const f = fixture(); f.settings.managementTapAction = 'quickInput'; f.settings.managementHoldAction = 'none';
    f.addon.dynamicCommentButtonTouchDown(f.addon.dynamicCommentButton);
    f.addon.dynamicCommentButtonLongPressed({ state: 1, view: f.addon.dynamicCommentButton });
    f.addon.dynamicCommentButtonTouchDown(f.addon[target]);
    f.addon[target === 'dynamicCommentButton' ? 'dynamicCommentButtonTapped' : 'dynamicAddCommentButtonTapped'](f.addon[target]);
    assert.equal(f.routes.filter(row => row[0] === 'quickInput').length, 1);
  }
});
test('all single-card entry controls reject a release from an older card selection', () => {
  for (const [key, handler] of [['dynamicCommentButton', 'dynamicCommentButtonTapped'], ['dynamicCommentMenuButton', 'dynamicCommentMenuButtonTapped'], ['dynamicAddCommentButton', 'dynamicAddCommentButtonTapped'], ['dynamicMoveCommentButton', 'dynamicMoveCommentButtonTapped']]) {
    const f = fixture(), button = f.addon[key];
    f.addon.dynamicCommentButtonTouchDown(button); f.selectCard('two');
    assert.equal(f.addon[handler](button), false, key);
    assert.equal(f.routes.length, 0); assert.equal(f.state(), null);
    f.addon.dynamicCommentButtonTouchDown(button);
    assert.notEqual(f.addon[handler](button), false, key + ' new touch');
  }
});
test('inactive scenes clear visible entries and refuse delayed selection callbacks', () => {
  const f = fixture();
  f.addon.sceneWillResignActive(); f.selectCard('two'); f.advance(5000);
  for (const key of ['dynamicCommentButton', 'dynamicCommentMenuButton', 'dynamicAddCommentButton', 'dynamicMoveCommentButton']) assert.equal(f.addon[key].hidden, true);
  assert.equal(f.addon.dynamicCommentContext, null);
  f.addon.sceneDidBecomeActive(); f.selectCard('two');
  assert.equal(f.addon.dynamicCommentButton.hidden, false);
});
test('inactive and foreign-window selection notifications cannot close the visible batch editor', () => {
  for (const inactive of [true, false]) {
    const f = fixture(); let cleared = 0, closed = 0;
    f.context.__MN_BATCH_COMMENT_ACTIONS__ = { handleMultipleSelection: () => { cleared++; return false; } };
    f.context.__MN_WEB_API_MNCommentManagerAddon.hidePanel = () => { closed++; };
    f.addon.webController = { panelMode: 'batch', view: { window: {} } };
    if (inactive) f.addon.mnCommentManagerSceneActive = false;
    else f.context.MNUtil.currentWindow = {};
    f.addon.onMindmapViewOnMultipleSelection({ userInfo: { selViewLst: [] } });
    assert.equal(cleared, 0); assert.equal(closed, 0);
  }
});
test('native layout callbacks keep visible controls inside resized viewports without changing targets', () => {
  for (const [width, height] of [[240, 320], [320, 240], [375, 667], [768, 320]]) {
    const f = fixture(); f.advance(5000);
    const token = f.addon.dynamicCommentContext.token;
    f.addon.mnCommentManagerInitialized = true;
    f.host.bounds = { x: 0, y: 0, width, height };
    f.addon.controllerWillLayoutSubviews(f.context.Application.sharedInstance().studyController());
    f.advance(1000);
    assert.equal(f.addon.dynamicCommentContext.token, token);
    for (const key of ['dynamicCommentButton', 'dynamicCommentMenuButton', 'dynamicAddCommentButton', 'dynamicMoveCommentButton']) {
      const button = f.addon[key], r = button.frame;
      assert(button.hidden || r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height, key + ' ' + width + 'x' + height);
    }
  }
});
test('follow controls refresh normal and selected colors and icon assets across themes', () => {
  const f = fixture(), ui = f.context.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
  const button = f.addon.dynamicCommentButton;
  button.setImageForState = image => { button.image = image; };
  for (const theme of ['Default', 'Dark', 'Gray', 'Default']) {
    f.context.Application.sharedInstance().currentTheme = theme;
    for (const selected of [undefined, true, false]) {
      ui.icon(f.addon, button, 'multi', '多选评论', selected);
      const palette = ui.palette();
      assert.equal(button.backgroundColor, selected ? palette.selected : palette.surface);
      assert.equal(button.layer.borderColor, selected ? palette.accent : palette.line);
      assert.equal(button.accessibilityValue, selected ? '已开启' : '');
      assert.equal(button.image.file.includes('/dark/'), theme !== 'Default');
    }
  }
  for (const variant of ['', 'dark']) for (const name of fs.readdirSync(path.join(runtime, 'action-icons', variant)).filter(name => name.endsWith('.png'))) {
    const png = fs.readFileSync(path.join(runtime, 'action-icons', variant, name));
    assert.equal(png.readUInt32BE(16), 72); assert.equal(png.readUInt32BE(20), 72);
  }
});
test('reused manager, dropdown, add and organize controls all refresh when the native theme changes', () => {
  const f = fixture(), ui = f.context.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
  Object.getPrototypeOf(f.addon.dynamicCommentButton).setImageForState = function (image) { this.image = image; };
  f.actions.disposeButton(f.addon, 'theme.fixture');
  f.selectCard('one');
  const controls = [
    ['dynamicCommentButton', 'manager'], ['dynamicCommentMenuButton', 'down'],
    ['dynamicAddCommentButton', 'add'], ['dynamicMoveCommentButton', 'organize'],
  ].map(([key, icon]) => ({ key, icon, button: f.addon[key] }));
  for (const theme of ['Default', 'Gray', 'Dark', 'Default']) {
    f.context.Application.sharedInstance().currentTheme = theme;
    for (const refresh of [() => f.actions.refreshButtons(f.addon), () => f.selectCard('one')]) {
      refresh();
      const palette = ui.palette();
      for (const { key, icon, button } of controls) {
        assert.equal(f.addon[key], button, 'theme changes must reuse ' + key);
        assert.equal(button.backgroundColor, palette.surface, key + ' background in ' + theme);
        assert.equal(button.layer.borderColor, palette.line, key + ' border in ' + theme);
        assert(button.image.file.endsWith('/action-icons/' + (palette.dark ? 'dark/' : '') + icon + '.png'), key + ' icon in ' + theme);
      }
    }
  }
});
test('organizing surfaces and picker rows use the same dark palette as their icons', () => {
  for (const theme of ['Dark', 'Gray']) for (const count of [4, 7]) {
    const f = fixture(theme, count); f.open();
    const state = f.state(), p = f.context.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon.palette();
    f.context.__MN_COMMENT_MOVE_VIEWS_MNCommentManagerAddon.showPicker(f.addon, state);
    assert.equal(state.views.rail.backgroundColor, p.surface);
    assert.equal(state.views.picker.backgroundColor, p.surface);
    for (const row of state.views.pickerRows) assert.equal(row.backgroundColor, p.section);
    assert.equal(f.notes.one.comments.length, count);
  }
});
test('long-list move controls show their disabled state while a mutation is pending', () => {
  const f = fixture('Default', 7); f.choose(2);
  const state = f.state(); state.history.push({}); state.mutationPending = true;
  f.context.__MN_COMMENT_MOVE_VIEWS_MNCommentManagerAddon.render(state);
  for (const key of ['up', 'down', 'undo']) { assert.equal(state.views[key].enabled, false); assert.equal(state.views[key].alpha, 0.3); }
});
console.log(JSON.stringify({ passed: cases.length, configuredGestureRoutes: 64, cases }, null, 2));
