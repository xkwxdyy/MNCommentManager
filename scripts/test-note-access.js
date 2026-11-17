'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../src'));
const notes = new Map(), calls = [];
const source = { noteId: 'SOURCE', noteTitle: '', comments: [], excerptText: 'excerpt', colorIndex: 15 };
const parent = { noteId: 'PARENT', childNotes: [source] };
source.parentNote = parent; notes.set(source.noteId, source); notes.set(parent.noteId, parent);
const controller = { notebookId: 'BOOK', view: { hidden: false }, focusNote: source, mindmapView: { selViewLst: [] } };
const utility = { notebookController: controller, currentNotebook: { flags: 0 }, docMapSplitModeName: 'allMap',
  currentDocController: {}, docControllers: [], getMediaByHash() {}, focusHistory: [] };
const factory = {
  new(input) { calls.push(input); assert.equal(typeof input, 'string', 'reads cannot pass creation configs'); return notes.get(input); },
  getFocusNote() { assert.fail('legacy focus helper must not be called'); },
  getFocusNotes() { assert.fail('legacy selection helper must not be called'); },
};
const originalFactoryMethods = { ...factory };
const c = vm.createContext({ console, MNUtil: utility, MNNote: factory,
  __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon: { read: () => ({supported: false, comments: []}) } });
vm.runInContext(fs.readFileSync(path.join(runtime, 'NoteAccess.js'), 'utf8'), c);
vm.runInContext(fs.readFileSync(path.join(runtime, 'CommentData.js'), 'utf8'), c);
const a = c.__MN_NOTE_ACCESS_MNCommentManagerAddon, data = c.__MN_COMMENT_DATA__;
assert.equal(data.getCurrentNoteSnapshot().noteId, 'SOURCE');
assert.equal(data.getNoteSnapshot(source).excerpt.conversion.eligible, true);
assert.strictEqual(a.parent(source), parent);
assert.equal(a.siblingIndex(source), 0);
assert.deepEqual(Array.from(a.children(parent), n => n.noteId), ['SOURCE']);
for (const invalid of [undefined, null, '', { excerptText: '', colorIndex: 15 }, { noteId: '', excerptText: '', colorIndex: 15 }]) {
  const before = calls.length;
  controller.focusNote = invalid;
  const snapshot = data.getCurrentNoteSnapshot();
  assert.equal(snapshot.noteId, '');
  const wrapped = { note: { ...source, parentNote: invalid } };
  Object.defineProperty(wrapped, 'parentNote', { get() { assert.fail('unsafe wrapper parent getter must not be read'); } });
  assert.equal(data.getExcerptState(wrapped).conversion.eligible, false);
  assert.equal(a.byId(invalid), null);
  assert.equal(calls.length, before);
}
for (const alias of ['current', 'currentNote', 'focused', 'focusedNote', 'focuseNote', 'active', 'activeNote']) assert.equal(a.byId(alias), null);
controller.focusNote = source;
controller.mindmapView.selViewLst = [{ note: { note: source } }, { note: { note: { noteId: undefined, excerptText: '' } } }];
assert.equal(a.selected().length, 2, 'incomplete selection entries cannot be filtered into a valid single action');
assert.equal(a.selected()[1].noteId, undefined);
controller.mindmapView.selViewLst = [];
utility.floatMindmapView = { selViewLst: [{ note: { note: parent } }] };
assert.equal(a.selected()[0].noteId, 'PARENT');
utility.floatMindmapView = { selViewLst: { count: 1, objectAtIndex: () => ({ note: { note: parent } }) } };
assert.equal(a.selected()[0].noteId, 'PARENT', 'native numeric count is supported');
utility.floatMindmapView = { selViewLst: { count: () => 1, objectAtIndex: () => ({ note: { note: parent } }) } };
assert.equal(a.selected()[0].noteId, 'PARENT', 'native count accessor is supported');
utility.floatMindmapView = null;
utility.currentNotebook.flags = 1; utility.currentDocController.focusNote = source;
assert.equal(a.current().noteId, 'SOURCE');
assert.equal(a.selected()[0].noteId, 'SOURCE');
utility.currentNotebook.flags = 0; delete controller.focusNote;
utility.focusHistory = [{ type: 'note', noteId: 'SOURCE' }];
assert.equal(a.current().noteId, 'SOURCE');
utility.focusHistory = [{ type: 'text', text: 'selection' }];
assert.equal(a.current(), null);
parent.childNotes.push({ excerptText: '' });
assert.throws(() => a.children(parent), /标识尚未就绪/, 'mutation preflights reject incomplete child lists');
for (const [name, method] of Object.entries(originalFactoryMethods)) assert.equal(c.MNNote[name], method, name + " must not be patched globally");
assert.equal(utility, c.MNUtil);
assert(calls.every(input => typeof input === 'string'));
console.log('Local note access: legacy-helper avoidance, string-only lookup, native focus/selection/history, structure guards and unchanged globals passed');
