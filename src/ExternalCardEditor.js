// Versioned in-process protocol. Only this addon owns the pinned editor target.
var __MN_CARD_EDITOR_MNCommentManagerAddon = (function () {
  const clients = [];
  const failures = {
    EDITOR_UNAVAILABLE: ["评论管理器尚未就绪，请启用插件并重新打开学习集", "Comment Manager is not ready. Enable the addon and reopen the study set."],
    EDITOR_BUSY: ["编辑器存在未完成的操作，请完成后重试", "Finish the current editor operation before switching cards."],
    TARGET_UNAVAILABLE: ["目标卡片已失效，请重新打开编辑器", "The target card is unavailable. Reopen the editor."],
    STALE_REQUEST: ["编辑请求已过期，请重新打开编辑器", "The edit request has expired. Reopen the editor."],
  };
  function fail(code, language) {
    const labels = failures[code] || failures.EDITOR_UNAVAILABLE;
    const error = new Error(labels[language === "en-US" ? 1 : 0]);
    error.code = code;
    return error;
  }
  function clear(controller) {
    if (!controller) return;
    controller._externalCardOpenRequest = null;
    controller.externalCardEditorSession = null;
    controller._snapshotSyncSeq = (controller._snapshotSyncSeq || 0) + 1;
  }
  function register(addon) {
    if (clients.indexOf(addon) < 0) clients.push(addon);
  }
  function unregister(addon) {
    clear(addon && addon.webController);
    const index = clients.indexOf(addon);
    if (index >= 0) clients.splice(index, 1);
  }
  function getSnapshot(controller) {
    const session = controller && controller.externalCardEditorSession;
    if (!session) return __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(session.noteId);
    if (!note || String(note.noteId) !== session.noteId) throw fail("TARGET_UNAVAILABLE", session.language);
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }
  function validateCommand(controller, command, payload) {
    const session = controller && controller.externalCardEditorSession;
    if (!session) return;
    // A stale WebView response must never redirect a mutation to another card.
    if (payload && payload.noteId !== undefined && String(payload.noteId) !== session.noteId) throw fail("STALE_REQUEST", session.language);
    if (payload && Array.isArray(payload.noteIds) && payload.noteIds.some(id => String(id) !== session.noteId)) throw fail("STALE_REQUEST", session.language);
    if (/Batch/.test(command)) throw fail("EDITOR_BUSY", session.language);
  }
  function canSwitch(controller, request) {
    const visible = !!(controller.view && !controller.view.hidden && controller.view.superview);
    if (!controller.webView || controller._webContentReady !== true) return visible ? Promise.reject(fail("EDITOR_BUSY", request.language)) : Promise.resolve();
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = NSTimer.scheduledTimerWithTimeInterval(2, false, function () {
        if (finished) return;
        finished = true;
        reject(fail("EDITOR_BUSY", request.language));
      });
      const finish = (error) => {
        if (finished) return;
        finished = true;
        if (timer && typeof timer.invalidate === "function") timer.invalidate();
        if (error) reject(error); else resolve();
      };
      try {
        controller.webView.evaluateJavaScript("JSON.stringify({ready:typeof window.__MNCommentManagerCanSwitchCard==='function'&&window.__MNCommentManagerCanSwitchCard()===true})", function (value) {
          try {
            const state = JSON.parse(String(value || "{}"));
            finish(state.ready === true ? null : fail("EDITOR_BUSY", request.language));
          } catch (_) { finish(fail("EDITOR_BUSY", request.language)); }
        });
      } catch (_) { finish(fail("EDITOR_BUSY", request.language)); }
    });
  }
  function cancel(requestId, window) {
    clients.forEach(addon => {
      const controller = addon.webController;
      const pending = controller && controller._externalCardOpenRequest;
      if (addon.window === window && pending && pending.requestId === requestId) controller._externalCardOpenRequest = null;
    });
  }
  async function open(payload) {
    if (!payload || payload.schema !== 1 || payload.source !== "mnpinner" || payload.action !== "openCardEditor" ||
        typeof payload.requestId !== "string" || !payload.requestId || payload.requestId.length > 160 ||
        typeof payload.noteId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.noteId) || !payload.window) throw fail("EDITOR_UNAVAILABLE");
    // Copy the protocol fields; the caller cannot mutate a pending request.
    const request = { requestId: payload.requestId, noteId: payload.noteId, window: payload.window, language: payload.language };
    const addon = clients.find(client => client.window === request.window && client.mnCommentManagerInitialized && client.webController);
    if (!addon || MNUtil.currentWindow !== request.window) throw fail("EDITOR_UNAVAILABLE", request.language);
    const controller = addon.webController;
    const current = controller.externalCardEditorSession;
    if (current && current.requestId === request.requestId) {
      if (current.noteId !== request.noteId) throw fail("STALE_REQUEST", request.language);
      getSnapshot(controller);
      return { accepted: true, noteId: current.noteId, requestId: current.requestId };
    }
    controller._externalCardOpenRequest = request;
    try {
      const note = __MN_COMMENT_DATA__.getWrappedNoteById(request.noteId);
      if (!note || String(note.noteId) !== request.noteId) throw fail("TARGET_UNAVAILABLE", request.language);
      await canSwitch(controller, request);
      if (controller._externalCardOpenRequest !== request || clients.indexOf(addon) < 0 || MNUtil.currentWindow !== request.window) throw fail("STALE_REQUEST", request.language);
      if (!__MN_COMMENT_DATA__.getWrappedNoteById(request.noteId)) throw fail("TARGET_UNAVAILABLE", request.language);
      const previousSession = controller.externalCardEditorSession;
      controller.externalCardEditorSession = request;
      try {
        __MN_WEB_API_MNCommentManagerAddon.showPanel(controller, { externalCardEditor: true });
      } catch (error) {
        controller.externalCardEditorSession = previousSession;
        throw error;
      }
      return { accepted: true, requestId: request.requestId, noteId: request.noteId };
    } finally {
      if (controller._externalCardOpenRequest === request) controller._externalCardOpenRequest = null;
    }
  }
  return { protocolVersion: 1, register, unregister, clear, getSnapshot, validateCommand, cancel, open };
})();
