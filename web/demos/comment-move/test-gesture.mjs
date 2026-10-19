import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMoveGesture, indexFromDrag } from './moveGesture.mjs';

const comments = Array.from({ length: 20 }, (_, index) => ({ id: `comment-${index}` }));
const start = { sourceId: comments[4].id, comments, startIndex: 4, pointerId: 7, x: 100, y: 200 * 4 / 19, top: 0, bottom: 200 };

function setup(t, callbacks = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const previews = [], commits = [], taps = [];
  const gesture = createMoveGesture({
    onPreview: value => { previews.push(value); callbacks.onPreview?.(value); },
    onCommit: value => { commits.push(value); callbacks.onCommit?.(value); },
    onTap: value => taps.push(value),
  });
  t.after(() => gesture.dispose());
  return { gesture, previews, commits, taps, tick: milliseconds => t.mock.timers.tick(milliseconds) };
}

test('equal track distances traverse equal index distances across short and long lists', () => {
  for (const count of [2, 3, 14, 50, 200]) {
    const step = 20, top = 40, bottom = top + step * (count - 1);
    for (let target = 0; target < count; target++) {
      assert.equal(indexFromDrag(count, top + target * step, top, bottom), target);
    }
  }
  assert.equal(indexFromDrag(1, 200, 20, 220), 0);
});

test('after activation the thumb follows pointer coordinates regardless of the original comment or grip offset', t => {
  const { gesture, previews } = setup(t);
  for (const source of [0, 6, 13]) {
    for (const origin of [70, 360, 750]) {
      gesture.begin({ ...start, kind: 'drag', comments: comments.slice(0, 14), startIndex: source, y: origin, top: 22, bottom: 282 });
      gesture.update({ pointerId: 7, x: 100, y: 200 });
      for (const y of [22, 82, 151, 152, 153, 222, 282]) {
        gesture.update({ pointerId: 7, x: 100, y });
        assert.equal(previews.at(-1).thumbY, y);
        assert.equal(previews.at(-1).targetIndex, Math.round((y - 22) / 20));
      }
      gesture.cancel();
    }
  }
});

test('last of fourteen uses the whole track and its preview thumb matches the target', t => {
  const { gesture, previews, commits } = setup(t);
  const fourteen = comments.slice(0, 14);
  gesture.begin({ ...start, kind: 'drag', comments: fourteen, startIndex: 13, y: 360, top: 22, bottom: 282 });
  gesture.update({ pointerId: 7, x: 100, y: 220 });
  assert.equal(previews.at(-1).targetIndex, 10);
  assert.equal(previews.at(-1).thumbY, 220);
  gesture.update({ pointerId: 7, x: 100, y: 152 });
  assert.equal(previews.at(-1).targetIndex, 7);
  assert.equal(previews.at(-1).thumbY, 152);
  gesture.update({ pointerId: 7, x: 100, y: 500 });
  assert.equal(previews.at(-1).targetIndex, 13);
  assert.equal(previews.at(-1).thumbY, 282);
  gesture.end({ pointerId: 7 });
  assert.equal(commits.length, 0);
});

test('drag previews several positions, clamps the thumb and commits only once with the original snapshot', t => {
  const { gesture, previews, commits, taps } = setup(t);
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 8, x: 100, y: 180 });
  gesture.end({ pointerId: 8 });
  assert.equal(previews.length, 0);
  gesture.update({ pointerId: 7, x: 100, y: 150 });
  assert.equal(previews.at(-1).targetIndex, 14);
  assert.equal(previews.at(-1).comments, comments);
  gesture.update({ pointerId: 7, x: 100, y: -30 });
  assert.equal(previews.at(-1).targetIndex, 0);
  assert.equal(previews.at(-1).thumbY, 0);
  gesture.update({ pointerId: 7, x: 100, y: 300 });
  assert.equal(previews.at(-1).targetIndex, 19);
  assert.equal(previews.at(-1).thumbY, 200);
  gesture.end({ pointerId: 7 });
  gesture.end({ pointerId: 7 });
  assert.deepEqual(commits, [{ comments, sourceId: start.sourceId, targetIndex: 19 }]);
  assert.equal(previews.at(-1), null);
  assert.equal(taps.length, 0);
});

test('small pointer jitter remains a tap; an activated drag returning to its start is not a tap', t => {
  const { gesture, previews, commits, taps } = setup(t);
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 102, y: start.y + 6 });
  gesture.end({ pointerId: 7 });
  assert.equal(previews.filter(Boolean).length, 0);
  assert.equal(taps.length, 1);
  assert.equal(taps[0].kind, 'drag');
  assert.equal(taps[0].comments, comments);
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 100, y: 160 });
  gesture.update({ pointerId: 7, x: 100, y: start.y });
  gesture.end({ pointerId: 7 });
  assert.equal(taps.length, 1);
  assert.equal(commits.length, 0);
});

test('horizontal departure cancels a drag but returning to the rail restores it', t => {
  const { gesture, previews, commits } = setup(t);
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 181, y: 150 });
  assert.equal(previews.at(-1).cancelled, true);
  gesture.end({ pointerId: 7 });
  assert.equal(commits.length, 0);
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 181, y: 150 });
  gesture.update({ pointerId: 7, x: 180, y: 150 });
  assert.equal(previews.at(-1).cancelled, false);
  gesture.end({ pointerId: 7 });
  assert.equal(commits.length, 1);
});

test('a short arrow press taps; a long press previews at a faster rate and commits once on release', t => {
  const { gesture, previews, commits, taps, tick } = setup(t);
  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  tick(449);
  gesture.end({ pointerId: 7 });
  assert.equal(taps.length, 1);
  assert.equal(taps[0].direction, 1);
  tick(1000);
  assert.equal(previews.filter(Boolean).length, 0);

  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  tick(450);
  assert.equal(previews.at(-1).targetIndex, 5);
  for (let index = 0; index < 5; index++) tick(260);
  assert.equal(previews.at(-1).targetIndex, 10);
  tick(139);
  assert.equal(previews.at(-1).targetIndex, 10);
  tick(1);
  assert.equal(previews.at(-1).targetIndex, 11);
  assert.equal(commits.length, 0);
  gesture.end({ pointerId: 7 });
  gesture.end({ pointerId: 7 });
  tick(2000);
  assert.deepEqual(commits, [{ comments, sourceId: start.sourceId, targetIndex: 11 }]);
  assert.equal(taps.length, 1);
});

test('holding at an edge stops timers while retaining the session until release', t => {
  const { gesture, previews, commits, taps, tick } = setup(t);
  gesture.begin({ ...start, startIndex: 1, sourceId: comments[1].id, kind: 'hold', direction: -1 });
  tick(450);
  assert.equal(previews.at(-1).targetIndex, 0);
  const previewCount = previews.length;
  tick(20000);
  assert.equal(previews.length, previewCount);
  assert.equal(commits.length, 0);
  gesture.end({ pointerId: 7 });
  assert.equal(commits[0].targetIndex, 0);
  assert.equal(taps.length, 0);
});

test('horizontal departure pauses a hold and can be cancelled or restored', t => {
  const { gesture, previews, commits, tick } = setup(t);
  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  tick(450);
  gesture.update({ pointerId: 7, x: 181, y: 100 });
  assert.equal(previews.at(-1).cancelled, true);
  tick(2000);
  assert.equal(previews.at(-1).targetIndex, 5);
  gesture.update({ pointerId: 7, x: 100, y: 100 });
  assert.equal(previews.at(-1).cancelled, false);
  tick(140);
  assert.equal(previews.at(-1).targetIndex, 6);
  gesture.end({ pointerId: 7 });
  assert.equal(commits[0].targetIndex, 6);
});

test('cancel, pointer cancellation, replacement and disposal clear timers and reject old pointers', t => {
  const { gesture, previews, commits, taps, tick } = setup(t);
  for (const stop of [() => gesture.cancel(), () => gesture.end({ pointerId: 7, cancelled: true })]) {
    gesture.begin({ ...start, kind: 'hold', direction: 1 });
    tick(450);
    stop();
    const count = previews.length;
    tick(2000);
    assert.equal(previews.length, count);
  }
  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  gesture.begin({ ...start, pointerId: 9, kind: 'hold', direction: -1 });
  gesture.update({ pointerId: 7, x: 100, y: 200 });
  gesture.end({ pointerId: 7 });
  tick(450);
  assert.equal(previews.at(-1).targetIndex, 3);
  gesture.dispose();
  const count = previews.length;
  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  gesture.end({ pointerId: 9 });
  gesture.cancel();
  tick(2000);
  assert.equal(previews.length, count);
  assert.equal(commits.length, 0);
  assert.equal(taps.length, 0);
});

test('release clears the session before notifying callbacks, so lost-capture reentry cannot commit twice', t => {
  let gesture;
  const result = setup(t, { onPreview: value => { if (value === null) gesture.end({ pointerId: 7 }); } });
  gesture = result.gesture;
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 100, y: 180 });
  gesture.end({ pointerId: 7 });
  assert.equal(result.commits.length, 1);
});

test('disposing during release notification prevents subsequent callbacks', t => {
  let gesture;
  const result = setup(t, { onPreview: value => { if (value === null) gesture.dispose(); } });
  gesture = result.gesture;
  gesture.begin({ ...start, kind: 'drag' });
  gesture.update({ pointerId: 7, x: 100, y: 180 });
  gesture.end({ pointerId: 7 });
  assert.equal(result.commits.length, 0);
  assert.equal(result.taps.length, 0);
});

test('a hold cancelled before activation neither taps nor runs an orphaned timer', t => {
  const { gesture, previews, commits, taps, tick } = setup(t);
  gesture.begin({ ...start, kind: 'hold', direction: 1 });
  gesture.update({ pointerId: 7, x: 181, y: 100 });
  tick(1000);
  gesture.end({ pointerId: 7 });
  tick(1000);
  assert.equal(previews.filter(Boolean).length, 0);
  assert.equal(commits.length, 0);
  assert.equal(taps.length, 0);
});

test('generated JSC core runs cancellation and one-release commits with injected timers, matching the ESM core', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../../../src/CommentMoveGesture.js', import.meta.url), 'utf8'), context);
  assert.equal(vm.runInContext('typeof setTimeout', context), 'undefined');
  assert.equal(vm.runInContext('typeof clearTimeout', context), 'undefined');
  assert.deepEqual(Object.keys(context), ['__MN_COMMENT_MOVE_GESTURE_MNCommentManagerAddon']);
  const native = context.__MN_COMMENT_MOVE_GESTURE_MNCommentManagerAddon;
  assert.deepEqual(Object.keys(native), ['indexFromDrag', 'createMoveGesture']);

  function exercise(create) {
    let clock = 0, nextTimer = 0;
    const timers = new Map(), events = [];
    const gesture = create({
      now: () => clock,
      setTimer: (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, time: clock + delay });
        return id;
      },
      clearTimer: id => timers.delete(id),
      onPreview: value => events.push(['preview', value]),
      onCommit: value => events.push(['commit', value]),
      onTap: value => events.push(['tap', value]),
    });
    function tick(milliseconds) {
      const until = clock + milliseconds;
      for (;;) {
        const next = Array.from(timers).sort((a, b) => a[1].time - b[1].time)[0];
        if (!next || next[1].time > until) break;
        clock = next[1].time;
        timers.delete(next[0]);
        next[1].callback();
      }
      clock = until;
    }

    gesture.begin({ ...start, kind: 'hold', direction: 1 });
    tick(450);
    gesture.cancel();
    tick(2000);
    assert.equal(timers.size, 0);
    gesture.begin({ ...start, kind: 'hold', direction: 1 });
    tick(450);
    assert.equal(gesture.end({ pointerId: 7, cancelled: true }), 'cancelled');
    tick(2000);
    assert.equal(timers.size, 0);
    gesture.begin({ ...start, kind: 'hold', direction: 1 });
    tick(970);
    assert.equal(gesture.end({ pointerId: 7 }), 'committed');
    gesture.end({ pointerId: 7 });
    tick(2000);
    assert.equal(timers.size, 0);
    const commits = events.filter(event => event[0] === 'commit');
    assert.equal(commits.length, 1);
    assert.equal(commits[0][1].targetIndex, 7);
    assert.equal(events.filter(event => event[0] === 'tap').length, 0);
    gesture.dispose();
    return JSON.parse(JSON.stringify(events));
  }

  assert.deepEqual(exercise(native.createMoveGesture), exercise(createMoveGesture));
});
