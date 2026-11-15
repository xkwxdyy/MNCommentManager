const vm = require('node:vm'),fs = require('node:fs'),assert = require('node:assert/strict'),path = require('node:path');
const ctx = vm.createContext({ console });vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/CommentRichFormat.js'),'utf8'),ctx);
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
assert.notEqual(body(native),body(native.replace('ansicpg936','ansicpg1252')));
console.log('Native RTF format: color-space conversion, font, size, mixed/complex rejection and bounds passed');
