import assert from 'node:assert/strict';
import { createStore, markdownToText, DEFAULT_STYLE } from './model.mjs';
assert.deepEqual(markdownToText('## 标题\n\n**加粗**与*强调*、`原文 $x$`。'), {
  supported: true,
  text: '标题\n\n加粗与强调、原文 $x$。',
  reason: '',
});
for (const text of [
  '![图](x.png)',
  '$x+y$',
  '$$x$$',
  '\\(x\\)',
  '<b>HTML</b>',
  '[链接](#target)',
  '|a|b|\n|-|-|\n|1|2|',
  '> 引用',
  '- [x] 任务',
  '- 一级\n  - 二级',
])
  assert.equal(markdownToText(text).supported, false, text);
assert.equal(markdownToText('- 甲\n- 乙').text, '• 甲\n• 乙');
assert.equal(markdownToText('A &amp; B').text, 'A & B');
const s = createStore();
const before = s.card.comments;
s.copy(0);
const copied = s.clipboard;
s.switchCard('demo-definition');
assert.deepEqual(s.clipboard, copied);
const original = s.card.comments;
const plan = s.pastePlan();
assert(plan.targets[0].eligible && plan.targets[1].eligible);
for (const i of [3, 4, 5, 6]) assert(!plan.targets[i].eligible);
s.paste(plan, [0, 1]);
assert.equal(s.card.comments[0].kind, 'html');
assert.equal(s.card.comments[0].text, '定义\n\n算子 T 将有界集映为相对紧集。');
assert.deepEqual(s.card.comments[0].style, DEFAULT_STYLE);
assert.deepEqual(s.card.comments.slice(2), original.slice(2));
assert.equal(s.card.comments[1].text, original[1].text);
s.undo();
assert.deepEqual(s.card.comments, original);
assert.deepEqual(s.clipboard, copied);
s.switchCard('demo-proof');
const draft = s.draft(0);
s.save(draft, '证明已修改', { ...draft.style, textColor: '#123ABC', backgroundColor: '#DCEEFF' });
assert.equal(s.card.comments[0].field, '证明');
assert.equal(s.card.comments[0].fieldLabel, true);
assert.equal(s.card.comments[0].text, '证明已修改');
s.undo();
assert.deepEqual(s.card.comments, before);
s.switchCard('demo-empty');
const add = s.draft();
s.save(add, '新增正文', add.style);
assert.equal(s.card.comments.length, 1);
s.switchCard('demo-proof');
s.switchCard('demo-empty');
assert(s.undoLabel);
s.undo();
assert.equal(s.card.comments.length, 0);
s.switchCard('demo-proof');
const stale = s.pastePlan();
s.remove([1]);
const now = s.card.comments;
assert.throws(() => s.paste(stale, [1]));
assert.deepEqual(s.card.comments, now);
s.undo();
const invalid = s.draft(0);
assert.throws(() => s.save(invalid, '正文', { ...invalid.style, textColor: '#XYZ' }));
assert.deepEqual(s.card.comments, before);
const protectedBefore = s.card.comments;
assert.throws(() => s.draft(4));
assert.deepEqual(s.card.comments, protectedBefore);
assert.throws(() => s.paste(s.pastePlan(), [5]));
assert.deepEqual(s.card.comments, protectedBefore);
const noOp = createStore();
const noOpDraft = noOp.draft(0),
  noOpBefore = noOp.card.comments;
assert.equal(noOp.save(noOpDraft, noOpDraft.text, noOpDraft.style), false);
assert.equal(noOp.undoLabel, '');
const cancelled = noOp.draft(0);
cancelled.text = '未保存草稿';
cancelled.style.textColor = '#123456';
assert.deepEqual(noOp.card.comments, noOpBefore);
noOp.copy(0);
const captured = noOp.clipboard;
const changedSource = noOp.draft(0);
noOp.save(changedSource, '已修改源正文', { ...changedSource.style, textColor: '#AABBCC' });
assert.deepEqual(noOp.clipboard, captured);
const wrongCard = noOp.draft(0);
noOp.switchCard('demo-definition');
assert.throws(() => noOp.save(wrongCard, '禁止写入', wrongCard.style));
noOp.editText(0, '**正文编辑**');
assert.equal(noOp.card.comments[0].kind, 'markdown');
noOp.undo();
assert.equal(noOp.card.comments[0].text, '## 定义\n\n算子 **T** 将有界集映为相对紧集。');
console.log(
  'Rich text prototype: cross-card format clipboard, Markdown conversion/protection, arbitrary RGB, metadata, create/edit, no-op/cancel safety, stale previews and full undo passed',
);
