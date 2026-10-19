const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = process.argv[2] || path.join(__dirname, '../src');
const A = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const B = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const C = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';
const live = new Map(), cache = new Map();
const raw = (noteId, groupNoteId = '', text = noteId) => ({ noteId, groupNoteId, text });
const read = id => {
  if (!cache.has(id) && live.has(id)) cache.set(id, {
    note: live.get(id), get noteId() { return this.note.noteId; },
  });
  return cache.get(id);
};
const context = vm.createContext({
  Database: { sharedInstance: () => ({ getNoteById: id => live.get(id) }) },
  __MN_COMMENT_DATA__: { getWrappedNoteById: read, getNoteSnapshot: note => ({ noteId: note.noteId, text: note.note.text }) },
});
vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'ExternalCardEditor.js'), 'utf8'), context);
const api = context.__MN_CARD_EDITOR_MNCommentManagerAddon;
const controller = { externalCardEditorSession: { noteId: A } };
api.register({ webController: controller });
live.set(A, raw(A, B)); live.set(B, raw(B, '', 'converted'));
api.replaceTarget(A, B);
assert.equal(api.getSnapshot(controller).text, 'converted');
live.set(A, raw(A, '', 'undo')); live.delete(B);
assert(cache.has(B), 'a removed Native object may remain in the MNNote wrapper cache');
assert.equal(api.getSnapshot(controller).noteId, A);
assert.equal(api.getSnapshot(controller).text, 'undo');
live.set(A, raw(A, B)); live.set(B, raw(B, '', 'redo-fresh-object'));
assert.equal(api.getSnapshot(controller).text, 'redo-fresh-object', 'redo must refresh the cached Native backing object');
live.set(A, raw(A, '', 'undo-again')); live.delete(B);
assert.equal(api.getSnapshot(controller).noteId, A);
live.set(A, raw(A, C)); live.set(C, raw(C, '', 'new-branch'));
api.replaceTarget(A, C);
assert.equal(api.getSnapshot(controller).text, 'new-branch');
assert.throws(() => api.validateCommand(controller, 'editCommentText', { noteId: B }), error => error.code === 'TARGET_CHANGED');
live.set(A, raw(A, B)); live.set(B, raw(B, C));
assert.equal(api.getSnapshot(controller).noteId, C, 'known chained replacements must resolve');
live.set(C, raw(C, A));
assert.throws(() => api.getSnapshot(controller), error => error.code === 'TARGET_UNAVAILABLE', 'cycles must fail closed');
live.set(A, raw(A, 'unrelated'));
assert.throws(() => api.getSnapshot(controller), error => error.code === 'TARGET_UNAVAILABLE', 'unrecorded merges must not redirect editing');
live.delete(A);
assert.throws(() => api.getSnapshot(controller), error => error.code === 'TARGET_UNAVAILABLE', 'a cached source must not revive a deleted Native card');
api.clear(controller);
assert.equal(controller.externalCardEditorSession, null);
console.log('PASS Native undo/redo cache refresh, re-conversion, chains, cycles and deleted-source protection');
