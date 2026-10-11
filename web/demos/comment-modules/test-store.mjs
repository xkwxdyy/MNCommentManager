import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from './store.mjs';
import { createDemoServer } from './server.mjs';

async function temporary(run) { const dir = await mkdtemp(path.join(os.tmpdir(), 'mn-modules-test-')); try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); } }

test('JSON settings and card content survive reopening; undo survives too', async () => temporary(async dir => {
  const filename = path.join(dir, 'state.json'), store = await createStore(filename);
  let state = await store.send('getState');
  const settings = structuredClone(state.settings);
  settings.defaultProfileId = 'nested'; settings.cardOverrides.plain = { profileId: 'text', includeTitle: false };
  state = await store.send('saveModuleSettings', { expectedRevision: state.revision, settings });
  state = await store.send('extract', { expectedRevision: state.revision, noteId: 'mixed', ids: ['mixed-4'], title: '保存验证', removeOriginal: false });
  const reopened = await createStore(filename);
  assert.deepEqual(await reopened.send('getState'), state);
  const undone = await reopened.send('undo', { expectedRevision: state.revision });
  assert.equal(undone.cards.length, state.cards.length - 1);
  assert.equal(undone.settings.cardOverrides.plain.includeTitle, false);
}));

test('queued simultaneous writes reject stale revision without a lost update', async () => temporary(async dir => {
  const store = await createStore(path.join(dir, 'state.json'));
  const results = await Promise.allSettled([store.send('reset', { expectedRevision: 1 }), store.send('reset', { expectedRevision: 1 })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await store.send('getState')).revision, 2);
}));

test('corrupt JSON is preserved instead of silently overwriting settings', async () => temporary(async dir => {
  const filename = path.join(dir, 'state.json'); await writeFile(filename, '{broken');
  await assert.rejects(createStore(filename), /原文件已保留/);
  assert.equal(await readFile(filename, 'utf8'), '{broken');
}));

test('failed disk save leaves in-memory state unchanged and cleans temporary file', async () => temporary(async dir => {
  const filename = path.join(dir, 'state.json'), store = await createStore(filename);
  const before = await store.send('getState');
  await rename(filename, `${filename}.backup`); await mkdir(filename);
  await assert.rejects(store.send('reset', { expectedRevision: 1 }));
  assert.deepEqual(await store.send('getState'), before);
  assert.equal((await readdir(dir)).some(n => n.endsWith('.tmp')), false);
}));

test('HTTP server serves built content, handles bridge and blocks foreign origins and private files', async () => temporary(async dir => {
  const root = path.join(dir, 'public'); await mkdir(root); await writeFile(path.join(root, 'index.html'), '<h1>demo</h1>');
  const server = await createDemoServer({ root, filename: path.join(dir, 'state.json') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(base)).text(), '<h1>demo</h1>');
    const send = (command, payload, origin = base) => fetch(`${base}/api/bridge`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ command, payload }) });
    const initial = await (await send('getState', {})).json(); assert.equal(initial.payload.cards[0].id, 'mixed');
    assert.equal((await send('reset', { expectedRevision: 1 }, 'http://foreign.example')).status, 403);
    assert.equal((await fetch(`${base}/state.json`)).status, 404);
    assert.equal((await fetch(`${base}/..%2Fstate.json`)).status, 404);
    const changed = await (await send('reset', { expectedRevision: 1 })).json(); assert.equal(changed.payload.revision, 2);
    const stale = await send('reset', { expectedRevision: 1 }); assert.equal(stale.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
