'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { drawing, field } = require('./fixtures/handwriting.js');
const archives = require('./fixtures/handwriting-archives.json');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ Uint8Array, DataView, Map, console });
vm.runInContext(fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "src/HandwritingDecoder.js"), 'utf8'), context);
const decoder = context["__MN_HANDWRITING_DECODER_MNCommentManagerAddon"];
let assertions = 0;
function equal(actual, expected) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))); assertions += 1; }
function rejects(callback, code) { assert.throws(callback, error => error.code === code); assertions += 1; }
function decode(options) { return decoder.decode(drawing(options)); }
const basic = decode();
equal(basic.strokes[0], { color: '#ff0000', opacity: 0.5, points: [{ x: 11, y: 22, width: 3 }, { x: 13, y: 24, width: 3 }] });
equal([basic.approximate, basic.previewOnly, basic.pointCount], [true, false, 2]);
for (const flags of [1, 3, 7, 39, 231]) {
  const value = decode({ flags });
  equal(value.strokes[0].points.map(point => [point.x, point.y, point.width]), [[11, 22, 3], [13, 24, 3]]);
}
equal(decode({ flags: 39, commonLength: 20 }).strokes[0].points[0], { x: 11, y: 22, width: 3 });
equal(decode({ flags: 7, commonLength: 16 }).strokes[0].points[1].width, 3);
equal(decode({ flags: 3, commonWidth: 8 }).strokes[0].points[0].width, 8);
equal(decode({ transform: [2, 0, 0, 2, 10, 20] }).strokes[0].points[1], { x: 16, y: 28, width: 6 });
const variable = decode({ points: [[1, 2, 2], [3, 4, 6]] });
const variableSVG = decoder.render(variable, 'preview').svg;
assert.match(variableSVG, /r="1\.00"/); assert.match(variableSVG, /r="3\.00"/); assertions += 2;
const preview = decoder.render(basic, 'preview');
assert.match(preview.svg, /stroke="#ff0000"/); assert.match(preview.svg, /<g opacity="0\.5">/); assertions += 2;
assert.match(decoder.render(basic, 'ocr').svg, /stroke="#1d1d1f"/); assertions += 1;
assert.doesNotMatch(decoder.render(basic, 'ocr').svg, /#ff0000/); assertions += 1;
const marked = decode({ marker: 99 });
equal(marked.previewOnly, true); equal(marked.diagnostics.map(entry => entry.code), ['unverified-path-marker']);
assert.match(decoder.render(marked, 'preview').svg, /<svg/); assertions += 1;
rejects(() => decoder.render(marked, 'ocr'), 'drawing-preview-only');
rejects(() => decoder.render(marked, 'export'), 'drawing-preview-only');
rejects(() => decoder.render(basic, 'unexpected'), 'invalid-render-purpose');
assert.match(decoder.render(decode({ rgba: [0, 0, 1, 0.001] }), 'preview').svg, /opacity="0\.001/); assertions += 1;
equal(decode({ transform: [2, 0, 0, 1, 0, 0] }).previewOnly, true);
rejects(() => decode({ version: 1 }), 'unsupported-drawing-version');
rejects(() => decode({ flags: 15 }), 'unsupported-point-layout');
rejects(() => decode({ flags: 7, commonLength: 19 }), 'unsupported-point-layout');
rejects(() => decode({ brush: 'com.apple.ink.pencil' }), 'unsupported-brush');
rejects(() => decode({ rootFields: [field(99, 0, 1)] }), 'unsupported-drawing-field');
rejects(() => decode({ pathFields: [field(20, 2, Buffer.from([1]))] }), 'unsupported-drawing-field');
rejects(() => decode({ points: [[1, 2, NaN]] }), 'invalid-point');
rejects(() => decode({ declaredPoints: 100001 }), 'invalid-point-count');
rejects(() => decode({ inkIndex: 2 }), 'invalid-ink-reference');
rejects(() => decoder.decode(drawing().subarray(0, drawing().length - 1)), 'truncated-drawing');
rejects(() => decoder.decode(Buffer.from('wrd\0\0\0')), 'invalid-field-number');
for (const value of ['%%%', 'Zh==', 'Zg=', 'Zg===', 'Z']) rejects(() => decoder.decodeBase64(value), 'invalid-base64');
equal(Array.from(decoder.decodeBase64('Zg==')), [102]); equal(Array.from(decoder.decodeBase64('Zg')), [102]);
for (const name of ['direct', 'keyed', 'onlyDrawing2']) {
  const archived = decoder.decode(Buffer.from(archives[name], 'base64'));
  equal(archived.strokes, basic.strokes);
  equal(archived.archive.verifiedAlternative, name === 'onlyDrawing2' ? '' : 'drawing2');
}
rejects(() => decoder.decode(Buffer.from(archives.mismatch, 'base64')), 'archive-variants-mismatch');
rejects(() => decoder.decode(Buffer.from(archives.markerMismatch, 'base64')), 'archive-variants-mismatch');
rejects(() => decoder.decode(Buffer.from(archives.unknownKey, 'base64')), 'unsupported-archive-dictionary');
const badOffset = Buffer.from(archives.direct, 'base64'); badOffset[badOffset.length - 1] = 255;
assert.throws(() => decoder.decode(badOffset), /归档/); assertions += 1;
// Every truncation of the baseline must fail rather than produce partial ink.
for (let end = 0; end < drawing().length; end += 1) {
  assert.throws(() => decoder.decode(drawing().subarray(0, end))); assertions += 1;
}
rejects(() => decode({ points: [[Infinity, 0, 3]] }), 'invalid-point');
rejects(() => decode({ points: [[1, 2, -1]] }), 'invalid-point');
rejects(() => decode({ rootFields: [field(30, 0, 0)] }), 'invalid-drawing-field');
const invisible = decode({ rgba: [1, 0, 0, 0] });
rejects(() => decoder.render(invisible, 'preview'), 'no-visible-strokes');
console.log(`handwriting decoder regression ok (${assertions} checks; synthetic fixtures)`);
