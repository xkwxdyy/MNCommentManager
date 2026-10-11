import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, buildModules, effectiveSettings, filterComments, matches, moduleIds, selectionState, toggleIds } from './engine.mjs';
import { initialState } from './fixtures.mjs';
import { dispatch, validateState } from './model.mjs';

const fixture = () => initialState();
const treeFor = (state, id, profile = 'nested') => buildModules(state.cards.find(n => n.id === id).comments, state.settings.profiles.find(p => p.id === profile));
const command = (state, name, payload) => dispatch(state, name, { expectedRevision: state.revision, ...payload });

test('HTML fields retain preamble, empty and duplicate markers, and final range', () => {
  const s = fixture(), card = s.cards[0], tree = treeFor(s, 'mixed', 'html');
  assert.equal(tree.roots[0].title, '未分组');
  assert.equal(tree.roots[0].items.length, 1);
  const empty = tree.flat.find(n => n.title === '空模块');
  assert.equal(empty.end - empty.start, 1);
  const repeated = tree.flat.filter(n => n.title === '应用');
  assert.equal(repeated.length, 2); assert.notEqual(repeated[0].id, repeated[1].id);
  assert.equal(tree.flat.at(-1).end, card.comments.length);
  assert.equal(buildModules([], PRESETS[0]).roots.length, 0);
});

test('nested fields and HtmlMD form a tree without duplicated bodies', () => {
  const s = fixture(), tree = treeFor(s, 'mixed');
  const proof = tree.flat.find(n => n.title === '证明');
  const direct = tree.flat.find(n => n.title === '方法一：直接估计');
  const method = tree.flat.find(n => n.title === '方法二：递推证明');
  const induct = tree.flat.find(n => n.title === '归纳过程');
  assert.equal(direct.parentId, proof.id);
  assert.equal(method.parentId, proof.id);
  assert.equal(induct.parentId, method.id);
  assert.equal(direct.end, method.start);
  const ids = tree.flat.flatMap(n => n.items.map(c => c.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length + tree.titleIds.size, s.cards[0].comments.length);
});

test('Markdown title uses only first nonempty line and does not split comments', () => {
  const comments = [{ id: 'a', type: 'markdownComment', text: '\n # 首节\n\n正文\n## 内部标题' }, { id: 'b', type: 'markdownComment', text: '正文\n# 不作为边界' }, { id: 'c', type: 'markdownComment', text: '### 跳级' }];
  const tree = buildModules(comments, PRESETS[1]);
  assert.equal(tree.flat.length, 2); assert.equal(tree.flat[1].parentId, tree.flat[0].id);
  assert.equal(tree.flat[0].items[0].id, 'b');
  assert.equal(tree.titleIds.size, 2);
  assert.equal(buildModules(comments, { ...PRESETS[1], levels: [1] }).flat.length, 1);
});

test('custom rules use exact, prefix, contains and all without matching excluded types', () => {
  for (const [match, value, pass] of [['all', '', true], ['exact', '证明', true], ['exact', '证', false], ['prefix', '证', true], ['contains', '明', true], ['prefix', '', false]]) assert.equal(matches('证明', { match, value }), pass);
  const s = fixture(), profile = s.settings.profiles.find(p => p.id === 'text');
  const t = treeFor(s, 'plain', 'text');
  assert.deepEqual(t.roots.map(n => n.title), ['未分组', '概念', '练习']);
  assert.equal(buildModules([{ id: 'p', type: 'imageComment', text: '模块：图片' }], profile).titleIds.size, 0);
});

test('module selection uses full ranges while body-only removes all descendant titles', () => {
  const s = fixture(), card = s.cards[0], tree = treeFor(s, 'mixed');
  const proof = tree.flat.find(n => n.title === '证明');
  const full = moduleIds(proof, card.comments, tree.titleIds, true);
  const body = moduleIds(proof, card.comments, tree.titleIds, false);
  assert.ok(full.length > body.length);
  assert.ok(body.every(id => !tree.titleIds.has(id)));
  const visible = filterComments(card.comments, 'imageComment', '收敛');
  assert.equal(visible.length, 1);
  assert.ok(full.includes(visible[0].id)); assert.ok(full.length > visible.length);
  assert.deepEqual(treeFor(s, 'mixed'), tree);
  assert.equal(selectionState(full, new Set([body[0]])).partial, true);
  assert.equal(selectionState(full, new Set(full)).checked, true);
  assert.equal(toggleIds(new Set(full), full).size, 0);
});

test('card-specific profile and title policy override global settings', () => {
  const s = fixture(); s.settings.cardOverrides.mixed = { profileId: 'nested', includeTitle: false };
  assert.equal(effectiveSettings(s.settings, 'mixed').profile.id, 'nested');
  assert.equal(effectiveSettings(s.settings, 'mixed').includeTitle, false);
  assert.equal(effectiveSettings(s.settings, 'plain').profile.id, 'html');
});

test('module reordering keeps descendants intact, supports both directions and respects boundaries', () => {
  let s = fixture(); s.settings.defaultProfileId = 'nested';
  const tree = treeFor(s, 'mixed'), proof = tree.flat.find(n => n.title === '证明');
  const ids = moduleIds(proof, s.cards[0].comments, tree.titleIds);
  const moved = command(s, 'reorderModule', { noteId: 'mixed', moduleId: proof.id, direction: 'down' });
  const newTree = treeFor(moved, 'mixed');
  assert.equal(newTree.roots[1].title, '应用');
  const newProof = newTree.flat.find(n => n.id === proof.id);
  assert.deepEqual(moduleIds(newProof, moved.cards[0].comments, newTree.titleIds), ids);
  const restored = command(moved, 'reorderModule', { noteId: 'mixed', moduleId: proof.id, direction: 'up' });
  assert.deepEqual(restored.cards, s.cards);
  assert.throws(() => command(s, 'reorderModule', { noteId: 'mixed', moduleId: proof.id, direction: 'up' }), /边界/);
  assert.deepEqual(command(moved, 'undo', {}).cards, s.cards);
});

test('body movement to target end preserves order, rejects structural titles and own ranges', () => {
  const s = fixture(), tree = treeFor(s, 'mixed', 'html');
  const target = tree.flat.find(n => n.title === '空模块');
  const ids = ['mixed-3', 'mixed-4'];
  const moved = command(s, 'moveBody', { noteId: 'mixed', ids, targetModuleId: target.id });
  const comments = moved.cards[0].comments;
  assert.deepEqual(comments.slice(comments.findIndex(c => c.id === target.titleId) + 1, comments.findIndex(c => c.id === target.titleId) + 3).map(c => c.id), ids);
  assert.throws(() => command(s, 'moveBody', { noteId: 'mixed', ids: ['mixed-1'], targetModuleId: target.id }), /结构标题/);
  assert.throws(() => command(s, 'moveBody', { noteId: 'mixed', ids, targetModuleId: tree.flat.find(n => n.title === '证明').id }), /当前所属/);
});

test('extract copies by default, supports removal, preserves media, and undo removes child', () => {
  const s = fixture(), payload = { noteId: 'mixed', ids: ['mixed-1', 'mixed-4'], title: '测试子卡片', removeOriginal: false };
  const extracted = command(s, 'extract', payload);
  assert.deepEqual(extracted.cards[0], s.cards[0]);
  const child = extracted.cards.at(-1);
  assert.equal(child.parentId, 'mixed'); assert.equal(child.comments[1].image, s.cards[0].comments[4].image);
  assert.equal(extracted.settings.cardOverrides[child.id].profileId, 'html');
  assert.deepEqual(command(extracted, 'undo', {}).cards, s.cards);
  const removed = command(s, 'extract', { ...payload, removeOriginal: true });
  assert.equal(removed.cards[0].comments.length, s.cards[0].comments.length - 2);
});

test('revision, settings and comment validation reject stale or malformed writes', () => {
  const s = fixture();
  assert.throws(() => dispatch(s, 'reset', { expectedRevision: 0 }), /已变化/);
  assert.throws(() => command(s, 'saveModuleSettings', { settings: { ...s.settings, defaultProfileId: 'missing' } }), /默认方案/);
  assert.throws(() => command(s, 'setCollapsed', { noteId: 'mixed', ids: ['missing'], collapsed: true }), /选区无效/);
  const folded = command(s, 'setCollapsed', { noteId: 'mixed', ids: ['mixed-4'], collapsed: true });
  assert.equal(folded.cards[0].comments[4].collapsed, true);
  assert.equal(treeFor(folded, 'mixed').flat.length, treeFor(s, 'mixed').flat.length);
  const reset = command(folded, 'reset', {});
  assert.deepEqual(reset.cards, s.cards); assert.equal(reset.history.at(-1).label, '重置演示');
  assert.equal(validateState(s), s);
});
