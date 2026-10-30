const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const previewSource = fs.readFileSync(path.join(rootDir, "src/HandwritingPreview.js"), "utf8");
const commentDataSource = fs.readFileSync(path.join(rootDir, "src/CommentData.js"), "utf8");
const appSource = fs.readFileSync(path.join(rootDir, "web/src/App.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(rootDir, "web/src/styles.css"), "utf8");
const panelSource = fs.readFileSync(path.join(rootDir, "src/WebPanelController.js"), "utf8");

const { drawing } = require("./fixtures/handwriting.js");
function createInkArchive() { return drawing().toString("base64"); }

const drawingBase64 = createInkArchive();
const mediaByHash = {
  drawing: { base64Encoding: () => drawingBase64 },
  previewOnlyDrawing: { base64Encoding: () => drawing({ marker: 99 }).toString("base64") },
  invalidDrawing: { base64Encoding: () => "bm90LWFuLWluay1hcmNoaXZl" },
  paint: { base64Encoding: () => "cGFpbnQ=" },
};
let delayedDrawingReads = 0;
const context = vm.createContext({
  console,
  Uint8Array,
  DataView,
  ArrayBuffer,
  Map,
  Set,
  Promise,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  MNUtil: {
    getMediaByHash(hash) {
      if (hash === "delayedDrawing") {
        delayedDrawingReads += 1;
        return delayedDrawingReads > 1 ? mediaByHash.drawing : null;
      }
      return mediaByHash[hash] || null;
    },
  },
  MNNote: {
    getFocusNote() {
      return null;
    },
    new() {
      return null;
    },
  },
  MNComment: {
    getCommentType() {
      return "";
    },
  },
});

vm.runInContext(fs.readFileSync(path.join(rootDir, "src/HandwritingDecoder.js"), "utf8"), context);
vm.runInContext(previewSource, context, { filename: "HandwritingPreview.js" });
vm.runInContext(fs.readFileSync(path.join(rootDir, "src/CommentFoldState.js"), "utf8"), context);
vm.runInContext(commentDataSource, context, { filename: "CommentData.js" });

const rendered = context.__MN_HANDWRITING_PREVIEW_MNCommentManagerAddon.renderMediaDataURI("drawing");
const svg = Buffer.from(rendered.dataURI.split(",")[1], "base64").toString("utf8");
assert.match(rendered.dataURI, /^data:image\/svg\+xml;base64,/);
assert.match(svg, /d="M 11\.00 22\.00 L 13\.00 24\.00"/);
assert.match(svg, /fill="white"/);
assert.match(svg, /stroke="#ff0000"/);
assert.strictEqual(rendered.approximate, true);
assert.strictEqual(rendered.previewOnly, false);
assert.strictEqual(
  context.__MN_HANDWRITING_PREVIEW_MNCommentManagerAddon.renderMediaDataURI("drawing"),
  rendered,
  "drawing previews must be cached by media hash",
);

const snapshot = context.__MN_COMMENT_DATA__.getNoteSnapshot({
  noteId: "11111111-1111-1111-1111-111111111111",
  noteTitle: "Handwriting",
  MNComments: [],
  comments: [
    { type: "PaintNote", drawing: "drawing" },
    { type: "PaintNote", paint: "paint", drawing: "drawing" },
    { type: "LinkNote", q_hpic: { paint: "paint", drawing: "drawing" } },
    { type: "PaintNote", drawing: "invalidDrawing" },
    { type: "PaintNote", drawing: "delayedDrawing" },
  ],
});

assert.strictEqual(snapshot.comments[0].type, "drawingComment");
assert.match(snapshot.comments[0].drawingPreviewDataURI, /^data:image\/svg\+xml;base64,/);
assert.strictEqual(snapshot.comments[0].imageBase64, "");
assert.strictEqual(snapshot.comments[0].capabilities.hasImage, true);
assert.strictEqual(snapshot.comments[0].capabilities.canCopyImage, false);

assert.strictEqual(snapshot.comments[1].type, "imageCommentWithDrawing");
assert.strictEqual(snapshot.comments[1].imageBase64, "cGFpbnQ=");
assert.match(snapshot.comments[1].drawingPreviewDataURI, /^data:image\/svg\+xml;base64,/);

assert.strictEqual(snapshot.comments[2].type, "mergedImageCommentWithDrawing");
assert.strictEqual(snapshot.comments[2].imageBase64, "cGFpbnQ=");
assert.match(snapshot.comments[2].drawingPreviewDataURI, /^data:image\/svg\+xml;base64,/);

assert.strictEqual(snapshot.comments[3].drawingPreviewDataURI, "");
assert.match(snapshot.comments[3].drawingPreviewError, /无法识别|不完整/);
assert.strictEqual(snapshot.comments[3].drawingPreviewPending, false);
assert.strictEqual(snapshot.comments[4].drawingPreviewPending, true);
assert.strictEqual(snapshot.handwritingPendingCount, 1);

const restrictedSnapshot = context.__MN_COMMENT_DATA__.getNoteSnapshot({
  noteId: "11111111-1111-1111-1111-111111111111",
  noteTitle: "Restricted preview",
  MNComments: [],
  comments: [{ type: "PaintNote", drawing: "previewOnlyDrawing" }],
});
assert.strictEqual(restrictedSnapshot.comments[0].drawingPreviewOnly, true);
assert.strictEqual(restrictedSnapshot.comments[0].drawingPreviewApproximate, true);
assert.strictEqual(restrictedSnapshot.comments[0].drawingPreviewDiagnostics[0].code, "unverified-path-marker");
assert.match(restrictedSnapshot.comments[0].drawingPreviewDataURI, /^data:image\/svg\+xml;base64,/);
assert.match(appSource, /comment\.drawingPreviewOnly && comment\.drawingPreviewDataURI/);

const refreshedSnapshot = context.__MN_COMMENT_DATA__.getNoteSnapshot({
  noteId: "11111111-1111-1111-1111-111111111111",
  noteTitle: "Handwriting",
  MNComments: [],
  comments: [{ type: "PaintNote", drawing: "delayedDrawing" }],
});
assert.match(refreshedSnapshot.comments[0].drawingPreviewDataURI, /^data:image\/svg\+xml;base64,/);
assert.strictEqual(refreshedSnapshot.comments[0].drawingPreviewPending, false);
assert.strictEqual(refreshedSnapshot.handwritingPendingCount, 0);

assert.match(appSource, /function getCommentMediaSources/);
assert.match(appSource, /drawingPreviewDataURI/);
assert.match(appSource, /手写内容正在转换，完成后将自动刷新/);
assert.match(appSource, /comment-media-previews/);
assert.match(cssSource, /\.comment-media-previews/);
assert.match(panelSource, /coordinateHandwritingPreviewRefresh/);
assert.match(panelSource, /handwriting-preview-retry/);
assert.match(panelSource, /手写内容转换完成，当前页面已自动刷新/);

const retrySourceStart = panelSource.indexOf("  const HANDWRITING_RETRY_INTERVAL");
const retrySourceEnd = panelSource.indexOf("  function encodeBridgeJSON", retrySourceStart);
assert.notStrictEqual(retrySourceStart, -1);
assert.notStrictEqual(retrySourceEnd, -1);
const retryTimers = [];
const retryHUD = [];
const retryPushes = [];
const retryContext = vm.createContext({
  Application: { sharedInstance() { return { showHUD() {} }; } },
  MNUtil: { showHUD(message) { retryHUD.push(String(message)); } },
  NSTimer: {
    scheduledTimerWithTimeInterval(seconds, repeats, callback) {
      retryTimers.push({ seconds, repeats, callback });
    },
  },
  pushCurrentNoteSnapshot(controller, reason) {
    retryPushes.push({ controller, reason });
  },
});
vm.runInContext(
  `${panelSource.slice(retrySourceStart, retrySourceEnd)}\nthis.coordinateRetry = coordinateHandwritingPreviewRefresh;`,
  retryContext,
);
const retryController = { view: {} };
retryContext.coordinateRetry(retryController, {
  noteId: "NOTE-1",
  handwritingPendingCount: 1,
  comments: [],
});
assert.deepStrictEqual(retryHUD, ["手写内容正在转换，请稍候"]);
assert.strictEqual(retryTimers.length, 1);
assert.strictEqual(retryTimers[0].seconds, 1);
retryTimers[0].callback();
assert.strictEqual(retryPushes.length, 1);
assert.strictEqual(retryPushes[0].reason, "handwriting-preview-retry");
retryContext.coordinateRetry(retryController, {
  noteId: "NOTE-1",
  handwritingPendingCount: 0,
  comments: [],
});
assert.strictEqual(retryController._handwritingPreviewRetry, null);
assert.strictEqual(retryHUD[1], "手写内容转换完成，当前页面已自动刷新");
retryContext.coordinateRetry(retryController, {
  noteId: "NOTE-1",
  handwritingPendingCount: 1,
  comments: [],
});
const staleRetryTimer = retryTimers[1];
retryContext.coordinateRetry(retryController, {
  noteId: "NOTE-2",
  handwritingPendingCount: 0,
  comments: [],
});
staleRetryTimer.callback();
assert.strictEqual(retryPushes.length, 1, "switching cards must cancel the previous handwriting retry");

console.log("handwriting preview regression ok");
