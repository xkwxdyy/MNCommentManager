const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const source = fs.readFileSync(process.env.MNCM_UPDATER_SOURCE || path.join(__dirname, '../src/AddonUpdater.js'), 'utf8');
const id = 'marginnote.extension.mncommentmanager';
const main = '/extensions/' + id;
const required = ['main.js', 'MNCommentManagerAddon.js', 'web-dist/index.html', 'web-dist/assets/app.js', 'web-dist/assets/app.css'];
function harness() {
  const files = new Map(), dirs = new Set([main]), prefs = {}, calls = [], timers = [], hud = [];
  let failNetwork = false, failMove = false, failPostValidation = false, failDownloadWrite = false;
  let remote = { id: 'mncommentmanager', addonid: id, version: '0.1.30', channel: 'stable', filename: 'mn-comment-manager-v0.1.30.mnaddon', url: 'https://downloads.example/mn-comment-manager-v0.1.30.mnaddon' };
  let archiveMeta = { addonid: id, version: '0.1.30' }, archiveMissing = '';
  const put = (p, v) => files.set(p, String(v));
  const seed = (p, meta, missing = '') => {
    dirs.add(p); put(p + '/mnaddon.json', JSON.stringify(meta));
    for (const name of required) if (name !== missing) put(p + '/' + name, name + ':contents');
  };
  seed(main, { addonid: id, version: '0.1.29' });
  put(main + '/update-fallback/mncommentmanager.json', JSON.stringify(remote));
  put(main + '/update-fallback/mncommentmanager_changelog.json', JSON.stringify({ id: 'mncommentmanager', entries: [] }));
  const exists = p => files.has(p) || dirs.has(p);
  const nativeData = value => ({ length: () => String(value).length, toString: () => String(value), writeToFileAtomically: (p, atomic) => { assert.equal(atomic, true); if (failDownloadWrite) return false; put(p, value); return true; } });
  const fm = {
    fileExistsAtPath: exists,
    createDirectoryAtPathWithIntermediateDirectoriesAttributes(p) { dirs.add(p); return true; },
    moveItemAtPathToPath(from, to) {
      if (failMove && from.includes('/stage-')) return false;
      if (exists(to) || !exists(from)) return false;
      for (const [p, value] of [...files]) if (p === from || p.startsWith(from + '/')) { files.delete(p); files.set(to + p.slice(from.length), value); }
      for (const p of [...dirs]) if (p === from || p.startsWith(from + '/')) { dirs.delete(p); dirs.add(to + p.slice(from.length)); }
      if (failPostValidation && from.includes('/stage-')) files.delete(to + '/web-dist/assets/app.css');
      return true;
    },
  };
  const ctx = {
    console, NSData: { dataWithContentsOfFile: p => files.has(p) ? nativeData(files.get(p)) : null },
    NSString: { stringWithContentsOfData: d => String(d) }, NSFileManager: { defaultManager: () => fm },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: k => prefs[k], setObjectForKey: (v, k) => { prefs[k] = v; } }) },
    Application: { sharedInstance: () => ({ tempPath: '/tmp', documentPath: '/documents', showHUD: (...args) => hud.push(args) }) },
    NSTimer: { scheduledTimerWithTimeInterval: (s, repeat, fn) => { assert.equal(repeat, false); timers.push(fn); } },
    MNConnection: { async fetchDev(url) {
      calls.push(url);
      if (failNetwork) throw new Error('offline');
      if (url.includes('/update/mncommentmanager_changelog.json')) return { ok: true, text: async () => JSON.stringify({ id: 'mncommentmanager', entries: [{ version: '0.1.30', items: [{ zh: '测试' }] }] }) };
      if (url.includes('/update/mncommentmanager.json')) return { ok: true, text: async () => JSON.stringify(remote) };
      return { ok: true, body: nativeData('zip bytes') };
    } },
    ZipArchive: { unzipFileAtPathToDestination(archive, stage) { seed(stage, archiveMeta, archiveMissing); return true; } },
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const api = ctx.__MN_UPDATER_MNCommentManagerAddon; api.init(main);
  return { api, files, dirs, prefs, calls, timers, ctx, hud,
    set remote(v) { remote = { ...remote, ...v }; },
    set archive(v) { archiveMeta = v; }, set missing(v) { archiveMissing = v; },
    set failNetwork(v) { failNetwork = v; }, set failMove(v) { failMove = v; },
    set failPostValidation(v) { failPostValidation = v; }, set failDownloadWrite(v) { failDownloadWrite = v; },
  };
}

test('online detection uses exact manifest filename and shares concurrent checks', async () => {
  const h = harness(); const a = h.api.check(), b = h.api.check(); assert.equal(a, b);
  const state = await a; assert.equal(state.result.updateAvailable, true); assert.equal(state.result.filename, 'mn-comment-manager-v0.1.30.mnaddon'); assert.equal(h.calls.length, 1);
});
test('same and older stable versions never offer downgrade', async () => {
  for (const v of ['0.1.29', '0.1.28']) {
    const h = harness(); h.remote = { version: v, filename: 'mn-comment-manager-v' + v + '.mnaddon' };
    assert.equal((await h.api.check()).result.updateAvailable, false);
  }
});
test('numeric comparison handles 0.1.100 above 0.1.29', async () => {
  const h = harness(); h.remote = { version: '0.1.100', filename: 'mn-comment-manager-v0.1.100.mnaddon' };
  assert.equal((await h.api.check()).result.updateAvailable, true);
});
test('invalid identity, filename, version, channel and insecure URLs cannot become online updates', async () => {
  for (const patch of [{ addonid: 'other' }, { id: 'other' }, { filename: '../other.mnaddon' }, { version: '../../' }, { channel: 'beta' }, { url: 'http://example/package' }]) {
    const h = harness(); h.remote = patch; const s = await h.api.check(); assert.equal(s.result.offline, true); assert.equal(s.result.updateAvailable, false);
  }
});
test('secondary source is used after primary HTTP failure', async () => {
  const h = harness(), original = h.ctx.MNConnection.fetchDev;
  h.ctx.MNConnection.fetchDev = async url => url.startsWith('https://api.') ? { ok: false, status: 503 } : original(url);
  const s = await h.api.check(); assert.equal(s.result.offline, false); assert.match(s.result.source, /^https:\/\/xkwxdyy/);
});
test('offline fallback is explicit and cannot install', async () => {
  const h = harness(); h.failNetwork = true; const s = await h.api.check(); assert.equal(s.phase, 'offline'); assert.match(s.message, /离线/);
  await assert.rejects(h.api.install({ version: '0.1.30' }), /先检查/);
});
test('both unavailable sources without fallback report an error', async () => {
  const h = harness(); h.failNetwork = true; h.files.delete(main + '/update-fallback/mncommentmanager.json');
  assert.equal((await h.api.check()).phase, 'error');
});
test('auto-check preference persists and rejects malformed input', () => {
  const h = harness(); assert.equal(h.api.getState().autoCheck, true);
  assert.equal(h.api.setAutoCheck({ autoCheck: false }).autoCheck, false);
  assert.throws(() => h.api.setAutoCheck({ autoCheck: 'false' }), /无效/);
  h.api.start({ mainPath: main }); assert.equal(h.timers.length, 0);
});
test('startup waits for network capability and checks once across windows', async () => {
  const h = harness(), network = h.ctx.MNConnection; delete h.ctx.MNConnection;
  h.api.start({ mainPath: main }); h.api.start({ mainPath: main }); assert.equal(h.timers.length, 1);
  h.timers.shift()(); assert.equal(h.timers.length, 1); assert.equal(h.calls.length, 0);
  h.ctx.MNConnection = network; h.timers.shift()(); await h.api.check();
  assert.equal(h.calls.length, 1); assert.equal(h.hud.length, 0);
});
test('changelog is returned with source and offline metadata', async () => {
  const h = harness(); assert.equal((await h.api.changelog()).entries[0].version, '0.1.30');
  h.failNetwork = true; assert.equal((await h.api.changelog()).offline, true);
});
test('installation validates, backs up outside extensions and freezes running version', async () => {
  const h = harness(); await h.api.check(); const a = h.api.install({ version: '0.1.30' }), b = h.api.install({ version: '0.1.30' }); assert.equal(a, b);
  const state = await a; assert.equal(state.phase, 'installed'); assert.equal(state.currentVersion, '0.1.29'); assert.equal(state.installedVersion, '0.1.30');
  assert.equal(JSON.parse(h.files.get(main + '/mnaddon.json')).version, '0.1.30');
  assert([...h.files.keys()].some(p => p.startsWith('/documents/' + id + '/update-backups/') && p.endsWith('/main.js')));
  const count = h.calls.length; await h.api.install({ version: '0.1.30' }); assert.equal(h.calls.length, count);
});
test('wrong package identity, version and missing assets leave installed files intact', async () => {
  for (const mode of ['identity', 'version', 'assets', 'write']) {
    const h = harness(), before = JSON.stringify([...h.files]); await h.api.check();
    if (mode === 'identity') h.archive = { addonid: 'other', version: '0.1.30' };
    if (mode === 'version') h.archive = { addonid: id, version: '0.1.31' };
    if (mode === 'assets') h.missing = 'web-dist/assets/app.js';
    if (mode === 'write') h.failDownloadWrite = true;
    assert.equal((await h.api.install({ version: '0.1.30' })).phase, 'error');
    assert.equal(JSON.stringify([...h.files].filter(([p]) => p.startsWith(main))), before);
  }
});
test('failed move and failed post-install validation both restore the exact previous installation', async () => {
  for (const mode of ['move', 'validation']) {
    const h = harness(), before = new Map(h.files); await h.api.check();
    if (mode === 'move') h.failMove = true; else h.failPostValidation = true;
    const s = await h.api.install({ version: '0.1.30' }); assert.equal(s.phase, 'error'); assert.match(s.message, /旧版已恢复/);
    assert.deepEqual(new Map([...h.files].filter(([p]) => p.startsWith(main))), before);
  }
});
test('install refuses stale selection and unconfirmed requests', async () => {
  const h = harness(); await assert.rejects(h.api.install({ version: '0.1.30' })); await h.api.check();
  await assert.rejects(h.api.install({ version: '0.1.31' })); assert.equal(h.calls.length, 1);
});


test('modern MNUtil Response retains manifest and package validation', async () => {
  const h = harness(); let modern = 0;
  h.ctx.MNUtil = { fetch: async (...args) => { modern++; return h.ctx.MNConnection.fetchDev(...args); } };
  assert.equal((await h.api.check()).result.updateAvailable, true);
  assert.equal(modern, 1);
  h.ctx.MNUtil.fetch = async () => ({ ok: false, status: 401, text: async () => '{}' });
  assert.equal((await h.api.check()).result.offline, true);
});

test('update feedback uses ready MNUtils notification without a success HUD', async () => {
  const h = harness(), notices = [];
  h.ctx.notificationUtils = { config: {}, notifyController: { webviewResponse: {}, isWebViewDidFinishLoad: 1 } };
  h.ctx.MNNotification = { simple: (...args) => { notices.push(args); return Promise.resolve({ success: true, id: 'update' }); } };
  h.api.start({ mainPath: main }); h.timers.shift()(); await h.api.check();
  assert.equal(notices.length, 1); assert.match(notices[0][1], /0.1.30/); assert.equal(h.hud.length, 0);
});


test('cold notification module never initializes a view or falls back to a success HUD', async () => {
  const h = harness(); let sent = 0;
  h.ctx.notificationUtils = { config: {}, notifyController: { webviewResponse: null, get view() { throw new Error('cold view'); } } };
  h.ctx.MNNotification = { simple: () => { sent++; } };
  h.api.start({ mainPath: main }); h.timers.shift()(); await h.api.check();
  assert.equal(sent, 0); assert.equal(h.hud.length, 0);
});
