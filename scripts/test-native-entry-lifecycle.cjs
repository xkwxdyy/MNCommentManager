// A controlled lifecycle using the real settings, scene reader, coverage and policy.
// Host template import normalization and rendered UI remain separate Mac checks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = path.resolve(process.argv[2] || path.join(__dirname, "../src"));
process.env.MNCM_COVERAGE_FIXTURE_ONLY = "1";
const { fixture } = require("./test-native-card-menu-coverage.cjs");
const addonID = "marginnote.extension.mncommentmanager";
const prefix = "addon." + addonID + ".";
const commands = [prefix + "nativeCommentManager:", prefix + "nativeAddComment:"];
const ids = ["management", "menu", "add", "move"];
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function equal(actual, expected, label) { assert.deepEqual(plain(actual), expected, label); checks++; }
function fixtureWithStorage(store = new Map(), files = new Map()) {
  const f = fixture(), calls = [], writes = [];
  f.context.NSUserDefaults = { standardUserDefaults: () => ({
    objectForKey: key => store.get(key),
    setBoolForKey(value, key) { writes.push(key); store.set(key, value); },
    setObjectForKey(value, key) { writes.push(key); store.set(key, value); },
  }) };
  f.context.NSData = { dataWithContentsOfFile: key => files.has(key) ? { text: files.get(key) } : null };
  f.context.NSJSONSerialization.JSONObjectWithDataOptions = data => JSON.parse(data.text);
  f.context.MNUtil.showHUD = message => calls.push(["hud", message]);
  f.context.__MN_COMMENT_DATA__ = {
    getWrappedNoteById: id => f.notes[id],
    getNoteSnapshot: note => ({ comments: note.noteId === "A" ? [{}] : [], excerpt: { present: false } }),
  };
  Object.assign(f.context.__MN_DYNAMIC_COMMENT_ACTIONS__, {
    hideButton() {}, openExplicitAction(addon, context) { calls.push(["full", context.noteId]); return true; },
  });
  f.context.__MN_BATCH_COMMENT_ACTIONS__ = { hideButton() {} };
  f.context.__MN_COMMENT_MOVE_MNCommentManagerAddon = { open(addon, context) { calls.push(["quick", context.noteId]); return true; } };
  f.context.__MN_QUICK_COMMENT_MNCommentManagerAddon = {
    getState: input => input,
    open(addon, context) {
      if (!addon.quickCommentController) { addon.quickCommentController = { noteId: context.noteId, draft: "" }; calls.push(["input", context.noteId]); }
    },
  };
  for (const name of ["CommentActionSettings", "NativeEntryPolicy", "NativeSceneEntries"]) {
    vm.runInContext(fs.readFileSync(path.join(runtime, name + ".js"), "utf8"), f.context, { filename: name + ".js" });
  }
  const settings = f.context.__MN_COMMENT_ACTION_SETTINGS__;
  function publish(id, cards, plugins = ["marginnote.extension.mnutils", addonID]) {
    const template = { schema: 3, id, name: "Fresh fixture", selectionMenu: { cards } };
    if (plugins !== undefined) template.plugins = plugins;
    files.set("/fixture/ImmersiveTemplates/" + id + ".json", JSON.stringify(template));
    f.context.MNUtil.immersiveTemplateForAddon = { templateId: id, allowed: true, config: {} };
    return template;
  }
  function display() { return plain(f.context.__MN_NATIVE_ENTRY_POLICY_MNCommentManagerAddon.filter(ids, settings.getSettings(), f.read())); }
  return Object.assign(f, { store, files, settings, publish, display, calls, writes });
}

const f = fixtureWithStorage();
const initial = plain(f.settings.getSettings());
equal(initial.autoHideNativeDuplicates, true, "fresh settings enable conservative deduplication");
equal(initial.dynamicButtonOrder, ["management", "add", "move"], "fresh order is unchanged");
equal([initial.managementTapAction, initial.managementHoldAction, initial.addTapAction, initial.addHoldAction], ["manager", "menu", "quickInput", "menu"], "fresh gesture defaults are unchanged");
equal(f.store.size, 0, "reading settings does not persist new keys");
equal(f.api.query(null).map(item => item.id), ["nativeCommentManager", "nativeAddComment"], "catalog is available before first menu opening");

// A generic newly imported template has no addon permission declaration.
const inherited = f.publish("fresh-generic", ["commentNote"]);
delete inherited.plugins;
f.files.set("/fixture/ImmersiveTemplates/fresh-generic.json", JSON.stringify(inherited));
f.capture([]);
equal(f.display(), ids, "unknown inherited permission cannot hide an existing dynamic entry");
equal(f.writes, [], "first generic scene opening does not change settings");

f.publish("fresh-enabled", ["commentNote"]);
f.capture([]);
equal(f.display(), ids, "explicitly enabled addon with no primary commands keeps all controls");
equal(f.store.size, 0, "a template without commands needs no preference setup");

f.publish("fresh-enabled", ["commentNote", commands[1]]);
f.capture([1]);
equal(f.display(), ["management", "menu", "move"], "adding only input changes only matching default coverage");
f.publish("fresh-enabled", ["commentNote", "noteHighlight:", commands[1]]);
f.capture([1]);
equal(f.display(), ["management", "menu", "move"], "the host quick editor's additional canonical edit-card alias preserves deduplication");
assert.equal(f.api.run(f.addon, "nativeAddComment", "A"), true); checks++;
assert.equal(f.api.run(f.addon, "nativeAddComment", "A"), true); checks++;
equal(f.calls.filter(call => call[0] === "input"), [["input", "A"]], "repeated native add opens one input");
f.addon.quickCommentController.draft = "unsent fixture draft";
const owner = f.addon.quickCommentController;
f.publish("fresh-other", ["commentNote", ...commands]);
assert.equal(f.api.run(f.addon, "nativeAddComment", "A"), false); checks++;
equal(f.addon.quickCommentController === owner && owner.draft, "unsent fixture draft", "scene invalidation does not close the existing draft owner");
f.addon.quickCommentController = null;
f.publish("fresh-enabled", ["commentNote", commands[1]]);
assert.equal(f.api.run(f.addon, "nativeAddComment", "A"), false); checks++;
f.capture([1]);
assert.equal(f.api.run(f.addon, "nativeAddComment", "A"), true); checks++;
f.addon.quickCommentController = null;

f.publish("fresh-both", ["commentNote", ...commands]);
f.capture([0, 1]);
equal(f.display(), ["management", "menu"], "both direct commands replace only proven default actions");
assert.equal(f.api.run(f.addon, "nativeCommentManager", "A"), true); checks++;
equal(f.calls.at(-1), ["quick", "A"], "valid single management dispatch uses the current card");
f.open("B"); f.rebuild([0, 1]); f.tick(.02);
assert.equal(f.api.run(f.addon, "nativeCommentManager", "B"), true); checks++;
equal(f.calls.at(-1), ["full", "B"], "switching to an empty card uses its full-panel fallback");

f.publish("fresh-both", ["commentNote"]);
f.capture([]);
equal(f.display(), ids, "removing primary commands restores enabled dynamic controls");
f.publish("fresh-both", ["commentNote", ...commands], []);
f.addon.mnCommentManagerSceneActive = false;
f.api.dispose(f.addon);
equal(f.read(), { quick: false, manager: false, menu: false, quickInput: false }, "explicit scene suspension invalidates native capability");
equal(f.context.__MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon.read(), null, "empty plugin allowlist cannot establish participation");
f.addon.mnCommentManagerSceneActive = true;
f.publish("fresh-both", ["commentNote", ...commands]);
f.capture();
equal(f.display(), ["management", "menu"], "reenabling requires a fresh opening and restores normal filtering");
equal(f.store.size, 0, "entire default lifecycle has written no entry preferences");

f.settings.updateSettings({ addHoldAction: "none", dynamicButtonOrder: ["move", "add", "management"] });
const saved = plain(f.settings.getSettings());
f.capture();
equal(f.display(), ["management", "menu", "add"], "custom none hold keeps the dynamic add button");
f.api.dispose(f.addon);
const restarted = fixtureWithStorage(f.store, f.files);
equal(restarted.settings.getSettings(), saved, "cold module startup retains existing customized preferences");
equal(restarted.display(), ids, "restart does not reuse previous window/menu coverage");
restarted.publish("fresh-both", ["commentNote", ...commands]);
restarted.capture();
equal(restarted.display(), ["management", "menu", "add"], "fresh post-restart menu respects customization");
equal(restarted.settings.getSettings(), saved, "menu reconstruction cannot rewrite customized settings");
restarted.context.MNUtil.currentNotebookId = "other-notebook";
assert.equal(restarted.api.run(restarted.addon, "nativeCommentManager", "A"), false); checks++;
equal(restarted.settings.getSettings(), saved, "stale target rejection preserves preferences");
console.log(JSON.stringify({ checks, passed: true, runtime, scope: "controlled complete default and customized lifecycle; real host import and UI verified separately" }));
