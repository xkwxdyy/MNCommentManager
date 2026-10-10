const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const notes = {};
const writes = [];
let undoDepth = 0;
let undoGroups = 0;
function makeNote(id, types = ["TextNote", "HtmlNote", "PaintNote", "AudioNote", "SketchNote"], sharedRows) {
  const rows = sharedRows || types.map((type, index) => ({ type, text: `body-${index}`, collapsed: false, ownerNoteId: id, commentId: null }));
  let version = 1;
  let projection = JSON.stringify(rows);
  function syncRevision() {
    const current = JSON.stringify(rows);
    if (current !== projection) { version += 1; projection = current; }
  }
  let reads = 0;
  let mode = "";
  const raw = {
    get comments() { return rows; },
    commentState() {
      syncRevision();
      reads += 1;
      if (mode === "read-error") return { ok: false, error: { code: "READ_ONLY", message: "read unavailable" } };
      return { ok: true, noteid: id, revision: `${id}-${version}`, comments: rows.map((row, index) => ({ ...row, index: index + 1 })) };
    },
    setCommentsCollapsed(targets, collapsed, revision) {
      syncRevision();
      assert.strictEqual(this, raw, "native methods must retain their receiver");
      assert.strictEqual(undoDepth, 0, "the host transaction must run outside plugin Undo groups");
      assert.strictEqual(revision, `${id}-${version}`);
      writes.push({ noteId: id, targets, collapsed, revision });
      if (mode === "save-error") return { ok: false, error: { code: "SAVE_FAILED", message: "independent save failed", details: { rollbackRestored: true } } };
      if (mode === "race") return { ok: false, error: { code: "COMMENT_CHANGED", message: "projection changed" } };
      let changedCount = 0;
      targets.forEach(({ index }) => {
        const row = rows[index - 1];
        if (row.collapsed === collapsed) return;
        row.collapsed = collapsed;
        row.commentId = row.commentId || `comment-${index}`;
        changedCount += 1;
      });
      if (changedCount) version += 1;
      projection = JSON.stringify(rows);
      return { ...raw.commentState(), persisted: mode !== "unpersisted", changedCount };
    },
  };
  const note = {
    noteId: id, noteTitle: id, note: raw,
    get comments() { return raw.comments; },
    parentNote: { noteId: "parent" },
    refresh() { throw new Error("folding must use the host refresh"); },
    setMode(value) { mode = value; },
    bump() { version += 1; },
    get reads() { return reads; },
  };
  notes[id] = note;
  return note;
}
const A = makeNote("A");
const B = makeNote("B", ["TextNote"]);
const context = vm.createContext({
  console: { log() {} },
  MNNote: { new: (id) => notes[id], getFocusNote: () => A },
  MNUtil: { getMediaByHash() { return null; }, confirm: async () => true, showHUD() {} },
  __MN_UNDO_GROUPING_MNCommentManagerAddon: {
    run(_label, _metadata, block) {
      undoGroups += 1;
      undoDepth += 1;
      try { return block(); } finally { undoDepth -= 1; }
    },
  },
  __MN_COMMENT_WORKFLOW_STORE__: { get() { return null; } },
});
[
  "CommentFoldState", "CommentData", "CommentMutations", "CommentBatchEditor",
  "CommentWorkflowRegistry", "CommentWorkflowRunner", "WebBridgeCommands",
].forEach((name) => vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", `${name}.js`), "utf8"), context, { filename: `${name}.js` }));
const data = context.__MN_COMMENT_DATA__;
const folding = context.__MN_COMMENT_FOLD_STATE_MNCommentManagerAddon;
const editor = context.__MN_COMMENT_BATCH_EDITOR__;
const commands = context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
const json = (value) => JSON.parse(JSON.stringify(value));

const snapshot = data.getNoteSnapshot(A);
assert.strictEqual(snapshot.commentFold.supported, true);
assert.strictEqual(snapshot.commentFold.revision, "A-1");
assert.deepStrictEqual(json(snapshot.comments.map((comment) => comment.index)), [0, 1, 2, 3, 4]);
assert.ok(snapshot.comments.every((comment) => comment.collapsed === false && comment.capabilities.canSetCollapsed));
assert.ok(!snapshot.excerpt.capabilities.canSetCollapsed, "native excerpts must be excluded");
assert.strictEqual(A.comments[0].commentId, null, "a state read must not create historical IDs");

const result = commands.setCommentsCollapsed({}, { noteId: "A", indices: [0, 2, 4], collapsed: true, expectedRevision: "A-1" });
assert.deepStrictEqual(json(writes[0].targets), [{ index: 1 }, { index: 3 }, { index: 5 }]);
assert.strictEqual(result.persisted, true);
assert.strictEqual(result.changedCount, 3);
assert.strictEqual(result.snapshot.commentFold.revision, "A-2");
assert.deepStrictEqual(json(result.snapshot.comments.map((comment) => comment.collapsed)), [true, false, true, false, true]);
assert.strictEqual(A.comments[1].commentId, null);
const noop = commands.setCommentsCollapsed({}, { noteId: "A", indices: [0], collapsed: true, expectedRevision: "A-2" });
assert.strictEqual(noop.changed, false);
assert.strictEqual(noop.snapshot.commentFold.revision, "A-2");
assert.strictEqual(undoGroups, 0);

const writeCount = writes.length;
assert.throws(() => folding.setCollapsed(A, [0], false, "old-version"), (error) => error.code === "COMMENT_CHANGED");
for (const indices of [[-1], [0.5], [true], ["0"], [0, 0], [5], [], Array.from({ length: 201 }, (_, index) => index)]) {
  assert.throws(() => folding.setCollapsed(A, indices, false, "A-2"), (error) => error.code === "INVALID_INPUT");
}
assert.throws(() => folding.setCollapsed(A, [0], "true", "A-2"), (error) => error.code === "INVALID_INPUT");
assert.throws(() => folding.setCollapsed(A, [0], false), (error) => error.code === "INVALID_INPUT");
assert.strictEqual(writes.length, writeCount, "invalid or stale requests must not reach the host setter");

for (const [mode, code] of [["save-error", "SAVE_FAILED"], ["race", "COMMENT_CHANGED"], ["unpersisted", "COMMENT_NOT_PERSISTED"]]) {
  B.setMode(mode);
  const beforeReads = B.reads;
  assert.throws(() => folding.setCollapsed(B, [0], true, "B-1"), (error) => error.code === code);
  assert.ok(B.reads >= beforeReads + 2, "failed writes must re-read host state without retrying");
}
B.setMode("");

const old = { noteId: "old", comments: [{ type: "TextNote", text: "old host" }] };
notes.old = old;
assert.strictEqual(data.getNoteSnapshot(old).commentFold.supported, false);
assert.strictEqual(data.getNoteSnapshot(old).comments[0].collapsed, undefined);
assert.throws(() => folding.setCollapsed(old, [0], true, "r"), (error) => error.code === "COMMENT_STATE_UNSUPPORTED");
const malformed = { noteId: "malformed", comments: [], commentState: () => ({ ok: true, revision: "r", comments: [{ index: 0, collapsed: false }] }), setCommentsCollapsed() {} };
assert.strictEqual(folding.read(malformed).supported, false);
const mismatched = { ...malformed, commentState: () => ({ ok: true, revision: "r", comments: [{ index: 1, collapsed: false }] }) };
assert.strictEqual(data.getNoteSnapshot(mismatched).commentFold.supported, false);
A.setMode("read-error");
assert.strictEqual(folding.read(A).code, "READ_ONLY");
A.setMode("");

// A reference invokes its own host object and projection revision, which routes writes to the actual owner.
const reference = makeNote("reference", [], [A.comments[0], { type: "TextNote", text: "local link", ownerNoteId: "reference", commentId: null, collapsed: false }]);
folding.setCollapsed(reference, [0, 1], false, "reference-1");
assert.strictEqual(writes.at(-1).noteId, "reference");
assert.strictEqual(A.comments[0].collapsed, false);
const batch = editor.setSelectedCollapsed([A, reference], {}, true);
assert.strictEqual(batch.failed, 0);
assert.strictEqual(batch.changed, 2);
assert.strictEqual(writes.at(-1).revision, "reference-3", "shared-owner changes must be included in the fresh reference projection revision");
assert.strictEqual(undoGroups, 0);

(async () => {
  const runner = context.__MN_COMMENT_WORKFLOW_RUNNER__;
  const registry = context.__MN_COMMENT_WORKFLOW_REGISTRY__;
  let cleanupCalls = 0;
  registry.registerAction({ id: "test.cleanup", title: "普通步骤", scope: "both", dangerous: true, run() { assert.strictEqual(undoDepth, 1); cleanupCalls += 1; return { failed: 0 }; } }, "test");
  const addon = { batchCommentContext: { token: "batch", notes: [A, reference] } };
  const workflow = {
    name: "折叠再展开", scope: "batch", steps: [
      { kind: "select", selector: { position: { mode: "single", index: 0 }, includeExcerpt: true } },
      { actionId: "unfoldSelectedComments" }, { actionId: "foldSelectedComments" },
    ],
  };
  const executed = await runner.run(addon, workflow, { token: "batch" });
  assert.strictEqual(executed.completed, true);
  assert.strictEqual(undoGroups, 0, "fold-only workflows must not open a plugin Undo group");
  assert.ok(registry.getCatalog("single").some((action) => action.id === "foldSelectedComments" && action.input === "selection"));
  assert.ok(registry.getCatalog("batch").some((action) => action.id === "unfoldSelectedComments"));

  const singleAddon = { dynamicCommentContext: { token: "single", noteId: "A", note: A } };
  const mixed = await runner.run(singleAddon, {
    name: "混合步骤", scope: "single", steps: [{ actionId: "test.cleanup" }, { actionId: "unfoldSelectedComments" }, { actionId: "test.cleanup" }],
  }, { mode: "single", token: "single", noteId: "A" });
  assert.strictEqual(mixed.completed, true);
  assert.strictEqual(undoGroups, 2, "non-host steps on either side keep separate Undo groups");
  assert.strictEqual(cleanupCalls, 2);

  A.setMode("save-error");
  const failed = await runner.run(addon, {
    name: "失败后停止", scope: "batch", steps: [{ actionId: "foldSelectedComments" }, { actionId: "test.cleanup" }],
  }, { token: "batch" });
  assert.strictEqual(failed.completed, false);
  assert.strictEqual(failed.failedStep.actionId, "foldSelectedComments");
  assert.strictEqual(failed.failedStep.result.failed, 1);
  assert.strictEqual(cleanupCalls, 2, "a failed host transaction stops subsequent workflow steps");
  assert.strictEqual(undoGroups, 2);
  console.log("comment fold adapter, bridge, batch and workflow tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
