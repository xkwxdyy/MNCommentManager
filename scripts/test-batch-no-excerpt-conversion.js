const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const commentDataSource = fs.readFileSync(path.join(rootDir, "src/CommentData.js"), "utf8");
const mutationsSource = fs.readFileSync(path.join(rootDir, "src/CommentMutations.js"), "utf8");
const batchActionsSource = fs.readFileSync(path.join(rootDir, "src/BatchCommentActions.js"), "utf8");
const dynamicActionsSource = fs.readFileSync(path.join(rootDir, "src/DynamicCommentActions.js"), "utf8");
const addonSource = fs.readFileSync(path.join(rootDir, "src/MNCommentManagerAddon.js"), "utf8");

const ids = {
  source: "11111111-1111-1111-1111-111111111111",
  text: "22222222-2222-2222-2222-222222222222",
  linked: "33333333-3333-3333-3333-333333333333",
  noExcerpt: "44444444-4444-4444-4444-444444444444",
  root: "55555555-5555-5555-5555-555555555555",
  audio: "66666666-6666-6666-6666-666666666666",
  parent: "77777777-7777-7777-7777-777777777777",
};

function noteUrl(noteId) {
  return `marginnote4app://note/${noteId}`;
}

function addNoteMethods(note) {
  note.noteURL = note.noteURL || noteUrl(note.noteId);
  note.comments = Array.isArray(note.comments) ? note.comments : [];
  note.childNotes = Array.isArray(note.childNotes) ? note.childNotes : [];
  note.removeCommentByIndex = function (index) {
    this.comments.splice(index, 1);
  };
  note.removeCommentsByIndices = function (indices) {
    indices.slice().sort((a, b) => b - a).forEach((index) => this.removeCommentByIndex(index));
  };
  note.appendMarkdownComment = function (text) {
    this.comments.push({ type: "TextNote", text, markdown: true });
  };
  note.moveComment = function (fromIndex, toIndex) {
    const item = this.comments.splice(fromIndex, 1)[0];
    this.comments.splice(toIndex, 0, item);
  };
  note.refresh = function () {
    this.refreshCount = (this.refreshCount || 0) + 1;
  };
  note.removeFromParent = function () {
    const parent = this.parentNote;
    if (!parent) return;
    const index = parent.childNotes.indexOf(this);
    if (index >= 0) parent.childNotes.splice(index, 1);
    this.parentNote = null;
  };
  note.addChild = function (child) {
    if (child.parentNote && child.parentNote !== this && typeof child.removeFromParent === "function") {
      child.removeFromParent();
    }
    if (!this.childNotes.includes(child)) this.childNotes.push(child);
    child.parentNote = this;
  };
  return note;
}

const registry = new Map();
const hudMessages = [];
const pinUpdates = [];
const copiedTexts = [];
const copiedImages = [];
let targetSequence = 0;
let cloneSequence = 0;
let targetMergeHook = null;

const parent = addNoteMethods({ noteId: ids.parent, noteTitle: "Parent", childNotes: [] });
parent.createChildNote = function (config) {
  targetSequence += 1;
  const noteId = `99999999-9999-9999-9999-${String(targetSequence).padStart(12, "0")}`;
  const target = addNoteMethods({
    noteId,
    noteTitle: config.title,
    title: config.title,
    colorIndex: config.colorIndex,
    parentNote: this,
    comments: [],
  });
  target.merge = function (source) {
    source.groupNoteId = this.noteId;
    this.comments.push(
      { type: "LinkNote", noteid: source.noteId, q_htext: source.excerptText || "", q_hpic: source.excerptPic || null },
      ...source.comments.map((comment) => ({ ...comment })),
    );
    if (typeof targetMergeHook === "function") targetMergeHook(this, source);
  };
  target.moveTo = function (index) {
    const currentIndex = this.parentNote.childNotes.indexOf(this);
    if (currentIndex >= 0) this.parentNote.childNotes.splice(currentIndex, 1);
    this.parentNote.childNotes.splice(index, 0, this);
    this.movedTo = index;
  };
  this.childNotes.push(target);
  registry.set(noteId, target);
  return target;
};

const source = addNoteMethods({
  noteId: ids.source,
  noteTitle: "Image excerpt",
  title: "Image excerpt",
  colorIndex: 3,
  excerptType: "image",
  excerptPic: { selLst: [] },
  excerptText: "image OCR",
  parentNote: parent,
  comments: [{ type: "TextNote", text: noteUrl(ids.linked) }],
});
const textSource = addNoteMethods({
  noteId: ids.text,
  noteTitle: "Text excerpt",
  title: "Text excerpt",
  colorIndex: 5,
  excerptType: "text",
  excerptText: "selected text",
  parentNote: parent,
});
const noExcerpt = addNoteMethods({
  noteId: ids.noExcerpt,
  noteTitle: "Plain card",
  excerptType: "text",
  excerptText: "",
  parentNote: parent,
});
const rootExcerpt = addNoteMethods({
  noteId: ids.root,
  noteTitle: "Root excerpt",
  excerptType: "image",
  excerptPic: { selLst: [] },
  parentNote: null,
});
const audioExcerpt = addNoteMethods({
  noteId: ids.audio,
  noteTitle: "Audio excerpt",
  excerptType: "audio",
  excerptPic: { video: true, video_ext: "mp3" },
  parentNote: parent,
});
const linked = addNoteMethods({
  noteId: ids.linked,
  noteTitle: "Linked card",
  comments: [
    { type: "TextNote", text: noteUrl(ids.source) },
    { type: "TextNote", text: `before [source](${noteUrl(ids.source)}) after`, markdown: true },
  ],
});

[parent, source, textSource, noExcerpt, rootExcerpt, audioExcerpt, linked].forEach((note) => {
  registry.set(note.noteId, note);
});
parent.childNotes.push(source, textSource, noExcerpt, audioExcerpt);
Object.defineProperty(source, "indexInBrotherNotes", {
  get() { return parent.childNotes.indexOf(source); },
});
Object.defineProperty(textSource, "indexInBrotherNotes", {
  get() { return parent.childNotes.indexOf(textSource); },
});

const context = {
  console,
  MNUtil: {
    getMediaByHash(hash) { return hash ? { mediaHash: hash } : null; },
    copy(text) { copiedTexts.push(String(text)); },
    copyImage(data) { copiedImages.push(data); },
    focusNoteInMindMapById() {},
    showHUD(message) { hudMessages.push(String(message)); },
    version: { version: "marginnote4" },
  },
  MNNote: {
    new(noteId) { return registry.get(String(noteId)) || null; },
    detachMergedSourceFromParent(sourceNote, targetNote, expectedParent) {
      assert.strictEqual(sourceNote.parentNote, expectedParent);
      assert.strictEqual(sourceNote.groupNoteId, targetNote.noteId);
      sourceNote.removeFromParent();
      return true;
    },
  },
  pinnerUtils: {
    updateCardPinsNoteId(sourceNoteId, targetNoteId) {
      pinUpdates.push({ sourceNoteId, targetNoteId });
    },
  },
  __MN_UNDO_GROUPING_MNCommentManagerAddon: {
    run(_actionName, _options, block) { return block(); },
  },
};

vm.createContext(context);
vm.runInContext(commentDataSource, context, { filename: "CommentData.js" });
vm.runInContext(mutationsSource, context, { filename: "CommentMutations.js" });

assert.throws(
  () => context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes([noExcerpt]),
  /请先选择卡片/,
  "batch conversion must still require at least two cards",
);
const singleContractNote = addNoteMethods({
  noteId: "88888888-8888-8888-8888-888888888888",
  noteTitle: "",
  excerptType: "text",
  excerptText: "",
  parentNote: parent,
});
[
  "keepFirstContentForNotes",
  "convertHtmlCommentsToMarkdownForNotes",
  "removeAllLinkCommentsForNotes",
  "clearAllCommentsForNotes",
  "clearAllTitlesForNotes",
].forEach((mutationName) => {
  const result = context.__MN_COMMENT_MUTATIONS__[mutationName]([singleContractNote], { allowSingle: true });
  assert.strictEqual(result.total, 1, `${mutationName} must honor the Dynamic single-card contract`);
});
const singleStats = context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes([noExcerpt], { allowSingle: true });
assert.strictEqual(singleStats.total, 1);
assert.strictEqual(singleStats.noExcerpt, 1);
hudMessages.length = 0;

const stats = context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes([
  source,
  textSource,
  noExcerpt,
  rootExcerpt,
  audioExcerpt,
]);

assert.strictEqual(stats.changed, 2);
assert.strictEqual(stats.imageExcerpt, 1);
assert.strictEqual(stats.textExcerpt, 1);
assert.strictEqual(stats.noExcerpt, 1);
assert.strictEqual(stats.noParent, 1);
assert.strictEqual(stats.unsupportedMedia, 1);
assert.strictEqual(stats.failed, 0);
assert.strictEqual(hudMessages.length, 0, "successful conversion must stay silent");
assert.strictEqual(pinUpdates.length, 2);

const imageTarget = registry.get(stats.convertedNoteIds[0]);
assert(imageTarget, "image conversion target should exist");
assert.strictEqual(imageTarget.noteTitle, "Image excerpt");
assert.strictEqual(imageTarget.colorIndex, 3);
assert.strictEqual(imageTarget.movedTo, 0);
assert.strictEqual(source.parentNote, null);
assert.strictEqual(source.groupNoteId, imageTarget.noteId);
assert.strictEqual(parent.childNotes[0], imageTarget);
assert.strictEqual(imageTarget.comments.length, source.comments.length + 1);
assert.strictEqual(imageTarget.comments[0].type, "LinkNote");
assert.strictEqual(imageTarget.comments[0].noteid, ids.source);
assert.strictEqual(imageTarget.comments[1].text, noteUrl(ids.linked));
assert(!imageTarget.comments.some((comment) => String(comment.text || "").includes(noteUrl(ids.source))));

const textTarget = registry.get(stats.convertedNoteIds[1]);
assert(textTarget, "text conversion target should exist");
assert.strictEqual(textTarget.comments.length, 1);
assert.strictEqual(textTarget.comments[0].type, "LinkNote");
assert.strictEqual(textTarget.comments[0].noteid, ids.text);
assert.strictEqual(textTarget.comments[0].q_htext, "selected text");

const fallbackTextExcerpt = addNoteMethods({
  noteId: "EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE",
  noteTitle: "Fallback text excerpt",
  excerptText: "text without excerptType",
  parentNote: parent,
});
const fallbackTextSnapshot = context.__MN_COMMENT_DATA__.getNoteSnapshot(fallbackTextExcerpt);
assert.strictEqual(fallbackTextSnapshot.excerpt.present, true);
assert.strictEqual(fallbackTextSnapshot.excerpt.type, "text");
assert.strictEqual(fallbackTextSnapshot.excerpt.conversion.eligible, true);

function createActionSource(suffix, options = {}) {
  const noteId = `CCCCCCCC-CCCC-CCCC-CCCC-${String(suffix).padStart(12, "0")}`;
  const note = addNoteMethods({
    noteId,
    noteTitle: options.title || `Action ${suffix}`,
    title: options.title || `Action ${suffix}`,
    colorIndex: 2,
    excerptType: options.excerptType || "text",
    excerptText: options.excerptText || "",
    excerptPic: options.excerptPic || null,
    excerptPicData: options.excerptPicData || null,
    parentNote: parent,
    comments: (options.comments || []).map((comment) => ({ ...comment })),
  });
  note.createChildNote = parent.createChildNote;
  note.clone = function () {
    cloneSequence += 1;
    const clone = addNoteMethods({
      noteId: `DDDDDDDD-DDDD-DDDD-DDDD-${String(cloneSequence).padStart(12, "0")}`,
      noteTitle: this.noteTitle,
      title: this.title,
      colorIndex: this.colorIndex,
      excerptType: this.excerptType,
      excerptText: this.excerptText,
      excerptPic: this.excerptPic,
      excerptPicData: this.excerptPicData,
      documentMd5: this.documentMd5,
      pageNo: this.pageNo,
      sourceLocation: this.sourceLocation,
      comments: this.comments.map((comment) => ({ ...comment })),
      childNotes: [],
    });
    clone.delete = function () { registry.delete(this.noteId); };
    registry.set(clone.noteId, clone);
    return clone;
  };
  Object.defineProperty(note, "indexInBrotherNotes", {
    get() { return parent.childNotes.indexOf(note); },
  });
  parent.childNotes.push(note);
  registry.set(note.noteId, note);
  return note;
}

const moveSource = createActionSource(1, {
  excerptText: "native excerpt",
  comments: [
    { type: "TextNote", text: "first comment" },
    { type: "TextNote", text: "last comment" },
  ],
});
const moveResult = context.__MN_COMMENT_MUTATIONS__.moveContentSelection(
  moveSource.noteId,
  { excerptSelected: true, commentIndices: [0] },
  3,
);
assert.strictEqual(moveResult.converted, true);
assert.strictEqual(moveResult.actionCompleted, true);
assert.deepStrictEqual(Array.from(moveResult.mappedIndices), [0, 1]);
assert.deepStrictEqual(Array.from(moveResult.selectedIndices), [1, 2]);
assert.deepStrictEqual(
  Array.from(moveResult.snapshot.comments, (comment) => comment.text),
  ["last comment", "native excerpt", "first comment"],
  "move transaction must apply mapped indices on the replacement card",
);

const commentOnlyMoveSource = createActionSource(8, {
  excerptText: "fixed excerpt",
  comments: [
    { type: "TextNote", text: "first" },
    { type: "TextNote", text: "second" },
  ],
});
const commentOnlyMoveResult = context.__MN_COMMENT_MUTATIONS__.moveContentSelection(
  commentOnlyMoveSource.noteId,
  { excerptSelected: false, commentIndices: [1] },
  1,
);
assert.strictEqual(commentOnlyMoveResult.converted, false);
assert.strictEqual(commentOnlyMoveResult.noteId, commentOnlyMoveSource.noteId);
assert.strictEqual(commentOnlyMoveResult.snapshot.excerpt.present, true);
assert.deepStrictEqual(
  Array.from(commentOnlyMoveResult.snapshot.comments, (comment) => comment.text),
  ["second", "first"],
  "comment-only movement must translate the virtual target without converting the card",
);
assert.throws(
  () => context.__MN_COMMENT_MUTATIONS__.moveContentSelection(
    commentOnlyMoveSource.noteId,
    { excerptSelected: false, commentIndices: [0] },
    0,
  ),
  /不能移到摘录之前/,
);

const deleteSource = createActionSource(2, {
  excerptType: "image",
  excerptText: "image OCR",
  excerptPic: { paint: "excerpt-image-hash" },
  comments: [
    { type: "TextNote", text: "keep me" },
    { type: "TextNote", text: "delete me" },
  ],
});
const deleteResult = context.__MN_COMMENT_MUTATIONS__.deleteContentSelection(
  deleteSource.noteId,
  { excerptSelected: true, commentIndices: [1] },
);
assert.strictEqual(deleteResult.converted, true);
assert.strictEqual(deleteResult.actionCompleted, true);
assert.deepStrictEqual(Array.from(deleteResult.snapshot.comments, (comment) => comment.text), ["keep me"]);

const mergeSource = createActionSource(3, {
  excerptText: "merge excerpt",
  comments: [{ type: "TextNote", text: "merge comment" }],
});
const mergeResult = context.__MN_COMMENT_MUTATIONS__.mergeContentSelection(
  mergeSource.noteId,
  { excerptSelected: true, commentIndices: [0] },
  "merged result",
  true,
  "text",
);
assert.strictEqual(mergeResult.converted, true);
assert.strictEqual(mergeResult.actionCompleted, true);
assert.deepStrictEqual(Array.from(mergeResult.selectedIndices), [0]);
assert.deepStrictEqual(Array.from(mergeResult.snapshot.comments, (comment) => comment.text), ["merged result"]);

const inlineMergeSource = createActionSource(9, {
  excerptText: "inline excerpt",
  comments: [
    { type: "TextNote", text: noteUrl(ids.linked) },
    { type: "TextNote", text: "tail" },
  ],
});
const inlineMergeResult = context.__MN_COMMENT_MUTATIONS__.mergeContentSelection(
  inlineMergeSource.noteId,
  { excerptSelected: true, commentIndices: [0] },
  "inline result",
  true,
  "inline",
);
assert.strictEqual(inlineMergeResult.converted, true);
assert.strictEqual(inlineMergeResult.actionCompleted, true);
assert.deepStrictEqual(
  Array.from(inlineMergeResult.snapshot.comments, (comment) => comment.text),
  ["inline result", "tail"],
);

const nonContinuousInlineSource = createActionSource(10, {
  excerptText: "inline excerpt",
  comments: [
    { type: "TextNote", text: "gap" },
    { type: "TextNote", text: noteUrl(ids.linked) },
  ],
});
assert.throws(
  () => context.__MN_COMMENT_MUTATIONS__.mergeContentSelection(
    nonContinuousInlineSource.noteId,
    { excerptSelected: true, commentIndices: [1] },
    "must not merge",
    true,
    "inline",
  ),
  /需要选择连续内容/,
);
assert.strictEqual(nonContinuousInlineSource.parentNote, parent, "failed preflight must not convert the source card");

const copySource = createActionSource(4, {
  excerptText: "copy excerpt",
  comments: [
    { type: "TextNote", text: "copy comment" },
    { type: "PaintNote", paint: "comment-image-hash" },
  ],
});
const copyTextResult = context.__MN_COMMENT_MUTATIONS__.copyContentText(
  copySource.noteId,
  { excerptSelected: true, commentIndices: [0, 1] },
);
assert.strictEqual(copiedTexts[copiedTexts.length - 1], "copy excerpt\n\ncopy comment");
assert.strictEqual(copyTextResult.copiedCount, 2);
assert.strictEqual(copyTextResult.skippedCount, 1);
assert.throws(
  () => context.__MN_COMMENT_MUTATIONS__.copyContentText(
    noExcerpt.noteId,
    { excerptSelected: true, commentIndices: [] },
  ),
  /已没有原生摘录/,
  "Native must reject a stale excerpt selection instead of silently skipping it",
);

const copyImageData = { id: "excerpt-image-data" };
const copyImageSource = createActionSource(5, {
  excerptType: "image",
  excerptPic: { paint: "excerpt-image-hash" },
  excerptPicData: copyImageData,
});
const copyImageResult = context.__MN_COMMENT_MUTATIONS__.copyContentImage(
  copyImageSource.noteId,
  { excerptSelected: true, commentIndices: [] },
);
assert.strictEqual(copyImageResult.copiedExcerpt, true);
assert.strictEqual(copiedImages[copiedImages.length - 1], copyImageData);

const extractSource = createActionSource(6, {
  excerptText: "extract excerpt",
  comments: [
    { type: "TextNote", text: "not selected" },
    { type: "TextNote", text: "selected comment" },
  ],
});
const extractResult = context.__MN_COMMENT_MUTATIONS__.extractContentSelectionToChildNote(
  extractSource.noteId,
  { excerptSelected: true, commentIndices: [1] },
  "Extracted",
  false,
);
const extractedChild = registry.get(extractResult.createdNoteId);
assert(extractedChild, "extraction child should exist");
assert.strictEqual(extractResult.converted, false);
assert.strictEqual(extractResult.snapshot.noteId, extractSource.noteId);
assert.strictEqual(extractedChild.excerptText, "extract excerpt");
assert.deepStrictEqual(
  extractedChild.comments.map((comment) => comment.text),
  ["selected comment"],
  "extraction must prune the cloned card by the original comment indices",
);
assert.strictEqual(extractedChild.parentNote, extractSource);

const mergedLocation = { documentMd5: "DOC-MD5", pageNo: 17, selection: [4, 9] };
const mergedExcerptSourceId = "ABABABAB-ABAB-ABAB-ABAB-ABABABABABAB";
const ordinaryMergedExcerptSource = createActionSource(12, {
  excerptType: "none",
  excerptText: "",
  comments: [
    {
      type: "LinkNote",
      noteid: mergedExcerptSourceId,
      q_hpic: { paint: "merged-image-hash", location: mergedLocation },
      q_htext: "merged image OCR",
    },
    { type: "TextNote", text: "not selected" },
  ],
});
const targetCountBeforeMergedExtraction = targetSequence;
const mergedExtractResult = context.__MN_COMMENT_MUTATIONS__.extractContentSelectionToChildNote(
  ordinaryMergedExcerptSource.noteId,
  { excerptSelected: false, commentIndices: [0] },
  "Merged excerpt with location",
  false,
);
const mergedExtractedChild = registry.get(mergedExtractResult.createdNoteId);
assert(mergedExtractedChild, "merged-excerpt extraction child should exist");
assert.strictEqual(targetSequence, targetCountBeforeMergedExtraction, "extraction must not create a blank merge target");
assert.strictEqual(mergedExtractedChild.parentNote, ordinaryMergedExcerptSource);
assert.strictEqual(mergedExtractedChild.comments.length, 1);
assert.strictEqual(mergedExtractedChild.comments[0].noteid, mergedExcerptSourceId);
assert.deepStrictEqual(mergedExtractedChild.comments[0].q_hpic.location, mergedLocation);
assert.strictEqual(mergedExtractedChild.comments[0].q_htext, "merged image OCR");

const extractRemoveSource = createActionSource(7, {
  excerptText: "remove excerpt",
  comments: [
    { type: "TextNote", text: "keep source" },
    { type: "TextNote", text: "remove source" },
  ],
});
const extractRemoveResult = context.__MN_COMMENT_MUTATIONS__.extractContentSelectionToChildNote(
  extractRemoveSource.noteId,
  { excerptSelected: true, commentIndices: [1] },
  "Extract and remove",
  true,
);
assert.strictEqual(extractRemoveResult.converted, true);
assert.strictEqual(extractRemoveResult.actionCompleted, true);
assert.notStrictEqual(extractRemoveResult.snapshot.noteId, extractRemoveSource.noteId);
assert.deepStrictEqual(
  Array.from(extractRemoveResult.snapshot.comments, (comment) => comment.text),
  ["keep source"],
  "remove-original extraction must delete the mapped excerpt and comment from the replacement source card",
);

const mappingFailureSource = createActionSource(11, {
  excerptText: "mapping excerpt",
  comments: [
    { type: "TextNote", text: "first mapping comment" },
    { type: "TextNote", text: "second mapping comment" },
  ],
});
targetMergeHook = (target) => {
  const firstComment = target.comments[1];
  target.comments[1] = target.comments[2];
  target.comments[2] = firstComment;
};
const mappingFailureResult = context.__MN_COMMENT_MUTATIONS__.moveContentSelection(
  mappingFailureSource.noteId,
  { excerptSelected: true, commentIndices: [0] },
  3,
);
targetMergeHook = null;
assert.strictEqual(mappingFailureResult.converted, true);
assert.strictEqual(mappingFailureResult.actionCompleted, false);
assert.deepStrictEqual(Array.from(mappingFailureResult.mappedIndices), []);
assert.match(mappingFailureResult.statusMessage, /后续操作已停止/);
assert.match(mappingFailureResult.error, /未保持在/);
assert.deepStrictEqual(
  Array.from(mappingFailureResult.snapshot.comments, (comment) => comment.text),
  ["mapping excerpt", "second mapping comment", "first mapping comment"],
  "mapping failure must return the converted snapshot without replaying the move",
);

const linkedText = linked.comments.map((comment) => String(comment.text || "")).join("\n");
assert(!linkedText.includes(noteUrl(ids.source)));
assert(linkedText.includes(noteUrl(imageTarget.noteId)));

const failingSource = addNoteMethods({
  noteId: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
  noteTitle: "Failing excerpt",
  excerptType: "image",
  excerptPic: { selLst: [] },
  parentNote: {
    noteId: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB",
    createChildNote() { throw new Error("create failed"); },
  },
});
const failureStats = context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes([
  failingSource,
  noExcerpt,
]);
assert.strictEqual(failureStats.failed, 1);
assert(hudMessages.some((message) => message.includes("失败 1 张")), "failed conversion must show a HUD");

assert(batchActionsSource.includes('"runBatchConvertToNoExcerpt:"'));
assert(addonSource.includes("runBatchConvertToNoExcerpt: async function"));
assert(dynamicActionsSource.includes('"runSingleConvertToNoExcerpt:"'));
assert(addonSource.includes("runSingleConvertToNoExcerpt: async function"));

console.log("batch no-excerpt conversion tests passed");
