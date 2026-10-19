import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const file = new URL('../../../Resources/comment-move-prototype/compressed-overview/preview.html', import.meta.url);
const errors = [], checks = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole, beforeParse(window) {
  const captures = new WeakMap();
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(this, id); };
  window.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(this) === id; };
  window.HTMLElement.prototype.releasePointerCapture = function () { captures.delete(this); };
  // Simulated geometry verifies event/order behavior; it is not visual layout evidence.
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { top: 100, bottom: 500, left: 400, right: 444, width: 44, height: 400 }; };
} });
const { window } = dom, { document } = window;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const $ = selector => document.querySelector(selector);
const order = () => Array.from(document.querySelectorAll('.ov-comment'), row => row.dataset.commentId);
const grip = () => $('.ov-grip');
async function click(selector) { $(selector).click(); await settle(); }
async function pointer(element, type, x, y) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: 'mouse' } });
  element.dispatchEvent(event); await settle();
}
async function sample(name) { $('#ov-sample').value = name; $('#ov-sample').dispatchEvent(new window.Event('change', { bubbles: true })); await settle(); }
function check(name) { checks.push(name); console.log('PASS ' + name); }

try {
  await settle();
  assert.equal(order().length, 14);
  assert.equal(document.querySelectorAll('.ov-row').length, 13);
  assert.equal(document.querySelectorAll('.is-distant').length, 11);
  assert.equal(document.querySelectorAll('.is-neighbor').length, 2);
  assert(document.querySelectorAll('.ov-row img').length >= 2);
  check('all remaining comments have content rows; adjacent rows expand and images use thumbnails');

  const baseline = order();
  await pointer(grip(), 'pointerdown', 422, 259);
  await pointer(grip(), 'pointermove', 422, 423);
  assert.deepEqual(order(), baseline);
  assert.equal(Number($('.ov-landing').dataset.target), 11);
  assert($('.ov-insert-rule').textContent.includes('松手放在此处'));
  await pointer(grip(), 'pointerup', 422, 423);
  assert.equal(order()[11], baseline[5]);
  await click('[aria-label="撤回移动"]');
  assert.deepEqual(order(), baseline);
  assert($('[aria-label="撤回移动"]').disabled);
  check('drag preview leaves data unchanged; release moves once and one undo restores the entire order');

  await pointer(grip(), 'pointerdown', 422, 259);
  await pointer(grip(), 'pointermove', 542, 423);
  assert($('.ov-preview').classList.contains('is-cancelled'));
  await pointer(grip(), 'pointerup', 542, 423);
  assert.deepEqual(order(), baseline);
  await pointer(grip(), 'pointerdown', 422, 259);
  await pointer(grip(), 'pointermove', 422, 423);
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); await settle();
  await pointer(grip(), 'pointerup', 422, 423);
  assert.deepEqual(order(), baseline);
  check('horizontal departure and Escape cancel without saving or creating undo history');

  await sample('long');
  const longBaseline = order();
  assert.equal(longBaseline.length, 36);
  assert.equal(document.querySelectorAll('.ov-row').length, 35);
  await pointer(grip(), 'pointerdown', 422, 173);
  await pointer(grip(), 'pointermove', 422, 490);
  assert.equal(Number($('.ov-landing').dataset.target), 35);
  assert.equal(document.querySelectorAll('.is-neighbor').length, 1);
  assert.deepEqual(order(), longBaseline);
  await pointer(grip(), 'pointerup', 422, 490);
  assert.equal(order().at(-1), longBaseline[5]);
  assert($('[aria-label="下移评论，长按连续移动"]').disabled);
  await click('[aria-label="撤回移动"]');
  assert.deepEqual(order(), longBaseline);
  check('the long sample reaches the final position and retains all comments; undo restores all positions');

  const down = $('[aria-label="下移评论，长按连续移动"]');
  await pointer(down, 'pointerdown', 422, 520);
  await new Promise(resolve => setTimeout(resolve, 760));
  assert(Number($('.ov-landing').dataset.target) >= 7);
  assert.deepEqual(order(), longBaseline);
  await pointer(down, 'pointerup', 422, 520);
  assert.notDeepEqual(order(), longBaseline);
  await click('[aria-label="撤回移动"]');
  assert.deepEqual(order(), longBaseline);
  check('holding an arrow previews several targets and saves only once on release');

  await sample('five');
  const five = order();
  assert.equal(five.length, 5);
  assert($('.ov-comment:nth-child(3) img'));
  grip().dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'End' })); await settle();
  assert.equal(order().at(-1), five[0]);
  await click('[aria-label="撤回移动"]');
  assert.deepEqual(order(), five);
  check('the five-comment fixture includes its third-row image; keyboard positioning and undo work');
  assert.deepEqual(errors, []);
  const report = { layer: 'built standalone HTML in jsdom; synthetic pointer events and geometry', checks, errors, visualBrowserVerification: false, nativeVerification: false };
  fs.writeFileSync(new URL('./checks.json', file), JSON.stringify(report, null, 2) + '\n');
  console.log(fileURLToPath(new URL('./checks.json', file)));
} finally { dom.window.close(); }
