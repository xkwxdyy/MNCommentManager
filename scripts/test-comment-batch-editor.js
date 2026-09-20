const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const calls = [];
let snapshotReads = 0;
const snapshots = {
  A: {
    noteId: "A", noteTitle: "A", excerpt: { type: "text", present: true },
    comments: [
      { index: 0, text: "plain", type: "textComment", capabilities: { hasText: true, isHtml: false, canMergeText: true, canCopyText: true } },
      { index: 1, text: "**md**", type: "markdownComment", capabilities: { hasText: true, isMarkdown: true, canMergeText: true, canCopyText: true } },
      { index: 2, text: "<b>html</b>", type: "HtmlComment", capabilities: { hasText: true, isHtml: true, canMergeText: true, canCopyText: true } },
    ],
  },
  B: {
    noteId: "B", noteTitle: "B", excerpt: { type: "none", present: false },
    comments: [{ index: 0, text: "only", type: "textComment", capabilities: { hasText: true, canMergeText: true, canCopyText: true } }],
  },
};
const note = (id) => ({ noteId: id, comments: snapshots[id].comments });
const context = {
  console: { log() {} },
  Map,
  Set,
  Array,
  Number,
  String,
  Object,
  __MN_COMMENT_DATA__: { getNoteSnapshot(value) { snapshotReads += 1; return snapshots[value.noteId]; } },
  __MN_COMMENT_MUTATIONS__: {
    mergeContentSelection(id, selection, text) { calls.push({ kind: "merge", id, selection, text }); return {}; },
    mergeCommentsToExcerpt(id, selection, text) { calls.push({ kind: "excerpt", id, selection, text }); return {}; },
    convertHtmlCommentsToMarkdown(id, indices) { calls.push({ kind: "html", id, indices }); return { stats: { convertedComments: indices.length } }; },
    deleteContentSelection(id, selection) { calls.push({ kind: "delete", id, selection }); return {}; },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentBatchEditor.js"), "utf8"), context);
const editor = context.__MN_COMMENT_BATCH_EDITOR__;

assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["html"] }), [2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["text", "html"] }), [0, 2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["text", "markdown", "html"], capabilities: ["canMergeText"] }), [0, 1, 2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["text", "markdown"], order: "reverse" }), [1, 0]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "single", index: 0 } }), [0]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "single", index: -1 } }), [2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "single", index: -2 } }), [1]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "range", start: 0, end: -2 } }), [0, 1]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "range", start: -1, end: 0 } }), [0, 1, 2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { position: { mode: "range", start: 0, end: -2 }, order: "reverse" }), [1, 0]);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["html"], position: { mode: "range", start: 0, end: 1 } }), []);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { types: ["html"], position: { mode: "range", start: 0, end: 2 } }), [2]);
assert.deepStrictEqual(editor.selectCommentIndices(note("B"), { position: { mode: "range", start: 0, end: -2 } }), []);
assert.deepStrictEqual(editor.selectCommentIndices(note("A"), { includeExcerpt: true, position: { mode: "single", index: 0 } }), [0]);
assert.throws(() => editor.selectCommentIndices(note("A"), { position: { mode: "single", index: "1.5" } }), /索引必须是整数/);
assert.strictEqual(JSON.stringify(editor.buildOverview([note("A"), note("B")])[0].commentCounts), JSON.stringify({ all: 3, text: 1, markdown: 1, html: 1, image: 0, link: 0 }));
assert.strictEqual(editor.buildOverview([note("A"), note("B")])[0].commentCount, 3);
snapshotReads = 0;
const merged = editor.mergeSelected([note("A"), note("B")], { capabilities: ["canMergeText"] }, { destination: "comment" });
assert.strictEqual(merged.failed, 0);
assert.strictEqual(merged.skipped, 1, "matched cards without enough mergeable comments count as skipped");
assert.strictEqual(snapshotReads, 2, "each card should be serialized only once per action");
assert.strictEqual(calls[0].id, "A");
assert.strictEqual(calls[0].text, "plain\n\n**md**\n\n<b>html</b>");
editor.convertHtml([note("A")], { types: ["html"] });
assert.deepStrictEqual(calls.find((item) => item.kind === "html").indices, [2]);
context.__MN_COMMENT_MUTATIONS__.mergeContentSelection = () => ({
  actionCompleted: false, error: "mapping failed", convertedNoteMap: { A: "A2" },
});
const partial = editor.mergeSelected([note("A")], {}, {});
assert.strictEqual(partial.failed, 1);
assert.strictEqual(JSON.stringify(partial.convertedNoteMap), '{"A":"A2"}', "partial failures must retain replacement IDs");
console.log("comment batch editor tests passed");
