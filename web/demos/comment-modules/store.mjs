import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState } from './fixtures.mjs';
import { dispatch, publicState, validateState } from './model.mjs';

export async function createStore(filename) {
  let state;
  try { state = validateState(JSON.parse(await readFile(filename, 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`演示数据读取失败，原文件已保留：${error.message}`);
    state = initialState();
  }
  await mkdir(path.dirname(filename), { recursive: true });
  async function persist(next) {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, filename);
    } finally { await rm(temporary, { force: true }); }
  }
  await persist(state);
  let queue = Promise.resolve();
  return {
    send(command, payload) {
      const job = queue.then(async () => {
        const next = dispatch(state, command, payload);
        if (next !== state) { await persist(next); state = next; }
        return structuredClone(publicState(state));
      });
      queue = job.catch(() => {});
      return job;
    },
  };
}
