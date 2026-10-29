import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dragTarget, clampDrag } from './commentDragGeometry.mjs';

// Keep capture on the mounted pane, not on a row that may change after a snapshot.
export default function useCommentDragOverview({ paneRef, snapshot, disabled, contextKey, onClaim, onCommit }) {
  const latest = useRef(null), session = useRef(null), mounted = useRef(true);
  const [frame, setFrame] = useState(null);
  latest.current = { snapshot, disabled, contextKey, onClaim, onCommit };

  function finish(commit = false) {
    const s = session.current;
    if (!s) return;
    session.current = null;
    s.pane.classList.remove('comment-drag-active');
    s.hidden.forEach(([element, inert]) => { element.inert = inert; });
    try { if (s.pane.hasPointerCapture?.(s.pointerId)) s.pane.releasePointerCapture(s.pointerId); } catch (_) {}
    if (mounted.current) setFrame(null);
    if (s.trigger.isConnected) s.trigger.focus({ preventScroll: true });
    const current = latest.current;
    if (commit && s.active && !s.cancelled && s.target !== s.from &&
      !current.disabled && current.snapshot === s.snapshot && current.contextKey === s.contextKey) {
      // The caller owns mutation locking, persistence receipts and error feedback.
      Promise.resolve(current.onCommit(s.snapshot, s.from, s.target)).catch(() => {});
    }
  }
  function preview(s) { if (mounted.current) setFrame({ ...s }); }
  function activate(s) {
    latest.current.onClaim();
    s.active = true;
    s.hidden = [...s.pane.children].map(element => [element, element.inert]);
    s.hidden.forEach(([element]) => { element.inert = true; });
    s.pane.classList.add('comment-drag-active');
  }
  function move(event) {
    const s = session.current;
    if (!s || s.keyboard || event.pointerId !== s.pointerId) return;
    if (latest.current.disabled || latest.current.snapshot !== s.snapshot) return finish();
    if (!s.active && Math.hypot(event.clientX - s.x, event.clientY - s.y) <= 6) return;
    event.preventDefault();
    if (!s.active) activate(s);
    s.currentY = event.clientY;
    s.cancelled = Math.abs(event.clientX - s.x) > 100 || event.clientY < s.rect.top - 55 || event.clientY > s.rect.bottom + 55;
    s.target = dragTarget(s.from, s.snapshot.comments.length, event.clientY, s.y, s.top, s.bottom);
    preview(s);
  }
  function begin(event, index, keyboard = false) {
    const current = latest.current;
    if (session.current || current.disabled || current.snapshot.comments.length < 2) return;
    if (!keyboard && (event.button !== 0 || event.isPrimary === false)) return;
    const from = current.snapshot.comments.findIndex(c => c.index === index);
    if (from < 0 || current.snapshot.comments[from].capabilities?.canMove !== true) return;
    event.preventDefault(); event.stopPropagation();
    const pane = paneRef.current, r = pane?.getBoundingClientRect();
    if (!r || r.height < 160 || r.width < 100) return;
    const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    const grip = event.currentTarget.getBoundingClientRect();
    const s = { snapshot: current.snapshot, contextKey: current.contextKey, pane, rect, trigger: event.currentTarget,
      from, target: from, x: keyboard ? grip.left : event.clientX, y: keyboard ? grip.top + grip.height / 2 : event.clientY,
      pointerId: event.pointerId, keyboard, active: false, cancelled: false, hidden: [], top: rect.top + 82, bottom: rect.bottom - 55 };
    session.current = s;
    if (keyboard) { activate(s); preview(s); }
    else { try { pane.setPointerCapture?.(event.pointerId); } catch (_) {} }
  }
  useLayoutEffect(() => { finish(); }, [snapshot, disabled, contextKey]);
  useEffect(() => {
    mounted.current = true;
    const end = event => { const s = session.current; if (!s || s.keyboard || s.pointerId !== event.pointerId) return; if (s.active) move(event); finish(true); };
    const abort = event => { if (event.pointerId === session.current?.pointerId) finish(); };
    const anotherPointer = event => { if (session.current && event.pointerId !== session.current.pointerId) finish(); };
    const cancel = () => finish();
    const visibility = () => { if (document.hidden) finish(); };
    const touch = event => { if (event.touches.length > 1 && session.current) { event.stopImmediatePropagation(); finish(); } };
    const key = event => {
      const s = session.current;
      if (!s || event.isComposing || event.keyCode === 229) return;
      if (['Escape', 'Tab'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); finish(); return; }
      if (!s.keyboard || !['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (['Enter', ' '].includes(event.key)) return finish(true);
      s.target = event.key === 'Home' ? 0 : event.key === 'End' ? s.snapshot.comments.length - 1 : clampDrag(s.target + (event.key === 'ArrowUp' ? -1 : 1), 0, s.snapshot.comments.length - 1);
      preview(s);
    };
    const pane = paneRef.current;
    document.addEventListener('pointermove', move, { passive: false, capture: true });
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', abort, true);
    document.addEventListener('pointerdown', anotherPointer, true);
    document.addEventListener('touchstart', touch, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', visibility);
    pane?.addEventListener('lostpointercapture', abort);
    window.addEventListener('blur', cancel); window.addEventListener('resize', cancel);
    window.addEventListener('scroll', cancel, true);
    window.visualViewport?.addEventListener('resize', cancel);
    window.visualViewport?.addEventListener('scroll', cancel);
    // Resizing a floating panel need not resize its WebView window.
    let size = null;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      // overflow:hidden removes the scrollbar during a drag. That changes the
      // content box, not the panel bounds, and must not cancel the gesture.
      const r = pane.getBoundingClientRect(), next = `${r.width}:${r.height}`;
      if (size !== null && next !== size) finish();
      size = next;
    }) : null;
    observer?.observe(pane);
    return () => {
      mounted.current = false; finish(); observer?.disconnect();
      document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', abort, true); document.removeEventListener('pointerdown', anotherPointer, true);
      document.removeEventListener('touchstart', touch, true); document.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', visibility); pane?.removeEventListener('lostpointercapture', abort);
      window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
      window.removeEventListener('scroll', cancel, true);
      window.visualViewport?.removeEventListener('resize', cancel);
      window.visualViewport?.removeEventListener('scroll', cancel);
    };
  }, [paneRef]);
  return { frame, begin, cancel: () => finish(), isActive: () => !!session.current };
}
