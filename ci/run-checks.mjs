import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function localFile(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]/).some(part => part === '..' || part.toLowerCase() === 'cursor' || part.toLowerCase().startsWith('.cursor'))) throw new Error('Expected a local repository file');
  const resolved = fs.realpathSync(path.join(root, value));
  if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile()) throw new Error('Script escapes the checkout');
  return resolved;
}
try {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required');
  if (process.argv.length !== 3) throw new Error('Usage: node ci/run-checks.mjs ci/commands.json');
  const config = JSON.parse(fs.readFileSync(localFile(process.argv[2]), 'utf8'));
  if (config.schemaVersion !== 1 || !Array.isArray(config.commands) || !config.commands.length || Object.keys(config).some(key => !['schemaVersion', 'commands'].includes(key))) throw new Error('Invalid explicit command list');
  for (const entry of config.commands) {
    if (!entry || Object.keys(entry).some(key => !['name', 'argv'].includes(key)) || typeof entry.name !== 'string' || !entry.name || !Array.isArray(entry.argv) || entry.argv.some(arg => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) throw new Error('Invalid command');
    const [exe, first, ...rest] = entry.argv;
    if (exe !== 'node') throw new Error('Only local Node checks are permitted');
    if (first === '--check') {
      if (rest.length !== 1) throw new Error('Expected one syntax-check input');
      localFile(rest[0]);
    } else {
      localFile(first);
      if (first === 'node_modules/vitest/vitest.mjs') {
        if (rest[0] !== 'run' || rest[1] !== '--maxWorkers=2' || rest.length < 3) throw new Error('Expected bounded explicit Vitest files');
        rest.slice(2).forEach(localFile);
      } else if (['scripts/sync-comment-module-rules.mjs', 'scripts/sync-comment-move-gesture.mjs'].includes(first)) {
        if (rest.length !== 1 || rest[0] !== '--check') throw new Error('Synchronization checks must remain read-only');
      } else if (!path.basename(first).startsWith('test-') || rest.length) throw new Error('Only reviewed test entrypoints are permitted');
    }
  }
  for (const entry of config.commands) {
    console.log(`Check: ${entry.name}`);
    const result = spawnSync(entry.argv[0], entry.argv.slice(1), {cwd: root, stdio: 'inherit', shell: false, env: {...process.env, CI: 'true'}});
    if (result.error || result.status !== 0) throw new Error(`Check failed: ${entry.name}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
