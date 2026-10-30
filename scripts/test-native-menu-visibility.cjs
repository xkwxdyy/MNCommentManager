#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modulePath = path.resolve(process.argv[2] || path.join(__dirname, "../src/NativeMenuVisibility.js"));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });
const visibility = context.__MN_NATIVE_MENU_VISIBILITY_MNCommentManagerAddon;
let assertions = 0;
const title = "评论管理";

function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions += 1;
}

function view(bounds = { x: 0, y: 0, width: 500, height: 500 }) {
  return {
    hidden: false, alpha: 1, userInteractionEnabled: true, clipsToBounds: false,
    bounds: { ...bounds }, subviews: [], superview: null, window: null,
    tracking: false, touchInside: false, isFirstResponder() { return false; },
    convertRectToView(rect, target) {
      assert.equal(target, this.window, "conversion target is the attached window");
      return this.windowRect || { ...rect };
    },
  };
}

function attach(parent, child) {
  parent.subviews.push(child);
  child.superview = parent;
  child.window = parent.window;
  return child;
}

function fixture() {
  const window = view();
  window.window = window;
  const host = attach(window, view());
  const menu = attach(host, view({ x: 0, y: 0, width: 200, height: 100 }));
  menu.windowRect = { x: 20, y: 20, width: 200, height: 100 };
  const button = attach(menu, view({ x: 0, y: 0, width: 80, height: 40 }));
  button.windowRect = { x: 30, y: 30, width: 80, height: 40 };
  button.enabled = true;
  button.titleForState = (state) => {
    assert.equal(state, 0, "only normal title is queried");
    return title;
  };
  return { window, host, menu, button };
}

function find(f) { return visibility.find(f.menu, title, f.window); }
function rejected(label, modify) {
  const f = fixture();
  modify(f);
  equal(find(f), null, label);
}

const initial = fixture();
equal(find(initial), initial.button, "unique attached visible button is found");
for (const role of ["button", "menu", "host", "window"]) {
  for (const [field, invalid] of [["hidden", true], ["hidden", undefined], ["hidden", 0],
    ["alpha", 0.01], ["alpha", 0], ["alpha", -1], ["alpha", NaN], ["alpha", Infinity], ["alpha", "1"], ["alpha", undefined],
    ["userInteractionEnabled", false], ["userInteractionEnabled", undefined], ["userInteractionEnabled", 1],
    ["clipsToBounds", undefined], ["clipsToBounds", 1], ["convertRectToView", undefined],
    ["bounds", undefined], ["bounds", { x: 0, y: 0, width: 0, height: 20 }],
    ["bounds", { x: 0, y: 0, width: 20, height: -1 }], ["bounds", { x: "0", y: 0, width: 20, height: 20 }],
    ["bounds", { x: 0, y: 0, width: Infinity, height: 20 }], ["bounds", { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 20 }]]) {
    rejected(`${role}.${field}=${String(invalid)} is rejected`, (f) => { f[role][field] = invalid; });
  }
  if (role !== "window") {
    rejected(`${role} wrong attached window`, (f) => { f[role].window = view(); });
    rejected(`${role} missing attached window`, (f) => { f[role].window = null; });
  }
  rejected(`${role} getter failure`, (f) => { Object.defineProperty(f[role], "hidden", { get() { throw new Error("stale native view"); } }); });
}
const actualRootWindow = fixture();
actualRootWindow.window.window = null;
equal(find(actualRootWindow), actualRootWindow.button, "real UIWindow nil window property does not invalidate the identical root");
actualRootWindow.window.window = undefined;
equal(find(actualRootWindow), actualRootWindow.button, "root attachment uses object identity rather than an inherited window field");
for (const invalid of [false, undefined, null, 0, "true"]) {
  rejected(`button enabled=${String(invalid)}`, (f) => { f.button.enabled = invalid; });
}
for (const role of ["host", "menu", "window"]) {
  rejected(`${role} disabled control ancestor`, (f) => { f[role].enabled = false; });
  const f = fixture();
  f[role].enabled = true;
  equal(find(f), f.button, `${role} enabled control ancestor is accepted`);
}

rejected("wrong title", (f) => { f.button.titleForState = () => "other"; });
rejected("title read throws", (f) => { f.button.titleForState = () => { throw new Error("gone"); }; });
rejected("missing button title method", (f) => { delete f.button.titleForState; });
rejected("malformed button title method", (f) => { f.button.titleForState = title; });
rejected("visible duplicate title", (f) => {
  const duplicate = attach(f.menu, view());
  duplicate.titleForState = () => title;
});
rejected("hidden duplicate title is still ambiguous", (f) => {
  const duplicate = attach(f.menu, view());
  duplicate.hidden = true;
  duplicate.titleForState = () => title;
});
rejected("disabled duplicate title is still ambiguous", (f) => {
  const duplicate = attach(f.menu, view());
  duplicate.enabled = false;
  duplicate.titleForState = () => title;
});
rejected("title on root is not a descendant button", (f) => {
  f.menu.titleForState = () => title;
  delete f.button.titleForState;
});
const withDifferentTitle = fixture();
attach(withDifferentTitle.menu, view()).titleForState = () => "添加评论";
equal(find(withDifferentTitle), withDifferentTitle.button, "unrelated titles are not ambiguous");

for (const invalid of [undefined, null, {}, { x: 0, y: 0, width: 0, height: 1 },
  { x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: -1, height: 1 }]) {
  rejected("invalid converted button bounds", (f) => { f.button.convertRectToView = () => invalid; });
}
rejected("button conversion fails", (f) => { f.button.convertRectToView = () => { throw new Error("detached"); }; });
for (const windowRect of [
  { x: -0.01, y: 30, width: 80, height: 40 },
  { x: 30, y: -0.01, width: 80, height: 40 },
  { x: 420.01, y: 30, width: 80, height: 40 },
  { x: 30, y: 460.01, width: 80, height: 40 },
]) rejected("partly outside window is not a direct entry", (f) => { f.button.windowRect = windowRect; });
const onWindowEdge = fixture();
onWindowEdge.button.windowRect = { x: 420, y: 460, width: 80, height: 40 };
equal(find(onWindowEdge), onWindowEdge.button, "fully on window edge is valid");
const scrolledWindow = fixture();
scrolledWindow.window.bounds = { x: 100, y: 200, width: 500, height: 500 };
scrolledWindow.button.windowRect = { x: 120, y: 220, width: 80, height: 40 };
equal(find(scrolledWindow), scrolledWindow.button, "window bounds origin is respected");

for (const role of ["menu", "host"]) {
  const clipped = fixture();
  clipped[role].clipsToBounds = true;
  clipped[role].windowRect = { x: 30, y: 30, width: 80, height: 40 };
  equal(find(clipped), clipped.button, `inside ${role} clipping rectangle`);
  for (const windowRect of [
    { x: 31, y: 30, width: 80, height: 40 },
    { x: 30, y: 31, width: 80, height: 40 },
    { x: 30, y: 30, width: 79, height: 40 },
    { x: 30, y: 30, width: 80, height: 39 },
  ]) rejected(`${role} clips any edge of button`, (f) => { f[role].clipsToBounds = true; f[role].windowRect = windowRect; });
  rejected(`${role} clipping conversion invalid`, (f) => { f[role].clipsToBounds = true; f[role].convertRectToView = () => null; });
  rejected(`${role} clipping conversion throws`, (f) => { f[role].clipsToBounds = true; f[role].convertRectToView = () => { throw new Error("gone"); }; });
  const overflowsUnclippedAncestor = fixture();
  overflowsUnclippedAncestor[role].windowRect = { x: 0, y: 0, width: 1, height: 1 };
  equal(find(overflowsUnclippedAncestor), overflowsUnclippedAncestor.button, `unclipped ${role} can contain overflowing visible button`);
}

rejected("button superview disagrees with menu subviews", (f) => { f.button.superview = f.host; });
rejected("menu detached from window", (f) => { f.menu.superview = null; });
rejected("host attached to another root", (f) => { f.host.superview = view(); });
rejected("parent chain cycle", (f) => { f.host.superview = f.menu; });
rejected("subtree cycle", (f) => { f.button.subviews = [f.menu]; f.menu.superview = f.button; });
rejected("repeated subtree reference", (f) => { f.menu.subviews.push(f.button); });
rejected("missing subviews cannot prove unique title", (f) => { delete f.button.subviews; });
rejected("subviews getter throws", (f) => { Object.defineProperty(f.menu, "subviews", { get() { throw new Error("gone"); } }); });
for (const invalid of [null, -1, 1.5, "2", NaN, Infinity, 129]) {
  rejected(`invalid subtree length ${invalid}`, (f) => { f.menu.subviews = { length: invalid }; });
}
const nativeArrayLike = fixture();
nativeArrayLike.menu.subviews = { 0: nativeArrayLike.button, length: 1 };
equal(find(nativeArrayLike), nativeArrayLike.button, "NSArray-shaped child collection is accepted");
const atLimit = fixture();
for (let index = 0; index < 126; index += 1) attach(atLimit.menu, view());
equal(find(atLimit), atLimit.button, "128 traversed views are allowed");
attach(atLimit.menu, view());
equal(find(atLimit), null, "129 traversed views cannot establish uniqueness");
const deepTree = fixture();
let parent = deepTree.menu;
deepTree.menu.subviews = [];
for (let index = 0; index < 34; index += 1) parent = attach(parent, view());
attach(parent, deepTree.button);
equal(find(deepTree), null, "subtree depth over 32 fails closed");
const deepAncestors = fixture();
parent = deepAncestors.window;
for (let index = 0; index < 33; index += 1) parent = attach(parent, view());
deepAncestors.host.superview = parent;
equal(find(deepAncestors), null, "parent chain depth over 32 fails closed");
for (const invalid of [null, undefined, false, 0, "menu"]) {
  equal(visibility.find(invalid, title, initial.window), null, "invalid menu rejected");
  equal(visibility.find(initial.menu, title, invalid), null, "invalid window rejected");
}
for (const invalid of [undefined, null, "", 0, false, {}]) {
  equal(visibility.find(initial.menu, invalid, initial.window), null, "invalid title rejected");
}
equal(visibility.find(initial.window, title, initial.window), null, "window cannot impersonate menu");

equal(visibility.isBusy([]), false, "no views means no positive busy state");
equal(visibility.isBusy([view(), null, {}]), false, "ordinary views and unknown states do not prove busy");
for (const field of ["tracking", "touchInside"]) {
  const busy = fixture().button;
  busy[field] = true;
  equal(visibility.isBusy([view(), busy]), field === "tracking", `${field} only protects an actively tracked control`);
  busy[field] = 1;
  equal(visibility.isBusy([busy]), false, `non-boolean ${field} is not trusted`);
}
const responder = fixture().button;
responder.isFirstResponder = function () { equal(this, responder, "responder method preserves native receiver"); return true; };
equal(visibility.isBusy([responder]), true, "first responder is protected");
const noResponder = fixture().button;
noResponder.isFirstResponder = () => 1;
equal(visibility.isBusy([noResponder]), false, "non-boolean response does not prove first responder");
const busyFailure = fixture().button;
busyFailure.isFirstResponder = () => { throw new Error("gone"); };
equal(visibility.isBusy([busyFailure]), true, "native state failure defers visual removal");
const idleTouchInside = fixture().button;
idleTouchInside.touchInside = true;
idleTouchInside.tracking = false;
equal(visibility.isBusy([idleTouchInside]), false, "idle touchInside remains harmless after tracking ends");
Object.defineProperty(idleTouchInside, "touchInside", { get() { throw new Error("unused position state"); } });
equal(visibility.isBusy([idleTouchInside]), false, "busy check does not read touch position state");
for (const state of ["tracking", "firstResponder"]) {
  for (const role of ["button", "menu", "host", "window"]) {
    for (const [field, value] of [["hidden", true], ["alpha", 0], ["userInteractionEnabled", false], ["enabled", false]]) {
      const stale = fixture();
      stale.button.tracking = state === "tracking";
      stale.button.isFirstResponder = () => state === "firstResponder";
      stale[role][field] = value;
      equal(visibility.isBusy([stale.button]), false, `${role}.${field} invalidates stale ${state}`);
    }
  }
  const detached = fixture();
  detached.button.tracking = state === "tracking";
  detached.button.isFirstResponder = () => state === "firstResponder";
  detached.button.superview = null;
  equal(visibility.isBusy([detached.button]), false, `detached control does not preserve stale ${state}`);
  const wrongWindow = fixture();
  wrongWindow.button.tracking = state === "tracking";
  wrongWindow.button.isFirstResponder = () => state === "firstResponder";
  wrongWindow.host.window = view();
  equal(visibility.isBusy([wrongWindow.button]), false, `broken window chain does not preserve stale ${state}`);
  const actualWindow = fixture();
  actualWindow.window.window = null;
  actualWindow.button.tracking = state === "tracking";
  actualWindow.button.isFirstResponder = () => state === "firstResponder";
  equal(visibility.isBusy([actualWindow.button]), true, `real UIWindow nil property preserves active ${state}`);
}
const trackingFailure = fixture().button;
Object.defineProperty(trackingFailure, "tracking", { get() { throw new Error("gone"); } });
equal(visibility.isBusy([trackingFailure]), true, "tracking state failure defers visual removal");
const ancestorFailure = fixture();
Object.defineProperty(ancestorFailure.host, "hidden", { get() { throw new Error("gone"); } });
equal(visibility.isBusy([ancestorFailure.button]), true, "ancestor state failure defers visual removal");
const staleResponderFailure = fixture().button;
staleResponderFailure.hidden = true;
staleResponderFailure.isFirstResponder = () => { throw new Error("stale hidden responder"); };
equal(visibility.isBusy([staleResponderFailure]), false, "hidden controls are ignored before reading stale focus state");
for (const invalid of [undefined, null, false, {}, "views"]) equal(visibility.isBusy(invalid), false, "invalid view collection has no positive busy state");
assert.deepEqual(Object.keys(context), ["__MN_NATIVE_MENU_VISIBILITY_MNCommentManagerAddon"], "only prefixed export is introduced");
assertions += 1;
console.log(JSON.stringify({ suite: "native-menu-visibility", assertions, status: "passed", module: modulePath }));
