const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const timers = [];
function takePrimaryTimer() {
  const index = timers.findIndex(timer => ![0.12, 0.3].includes(timer.seconds));
  assert(index >= 0, 'expected primary lifecycle timer');
  return timers.splice(index, 1)[0];
}
const hostView = {
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  subviews: [],
  addSubview(view) { view.superview = this; this.subviews.push(view); },
  viewWithTag(tag) { return this.subviews.find((view) => Number(view.tag) === Number(tag)) || null; },
};
const pinnerButton = { tag: 9205101, frame: { x: 210, y: 102, width: 36, height: 36 }, hidden: false, enabled: true, userInteractionEnabled: true, layer: { opacity: 1 } };
hostView.addSubview(pinnerButton);
const addonWindow = { id: "addon-window" };
let focusNoteId = "";

const context = {
  console: { log() {} },
  Date,
  Math,
  Object,
  Array,
  Number,
  String,
  UIButton: {
    buttonWithType() {
      return {
        layer: {},
        titleLabel: {},
        targetActions: [],
        addTargetActionForControlEvents(_target, selector, events) { this.targetActions.push({ selector, events }); },
        removeFromSuperview() {
          const parent = this.superview;
          if (parent && Array.isArray(parent.subviews)) {
            const index = parent.subviews.indexOf(this);
            if (index >= 0) parent.subviews.splice(index, 1);
          }
          this.superview = null;
        },
        setTitleForState() {},
        setTitleColorForState() {},
      };
    },
  },
  UIFont: { boldSystemFontOfSize() { return {}; } },
  NSTimer: { scheduledTimerWithTimeInterval(seconds, _repeats, callback) { timers.push({ seconds, callback }); } },
  MNUtil: {
    currentWindow: addonWindow,
    studyView: hostView,
    mindmapView: { selViewLst: [] },
    hexColorAlpha(value) { return value; },
    getPopoverAndPresent(button, commandTable) {
      const popover = {
        button,
        commandTable,
        dismissCalls: [],
        dismissPopoverAnimated(animated) { this.dismissCalls.push(animated); },
      };
      return popover;
    },
    confirm() { throw new Error("single-card actions must not request confirmation"); },
  },
  MNNote: {
    new(noteId) { return noteId ? { noteId: String(noteId), comments: [] } : null; },
    getFocusNote(checkLatestSelection) {
      assert.strictEqual(checkLatestSelection, true);
      return focusNoteId ? { noteId: focusNoteId, comments: [] } : null;
    },
  },
  __MN_COMMENT_ACTION_SETTINGS__: { getSettings() { return { enableDynamicSingleCardButton: true }; } },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentWorkflowStore.js"), "utf8"), context);
const templates = context.__MN_COMMENT_WORKFLOW_STORE__.templates();
context.__MN_COMMENT_WORKFLOW_STORE__.list = () => templates;
context.__MN_COMMENT_WORKFLOW_REGISTRY__ = { getCatalog: () => [], getPresets: () => [], getAction: (id) => ({ id }) };
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentWorkflowMenu.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "DynamicCommentActions.js"), "utf8"), context);

(async function run() {
const actions = context.__MN_DYNAMIC_COMMENT_ACTIONS__;
const addon = { window: addonWindow };
const sender = { userInfo: { noteid: "single-note", winRect: { x: 100, y: 100, width: 100, height: 40 } } };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
const revealTimer = takePrimaryTimer();
assert.strictEqual(revealTimer.seconds, 0.02);
revealTimer.callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, false);
assert.deepStrictEqual(addon.dynamicCommentButton.targetActions, [
  { selector: "dynamicCommentButtonTouchDown:", events: 1 << 0 },
  { selector: "dynamicCommentButtonTapped:", events: 1 << 6 },
]);

const dynamicFrame = addon.dynamicCommentButton.frame;
const overlap = Math.max(0, Math.min(dynamicFrame.x + dynamicFrame.width, pinnerButton.frame.x + pinnerButton.frame.width) - Math.max(dynamicFrame.x, pinnerButton.frame.x)) *
  Math.max(0, Math.min(dynamicFrame.y + dynamicFrame.height, pinnerButton.frame.y + pinnerButton.frame.height) - Math.max(dynamicFrame.y, pinnerButton.frame.y));
assert.strictEqual(overlap, 0, "dynamic button must avoid MNPinner's visible follow button");
assert.strictEqual(addon.dynamicAddCommentButton.hidden, false);
assert.strictEqual(addon.dynamicAddCommentButton.frame.width, 44);
assert.strictEqual(addon.dynamicCommentButton.frame.height, 44);
const addFrame = addon.dynamicAddCommentButton.frame;
assert.strictEqual(Math.max(0, Math.min(addFrame.x + addFrame.width, pinnerButton.frame.x + pinnerButton.frame.width) - Math.max(addFrame.x, pinnerButton.frame.x)) * Math.max(0, Math.min(addFrame.y + addFrame.height, pinnerButton.frame.y + pinnerButton.frame.height) - Math.max(addFrame.y, pinnerButton.frame.y)), 0);

assert.strictEqual(actions.beginInteraction(addon), true);
assert.strictEqual(actions.handlePopupMenuClosed(addon), true);
const guardedHideTimer = takePrimaryTimer();
assert.strictEqual(guardedHideTimer.seconds, 0.18);
guardedHideTimer.callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, false, "touch-down hold must outlive the popup-close delay");
assert(addon.dynamicCommentContext, "touch-down hold must preserve the card context until long press begins");

actions.suppressTapAfterLongPress(addon);
assert.strictEqual(actions.openMenu(addon, addon.dynamicCommentButton), true);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.commandTable.length, 9);
assert.deepStrictEqual(
  Array.from(addon.dynamicCommentMenuPopoverController.commandTable, (item) => String(item.selector)),
  ["noopBatchCommentAction:", "runSingleWorkflow:", "runSingleWorkflow:", "runSingleWorkflow:", "runSingleWorkflow:",
    "openSingleWorkflows:", "runSingleWorkflow:", "runSingleWorkflow:", "openWorkflowManager:"],
);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.delegate, addon);
const invalidLinkParent = addon.dynamicCommentMenuPopoverController.commandTable.find((item) => item.param?.section === "links");
assert(invalidLinkParent);
assert.strictEqual(actions.openSingleWorkflows(addon, invalidLinkParent), true);
assert.deepStrictEqual(
  Array.from(addon.dynamicCommentMenuPopoverController.commandTable, (item) => String(item.selector)),
  ["backSingleWorkflowMenu:", "runSingleWorkflow:", "runSingleWorkflow:", "runSingleWorkflow:", "openWorkflowManager:"],
);
assert.strictEqual(actions.backSingleWorkflowMenu(addon), true);
const conversionItem = addon.dynamicCommentMenuPopoverController.commandTable.find((item) => item.param?.workflow?.steps[0]?.actionId === "convertNotesToNoExcerpt");
assert(conversionItem);
assert.strictEqual(conversionItem.param.noteId, "single-note");
assert.strictEqual(actions.consumeTapSuppression(addon), true);
assert.strictEqual(actions.consumeTapSuppression(addon), false);
const firstSingleCardPopover = addon.dynamicCommentMenuPopoverController;
assert.strictEqual(actions.handleMenuDismissed(addon, firstSingleCardPopover), true);
assert.strictEqual(addon.dynamicCommentButton.hidden, true, "dismissing the single-card popover must hide the button");
assert.strictEqual(addon.dynamicCommentContext, null);

assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
takePrimaryTimer().callback();
actions.beginInteraction(addon);
actions.suppressTapAfterLongPress(addon);
assert.strictEqual(actions.openMenu(addon, addon.dynamicCommentButton), true);
const mutationCalls = [];
const actionContracts = [
  ["runKeepFirstContent", "keepFirstContentForNotes"],
  ["runConvertHtmlToMarkdown", "convertHtmlCommentsToMarkdownForNotes"],
  ["runConvertToNoExcerpt", "convertNotesToNoExcerptForNotes"],
  ["runRemoveAllLinks", "removeAllLinkCommentsForNotes"],
  ["runClearAllComments", "clearAllCommentsForNotes"],
  ["runClearAllTitles", "clearAllTitlesForNotes"],
];
context.__MN_COMMENT_MUTATIONS__ = {};
actionContracts.forEach(([, mutationName]) => {
  context.__MN_COMMENT_MUTATIONS__[mutationName] = (notes, options) => {
    mutationCalls.push({ mutationName, notes, options });
    return { total: notes.length, changed: notes.length, mutationName };
  };
});
const activeConversionItem = addon.dynamicCommentMenuPopoverController.commandTable.find((item) => item.param?.workflow?.steps[0]?.actionId === "convertNotesToNoExcerpt");
const activeSingleCardPopover = addon.dynamicCommentMenuPopoverController;
const conversionResult = await actions.runConvertToNoExcerpt(addon, activeConversionItem.param);
assert.deepStrictEqual(activeSingleCardPopover.dismissCalls, [true], "selecting an item must dismiss the native popover");
assert.strictEqual(addon.dynamicCommentMenuPopoverController, null);
assert.strictEqual(addon.dynamicCommentContext, null);
for (const [actionName] of actionContracts) {
  if (actionName === "runConvertToNoExcerpt") continue;
  await actions[actionName](addon, activeConversionItem.param);
}
assert.strictEqual(conversionResult.changed, 1);
assert.deepStrictEqual(mutationCalls.map((call) => call.mutationName).sort(), actionContracts.map(([, mutationName]) => mutationName).sort());
mutationCalls.forEach((call) => {
  assert.strictEqual(call.notes.length, 1);
  assert.strictEqual(call.notes[0].noteId, "single-note");
  assert.strictEqual(call.options.allowSingle, true);
});
assert.strictEqual(addon.dynamicCommentButton.hidden, true);

assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
takePrimaryTimer().callback();
actions.beginInteraction(addon);
actions.suppressTapAfterLongPress(addon);
assert.strictEqual(actions.openMenu(addon, addon.dynamicCommentButton), true);
const rejectedSingleCardPopover = addon.dynamicCommentMenuPopoverController;
assert.throws(
  () => actions.runClearAllTitles(addon, "different-note"),
  /单选卡片已变化/,
);
assert.deepStrictEqual(rejectedSingleCardPopover.dismissCalls, [true], "failed item actions must also dismiss the native popover");
assert.strictEqual(addon.dynamicCommentMenuPopoverController, null);
assert.strictEqual(addon.dynamicCommentContext, null);

assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
takePrimaryTimer().callback();
assert.strictEqual(actions.handlePopupMenuClosed(addon), true);
const hideTimer = takePrimaryTimer();
assert.strictEqual(hideTimer.seconds, 0.18);
hideTimer.callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, true, "an idle popup close must still hide the button");

context.MNUtil.mindmapView.selViewLst = [{ note: { noteId: "note-a" } }, { note: { noteId: "note-b" } }];
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true, "PopupMenuOnNote's noteId must outrank stale selection state");
takePrimaryTimer().callback();
assert.strictEqual(addon.dynamicCommentContext.noteId, "single-note");
actions.hideButton(addon, "test.cleanup");

context.MNUtil.currentWindow = { id: "other-window" };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), false, "inactive addon windows must ignore global PopupMenu notifications");
context.MNUtil.currentWindow = addonWindow;

context.MNUtil.mindmapView.selViewLst = [];
focusNoteId = "focus-fallback";
const senderWithoutNoteId = { userInfo: { winRect: { x: 80, y: 80, width: 80, height: 30 } } };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, senderWithoutNoteId), true);
takePrimaryTimer().callback();
assert.strictEqual(addon.dynamicCommentContext.noteId, "focus-fallback", "MNNote.getFocusNote(true) must cover PopupMenu payloads without noteId");
const configured = { enableDynamicSingleCardButton: true, showQuickCommentButton: false, managementTapAction: "none", managementHoldAction: "quickInput", addTapAction: "menu" };
context.__MN_COMMENT_ACTION_SETTINGS__.getSettings = () => configured;
actions.refreshButtons(addon);
assert.strictEqual(addon.dynamicAddCommentButton.hidden, true);
assert.strictEqual(actions.dispatchAction(addon, false, false), false);
let quickOpens = 0;
context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open(target, captured) { quickOpens += 1; assert.strictEqual(captured.noteId, "focus-fallback"); actions.hideButton(target, "quick-input.open"); } };
assert.strictEqual(actions.dispatchAction(addon, false, true), true);
assert.strictEqual(quickOpens, 1);
assert.strictEqual(actions.dispatchAction(addon, false, false), false, "release after a configured long-press must remain suppressed after the button hides");
assert.strictEqual(actions.disposeButton(addon, "test.done"), true);
assert.strictEqual(addon.dynamicCommentButton, null);
assert.strictEqual(hostView.viewWithTag(9304102), null, "disconnect cleanup must remove the selector-bound native button");
assert.strictEqual(hostView.viewWithTag(9304103), null);

configured.showQuickCommentButton = true;
const area = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const group = () => ({ ...addon.dynamicCommentButton.frame, width: 92 });
timers.length = 0;
hostView.convertRectFromView = rect => ({ ...rect, x: rect.x - 60, y: rect.y - 30 });
context.PopupMenu = { currentMenu: () => ({ targetWinRect: sender.userInfo.winRect, frame: { x: 18, y: 5, width: 350, height: 60 } }) };
assert(actions.handlePopupMenuOnNote(addon, sender)); takePrimaryTimer().callback();
assert.strictEqual(area(group(), { x: 40, y: 70, width: 100, height: 40 }), 0, 'window anchor must be converted into host coordinates');
assert.strictEqual(area(group(), context.PopupMenu.currentMenu().frame), 0, 'native popup must be avoided');
const extra = { tag: 9205103, frame: group(), hidden: false, layer: { opacity: 1 } };
hostView.addSubview(extra);
const refreshIndex = timers.findIndex(timer => timer.seconds === 0.12);
timers.splice(refreshIndex, 1)[0].callback();
assert.strictEqual(area(group(), extra.frame), 0, 'deferred reveal of the Pinner extra button must reposition the entire pair');
assert.strictEqual(addon.dynamicAddCommentButton.frame.x, addon.dynamicCommentButton.frame.x + 48);
actions.hideButton(addon, 'closed-before-refresh');
timers.forEach(timer => timer.callback()); timers.length = 0;
assert.strictEqual(addon.dynamicCommentButton.hidden, true, 'late placement refresh must not resurrect closed buttons');
extra.hidden = true;
delete hostView.convertRectFromView;
delete context.PopupMenu;
const toolbar = { mntoolbar: true, frame: { x: 0, y: 0, width: 600, height: 400 }, hidden: false, enabled: false };
hostView.addSubview({ subviews: [toolbar] });
assert(actions.handlePopupMenuOnNote(addon, sender)); takePrimaryTimer().callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, true, 'no free slot must hide the group instead of covering a visible toolbar');
assert.strictEqual(addon.dynamicAddCommentButton.hidden, true);
toolbar.hidden = true;
actions.refreshButtons(addon);
assert.strictEqual(addon.dynamicCommentButton.hidden, false, 'hidden ancestors and toolbars must not reserve space');
actions.disposeButton(addon, 'layout-test.done');
addon.quickCommentController = {};
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), false, 'an active editor must keep its fixed target');
for (const marker of ['_quickClosePending', '_quickExiting']) {
  addon.quickCommentController = { [marker]: true };
  assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true, 'closing and saved-exit windows must allow the next floating entry');
  takePrimaryTimer().callback(); assert.strictEqual(addon.dynamicCommentButton.hidden, false);
}
addon.quickCommentController = null;
actions.disposeButton(addon, 'transition-test.done');

const ids = ['management', 'add', 'move'];
const properties = { management: 'dynamicCommentButton', add: 'dynamicAddCommentButton', move: 'dynamicMoveCommentButton' };
const keys = { management: 'showManagementButton', add: 'showQuickCommentButton', move: 'showMoveCommentButton' };
const permutations = ids.flatMap(first => ids.filter(id => id !== first).map(second => [first, second, ids.find(id => id !== first && id !== second)]));
let combinations = 0;
for (const count of [0, 1, 2]) {
  context.MNNote.new = noteId => ({ noteId, comments: Array.from({ length: count }, () => ({})) });
  for (const order of permutations) for (let mask = 0; mask < 8; mask++) {
    actions.disposeButton(addon, 'combination.reset'); timers.length = 0;
    Object.assign(configured, { enableDynamicSingleCardButton: true, dynamicButtonOrder: order });
    ids.forEach((id, index) => { configured[keys[id]] = !!(mask & (1 << index)); });
    assert(actions.handlePopupMenuOnNote(addon, sender)); takePrimaryTimer().callback();
    const expected = order.filter(id => configured[keys[id]] && (id !== 'move' || count > 1));
    const actual = ids.filter(id => addon[properties[id]] && !addon[properties[id]].hidden)
      .sort((a, b) => addon[properties[a]].frame.x - addon[properties[b]].frame.x);
    assert.deepStrictEqual(actual, expected, `combination ${mask}, comments ${count}, order ${order}`);
    expected.forEach((id, index) => {
      const button = addon[properties[id]];
      assert.strictEqual(button.enabled, true);
      assert.strictEqual(button.userInteractionEnabled, true);
      assert.strictEqual(button.frame.x, addon[properties[expected[0]]].frame.x + index * 48, 'hidden buttons must not leave gaps');
    });
    ids.filter(id => !expected.includes(id)).forEach(id => assert(!addon[properties[id]], 'disabled buttons need no native view'));
    combinations++;
  }
}
assert.strictEqual(combinations, 144);

// Turning off the management button leaves the add button as the real menu anchor.
Object.assign(configured, { showManagementButton: false, showQuickCommentButton: true, showMoveCommentButton: false, addTapAction: 'menu' });
actions.disposeButton(addon, 'add-only.reset'); timers.length = 0;
actions.handlePopupMenuOnNote(addon, sender); takePrimaryTimer().callback();
assert.strictEqual(addon.dynamicCommentButton, null);
assert.strictEqual(actions.dispatchAction(addon, false, false), false, 'disabled management actions are ignored');
assert.strictEqual(actions.dispatchAction(addon, true, false), true);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.button, addon.dynamicAddCommentButton);
actions.openSingleWorkflows(addon, { noteId: 'single-note', section: 'links' });
assert.strictEqual(addon.dynamicCommentMenuPopoverController.button, addon.dynamicAddCommentButton);
actions.backSingleWorkflowMenu(addon);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.button, addon.dynamicAddCommentButton);
actions.openSingleInvalidLinkMenu(addon);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.button, addon.dynamicAddCommentButton);
actions.backSingleInvalidLinkMenu(addon);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.button, addon.dynamicAddCommentButton);

const dismissedOnSettings = addon.dynamicCommentMenuPopoverController;
actions.beginInteraction(addon);
configured.showQuickCommentButton = false;
actions.refreshButtons(addon);
assert.deepStrictEqual(dismissedOnSettings.dismissCalls, [false]);
assert.strictEqual(addon.dynamicCommentMenuPopoverController, null);
assert.strictEqual(addon.dynamicAddCommentButton.hidden, true);
assert.strictEqual(addon.dynamicAddCommentButton.enabled, false);
assert.strictEqual(addon.dynamicAddCommentButton.userInteractionEnabled, false);
assert.strictEqual(actions.dispatchAction(addon, true, false), false, 'a queued tap cannot run after disabling a button');
assert.strictEqual(addon.dynamicCommentInteractionUntil, 0);
timers.forEach(timer => timer.callback()); timers.length = 0;
assert.strictEqual(addon.dynamicAddCommentButton.hidden, true, 'settle timers cannot reveal disabled buttons');
configured.showQuickCommentButton = true;
actions.refreshButtons(addon);
assert.strictEqual(addon.dynamicAddCommentButton.hidden, false, 'a retained popup context can reveal an enabled button again');
configured.enableDynamicSingleCardButton = false;
actions.refreshButtons(addon);
assert.strictEqual(addon.dynamicAddCommentButton.hidden, true);
assert.strictEqual(addon.dynamicCommentContext, null);
assert.strictEqual(configured.showQuickCommentButton, true, 'master switch must not erase individual choices');
assert.strictEqual(actions.isButtonEnabled('move'), false);
actions.disposeButton(addon, 'combinations.done');
console.log(`dynamic button combinations: ${combinations}; add-only menus, live switches and delayed callbacks passed`);
console.log("dynamic comment actions tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
