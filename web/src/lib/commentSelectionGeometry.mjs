const START_GAP = 16;

// Content-space rectangles survive scrolling. Layout changes invalidate them;
// ordinary selection renders don't require scanning every comment again.
export function createCommentHitTester(pane, getVisibleIds, { selector = '[data-comment-index]', getId = node => Number(node.dataset.commentIndex), exclusionSelector = '#native-excerpt,.comment-module-head,.insert-target' } = {}) {
  const win = pane.ownerDocument.defaultView;
  let rows = null, exclusions = [], observed = new Set();
  const invalidate = () => { rows = null; };
  const observer = win.ResizeObserver ? new win.ResizeObserver(invalidate) : null;
  observer?.observe(pane);
  const rebuild = paneRect => {
    const eligible = new Set(getVisibleIds());
    const nextObserved = new Set();
    const offset = pane.scrollTop - paneRect.top - pane.clientTop;
    rows = [];
    for (const node of pane.querySelectorAll(selector)) {
      const id = getId(node);
      if (!eligible.has(id)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0) continue;
      rows.push({ id, top: rect.top + offset, bottom: rect.bottom + offset });
      nextObserved.add(node);
    }
    rows.sort((a, b) => a.top - b.top);
    exclusions = [...pane.querySelectorAll(exclusionSelector)].map(node => {
      const rect = node.getBoundingClientRect();
      nextObserved.add(node);
      return { top: rect.top + offset, bottom: rect.bottom + offset };
    }).filter(rect => rect.bottom > rect.top);
    for (const node of observed) if (!nextObserved.has(node)) observer?.unobserve(node);
    for (const node of nextObserved) if (!observed.has(node)) observer?.observe(node);
    observed = nextObserved;
  };
  const hitTest = (y, { start = false, x } = {}) => {
    const rect = pane.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom || (x !== undefined && (x < rect.left || x > rect.right))) return null;
    if (start) invalidate();
    if (rows === null) rebuild(rect);
    if (!rows.length) return null;
    const position = y - rect.top - pane.clientTop + pane.scrollTop;
    if (start && exclusions.some(zone => position >= zone.top && position <= zone.bottom)) return null;
    let lo = 0, hi = rows.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].bottom < position) lo = mid + 1; else hi = mid; }
    const next = rows[lo], previous = rows[lo - 1];
    if (next && position >= next.top) return next.id;
    const beforeGap = previous ? position - previous.bottom : Infinity;
    const afterGap = next ? next.top - position : Infinity;
    if (start && Math.min(beforeGap, afterGap) > START_GAP) return null;
    return beforeGap <= afterGap ? previous?.id ?? null : next?.id ?? null;
  };
  pane.addEventListener('load', invalidate, true);
  win.addEventListener('resize', invalidate);
  return {
    hitTest, invalidate,
    destroy() { observer?.disconnect(); pane.removeEventListener('load', invalidate, true); win.removeEventListener('resize', invalidate); rows = null; observed.clear(); },
  };
}
