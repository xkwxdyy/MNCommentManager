const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const snapshots = {
  A: {
    noteId: "A",
    noteTitle: "A",
    excerpt: { present: true, type: "text" },
    comments: [
      { index: 0, text: "one", type: "textComment", capabilities: { hasText: true } },
      { index: 1, text: "two", type: "textComment", capabilities: { hasText: true } },
      { index: 2, text: "three", type: "textComment", capabilities: { hasText: true } },
    ],
  },
  B: {
    noteId: "B",
    noteTitle: "B",
    excerpt: { present: false, type: "none" },
    comments: [{ index: 0, text: "only", type: "textComment", capabilities: { hasText: true } }],
  },
};
const notes = Object.keys(snapshots).reduce((result, id) => {
  result[id] = { noteId: id };
  return result;
}, {});
const context = {
  console: { log() {} },
  __MN_COMMENT_DATA__: {
    getNoteSnapshot(note) { return snapshots[note.noteId]; },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentBatchEditor.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "WebBridgeCommands.js"), "utf8"), context);

const addon = {
  batchCommentContext: { token: "batch-1", notes: [notes.A, notes.B] },
};
const result = context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.previewBatchWorkflow(
  { addon },
  {
    token: "batch-1",
    workflow: {
      id: "preview-position",
      steps: [{ kind: "select", selector: { position: { mode: "range", start: 0, end: -2 } } }],
    },
  },
);

assert.strictEqual(result.cards[0].commentCount, 3);
assert.deepStrictEqual(result.steps[0].perCard[0].indices, [0, 1]);
assert.strictEqual(result.steps[0].perCard[1].positionOutOfRange, true);
assert.strictEqual(result.steps[0].perCard[1].matched, 0);
assert.throws(() => context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.previewBatchWorkflow(
  { addon }, { token: "stale-batch", workflow: { steps: [] } },
), /多选卡片已变化/);
console.log("comment workflow preview tests passed");
