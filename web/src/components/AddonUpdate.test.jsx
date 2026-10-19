// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AddonUpdate from './AddonUpdate';
import MNBridge from '../lib/mnBridge';
vi.mock('../lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, state;
const button = label => [...host.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label);
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
async function mount() { root = createRoot(host); await act(async () => root.render(<AddonUpdate />)); }
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state = { currentVersion: '0.1.29', autoCheck: true, phase: 'idle', lastCheckedAt: 0, message: '' };
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'setAddonUpdateAutoCheck') state = { ...state, ...payload };
    if (command === 'checkAddonUpdate') state = { ...state, phase: 'ready', result: { latestVersion: '0.1.30', updateAvailable: true, offline: false }, message: '发现新版本' };
    if (command === 'installAddonUpdate') state = { ...state, phase: 'installed', installedVersion: '0.1.30', message: '请重启 MarginNote' };
    if (command === 'getAddonChangelog') return { offline: false, entries: [{ version: '0.1.29', items: [{ zh: '当前版本说明' }] }, { version: '0.1.30', items: [{ zh: '<script>unsafe</script>' }] }] };
    return state;
  });
  host = document.createElement('div'); document.body.append(host); await mount();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('renders current version with accessible check action and saves Native preference', async () => {
  expect(host.textContent).toContain('v0.1.29'); expect(button('下载并安装').disabled).toBe(true);
  await click(host.querySelector('input')); expect(MNBridge.send).toHaveBeenCalledWith('setAddonUpdateAutoCheck', { autoCheck: false });
  expect(host.querySelector('input').checked).toBe(false);
});
it('checks and installs only the Native selected version, retaining the running version until restart', async () => {
  await click(button('检查更新')); expect(button('下载并安装').disabled).toBe(false);
  await click(button('下载并安装')); expect(MNBridge.send).toHaveBeenCalledWith('installAddonUpdate', { version: '0.1.30' });
  expect(host.textContent).toContain('当前运行版本v0.1.29'); expect(host.textContent).toContain('重启后生效'); expect(button('下载并安装').disabled).toBe(true);
});
it('offline data has an explicit label and never permits installation', async () => {
  state = { ...state, phase: 'offline', result: { latestVersion: '0.1.30', offline: true, updateAvailable: true } };
  await act(async () => root.unmount()); await mount();
  expect(host.textContent).toContain('离线资料版本'); expect(button('下载并安装').disabled).toBe(true);
});
it('renders only the selected version notes as text', async () => {
  await click(button('检查更新')); await click(button('更新说明'));
  expect(host.textContent).toContain('<script>unsafe</script>'); expect(host.querySelector('script')).toBeNull(); expect(host.textContent).not.toContain('当前版本说明');
});
it('does not change auto-check preference after a failed save', async () => {
  MNBridge.send.mockRejectedValueOnce(new Error('保存失败')); await click(host.querySelector('input'));
  expect(host.querySelector('input').checked).toBe(true); expect(host.querySelector('[role="alert"]').textContent).toContain('保存失败');
});
it('guards repeated install clicks while the Native operation is pending', async () => {
  await click(button('检查更新')); let finish;
  MNBridge.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click(button('下载并安装')); expect(button('检查更新').disabled).toBe(true); expect(host.textContent).toContain('请勿退出');
  await click(button('下载并安装')); expect(MNBridge.send.mock.calls.filter(([command]) => command === 'installAddonUpdate')).toHaveLength(1);
  await act(async () => finish({ ...state, phase: 'installed', installedVersion: '0.1.30' }));
  expect(host.textContent).toContain('重启后生效');
});
it('reports initial connection failure', async () => {
  await act(async () => root.unmount()); MNBridge.send.mockRejectedValueOnce(new Error('连接失败')); await mount();
  expect(host.querySelector('[role="alert"]').textContent).toContain('连接失败');
});
it('ignores a check receipt after settings are closed', async () => {
  let finish;
  MNBridge.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click(button('检查更新'));
  await act(async () => root.unmount());
  await act(async () => finish({ ...state, phase: 'ready' }));
  expect(host.textContent).toBe('');
  await mount();
});
it('reconciles a Native installation that was already running when settings reopened', async () => {
  vi.useFakeTimers();
  try {
    state = { ...state, phase: 'installing' };
    await act(async () => root.unmount()); await mount();
    expect(button('检查更新').disabled).toBe(true);
    state = { ...state, phase: 'installed', installedVersion: '0.1.30' };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(host.textContent).toContain('重启后生效');
  } finally { vi.useRealTimers(); }
});
