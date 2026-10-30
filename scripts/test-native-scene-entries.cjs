#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modulePath = path.resolve(process.argv[2] || path.join(__dirname, "../src/NativeSceneEntries.js"));
const nativeManager = "addon.marginnote.extension.mncommentmanager.nativeCommentManager:";
const nativeAdd = "addon.marginnote.extension.mncommentmanager.nativeAddComment:";
const addonID = "marginnote.extension.mncommentmanager";
let assertions = 0;

function equal(actual, expected, label) {
  assert.deepEqual(actual === null ? null : JSON.parse(JSON.stringify(actual)), expected, label);
  assertions += 1;
}

function fixture() {
  const state = {
    mac: true, immersive: true, active: { templateId: "u-scene_01", allowed: true },
    app: { documentPath: "/test document/root/" }, paths: [], parses: 0, files: {},
    parseOverride: undefined,
  };
  const template = { schema: 3, id: state.active.templateId, plugins: [addonID], selectionMenu: { cards: [nativeManager, nativeAdd] } };
  state.files["/test document/root/ImmersiveTemplates/u-scene_01.json"] = JSON.stringify(template);
  const context = vm.createContext({
    MNUtil: {
      isMacOS: () => state.mac,
      get immersiveMode() { return state.immersive; },
      get immersiveTemplateForAddon() { return state.active; },
    },
    Application: { sharedInstance: () => state.app },
    NSData: { dataWithContentsOfFile(filePath) {
      state.paths.push(filePath);
      if (state.readError) throw new Error("permission denied");
      if (!Object.prototype.hasOwnProperty.call(state.files, filePath)) return null;
      const text = state.files[filePath];
      return { text, length: () => text.length };
    } },
    NSJSONSerialization: { JSONObjectWithDataOptions(data, options) {
      assert.equal(options, 0, "native parser options remain the verified default");
      state.parses += 1;
      if (state.parseError) throw new Error("invalid JSON");
      return state.parseOverride === undefined ? JSON.parse(data.text) : state.parseOverride;
    } },
  });
  vm.runInContext(fs.readFileSync(modulePath, "utf8"), context, { filename: modulePath });
  return {
    state, context, template,
    read: () => context.__MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon.read(),
    status: () => context.__MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon.status(),
    save(value = template) { state.files["/test document/root/ImmersiveTemplates/u-scene_01.json"] = JSON.stringify(value); },
  };
}

const valid = fixture();
equal(valid.status(), { phase: "idle" }, "diagnostics are empty before the first read");
equal(valid.read(), { scene: "u-scene_01", commands: [nativeManager, nativeAdd] }, "explicit current scene commands are returned");
equal(valid.status().phase, "ready", "successful read reports ready");
equal(valid.status().cardsArray, true, "successful diagnostics confirm only the card-list type");
const detachedStatus = valid.status();
detachedStatus.phase = "corrupted";
equal(valid.status().phase, "ready", "diagnostic snapshot cannot mutate stored status");
equal(valid.state.paths, ["/test document/root/ImmersiveTemplates/u-scene_01.json"], "only exact validated template file is read");
equal(valid.state.parses, 1, "native JSON parser is used");
const firstRead = valid.read();
firstRead.commands.pop();
equal(valid.read(), { scene: "u-scene_01", commands: [nativeManager, nativeAdd] }, "returned commands cannot mutate future results");
valid.template.selectionMenu.cards = [nativeAdd];
valid.save();
equal(valid.read(), { scene: "u-scene_01", commands: [nativeAdd] }, "editing the same template is observed without caching");
valid.state.active = { templateId: "next-scene", allowed: true };
valid.state.files["/test document/root/ImmersiveTemplates/next-scene.json"] = JSON.stringify({ schema: 3, id: "next-scene", plugins: [addonID], selectionMenu: { cards: [] } });
equal(valid.read(), { scene: "next-scene", commands: [] }, "template switch is read even while immersive mode remains true");
equal(valid.state.paths.at(-1), "/test document/root/ImmersiveTemplates/next-scene.json", "switch uses only next scene path");
valid.state.immersive = false;
equal(valid.read(), null, "same getter outside immersive mode is not the active scene");
valid.state.immersive = true;
valid.state.active.allowed = false;
equal(valid.read(), { scene: "next-scene", commands: [] }, "timer callback getter identity loss uses explicit file permission");
equal(valid.status().templateAllowed, false, "getter permission is retained as a diagnostic");
equal(valid.status().fileAllowed, true, "file permission establishes current scene participation");
valid.state.files["/test document/root/ImmersiveTemplates/next-scene.json"] = JSON.stringify({ schema: 3, id: "next-scene", plugins: [], selectionMenu: { cards: [] } });
equal(valid.read(), null, "same-scene plugin removal is observed immediately without caching");
equal(valid.status().fileAllowed, false, "removed addon is reported disallowed by file");

for (const [field, values] of [["mac", [false, undefined, null, 0, 1, "true"]], ["immersive", [false, undefined, null, 0, 1, "true"]]]) {
  for (const value of values) {
    const f = fixture();
    f.state[field] = value;
    equal(f.read(), null, `${field} must be positively true`);
    equal(f.state.paths, [], `${field} rejection reads no files`);
  }
}
for (const active of [undefined, null, false, "scene", [], {}, { templateId: "u-scene_01" },
  { templateId: "u-scene_01", allowed: 1 }, { templateId: "u-scene_01", allowed: "true" }]) {
  const f = fixture();
  f.state.active = active;
  equal(f.read(), null, "missing/invalid addon scene state is rejected");
  equal(f.state.paths, [], "invalid getter never reads a template");
}
for (const templateId of [undefined, null, false, 3, "", ".", "..", "../escape", "a/b", "a\\b", "a.json", " spaced ", "a\0b", "场景", "a".repeat(129)]) {
  const f = fixture();
  f.state.active.templateId = templateId;
  equal(f.read(), null, `invalid template id ${String(templateId)} rejected`);
  equal(f.state.paths, [], "invalid id cannot reach filesystem");
}
const maxId = fixture();
const boundaryId = "A".repeat(128);
maxId.state.active.templateId = boundaryId;
maxId.state.files[`/test document/root/ImmersiveTemplates/${boundaryId}.json`] = JSON.stringify({ schema: 3, id: boundaryId, plugins: [addonID], selectionMenu: { cards: [] } });
equal(maxId.read(), { scene: boundaryId, commands: [] }, "128-character safe id is allowed");

for (const documentPath of [undefined, null, 1, "", "relative/path", "/", "/root\0other"]) {
  const f = fixture();
  f.state.app.documentPath = documentPath;
  equal(f.read(), null, "invalid document root is rejected");
  equal(f.state.paths, [], "invalid document root cannot read another path");
}
const absentApp = fixture();
absentApp.state.app = null;
equal(absentApp.read(), null, "missing Application instance is rejected");
const noFile = fixture();
noFile.state.files = {};
equal(noFile.read(), null, "missing scene file is unknown coverage");
const denied = fixture();
denied.state.readError = true;
equal(denied.read(), null, "read permission failure is unknown coverage");
for (const raw of ["", "{", "not JSON", "null", "[]", "3", '"template"']) {
  const f = fixture();
  f.state.files["/test document/root/ImmersiveTemplates/u-scene_01.json"] = raw;
  equal(f.read(), null, "empty, malformed and non-object JSON is rejected");
}
const parseFailure = fixture();
parseFailure.state.parseError = true;
equal(parseFailure.read(), null, "native JSON parser exception preserves dynamic entry points");
for (const schema of [undefined, null, "3", 0, 1, 2, 4, false]) {
  const f = fixture();
  f.template.schema = schema;
  f.save();
  equal(f.read(), null, "only exact schema 3 is supported");
}
for (const id of [undefined, null, false, 1, "other-scene", "U-scene_01"]) {
  const f = fixture();
  f.template.id = id;
  f.save();
  equal(f.read(), null, "file id must exactly match getter template id");
}
for (const plugins of [undefined, null, false, "marginnote.extension.mncommentmanager", {}, { length: 1, 0: addonID },
  [], ["other.addon"], [addonID, addonID], [""], [null], [false], [3], [{}], [[]], ["a".repeat(257), addonID], [addonID, { addon: "other" }],
  Array.from({ length: 129 }, (_, index) => index === 0 ? addonID : `other-${index}`)]) {
  const f = fixture();
  f.template.plugins = plugins;
  f.save();
  equal(f.read(), null, "getter true never substitutes for an explicit valid plugin allowlist");
  equal(f.status().fileAllowed, false, "invalid or missing file permission remains false");
}
const fullAllowlist = fixture();
fullAllowlist.template.plugins = Array.from({ length: 128 }, (_, index) => index === 0 ? addonID : `other-${index}`);
fullAllowlist.save();
equal(fullAllowlist.read(), { scene: "u-scene_01", commands: [nativeManager, nativeAdd] }, "128 unique plugin IDs are supported");
const pluginEntryBoundary = fixture();
pluginEntryBoundary.template.plugins = [addonID, "a".repeat(256)];
pluginEntryBoundary.save();
equal(pluginEntryBoundary.read(), { scene: "u-scene_01", commands: [nativeManager, nativeAdd] }, "256-character unrelated plugin ID is supported");
const sparsePlugins = fixture();
sparsePlugins.state.parseOverride = { schema: 3, id: "u-scene_01", plugins: [addonID, , "other"], selectionMenu: { cards: [nativeAdd] } };
equal(sparsePlugins.read(), null, "sparse plugin list is invalid");
const inheritedPlugins = fixture();
inheritedPlugins.state.parseOverride = Object.assign(Object.create({ plugins: [addonID] }), { schema: 3, id: "u-scene_01", selectionMenu: { cards: [nativeAdd] } });
equal(inheritedPlugins.read(), null, "prototype inherited plugin allowlist is not explicit participation");
for (const selectionMenu of [undefined, null, false, [], "cards", {}, { inherits: "base" }]) {
  const f = fixture();
  f.template.selectionMenu = selectionMenu;
  f.save();
  equal(f.read(), null, "missing explicit card list is not inherited or inferred");
}
for (const cards of [undefined, null, false, "nativeAddComment", {}, { length: 1, 0: nativeAdd },
  [nativeAdd, nativeAdd], [""], [null], [false], [3], [{}], [[]], ["a".repeat(257)], [nativeManager, null, nativeAdd]]) {
  const f = fixture();
  f.template.selectionMenu.cards = cards;
  f.save();
  equal(f.read(), null, "every card-list entry must be a unique bounded nonempty string");
}
const sparse = fixture();
sparse.state.parseOverride = { schema: 3, id: "u-scene_01", plugins: [addonID], selectionMenu: { cards: new Array(2) } };
equal(sparse.read(), null, "sparse arrays cannot omit invalid items");
const inherited = fixture();
inherited.state.parseOverride = { schema: 3, id: "u-scene_01", plugins: [addonID], selectionMenu: Object.create({ cards: [nativeAdd] }) };
equal(inherited.read(), null, "prototype inherited card list is not treated as explicit configuration");
for (const cards of [[], ["a".repeat(256)], Array.from({ length: 128 }, (_, index) => `native-${index}`), [nativeAdd, "otherAddon.command:", nativeManager]]) {
  const f = fixture();
  f.template.selectionMenu.cards = cards;
  f.save();
  equal(f.read(), { scene: "u-scene_01", commands: cards }, "valid boundaries and original command order are preserved");
}
const overLimit = fixture();
overLimit.template.selectionMenu.cards = Array.from({ length: 129 }, (_, index) => `native-${index}`);
overLimit.save();
equal(overLimit.read(), null, "129 entries are unsupported");
const unneeded = fixture();
Object.defineProperty(unneeded.state.active, "config", { get() { throw new Error("config must not be read"); } });
Object.defineProperty(unneeded.state.active, "templateName", { get() { throw new Error("templateName must not be read"); } });
equal(unneeded.read(), { scene: "u-scene_01", commands: [nativeManager, nativeAdd] }, "addon config and display name are unrelated to menu coverage");
for (const [globalName, value] of [["MNUtil", undefined], ["MNUtil", {}], ["Application", undefined], ["Application", {}], ["NSData", undefined], ["NSData", {}], ["NSJSONSerialization", undefined], ["NSJSONSerialization", {}]]) {
  const f = fixture();
  f.context[globalName] = value;
  equal(f.read(), null, `missing ${globalName} capability is safe`);
}
for (const target of ["isMacOS", "immersiveMode", "immersiveTemplateForAddon"]) {
  const f = fixture();
  Object.defineProperty(f.context.MNUtil, target, { configurable: true, get() { throw new Error("host capability unavailable"); } });
  equal(f.read(), null, `${target} getter exception is safe`);
}
const diagnostics = [
  ["non-Mac", (f) => { f.state.mac = false; }, { phase: "host", mac: false, immersive: true }],
  ["inactive scene", (f) => { f.state.immersive = false; }, { phase: "host", mac: true, immersive: false }],
  ["file disallowed", (f) => { f.template.plugins = []; f.save(); }, { phase: "plugins", templateAllowed: true, fileAllowed: false }],
  ["invalid getter permission", (f) => { f.state.active.allowed = "true"; }, { phase: "template", templateAllowed: false, templateAllowedBoolean: false, idType: "string", idValid: true }],
  ["invalid id type", (f) => { f.state.active.templateId = 12; }, { phase: "template", templateAllowed: true, idType: "number", idValid: false }],
  ["unavailable data", (f) => { f.state.files = {}; }, { phase: "data", dataFound: false }],
  ["empty data", (f) => { f.state.files["/test document/root/ImmersiveTemplates/u-scene_01.json"] = ""; }, { phase: "data", dataFound: true, dataEmpty: true }],
  ["schema mismatch", (f) => { f.template.schema = "3"; f.save(); }, { phase: "json", schemaType: "string", schemaSupported: false, idMatches: true }],
  ["id mismatch", (f) => { f.template.id = "other"; f.save(); }, { phase: "json", schemaType: "number", schemaSupported: true, idMatches: false }],
  ["no cards", (f) => { delete f.template.selectionMenu.cards; f.save(); }, { phase: "json", selectionMenuRecord: true, hasOwnCards: false }],
  ["cards not array", (f) => { f.template.selectionMenu.cards = {}; f.save(); }, { phase: "cards", cardsArray: false, cardsWithinLimit: false }],
  ["invalid item", (f) => { f.template.selectionMenu.cards = [null]; f.save(); }, { phase: "cards", cardsArray: true, entriesValid: false }],
  ["native exception", (f) => { f.state.readError = true; }, { phase: "exception", failedPhase: "data", exception: "Error" }],
];
for (const [label, modify, expected] of diagnostics) {
  const f = fixture();
  f.read();
  modify(f);
  equal(f.read(), null, `${label} remains unknown coverage`);
  const status = f.status();
  for (const [key, value] of Object.entries(expected)) equal(status[key], value, `${label} reports ${key}`);
  assert.ok(!Object.prototype.hasOwnProperty.call(status, "commands") && !JSON.stringify(status).includes("/test document/root") && !JSON.stringify(status).includes(nativeManager), `${label} diagnostics omit template contents and paths`);
  assertions += 1;
  if (status.phase !== "ready") equal(status.entriesValid === true, false, `${label} clears previous successful state`);
}
const immutable = fixture();
const parsed = { schema: 3, id: "u-scene_01", plugins: Object.freeze([addonID]), selectionMenu: Object.freeze({ cards: Object.freeze([nativeAdd]) }) };
immutable.state.parseOverride = Object.freeze(parsed);
equal(immutable.read(), { scene: "u-scene_01", commands: [nativeAdd] }, "native template is read without mutation");
assert.deepEqual(Object.keys(valid.context).sort(), ["Application", "MNUtil", "NSData", "NSJSONSerialization", "__MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon"].sort());
assertions += 1;
console.log(JSON.stringify({ suite: "native-scene-entries", assertions, status: "passed", module: modulePath }));
