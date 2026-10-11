// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect } from 'vitest';
import HtmlSelect from './HtmlSelect';
import { chooseHtmlOption } from '../test/chooseHtmlOption';
let root, host;
function Fixture({ disabled = false, fieldsetDisabled = false }) {
  const [value, setValue] = useState('a');
  return <fieldset disabled={fieldsetDisabled}><HtmlSelect aria-label="方案" value={value} disabled={disabled} onChange={e => setValue(e.target.value)}><option value="a">HTML 字段</option><option value="x" disabled>不可用</option>{[<option key="b" value="b">Markdown 标题</option>]}</HtmlSelect><button>其他操作</button><output>{value}</output></fieldset>;
}
const trigger = () => host.querySelector('[role=combobox]');
const key = async key => act(async () => trigger().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
beforeEach(async () => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(<Fixture />)); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('uses HTML options, updates the value and restores focus', async () => {
  expect(host.querySelector('select')).toBeNull();
  await chooseHtmlOption(trigger(), 'b');
  expect(host.querySelector('output').textContent).toBe('b');
  expect(trigger().textContent).toContain('Markdown 标题');
  expect(host.querySelector('[role=listbox]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});
it('supports keyboard selection while skipping disabled options', async () => {
  await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
  expect(host.querySelector('output').textContent).toBe('b');
  await key('ArrowUp'); await key('Home'); await key(' ');
  expect(host.querySelector('output').textContent).toBe('a');
});
it('Escape closes only the options and outside touch closes the menu', async () => {
  let escaped = false; document.addEventListener('keydown', event => { if (event.key === 'Escape') escaped = true; }, { once: true });
  await key('ArrowDown'); await key('Escape'); expect(escaped).toBe(false);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  await key('ArrowDown');
  await act(async () => document.body.dispatchEvent(new Event('touchstart', { bubbles: true })));
  expect(host.querySelector('[role=listbox]')).toBeNull();
});
it('keeps disabled controls closed, including inherited fieldset state', async () => {
  await act(async () => root.render(<Fixture fieldsetDisabled />)); await key('ArrowDown');
  expect(host.querySelector('[role=listbox]')).toBeNull();
  await act(async () => root.render(<Fixture disabled />)); await key('ArrowDown');
  expect(host.querySelector('[role=listbox]')).toBeNull();
});
it('Tab and focus leaving close options without committing a draft selection', async () => {
  await key('ArrowDown'); await key('End'); await key('Tab');
  expect(host.querySelector('output').textContent).toBe('a');
  expect(host.querySelector('[role=listbox]')).toBeNull();
});
