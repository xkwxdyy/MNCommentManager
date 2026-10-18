// Shared, independently bundled native geometry. Keep sibling copies byte-identical.
var __MN_ADDON_FLOATING_LAYOUT__ = (function () {
  const root = typeof globalThis !== "undefined" ? globalThis : Function("return this")();
  if (root.__MN_ADDON_FLOATING_LAYOUT_V1__) return root.__MN_ADDON_FLOATING_LAYOUT_V1__;
  return root.__MN_ADDON_FLOATING_LAYOUT_V1__ = (function () {
  const ranks = { 9205101: 10, 9205103: 10, 762041: 20, 9304102: 30, 9304103: 30, 9304101: 40 };
  const holds = [];
  function same(a, b) {
    try { return a === b || !!(a && b && typeof a.isEqual === "function" && a.isEqual(b)); } catch (_) { return false; }
  }
  function array(raw) {
    try {
      if (Array.isArray(raw)) return raw;
      const n = raw && (typeof raw.count === "function" ? Number(raw.count()) : Number(raw.length === undefined ? raw.count : raw.length));
      if (!Number.isInteger(n) || n < 0) return [];
      const out = [];
      for (let i = 0; i < Math.min(n, 257); i++) out.push(typeof raw.objectAtIndex === "function" ? raw.objectAtIndex(i) : raw[i]);
      return out;
    } catch (_) { return []; }
  }
  function rect(r) {
    if (!r) return null;
    const out = { x: Number(r.x === undefined ? 0 : r.x), y: Number(r.y === undefined ? 0 : r.y), width: Number(r.width), height: Number(r.height) };
    return Object.keys(out).every(k => Number.isFinite(out[k])) && out.width > 0 && out.height > 0 ? out : null;
  }
  function intersect(a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return rect({ x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y });
  }
  function converted(view, host) {
    try {
      if (same(view, host)) return rect(host.bounds);
      if (typeof view.convertRectToView === "function") return rect(view.convertRectToView(view.bounds, host));
      const r = rect(view.frame);
      if (!r) return null;
      let parent = view.superview;
      for (let i = 0; parent && i < 12; i++, parent = parent.superview) {
        if (same(parent, host)) return r;
        const f = rect(parent.frame);
        if (!f) return null;
        r.x += f.x - Number(parent.bounds && parent.bounds.x || 0);
        r.y += f.y - Number(parent.bounds && parent.bounds.y || 0);
      }
    } catch (_) {}
    return null;
  }
  function visibleRect(view, host) {
    try {
      if (!view || !host || (view.window && host.window && !same(view.window, host.window))) return null;
      let found = false, clip = rect(host.bounds);
      if (!clip) return null;
      for (let v = view, depth = 0; v && depth < 14; v = v.superview, depth++) {
        if (v.hidden === true || (v.alpha !== undefined && Number(v.alpha) < 0.01) ||
            (v.layer && v.layer.opacity !== undefined && Number(v.layer.opacity) < 0.01)) return null;
        if (same(v, host)) { found = true; break; }
        if (v !== view && v.clipsToBounds) {
          const bounds = converted(v, host);
          clip = bounds && intersect(clip, bounds);
          if (!clip) return null;
        }
      }
      const r = found && converted(view, host);
      return r ? intersect(r, clip) : null;
    } catch (_) { return null; }
  }
  function content(view) {
    try {
      // Do not walk document/card content in search of its embedded controls.
      if (view.noteId || view.noteid) return true;
      if (typeof view.isKindOfClass === "function") {
        if (typeof UIScrollView !== "undefined" && view.isKindOfClass(UIScrollView)) return true;
        if (typeof UIWebView !== "undefined" && view.isKindOfClass(UIWebView)) return true;
      }
      const name = String(typeof view.class === "function" ? view.class() : view.className || "");
      return /scroll|webview|textview|mindmap|pdf|collection|table|notecell|cardcell/i.test(name);
    } catch (_) { return true; }
  }
  function control(view) {
    try {
      return typeof view.addTargetActionForControlEvents === "function" || (view.userInteractionEnabled !== false && array(view.gestureRecognizers).length > 0);
    } catch (_) { return false; }
  }
  function held(view) {
    for (let i = holds.length - 1; i >= 0; i--) {
      if (holds[i].until <= Date.now()) holds.splice(i, 1);
      else if (same(holds[i].view, view)) return true;
    }
    return false;
  }
  function release(views) {
    for (let i = holds.length - 1; i >= 0; i--) {
      if (holds[i].until <= Date.now() || (views || []).some(v => same(v, holds[i].view))) holds.splice(i, 1);
    }
  }
  function freeze(views, duration) {
    release(views);
    (views || []).filter(Boolean).forEach(view => holds.push({ view, until: Date.now() + Math.max(0, Number(duration) || 900) }));
  }
  function collect(host, options) {
    const opts = options || {}, out = [], own = opts.ownViews || [];
    let budget = 256;
    function walk(parent, depth) {
      if (depth > 6) return;
      const children = array(parent.subviews);
      for (let i = 0; i < children.length; i++) {
        if (--budget < 0) { out.incomplete = true; return; }
        const view = children[i];
        if (!view || own.some(v => same(v, view))) continue;
        const rank = ranks[Number(view.tag)];
        if (rank === opts.priority || (rank > opts.priority && !held(view))) continue;
        const r = visibleRect(view, host);
        if (!r || content(view)) continue;
        const compact = r.width <= 480 && r.height <= 200 && r.width * r.height <= 70000;
        if (rank || view.mntoolbar === true || (compact && control(view))) { out.push(r); continue; }
        // A clear compact UIView may contain buttons, a label, and an icon.
        if (compact && array(view.subviews).some(child => {
          if (own.some(v => same(v, child))) return false;
          const childRank = ranks[Number(child && child.tag)];
          return !(childRank >= opts.priority && !held(child)) && visibleRect(child, host) && control(child);
        })) { out.push(r); continue; }
        walk(view, depth + 1);
        if (out.incomplete) return;
      }
    }
    if (host) walk(host, 0);
    return out;
  }
  function place(host, options) {
    const opts = options || {}, bounds = rect(host && host.bounds), preferred = rect(opts.preferred);
    if (!bounds || !preferred) return null;
    const width = Number(opts.width || preferred.width), height = Number(opts.height || preferred.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > bounds.width || height > bounds.height) return null;
    const obstacles = collect(host, opts);
    if (obstacles.incomplete) return null;
    (opts.avoid || []).forEach(r => { const clean = rect(r); if (clean) obstacles.push(clean); });
    const gap = 7, candidates = [];
    function candidate(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const f = { x: Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width)), y: Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height)), width, height };
      if (!obstacles.some(r => f.x < r.x + r.width + gap && f.x + width + gap > r.x && f.y < r.y + r.height + gap && f.y + height + gap > r.y)) candidates.push(f);
    }
    // Keep a legal old position stable; only move when its footprint changes.
    const previous = rect(opts.previous);
    if (previous && previous.width === width && previous.height === height) {
      candidate(previous.x, previous.y);
      if (candidates.length) return candidates[0];
    }
    candidate(preferred.x, preferred.y);
    if (candidates.length) return candidates[0];
    const anchor = rect(opts.anchor) || preferred;
    const xs = [preferred.x, anchor.x - width - gap, anchor.x + anchor.width + gap, anchor.x + (anchor.width - width) / 2];
    const ys = [preferred.y, anchor.y - height - gap, anchor.y + anchor.height + gap, anchor.y + (anchor.height - height) / 2];
    obstacles.forEach(r => { xs.push(r.x - width - gap, r.x + r.width + gap); ys.push(r.y - height - gap, r.y + r.height + gap); });
    // The budget bounds both native reads and the candidate cross product.
    xs.slice(0, 48).forEach(x => ys.slice(0, 48).forEach(y => candidate(x, y)));
    candidates.sort((a, b) => (Math.abs(a.x - preferred.x) + Math.abs(a.y - preferred.y)) - (Math.abs(b.x - preferred.x) + Math.abs(b.y - preferred.y)));
    return candidates[0] || null;
  }
  function settle(schedule, active, refresh) {
    [0.04, 0.12, 0.3, 0.8, 1.6].forEach(seconds => schedule(seconds, function () { if (active()) refresh(); }));
  }
  return { collect, place, visibleRect, freeze, release, settle };
  })();
})();
