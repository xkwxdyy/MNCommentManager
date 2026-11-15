const vm = require('node:vm'),fs = require('node:fs'),assert = require('node:assert/strict'),path = require('node:path');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../src'));
const ctx = vm.createContext({ console });vm.runInContext(fs.readFileSync(path.join(runtime, 'CommentRichFormat.js'),'utf8'),ctx);
const read = text => JSON.parse(JSON.stringify(ctx.__MN_COMMENT_RICH_FORMAT__.read(text)));
const header = String.raw`{\rtf1\ansi\ansicpg936\cocoartf2870
{\fonttbl\f0\fnil\fcharset134 PingFangSC-Regular;}
{\colortbl;\red255\green255\blue255;\red21\green75\blue79;\red221\green239\blue252;}
{\*\expandedcolortbl;;\cssrgb\c9020\c36471\c38431;\cssrgb\c89020\c94902\c99216;}
\pard\tx560\pardirnatural
\f0\fs32 \cf2 \cb3 `;
// Cocoa's font table has an ungrouped first entry.
const expected = {fontName:'PingFangSC-Regular',fontSize:16,textColor:'#175D62',backgroundColor:'#E3F2FD'};
const native = header + String.raw`\'b5\'ad\'c0\'b6}`;
assert.deepEqual(read(native),expected);
assert.deepEqual(read(header+'one\\line two}'),expected);
assert.deepEqual(read(header+'one\\\ntwo}'),expected, 'Cocoa emits backslash + newline for native multiline comments');
assert.throws(()=>read(header+'one {\\fs28 two}}'),/混合格式/);
for(const controls of ['\\ul ','\\ulwave ','\\brdrl ','\\li720 ','\\b ','\\i ','\\qc ','\\field '])assert.throws(()=>read(header+controls+'x}'));
assert.throws(()=>read(native.slice(0,-1)),/结构/);
assert.throws(()=>read('{\\rtf1'+'a'.repeat(512000)+'}'));
assert.throws(()=>read(header+'\\cf999 x}'),/颜色索引/);
assert.throws(()=>read(header+'\\cf-1 x}'),/颜色索引/);
ctx.MNUtil={dataToString:value=>value};
const body=text=>ctx.__MN_COMMENT_RICH_FORMAT__.bodyKey({type:'HtmlNote',rtf:text});
assert.equal(body(header+'one\\line two}'),body(header.replace('\\fs32','\\fs24')+'one\\\ntwo}'));
assert.equal(body(header+String.raw`\u945?}`),body(header+'α}'));
assert.equal(body(header+String.raw`\'61}`),body(header+'a}'));
assert.notEqual(body(header+'body}'),body(header+'body\\line }'));
assert.equal(body(native),body(native.replace('ansicpg936','ansicpg1252')), 'an explicit font charset determines its encoding');
assert.notEqual(body(native.replace('fcharset134','fcharset1')),body(native.replace('fcharset134','fcharset1').replace('ansicpg936','ansicpg1252')));
console.log('Native RTF format: color-space conversion, font, size, mixed/complex rejection and bounds passed');

// Native editors emit explicit neutral formatting and grayscale colors.
for (const controls of ['\\ul0 ', '\\ulnone ', '\\charscalex100 ', '\\b\\b0 ', '\\i\\i0 ']) {
  assert.deepEqual(read(header + controls + 'x}'), expected, controls);
}
const grayHeader = header.replace('\\cssrgb\\c9020\\c36471\\c38431', '\\csgray\\c25000');
assert.equal(read(grayHeader + 'x}').textColor, '#404040');
const unusedColor = header.replace('\\colortbl;', '\\colortbl;').replace('\\c89020\\c94902\\c99216;', '\\c89020\\c94902\\c99216;\\unsupportedcolorspace\\c99;');
assert.deepEqual(read(unusedColor + 'x}'), expected, 'unused color-table entries do not disable editing');

const helvetica = header.replace('PingFangSC-Regular', 'Helvetica-Bold');
assert.equal(read(helvetica + '\\b whole bold}').fontName, 'Helvetica-Bold');
const mixedFonts = header.replace('PingFangSC-Regular;', 'Helvetica;\\f1\\fswiss Helvetica-Bold;');
assert.throws(() => read(mixedFonts + 'plain {\\f1\\b bold} plain}'), /混合格式/);
assert.deepEqual(read(header + '{\\ul hidden}'.replace('hidden', '') + 'plain}'), expected, 'unsupported formatting without visible characters is harmless');
assert.throws(() => read(header + '\\charscalex80 x}'), /不支持保留/);
assert.throws(() => read(header + '\\ul0 x\\ul y}'), /不支持保留/);
console.log('Native editor neutral controls, used color spaces, uniform bold and mixed-format protection passed');

ctx.MNUtil.genNSURL = url => url;
const labels = {12:'windows-1252',2147484705:'gbk'};
ctx.NSString = {stringWithContentsOfURLEncoding(url, encoding) { return new TextDecoder(labels[encoding],{fatal:true}).decode(Buffer.from(url.split(',')[1],'base64')); }};
ctx.NSData = {dataWithStringEncoding(text, encoding) { return {base64Encoding() { return encoding === 2147484705 && ['淡蓝','丂'].includes(text) ? Buffer.from(text === '丂' ? [0x81,0x40] : [0xb5,0xad,0xc0,0xb6]).toString('base64') : Buffer.from(text,'latin1').toString('base64'); }}; }};
assert.equal(body(header + String.raw`\'b5\'ad\'c0\'b6}`), body(header + String.raw`\u28129?\u34013?}`), 'byte-encoded Chinese and Unicode compare by visible body');
assert.notEqual(body(header + String.raw`\'b5\'ad\'c0\'b6}`), body(header + '不同正文}'));
console.log('Native body verification normalizes lossless byte/Unicode encoding and preserves mismatch guards');

assert.notEqual(body(header.replace('fcharset134','fcharset2') + String.raw`\'80}`),body(header.replace('fcharset134','fcharset3') + String.raw`\'80}`), 'unknown byte encodings remain distinct');

assert.equal(body(header + String.raw`\'81@}`), body(header + String.raw`\u19970?}`), 'literal ASCII can complete a double-byte code point');
