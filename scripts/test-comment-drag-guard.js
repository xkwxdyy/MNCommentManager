const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sourceRoot = process.env.MNCM_DRAG_SOURCE_DIR || path.join(root, 'src');
function fixture() {
  let groups = 0, moves = 0, revision = '1', ignoreMove = false;
  const note = { noteId: 'n', comments: ['a', 'b', 'c'].map(text => ({ text })), refresh() {},
    moveComment(from, to) { moves++; if (!ignoreMove) this.comments.splice(to, 0, this.comments.splice(from, 1)[0]); revision = String(+revision + 1); } };
  const snapshot = () => ({ noteId: 'n', commentFold: { revision }, comments: note.comments.map((c, index) => ({ ...c, index, type: 'textComment', capabilities: { canMove: true } })) });
  const ctx = vm.createContext({ console, MNUtil: { refreshAfterDBChanged() {} },
    __MN_COMMENT_DATA__: { getWrappedNoteById: id => id === 'n' ? note : null, getNoteSnapshot: snapshot },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(_name, _options, fn) { groups++; return fn(); } } });
  for (const file of ['CommentModuleRules.js', 'CommentMutations.js', 'WebBridgeCommands.js']) vm.runInContext(fs.readFileSync(path.join(sourceRoot, file), 'utf8'), ctx, { filename: file });
  return { ctx, note, snapshot, guard: () => ({ expectedStructure: ctx.__MN_COMMENT_MODULE_RULES__.structureSignature(snapshot().comments), expectedRevision: revision }),
    counts: () => ({ groups, moves }), setRevision: value => { revision = value; }, ignore: () => { ignoreMove = true; } };
}
{
  const f = fixture(), payload = { noteId: 'n', indices: [0], targetIndex: 3, ...f.guard() };
  const commands = f.ctx.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
  // Exercise the registered bridge surface, not just the mutation helper.
  assert.equal(typeof commands.moveComments, 'function');
  const result = commands.moveComments({}, payload);
  assert.equal(result.comments.map(c => c.text).join(','), 'b,c,a');
  assert.equal(result.selectedIndices.join(','), '2'); assert.deepEqual(f.counts(), { groups: 1, moves: 1 });
  commands.moveComments({}, { noteId: 'n', indices: [2], targetIndex: 0, ...f.guard() });
  assert.equal(f.snapshot().comments.map(c => c.text).join(','), 'a,b,c');
}
for (const kind of ['content', 'order', 'revision', 'index', 'target']) {
  const f = fixture(), guard = f.guard(); let indices = [0], target = 3;
  if (kind === 'content') f.note.comments[1].text = 'changed';
  if (kind === 'order') f.note.comments.reverse();
  if (kind === 'revision') f.setRevision('2');
  if (kind === 'index') indices = [99];
  if (kind === 'target') target = -1;
  assert.throws(() => f.ctx.__MN_COMMENT_MUTATIONS__.moveComments('n', indices, target, guard));
  assert.deepEqual(f.counts(), { groups: 0, moves: 0 });
}
{
  const f = fixture(); f.ignore();
  assert.throws(() => f.ctx.__MN_COMMENT_MUTATIONS__.moveComments('n', [0], 3, f.guard()), /未能确认/);
}
{
  const f = fixture();
  f.ctx.__MN_COMMENT_MUTATIONS__.moveComments('n', [0], 3);
  assert.equal(f.snapshot().comments[2].text, 'a');
}
console.log('comment drag guard: bridge, stale order/content/revision, invalid indices, readback and legacy callers passed');
