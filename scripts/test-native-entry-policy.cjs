#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modulePath = path.resolve(process.argv[2] || path.join(__dirname, "../src/NativeEntryPolicy.js"));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });
const policy = context.__MN_NATIVE_ENTRY_POLICY_MNCommentManagerAddon;
assert.equal(typeof policy.filter, "function");
const result = (ids, settings, coverage) => Array.from(policy.filter(ids, settings, coverage));
const ids = ["management", "menu", "add", "move"];
const actions = ["manager", "quickInput", "menu", "none"];
const defaults = {
  managementTapAction: "manager", managementHoldAction: "menu",
  addTapAction: "quickInput", addHoldAction: "menu",
};
let assertions = 1;
let matrixCases = 0;

function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions += 1;
}

function normalized(settings) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
    [key, actions.includes(settings[key]) ? settings[key] : fallback]));
}

function dynamicActions(id, settings) {
  if (id === "management") return [settings.managementTapAction, settings.managementHoldAction];
  if (id === "add") return [settings.addTapAction, settings.addHoldAction];
  if (id === "menu") return ["menu"];
  if (id === "move") return ["quick"];
  return [];
}

function oracle(input, settings, coverage) {
  if (settings.autoHideNativeDuplicates === false) return input.slice();
  const normalizedSettings = normalized(settings);
  const managementCustom = ["managementTapAction", "managementHoldAction"].some((key) => normalizedSettings[key] !== defaults[key]);
  const addCustom = ["addTapAction", "addHoldAction"].some((key) => normalizedSettings[key] !== defaults[key]);
  const firstPass = input.filter((id) => {
    if (id === "management") return managementCustom || !(coverage.manager && coverage.menu);
    if (id === "menu") return !coverage.menu;
    if (id === "move") return !coverage.quick;
    return true;
  });
  const otherMenu = coverage.menu || firstPass.some((id) =>
    id !== "add" && dynamicActions(id, normalizedSettings).includes("menu"));
  return firstPass.filter((id) => id !== "add" || addCustom || !coverage.quickInput || !otherMenu);
}

equal(result(ids, {}, {}), ids, "unknown native capability keeps all eligible controls");
equal(result(ids, {}, { quick: true, manager: true, menu: true }), ["add"], "native manager only");
equal(result(ids, {}, { quickInput: true }), ["management", "menu", "move"], "native add only");
equal(result(ids, {}, { quick: true, manager: true, menu: true, quickInput: true }), [], "both complete native entries");
equal(result(["add"], {}, { quickInput: true }), ["add"], "default add is the only menu entry");
equal(result(["management", "add"], {}, { quickInput: true }), ["management"], "retained management preserves menu");
equal(result(["management", "add"], { managementHoldAction: "none" }, { quickInput: true }), ["management", "add"], "custom management without menu does not replace add hold");
equal(result(["management", "add"], { managementTapAction: "menu", managementHoldAction: "none" }, { quickInput: true }), ["management"], "custom menu tap can preserve add hold");
equal(result(["management", "add"], {}, { manager: true, quickInput: true }), ["management"], "manager alone cannot replace dynamic management hold");
equal(result(["management", "add"], {}, { manager: true, menu: true, quickInput: true }), [], "native menu independently replaces both default holds");
equal(result(["management", "add"], { managementTapAction: "none", addHoldAction: "none" }, { manager: true, menu: true, quickInput: true }), ["management", "add"], "none is custom rather than permission to hide");
equal(result(["move"], {}, { manager: true, menu: true }), ["move"], "full manager does not imply quick panel");
equal(result(["management", "menu"], {}, { quick: true }), ["management", "menu"], "quick panel does not imply manager or menu");

// All eligibility switches are represented by the incoming list. Never restore an absent ID.
for (let visibleMask = 0; visibleMask < 16; visibleMask += 1) {
  const input = ids.filter((_, index) => visibleMask & (1 << index));
  for (let capabilityMask = 0; capabilityMask < 16; capabilityMask += 1) {
    const coverage = Object.fromEntries(["quick", "manager", "menu", "quickInput"].map((key, index) => [key, !!(capabilityMask & (1 << index))]));
    for (const managementTapAction of actions) for (const managementHoldAction of actions)
      for (const addTapAction of actions) for (const addHoldAction of actions) {
        const settings = { managementTapAction, managementHoldAction, addTapAction, addHoldAction };
        const actual = result(input, settings, coverage);
        const label = JSON.stringify({ input, settings, coverage });
        equal(actual, oracle(input, settings, coverage), label);
        const preservedActions = new Set(actual.flatMap((id) => dynamicActions(id, settings)));
        for (const [key, enabled] of Object.entries(coverage)) if (enabled) preservedActions.add(key);
        for (const id of input.filter((item) => !actual.includes(item))) {
          for (const name of dynamicActions(id, settings)) {
            assert.ok(name === "none" || preservedActions.has(name), `lost ${name}: ${label}`);
            assertions += 1;
          }
        }
        if (managementTapAction !== "manager" || managementHoldAction !== "menu") {
          assert.equal(actual.includes("management"), input.includes("management"), label);
          assertions += 1;
        }
        if (addTapAction !== "quickInput" || addHoldAction !== "menu") {
          assert.equal(actual.includes("add"), input.includes("add"), label);
          assertions += 1;
        }
        equal(result(input, { ...settings, autoHideNativeDuplicates: false }, coverage), input, `disabled: ${label}`);
        matrixCases += 1;
      }
  }
}

// Filtering preserves every permutation and repeated/unknown ID without rewriting input.
function permutations(items) {
  return items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((tail) => [item, ...tail])) : [[]];
}
for (const input of permutations(ids)) {
  equal(result(input, {}, { quick: true, quickInput: true }), input.filter((id) => id === "management" || id === "menu"), "configured ordering remains stable");
}
equal(result(["future", "add", "future", "menu", "management", "move"], {}, { quick: true, quickInput: true }), ["future", "future", "menu", "management"], "unknown IDs and duplicates survive in place");
equal(result(["future", "add"], {}, { quickInput: true }), ["future", "add"], "unknown ID never counts as a replacement");

for (const invalid of [undefined, null, false, true, 0, "all", [], [true]]) {
  equal(result(ids, {}, invalid), ids, "invalid coverage is not trusted");
}
for (const key of ["quick", "manager", "menu", "quickInput"]) {
  for (const invalid of [undefined, null, false, 0, 1, "true", [], {}]) {
    equal(result(ids, {}, { [key]: invalid }), ids, `non-boolean ${key} does not hide controls`);
  }
}
for (const settings of [undefined, null, false, 1, "default", {}, { managementTapAction: "invalid", addHoldAction: "" }]) {
  equal(result(ids, settings, { quick: true, manager: true, menu: true, quickInput: true }), [], "invalid/missing action settings use validated defaults");
}
for (const invalid of [undefined, null, false, 1, "management", {}]) {
  equal(result(invalid, {}, {}), [], "invalid eligibility input cannot create controls");
}
const frozenIds = Object.freeze(["move", "add", "menu", "management"]);
const frozenSettings = Object.freeze({ ...defaults });
const frozenCoverage = Object.freeze({ quick: true, manager: true, menu: true, quickInput: true });
equal(result(frozenIds, frozenSettings, frozenCoverage), [], "frozen input remains untouched");
const retainedCopy = policy.filter(frozenIds, { autoHideNativeDuplicates: false }, frozenCoverage);
assert.notEqual(retainedCopy, frozenIds, "disabled filtering still returns an independent list");
assertions += 1;
equal(Object.keys(context), ["__MN_NATIVE_ENTRY_POLICY_MNCommentManagerAddon"], "module only exports the prefixed policy");

console.log(JSON.stringify({ suite: "native-entry-policy", matrixCases, assertions, status: "passed", module: modulePath }));
