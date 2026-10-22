var __MN_NATIVE_MENU_VISIBILITY_MNCommentManagerAddon = (function () {
  const MAX_VIEWS = 128;
  const MAX_DEPTH = 32;

  // JSBUIView.h exports these view fields and convertRectToView; JSBUIControl.h
  // exports enabled/tracking/touchInside. No private view or focus API is used.
  function rect(value) {
    if (!value || typeof value !== "object") return null;
    const keys = ["x", "y", "width", "height"];
    if (!keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return null;
    if (value.width <= 0 || value.height <= 0) return null;
    if (!Number.isFinite(value.x + value.width) || !Number.isFinite(value.y + value.height)) return null;
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }

  function contains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height;
  }

  function object(value) {
    return value !== null && typeof value === "object";
  }

  function visibleChain(button, menu, window) {
    const seen = [];
    const chain = [];
    let view = button;
    let containsMenu = false;
    while (view) {
      if (!object(view) || seen.indexOf(view) >= 0 || seen.length >= MAX_DEPTH) return false;
      seen.push(view);
      // A real UIWindow may report window=nil; reaching this exact root object
      // establishes attachment without requiring the root to reference itself.
      if ((view !== window && view.window !== window) || view.hidden !== false ||
        typeof view.alpha !== "number" || !Number.isFinite(view.alpha) || view.alpha <= 0.01 ||
        view.userInteractionEnabled !== true || typeof view.clipsToBounds !== "boolean" ||
        typeof view.convertRectToView !== "function") return false;
      if (view === button ? view.enabled !== true : view.enabled !== undefined && view.enabled !== true) return false;
      const bounds = rect(view.bounds);
      if (!bounds) return false;
      chain.push({ view, bounds });
      if (view === menu) containsMenu = true;
      if (view === window) break;
      view = view.superview;
    }
    if (view !== window || !containsMenu || button === menu) return false;
    const windowBounds = chain[chain.length - 1].bounds;
    const buttonRect = rect(button.convertRectToView(chain[0].bounds, window));
    if (!buttonRect || !contains(windowBounds, buttonRect)) return false;
    for (let index = 1; index < chain.length - 1; index += 1) {
      const ancestor = chain[index];
      if (!ancestor.view.clipsToBounds) continue;
      const clipRect = rect(ancestor.view.convertRectToView(ancestor.bounds, window));
      if (!clipRect || !contains(clipRect, buttonRect)) return false;
    }
    return true;
  }

  function find(menu, title, window) {
    try {
      if (!object(menu) || !object(window) || menu === window || typeof title !== "string" || !title) return null;
      const pending = [{ view: menu, depth: 0 }];
      const seen = [];
      const matches = [];
      while (pending.length) {
        const entry = pending.pop();
        const view = entry.view;
        if (!object(view) || entry.depth > MAX_DEPTH || seen.indexOf(view) >= 0 || seen.length >= MAX_VIEWS) return null;
        seen.push(view);
        if (typeof view.titleForState === "function") {
          if (view.titleForState(0) === title) matches.push(view);
        } else if (view.titleForState !== undefined) return null;
        const children = view.subviews;
        if (!children || typeof children.length !== "number" || !Number.isInteger(children.length) ||
          children.length < 0 || children.length > MAX_VIEWS || seen.length + pending.length + children.length > MAX_VIEWS) return null;
        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];
          if (!object(child) || child.superview !== view) return null;
          pending.push({ view: child, depth: entry.depth + 1 });
        }
      }
      return matches.length === 1 && visibleChain(matches[0], menu, window) ? matches[0] : null;
    } catch (_) {
      return null;
    }
  }

  function interactiveControl(control) {
    if (!object(control) || control.enabled !== true || !object(control.window)) return false;
    const window = control.window;
    const seen = [];
    let view = control;
    while (view) {
      if (!object(view) || seen.indexOf(view) >= 0 || seen.length >= MAX_DEPTH) return false;
      seen.push(view);
      if ((view !== window && view.window !== window) || view.hidden !== false ||
        typeof view.alpha !== "number" || !Number.isFinite(view.alpha) || view.alpha <= 0.01 ||
        view.userInteractionEnabled !== true || (view.enabled !== undefined && view.enabled !== true)) return false;
      if (view === window) return true;
      view = view.superview;
    }
    return false;
  }

  function isBusy(views) {
    // JSBUIResponder.h exposes isFirstResponder(). These positive states do not
    // establish the absence of keyboard or accessibility focus on other views.
    // touchInside only describes the touch position; it can remain true after
    // tracking ends. Dynamic actions separately protect their active hold state.
    try {
      if (!Array.isArray(views)) return false;
      return views.some((view) => interactiveControl(view) && (view.tracking === true ||
        (typeof view.isFirstResponder === "function" && view.isFirstResponder() === true)));
    } catch (_) {
      return true;
    }
  }

  return { find, isBusy };
})();
