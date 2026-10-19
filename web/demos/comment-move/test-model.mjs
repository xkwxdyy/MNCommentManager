import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialComments, insertSelection, moveToIndex } from './model.mjs';
test('single comments land immediately before or after the content anchor', () => {
  for (const side of ['before', 'after']) {
    const result = insertSelection(initialComments, ['c-0-2'], 'c-3-4', side);
    assert.equal(result.findIndex(c => c.id === 'c-0-2') - result.findIndex(c => c.id === 'c-3-4'), side === 'before' ? -1 : 1);
    assert.equal(result.find(c => c.id === 'c-0-2').section, '证明');
    assert.equal(result.length, initialComments.length);
    assert.equal(new Set(result.map(c => c.id)).size, result.length);
  }
});
test('non-contiguous selection moves as a group in source order', () => {
  const result = insertSelection(initialComments, ['c-0-4', 'c-0-1'], 'c-3-4');
  const anchor = result.findIndex(c => c.id === 'c-3-4');
  assert.deepEqual(result.slice(anchor + 1, anchor + 3).map(c => c.id), ['c-0-1', 'c-0-4']);
});
test('start and end preserve all comments without mutating the input', () => {
  const before = JSON.stringify(initialComments);
  assert.equal(insertSelection(initialComments, ['c-0-2'], 'start')[0].id, 'c-0-2');
  assert.equal(insertSelection(initialComments, ['c-0-2'], 'end').at(-1).id, 'c-0-2');
  assert.equal(JSON.stringify(initialComments), before);
});
test('missing or selected anchors do not alter the list', () => {
  assert.equal(insertSelection(initialComments, ['c-0-2'], 'missing'), initialComments);
  assert.equal(insertSelection(initialComments, ['c-0-2'], 'c-0-2'), initialComments);
});
test('long jumps land at the requested final position and preserve the remaining order', () => {
  const before = JSON.stringify(initialComments);
  for (const target of [0, 18, 35]) {
    const result = moveToIndex(initialComments, 'c-0-2', target);
    assert.equal(result[target].id, 'c-0-2');
    assert.deepEqual(result.filter(c => c.id !== 'c-0-2'), initialComments.filter(c => c.id !== 'c-0-2'));
    assert.equal(result.length, initialComments.length);
  }
  assert.equal(JSON.stringify(initialComments), before);
});
test('jump boundaries clamp and invalid or unchanged targets do not create an edit', () => {
  assert.equal(moveToIndex(initialComments, 'c-0-2', -100)[0].id, 'c-0-2');
  assert.equal(moveToIndex(initialComments, 'c-0-2', 100).at(-1).id, 'c-0-2');
  assert.equal(moveToIndex(initialComments, 'missing', 2), initialComments);
  assert.equal(moveToIndex(initialComments, 'c-0-2', NaN), initialComments);
  assert.equal(moveToIndex(initialComments, 'c-0-2', 2), initialComments);
});
