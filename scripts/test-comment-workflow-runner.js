const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourceDir = path.join(__dirname, "..", "src");
const calls = [];
const undoCalls = [];
const confirmations = [];
const notes = {
  A: { noteId: "A" },
  B: { noteId: "B" },
  A2: { noteId: "A2" },
  B2: { noteId: "B2" },
  A3: { noteId: "A3" },
};
const workflows = new Map();
const context = {
  console: { log() {} },
  __MN_COMMENT_DATA__: {
    getWrappedNoteById(id) { return notes[id] || null; },
  },
  __MN_COMMENT_MUTATIONS__: {
    convertNotesToNoExcerptForNotes(currentNotes) {
      calls.push({ action: "convertToNoExcerpt", noteIds: currentNotes.map((note) => note.noteId) });
      return { total: currentNotes.length, changed: currentNotes.length, failed: 0, convertedNoteMap: { A: "A2", B: "B2", A2: "A3" } };
    },
    removeAllLinkCommentsForNotes(currentNotes) {
      calls.push({ action: "removeAllLinks", noteIds: currentNotes.map((note) => note.noteId) });
      return { total: currentNotes.length, changed: currentNotes.length, failed: 0 };
    },
  },
  __MN_UNDO_GROUPING_MNCommentManagerAddon: {
    run(label, metadata, callback) {
      undoCalls.push({ label, metadata });
      return callback();
    },
  },
  __MN_COMMENT_WORKFLOW_STORE__: {
    get(id) { return workflows.get(id) || null; },
  },
  MNUtil: {
    confirm(title, message) {
      confirmations.push({ title, message });
      return Promise.resolve(true);
    },
    showHUD(message) { calls.push({ action: "hud", message }); },
  },
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(sourceDir, "CommentWorkflowRegistry.js"), "utf8"),
  context,
  { filename: "CommentWorkflowRegistry.js" },
);
vm.runInContext(
  fs.readFileSync(path.join(sourceDir, "CommentWorkflowRunner.js"), "utf8"),
  context,
  { filename: "CommentWorkflowRunner.js" },
);

const runner = context.__MN_COMMENT_WORKFLOW_RUNNER__;
const addon = {
  batchCommentContext: {
    token: "token-1",
    notes: [notes.A, notes.B],
  },
};
const workflow = {
  id: "workflow-clean",
  name: "转换并去链接",
  scope: "batch",
  steps: [
    { actionId: "convertNotesToNoExcerpt", options: {} },
    { actionId: "removeAllLinkComments", options: {} },
  ],
};
workflows.set(workflow.id, workflow);

(async () => {
  const result = await runner.run(addon, workflow.id, { token: "token-1" });
  assert.strictEqual(result.completed, true);
  assert.strictEqual(JSON.stringify(calls.filter((call) => call.action !== "hud")), JSON.stringify([
    { action: "convertToNoExcerpt", noteIds: ["A", "B"] },
    { action: "removeAllLinks", noteIds: ["A2", "B2"] },
  ]));
  assert.strictEqual(undoCalls.length, 1);
  assert.strictEqual(confirmations.length, 1);
  assert.strictEqual(JSON.stringify(addon.batchCommentContext.notes.map((note) => note.noteId)), JSON.stringify(["A2", "B2"]));

  calls.length = 0;
  confirmations.length = 0;
  undoCalls.length = 0;
  context.__MN_COMMENT_WORKFLOW_REGISTRY__.registerAction({
    id: "test.fail",
    title: "失败动作",
    scope: "batch",
    dangerous: false,
    run() {
      calls.push({ action: "fail" });
      return { failed: 1 };
    },
  }, "test.patch");
  context.__MN_COMMENT_WORKFLOW_REGISTRY__.registerAction({
    id: "test.after",
    title: "不应执行",
    scope: "batch",
    dangerous: false,
    run() {
      calls.push({ action: "after" });
      return { failed: 0 };
    },
  }, "test.patch");
  const failedResult = await runner.run(addon, {
    id: "workflow-fail",
    name: "失败即停",
    scope: "batch",
    steps: [{ actionId: "test.fail" }, { actionId: "test.after" }],
  }, { token: "token-1" });
  assert.strictEqual(failedResult.completed, false);
  assert.strictEqual(failedResult.failedStep.actionId, "test.fail");
  assert.strictEqual(JSON.stringify(calls), JSON.stringify([{ action: "fail" }, { action: "hud", message: "工作流「失败即停」已在第 1 步停止" }]));
  assert.strictEqual(undoCalls.length, 1);
  assert.strictEqual(confirmations.length, 0);

  calls.length = 0;
  undoCalls.length = 0;
  context.__MN_COMMENT_WORKFLOW_REGISTRY__.registerAction({
    id: "test.throw",
    title: "异常动作",
    scope: "batch",
    run() {
      throw new Error("模拟异常");
    },
  }, "test.throw.patch");
  const thrownResult = await runner.run(addon, {
    id: "workflow-throw",
    name: "异常即停",
    scope: "batch",
    steps: [{ actionId: "test.throw" }, { actionId: "test.after" }],
  }, { token: "token-1" });
  assert.strictEqual(thrownResult.completed, false);
  assert.strictEqual(thrownResult.failedStep.error, "模拟异常");
  assert.strictEqual(undoCalls.length, 1);
  assert.strictEqual(calls.some((call) => call.action === "after"), false);

  calls.length = 0;
  confirmations.length = 0;
  undoCalls.length = 0;
  const singleAddon = {
    dynamicCommentContext: { token: "single-token", noteId: "A2", note: notes.A2 },
    batchCommentContext: { token: "other-batch", notes: [notes.A, notes.B] },
  };
  const singleResult = await runner.run(singleAddon, {
    id: "workflow-single",
    name: "单卡清理",
    scope: "single",
    steps: [{ actionId: "convertNotesToNoExcerpt", options: {} }, { actionId: "removeAllLinkComments", options: {} }],
  }, { mode: "single", token: "single-token", noteId: "A2" });
  assert.strictEqual(singleResult.completed, true);
  assert.strictEqual(JSON.stringify(calls.filter((call) => call.action !== "hud")), JSON.stringify([
    { action: "convertToNoExcerpt", noteIds: ["A2"] },
    { action: "removeAllLinks", noteIds: ["A3"] },
  ]));
  assert.strictEqual(undoCalls.length, 1);
  assert.strictEqual(singleAddon.dynamicCommentContext.noteId, "A3");
  assert.strictEqual(JSON.stringify(singleAddon.batchCommentContext.notes.map((note) => note.noteId)), '["A","B"]', "single conversion must not replace batch selection");
  await assert.rejects(() => runner.run(singleAddon, {
    id: "workflow-single-only",
    name: "单卡工作流",
    scope: "single",
    steps: [{ actionId: "removeAllLinkComments", options: {} }],
  }, { mode: "single", token: "stale", noteId: "A2" }), /单卡已变化/);

  await assert.rejects(() => runner.run(addon, workflow.id, { token: "stale-token" }), /多选卡片已变化/);
  assert.strictEqual(undoCalls.length, 1);

  // Exercise the actual editor -> runner boundary for successful and partial merges.
  context.__MN_COMMENT_DATA__.getNoteSnapshot = (note) => ({
    noteId: note.noteId, excerpt: { present: false }, comments: [0, 1].map((index) => ({
      index, text: `comment-${index}`, capabilities: { canMergeText: true, canCopyText: true },
    })),
  });
  vm.runInContext(fs.readFileSync(path.join(sourceDir, "CommentBatchEditor.js"), "utf8"), context);
  for (const partial of [false, true]) {
    calls.length = 0;
    const mergeAddon = { batchCommentContext: { token: "merge-token", notes: [notes.A, notes.B] } };
    context.__MN_COMMENT_MUTATIONS__.mergeContentSelection = (id) => ({
      actionCompleted: !partial, error: partial ? "merge failed after conversion" : "",
      convertedNoteMap: { [id]: `${id}2` },
    });
    const merged = await runner.run(mergeAddon, {
      name: "合并后去链接", scope: "batch",
      steps: [{ actionId: "mergeSelectedComments" }, { actionId: "removeAllLinkComments" }],
    }, { token: "merge-token" });
    assert.strictEqual(merged.completed, !partial);
    assert.strictEqual(JSON.stringify(mergeAddon.batchCommentContext.notes.map((note) => note.noteId)), '["A2","B2"]');
    const cleanup = calls.find((call) => call.action === "removeAllLinks");
    if (partial) {
      assert.strictEqual(cleanup, undefined, "partial merges must stop subsequent actions");
      assert.strictEqual(merged.failedStep.result.failed, 2);
    } else {
      assert.strictEqual(JSON.stringify(cleanup.noteIds), '["A2","B2"]');
    }
  }

  calls.length = 0;
  const changedAddon = { batchCommentContext: { token: "original", notes: [notes.A, notes.B] } };
  context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes = () => {
    changedAddon.batchCommentContext = { token: "replacement", notes: [notes.A3, notes.B] };
    return { convertedNoteMap: { A: "A2" } };
  };
  const changed = await runner.run(changedAddon, workflow, { token: "original" });
  assert.strictEqual(changed.completed, false);
  assert.strictEqual(changedAddon.batchCommentContext.notes[0], notes.A3, "reentrant selection changes must not be overwritten");
  assert.strictEqual(calls.some((call) => call.action === "removeAllLinks"), false);
  console.log("comment workflow runner tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
