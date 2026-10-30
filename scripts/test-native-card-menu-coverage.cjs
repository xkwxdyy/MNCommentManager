// Runtime module tests. Scene records and view trees below are controlled fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = path.resolve(process.argv[2] || path.resolve(__dirname, "../src"));
const prefix = "addon.marginnote.extension.mncommentmanager.";
const catalog = [
  { id: "nativeCommentManager", title: "评论管理" },
  { id: "nativeAddComment", title: "添加评论" },
];
const actions = catalog.map(command => prefix + command.id + ":");
const configuredCommands = which => ["commentNote", ...which.map(index => actions[index])];
const primaryItems = which => [
  { title: "", actionString: "noteHighlight:" },
  ...which.map(index => ({ title: catalog[index].title, actionString: actions[index] })),
  { title: "", actionString: "" },
];
const empty = { quick: false, manager: false, menu: false, quickInput: false };
const both = { ...empty, quick: true, quickInput: true };

function fixture() {
  let now = 100000, menu, scene = { scene: "scene1", commands: configuredCommands([0, 1]) }, hitOverride, selectedId = "A";
  const timers = [], notes = { A: { noteId: "A" }, B: { noteId: "B" } };
  class View {
    constructor(frame = { x: 0, y: 0, width: 400, height: 90 }) {
      this.frame = { ...frame };
      this.bounds = { x: 0, y: 0, width: frame.width, height: frame.height };
      this.subviews = [];
      this.gestures = [];
      this.hidden = false;
      this.alpha = 1;
      this.userInteractionEnabled = true;
      this.clipsToBounds = false;
      this.enabled = true;
    }
    addSubview(view) { view.removeFromSuperview(); view.superview = this; view.window = this.window; this.subviews.push(view); }
    removeFromSuperview() {
      if (this.superview) this.superview.subviews = this.superview.subviews.filter(view => view !== this);
      this.superview = null;
    }
    titleForState() { return this.title || ""; }
    addGestureRecognizer(gesture) { gesture.view = this; this.gestures.push(gesture); }
    removeGestureRecognizer(gesture) { this.gestures = this.gestures.filter(item => item !== gesture); }
    convertRectToView(rect, target) {
      let x = rect.x, y = rect.y;
      for (let view = this, depth = 0; view && view !== target; view = view.superview, depth++) {
        assert.ok(depth < 100, "fixture coordinate chain must terminate");
        x += view.frame.x - view.bounds.x;
        y += view.frame.y - view.bounds.y;
      }
      return { x, y, width: rect.width, height: rect.height };
    }
  }
  const window = new View({ x: 0, y: 0, width: 1024, height: 768 });
  window.window = window;
  window.hitTestWithEvent = point => {
    if (hitOverride !== undefined) return hitOverride;
    if (!menu || !menu.visible || menu.hidden || menu.alpha <= 0.01) return window;
    return (menu.subviews || []).find(button => {
      if (button.hidden || button.alpha <= 0.01 || button.enabled !== true) return false;
      const rect = button.convertRectToView(button.bounds, window);
      return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
    }) || menu;
  };
  function rebuild(which = [0, 1]) {
    if (menu) menu.removeFromSuperview();
    menu = new View(); menu.visible = true; window.addSubview(menu);
    menu.items = primaryItems(which);
    const buttons = catalog.map((command, index) => {
      const button = new View({ x: 20 + index * 110, y: 20, width: 100, height: 44 });
      button.title = command.title; menu.addSubview(button); return button;
    });
    return { menu, buttons, management: buttons[0], add: buttons[1] };
  }
  rebuild();
  const addon = { window, mnCommentManagerSceneActive: true };
  const context = vm.createContext({
    console: { log() {} }, Date: { now: () => now }, Math,
    UIView: View,
    MNUtil: { currentWindow: window, studyView: window, currentNotebookId: "notebook1", isMacOS: () => true, immersiveMode: true,
      immersiveTemplateForAddon: { config: {}, templateId: "scene1", allowed: true } },
    MNNote: { getFocusNotes: () => [notes[selectedId]] },
    Database: { sharedInstance: () => ({ getNoteById: id => notes[id] }) },
    Application: { sharedInstance: () => ({ documentPath: "/fixture" }) },
    NSFileManager: { defaultManager: () => ({ fileExistsAtPath: () => true }) },
    NSJSONSerialization: { dataWithJSONObjectOptions: () => ({ writeToFileAtomically: () => true }) },
    PopupMenu: { currentMenu: () => menu },
    NSTimer: { scheduledTimerWithTimeInterval(seconds, repeat, cb) {
      const timer = { seconds, repeat, cb, invalid: false, invalidate() { this.invalid = true; } };
      timers.push(timer); return timer;
    } },
    UITapGestureRecognizer: function () {}, UILongPressGestureRecognizer: function () {},
    __MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon: { read: () => scene },
    __MN_DYNAMIC_COMMENT_ACTIONS__: { relayout() {} },
  });
  context.MNUtil.notebookController = { notebookId: "notebook1", view: { hidden: false },
    get mindmapView() { return { selViewLst: [{ note: { note: notes[selectedId] } }] }; } };
  vm.runInContext(fs.readFileSync(path.join(runtime, "NoteAccess.js"), "utf8"), context);
  for (const name of ["NativeMenuVisibility", "NativeCardMenuActions"]) vm.runInContext(fs.readFileSync(path.join(runtime, name + ".js"), "utf8"), context, { filename: name + ".js" });
  const api = context.__MN_NATIVE_CARD_MENU_MNCommentManagerAddon;
  function tick(seconds) {
    const pending = timers.splice(0);
    pending.forEach(timer => {
      if (timer.invalid) return;
      if (timer.seconds <= seconds) timer.cb(); else timers.push(timer);
    });
  }
  function open(id = "A") { selectedId = id; api.opened(addon, { userInfo: { noteId: id, winRect: { x: 20, y: 20, width: 100, height: 44 } } }); }
  function capture(which = [0, 1], mutate, delay = 20) {
    open(); const tree = rebuild(which); if (mutate) mutate(tree);
    now += delay; tick(.02); return tree;
  }
  return { api, addon, context, window, notes, timers, open, tick, capture, rebuild,
    advanceTime(ms) { now += ms; },
    setScene(value) { scene = value; }, setHit(value) { hitOverride = value; },
    get scene() { return scene; }, get menu() { return menu; },
    read(target = { noteId: "A" }, targetAddon = addon) { return JSON.parse(JSON.stringify(api.coverage(targetAddon, target))); },
  };
}

module.exports = { fixture };
if (process.env.MNCM_COVERAGE_FIXTURE_ONLY !== "1") {
let groups = 0;
const failures = [];
function test(name, body) {
  groups++;
  try { body(); console.log("PASS " + name); }
  catch (error) { failures.push({ name, error }); console.error("FAIL " + name + ": " + error.stack); }
}

test("fresh primary evidence covers only directly accessible quick and input actions", () => {
  const f = fixture(); f.capture();
  assert.deepEqual(f.read(), both);
  assert.equal(f.addon.mncmNativeCardMenuState.bindings[0].gestures.length, 2);
  assert.equal(f.read().manager, false, "bound double tap is insufficient proof of keyboard or assistive access");
  assert.equal(f.read().menu, false, "bound hold is insufficient proof of keyboard or assistive access");
});

test("zero, manager-only, add-only and both entries cover only their matching primary strips", () => {
  for (const [configured, actual, expected] of [
    [[], [], empty], [[0], [0], { ...empty, quick: true }],
    [[1], [1], { ...empty, quickInput: true }], [[0, 1], [0, 1], both],
    [[1, 0], [1, 0], both],
    [[], [0, 1], empty], [[0], [0, 1], empty], [[1], [0, 1], empty],
    [[0, 1], [0], empty], [[0, 1], [1], empty],
  ]) {
    const f = fixture(); f.scene.commands = configuredCommands(configured); f.capture(actual);
    assert.deepEqual(f.read(), expected);
    if (configured.join() !== actual.join()) assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, true, "a partial or extra strip is not primary evidence");
    else {
      assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, false);
      assert.ok(f.addon.mncmNativeCardMenuState.rootProof, "even a strip with neither addon command has a valid observed layout");
    }
  }
});

test("a command visible only outside the configured primary list cannot remove its dynamic counterpart", () => {
  const f = fixture(); f.scene.commands = configuredCommands([0]); f.capture();
  assert.deepEqual(f.read(), empty, "an unconfigured visible command makes the whole strip unknown");
  assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, true);
});

test("a More menu invalidates root proof permanently until a new note-popup notification", () => {
  for (const inPlace of [false, true]) {
    const f = fixture(), root = f.capture(); assert.deepEqual(f.read(), both);
    if (inPlace) f.menu.items = [{ title: "更多", actionString: "more:" }];
    else f.rebuild([1]);
    assert.deepEqual(f.read(), empty);
    if (inPlace) f.menu.items = primaryItems([0, 1]);
    else { f.menu.removeFromSuperview(); f.window.addSubview(root.menu); f.context.PopupMenu.currentMenu = () => root.menu; }
    assert.deepEqual(f.read(), empty, "restoring an old tree is insufficient after proof is invalidated");
    f.context.PopupMenu.currentMenu = () => f.menu;
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("a submenu first observed inside 250 ms cannot become primary evidence", () => {
  for (const inPlace of [false, true]) {
    const f = fixture(); f.open(); const root = f.rebuild();
    f.advanceTime(10);
    const submenu = inPlace ? root : f.rebuild();
    submenu.menu.items = catalog.map((command, index) => ({ title: command.title, actionString: actions[index] }));
    f.advanceTime(10); f.tick(.02);
    assert.deepEqual(f.read(), empty, "known addon titles and a fresh tree inside the deadline do not prove a primary strip");
    assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, true);
    if (inPlace) root.menu.items = primaryItems([0, 1]);
    else {
      submenu.menu.removeFromSuperview(); f.window.addSubview(root.menu);
      f.context.PopupMenu.currentMenu = () => root.menu;
    }
    assert.deepEqual(f.read(), empty, "restoring the original primary tree must not upgrade a failed first observation");
    f.context.PopupMenu.currentMenu = () => f.menu;
    f.rebuild(); assert.deepEqual(f.read(), empty, "another new tree inside the same opening must also remain unknown");
    f.capture(); assert.deepEqual(f.read(), both, "a new note-popup notification can establish fresh primary evidence");
  }
});

test("unknown template layouts and duplicate configured commands fail closed for that opening", () => {
  for (const configured of [
    [], actions.slice(), ["commentNote", "copyNote:", ...actions],
    ["commentNote", actions[0], actions[0]], ["commentNote", ...actions, "addon.other.test:"],
    ["commentNote", "commentNote", ...actions],
  ]) {
    const f = fixture(); f.scene.commands = configured; f.capture();
    assert.deepEqual(f.read(), empty);
    assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, true);
    f.scene.commands = configuredCommands([0, 1]); f.rebuild();
    assert.deepEqual(f.read(), empty, "fixing unknown configuration without a new popup cannot upgrade coverage");
    f.capture(); assert.deepEqual(f.read(), both);
  }
  const duplicate = fixture(); duplicate.scene.commands = configuredCommands([0, 0]); duplicate.capture([0, 0]);
  assert.deepEqual(duplicate.read(), empty);
  assert.equal(duplicate.addon.mncmNativeCardMenuState.rootInvalid, true, "even a matching duplicate strip is outside the verified shape");
  duplicate.scene.commands = configuredCommands([0, 1]); duplicate.rebuild(); assert.deepEqual(duplicate.read(), empty);
  const unknown = fixture(); unknown.scene.commands = ["commentNote", actions[0], "copyNote:"];
  unknown.capture([0, 1], ({ menu }) => { menu.items[2] = { title: "复制", actionString: "copyNote:" }; });
  assert.deepEqual(unknown.read(), empty, "matching item count, order and primary markers do not validate an unsupported configured command");
  assert.equal(unknown.addon.mncmNativeCardMenuState.rootInvalid, true);
});

test("extra items, mismatched order and missing or changed primary markers cannot hide dynamic controls", () => {
  for (const mutate of [
    items => { items.splice(1, 0, { title: "其他命令", actionString: "copyNote:" }); },
    items => { [items[1], items[2]] = [items[2], items[1]]; },
    items => { items.shift(); },
    items => { items.pop(); },
    items => { items[0].title = "评论"; },
    items => { items[0].actionString = "commentNote:"; },
    items => { items[items.length - 1].title = "更多"; },
    items => { items[items.length - 1].actionString = "more:"; },
  ]) {
    const f = fixture(); f.capture([0, 1], ({ menu }) => mutate(menu.items));
    assert.deepEqual(f.read(), empty);
    assert.equal(f.addon.mncmNativeCardMenuState.rootInvalid, true);
    f.menu.items = primaryItems([0, 1]); assert.deepEqual(f.read(), empty);
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("rebuilding the root menu or changing its child tree also requires another opened notification", () => {
  for (const change of [f => f.rebuild(), f => f.menu.addSubview(new f.window.constructor({ x: 0, y: 0, width: 5, height: 5 }))]) {
    const f = fixture(); f.capture(); change(f);
    assert.deepEqual(f.read(), empty);
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("hidden or offscreen commands at capture never acquire coverage by later becoming visible", () => {
  for (const change of [
    { hide(button) { button.hidden = true; }, reveal(button) { button.hidden = false; } },
    { hide(button) { button.frame.x = 2000; }, reveal(button) { button.frame.x = 130; } },
  ]) {
    const f = fixture(), root = f.capture([0, 1], ({ add }) => change.hide(add));
    assert.deepEqual(f.read(), { ...empty, quick: true });
    change.reveal(root.add);
    assert.deepEqual(f.read(), { ...empty, quick: true }, "frozen primary evidence must not grow without a new opened event");
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("configuration edits under the same scene identifier invalidate proof", () => {
  const f = fixture(); f.capture();
  f.scene.commands = configuredCommands([0]);
  assert.deepEqual(f.read(), empty);
  f.scene.commands = configuredCommands([0, 1]); assert.deepEqual(f.read(), empty);
  f.capture(); assert.deepEqual(f.read(), both);
});

test("scene identifier, explicit file permission and immersive mode changes invalidate proof", () => {
  for (const mutate of [
    f => { f.context.MNUtil.immersiveTemplateForAddon.templateId = "scene2"; },
    f => { f.setScene(null); },
    f => { f.context.MNUtil.immersiveMode = false; },
    f => { f.setScene({ scene: "scene2", commands: configuredCommands([0, 1]) }); },
  ]) {
    const f = fixture(); f.capture(); mutate(f); assert.deepEqual(f.read(), empty);
    f.context.MNUtil.immersiveTemplateForAddon = { config: {}, templateId: "scene1", allowed: true };
    f.context.MNUtil.immersiveMode = true; f.setScene({ scene: "scene1", commands: configuredCommands([0, 1]) });
    assert.deepEqual(f.read(), empty);
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("first root capture later than 250 ms fails closed for the remainder of that opening", () => {
  const f = fixture(); f.capture([0, 1], null, 251);
  assert.deepEqual(f.read(), empty);
  f.rebuild(); assert.deepEqual(f.read(), empty);
  f.capture(); assert.deepEqual(f.read(), both);
  const boundary = fixture(); boundary.capture([0, 1], null, 250); assert.deepEqual(boundary.read(), both);
});

test("an unchanged visible menu from before opened cannot establish a new root", () => {
  const f = fixture(); f.open(); f.advanceTime(20); f.tick(.02);
  assert.deepEqual(f.read(), empty);
  f.rebuild(); assert.deepEqual(f.read(), both, "a newly built tree inside the capture window can establish evidence");
});

test("incomplete, cyclic, over-budget or over-depth trees lock coverage to unknown", () => {
  for (const mutate of [
    menu => { menu.subviews = null; },
    menu => { menu.subviews = { length: 0 }; },
    menu => { menu.subviews.push(menu); },
    menu => { for (let index = 0; index < 129; index++) menu.addSubview(new menu.constructor()); },
    menu => { let view = menu; for (let index = 0; index < 17; index++) { const child = new menu.constructor(); view.addSubview(child); view = child; } },
  ]) {
    const f = fixture(); f.open(); const root = f.rebuild(), children = root.menu.subviews.slice(); mutate(root.menu);
    f.advanceTime(20); f.tick(.02); assert.deepEqual(f.read(), empty);
    root.menu.subviews = children; assert.deepEqual(f.read(), empty);
    f.capture(); assert.deepEqual(f.read(), both);
  }
});

test("a native view-tree read exception also locks the opening to unknown", () => {
  const f = fixture(); f.open(); const root = f.rebuild(), children = root.menu.subviews;
  Object.defineProperty(root.menu, "subviews", { configurable: true, get() { throw new Error("native view tree unavailable"); } });
  f.advanceTime(20); f.tick(.02); assert.deepEqual(f.read(), empty);
  Object.defineProperty(root.menu, "subviews", { configurable: true, writable: true, value: children });
  assert.deepEqual(f.read(), empty, "a failed first observation must not later be promoted into root evidence");
  f.capture(); assert.deepEqual(f.read(), both);
});

test("missing or malformed scene data cannot claim native coverage", () => {
  for (const scene of [null, {}, { scene: "scene1" }, { scene: "", commands: actions }, { scene: "scene1", commands: [] }]) {
    const f = fixture(); f.setScene(scene); f.capture(); assert.deepEqual(f.read(), empty);
  }
});

test("inactive windows, absent targets, deletion and inactive scenes retain dynamic fallbacks", () => {
  for (const mutate of [
    f => { f.context.MNUtil.currentWindow = {}; },
    f => { f.addon.mnCommentManagerSceneActive = false; },
    f => { delete f.notes.A; },
    f => { f.menu.visible = false; },
  ]) {
    const f = fixture(); f.capture(); mutate(f); assert.deepEqual(f.read(), empty);
  }
  const f = fixture(); f.capture();
  assert.deepEqual(f.read(null), empty);
  assert.deepEqual(f.read({ noteId: "B" }), empty);
  assert.deepEqual(f.read({ noteId: "missing" }), empty);
  assert.deepEqual(f.read({ noteId: "A" }, { window: {} }), empty);
});

test("cross-window menu objects and unsupported host families do not establish evidence", () => {
  for (const mutate of [
    f => { f.context.MNUtil.isMacOS = () => false; },
    f => { delete f.context.MNUtil.isMacOS; },
    f => { f.menu.window = {}; },
  ]) {
    const f = fixture(); f.open(); f.rebuild(); mutate(f); f.advanceTime(20); f.tick(.02); assert.deepEqual(f.read(), empty);
  }
});

test("occlusion and unavailable hit testing cannot count a button as accessible", () => {
  for (const mutate of [
    f => { f.setHit(f.window); },
    f => { f.setHit(null); },
    f => { f.window.hitTestWithEvent = undefined; },
    f => { f.window.hitTestWithEvent = () => { throw new Error("native hit test unavailable"); }; },
  ]) {
    const f = fixture(); f.open(); f.rebuild(); mutate(f); f.advanceTime(20); f.tick(.02);
    assert.deepEqual(f.read(), empty);
  }
  const f = fixture(), root = f.capture();
  f.setHit(f.window); assert.deepEqual(f.read(), empty, "occlusion after capture also removes coverage");
  const child = new f.window.constructor(); child.superview = root.management;
  f.setHit(child); assert.equal(f.read().quick, true, "a button descendant hit still reaches its parent control");
});

test("disabled, transparent, mismatched or clipped controls remain available dynamically", () => {
  for (const mutate of [
    ({ management }) => { management.enabled = false; },
    ({ management }) => { management.hidden = true; },
    ({ management }) => { management.alpha = 0; },
    ({ management }) => { management.userInteractionEnabled = false; },
    ({ management }) => { management.window = {}; },
    ({ management }) => { management.bounds.width = 0; },
    ({ management }) => { management.bounds.width = NaN; },
    ({ management }) => { management.frame.x = -10; },
    ({ menu }) => { menu.clipsToBounds = true; menu.bounds.width = 90; },
  ]) {
    const f = fixture(); f.capture([0, 1], mutate); assert.equal(f.read().quick, false);
  }
});

test("duplicate titles or duplicate command identifiers cannot establish replacement", () => {
  for (const mutate of [
    ({ menu, management }) => { const extra = new menu.constructor(management.frame); extra.title = management.title; menu.addSubview(extra); },
    ({ menu }) => { menu.items.push({ ...menu.items[1] }); },
    ({ menu }) => { menu.items[1].title = "管理"; },
    ({ menu }) => { menu.items[1].actionString = "addon.other.nativeCommentManager:"; },
  ]) {
    const f = fixture(); f.capture([0, 1], mutate); assert.equal(f.read().quick, false);
  }
});

test("async host identity loss does not override explicit scene-file permission", () => {
  const f = fixture(); f.context.MNUtil.immersiveTemplateForAddon.allowed = false; f.capture(); assert.deepEqual(f.read(), both);
  f.addon.mnCommentManagerInitialized = false; assert.deepEqual(f.read(), empty);
});

test("host menu editor canonical and legacy edit-card aliases share one verified leading item", () => {
  for (const aliases of [["noteHighlight:"], ["commentNote", "noteHighlight:"], ["noteHighlight:", "commentNote"]]) {
    for (const which of [[], [0], [1], [0, 1]]) {
      const f = fixture(); f.scene.commands = [...aliases, ...which.map(index => actions[index])]; f.capture(which);
      assert.deepEqual(f.read(), { ...empty, quick: which.includes(0), quickInput: which.includes(1) });
    }
  }
  for (const configured of [
    ["noteHighlight:", "noteHighlight:", ...actions],
    ["commentNote", actions[0], "noteHighlight:", actions[1]],
    ["noteHighlight:", "copyNote:", ...actions],
    ["commentNote", "noteHighlight:", actions[0], actions[0]],
  ]) {
    const f = fixture(); f.scene.commands = configured; f.capture(); assert.deepEqual(f.read(), empty);
  }
});

test("normalizing the edit-card alias cannot revive a changed or secondary menu", () => {
  const f = fixture(); f.scene.commands = ["commentNote", "noteHighlight:", ...actions]; f.capture(); assert.deepEqual(f.read(), both);
  const original = f.menu.items;
  f.menu.items = [{ title: "更多", actionString: "more:" }, ...original.slice(1)];
  assert.deepEqual(f.read(), empty);
  f.menu.items = original; assert.deepEqual(f.read(), empty, "restored rows cannot revive invalid primary evidence");
  f.capture(); assert.deepEqual(f.read(), both);
  f.scene.commands = ["noteHighlight:", ...actions];
  assert.deepEqual(f.read(), empty, "same visible commands with a changed template still need a new popup");
});

if (failures.length) {
  console.error(`${failures.length}/${groups} native coverage groups failed`);
  process.exitCode = 1;
} else console.log(`${groups} native coverage groups passed (${runtime}; controlled scene data, actual visibility and native coverage modules)`);
}
