const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const previewSource = fs.readFileSync(path.join(rootDir, "src/HandwritingPreview.js"), "utf8");
const commentDataSource = fs.readFileSync(path.join(rootDir, "src/CommentData.js"), "utf8");
const appSource = fs.readFileSync(path.join(rootDir, "web/src/App.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(rootDir, "web/src/styles.css"), "utf8");

function encodeVarint(value) {
  const bytes = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current = Math.floor(current / 128);
    if (current > 0) byte |= 0x80;
    bytes.push(byte);
  } while (current > 0);
  return Buffer.from(bytes);
}

function bytesField(number, payload) {
  return Buffer.concat([encodeVarint(number * 8 + 2), encodeVarint(payload.length), payload]);
}

function varintField(number, value) {
  return Buffer.concat([encodeVarint(number * 8), encodeVarint(value)]);
}

function floatField(number, value) {
  const payload = Buffer.alloc(4);
  payload.writeFloatLE(value);
  return Buffer.concat([encodeVarint(number * 8 + 5), payload]);
}

function doubleField(number, value) {
  const payload = Buffer.alloc(8);
  payload.writeDoubleLE(value);
  return Buffer.concat([encodeVarint(number * 8 + 1), payload]);
}

function createInkArchive() {
  const pointStride = 48;
  const pointData = Buffer.alloc(pointStride * 2);
  pointData.writeFloatLE(1, 0);
  pointData.writeFloatLE(2, 4);
  pointData.writeFloatLE(0, 8);
  pointData.writeFloatLE(3, pointStride);
  pointData.writeFloatLE(4, pointStride + 4);
  pointData.writeFloatLE(0.5, pointStride + 8);
  const strokeData = Buffer.concat([varintField(3, 2), bytesField(7, pointData)]);
  const transform = Buffer.concat([floatField(5, 10), floatField(6, 20)]);
  const stroke = Buffer.concat([bytesField(5, strokeData), bytesField(7, transform)]);
  const metadata = doubleField(8, 3);
  const protobuf = Buffer.concat([bytesField(4, metadata), bytesField(5, stroke)]);
  return Buffer.concat([Buffer.from([119, 114, 100, 0, 0, 0]), protobuf]).toString("base64");
}

const drawingBase64 = createInkArchive();
const mediaByHash = {
  drawing: { base64Encoding: () => drawingBase64 },
  invalidDrawing: { base64Encoding: () => "bm90LWFuLWluay1hcmNoaXZl" },
  paint: { base64Encoding: () => "cGFpbnQ=" },
};
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

vm.runInContext(previewSource, context, { filename: "HandwritingPreview.js" });
vm.runInContext(commentDataSource, context, { filename: "CommentData.js" });

const rendered = context.__MN_HANDWRITING_PREVIEW_MNCommentManagerAddon.renderMediaDataURI("drawing");
const svg = Buffer.from(rendered.dataURI.split(",")[1], "base64").toString("utf8");
assert.match(rendered.dataURI, /^data:image\/svg\+xml;base64,/);
assert.match(svg, /d="M 11\.00 22\.00 L 13\.00 24\.00"/);
assert.match(svg, /fill="white"/);
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

assert.match(appSource, /function getCommentMediaSources/);
assert.match(appSource, /drawingPreviewDataURI/);
assert.match(appSource, /comment-media-previews/);
assert.match(cssSource, /\.comment-media-previews/);

console.log("handwriting preview regression ok");
