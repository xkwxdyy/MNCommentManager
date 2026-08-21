const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../src/CommentData.js"), "utf8");
const context = vm.createContext({
  console,
  Array,
  ArrayBuffer,
  DataView,
  Map,
  Math,
  Number,
  Object,
  Promise,
  RegExp,
  Set,
  String,
  Uint8Array,
  MNUtil: {
    getMediaByHash() {
      return null;
    },
  },
  MNNote: {
    new() {
      return null;
    },
    getFocusNote() {
      return null;
    },
  },
  MNComment: {
    getCommentType(comment) {
      if (comment && comment.type === "LinkNote" && comment.markdown) return "mergedMarkdownComment";
      return "";
    },
  },
  __MN_HANDWRITING_PREVIEW_MNCommentManagerAddon: {
    renderMediaDataURI() {
      return { dataURI: "", error: "", pending: false };
    },
  },
});

vm.runInContext(source, context, { filename: "CommentData.js" });

const snapshot = context.__MN_COMMENT_DATA__.getNoteSnapshot({
  noteId: "11111111-1111-1111-1111-111111111111",
  noteTitle: "merged markdown",
  comments: [
    {
      type: "LinkNote",
      noteid: "22222222-2222-2222-2222-222222222222",
      q_htext: "**merged** [link](marginnote4app://note/33333333-3333-3333-3333-333333333333)",
      markdown: true,
    },
    {
      type: "LinkNote",
      noteid: "44444444-4444-4444-4444-444444444444",
      q_htext: "plain merged text",
      markdown: false,
    },
  ],
});

const mergedMarkdown = snapshot.comments[0];
assert.strictEqual(mergedMarkdown.type, "mergedMarkdownComment");
assert.strictEqual(mergedMarkdown.capabilities.isMarkdown, true);
assert.strictEqual(mergedMarkdown.capabilities.canEditText, true);
assert.strictEqual(mergedMarkdown.capabilities.canMergeText, true);
assert.strictEqual(mergedMarkdown.capabilities.isMerged, true);
assert.strictEqual(snapshot.comments[1].type, "mergedTextComment");

console.log("merged markdown classification regression ok");

const editEvents = [];
const editNote = {
  noteId: "55555555-5555-5555-5555-555555555555",
  notebookId: "notebook-1",
  comments: [{
    type: "LinkNote",
    noteid: "66666666-6666-6666-6666-666666666666",
    q_htext: "old **merged** text",
    markdown: true,
  }],
  refresh() {
    editEvents.push("note-refresh");
  },
  removeCommentByIndex(index) {
    editEvents.push(`remove:${index}`);
    this.comments.splice(index, 1);
  },
  appendMarkdownComment(text) {
    editEvents.push(`append-markdown:${text}`);
    this.comments.push({ type: "TextNote", text, markdown: true });
  },
  moveComment(fromIndex, toIndex) {
    const [comment] = this.comments.splice(fromIndex, 1);
    this.comments.splice(toIndex, 0, comment);
  },
};
const editContext = vm.createContext({
  console,
  Array,
  ArrayBuffer,
  DataView,
  Map,
  Math,
  Number,
  Object,
  Promise,
  RegExp,
  Set,
  String,
  Uint8Array,
  MNUtil: {
    currentNotebookId: "notebook-1",
    refreshAfterDBChanged() {
      editEvents.push("db-refresh");
    },
    showHUD(message) {
      editEvents.push(`hud:${message}`);
    },
  },
  MNNote: {
    new() {
      return editNote;
    },
    getFocusNote() {
      return editNote;
    },
  },
  MNComment: {
    getCommentType(comment) {
      if (comment && comment.type === "LinkNote") {
        return comment.markdown ? "mergedMarkdownComment" : "mergedTextComment";
      }
      return "";
    },
    new(rawComment) {
      return {
        setText(text, type) {
          editEvents.push(`canonical-set:${type}`);
          rawComment.q_htext = text;
        },
      };
    },
  },
  __MN_HANDWRITING_PREVIEW_MNCommentManagerAddon: {
    renderMediaDataURI() {
      return { dataURI: "", error: "", pending: false };
    },
  },
  __MN_UNDO_GROUPING_MNCommentManagerAddon: {
    run(_actionName, _options, block) {
      return block();
    },
  },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/CommentData.js"), "utf8"), editContext, { filename: "CommentData.js" });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/CommentMutations.js"), "utf8"), editContext, { filename: "CommentMutations.js" });

editContext.__MN_COMMENT_MUTATIONS__.editCommentText(
  editNote.noteId,
  0,
  "new **merged** text",
  true,
);
assert.strictEqual(editNote.comments[0].q_htext, "new **merged** text");
assert(editEvents.includes("canonical-set:mergedMarkdownComment"));
assert(editEvents.includes("db-refresh"));
console.log("merged markdown canonical edit regression ok");

editNote.comments.push({ type: "TextNote", text: "second text" });
const mergedSnapshot = editContext.__MN_COMMENT_MUTATIONS__.mergeTextComments(
  editNote.noteId,
  [0, 1],
  "merged **result**",
  true,
);
assert.strictEqual(mergedSnapshot.comments.length, 1);
assert.strictEqual(mergedSnapshot.comments[0].type, "markdownComment");
console.log("merged markdown merge capability regression ok");
