var __MN_NATIVE_QUICK_COMMENT_MNCommentManagerAddon = (function () {
  // Keep UI state in JavaScript; native dynamic properties may bridge booleans and dictionaries.
  const states = Object.create(null);
  const heights = Object.create(null);
  function state(controller) { return controller && states[String(controller._mncmNativeQuickId || "")]; }
  function color(hex, alpha) { return MNUtil.hexColorAlpha(hex, alpha === undefined ? 1 : alpha); }
  function report(controller, error) {
    console.log("[MN Comment Manager][native-quick-input] " + String(error.message || error));
    const s = state(controller);
    if (s && s.error) { s.error.text = String(error.message || error); layout(controller); }
  }
  function guarded(controller, action) {
    try { return action(state(controller)); } catch (error) { report(controller, error); }
  }
  function active(controller, s) {
    return !!s && !controller._quickClosed && !controller._quickClosePending && controller.addon.quickCommentController === controller;
  }
  function label(parent, text, size, tint) {
    const view = new UILabel({ x: 0, y: 0, width: 0, height: 0 });
    view.text = text; view.font = UIFont.systemFontOfSize(size); view.textColor = color(tint);
    parent.addSubview(view); return view;
  }
  function button(controller, parent, glyph, name, selector) {
    const view = UIButton.buttonWithType(0);
    view.setTitleForState(glyph, 0); view.setTitleColorForState(color("#3478ed"), 0);
    view.titleLabel.font = UIFont.systemFontOfSize(24);
    view.accessibilityLabel = name;
    if (selector) view.addTargetActionForControlEvents(controller, selector, 1 << 6);
    parent.addSubview(view); return view;
  }
  function refresh(controller) {
    const s = state(controller);
    if (!s || !s.input) return;
    const locked = s.pending || s.uncertain;
    // Changing editable while waiting for UIKit can interrupt composition or reset the selection.
    s.input.editable = !s.uncertain;
    s.input.userInteractionEnabled = !s.pending;
    s.markdownButton.enabled = !locked;
    s.newline.enabled = !locked;
    s.submit.enabled = !s.pending && (s.uncertain || !!String(s.input.text || "").trim());
    s.close.enabled = !s.pending;
    s.backdrop.enabled = !s.pending;
    s.placeholder.hidden = !!String(s.input.text || "");
    s.markdownButton.backgroundColor = s.markdown ? color("#3478ed", 0.14) : UIColor.clearColor();
    s.markdownButton.accessibilityLabel = s.markdown ? "关闭 Markdown 评论" : "启用 Markdown 评论";
    s.markdownButton.accessibilityValue = s.markdown ? "已启用" : "未启用";
    s.submit.setTitleForState(s.uncertain ? "核对" : "添加", 0);
    s.submit.accessibilityLabel = s.uncertain ? "核对保存结果" : "添加评论";
  }
  function snapshot(controller) {
    const s = state(controller), current = s.actions.getState(controller);
    const text = String(s.input.text || "");
    return { sessionId: current.sessionId, text, markdown: s.markdown,
      draftRevision: current.draftRevision + (text !== current.draft || s.markdown !== current.markdown ? 1 : 0) };
  }
  function changed(controller) {
    const s = state(controller);
    if (!active(controller, s) || s.uncertain) return;
    // Reading native text also retains marked text without rewriting the input during composition.
    s.actions.updateDraft(controller, snapshot(controller));
    refresh(controller);
  }
  function focus(controller) {
    const s = state(controller);
    if (active(controller, s) && !s.pending && !s.uncertain) s.input.becomeFirstResponder();
  }
  function editingFailed(controller, s, error) {
    s.operation = null; s.pending = false;
    if (s.submissionStarted || s.uncertain) {
      // A save may have succeeded before a later UI/close operation threw.
      s.uncertain = true;
      try {
        const current = s.actions.getState(controller);
        s.uncertain = !!current.submission && current.submission.status !== "failed";
      } catch (_) { /* Keep editing locked until the original submission can be checked. */ }
    }
    s.submissionStarted = false;
    refresh(controller); report(controller, error); focus(controller);
  }
  function completeEditing(controller, s, operation) {
    if (operation.queued || operation.finished) return;
    operation.queued = true;
    NSTimer.scheduledTimerWithTimeInterval(0, false, function () {
      operation.queued = false;
      if (!active(controller, s) || s.operation !== operation || !operation.ended || operation.finished) return;
      operation.finished = true;
      try {
        if (s.input.isFirstResponder()) throw new Error("输入尚未结束，正文已保留，请完成组词后重试");
        operation.action(s);
      } catch (error) { editingFailed(controller, s, error); }
      finally { if (s.operation === operation) s.operation = null; }
    });
  }
  function editingEnded(controller) {
    const s = state(controller);
    if (!active(controller, s)) return;
    changed(controller);
    if (s.operation) { s.operation.ended = true; completeEditing(controller, s, s.operation); }
  }
  function finishEditing(controller, action) {
    const s = state(controller);
    if (!active(controller, s) || s.pending) return;
    const wasFocused = !!s.input.isFirstResponder();
    const operation = { action, ended: !wasFocused, queued: false, finished: false };
    s.operation = operation;
    s.pending = true;
    try {
      if (wasFocused) {
        s.suppressKeyboardHide = !!s.keyboard;
        const resigned = s.input.resignFirstResponder();
        if (resigned === false || resigned === 0) {
          s.suppressKeyboardHide = false;
          throw new Error("输入尚未结束，正文已保留，请完成组词后重试");
        }
      }
      refresh(controller);
      completeEditing(controller, s, operation);
      if (!operation.ended) NSTimer.scheduledTimerWithTimeInterval(0.5, false, function () {
        if (active(controller, s) && s.operation === operation && !operation.ended) {
          editingFailed(controller, s, new Error("输入结束尚未确认，正文已保留，请完成组词后重试"));
        }
      });
    } catch (error) { editingFailed(controller, s, error); }
  }
  function requestClose(controller, cause) {
    finishEditing(controller, function (s) {
      const payload = s.uncertain ? { sessionId: s.sessionId } : snapshot(controller);
      s.actions.requestClose(controller, Object.assign(payload, cause || {}));
    });
  }
  function submit(controller) {
    finishEditing(controller, function (s) {
      let result;
      if (s.uncertain) result = s.actions.getState(controller);
      else {
        const payload = snapshot(controller);
        if (!payload.text.trim()) { s.pending = false; refresh(controller); focus(controller); return; }
        payload.submissionId = "native_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        s.submissionStarted = true;
        result = s.actions.append(controller, payload);
      }
      const attempt = result.submission;
      s.submissionStarted = false;
      s.uncertain = !!attempt && attempt.status !== "failed";
      if (attempt && attempt.status === "saved" && attempt.receipt && attempt.receipt.persisted === true) {
        s.actions.requestClose(controller, { sessionId: s.sessionId });
        return;
      }
      s.pending = false;
      s.error.text = s.uncertain ? "保存结果待核对：" + (attempt.error || "请点击核对按钮") : attempt && attempt.error || "评论未保存，请重试";
      refresh(controller); layout(controller); focus(controller);
    });
  }
  function toggleMarkdown(controller) {
    const s = state(controller);
    if (!active(controller, s) || s.pending || s.uncertain) return;
    s.markdown = !s.markdown;
    try { changed(controller); }
    finally { refresh(controller); }
  }
  function newline(controller) {
    const current = state(controller);
    if (!current || current.uncertain) return;
    finishEditing(controller, function (s) {
      const text = String(s.input.text || ""), range = s.input.selectedRange || { location: text.length, length: 0 };
      const start = Math.max(0, Math.min(text.length, Number(range.location) || 0));
      const end = Math.max(start, Math.min(text.length, start + (Number(range.length) || 0)));
      s.input.text = text.slice(0, start) + "\n" + text.slice(end);
      s.input.selectedRange = { location: start + 1, length: 0 };
      s.pending = false; changed(controller); focus(controller);
    });
  }
  function layout(controller) {
    const s = state(controller);
    if (!s || !s.ready || controller._quickClosePending) return;
    const bounds = controller.view.bounds, margin = 12;
    s.backdrop.frame = bounds;
    const preferredHeight = heights[String(controller.addon._mncmQuickOwnerId)] || 320;
    const candidate = (left, top, right, bottom) => {
      const width = Math.max(0, Math.min(560, right - left - margin * 2));
      const maximum = Math.max(0, bottom - top - margin * 2);
      const height = Math.min(maximum, Math.max(Math.min(194, maximum), preferredHeight));
      return { maximum, frame: { x: left + (right - left - width) / 2,
        y: bounds.width <= 600 ? bottom - margin - height : top + (bottom - top - height) / 2, width, height } };
    };
    let placement = candidate(0, 0, bounds.width, bounds.height);
    const keyboard = s.keyboard;
    const frame = placement.frame;
    if (keyboard && keyboard.width > 0 && keyboard.height > 0 && keyboard.x < frame.x + frame.width && keyboard.x + keyboard.width > frame.x && keyboard.y < frame.y + frame.height && keyboard.y + keyboard.height > frame.y) {
      const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
      const above = candidate(0, 0, bounds.width, clamp(keyboard.y, bounds.height));
      const below = candidate(0, clamp(keyboard.y + keyboard.height, bounds.height), bounds.width, bounds.height);
      placement = above.maximum >= below.maximum ? above : below;
      if (placement.frame.height < 194) {
        const sides = [candidate(0, 0, clamp(keyboard.x, bounds.width), bounds.height),
          candidate(clamp(keyboard.x + keyboard.width, bounds.width), 0, bounds.width, bounds.height)];
        // 188 points keeps every existing footer control inside the panel.
        sides.forEach(side => {
          if (side.frame.width >= 188 && (side.frame.height > placement.frame.height || side.frame.height === placement.frame.height && side.frame.width > placement.frame.width)) placement = side;
        });
      }
    }
    const { width, height } = placement.frame, maximum = placement.maximum;
    s.minimumHeight = Math.min(194, maximum); s.maximumHeight = maximum;
    const compact = height < 250;
    s.panel.frame = placement.frame;
    // Compact layouts already reserve the footer's left side for a hidden hint.
    const footerError = compact && width >= 300;
    const errorHeight = s.error.text && !footerError ? compact ? 32 : 48 : 0;
    const fieldY = compact ? 60 : 82;
    const textHeight = Math.max(40, height - fieldY - 62 - errorHeight);
    const footerY = fieldY + textHeight + errorHeight + 4;
    s.panel.contentSize = { width, height: footerY + 56 };
    s.grabber.frame = { x: s.panel.frame.x + Math.max(0, (width - 88) / 2), y: s.panel.frame.y, width: Math.min(88, width), height: 30 };
    s.grabber.accessibilityValue = "高度 " + Math.round(height) + " 点";
    s.grabberLine.frame = { x: Math.max(0, (s.grabber.frame.width - 34) / 2), y: 9, width: 34, height: 5 };
    s.title.frame = { x: 16, y: compact ? 28 : 30, width: Math.max(0, width - 76), height: 20 };
    s.subtitle.frame = { x: 16, y: 52, width: Math.max(0, width - 76), height: 18 }; s.subtitle.hidden = compact;
    s.close.frame = { x: width - 56, y: 24, width: 44, height: 44 };
    s.input.frame = { x: 14, y: fieldY, width: Math.max(0, width - 28), height: textHeight };
    s.placeholder.frame = { x: 20, y: fieldY + 6, width: Math.max(0, width - 40), height: 26 };
    s.error.frame = footerError
      ? { x: 16, y: footerY + 8, width: Math.max(0, width - 210), height: 36 }
      : { x: 16, y: fieldY + textHeight, width: Math.max(0, width - 32), height: errorHeight };
    s.hint.frame = { x: 16, y: footerY + 8, width: Math.max(0, width - 210), height: 36 };
    s.hint.hidden = compact || width < 300;
    s.markdownButton.frame = { x: width - 188, y: footerY + 4, width: 76, height: 44 };
    s.newline.frame = { x: width - 108, y: footerY + 4, width: 44, height: 44 };
    s.submit.frame = { x: width - 60, y: footerY + 4, width: 44, height: 44 };
  }
  function keyboard(controller, event, rect) {
    const s = state(controller);
    if (!active(controller, s)) return;
    if (event.type === "show" || event.type === "frame") {
      s.keyboard = rect;
      if (event.type === "show" && !s.pending) s.suppressKeyboardHide = false;
      const duration = Number(event.duration), curve = Number(event.curve);
      if (duration > 0 && duration <= 2 && typeof UIView.animateWithDurationDelayOptionsAnimationsCompletion === "function") {
        try {
          UIView.animateWithDurationDelayOptionsAnimationsCompletion(duration, 0, 4 | ((Number.isInteger(curve) && curve >= 0 && curve <= 7 ? curve : 0) << 16), () => layout(controller), () => {});
        } catch (_) { layout(controller); }
      } else layout(controller);
    }
    else if (event.type === "hide") {
      s.keyboard = null;
      if (s.suppressKeyboardHide) { s.suppressKeyboardHide = false; return; }
      if (!s.pending) requestClose(controller, { reason: "keyboard", eventId: event.eventId });
    }
  }
  function resize(controller, gesture) {
    const s = state(controller);
    if (!active(controller, s) || s.pending || s.uncertain || !gesture) return;
    if (gesture.state === 1) s.resizeStart = s.panel.frame.height;
    if ((gesture.state === 1 || gesture.state === 2) && Number.isFinite(s.resizeStart)) {
      const delta = gesture.translationInView(controller.view);
      if (!delta || !Number.isFinite(delta.y)) return;
      heights[String(controller.addon._mncmQuickOwnerId)] = Math.max(s.minimumHeight, Math.min(s.maximumHeight, s.resizeStart - delta.y));
      layout(controller);
    }
    if (gesture.state >= 3) s.resizeStart = null;
  }
  const nativeClass = JSB.defineClass("MNNativeQuickCommentController_MNCommentManagerAddon : UIViewController <UITextViewDelegate>", {
    viewDidLoad: function () { self.view.backgroundColor = UIColor.clearColor(); self.view.opaque = false; },
    viewDidLayoutSubviews: function () { const controller = self; guarded(controller, s => s && s.actions.layout(controller)); },
    mncmQuickKeyboardChanged: function (notification) { const controller = self; guarded(controller, s => s && s.actions.keyboardChanged(controller, notification)); },
    textViewDidChange: function () { const controller = self; guarded(controller, () => changed(controller)); },
    textViewDidEndEditing: function () { const controller = self; guarded(controller, () => editingEnded(controller)); },
    mncmNativeClose: function () { const controller = self; guarded(controller, () => requestClose(controller)); },
    mncmNativeSubmit: function () { const controller = self; guarded(controller, () => submit(controller)); },
    mncmNativeMarkdown: function () { const controller = self; guarded(controller, () => toggleMarkdown(controller)); },
    mncmNativeNewline: function () { const controller = self; guarded(controller, () => newline(controller)); },
    mncmNativeResize: function (gesture) { const controller = self; guarded(controller, () => resize(controller, gesture)); },
  });
  function create(actions) {
    const controller = nativeClass.new();
    controller._mncmNativeQuickId = "native_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    states[String(controller._mncmNativeQuickId)] = { actions, pending: false, uncertain: false, keyboard: null };
    return controller;
  }
  function mount(controller) {
    const s = state(controller), current = s.actions.getState(controller);
    s.sessionId = current.sessionId; s.markdown = current.markdown;
    const theme = Application.sharedInstance().currentTheme;
    const dark = theme === "Dark" || theme === "Gray", ink = dark ? "#edf0f5" : "#202632", muted = dark ? "#a3adbc" : "#707a88";
    s.backdrop = button(controller, controller.view, "", "关闭输入并保留草稿", "mncmNativeClose");
    s.backdrop.backgroundColor = UIColor.clearColor();
    s.panel = new UIScrollView(controller.view.bounds);
    s.panel.backgroundColor = color(dark ? "#252b35" : "#fcfcfd"); s.panel.layer.cornerRadius = 24;
    s.panel.clipsToBounds = true; s.panel.bounces = false;
    controller.view.addSubview(s.panel);
    s.grabber = button(controller, controller.view, "", "上下拖动调整输入框高度", null);
    s.grabberLine = new UIView({ x: 27, y: 9, width: 34, height: 5 });
    s.grabberLine.backgroundColor = color(muted, 0.45); s.grabberLine.layer.cornerRadius = 2.5; s.grabberLine.userInteractionEnabled = false;
    s.grabber.addSubview(s.grabberLine);
    s.resizeGesture = new UIPanGestureRecognizer(controller, "mncmNativeResize:");
    s.resizeGesture.maximumNumberOfTouches = 1; s.grabber.addGestureRecognizer(s.resizeGesture);
    s.title = label(s.panel, "添加评论", 13, ink);
    s.subtitle = label(s.panel, current.noteTitle, 12, muted);
    s.close = button(controller, s.panel, "×", "关闭输入并保留草稿", "mncmNativeClose");
    s.input = UITextView.new(); s.input.font = UIFont.systemFontOfSize(18);
    s.input.textColor = color(ink); s.input.backgroundColor = UIColor.clearColor();
    s.input.textContainerInset = { top: 6, left: 0, bottom: 8, right: 0 };
    s.input.text = current.submission && current.submission.status !== "failed" ? current.submission.text : current.draft;
    s.input.accessibilityLabel = "评论内容"; s.input.delegate = controller;
    s.panel.addSubview(s.input);
    s.placeholder = label(s.panel, "输入评论内容", 18, muted); s.placeholder.userInteractionEnabled = false;
    s.error = label(s.panel, "", 12, dark ? "#ffb4ae" : "#b03e38"); s.error.numberOfLines = 0;
    s.hint = label(s.panel, "回车换行\n关闭后保留草稿", 11, muted); s.hint.numberOfLines = 2;
    s.markdownButton = button(controller, s.panel, "Markdown", "启用 Markdown 评论", "mncmNativeMarkdown");
    s.markdownButton.titleLabel.font = UIFont.systemFontOfSize(13); s.markdownButton.layer.cornerRadius = 12;
    s.newline = button(controller, s.panel, "↵", "插入换行", "mncmNativeNewline");
    s.submit = button(controller, s.panel, "添加", "添加评论", "mncmNativeSubmit");
    s.submit.titleLabel.font = UIFont.boldSystemFontOfSize(15);
    s.submit.backgroundColor = color("#3478ed"); s.submit.layer.cornerRadius = 14;
    s.submit.setTitleColorForState(UIColor.whiteColor(), 0);
    if (current.submission) {
      s.uncertain = current.submission.status !== "failed";
      s.error.text = current.submission.error || "保存结果待核对，请点击核对按钮";
    }
    s.ready = true;
    refresh(controller); layout(controller);
  }
  function unmount(controller) {
    const s = state(controller);
    if (!s) return;
    try { if (s.input) s.input.delegate = null; }
    finally { delete states[String(controller._mncmNativeQuickId)]; }
  }
  return { create, mount, layout, focus, keyboard, snapshot, unmount,
    dispose: addon => { delete heights[String(addon && addon._mncmQuickOwnerId)]; },
    input: controller => state(controller).input, panel: controller => state(controller).panel };
})();
