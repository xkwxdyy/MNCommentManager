var __MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon = (function () {
  const CAPSULE_GAP = 8;
  function sameView(left, right) {
    return !!left && !!right && (left === right || typeof left.isEqual === "function" && left.isEqual(right));
  }
  function validRect(rect) {
    return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
  }
  function status(controller, value) {
    if (controller._mncmContentBoundsStatus === value) return;
    controller._mncmContentBoundsStatus = value;
    if (value !== "classic" && value !== "capsule") console.log("[MN Comment Manager][content-bounds] " + value);
  }
  function available(controller, parent, bounds) {
    if (!controller || !parent || !validRect(bounds)) return bounds;
    const window = controller.addon ? controller.addon.window : controller.addonWindow;
    try {
      if (typeof MNUtil === "undefined") { status(controller, "capsule runtime unavailable"); return bounds; }
      if (sameView(MNUtil.currentWindow, window)) {
        if (!MNUtil.immersiveMode) {
          controller._mncmTopCapsuleView = null;
          status(controller, "classic");
          return bounds;
        }
        const view = MNUtil.immersiveNavCapsuleView;
        // Cache only the native view for this controller; its geometry is read on every layout.
        controller._mncmTopCapsuleView = view && sameView(view.window, window) ? view : null;
      }
      const capsule = controller._mncmTopCapsuleView;
      if (!capsule || !sameView(capsule.window, window)) { status(controller, "capsule not identified in this window"); return bounds; }
      for (let view = capsule, depth = 0; view && depth < 32; view = view.superview, depth += 1) {
        if (view.hidden) { status(controller, "capsule hidden"); return bounds; }
        if (sameView(view, window)) break;
      }
      const rect = capsule.convertRectToView(capsule.bounds, parent);
      if (!validRect(rect)) { status(controller, "capsule geometry invalid"); return bounds; }
      if (rect.x + rect.width <= bounds.x || rect.x >= bounds.x + bounds.width || rect.y + rect.height <= bounds.y) {
        status(controller, "capsule");
        return bounds;
      }
      const top = Math.max(bounds.y, rect.y + rect.height + CAPSULE_GAP), bottom = bounds.y + bounds.height;
      if (top >= bottom) { status(controller, "capsule leaves no content area"); return bounds; }
      status(controller, "capsule");
      return { x: bounds.x, y: top, width: bounds.width, height: bottom - top };
    } catch (error) {
      status(controller, "capsule lookup failed: " + String(error && error.message || error));
      return bounds;
    }
  }
  return { available };
})();
