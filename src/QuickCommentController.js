var __MN_QUICK_COMMENT_MNCommentManagerAddon = (function () {
  const ALLOWED_COMMANDS = ["getQuickCommentState", "appendQuickComment", "updateQuickCommentDraft", "closeQuickComment", "setQuickCommentExit", "presentQuickComment"];
  // Native dynamic properties can bridge dictionaries and booleans; keep the ledger in JS.
  const owners = Object.create(null), sessions = Object.create(null);
  function ownerStore(addon) {
    let key = String(addon._mncmQuickOwnerId || '');
    if (!key) { key = id(); addon._mncmQuickOwnerId = key; }
    if (!owners[key]) owners[key] = { drafts: Object.create(null) };
    return owners[key];
  }
  function sessionFor(controller) { return controller && sessions[String(controller._mncmQuickSessionId || '')]; }
  function id() { return `${Date.now()}_${Math.random().toString(36).slice(2)}`; }
  function log(error) { console.log(`[MN Comment Manager][quick-input] ${error && error.message ? error.message : error}`); }
  function host(controller) { return Application.sharedInstance().studyController(controller.addon.window).view; }
  function layout(controller) {
    if (!controller || !controller.view || !controller.view.superview) return;
    controller.view.frame = controller.view.superview.bounds;
    controller.webView.frame = controller.view.bounds;
  }
  function checkedSession(controller, payload) {
    const session = sessionFor(controller);
    if (!session || !controller.addon || controller.addon.quickCommentController !== controller ||
        (payload && payload.sessionId && payload.sessionId !== session.id)) throw new Error("输入会话已失效，请重新打开输入窗口");
    return session;
  }
  function visibleRect(rect, bounds) {
    if (!rect || !bounds) return null;
    const x = Number(rect.x), y = Number(rect.y), width = Number(rect.width), height = Number(rect.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
        x < 0 || y < 0 || x + width > bounds.width || y + height > bounds.height) return null;
    return { x, y, width, height };
  }
  function targetRect(controller) {
    const session = sessionFor(controller);
    try {
      const study = Application.sharedInstance().studyController(controller.addon.window);
      const mindmap = study.notebookController && study.notebookController.mindmapView;
      if (mindmap && !mindmap.hidden && !(study.notebookController.view && study.notebookController.view.hidden)) {
        const nodes = mindmap.mindmapNodes || [];
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index];
          const note = node && node.note;
          if (String(note && (note.noteId || (note.note && note.note.noteId)) || "") !== session.noteId) continue;
          const rect = mindmap.convertRectToView(node.frame, controller.view);
          const visible = visibleRect(rect, controller.view.bounds);
          if (visible) return visible;
        }
      }
      // The popup anchor is in window coordinates. Do not reuse it after a resize.
      if (session.initialWidth === host(controller).bounds.width && session.initialHeight === host(controller).bounds.height) {
        return visibleRect(controller.view.convertRectFromView(session.anchorRect, controller.addon.window), controller.view.bounds);
      }
    } catch (error) { log(error); }
    return null;
  }
  function getState(controller, payload) {
    const session = checkedSession(controller, payload);
    const attempt = payload && payload.submissionId ? session.attempts[payload.submissionId] : session.attempt;
    if (attempt && attempt.status === "uncertain") {
      try {
        attempt.receipt = __MN_COMMENT_MUTATIONS__.confirmQuickTextComment(session.noteId, attempt);
        attempt.status = "saved";
        if (session.attempt === attempt) session.draft = "";
      } catch (error) { attempt.error = String(error.message || error); }
    }
    return {
      sessionId: session.id, noteId: session.noteId, noteTitle: session.noteTitle, draft: session.draft, draftRevision: session.draftRevision, markdown: session.markdown === true,
      targetRect: targetRect(controller), nativeViewport: { width: controller.view.bounds.width, height: controller.view.bounds.height },
      submission: attempt ? { submissionId: attempt.id, text: attempt.text, markdown: attempt.markdown === true, draftRevision: attempt.draftRevision, status: attempt.status, error: attempt.error || "", receipt: attempt.receipt || null } : null,
    };
  }
  function retainDraft(session, payload) {
    if (!payload || payload.sessionId !== session.id || typeof payload.text !== "string" ||
        !Number.isSafeInteger(payload.draftRevision) || payload.draftRevision < 0 ||
        payload.markdown !== undefined && typeof payload.markdown !== "boolean") throw new Error("草稿参数或版本无效");
    const markdown = payload.markdown === undefined ? session.markdown === true : payload.markdown;
    if (payload.draftRevision < session.draftRevision) return false;
    if (payload.draftRevision === session.draftRevision && (payload.text !== session.draft || markdown !== (session.markdown === true))) throw new Error("草稿版本冲突，请保留正文并重新打开窗口");
    if (markdown !== (session.markdown === true)) session.markdownPreferencePending = true;
    session.draft = payload.text;
    session.markdown = markdown;
    session.draftRevision = payload.draftRevision;
    if (session.markdownPreferencePending) {
      __MN_COMMENT_ACTION_SETTINGS__.setQuickCommentMarkdown(markdown);
      session.markdownPreferencePending = false;
    }
    return true;
  }
  function updateDraft(controller, payload) {
    const session = checkedSession(controller, payload);
    if (controller._quickClosePending || session.attempt && session.attempt.status !== "failed") return { sessionId: session.id, retained: false };
    return { sessionId: session.id, retained: retainDraft(session, payload), draftRevision: session.draftRevision };
  }
  function append(controller, payload) {
    const session = checkedSession(controller, payload);
    if (controller._quickClosePending) throw new Error("输入窗口正在关闭，请重新打开后提交");
    if (!payload || payload.sessionId !== session.id || typeof payload.submissionId !== "string" || !payload.submissionId ||
        typeof payload.text !== "string" || !payload.text.trim() ||
        payload.markdown !== undefined && typeof payload.markdown !== "boolean") throw new Error("提交参数无效或评论为空");
    const markdown = payload.markdown === true;
    const previous = session.attempts[payload.submissionId];
    if (previous) {
      if (previous.text !== payload.text) throw new Error("提交标识不能用于不同的正文");
      if ((previous.markdown === true) !== markdown) throw new Error("提交标识不能用于不同的评论类型");
      return getState(controller, payload);
    }
    if (session.attempt && session.attempt.status !== "failed") throw new Error("已有提交尚未完成，请核对原提交");
    if (!retainDraft(session, Object.assign({}, payload, { markdown }))) throw new Error("草稿已更新，请使用最新正文提交");
    const attempt = { id: payload.submissionId, text: payload.text, markdown, draftRevision: payload.draftRevision, status: "pending", mutationStarted: false };
    session.attempts[attempt.id] = attempt;
    session.attempt = attempt;
    try {
      attempt.receipt = __MN_COMMENT_MUTATIONS__.appendQuickTextComment(session.noteId, payload.text, attempt);
      attempt.status = "saved";
      session.draft = "";
    } catch (error) {
      attempt.status = attempt.mutationStarted ? "uncertain" : "failed";
      attempt.error = String(error.message || error);
      log(error);
    }
    return getState(controller, payload);
  }
  function present(controller, payload) {
    const session = checkedSession(controller, payload);
    if (controller._quickClosed || controller._quickClosePending || session.exitActive || controller._quickPresentationStarted) return { started: false };
    controller._quickPresentationStarted = true;
    try {
      UIView.animateWithDurationDelayOptionsAnimationsCompletion(payload && payload.reducedMotion === true ? 0.12 : 0.3, 0, 1 << 2, function () {
        controller.view.alpha = 1;
      }, function () {});
    } catch (error) { controller.view.alpha = 1; log(error); }
    // Retry focus after the Native alpha model permits first-responder access.
    try { controller.webView.evaluateJavaScript("window.__MNQuickCommentFocus&&window.__MNQuickCommentFocus()", function () {}); }
    catch (error) { log(error); }
    return { started: true };
  }
  function setExit(controller, payload) {
    const session = checkedSession(controller, payload);
    const attempt = session.attempt;
    if (!payload || payload.sessionId !== session.id || typeof payload.active !== "boolean" ||
        !attempt || attempt.id !== payload.submissionId || attempt.status !== "saved" ||
        !attempt.receipt || attempt.receipt.persisted !== true) throw new Error("评论尚未确认保存，不能隐藏输入窗口");
    if (!payload.active) {
      if (controller._quickClosePending) { close(controller, false); return { started: false, closed: true }; }
      session.exitActive = false;
      controller._quickExiting = 0;
      session.exitGeneration = (session.exitGeneration || 0) + 1;
      controller.view.layer.removeAllAnimations();
      try {
        UIView.animateWithDurationDelayOptionsAnimationsCompletion(0.12, 0, 1 << 2, function () { controller.view.alpha = 1; }, function () {});
      } catch (error) { controller.view.alpha = 1; log(error); }
      return { started: false };
    }
    if (session.exitActive) return { started: true };
    session.exitActive = true;
    controller._quickExiting = 1;
    const generation = session.exitGeneration = (session.exitGeneration || 0) + 1;
    // A confirmed save can finish closing even if its UI acknowledgement is lost.
    NSTimer.scheduledTimerWithTimeInterval(2.6, false, function () {
      if (session.exitActive && session.exitGeneration === generation && !controller._quickClosed && !controller._quickClosePending && controller.addon.quickCommentController === controller) close(controller, false);
    });
    try {
      const duration = payload.reducedMotion === true ? 0.12 : payload.directed === true ? 0.52 : 0.32;
      // Fade the Native WebView canvas too; CSS opacity cannot uncover Native views.
      UIView.animateWithDurationDelayOptionsAnimationsCompletion(duration, 0, 1 << 2, function () {
        controller.view.alpha = 0;
      }, function () {});
      return { started: true };
    } catch (error) {
      controller.view.alpha = 1;
      log(error);
      return { started: false };
    }
  }
  function close(controller, dispose) {
    if (!controller || controller._quickClosed) return;
    controller._quickClosed = true;
    const addon = controller.addon;
    try { controller.webView.delegate = null; controller.webView.stopLoading(); } catch (error) { log(error); }
    try { controller.view.endEditing(true); } catch (error) { log(error); }
    try { controller.view.removeFromSuperview(); } catch (error) { log(error); }
    if (addon && addon.quickCommentController === controller) addon.quickCommentController = null;
    const session = sessionFor(controller);
    if (addon && session && session.attempt && session.attempt.status === "saved") {
      const owner = owners[String(addon._mncmQuickOwnerId || '')];
      if (owner && owner.drafts[session.noteId] === session) delete owner.drafts[session.noteId];
      delete sessions[session.id];
    }
    if (!dispose) {
      NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
        if (addon.quickCommentController) return;
        try { Application.sharedInstance().studyController(addon.window).view.becomeFirstResponder(); } catch (error) { log(error); }
      });
    }
  }
  function requestClose(controller, payload) {
    const session = checkedSession(controller, payload);
    if (controller._quickClosePending) return { closed: true, nativeClosing: true };
    if (payload && payload.text !== undefined && (!session.attempt || session.attempt.status === "failed")) retainDraft(session, payload);
    // Deliver the bridge acknowledgement before removing the WebView.
    controller._quickClosePending = true;
    try {
      UIView.animateWithDurationDelayOptionsAnimationsCompletion(0.12, 0, 1 << 2, function () { controller.view.alpha = 0; }, function () {});
    } catch (error) { controller.view.alpha = 0; log(error); }
    NSTimer.scheduledTimerWithTimeInterval(0.18, false, function () { close(controller, false); });
    return { closed: true, nativeClosing: true };
  }
  const controllerClass = JSB.defineClass("MNQuickCommentController_MNCommentManagerAddon : UIViewController <UIWebViewDelegate>", {
    viewDidLoad: function () {
      self.view.backgroundColor = UIColor.clearColor();
      self.view.opaque = false;
      self.webView = new UIWebView(self.view.bounds);
      self.webView.backgroundColor = UIColor.clearColor();
      self.webView.opaque = false;
      self.webView.scalesPageToFit = true;
      self.webView.autoresizingMask = (1 << 1 | 1 << 4);
      self.webView.delegate = self;
      self.view.addSubview(self.webView);
      const devURL = __MNGetWebDevServerURL_MNCommentManagerAddon();
      const url = devURL ? NSURL.URLWithString(`${String(devURL).replace(/\/+$/, "")}/quick-comment.html`) : NSURL.fileURLWithPath(`${self.mainPath}/web-dist/quick-comment.html`);
      self.webView.loadRequest(NSURLRequest.requestWithURL(url));
    },
    viewDidLayoutSubviews: function () { layout(self); },
    webViewDidFinishLoad: function () {
      const controller = self;
      if (controller._quickOpenFallbackScheduled) return;
      controller._quickOpenFallbackScheduled = true;
      NSTimer.scheduledTimerWithTimeInterval(0.8, false, function () {
        if (controller._quickClosed || controller._quickClosePending || controller._quickPresentationStarted || controller.addon.quickCommentController !== controller) return;
        // Ask React to reveal a ready panel, rather than exposing an empty canvas.
        try { controller.webView.evaluateJavaScript("window.__MNQuickCommentRecoverOpen&&window.__MNQuickCommentRecoverOpen()", function () {}); }
        catch (error) { log(error); }
        NSTimer.scheduledTimerWithTimeInterval(3, false, function () {
          if (!controller._quickClosed && !controller._quickClosePending && !controller._quickPresentationStarted && controller.addon.quickCommentController === controller) {
            close(controller, false);
            MNUtil.showHUD("输入窗口未能打开，草稿已保留，请重新打开");
          }
        });
      });
    },
    webViewDidFailLoadWithError: function (_view, error) {
      log(error);
      MNUtil.showHUD("输入页面加载失败，请重新打开输入窗口");
      close(self, true);
    },
    webViewShouldStartLoadWithRequestNavigationType: function (webView, request) {
      const transport = __MN_WEB_API_MNCommentManagerAddon;
      let message;
      try {
        const url = request.URL();
        if (String(url.scheme || "").toLowerCase() !== "mnaddon") return String(url.scheme || "").toLowerCase() === "file" || !!__MNGetWebDevServerURL_MNCommentManagerAddon();
        message = transport.decodeBridgeMessage(url);
        if (ALLOWED_COMMANDS.indexOf(message.command) < 0) throw new Error("快速输入窗口不支持该操作");
        const result = __MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands[message.command]({ controller: self, addon: self.addon }, message.payload);
        transport.sendBridgeResponse(webView, message.requestId, result, null);
      } catch (error) {
        transport.sendBridgeResponse(webView, message && message.requestId || "unknown", null, transport.normalizeBridgeError(error, message && message.command));
        log(error);
      }
      return false;
    },
  });
  function open(addon, context) {
    if (!context || !context.noteId) throw new Error("未读取到目标卡片");
    if (addon.quickCommentController) {
      if (addon.quickCommentController._quickClosePending || Number(addon.quickCommentController._quickExiting || 0) === 1) close(addon.quickCommentController, true);
      else { addon.quickCommentController.view.superview.bringSubviewToFront(addon.quickCommentController.view); return; }
    }
    const study = Application.sharedInstance().studyController(addon.window);
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(context.noteId);
    if (!note || !note.noteId) throw new Error("目标卡片不存在或已被删除");
    const owner = ownerStore(addon);
    let session = owner.drafts[context.noteId];
    const preferredMarkdown = __MN_COMMENT_ACTION_SETTINGS__.getQuickCommentMarkdown();
    if (!session) session = { id: id(), noteId: String(context.noteId), draft: "", markdown: preferredMarkdown, draftRevision: 0, attempt: null, attempts: Object.create(null) };
    // An unresolved submission retains its original type even if the preference changes elsewhere.
    if ((!session.attempt || session.attempt.status === "failed") && !session.markdownPreferencePending && session.markdown !== preferredMarkdown) {
      session.markdown = preferredMarkdown;
      session.draftRevision += 1;
    }
    session.noteTitle = String(note.noteTitle || "未命名卡片");
    session.anchorRect = context.anchorRect;
    session.initialWidth = study.view.bounds.width;
    session.initialHeight = study.view.bounds.height;
    owner.drafts[context.noteId] = session;
    sessions[session.id] = session;
    const controller = controllerClass.new();
    controller.mainPath = addon.mainPath;
    controller.addon = addon;
    controller._mncmQuickSessionId = session.id;
    addon.quickCommentController = controller;
    try {
      controller.view.alpha = 0;
      study.view.addSubview(controller.view);
      controller.view.autoresizingMask = (1 << 1 | 1 << 4);
      layout(controller);
      study.view.bringSubviewToFront(controller.view);
      __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(addon, "quick-input.open");
    } catch (error) { close(controller, true); throw error; }
  }
  function dispose(addon) {
    close(addon && addon.quickCommentController, true);
    if (!addon) return;
    const key = String(addon._mncmQuickOwnerId || ''), owner = owners[key];
    if (owner) Object.keys(owner.drafts).forEach(noteId => { delete sessions[owner.drafts[noteId].id]; });
    delete owners[key];
  }
  return { open, layout, getState, updateDraft, append, present, setExit, requestClose, dispose };
})();
