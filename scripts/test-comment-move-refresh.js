const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function runScenario(command, useApplicationFallback = false) {
  const events = [];
  const note = {
    noteId: "NOTE-1",
    notebookId: "NOTEBOOK-1",
    comments: [
      { type: "TextNote", text: "first" },
      { type: "TextNote", text: "second" },
      { type: "TextNote", text: "third" },
    ],
    moveComment(fromIndex, toIndex, refresh) {
      events.push(`move:${fromIndex}:${toIndex}:${refresh}`);
      const [comment] = this.comments.splice(fromIndex, 1);
      this.comments.splice(toIndex, 0, comment);
    },
    removeCommentByIndex(index) {
      events.push(`remove:${index}`);
      this.comments.splice(index, 1);
    },
    refresh() {
      events.push("note-refresh");
    },
  };

  const mnUtil = {
    currentNotebookId: "CURRENT-NOTEBOOK",
    showHUD(message) {
      events.push(`hud:${message}`);
    },
  };
  if (!useApplicationFallback) {
    mnUtil.refreshAfterDBChanged = function (notebookId) {
      events.push(`mnutil-db-refresh:${notebookId}`);
    };
  }

  const context = vm.createContext({
    console,
    MNUtil: mnUtil,
    Application: useApplicationFallback ? {
      sharedInstance() {
        return {
          refreshAfterDBChanged(notebookId) {
            events.push(`application-db-refresh:${notebookId}`);
          },
        };
      },
    } : undefined,
    __MN_UNDO_GROUPING_MNCommentManagerAddon: {
      run(actionName, options, block) {
        const anchor = options.note || (Array.isArray(options.notes) ? options.notes[0] : null);
        events.push(`undo-start:${actionName}:${anchor && anchor.noteId}`);
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
          excerpt: { present: false },
          comments: target.comments.map((comment, index) => ({
            index,
            type: "textComment",
            text: comment.text,
            capabilities: { canMove: true, canDelete: true },
          })),
        };
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "../src/CommentMutations.js"), "utf8");
  vm.runInContext(source, context, { filename: "CommentMutations.js" });

  if (command === "moveComments") {
    context.__MN_COMMENT_MUTATIONS__.moveComments("NOTE-1", [1], 0);
  } else if (command === "deleteComments") {
    context.__MN_COMMENT_MUTATIONS__.deleteComments("NOTE-1", [1]);
  } else if (command === "clearAllCommentsForNotes") {
    context.__MN_COMMENT_MUTATIONS__.clearAllCommentsForNotes([note], { allowSingle: true });
  } else if (command === "moveContentSelection") {
    context.__MN_COMMENT_MUTATIONS__.moveContentSelection(
      "NOTE-1",
      { excerptSelected: false, commentIndices: [1] },
      0,
    );
  } else {
    context.__MN_COMMENT_MUTATIONS__.deleteContentSelection(
      "NOTE-1",
      { excerptSelected: false, commentIndices: [1] },
    );
  }
  return { events, note };
}

function runBidirectionalDeleteScenario() {
  const events = [];
  const sourceId = "11111111-1111-1111-1111-111111111111";
  const targetId = "22222222-2222-2222-2222-222222222222";
  const source = {
    noteId: sourceId,
    notebookId: "NOTEBOOK-SOURCE",
    comments: [
      { type: "TextNote", text: "keep" },
      { type: "TextNote", text: `marginnote4app://note/${targetId}` },
    ],
    removeCommentByIndex(index) {
      events.push(`remove-source:${index}`);
      this.comments.splice(index, 1);
    },
    refresh() {
      events.push("note-refresh-source");
    },
  };
  const target = {
    noteId: targetId,
    notebookId: "NOTEBOOK-TARGET",
    comments: [{ type: "TextNote", text: `marginnote4app://note/${sourceId}` }],
    removeCommentByIndex(index) {
      events.push(`remove-target:${index}`);
      this.comments.splice(index, 1);
    },
    refresh() {
      events.push("note-refresh-target");
    },
  };
  const context = vm.createContext({
    console,
    MNUtil: {
      refreshAfterDBChanged(notebookId) {
        events.push(`mnutil-db-refresh:${notebookId}`);
      },
      showHUD(message) {
        events.push(`hud:${message}`);
      },
    },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: {
      run(actionName, options, block) {
        events.push(`undo-start:${actionName}:${options.note.noteId}`);
        block();
        events.push(`undo-end:${actionName}`);
      },
    },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById(noteId) {
        if (noteId === sourceId) return source;
        if (noteId === targetId) return target;
        return null;
      },
      extractPureMarginNoteLink(text) {
        const match = String(text || "").match(/^marginnote4app:\/\/note\/([0-9A-F-]{36})$/i);
        return match ? { noteId: match[1].toUpperCase(), url: text } : null;
      },
      getNoteSnapshot(note) {
        return {
          noteId: note.noteId,
          comments: note.comments.map((comment, index) => ({
            index,
            type: index === 1 || note === target ? "linkComment" : "textComment",
            text: comment.text,
            linkedNoteId: note === source && index === 1 ? targetId : sourceId,
            capabilities: { canBidirectionalDelete: true },
          })),
        };
      },
    },
  });
  const sourceCode = fs.readFileSync(path.join(__dirname, "../src/CommentMutations.js"), "utf8");
  vm.runInContext(sourceCode, context, { filename: "CommentMutations.js" });
  context.__MN_COMMENT_MUTATIONS__.deleteBidirectionalLinks(sourceId, [1]);
  return { events, source, target };
}

{
  const { events, note } = runScenario("moveComments");
  assert.deepStrictEqual(events, [
    "undo-start:移动评论:NOTE-1",
    "move:1:0:false",
    "note-refresh",
    "undo-end:移动评论",
    "mnutil-db-refresh:NOTEBOOK-1",
  ]);
  assert.deepStrictEqual(note.comments.map((comment) => comment.text), ["second", "first", "third"]);
}

{
  const { events, note } = runScenario("moveContentSelection");
  assert.deepStrictEqual(events, [
    "undo-start:移动内容:NOTE-1",
    "move:1:0:false",
    "note-refresh",
    "undo-end:移动内容",
    "mnutil-db-refresh:NOTEBOOK-1",
    "hud:内容位置已更新",
  ]);
  assert.deepStrictEqual(note.comments.map((comment) => comment.text), ["second", "first", "third"]);
}

{
  const { events, note } = runScenario("deleteComments");
  assert.deepStrictEqual(events, [
    "undo-start:删除评论:NOTE-1",
    "remove:1",
    "note-refresh",
    "undo-end:删除评论",
    "mnutil-db-refresh:NOTEBOOK-1",
    "hud:已删除 1 条评论",
  ]);
  assert.deepStrictEqual(note.comments.map((comment) => comment.text), ["first", "third"]);
}

{
  const { events, note } = runScenario("clearAllCommentsForNotes");
  assert.deepStrictEqual(events, [
    "undo-start:批量清空评论:NOTE-1",
    "remove:2",
    "remove:1",
    "remove:0",
    "note-refresh",
    "undo-end:批量清空评论",
    "mnutil-db-refresh:NOTEBOOK-1",
    "hud:已清空 1/1 张卡片的评论，删除 3 条",
  ]);
  assert.deepStrictEqual(note.comments, []);
}

{
  const { events, source, target } = runBidirectionalDeleteScenario();
  assert.deepStrictEqual(events, [
    "undo-start:删除双向链接评论:11111111-1111-1111-1111-111111111111",
    "remove-source:1",
    "remove-target:0",
    "note-refresh-target",
    "note-refresh-source",
    "undo-end:删除双向链接评论",
    "mnutil-db-refresh:NOTEBOOK-SOURCE",
    "mnutil-db-refresh:NOTEBOOK-TARGET",
    "hud:已删除 1 条链接评论，并清理 1 条反向链接",
  ]);
  assert.deepStrictEqual(source.comments.map((comment) => comment.text), ["keep"]);
  assert.deepStrictEqual(target.comments, []);
}

{
  const { events, note } = runScenario("deleteContentSelection");
  assert.deepStrictEqual(events, [
    "undo-start:删除内容:NOTE-1",
    "remove:1",
    "note-refresh",
    "undo-end:删除内容",
    "mnutil-db-refresh:NOTEBOOK-1",
    "hud:已删除 1 项内容",
  ]);
  assert.deepStrictEqual(note.comments.map((comment) => comment.text), ["first", "third"]);
}

{
  const { events } = runScenario("moveComments", true);
  assert(events.includes("application-db-refresh:NOTEBOOK-1"));
}

console.log("comment move refresh regression ok");
