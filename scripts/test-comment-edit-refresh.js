const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function runEditScenario({ immediateRefresh = true }) {
  const events = [];
  const note = {
    noteId: "NOTE-1",
    notebookId: "NOTEBOOK-1",
    comments: [{ type: "TextNote", text: "old markdown" }],
    removeCommentByIndex(index) {
      events.push(`remove:${index}`);
      this.comments.splice(index, 1);
    },
    appendMarkdownComment(text) {
      events.push(`append-markdown:${text}`);
      this.comments.push({ type: "TextNote", text, markdown: true });
    },
    moveComment(fromIndex, toIndex, refresh) {
      events.push(`move:${fromIndex}:${toIndex}:${refresh}`);
      const [comment] = this.comments.splice(fromIndex, 1);
      this.comments.splice(toIndex, 0, comment);
    },
    refresh() {
      events.push("note-refresh");
    },
  };

  const mnUtil = {
    currentNotebookId: "CURRENT-NOTEBOOK",
    app: {
      refreshAfterDBChanged(notebookId) {
        events.push(`app-db-refresh:${notebookId}`);
      },
    },
    showHUD(message) {
      events.push(`hud:${message}`);
    },
  };
  if (immediateRefresh) {
    mnUtil.refreshAfterDBChanged = function (notebookId) {
      events.push(`mnutil-db-refresh:${notebookId}`);
    };
  }

  const context = vm.createContext({
    console,
    MNUtil: mnUtil,
    __MN_UNDO_GROUPING_MNCommentManagerAddon: {
      run(actionName, options, block) {
        events.push(`undo-start:${actionName}:${options.note.noteId}`);
        block();
        events.push(`undo-end:${actionName}`);
      },
    },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById(noteId) {
        return noteId === note.noteId ? note : null;
      },
      getNoteSnapshot(target) {
        return {
          noteId: target.noteId,
          comments: target.comments.map((comment, index) => ({
            index,
            text: comment.text,
            capabilities: { canEditText: true },
          })),
        };
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "../src/CommentMutations.js"), "utf8");
  vm.runInContext(source, context, { filename: "CommentMutations.js" });

  const snapshot = context.__MN_COMMENT_MUTATIONS__.editCommentText(
    "NOTE-1",
    0,
    "updated **markdown**",
    true,
  );
  return { events, note, snapshot };
}

{
  const { events, note, snapshot } = runEditScenario({ immediateRefresh: true });
  assert.deepStrictEqual(events, [
    "undo-start:编辑评论:NOTE-1",
    "remove:0",
    "append-markdown:updated **markdown**",
    "move:0:0:false",
    "note-refresh",
    "undo-end:编辑评论",
    "mnutil-db-refresh:NOTEBOOK-1",
    "hud:评论已更新",
  ]);
  assert.strictEqual(note.comments[0].text, "updated **markdown**");
  assert.strictEqual(snapshot.comments[0].text, "updated **markdown**");
}

{
  const { events } = runEditScenario({ immediateRefresh: false });
  assert(events.includes("app-db-refresh:NOTEBOOK-1"));
  assert(!events.some((event) => event.startsWith("debounced-db-refresh:")));
  assert(events.indexOf("app-db-refresh:NOTEBOOK-1") > events.indexOf("undo-end:编辑评论"));
}

console.log("comment edit refresh regression ok");
