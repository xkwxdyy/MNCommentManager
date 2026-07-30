const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scheduledTimers = [];
const hostView = {
  bounds: { x: 0, y: 0, width: 1024, height: 768 },
  subviews: [],
  addSubview(view) {
    view.superview = this;
    this.subviews.push(view);
  },
  bringSubviewToFront() {},
  viewWithTag(tag) {
    return this.subviews.find((view) => Number(view.tag) === Number(tag)) || null;
  },
};

function nativeNote(noteId) {
  return { noteId, comments: [] };
}

function selectedView(noteId) {
  return { note: { note: nativeNote(noteId) } };
}

const sandbox = {
  console: { log() {} },
  Date,
  Math,
  Set,
  UIButton: {
    buttonWithType() {
      return {
        layer: {},
        titleLabel: {},
        addTargetActionForControlEvents() {},
        setTitleForState() {},
        setTitleColorForState() {},
      };
    },
  },
  UIFont: { boldSystemFontOfSize() { return {}; } },
  NSTimer: {
    scheduledTimerWithTimeInterval(seconds, repeats, callback) {
      scheduledTimers.push({ seconds, repeats, callback });
      return {};
    },
  },
  MNUtil: {
    currentWindow: { id: "window-1" },
    currentWindowView: hostView,
    studyView: hostView,
    mindmapView: { selViewLst: [] },
    hexColorAlpha(value) { return value; },
  },
  MNNote: {
    new(noteId) { return nativeNote(noteId); },
    getFocusNotes() { return []; },
  },
  __MN_COMMENT_ACTION_SETTINGS__: {
    getSettings() { return { showBatchButton: true }; },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const source = fs.readFileSync(path.join(__dirname, "..", "src", "BatchCommentActions.js"), "utf8");
vm.runInContext(source, sandbox, { filename: "BatchCommentActions.js" });
const actions = vm.runInContext("__MN_BATCH_COMMENT_ACTIONS__", sandbox);
const addon = { window: sandbox.MNUtil.currentWindow };

function showSelection(noteIds) {
  const selViewLst = noteIds.map(selectedView);
  sandbox.MNUtil.mindmapView.selViewLst = selViewLst;
  assert.strictEqual(actions.handleMultipleSelection(addon, {
    userInfo: {
      selViewLst,
      bottomToolbar: {
        bounds: { x: 0, y: 0, width: 240, height: 44 },
        convertRectToView() { return { x: 300, y: 680, width: 240, height: 44 }; },
      },
    },
  }), true);
  const showTimer = scheduledTimers.shift();
  assert.strictEqual(showTimer.seconds, 0.02);
  showTimer.callback();
  assert.strictEqual(addon.batchCommentButton.hidden, false);
}

showSelection(["note-a", "note-b"]);
const firstToken = addon.batchCommentContext.token;

assert.strictEqual(actions.handleMultipleSelectionClosed(addon), true);
const closeTimer = scheduledTimers.shift();
assert.strictEqual(closeTimer.seconds, 0.18);
assert.strictEqual(sandbox.MNUtil.mindmapView.selViewLst.length, 2);
closeTimer.callback();
assert.strictEqual(addon.batchCommentButton.hidden, true);
assert.strictEqual(addon.batchCommentContext, null);

showSelection(["note-c", "note-d"]);
assert.notStrictEqual(addon.batchCommentContext.token, firstToken);
assert.strictEqual(actions.handleMultipleSelectionClosed(addon), true);
const staleCloseTimer = scheduledTimers.shift();
showSelection(["note-e", "note-f"]);
const latestToken = addon.batchCommentContext.token;
staleCloseTimer.callback();
assert.strictEqual(addon.batchCommentContext.token, latestToken);
assert.strictEqual(addon.batchCommentButton.hidden, false);

assert.strictEqual(scheduledTimers.length, 0);
console.log("batch comment selection lifecycle regression passed");
