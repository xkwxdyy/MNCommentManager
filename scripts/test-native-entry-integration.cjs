// Exercise real staged floating controls; synthetic coverage is not host evidence.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stage = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const runtime = fs.existsSync(path.join(stage, "src/NativeEntryPolicy.js")) ? path.join(stage, "src") : stage;
const fixtureRoot = fs.existsSync(path.join(stage, "scripts/test-comment-move-integration.js")) ? stage : path.resolve(__dirname, "..");
process.env.MNCM_RUNTIME_DIR = runtime;
process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY = "1";
assert.ok(fs.existsSync(path.join(runtime, "NativeEntryPolicy.js")), "an isolated adaptive package stage or extracted package is required");

const { setup } = require(path.join(fixtureRoot, "scripts/test-comment-move-integration.js"));

const ids = ["management", "menu", "add", "move"];
const properties = { management: "dynamicCommentButton", menu: "dynamicCommentMenuButton", add: "dynamicAddCommentButton", move: "dynamicMoveCommentButton" };
const full = { quick: true, manager: true, menu: true, quickInput: true };
const managerOnly = { quick: true, manager: true, menu: true };
function visible(s, addon = s.addon) { return ids.filter(id => addon[properties[id]] && addon[properties[id]].hidden === false); }
function current(s, expected, message) { assert.deepEqual(visible(s), expected, message); }
function signature(s) {
  return ids.map(id => {
    const view = s.addon[properties[id]];
    return view ? { id, frame: { ...view.frame }, hidden: view.hidden, enabled: view.enabled } : { id };
  });
}
function configure(s, changes) { Object.assign(s.settings, changes); s.actions.refreshButtons(s.addon); }
function attachNativeControlState(s) {
  const window = s.addon.window;
  Object.assign(window, { hidden: false, alpha: 1, userInteractionEnabled: true });
  Object.assign(s.host, { window, superview: window, hidden: false, alpha: 1, userInteractionEnabled: true });
  ids.forEach(id => { s.addon[properties[id]].window = window; });
}
function fixture(coverage = {}, options) {
  const s = setup(options);
  Object.assign(s.settings, {
    autoHideNativeDuplicates: true, showManagementButton: true, showQuickCommentButton: true, showMoveCommentButton: true,
    dynamicButtonOrder: ["management", "add", "move"], managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu",
  });
  s.nativeCoverage = coverage;
  s.coverageCalls = [];
  s.context.__MN_NATIVE_CARD_MENU_MNCommentManagerAddon.coverage = (addon, context) => {
    s.coverageCalls.push({ addon, context });
    return typeof s.nativeCoverage === "function" ? s.nativeCoverage(addon, context) : s.nativeCoverage;
  };
  s.actions.refreshButtons(s.addon);
  return s;
}

let groups = 0;
const failures = [];
function test(name, run) {
  groups++;
  try { run(); console.log("PASS " + name); }
  catch (error) { failures.push({ name, error }); console.error("FAIL " + name + ": " + error.stack); }
}

test("the four native integration combinations selectively replace default controls", () => {
  for (const [coverage, expected] of [
    [{}, ids], [managerOnly, ["add"]], [{ quickInput: true }, ["management", "menu", "move"]], [full, []],
  ]) {
    const s = fixture(coverage);
    current(s, expected);
    assert.ok(s.coverageCalls.length > 0, "the real dynamic grouping must call native coverage");
    assert.ok(s.coverageCalls.every(call => call.addon === s.addon && call.context === s.addon.dynamicCommentContext));
    assert.equal(s.addon.dynamicCommentContext.noteId, "one");
  }
});

test("partial gesture or action capability preserves every uncovered route", () => {
  for (const [coverage, expected] of [
    [{ quick: true }, ["management", "menu", "add"]],
    [{ quick: true, manager: true }, ["management", "menu", "add"]],
    [{ quick: true, menu: true }, ["management", "add"]],
    [{ manager: true, menu: true }, ["add", "move"]],
    [{ quick: true, manager: true, menu: false, quickInput: true }, ["management", "menu"]],
    [{ quick: true, manager: false, menu: true, quickInput: true }, ["management"]],
  ]) current(fixture(coverage), expected);
});

test("unknown, malformed or non-boolean native evidence keeps existing controls", () => {
  for (const coverage of [null, undefined, false, [], "all", { quick: 1, manager: "true", menu: {}, quickInput: [] }]) {
    current(fixture(coverage), ids);
  }
});

test("all custom tap and hold assignments including none remain intact", () => {
  for (const [key, defaultAction] of [
    ["managementTapAction", "manager"], ["managementHoldAction", "menu"],
    ["addTapAction", "quickInput"], ["addHoldAction", "menu"],
  ]) {
    for (const action of ["manager", "quickInput", "menu", "none"]) {
      if (action === defaultAction) continue;
      const s = fixture(full);
      configure(s, { [key]: action });
      const id = key.startsWith("add") ? "add" : "management";
      current(s, [id], key + "=" + action);
      assert.equal(s.settings[key], action);
      assert.equal(s.addon[properties[id]].enabled, true);
    }
  }
  const s = fixture(full);
  configure(s, { managementTapAction: "none", managementHoldAction: "none", addTapAction: "none", addHoldAction: "none" });
  current(s, ["management", "add"]);
  assert.equal(s.addon.dynamicCommentButton.enabled, false);
  assert.equal(s.addon.dynamicAddCommentButton.enabled, false);
  assert.equal(s.addon.dynamicCommentButton.userInteractionEnabled, false);
  assert.equal(s.addon.dynamicAddCommentButton.userInteractionEnabled, false);
});

test("retained custom controls still dispatch their configured tap and hold actions", () => {
  for (const [adding, holding, action] of [[false, false, "quickInput"], [true, false, "manager"], [true, false, "menu"], [false, true, "quickInput"]]) {
    const s = fixture(full), calls = [];
    const id = adding ? "add" : "management", key = `${adding ? "add" : "management"}${holding ? "Hold" : "Tap"}Action`;
    configure(s, { [key]: action });
    current(s, [id]);
    let focused = "";
    s.context.MNUtil.focusNoteInMindMapById = noteId => { focused = noteId; };
    s.context.__MN_WEB_API_MNCommentManagerAddon = {
      showPanel() { calls.push(["manager", focused]); },
      syncCurrentNote(_controller, reason) { assert.equal(reason, "dynamic-single-card"); },
    };
    s.addon.layoutViewController = () => {};
    s.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open(_addon, context) { calls.push(["quickInput", context.noteId]); } };
    s.context.__MN_COMMENT_WORKFLOW_MENU__ = { buildItems(_addon, context, scope, section) {
      assert.equal(context.noteId, "one"); assert.equal(scope, "single"); assert.equal(section, "root");
      return [{ title: "整卡操作", object: s.addon, selector: "noop:" }];
    } };
    s.context.MNUtil.getPopoverAndPresent = () => { calls.push(["menu", s.addon.dynamicCommentContext.noteId]); return { dismissPopoverAnimated() {} }; };
    const sender = s.addon[properties[id]];
    assert.equal(s.actions.beginInteraction(s.addon, sender), true);
    assert.equal(s.actions.dispatchAction(s.addon, adding, holding, sender), true);
    assert.deepEqual(calls, [[action, "one"]]);
    if (holding) {
      assert.equal(s.actions.dispatchAction(s.addon, adding, false, sender), false, "a retained custom hold must not append its default tap action");
      assert.deepEqual(calls, [[action, "one"]]);
      s.actions.endLongPress(s.addon, sender, 3);
    } else s.actions.endInteraction(s.addon, sender);
    assert.equal(s.settings[key], action);
  }
});

test("custom no-action holds remain inert across scene updates and suppress the trailing tap", () => {
  for (const adding of [false, true]) {
    const s = fixture(full), calls = [];
    configure(s, {
      [`${adding ? "add" : "management"}TapAction`]: "quickInput",
      [`${adding ? "add" : "management"}HoldAction`]: "none",
    });
    const id = adding ? "add" : "management", sender = s.addon[properties[id]];
    current(s, [id]);
    s.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open(_addon, context) { calls.push(context.noteId); } };
    assert.equal(s.actions.beginInteraction(s.addon, sender), true);
    assert.equal(s.actions.dispatchAction(s.addon, adding, true, sender), false);
    const held = signature(s);
    s.nativeCoverage = {};
    assert.equal(s.actions.relayout(s.addon), false);
    s.advance(600);
    assert.deepEqual(signature(s), held, "a scene change must not move a custom no-action hold");
    assert.equal(s.actions.endLongPress(s.addon, sender, 3), true);
    assert.equal(s.actions.dispatchAction(s.addon, adding, false, sender), false);
    assert.deepEqual(calls, [], "releasing a no-action hold must not execute the tap action");
    s.actions.relayout(s.addon);
    current(s, ids);
    assert.equal(s.actions.beginInteraction(s.addon, sender), true);
    assert.equal(s.actions.dispatchAction(s.addon, adding, false, sender), true);
    assert.deepEqual(calls, ["one"], "the next deliberate tap must remain usable");
    s.actions.endInteraction(s.addon, sender);
  }
});

test("a settings refresh invalidates pressed custom events before scene capability changes", () => {
  const s = fixture(full), calls = [];
  configure(s, { addTapAction: "manager", addHoldAction: "none", showMoveCommentButton: false });
  current(s, ["add"]);
  const sender = s.addon.dynamicAddCommentButton;
  assert.equal(s.actions.beginInteraction(s.addon, sender), true);
  const queued = { ...sender };
  configure(s, { autoHideNativeDuplicates: false, addTapAction: "quickInput" });
  s.nativeCoverage = {};
  s.actions.relayout(s.addon);
  current(s, ["management", "menu", "add"]);
  s.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open(_addon, context) { calls.push(context.noteId); } };
  assert.equal(s.actions.dispatchAction(s.addon, true, false, queued), false, "the old press cannot run a newly configured action");
  assert.deepEqual(calls, []);
  assert.equal(s.actions.beginInteraction(s.addon, sender), true);
  assert.equal(s.actions.dispatchAction(s.addon, true, false, sender), true);
  assert.deepEqual(calls, ["one"]);
  s.actions.endInteraction(s.addon, sender);
  assert.equal(s.settings.showMoveCommentButton, false);
  assert.equal(s.settings.addHoldAction, "none");
});

test("native add alone cannot remove the only whole-card menu access", () => {
  const s = fixture({ quickInput: true });
  configure(s, { showManagementButton: false });
  current(s, ["add", "move"]);
  assert.equal(s.settings.addHoldAction, "menu");
  s.nativeCoverage = full;
  s.actions.relayout(s.addon);
  current(s, []);
  s.nativeCoverage = { quickInput: true };
  s.actions.relayout(s.addon);
  current(s, ["add", "move"]);
  assert.equal(s.settings.showManagementButton, false);
});

test("auto-hide opt-out and per-control visibility retain persistent preferences", () => {
  const s = fixture(full);
  configure(s, { autoHideNativeDuplicates: false, showQuickCommentButton: false, showMoveCommentButton: false });
  current(s, ["management", "menu"]);
  s.nativeCoverage = {};
  s.actions.relayout(s.addon);
  current(s, ["management", "menu"]);
  configure(s, { showManagementButton: false });
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext.noteId, "one");
  assert.equal(s.settings.showQuickCommentButton, false);
  assert.equal(s.settings.showMoveCommentButton, false);
});

test("the master switch cannot be revived by native coverage or later popup timers", () => {
  const s = fixture({});
  configure(s, { enableDynamicSingleCardButton: false });
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext, null);
  for (const coverage of [full, {}]) {
    s.nativeCoverage = coverage;
    s.actions.relayout(s.addon);
    s.selectCard("two");
    s.advance(2000);
    current(s, []);
    assert.equal(s.settings.enableDynamicSingleCardButton, false);
  }
});

test("re-enabling the master switch on another card retains custom actions, disabled controls and order", () => {
  const s = fixture(full);
  configure(s, { showManagementButton: false, showMoveCommentButton: false, addTapAction: "manager", addHoldAction: "none", dynamicButtonOrder: ["move", "add", "management"] });
  current(s, ["add"]);
  const oldToken = s.addon.dynamicCommentContext.token;
  const stale = { ...s.addon.dynamicAddCommentButton, mncmDynamicTouchToken: oldToken, mncmDynamicTouchRevision: Number(s.addon.dynamicCommentTouchRevision || 0) };
  configure(s, { enableDynamicSingleCardButton: false });
  s.nativeCoverage = {};
  s.selectCard("two");
  configure(s, { enableDynamicSingleCardButton: true });
  current(s, [], "re-enabling without a fresh popup cannot reuse an old card context");
  s.selectCard("two");
  current(s, ["add"]);
  assert.equal(s.addon.dynamicCommentContext.noteId, "two");
  assert.notEqual(s.addon.dynamicCommentContext.token, oldToken);
  assert.equal(s.actions.dispatchAction(s.addon, true, false, stale), false, "an old queued control event cannot target the new card");
  assert.equal(s.settings.showManagementButton, false);
  assert.equal(s.settings.showMoveCommentButton, false);
  assert.equal(s.settings.addTapAction, "manager");
  assert.equal(s.settings.addHoldAction, "none");
  assert.deepEqual(s.settings.dynamicButtonOrder, ["move", "add", "management"]);
});

test("repeated preference and scene changes reuse native controls without duplicate targets", () => {
  const s = fixture({}), controls = ids.map(id => s.addon[properties[id]]);
  for (const [coverage, autoHide, expected] of [
    [full, true, []], [full, false, ids], [managerOnly, true, ["add"]],
    [{ quickInput: true }, true, ["management", "menu", "move"]], [{}, true, ids], [full, false, ids],
  ]) {
    s.nativeCoverage = coverage;
    configure(s, { autoHideNativeDuplicates: autoHide });
    s.advance(1700);
    current(s, expected);
    ids.forEach((id, index) => {
      const button = s.addon[properties[id]];
      assert.equal(button, controls[index]);
      assert.equal(button.events.length, 3, "visibility changes must not register another set of target actions");
      assert.equal(s.host.subviews.filter(view => view.tag === button.tag).length, 1, "no hidden duplicate can remain attached to the host");
    });
  }
});

test("hiding every duplicate retains the card context and releases floating layout occupancy", () => {
  const s = fixture({});
  const context = s.addon.dynamicCommentContext;
  const layout = s.context.__MN_ADDON_FLOATING_LAYOUT__;
  const realRelease = layout.release, releases = [];
  layout.release = views => { releases.push(Array.from(views)); return realRelease(views); };
  s.nativeCoverage = full;
  s.actions.relayout(s.addon);
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext, context);
  assert.equal(context.noteId, "one");
  assert.equal(context._floatingGroupFrame, null);
  assert.ok(releases.some(views => ids.every(id => views.includes(s.addon[properties[id]]))));
  const occupied = layout.collect(s.host, { priority: 10 });
  assert.equal(occupied.length, 0, "hidden native duplicates must no longer reserve control footprints");
  s.nativeCoverage = {};
  s.actions.relayout(s.addon);
  current(s, ids);
  assert.equal(s.addon.dynamicCommentContext, context);
});

test("filtered order stays compact and preserves only the paired management/menu join", () => {
  for (const [coverage, order, expected] of [
    [{ quickInput: true }, ["move", "add", "management"], ["move", "management", "menu"]],
    [{ menu: true }, ["management", "add", "move"], ["management", "add", "move"]],
    [managerOnly, ["move", "management", "add"], ["add"]],
  ]) {
    const s = fixture(coverage);
    configure(s, { dynamicButtonOrder: order });
    const physical = visible(s).sort((a, b) => s.addon[properties[a]].frame.x - s.addon[properties[b]].frame.x);
    assert.deepEqual(physical, expected);
    expected.forEach((id, index) => {
      const button = s.addon[properties[id]];
      assert.equal(button.frame.width, 44);
      assert.equal(button.frame.height, 44);
      if (!index) return;
      const previousId = expected[index - 1], previous = s.addon[properties[previousId]];
      const gap = previousId === "management" && id === "menu" ? 0 : 4;
      assert.equal(button.frame.x - previous.frame.x - previous.frame.width, gap);
    });
    assert.deepEqual(s.settings.dynamicButtonOrder, order);
  }
});

test("scene capability changes recompute without changing stored choices or card context", () => {
  const s = fixture(managerOnly);
  const context = s.addon.dynamicCommentContext, settings = JSON.stringify(s.settings);
  current(s, ["add"]);
  for (const [coverage, expected] of [[{}, ids], [{ quickInput: true }, ["management", "menu", "move"]], [full, []], [{}, ids]]) {
    s.nativeCoverage = coverage;
    s.actions.relayout(s.addon);
    current(s, expected);
    assert.equal(s.addon.dynamicCommentContext, context);
    assert.equal(JSON.stringify(s.settings), settings);
  }
});

test("the real native-menu watcher applies scene evidence changes after settling", () => {
  const s = fixture({}), native = s.context.__MN_NATIVE_CARD_MENU_MNCommentManagerAddon;
  s.context.MNUtil.currentNotebookId = "notebook1";
  s.context.MNUtil.immersiveMode = false;
  s.context.MNNote = Object.assign(s.context.MNNote || {}, { getFocusNotes: () => [{ noteId: "one" }] });
  const menu = { visible: true, items: [], subviews: [] };
  s.context.PopupMenu = { currentMenu: () => menu };
  native.opened(s.addon, { userInfo: { noteId: "one", winRect: { x: 100, y: 110, width: 120, height: 50 } } });
  const context = s.addon.dynamicCommentContext;
  s.nativeCoverage = full;
  s.advance(300);
  current(s, []);
  s.nativeCoverage = {};
  s.advance(300);
  current(s, ids);
  const sender = s.addon.dynamicAddCommentButton;
  s.actions.beginInteraction(s.addon, sender);
  const before = signature(s);
  s.nativeCoverage = full;
  s.advance(1100);
  assert.deepEqual(signature(s), before, "watcher must respect the real dynamic held interaction");
  s.actions.endInteraction(s.addon, sender);
  s.advance(300);
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext, context);
  native.dispose(s.addon);
  assert.equal(s.addon.mncmNativeCardMenuState.noteId, "");
});

test("switching cards invalidates pending placement and uses the new note capability", () => {
  const s = fixture((_addon, context) => context.noteId === "one" ? full : {});
  current(s, []);
  const old = s.addon.dynamicCommentContext;
  s.selectCard("two");
  assert.notEqual(s.addon.dynamicCommentContext.token, old.token);
  assert.equal(s.addon.dynamicCommentContext.noteId, "two");
  current(s, ids);
  s.advance(2000);
  current(s, ids);
  s.selectCard("one");
  s.advance(2000);
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext.noteId, "one");
});

test("coverage and stale callbacks are isolated between window instances", () => {
  const s = fixture({});
  s.nativeCoverage = addon => addon === s.addon ? full : {};
  s.actions.relayout(s.addon);
  current(s, []);
  const firstContext = s.addon.dynamicCommentContext;
  const secondHost = new s.host.constructor({ x: 0, y: 0, width: 600, height: 600 });
  const second = { window: {} };
  s.context.MNUtil.currentWindow = second.window;
  s.context.MNUtil.studyView = secondHost;
  assert.equal(s.actions.handlePopupMenuOnNote(s.addon, { userInfo: { noteId: "two" } }), false);
  assert.equal(s.actions.handlePopupMenuOnNote(second, { userInfo: { noteId: "two", winRect: { x: 100, y: 110, width: 120, height: 50 } } }), true);
  s.advance(2000);
  assert.deepEqual(visible(s, second), ids);
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext, firstContext);
  assert.equal(second.dynamicCommentContext.noteId, "two");
  assert.ok(s.coverageCalls.some(call => call.addon === second && call.context === second.dynamicCommentContext));
  s.context.MNUtil.currentWindow = s.addon.window;
  s.context.MNUtil.studyView = s.host;
  s.actions.relayout(s.addon);
  current(s, []);
  assert.deepEqual(visible(s, second), ids);
  Object.assign(s.settings, { autoHideNativeDuplicates: false });
  s.actions.refreshButtons(s.addon);
  current(s, ids, "the shared opt-out must apply when this window is active");
  s.context.MNUtil.currentWindow = second.window;
  s.context.MNUtil.studyView = secondHost;
  s.actions.relayout(second);
  assert.deepEqual(visible(s, second), ids);
  Object.assign(s.settings, { autoHideNativeDuplicates: true });
  s.actions.refreshButtons(second);
  assert.deepEqual(visible(s, second), ids, "the other window's native evidence must not replace this window's controls");
  s.context.MNUtil.currentWindow = s.addon.window;
  s.context.MNUtil.studyView = s.host;
  s.actions.relayout(s.addon);
  current(s, []);
});

test("window deactivation and reactivation preserve custom actions, disabled controls and order", () => {
  const s = fixture(full);
  configure(s, {
    managementTapAction: "quickInput", managementHoldAction: "none", showQuickCommentButton: false,
    dynamicButtonOrder: ["move", "add", "management"],
  });
  current(s, ["management"]);
  const sender = s.addon.dynamicCommentButton;
  assert.equal(s.actions.beginInteraction(s.addon, sender), true);
  const queued = { ...sender };
  s.addon.sceneWillResignActive();
  current(s, []);
  assert.equal(s.addon.dynamicCommentContext, null);
  const secondHost = new s.host.constructor({ x: 0, y: 0, width: 600, height: 600 });
  const second = { window: {} };
  s.context.MNUtil.currentWindow = second.window;
  s.context.MNUtil.studyView = secondHost;
  s.nativeCoverage = {};
  assert.equal(s.actions.handlePopupMenuOnNote(second, { userInfo: { noteId: "two", winRect: { x: 100, y: 110, width: 120, height: 50 } } }), true);
  s.advance(700);
  assert.deepEqual(visible(s, second), ["management", "menu", "move"]);
  assert.equal(s.actions.dispatchAction(s.addon, false, false, queued), false);
  s.actions.hideButton(second, "scene.inactive");
  s.context.MNUtil.currentWindow = s.addon.window;
  s.context.MNUtil.studyView = s.host;
  s.addon.sceneDidBecomeActive();
  s.actions.relayout(s.addon);
  current(s, [], "reactivation cannot revive the old menu context");
  s.nativeCoverage = full;
  s.selectCard("two");
  current(s, ["management"]);
  assert.equal(s.actions.dispatchAction(s.addon, false, false, queued), false, "the old held event remains stale after reopening");
  s.nativeCoverage = {};
  s.actions.relayout(s.addon);
  const physical = visible(s).sort((a, b) => s.addon[properties[a]].frame.x - s.addon[properties[b]].frame.x);
  assert.deepEqual(physical, ["move", "management", "menu"]);
  assert.equal(s.settings.showQuickCommentButton, false);
  assert.equal(s.settings.managementTapAction, "quickInput");
  assert.equal(s.settings.managementHoldAction, "none");
  assert.deepEqual(s.settings.dynamicButtonOrder, ["move", "add", "management"]);
  assert.deepEqual(visible(s, second), []);
});

test("coverage updates do not move or remove a pressed floating control", () => {
  const s = fixture({}), token = s.addon.dynamicCommentContext.token;
  const sender = s.addon.dynamicAddCommentButton;
  assert.equal(s.actions.beginInteraction(s.addon, sender), true);
  const before = signature(s);
  s.nativeCoverage = full;
  assert.equal(s.actions.relayout(s.addon), false);
  s.advance(2000);
  assert.deepEqual(signature(s), before);
  assert.equal(s.addon.dynamicCommentContext.token, token);
  assert.equal(s.actions.endInteraction(s.addon, sender), true);
  s.actions.relayout(s.addon);
  current(s, []);
});

test("known native tracking or keyboard focus pauses automatic replacement", () => {
  for (const field of ["tracking", "isFirstResponder"]) {
    const s = fixture({}), control = s.addon.dynamicCommentButton;
    attachNativeControlState(s);
    if (field === "isFirstResponder") control[field] = () => true;
    else control[field] = true;
    const before = signature(s);
    s.nativeCoverage = full;
    assert.equal(s.actions.relayout(s.addon), false, field);
    s.advance(2000);
    assert.deepEqual(signature(s), before, field);
    if (field === "isFirstResponder") control[field] = () => false;
    else control[field] = false;
    s.actions.relayout(s.addon);
    current(s, []);
  }
});

test("released no-action holds cannot leave stale native state blocking a fresh popup or refresh", () => {
  for (const reopen of ["popup", "refresh"]) {
    for (const residue of ["touchInside", "hidden-focus", "disabled-focus"]) {
      const s = fixture(full), calls = [];
      configure(s, { addHoldAction: "none" });
      attachNativeControlState(s);
      current(s, ["add"]);
      const sender = s.addon.dynamicAddCommentButton;
      s.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = { open(_addon, context) { calls.push(context.noteId); } };
      assert.equal(s.actions.beginInteraction(s.addon, sender), true);
      sender.tracking = true;
      sender.touchInside = true;
      assert.equal(s.actions.dispatchAction(s.addon, true, true, sender), false);
      assert.equal(s.actions.endLongPress(s.addon, sender, 3), true);
      sender.tracking = false;
      assert.equal(s.actions.dispatchAction(s.addon, true, false, sender), false);
      assert.deepEqual(calls, [], "releasing a no-action hold cannot append its tap action");
      s.advance(600);

      // UIControl can retain touchInside after release. A separate stale focus
      // flag on an inactive control must not stop the current card's entries.
      if (residue !== "touchInside") {
        sender.touchInside = false;
        const oldControl = s.addon.dynamicCommentButton;
        oldControl.isFirstResponder = () => true;
        oldControl.hidden = residue === "hidden-focus";
        oldControl.enabled = residue !== "disabled-focus";
        oldControl.userInteractionEnabled = residue !== "disabled-focus";
      }
      const priorToken = s.addon.dynamicCommentContext.token;
      s.nativeCoverage = {};
      if (reopen === "popup") {
        s.selectCard("one");
        assert.notEqual(s.addon.dynamicCommentContext.token, priorToken, residue);
      } else s.actions.refreshButtons(s.addon);
      current(s, ids, `${reopen}: ${residue} must not prevent restoring custom controls`);
      assert.equal(s.settings.addHoldAction, "none");
      assert.equal(s.actions.beginInteraction(s.addon, sender), true);
      assert.equal(s.actions.dispatchAction(s.addon, true, false, sender), true);
      assert.deepEqual(calls, ["one"], `${reopen}: ${residue} must preserve the next deliberate tap`);
      s.actions.endInteraction(s.addon, sender);
    }
  }
});

test("input, quick panel, workflow and popover ownership survive coverage updates", () => {
  for (const property of ["quickCommentController", "mncmWorkflowPanelOwnsEntries", "dynamicCommentMenuPopoverController"]) {
    const s = fixture({}), original = signature(s), context = s.addon.dynamicCommentContext;
    let dismisses = 0;
    const panel = property === "mncmWorkflowPanelOwnsEntries" ? true : { draft: "retained", dismissPopoverAnimated() { dismisses++; } };
    s.addon[property] = panel;
    s.nativeCoverage = full;
    assert.equal(s.actions.relayout(s.addon), false);
    s.advance(2000);
    assert.deepEqual(signature(s), original, property);
    assert.equal(s.addon[property], panel);
    assert.equal(s.addon.dynamicCommentContext, context);
    assert.equal(dismisses, 0);
  }
  const s = fixture({});
  assert.equal(s.open(), true);
  const rail = s.addon.dynamicMoveRailView, state = s.state(), order = s.order();
  assert.ok(rail);
  s.nativeCoverage = full;
  assert.equal(s.actions.relayout(s.addon), false);
  s.advance(2000);
  assert.equal(s.addon.dynamicMoveRailView, rail);
  assert.equal(s.state(), state);
  assert.deepEqual(s.order(), order);
});

test("empty cards and excerpt-only cards keep the existing quick-panel eligibility", () => {
  const s = fixture({});
  s.notes.one.comments = [];
  s.selectCard("one");
  current(s, ["management", "menu", "add"]);
  s.context.__MN_COMMENT_DATA__.getExcerptState = () => ({ present: true });
  s.actions.relayout(s.addon);
  current(s, ids);
  s.nativeCoverage = { quick: true };
  s.actions.relayout(s.addon);
  current(s, ["management", "menu", "add"]);
  s.nativeCoverage = {};
  s.actions.relayout(s.addon);
  current(s, ids);
});

if (failures.length) {
  console.error(`${failures.length}/${groups} adaptive integration groups failed`);
  process.exitCode = 1;
} else console.log(`${groups} adaptive integration groups passed (controlled coverage; no host accessibility/primary-menu claim)`);
