export const GESTURE_THRESHOLD = 8;
export const EDGE_ZONE = 56;
const centroid = points => ({ x: (points[0].clientX + points[1].clientX) / 2, y: (points[0].clientY + points[1].clientY) / 2 });
const distance = points => Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);

export function gestureSelection(baseline, ids, anchor, end, remove) {
  const next = new Set(baseline);
  const a = ids.indexOf(anchor), b = ids.indexOf(end);
  if (a < 0 || b < 0) return next;
  ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(id => remove ? next.delete(id) : next.add(id));
  return next;
}

export function edgeVelocity(y, top, bottom) {
  const zone = Math.min(EDGE_ZONE, Math.max(0, (bottom - top) / 3));
  if (!zone) return 0;
  const direction = y < top + zone ? -1 : y > bottom - zone ? 1 : 0;
  const depth = direction < 0 ? (top + zone - y) / zone : (y - bottom + zone) / zone;
  return direction * 720 * Math.pow(Math.min(1, Math.max(0, depth)), 1.5);
}

// Compare common translation with differential motion only before recognition.
// A recognised pan stays a pan even if the fingers drift farther apart.
export function classifyTwoFingerMotion(origins, points) {
  const deltas = points.map((p, i) => ({ x: p.clientX - origins[i].clientX, y: p.clientY - origins[i].clientY }));
  const x = (deltas[0].x + deltas[1].x) / 2, y = (deltas[0].y + deltas[1].y) / 2;
  const common = Math.hypot(x, y);
  const relative = Math.hypot(deltas[0].x - deltas[1].x, deltas[0].y - deltas[1].y) / 2;
  const separation = Math.abs(distance(points) - distance(origins));
  if (separation >= Math.max(12, distance(origins) * 0.1) && separation > common * 1.35 && relative >= common * 0.8) return 'pinch';
  if (Math.abs(x) >= 24 && Math.abs(x) > Math.abs(y) * 2 && common > relative * 1.1) return 'horizontal';
  if (Math.abs(y) >= GESTURE_THRESHOLD && Math.abs(y) >= Math.abs(x) * 0.75 && common > relative * 1.1) return 'pan';
  return 'pending';
}

// Touch listeners must exist before contact: registering on the second touch is
// too late for some WebKit scrolling paths. Never disable one-finger scrolling.
export function attachTwoFingerSelection(element, options) {
  let session = null, blocked = false, frame = null, lastFrame = null, suppressUntil = 0;
  const win = element.ownerDocument.defaultView;
  const touches = event => Array.from(event.touches || []);
  const interactive = target => target?.closest?.('button,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"],#native-excerpt,.comment-module-head,.demo-module-head,.insert-target');
  const stopFrame = () => { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; lastFrame = null; };
  const report = message => options.onStatus?.(message);
  const sameSelection = (a, b) => a === b || (a.size === b.size && [...a].every(id => b.has(id)));
  const cancel = (reason, { restore = true } = {}) => {
    if (session) {
      // A cancelled pair must lift before another pair can claim selection.
      blocked = true;
      if (restore) {
        if (sameSelection(options.getSelection(), session.selection)) {
          if (!sameSelection(session.selection, session.baseline)) options.setSelection(new Set(session.baseline));
          report(reason || '手势已取消，恢复原有选区');
        }
        else report('选区已更新，双指手势已结束');
      }
      suppressUntil = Date.now() + 500;
    }
    session = null; stopFrame(); options.onFinish?.();
  };
  const continueSession = () => {
    if (!session) return false;
    const selected = options.getSelection();
    if (selected !== session.selection) {
      if (!sameSelection(selected, session.selection)) {
        // An explicit toolbar/keyboard selection takes precedence over this range.
        cancel(undefined, { restore: false }); report('选区已更新，双指手势已结束'); return false;
      }
      session.selection = selected;
    }
    if (options.disabled?.() || !element.isConnected) { cancel(); return false; }
    return true;
  };
  const updateAt = y => {
    if (!session?.active) return;
    const id = options.hitTest(y);
    if (id === null || id === undefined || !session.positions.has(id)) return;
    const end = session.positions.get(id);
    if (session.appliedEnd === end) return;
    const a = session.anchorPosition, lo = Math.min(a, end), hi = Math.max(a, end);
    const previousLo = session.appliedEnd === null ? a : Math.min(a, session.appliedEnd);
    const previousHi = session.appliedEnd === null ? a - 1 : Math.max(a, session.appliedEnd);
    const next = new Set(session.selection);
    // Restore only rows leaving the interval; preserve unrelated baseline rows.
    const restore = (from, to) => { for (let i = from; i <= to; i++) session.baseline.has(session.ids[i]) ? next.add(session.ids[i]) : next.delete(session.ids[i]); };
    const apply = (from, to) => { for (let i = from; i <= to; i++) session.remove ? next.delete(session.ids[i]) : next.add(session.ids[i]); };
    restore(previousLo, Math.min(previousHi, lo - 1));
    restore(Math.max(previousLo, hi + 1), previousHi);
    apply(lo, Math.min(hi, previousLo - 1));
    apply(Math.max(lo, previousHi + 1), hi);
    session.appliedEnd = end;
    if (!sameSelection(next, session.selection)) { session.selection = next; options.setSelection(next); }
  };
  const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(tick); };
  const flush = () => {
    if (!continueSession() || !session.active) return;
    if (session.dirty) {
      session.dirty = false;
      const rect = element.getBoundingClientRect();
      updateAt(Math.max(rect.top + 1, Math.min(rect.bottom - 1, session.y)));
    }
  };
  const tick = time => {
    frame = null;
    if (!continueSession() || !session.active) return;
    const rect = element.getBoundingClientRect();
    const velocity = edgeVelocity(session.y, rect.top, rect.bottom);
    const dt = lastFrame === null ? 16 : Math.min(40, Math.max(0, time - lastFrame));
    lastFrame = time;
    let scrolled = false, keepScrolling = false;
    if (velocity) {
      const before = element.scrollTop, limit = Math.max(0, element.scrollHeight - element.clientHeight);
      const direction = Math.sign(velocity);
      if (session.scrollPosition === undefined || session.lastActualScroll !== before || session.scrollDirection !== direction) session.scrollPosition = before;
      // Some WebViews quantise scrollTop. Accumulate fractional motion instead
      // of abandoning slow edge scrolling after the first sub-pixel frame.
      session.scrollPosition = Math.max(0, Math.min(limit, session.scrollPosition + velocity * dt / 1000));
      element.scrollTop = session.scrollPosition;
      session.lastActualScroll = element.scrollTop; session.scrollDirection = direction;
      scrolled = element.scrollTop !== before;
      keepScrolling = direction < 0 ? session.scrollPosition > 0 : session.scrollPosition < limit;
      if (scrolled) session.dirty = true;
    } else session.scrollPosition = undefined;
    if (session.dirty) {
      session.dirty = false;
      updateAt(Math.max(rect.top + 1, Math.min(rect.bottom - 1, session.y)));
    }
    if (keepScrolling) schedule(); else lastFrame = null;
  };
  const start = event => {
    const points = touches(event);
    // A fresh single contact also recovers after a lost release on app switch.
    if (points.length === 1 && !session) blocked = false;
    if (points.length > 2) { cancel('额外触点已取消多选'); blocked = true; return; }
    if (points.length !== 2 || blocked || session || options.disabled?.()) return;
    if (points.some(p => p.touchType === 'stylus' || !element.contains(p.target || event.target) || interactive(p.target || event.target)) || interactive(event.target)) { blocked = true; return; }
    const point = centroid(points);
    const ids = [...options.getVisibleIds()];
    const anchor = options.hitTest(point.y, { start: true, x: point.x });
    if (anchor === null || anchor === undefined || !ids.includes(anchor)) { blocked = true; options.onFinish?.(); return; }
    // If the browser has already committed scrolling, fail without a selection.
    if (!event.cancelable) { report('当前滚动已接管触摸，请抬手后同时放下双指'); blocked = true; options.onFinish?.(); return; }
    event.preventDefault();
    options.onClaim?.();
    const selection = options.getSelection(), baseline = new Set(selection);
    session = { baseline, selection, anchor, ids, positions: new Map(ids.map((id, i) => [id, i])), anchorPosition: ids.indexOf(anchor), appliedEnd: null, remove: baseline.has(anchor), origins: points.map(p => ({ identifier: p.identifier, clientX: p.clientX, clientY: p.clientY })), touchIds: points.map(p => p.identifier).sort().join(','), y: point.y, active: false, dirty: false };
    suppressUntil = Date.now() + 500;
    report('已检测双指，纵向滑动后开始多选');
  };
  const move = event => {
    if (!continueSession()) return;
    const incoming = touches(event);
    const points = session.origins.map(origin => incoming.find(p => p.identifier === origin.identifier));
    if (incoming.length !== 2 || points.some(p => !p) || options.disabled?.()) { cancel(); blocked = true; return; }
    if (!event.cancelable) { cancel('触摸被系统接管，恢复原有选区'); blocked = true; return; }
    const point = centroid(points);
    event.preventDefault();
    if (!session.active) {
      const intent = classifyTwoFingerMotion(session.origins, points);
      if (intent === 'pinch' || intent === 'horizontal') { cancel(intent === 'pinch' ? '捏合未进入多选，请抬手后重新缩放' : '横向滑动未进入多选'); return; }
      if (intent !== 'pan') return;
      session.active = true;
      report(session.remove ? '双指取消选择 · 抬手保留选区' : '双指连续选择 · 抬手保留选区');
    }
    session.y = point.y; session.dirty = true; schedule();
  };
  const end = event => {
    const points = touches(event);
    continueSession();
    if (session && (points.length > 2 || points.some(p => !session.touchIds.split(',').includes(String(p.identifier))))) cancel();
    if (session && points.length < 2) {
      // A release can precede the requested frame: apply the final pending range.
      flush();
      const active = session?.active;
      session = null; stopFrame(); options.onFinish?.(); suppressUntil = Date.now() + 500;
      report(active ? '双指选择完成，选区已保留' : '双指未达到滑动阈值，选区保持原样');
      blocked = points.length > 0;
    }
    if (points.length === 0) blocked = false;
  };
  // An extra finger may land outside the pane. Observe only interruption events
  // on the document; ordinary single-finger scrolling remains untouched.
  const extraContact = event => { if (session && touches(event).length > 2) { cancel('额外触点已取消多选'); blocked = true; } };
  const touchCancel = event => { cancel(); blocked = touches(event).length > 0; };
  const loseFocus = () => cancel('页面已离开，恢复原有选区');
  const visibility = () => { if (element.ownerDocument.hidden) loseFocus(); };
  const click = event => {
    // Keyboard activation has no pointer click count; only suppress touch's
    // synthetic click after release, not subsequent keyboard operation.
    if (!session && event.detail === 0) return;
    if (session || Date.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); }
  };
  const listeners = { touchstart: start, touchmove: move };
  for (const [name, handler] of Object.entries(listeners)) element.addEventListener(name, handler, { passive: false, capture: true });
  element.addEventListener('click', click, true);
  element.ownerDocument.addEventListener('touchstart', extraContact, { passive: true, capture: true });
  element.ownerDocument.addEventListener('touchend', end, { passive: true, capture: true });
  element.ownerDocument.addEventListener('touchcancel', touchCancel, { passive: true, capture: true });
  element.ownerDocument.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', loseFocus);
  win.addEventListener('pagehide', loseFocus);
  return {
    cancel,
    get active() { return session !== null; },
    destroy() {
      cancel(undefined, { restore: false });
      for (const [name, handler] of Object.entries(listeners)) element.removeEventListener(name, handler, true);
      element.removeEventListener('click', click, true);
      element.ownerDocument.removeEventListener('touchstart', extraContact, true);
      element.ownerDocument.removeEventListener('touchend', end, true);
      element.ownerDocument.removeEventListener('touchcancel', touchCancel, true);
      element.ownerDocument.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('blur', loseFocus);
      win.removeEventListener('pagehide', loseFocus);
    },
  };
}
