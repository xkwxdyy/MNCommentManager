const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const timers = [];
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
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "DynamicCommentActions.js"), "utf8"), context);

(async function run() {
const actions = context.__MN_DYNAMIC_COMMENT_ACTIONS__;
const addon = { window: addonWindow };
const sender = { userInfo: { noteid: "single-note", winRect: { x: 100, y: 100, width: 100, height: 40 } } };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
const revealTimer = timers.shift();
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

assert.strictEqual(actions.beginInteraction(addon), true);
assert.strictEqual(actions.handlePopupMenuClosed(addon), true);
const guardedHideTimer = timers.shift();
assert.strictEqual(guardedHideTimer.seconds, 0.18);
guardedHideTimer.callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, false, "touch-down hold must outlive the popup-close delay");
assert(addon.dynamicCommentContext, "touch-down hold must preserve the card context until long press begins");

actions.suppressTapAfterLongPress(addon);
assert.strictEqual(actions.openMenu(addon, addon.dynamicCommentButton), true);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.commandTable.length, 7);
assert.deepStrictEqual(
  Array.from(addon.dynamicCommentMenuPopoverController.commandTable, (item) => String(item.selector)),
  [
    "noopBatchCommentAction:",
    "runSingleKeepFirstContent:",
    "runSingleConvertHtmlToMarkdown:",
    "runSingleConvertToNoExcerpt:",
    "runSingleRemoveAllLinks:",
    "runSingleClearAllComments:",
    "runSingleClearAllTitles:",
  ],
);
assert.strictEqual(addon.dynamicCommentMenuPopoverController.delegate, addon);
const conversionItem = addon.dynamicCommentMenuPopoverController.commandTable.find((item) => item.selector === "runSingleConvertToNoExcerpt:");
assert(conversionItem);
assert.strictEqual(conversionItem.param, "single-note");
assert.strictEqual(actions.consumeTapSuppression(addon), true);
assert.strictEqual(actions.consumeTapSuppression(addon), false);
const firstSingleCardPopover = addon.dynamicCommentMenuPopoverController;
assert.strictEqual(actions.handleMenuDismissed(addon, firstSingleCardPopover), true);
assert.strictEqual(addon.dynamicCommentButton.hidden, true, "dismissing the single-card popover must hide the button");
assert.strictEqual(addon.dynamicCommentContext, null);

assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true);
timers.shift().callback();
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
const activeConversionItem = addon.dynamicCommentMenuPopoverController.commandTable.find((item) => item.selector === "runSingleConvertToNoExcerpt:");
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
timers.shift().callback();
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
timers.shift().callback();
assert.strictEqual(actions.handlePopupMenuClosed(addon), true);
const hideTimer = timers.shift();
assert.strictEqual(hideTimer.seconds, 0.18);
hideTimer.callback();
assert.strictEqual(addon.dynamicCommentButton.hidden, true, "an idle popup close must still hide the button");

context.MNUtil.mindmapView.selViewLst = [{ note: { noteId: "note-a" } }, { note: { noteId: "note-b" } }];
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), true, "PopupMenuOnNote's noteId must outrank stale selection state");
timers.shift().callback();
assert.strictEqual(addon.dynamicCommentContext.noteId, "single-note");
actions.hideButton(addon, "test.cleanup");

context.MNUtil.currentWindow = { id: "other-window" };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, sender), false, "inactive addon windows must ignore global PopupMenu notifications");
context.MNUtil.currentWindow = addonWindow;

context.MNUtil.mindmapView.selViewLst = [];
focusNoteId = "focus-fallback";
const senderWithoutNoteId = { userInfo: { winRect: { x: 80, y: 80, width: 80, height: 30 } } };
assert.strictEqual(actions.handlePopupMenuOnNote(addon, senderWithoutNoteId), true);
timers.shift().callback();
assert.strictEqual(addon.dynamicCommentContext.noteId, "focus-fallback", "MNNote.getFocusNote(true) must cover PopupMenu payloads without noteId");
assert.strictEqual(actions.disposeButton(addon, "test.done"), true);
assert.strictEqual(addon.dynamicCommentButton, null);
assert.strictEqual(hostView.viewWithTag(9304102), null, "disconnect cleanup must remove the selector-bound native button");
console.log("dynamic comment actions tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
