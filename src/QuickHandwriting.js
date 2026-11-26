var __MN_QUICK_HANDWRITING_MNCommentManagerAddon = (function () {
  const sessions = new WeakMap();

  function mode() {
    const hasPanel = typeof AddonWebPanel !== "undefined" && typeof AddonWebPanel.panel === "function";
    const immersive = MNUtil.immersiveMode;
    if (hasPanel && immersive !== false && immersive !== 0) return "panel";
    return typeof MNUtil.generateMNUIStatusURL === "function" && typeof MNUtil.openURLOptionsCompletionHandler === "function" ? "card" : "";
  }

  function openCardEditor(addon, noteId, topicId) {
    const study = Application.sharedInstance().studyController(addon.window);
    const currentWindow = MNUtil.currentWindow;
    if (!currentWindow || !(currentWindow === addon.window || typeof currentWindow.isEqual === "function" && currentWindow.isEqual(addon.window)) ||
        !topicId || String(study && study.notebookController && study.notebookController.notebookId || "") !== topicId ||
        !__MN_COMMENT_DATA__.getWrappedNoteById(noteId)) throw new Error("目标学习集或卡片已变化，请重新打开添加评论");
    // Same public UI-state link as MNUtil.openNoteEditor, with the captured study
    // and an explicit URL-dispatch receipt. The card's writing tool opens the canvas.
    const url = MNUtil.generateMNUIStatusURL({ topicid: topicId, cardid: noteId, cardedit: 1 });
    if (!url) throw new Error("无法定位目标卡片的编辑器");
    return MNUtil.openURLOptionsCompletionHandler(url).then(accepted => {
      if (!accepted) throw new Error("MarginNote 未接受打开卡片编辑器的请求");
      return { cardEditorRequested: true };
    });
  }

  function prepare() {
    // The host resolves the panel owner from the current addon callback.
    // UITextView delegates, WebView messages and timers may have no addon identity.
    return AddonWebPanel.panel();
  }

  function open(addon, noteId, panel, topicId) {
    if (sessions.has(addon)) throw new Error("请先结束当前手写编辑");
    const study = Application.sharedInstance().studyController(addon.window);
    if (!topicId || String(study && study.notebookController && study.notebookController.notebookId || "") !== topicId || !__MN_COMMENT_DATA__.getWrappedNoteById(noteId)) throw new Error("目标卡片已失效，请重新打开添加评论");

    let settle;
    const outcome = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const session = { panel, opening: true, dispatched: false, done: false };
    sessions.set(addon, session);

    function release(error, hostClosed) {
      if (session.done) return;
      session.done = true;
      sessions.delete(addon);
      if (session.timer && typeof session.timer.invalidate === "function") session.timer.invalidate();
      if (session.opening) settle.reject(error || new Error("已取消打开手写编辑器"));
      // Let the panel finish returning the current mn.call response first.
      if (!hostClosed) NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
        try {
          if (panel.floatingVisible) panel.hideFloating();
          else panel.teardown();
        } catch (closeError) { console.log("[MN Comment Manager][quick-handwriting] " + String(closeError)); }
      });
    }

    function refresh() {
      const controller = addon.webController;
      if (controller && controller.view && controller.view.window && !controller.view.hidden) {
        __MN_WEB_API_MNCommentManagerAddon.syncCurrentNote(controller, "quick-handwriting-saved");
      }
    }

    session.cancel = () => release(new Error("学习集已切换，手写入口已关闭"));
    panel.onMessage = function (command, payload) {
      if (session.done) return { accepted: false };
      if (command === "__closed__" || command === "__load_failed__") {
        release(command === "__load_failed__" ? new Error("手写入口加载失败") : null, command === "__closed__");
        return { accepted: true };
      }
      if (command === "getQuickHandwritingTarget") return { noteId };
      if (!payload || payload.noteId !== noteId) return { accepted: false };
      if (command === "startQuickHandwriting") {
        const active = Application.sharedInstance().studyController(addon.window);
        if (!session.opening || session.dispatched || !active || !active.notebookController ||
            String(active.notebookController.notebookId || "") !== topicId || !__MN_COMMENT_DATA__.getWrappedNoteById(noteId)) return { accepted: false };
        session.dispatched = true;
        return { accepted: true };
      }
      if (command === "quickHandwritingFailed" && session.opening) {
        release(new Error(String(payload.message || "无法打开原生手写编辑器")));
        return { accepted: true };
      }
      if (!session.dispatched) return { accepted: false };
      if (command === "quickHandwritingOpened" && session.opening) {
        session.opening = false;
        if (session.timer && typeof session.timer.invalidate === "function") session.timer.invalidate();
        settle.resolve({ editorOpened: true });
        return { accepted: true };
      }
      if (command === "quickHandwritingFinished" && !session.opening) {
        if (payload.saved === true) refresh();
        release();
        return { accepted: true };
      }
      return { accepted: false };
    };

    try {
      session.timer = NSTimer.scheduledTimerWithTimeInterval(7, false, function () {
        if (session.opening) release(new Error(session.dispatched ? "手写编辑器未返回打开结果，请先检查当前卡片" : "手写入口加载超时，请重试"));
      });
      if (!panel.loadPanel()) throw new Error("手写入口加载失败");
      if (typeof panel.showFloatingInMode === "function") panel.showFloatingInMode(study, "mini");
      else panel.showFloatingIn(study);
    } catch (error) { release(error); }
    return outcome;
  }

  function dispose(addon) {
    const session = sessions.get(addon);
    if (session) session.cancel();
  }
  return { mode, prepare, open, openCardEditor, dispose };
})();
