const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(process.env.MNCM_MUTATIONS_SOURCE || path.join(__dirname, '../src/CommentMutations.js'), 'utf8');
function run(mode, batch = false, multiple = false) {
  const events = [];
  const original = { type: 'HtmlNote', text: '**[中文](https://example.test)**', html: '<b><a href="https://example.test">中文</a></b>' };
  if (mode === 'unsupported') original.html = '<p style="color:red">中文</p>';
  if (mode === 'missing-html') delete original.html;
  const other = { type: 'TextNote', text: 'keep me', markdown: false };
  const note = { noteId: 'N', notebookId: 'B', comments: [original, other],
    appendMarkdownComment(text) { events.push('append'); if (mode === 'append-throw') throw Error('append failed'); if (mode === 'append-silent' || (mode === 'partial' && events.filter(e => e === 'append').length === 2)) return; this.comments.push({ type: 'TextNote', text: mode === 'wrong-text' ? 'wrong' : text, markdown: mode !== 'plain' }); },
    moveComment(from, to) { events.push('move'); if (mode === 'move-throw') throw Error('move failed'); if (mode === 'move-silent') return; this.comments.splice(to, 0, this.comments.splice(from, 1)[0]); },
    removeCommentByIndex(index) { events.push('remove'); if (mode === 'remove-throw') throw Error('remove failed'); if (mode === 'remove-silent') return; this.comments.splice(index, 1); },
    refresh() { events.push('refresh'); }
  };
  if (multiple) note.comments.push({ type: 'HtmlNote', text: 'second HTML', html: '<i>second HTML</i>' });
  const snapshot = target => ({ noteId: target.noteId, comments: target.comments.map((c, index) => ({ index, originalType: c.type, type: c.type === 'HtmlNote' ? 'HtmlComment' : (c.markdown ? 'markdownComment' : 'textComment'), text: c.text, capabilities: { isHtml: c.type === 'HtmlNote', isMarkdown: c.markdown === true } })) });
  const context = vm.createContext({ console, MNUtil: { showHUD(text) { events.push('hud:' + text); }, refreshAfterDBChanged() { events.push('db-refresh'); } }, __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(_a, _o, fn) { return fn(); } }, __MN_COMMENT_DATA__: { getWrappedNoteById() { return note; }, getNoteSnapshot: snapshot } });
  vm.runInContext(fs.readFileSync(process.env.MNCM_HTML_SOURCE || path.join(__dirname, '../src/CommentHtmlConversion.js'), 'utf8'), context);
  vm.runInContext(source, context);
  const api = context.__MN_COMMENT_MUTATIONS__;
  const result = batch ? api.convertHtmlCommentsToMarkdownForNotes([note], {allowSingle: true}) : api.convertHtmlCommentsToMarkdown('N', multiple ? [0, 2] : [0]);
  return { note, original, other, events, result, stats: result.stats || result, api };
}
for (const mode of ['append-silent', 'append-throw', 'wrong-text', 'plain', 'move-silent', 'move-throw']) {
  const t = run(mode);
  assert(t.note.comments.includes(t.original), mode + ': original HTML must remain');
  assert(t.note.comments.includes(t.other), mode + ': unrelated comment must remain');
  assert(!t.events.includes('remove'), mode + ': no deletion before verification');
  assert.equal(t.stats.convertedComments, 0, mode);
  assert.equal(t.stats.failed, 1, mode);
  assert(t.result.statusMessage.includes('失败'), mode + ': UI must report failure');
}
for (const mode of ['unsupported', 'missing-html']) {
  const t = run(mode); assert(t.note.comments.includes(t.original));
  assert(!t.events.includes('append')); assert.equal(t.stats.failed, 1);
  assert(t.stats.errors[0].message.includes('已保留原 HTML'));
}
const good = run('ok');
assert.deepEqual(good.note.comments.map(c => c.text), ['**[中文](<https://example.test>)**', 'keep me']);
assert.equal(good.note.comments[0].markdown, true);
assert.equal(good.stats.convertedComments, 1);
assert.equal(good.stats.failed, 0);
assert(good.events.indexOf('remove') > good.events.indexOf('move'));
const repeated = good.api.convertHtmlCommentsToMarkdownForNotes([good.note], {allowSingle: true});
assert.equal(repeated.convertedComments, 0);
const deletion = run('remove-silent');
assert.equal(deletion.stats.convertedComments, 0);
assert.equal(deletion.stats.failed, 1);
assert(deletion.note.comments.includes(deletion.original));
const batch = run('move-silent', true);
assert.equal(batch.stats.failed, 1);
assert(batch.note.comments.includes(batch.original));
assert(batch.events.some(e => e.startsWith('hud:') && e.includes('失败')));
const stopped = run('move-silent', false, true);
assert.equal(stopped.events.filter(e => e === 'append').length, 1, 'stop this card after uncertain order');
assert(stopped.note.comments.includes(stopped.original));
const partial = run('partial', false, true);
assert.equal(partial.stats.convertedComments, 1);
assert.equal(partial.stats.failed, 1);
assert(partial.note.comments.includes(partial.original));
assert(partial.note.comments.includes(partial.other));
assert.equal(partial.note.comments[2].text, '_second HTML_');
assert.equal(run('remove-throw').stats.failed, 1);
console.log('HTML conversion integrity: verified append/move/delete, failure preservation, status and repeated calls passed');
