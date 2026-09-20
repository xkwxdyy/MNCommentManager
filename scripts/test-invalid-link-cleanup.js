const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const registry = {};
function note(id, comments) {
  const value = {
    noteId: id,
    notebookId: "topic-1",
    comments: comments.map((text) => ({ type: "TextNote", text, markdown: /\[[^\]]+\]\(/.test(text) })),
    refresh() {},
    removeCommentByIndex(index) { this.comments.splice(index, 1); },
    appendTextComment(text) { this.comments.push({ type: "TextNote", text }); },
    appendMarkdownComment(text) { this.comments.push({ type: "TextNote", text, markdown: true }); },
    moveComment(from, to) { const item = this.comments.splice(from, 1)[0]; this.comments.splice(to, 0, item); },
  };
  registry[id] = value;
  return value;
}
const validId = "11111111-1111-4111-8111-111111111111";
const missingId = "22222222-2222-4222-8222-222222222222";
const errorId = "33333333-3333-4333-8333-333333333333";
const current = note("current", [
  `marginnote4app://note/${missingId}`,
  `marginnote4app://note/${validId}`,
  `marginnote4app://note/${missingId}/summary/abc`,
  `[保留文字](marginnote4app://note/${missingId}) and [有效](marginnote4app://note/${validId})`,
  "`[代码](marginnote4app://note/22222222-2222-4222-8222-222222222222)`",
  "~~~\n[围栏代码](marginnote4app://note/22222222-2222-4222-8222-222222222222)\n~~~",
]);
registry[validId] = note(validId, []);

const context = {
  console,
  Database: { sharedInstance() { return { getNoteById(id) { if (id === errorId) throw new Error("database unavailable"); return registry[id] || undefined; } }; } },
  MNNote: { new(id) { return registry[id] || null; }, getFocusNote() { return current; } },
  MNUtil: { currentNotebookId: "topic-1", refreshAfterDBChanged() {}, showHUD() {} },
  __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(_name, _options, callback) { return callback(); } },
};
vm.createContext(context);
const root = path.join(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "src", "CommentData.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "src", "CommentMutations.js"), "utf8"), context);

const mutations = context.__MN_COMMENT_MUTATIONS__;
const preview = mutations.previewInvalidLinkCleanupForNotes([current], { allowSingle: true, mode: "all" });
assert.strictEqual(preview.removableCardLinks, 1);
assert.strictEqual(preview.removableMarkdownLinks, 1);
assert.strictEqual(preview.affectedCards, 1);
const result = mutations.clearInvalidLinksForNotes([current], { allowSingle: true, mode: "all", expectedSignature: preview.signature });
assert.strictEqual(result.removedCardLinks, 1);
assert.strictEqual(result.removedMarkdownLinks, 1);
assert.strictEqual(current.comments.length, 5);
assert.strictEqual(current.comments.some((comment) => comment.text.includes("保留文字") && comment.text.includes("有效")), true);
assert.strictEqual(current.comments.some((comment) => comment.text.includes("`[代码]")), true);
assert.strictEqual(current.comments.some((comment) => comment.text.includes("围栏代码")), true);
assert.throws(() => mutations.clearInvalidLinksForNotes([current], { allowSingle: true, mode: "all", expectedSignature: preview.signature }), /链接内容已变化/);
console.log("invalid link cleanup tests passed");
