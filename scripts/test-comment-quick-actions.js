const assert = require('node:assert/strict');
process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY = '1';
const { setup } = require('./test-comment-move-integration');
delete process.env.MNCM_QUICK_ACTION_FIXTURE_ONLY;
function fixture(options = {}) {
  const s = setup({ count: 3, foldRevision: true, foldable: true, ...options });
  const calls = [];
  s.context.MNUtil.getPopoverAndPresent = (anchor, items) => ({ anchor, items, dismissPopoverAnimated() {} });
  s.context.MNUtil.confirm = async () => true;
  s.context.__MN_COMMENT_MUTATIONS__.extractCommentsToChildNote = (id, indices, title, moving) => {
    calls.push({ id, indices: Array.from(indices), moving });
    if (moving) s.notes[id].comments = s.notes[id].comments.filter((_, index) => !indices.includes(index));
    return { createdNoteId: 'child', actionCompleted: true };
  };
  s.context.__MN_COMMENT_MUTATIONS__.deleteComments = (id, indices) => { calls.push({ id, deleting: Array.from(indices) }); s.notes[id].comments = s.notes[id].comments.filter((_, index) => !indices.includes(index)); };
  for (const index of options.initialCollapsed || []) s.notes.one.comments[index].collapsed = true;
  s.open();
  s.toggle = () => s.addon.toggleQuickCommentSelection(s.state().views.multi || s.state().views.pickerMulti);
  s.menu = () => { s.addon.openQuickCommentActions(s.state().views.actions || s.state().views.pickerActions); return s.state().quickMenuItems; };
  s.item = action => { const item = s.menu().find(item => item.param.action === action); assert.ok(item, action); return item; };
  s.run = item => s.addon.runQuickCommentAction({ param: item.param });
  return { ...s, calls };
}
const cases = [];
async function test(name, fn) { await fn(); cases.push(name); }
(async () => {
  await test('native selector bindings expose independent selection and add routes', () => {
    const s = fixture(); assert.equal(s.state().views.multi.events[0].selector, 'toggleQuickCommentSelection:');
    assert.equal(s.state().views.add.events[0].selector, 'addQuickCommentFromRail:');
    s.toggle(); assert.equal(s.state().views.actions.hidden, true); s.choose(0); s.choose(2);
    assert.deepEqual(Array.from(s.state().selectedIndices), [0, 2]); assert.equal(s.state().views.actions.hidden, false);
    const before = s.order(); s.drag(1); assert.deepEqual(s.order(), before); assert.equal(s.nativeMoves.length, 0);
  });
  await test('mixed native fold state produces both actions and preserves selection', async () => {
    const s = fixture({ initialCollapsed: [2] }); s.toggle(); s.choose(0); s.choose(2);
    const items = s.menu(); assert(items.some(i => i.param.action === 'fold')); assert(items.some(i => i.param.action === 'expand'));
    await s.run(items.find(i => i.param.action === 'fold'));
    assert.deepEqual(s.notes.one.comments.map(c => !!c.collapsed), [true, false, true]);
    assert.equal(s.state().selecting, true); assert.deepEqual(Array.from(s.state().selectedIndices), [0, 2]);
  });
  await test('copy and move use exact selected indices; completion closes old UI', async () => {
    for (const action of ['copy', 'extract']) {
      const s = fixture(); s.toggle(); s.choose(1); await s.run(s.item(action));
      assert.deepEqual(s.calls, [{ id: 'one', indices: [1], moving: action === 'extract' }]);
      assert.equal(s.notes.one.comments.length, action === 'extract' ? 2 : 3); assert.equal(s.state(), null);
    }
  });
  await test('cancelling confirmation preserves content and selection', async () => {
    const s = fixture(); s.toggle(); s.choose(1); s.context.MNUtil.confirm = async () => false;
    await s.run(s.item('extract')); assert.equal(s.calls.length, 0); assert.deepEqual(s.order(), ['A','B','C']);
    assert.deepEqual(Array.from(s.state().selectedIndices), [1]); assert.equal(s.state().mutationPending, false);
  });
  await test('same-count reorder during confirmation refuses all writes and refreshes selection', async () => {
    const s = fixture(); s.toggle(); s.choose(1); let finish;
    s.context.MNUtil.confirm = () => new Promise(resolve => { finish = resolve; });
    const result = s.run(s.item('extract'));
    [s.notes.one.comments[0], s.notes.one.comments[1]] = [s.notes.one.comments[1], s.notes.one.comments[0]];
    finish(true); assert.equal(await result, false); assert.equal(s.calls.length, 0);
    assert.deepEqual(Array.from(s.state().selectedIndices), []); assert.ok(s.state().views.picker);
  });
  await test('switching card and replaying an old action never writes to the new card', async () => {
    const s = fixture(); s.toggle(); s.choose(1); let finish;
    s.context.MNUtil.confirm = () => new Promise(resolve => { finish = resolve; });
    const result = s.run(s.item('delete')); s.selectCard('two'); finish(true);
    assert.equal(await result, false); assert.equal(s.calls.length, 0); assert.deepEqual(s.order('two'), ['A','B','C']);
  });
  await test('duplicate taps during confirmation do not close the pending operation', async () => {
    const s = fixture(); s.toggle(); s.choose(0); let finish;
    s.context.MNUtil.confirm = () => new Promise(resolve => { finish = resolve; });
    const item = s.item('extract'), result = s.run(item);
    assert.equal(await s.run(item), false); assert.ok(s.state()); assert.equal(s.calls.length, 0);
    finish(true); await result; assert.equal(s.calls.length, 1);
  });
  await test('long-list selection retains search and scroll position', () => {
    const s = fixture({ count: 30 }); s.toggle();
    s.state().views.search.text = ''; s.state().views.scroll.contentOffset = {x:0,y:620}; s.choose(15);
    assert.equal(s.state().views.scroll.contentOffset.y, 620); assert.equal(s.state().views.pickerActions.hidden, false);
    assert.equal(s.state().views.pickerRows[15].accessibilityValue, '已勾选');
    s.addon.openQuickCommentActions(s.state().views.pickerActions); assert.ok(s.state().quickPopover);
  });
  await test('same-card notifications while confirming retain the owning panel', async () => {
    const s = fixture(); s.toggle(); s.choose(0); let finish;
    s.context.MNUtil.confirm = () => new Promise(resolve => { finish = resolve; });
    const result = s.run(s.item('copy')), original = s.state(); s.selectCard('one');
    assert.equal(s.state(), original); finish(true); await result; assert.equal(s.calls.length, 1);
  });
  await test('single-comment cards expose organizing without changing the open route', () => {
    const s = setup({ count: 1 }); assert.equal(s.addon.dynamicMoveCommentButton.accessibilityLabel, '评论整理');
    assert.equal(s.addon.openQuickCommentPanel({ noteId:'one',token:s.addon.dynamicCommentContext.token }), true);
    assert.equal(s.state().comments.length, 1); assert.equal(s.state().views.close.hidden, undefined);
  });
  function conversionFixture() {
    const s = fixture(), snapshot = s.context.__MN_COMMENT_DATA__.getNoteSnapshot;
    s.notes.one.parentNote = { noteId: 'parent' }; s.notes.one.childNotes = []; s.notes.one.excerptText = 'original excerpt';
    s.context.__MN_COMMENT_DATA__.getNoteSnapshot = note => ({ ...snapshot(note), excerpt: { present: note.noteId === 'one', text: note.excerptText || '' } });
    s.context.__MN_COMMENT_MUTATIONS__.getNoExcerptConversionState = () => ({ eligible: true });
    s.context.__MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes = notes => {
      s.calls.push({ converting: notes[0].noteId });
      s.notes.two.comments = [{ type: 'TextNote', text: 'original excerpt' }, ...s.notes.one.comments.map(c => ({ ...c }))];
      return { changed: 1, failed: 0, convertedNoteMap: { one: 'two' }, convertedNoteIds: ['two'] };
    };
    s.context.MNUtil.focusNoteInMindMapById = id => { s.focusedAfterConversion = id; };
    return s;
  }
  await test('convert-and-fold uses the replacement card and folds only its former excerpt', async () => {
    const s = conversionFixture(); await s.run(s.item('convertFold'));
    assert.deepEqual(s.calls, [{ converting: 'one' }]); assert.equal(s.focusedAfterConversion, 'two');
    assert.deepEqual(s.notes.two.comments.map(c => !!c.collapsed), [true, false, false, false]);
    assert.equal(s.state(), null);
  });
  await test('excerpt changes during confirmation prevent conversion', async () => {
    const s = conversionFixture(); let finish;
    s.context.MNUtil.confirm = () => new Promise(resolve => { finish = resolve; });
    const result = s.run(s.item('convert')); s.notes.one.excerptText = 'changed excerpt'; finish(true);
    assert.equal(await result, false); assert.equal(s.calls.length, 0); assert.equal(s.notes.one.excerptText, 'changed excerpt');
  });
  await test('conversion followed by fold failure reports partial completion', async () => {
    const s = conversionFixture(); s.context.__MN_COMMENT_MUTATIONS__.setCommentsCollapsed = () => { throw new Error('fold unavailable'); };
    assert.equal(await s.run(s.item('convertFold')), false); assert.equal(s.calls.length, 1);
    assert(s.hud.some(message => /已转换.*折叠未能确认/.test(message))); assert.equal(s.notes.two.comments.length, 4);
  });
  console.log(JSON.stringify({ passed: cases.length, cases }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
