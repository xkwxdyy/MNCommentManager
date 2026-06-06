var __MN_UNDO_GROUPING_MNCommentManagerAddon = (function () {
  let depth = 0;
  let pendingNotebookIds = [];

  function pushNotebookId(notebookId) {
    const normalized = String(notebookId || "").trim();
    if (!normalized || pendingNotebookIds.indexOf(normalized) >= 0) return;
    pendingNotebookIds.push(normalized);
  }

  function collectNotebookIds(source) {
    const out = [];
    const push = (value) => {
      const normalized = String(value || "").trim();
      if (normalized && out.indexOf(normalized) < 0) out.push(normalized);
    };
    const visit = (item) => {
      if (!item) return;
      if (typeof item === "string") {
        push(item);
        return;
      }
      push(item.notebookId || item.topicId || item.topicid);
      if (item.note) push(item.note.notebookId || item.note.topicId || item.note.topicid);
    };
    if (Array.isArray(source)) source.forEach(visit);
    else visit(source);
    return out;
  }

  function getCurrentNotebookId() {
    try {
      if (typeof MNUtil !== "undefined" && MNUtil && MNUtil.currentNotebookId) {
        return String(MNUtil.currentNotebookId || "").trim();
      }
    } catch (error) {
      // fall through
    }
    try {
      const app = Application.sharedInstance();
      const studyController = app && typeof app.studyController === "function"
        ? app.studyController(self.window)
        : null;
      const notebookController = studyController && studyController.notebookController;
      return String(notebookController && notebookController.notebookId || "").trim();
    } catch (error) {
      return "";
    }
  }

  function getNotebookIds(options) {
    const opts = options && typeof options === "object" ? options : {};
    let ids = [];
    if (opts.notebookId) ids = ids.concat(collectNotebookIds(opts.notebookId));
    if (opts.note) ids = ids.concat(collectNotebookIds(opts.note));
    if (opts.notes) ids = ids.concat(collectNotebookIds(opts.notes));
    const unique = [];
    ids.forEach((id) => {
      if (id && unique.indexOf(id) < 0) unique.push(id);
    });
    if (unique.length > 0) return unique;
    const current = getCurrentNotebookId();
    return current ? [current] : [];
  }

  function refreshNotebookIds(ids) {
    const targets = ids && ids.length > 0 ? ids : [];
    targets.forEach((notebookId) => {
      try {
        Application.sharedInstance().refreshAfterDBChanged(notebookId);
      } catch (error) {
        console.log(`[MN Comment Manager] refreshAfterDBChanged failed: ${error && error.message ? error.message : error}`);
      }
    });
  }

  function run(actionName, options, block) {
    let opts = options;
    let fn = block;
    if (typeof options === "function") {
      fn = options;
      opts = {};
    }
    if (typeof fn !== "function") return undefined;

    const ids = getNotebookIds(opts);
    if (depth > 0) {
      ids.forEach(pushNotebookId);
      return fn();
    }

    const startedIds = pendingNotebookIds.slice();
    pendingNotebookIds = [];
    ids.forEach(pushNotebookId);
    depth += 1;
    let result;
    try {
      const primaryNotebookId = pendingNotebookIds[0] || getCurrentNotebookId();
      if (primaryNotebookId && typeof UndoManager !== "undefined" && UndoManager) {
        UndoManager.sharedInstance().undoGrouping(
          actionName || "MN Comment Manager",
          primaryNotebookId,
          function () {
            result = fn();
          }
        );
      } else {
        result = fn();
      }
    } finally {
      depth = Math.max(0, depth - 1);
      const refreshIds = pendingNotebookIds.slice();
      pendingNotebookIds = startedIds;
      refreshNotebookIds(refreshIds);
    }
    return result;
  }

  return {
    run,
  };
})();
