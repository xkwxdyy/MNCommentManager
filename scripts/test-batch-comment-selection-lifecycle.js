const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scheduledTimers = [];
let showBatchButton = true;
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
        events: [],
        addTargetActionForControlEvents(target, selector, mask) { this.events.push({ target, selector, mask }); },
        setTitleForState() {},
        setTitleColorForState() {},
      };
    },
  },
  UILabel: function (frame) { return { frame, layer: {} }; },
  UIFont: { boldSystemFontOfSize() { return {}; }, systemFontOfSize() { return {}; } },
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
    showHUD() {},
  },
  MNNote: {
    new(noteId) { return nativeNote(noteId); },
    getFocusNotes() { return []; },
  },
  __MN_COMMENT_ACTION_SETTINGS__: {
    getSettings() { return { showBatchButton }; },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(path.join(__dirname, "../src"), "NoteAccess.js"), "utf8"), sandbox);

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
assert(addon.batchCommentButton.events.some(event => event.mask === 1 << 6 && event.selector === 'openBatchCommentEditor:'), 'main button must open the editor');
assert(addon.batchCommentMenuButton.events.some(event => event.mask === 1 << 6 && event.selector === 'batchCommentButtonTapped:'), 'dropdown must open the action menu');
assert.equal(addon.batchCommentEditorButton, undefined, 'no duplicate editor button');
assert.equal(addon.batchCommentMenuButton.frame.x, addon.batchCommentButton.frame.x + 44);
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

// Pinner can render an optional second action to the right of its Pin button.
const primary = { tag: 9205101, hidden: false, frame: { x: 550, y: 685, width: 34, height: 34 } };
const extra = { tag: 9205103, hidden: false, frame: { x: 588, y: 685, width: 34, height: 34 } };
function assertReservedRow(rect) {
  const frame = addon.batchCommentButton.frame;
  assert(frame.y + frame.height <= 680 - 10, "comments action stays above the selection toolbar");
  assertNoOverlap(rect);
}
function assertNoOverlap(rect) {
  const frame = addon.batchCommentButton.frame;
  assert(frame.x + frame.width <= rect.x || rect.x + rect.width <= frame.x ||
    frame.y + frame.height <= rect.y || rect.y + rect.height <= frame.y);
}

hostView.addSubview(primary);
showSelection(["note-a", "note-b"]);
assertReservedRow(primary.frame);
// Discover both tags even when Pinner's controller is unavailable and order differs.
hostView.subviews.unshift({ subviews: [extra] });
showSelection(["note-a", "note-b"]);
assertReservedRow(extra.frame);
assertNoOverlap(primary.frame);
assertNoOverlap(extra.frame);

extra.hidden = true;
showSelection(["note-a", "note-b"]);
assertReservedRow(primary.frame);
extra.hidden = false;
// The controller-reference path also supports buttons without discoverable tags.
hostView.subviews = [addon.batchCommentButton];
sandbox.pinnerUtils = { pinnerController: { followModeButton: primary, followModeExtraButton: extra } };
showSelection(["note-a", "note-b"]);
assertReservedRow(extra.frame);

// Screen-edge fallback must remain in bounds and avoid both Pinner buttons.
hostView.bounds.width = 650;
showSelection(["note-a", "note-b"]);
assert(addon.batchCommentButton.frame.x >= 0);
assert(addon.batchCommentButton.frame.x + addon.batchCommentButton.frame.width <= 650);
assertNoOverlap(primary.frame);
assertNoOverlap(extra.frame);
assertNoOverlap({ x: 300, y: 680, width: 240, height: 44 });
assert.strictEqual(scheduledTimers.length, 0);
// Closing the editor restores only the current selection, never the old sender's cards.
addon.batchCommentContext = { token: 'old', notes: [nativeNote('old-a'), nativeNote('old-b')], sender: { userInfo: { selViewLst: [selectedView('old-a'), selectedView('old-b')] } } };
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('current-a'), selectedView('current-b')];
assert.equal(actions.editorClosed(addon), true);
scheduledTimers.shift().callback();
assert.deepStrictEqual(Array.from(addon.batchCommentContext.notes, note => note.noteId), ['current-a', 'current-b']);
assert.equal(addon.batchCommentButton.hidden, false);
sandbox.MNUtil.mindmapView.selViewLst = [];
assert.equal(actions.editorClosed(addon), false);
assert.equal(addon.batchCommentContext, null);
assert.equal(addon.batchCommentButton.hidden, true);
for (const owner of ['menu', 'editor']) {
  showSelection(['owned-a', 'owned-b']);
  actions.handleMultipleSelectionClosed(addon);
  const pendingClose = scheduledTimers.shift();
  if (owner === 'menu') addon.batchCommentMenuPopoverController = {};
  else addon.webController = { panelMode: 'batch', view: { hidden: false } };
  pendingClose.callback();
  assert(addon.batchCommentContext, owner + ' takes over the selected cards before the toolbar-close timer fires');
  addon.batchCommentMenuPopoverController = null; addon.webController = null;
}

// Repeated selection notifications can be emitted while the editor has a draft.
showSelection(['stable-a', 'stable-b']);
const stableToken = addon.batchCommentContext.token;
const oldSender = addon.batchCommentContext.sender;
showSelection(['stable-b', 'stable-a']);
assert.equal(addon.batchCommentContext.token, stableToken, 'the same cards must retain the editor session even if native order changes');
assert.notEqual(addon.batchCommentContext.sender, oldSender, 'retain the latest sender and toolbar geometry');
showSelection(['stable-a', 'changed-c']);
assert.notEqual(addon.batchCommentContext.token, stableToken, 'a different card set must invalidate old menu payloads');

const previousHost = sandbox.MNUtil.studyView;
const replacementHost = { ...hostView, subviews: [] };
sandbox.MNUtil.studyView = replacementHost;
showSelection(['host-a', 'host-b']);
for (const view of [addon.batchCommentButton, addon.batchCommentMenuButton, addon.batchCommentScopeLabel]) {
  assert.equal(view.superview, replacementHost, 'all controls and the scope label must follow a replacement study view');
}
sandbox.MNUtil.studyView = previousHost;

// An explicit native selection wins over stale focused-note fallbacks.
sandbox.MNNote.getFocusNotes = () => [nativeNote('previous-a'), nativeNote('previous-b')];
for (const noteIds of [[], ['only-current']]) {
  const selViewLst = noteIds.map(selectedView);
  sandbox.MNUtil.mindmapView.selViewLst = selViewLst;
  assert.equal(actions.handleMultipleSelection(addon, { userInfo: { selViewLst } }), false);
  assert.equal(addon.batchCommentContext, null, 'zero or one selected card cannot borrow stale focus notes');
}
sandbox.MNNote.getFocusNotes = () => [];

let panelOpens = 0, batchSyncs = 0, layouts = 0, menus = 0;
addon.webController = { panelMode: 'single', view: { hidden: true } };
addon.layoutViewController = () => { layouts++; };
sandbox.__MN_WEB_API_MNCommentManagerAddon = {
  showPanel(controller) { panelOpens++; controller.panelMode = 'batch'; controller.view.hidden = false; },
  syncBatch() { batchSyncs++; },
};
sandbox.__MN_COMMENT_WORKFLOW_MENU__ = { openBatchMenu() { menus++; return true; } };
showSelection(['entry-a', 'entry-b']);
const entryWindow = sandbox.MNUtil.currentWindow;
sandbox.MNUtil.currentWindow = { id: 'different-window' };
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false, 'a late menu callback from an inactive window cannot open');
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /窗口/);
assert.equal(panelOpens + menus, 0);
sandbox.MNUtil.currentWindow = entryWindow;
showBatchButton = false;
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false, 'disabled buttons reject late callbacks');
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /关闭|禁用/);
showBatchButton = true;
actions.hideButton(addon, 'test.invalidate');
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false, 'a closed selection cannot be reconstructed by a stale button callback');
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /多选卡片/);
assert.equal(addon.batchCommentContext, null);
assert.equal(panelOpens + menus, 0);

showSelection(['entry-a', 'entry-b']);
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true);
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true);
assert.equal(panelOpens, 1, 'repeated click or long-press release reuses the existing batch panel');
assert.equal(layouts, 1);
assert.equal(batchSyncs, 2);

addon.webController.view.hidden = true;
showSelection(['touch-a', 'touch-b']);
actions.beginInteraction(addon, addon.batchCommentButton);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
addon.batchCommentInteractionUntil = 0;
showSelection(['touch-a', 'touch-c']);
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /已变化/, 'release from the previous card set cannot open the new card set');
assert.throws(() => actions.openMenu(addon, addon.batchCommentMenuButton), /已变化/);
assert.equal(panelOpens, 1);
assert.equal(menus, 0);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), true, 'a fresh touch on the current card set is accepted');
assert.equal(menus, 1);

actions.beginInteraction(addon, addon.batchCommentButton);
const sameTouchToken = addon.batchCommentContext.token;
addon.batchCommentInteractionUntil = 0;
showSelection(['touch-c', 'touch-a']);
assert.equal(addon.batchCommentContext.token, sameTouchToken);
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true, 'a redundant native selection notification cannot cancel a valid touch');

addon.webController.view.hidden = true;
showSelection(['reopened-a', 'reopened-b']);
actions.handleMultipleSelectionClosed(addon);
const previousSelectionClose = scheduledTimers.shift();
showSelection(['reopened-a', 'reopened-b']);
previousSelectionClose.callback();
assert.equal(addon.batchCommentButton.hidden, false, 'a stale toolbar-close timer cannot hide a refreshed selection of the same cards');

const currentContext = addon.batchCommentContext;
addon.mnCommentManagerSceneActive = false;
assert.equal(actions.beginInteraction(addon, addon.batchCommentButton), false);
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false);
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /未激活/);
assert.equal(actions.relayout(addon), false);
assert.equal(actions.handleMultipleSelection(addon, { userInfo: { selViewLst: [selectedView('inactive-a'), selectedView('inactive-b')] } }), false);
assert.equal(addon.batchCommentContext, currentContext, 'inactive notifications cannot replace the active selection session');
addon.mnCommentManagerSceneActive = true;

// Native controls can be laid out after the first timer was queued but before its callback.
const activeSelection = [selectedView('queued-a'), selectedView('queued-b')];
sandbox.MNUtil.mindmapView.selViewLst = activeSelection;
assert.equal(actions.handleMultipleSelection(addon, { userInfo: { selViewLst: activeSelection } }), true);
addon.mnCommentManagerSceneActive = false;
scheduledTimers.shift().callback();
assert.equal(addon.batchCommentButton.hidden, true, 'queued display cannot revive buttons after the scene becomes inactive');
addon.mnCommentManagerSceneActive = true;
addon.batchCommentInteractionUntil = 0;
assert.equal(actions.relayout(addon), true);
const layoutToken = addon.batchCommentContext.token;
hostView.bounds.width = 180;
assert.equal(actions.relayout(addon), true);
assert.equal(addon.batchCommentContext.token, layoutToken);
assert(addon.batchCommentMenuButton.frame.x + addon.batchCommentMenuButton.frame.width <= 180, 'rotation or split view keeps both controls inside the new host');

const ownedMenu = {};
addon.batchCommentMenuPopoverController = ownedMenu;
assert.equal(actions.relayout(addon), false);
assert.equal(addon.batchCommentMenuPopoverController, ownedMenu);
assert.equal(actions.menuDismissed(addon, {}), false, 'stale popover dismissal cannot close the active menu');
assert.equal(addon.batchCommentMenuPopoverController, ownedMenu);
assert.equal(actions.menuDismissed(addon, ownedMenu), true);
actions.hideButton(addon, 'editor.ownership', { preserveContext: true });
addon.webController.view.hidden = false;
assert.equal(actions.relayout(addon), false);
assert.equal(addon.batchCommentButton.hidden, true, 'relayout cannot show follow buttons over an open editor');
assert.equal(addon.batchCommentContext.token, layoutToken);
addon.webController.view.hidden = true;

sandbox.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon = { icon() {}, palette() { return { muted: '#a3adbc', surface: '#252b35' }; } };
assert.equal(actions.relayout(addon), true);
assert.equal(addon.batchCommentScopeLabel.textColor, '#a3adbc', 'the scope label follows the current theme');

const pendingViews = [selectedView('display-a'), selectedView('display-b')];
sandbox.MNUtil.mindmapView.selViewLst = pendingViews;
actions.handleMultipleSelection(addon, { userInfo: { selViewLst: pendingViews } });
const obsoleteDisplay = scheduledTimers.shift();
actions.handleMultipleSelection(addon, { userInfo: { selViewLst: pendingViews.slice().reverse() } });
obsoleteDisplay.callback();
assert.equal(addon.batchCommentButton.hidden, true, 'an earlier display timer cannot apply stale geometry after a same-card notification');
scheduledTimers.shift().callback();
assert.equal(addon.batchCommentButton.hidden, false);

delete addon.batchCommentButton.mncmBatchTouchToken;
delete addon.batchCommentMenuButton.mncmBatchTouchToken;
delete addon.batchCommentButton.mncmBatchTouchRevision;
delete addon.batchCommentMenuButton.mncmBatchTouchRevision;
showSelection(['cached-a', 'cached-b']);
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('live-single')];
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false, 'the old toolbar sender cannot override a newer live single-card selection');
assert.equal(addon.batchCommentContext, null);

showSelection(['cached-a', 'cached-b']);
for (const selected of [[], [selectedView('explicit-single')]]) {
  assert.throws(() => actions.openEditor(addon, { userInfo: { selViewLst: selected } }), /多选卡片/, 'an explicit empty or single-card sender cannot fall back to the previous card set');
  assert.equal(addon.batchCommentContext, null);
  showSelection(['cached-a', 'cached-b']);
}
sandbox.MNUtil.mindmapView.selViewLst = [];
assert.equal(actions.beginInteraction(addon, addon.batchCommentButton), false, 'an old button cannot take ownership after the live selection was already cleared');
assert.equal(addon.batchCommentContext, null);

showSelection(['handoff-a', 'handoff-b']);
assert.equal(actions.beginInteraction(addon, addon.batchCommentButton), true);
sandbox.MNUtil.mindmapView.selViewLst = [];
actions.handleMultipleSelectionClosed(addon);
const handoffClose = scheduledTimers.shift();
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true, 'a verified touch can transfer its selected cards when native toolbar dismissal empties the live list');
handoffClose.callback();
assert.deepEqual(Array.from(addon.batchCommentContext.notes, note => note.noteId), ['handoff-a', 'handoff-b']);
addon.webController.view.hidden = true;

showSelection(['owned-a', 'owned-b']);
addon.batchCommentMenuPopoverController = {};
sandbox.MNUtil.mindmapView.selViewLst = [];
assert.equal(actions.openEditor(addon, { param: { token: addon.batchCommentContext.token } }), true, 'an open native menu retains ownership during its handoff to the editor');
assert.deepEqual(Array.from(addon.batchCommentContext.notes, note => note.noteId), ['owned-a', 'owned-b']);
assert.throws(() => actions.openEditor(addon, { userInfo: { selViewLst: [] } }), /多选卡片/, 'an explicit selection-clear event invalidates even an editor-owned snapshot');
assert.equal(addon.batchCommentContext, null);
addon.webController.view.hidden = true;

showSelection(['inactive-old-a', 'inactive-old-b']);
actions.hideButton(addon, 'scene.inactive', { preserveContext: true });
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('inactive-new-single')];
assert.equal(actions.refreshForActivation(addon), false);
assert.equal(addon.batchCommentContext, null, 'activation cannot reuse the card set preserved before entering the background');
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('active-new-a'), selectedView('active-new-b')];
assert.equal(actions.refreshForActivation(addon), true);
scheduledTimers.shift().callback();
assert.deepEqual(Array.from(addon.batchCommentContext.notes, note => note.noteId), ['active-new-a', 'active-new-b']);

addon.webController.view.hidden = false;
const syncsBeforeLiveChange = batchSyncs;
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('changed-without-event')];
assert.equal(actions.relayout(addon), false);
assert.equal(addon.batchCommentContext, null);
assert.equal(batchSyncs, syncsBeforeLiveChange + 1, 'an editor with an invalid live selection receives the invalidation without losing its draft');
addon.webController.view.hidden = true;

showSelection(['unreadable-a', 'unreadable-b']);
delete sandbox.MNUtil.mindmapView.selViewLst;
assert.equal(actions.refreshForActivation(addon), false, 'activation requires a readable live selection instead of an old snapshot');
assert.equal(addon.batchCommentContext, null);

let heldClock = 100000;
sandbox.Date = { now: () => heldClock };
showSelection(['held-a', 'held-b']);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
const heldFrame = JSON.stringify(addon.batchCommentMenuButton.frame);
heldClock += 5000;
assert.equal(actions.relayout(addon), false, 'a physical hold must freeze the dropdown after the old 900ms lease would expire');
assert.equal(JSON.stringify(addon.batchCommentMenuButton.frame), heldFrame);
showSelection(['held-b', 'held-a']);
assert.equal(JSON.stringify(addon.batchCommentMenuButton.frame), heldFrame, 'same-card notifications cannot rebuild a pressed control');
sandbox.MNUtil.mindmapView.selViewLst = [];
actions.handleMultipleSelectionClosed(addon);
scheduledTimers.shift().callback();
assert(addon.batchCommentContext, 'native toolbar close cannot destroy a still-held dropdown selection');
sandbox.__MN_COMMENT_WORKFLOW_MENU__.openBatchMenu = target => { menus++; target.batchCommentMenuPopoverController = {}; return true; };
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), true, 'releasing after a long hold can transfer selection ownership to the menu');
actions.endInteraction(addon, addon.batchCommentMenuButton);
scheduledTimers.shift().callback();
assert(addon.batchCommentContext, 'the opened menu takes ownership before touch cleanup runs');
assert.equal(addon.batchCommentHeldControl, '');
for (const control of [addon.batchCommentButton, addon.batchCommentMenuButton]) {
  assert(control.events.some(event => event.selector === 'batchCommentButtonTouchEnded:' && event.mask === ((1 << 7) | (1 << 8))), 'outside release and cancellation must end native touch ownership');
}

actions.hideButton(addon, 'cancel.test');
showSelection(['cancel-a', 'cancel-b']);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
sandbox.MNUtil.mindmapView.selViewLst = [];
actions.handleMultipleSelectionClosed(addon);
scheduledTimers.shift().callback();
heldClock += 5000;
assert(addon.batchCommentContext);
actions.endInteraction(addon, addon.batchCommentMenuButton);
scheduledTimers.shift().callback();
assert.equal(addon.batchCommentContext, null, 'a cancelled touch must finish a deferred toolbar close');
assert.equal(addon.batchCommentMenuButton.hidden, true);

showSelection(['gesture-a', 'gesture-b']);
actions.beginInteraction(addon, addon.batchCommentButton);
sandbox.MNUtil.mindmapView.selViewLst = [];
actions.handleMultipleSelectionClosed(addon);
scheduledTimers.shift().callback();
actions.endInteraction(addon, addon.batchCommentButton);
assert.equal(actions.beginLongPress(addon, addon.batchCommentButton), true, 'native gesture Began can follow UIControl Cancel without losing its target');
scheduledTimers.shift().callback();
assert(addon.batchCommentContext, 'gesture ownership survives the earlier control-cancel cleanup');
const opensBeforeGesture = panelOpens;
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true);
heldClock += 5000;
actions.endLongPress(addon, addon.batchCommentButton, 3);
assert.equal(actions.openEditor(addon, addon.batchCommentButton), true);
assert.equal(panelOpens, opensBeforeGesture + 1, 'a long hold and its release keep one editor instance');
addon.webController.view.hidden = true;

showSelection(['invalid-held-a', 'invalid-held-b']);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
heldClock += 5000;
sandbox.MNUtil.mindmapView.selViewLst = [selectedView('other-card')];
assert.equal(actions.relayout(addon), false);
assert.equal(addon.batchCommentContext, null, 'real live selection invalidation overrides an unfinished touch');
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false);

showSelection(['cancel-gesture-a', 'cancel-gesture-b']);
actions.beginInteraction(addon, addon.batchCommentButton);
assert.equal(actions.beginLongPress(addon, addon.batchCommentButton), true);
actions.endLongPress(addon, addon.batchCommentButton, 4);
assert.equal(addon.batchCommentHeldControl, '');
assert.equal(addon.batchCommentHeldGesture, '');
assert.equal(addon.batchCommentInteractionUntil, 0, 'a cancelled long gesture cannot leave a permanent layout freeze');

showSelection(['paused-hold-a', 'paused-hold-b']);
actions.beginInteraction(addon, addon.batchCommentMenuButton);
addon.mnCommentManagerSceneActive = false;
actions.hideButton(addon, 'scene.inactive', { preserveContext: true });
assert.equal(addon.batchCommentHeldControl, '');
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false);
addon.mnCommentManagerSceneActive = true;
assert.equal(actions.refreshForActivation(addon), true);
scheduledTimers.shift().callback();
assert.throws(() => actions.openMenu(addon, addon.batchCommentMenuButton), /交互已结束/, 'an old physical release cannot resume after returning to the same selected cards');
assert.equal(actions.beginLongPress(addon, addon.batchCommentMenuButton), false, 'late gesture callbacks return false instead of throwing out of a selector');
actions.beginInteraction(addon, addon.batchCommentMenuButton);
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), true);
actions.endInteraction(addon, addon.batchCommentMenuButton);

actions.hideButton(addon, 'freeze.probe');
showSelection(['freeze-a', 'freeze-b']);
let freezeDuration = 0, releases = 0;
sandbox.__MN_ADDON_FLOATING_LAYOUT__ = { freeze(_views, duration) { freezeDuration = duration; }, release() { releases++; } };
actions.beginInteraction(addon, addon.batchCommentMenuButton);
assert.equal(freezeDuration, Infinity, 'shared layout reservations follow native touch lifetime instead of a larger timeout');
actions.endInteraction(addon, addon.batchCommentMenuButton);
assert(releases > 0);
assert.equal(addon.batchCommentHeldControl, '');

delete sandbox.__MN_ADDON_FLOATING_LAYOUT__;
let labelTheme = 'Default';
sandbox.Application = { sharedInstance: () => ({ currentTheme: labelTheme }) };
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'CommentActionUI.js'), 'utf8'), sandbox);
const themedUI = sandbox.__MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
const labelToken = addon.batchCommentContext.token;
const scopeLabel = addon.batchCommentScopeLabel;
function relativeLuminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const theme of ['Default', 'Gray', 'Dark', 'Default']) {
  labelTheme = theme;
  for (const [width, height] of [[721, 902], [1024, 768], [180, 320]]) {
    hostView.bounds = { x: 0, y: 0, width, height };
    assert.equal(actions.relayout(addon), true);
    const p = themedUI.palette(), frame = scopeLabel.frame;
    assert.equal(addon.batchCommentScopeLabel, scopeLabel);
    assert.equal(addon.batchCommentContext.token, labelToken);
    assert.equal(scopeLabel.text, '已选择 2 张卡片');
    assert.equal(frame.width, 124);
    assert.equal(scopeLabel.backgroundColor, p.surface, 'selection scope text needs an opaque theme surface above colored card content');
    assert.equal(scopeLabel.backgroundColor, addon.batchCommentButton.backgroundColor);
    assert.equal(scopeLabel.textColor, p.muted);
    assert.equal(scopeLabel.layer.cornerRadius, 4);
    assert.equal(scopeLabel.layer.masksToBounds, true);
    const luminances = [relativeLuminance(p.muted), relativeLuminance(p.surface)].sort((a, b) => a - b);
    assert((luminances[1] + 0.05) / (luminances[0] + 0.05) >= 4.5, 'scope label text must retain readable contrast in ' + theme);
    assert(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= width && frame.y + frame.height <= height, 'the full scope label must fit after resizing');
  }
}
const workflowContext = addon.batchCommentContext;
actions.handleMultipleSelectionClosed(addon);
addon.mncmWorkflowPanelOwnsEntries = true;
actions.hideButton(addon, 'workflow.handoff', { preserveContext: true });
while (scheduledTimers.length) scheduledTimers.shift().callback();
assert.equal(actions.handleMultipleSelection(addon, { userInfo: { selViewLst: [] } }), true, 'workflow handoff consumes selection notifications without invalidating the Web panel');
assert.equal(actions.handleMultipleSelectionClosed(addon), true);
assert.equal(actions.refreshForActivation(addon), true);
assert.equal(actions.relayout(addon), false);
assert.equal(actions.openMenu(addon, addon.batchCommentMenuButton), false);
assert.throws(() => actions.openEditor(addon, addon.batchCommentButton), /未读取到多选卡片/);
assert.equal(addon.batchCommentContext, workflowContext, 'workflow handoff must preserve the original selected targets');
for (const key of ['batchCommentButton', 'batchCommentMenuButton', 'batchCommentScopeLabel']) assert.equal(addon[key].hidden, true);
addon.mncmWorkflowPanelOwnsEntries = false;
showSelection(['after-workflow-a', 'after-workflow-b']);
assert.equal(addon.batchCommentButton.hidden, false, 'a fresh selection can restore entries after the workflow panel releases them');
console.log("batch comment selection lifecycle regression passed");
