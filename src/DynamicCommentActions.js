var __MN_DYNAMIC_COMMENT_ACTIONS__ = (function () {
  const BUTTON_TAG = 9304102;
  const MNPINNER_FOLLOW_BUTTON_TAG = 9205101;
  const MNLITERATURE_FOLLOW_BUTTON_TAG = 762041;
  const BUTTON_SIZE = 36;
  const BUTTON_GAP = 10;
  const INITIAL_SHOW_DELAY = 0.02;
  const POPUP_CLOSE_HIDE_DELAY = 0.18;
  const TOUCH_INTERACTION_HOLD_MS = 900;

  function delay(seconds, callback) {
    NSTimer.scheduledTimerWithTimeInterval(Math.max(0, Number(seconds || 0)), false, function () {
      try { callback && callback(); } catch (_) {}
    });
  }

  function toArrayLike(raw) {
    const out = [];
    try {
      if (!raw) return out;
      if (Array.isArray(raw)) return raw.filter(Boolean);
      const length = Number(raw.length);
      if (Number.isFinite(length) && length >= 0) {
        for (let index = 0; index < length; index += 1) if (raw[index]) out.push(raw[index]);
        if (out.length || length === 0) return out;
      }
      const count = typeof raw.count === "function" ? Number(raw.count()) : Number(raw.count);
      if (Number.isFinite(count) && count >= 0 && typeof raw.objectAtIndex === "function") {
        for (let index = 0; index < count; index += 1) {
          const item = raw.objectAtIndex(index);
          if (item) out.push(item);
        }
      }
    } catch (_) {}
    return out;
  }

  function getHostView(addon) {
    try {
      if (typeof MNUtil !== "undefined" && MNUtil && MNUtil.studyView) return MNUtil.studyView;
      return addon && addon.webController && addon.webController.view ? addon.webController.view.superview : null;
    } catch (_) {
      return null;
    }
  }

  function findSubviewByTag(parent, tag, depth) {
    try {
      if (!parent || Number(depth || 0) > 8) return null;
      if (typeof parent.viewWithTag === "function") {
        const found = parent.viewWithTag(Number(tag));
        if (found) return found;
      }
      const children = toArrayLike(parent.subviews);
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (Number(child && child.tag) === Number(tag)) return child;
        const nested = findSubviewByTag(child, tag, Number(depth || 0) + 1);
        if (nested) return nested;
      }
    } catch (_) {}
    return null;
  }

  function rectFromView(view, hostView) {
    try {
      if (!view || view.hidden === true || view.enabled === false || view.userInteractionEnabled === false) return null;
      if (view.layer && Number(view.layer.opacity) > 0 && Number(view.layer.opacity) < 0.01) return null;
      if (hostView && typeof view.convertRectToView === "function") {
        const converted = view.convertRectToView(view.bounds, hostView);
        if (converted && Number(converted.width || 0) > 0 && Number(converted.height || 0) > 0) return converted;
      }
      const frame = view.frame || view.bounds;
      if (!frame || Number(frame.width || 0) <= 0 || Number(frame.height || 0) <= 0) return null;
      return { x: Number(frame.x || 0), y: Number(frame.y || 0), width: Number(frame.width || 0), height: Number(frame.height || 0) };
    } catch (_) {
      return null;
    }
  }

  function rectOverlapArea(left, right) {
    if (!left || !right) return 0;
    const x1 = Math.max(Number(left.x || 0), Number(right.x || 0));
    const y1 = Math.max(Number(left.y || 0), Number(right.y || 0));
    const x2 = Math.min(Number(left.x || 0) + Number(left.width || 0), Number(right.x || 0) + Number(right.width || 0));
    const y2 = Math.min(Number(left.y || 0) + Number(left.height || 0), Number(right.y || 0) + Number(right.height || 0));
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  }

  function extractNoteId(candidate) {
    try {
      if (!candidate) return "";
      if (typeof candidate === "string") return candidate.trim();
      const direct = String(candidate.noteId || candidate.noteid || candidate.id || "").trim();
      if (direct) return direct;
      return extractNoteId(candidate.note);
    } catch (_) {
      return "";
    }
  }

  function isCurrentWindow(addon) {
    try {
      return !!addon && addon.window === MNUtil.currentWindow;
    } catch (_) {
      return false;
    }
  }

  function resolveContext(addon, sender) {
    try {
      const userInfo = sender && sender.userInfo ? sender.userInfo : {};
      let noteId = extractNoteId(userInfo.note || userInfo.noteid || userInfo.noteId);
      if (!noteId) {
        try {
          const focusNote = MNNote && typeof MNNote.getFocusNote === "function" ? MNNote.getFocusNote(true) : null;
          noteId = extractNoteId(focusNote);
        } catch (_) {}
      }
      if (!noteId) return null;
      const note = MNNote.new(noteId, false);
      if (!note || !note.noteId) return null;
      const hostView = getHostView(addon);
      let anchorRect = null;
      try {
        const popup = typeof PopupMenu !== "undefined" && PopupMenu && typeof PopupMenu.currentMenu === "function" ? PopupMenu.currentMenu() : null;
        anchorRect = popup ? (popup.targetWinRect || popup.frame || null) : null;
      } catch (_) {}
      anchorRect = anchorRect || userInfo.winRect || null;
      if (!anchorRect) return null;
      return {
        token: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        note,
        noteId: String(note.noteId),
        sender,
        anchorRect: { x: Number(anchorRect.x || 0), y: Number(anchorRect.y || 0), width: Number(anchorRect.width || 0), height: Number(anchorRect.height || 0) },
        hostView,
      };
    } catch (_) {
      return null;
    }
  }

  function refreshAnchorRect(context) {
    try {
      const popup = typeof PopupMenu !== "undefined" && PopupMenu && typeof PopupMenu.currentMenu === "function" ? PopupMenu.currentMenu() : null;
      const rect = popup && (popup.targetWinRect || popup.frame);
      if (rect && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0) {
        context.anchorRect = { x: Number(rect.x || 0), y: Number(rect.y || 0), width: Number(rect.width || 0), height: Number(rect.height || 0) };
      }
    } catch (_) {}
  }

  function collectOccupiedRects(hostView) {
    const views = [];
    const push = (view) => {
      if (!view || views.indexOf(view) >= 0) return;
      const rect = rectFromView(view, hostView);
      if (rect) views.push(view);
    };
    try { if (typeof pinnerUtils !== "undefined" && pinnerUtils && pinnerUtils.pinnerController) push(pinnerUtils.pinnerController.followModeButton); } catch (_) {}
    try { push(findSubviewByTag(hostView, MNPINNER_FOLLOW_BUTTON_TAG)); } catch (_) {}
    try { push(findSubviewByTag(hostView, MNLITERATURE_FOLLOW_BUTTON_TAG)); } catch (_) {}
    try {
      const chatDynamic = (typeof chatAIUtils !== "undefined" && chatAIUtils && chatAIUtils.dynamicController)
        ? chatAIUtils.dynamicController
        : ((typeof dynamicController !== "undefined" && dynamicController) ? dynamicController : null);
      if (chatDynamic) {
        push(chatDynamic.view);
        ["addButton", "aiButton", "chatButton", "sourceButton", "modelButton"].forEach((name) => push(chatDynamic[name]));
      }
    } catch (_) {}
    toArrayLike(hostView && hostView.subviews).forEach((view) => {
      try { if (view && "mntoolbar" in Object(view)) push(view); } catch (_) {}
    });
    return views.map((view) => rectFromView(view, hostView)).filter(Boolean);
  }

  function resolveButtonFrame(addon, context) {
    const hostView = getHostView(addon);
    const bounds = hostView && hostView.bounds;
    if (!bounds || !context || !context.anchorRect) return null;
    const anchor = context.anchorRect;
    const maxX = Math.max(0, Number(bounds.width || 0) - BUTTON_SIZE);
    const maxY = Math.max(0, Number(bounds.height || 0) - BUTTON_SIZE);
    const occupied = collectOccupiedRects(hostView);
    const rightX = Number(anchor.x || 0) + Number(anchor.width || 0) + BUTTON_GAP;
    const leftX = Number(anchor.x || 0) - BUTTON_SIZE - BUTTON_GAP;
    const topY = Number(anchor.y || 0) - BUTTON_SIZE - BUTTON_GAP;
    const bottomY = Number(anchor.y || 0) + Number(anchor.height || 0) + BUTTON_GAP;
    const centerY = Number(anchor.y || 0) + Number(anchor.height || 0) * 0.5 - BUTTON_SIZE * 0.5;
    const centerX = Number(anchor.x || 0) + Number(anchor.width || 0) * 0.5 - BUTTON_SIZE * 0.5;
    const candidates = [
      { x: rightX, y: centerY, score: 0 }, { x: leftX, y: centerY, score: 20 },
      { x: centerX, y: bottomY, score: 40 }, { x: centerX, y: topY, score: 60 },
    ];
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const x = Math.max(0, Math.min(maxX, Number(candidate.x || 0)));
      const y = Math.max(0, Math.min(maxY, Number(candidate.y || 0)));
      const frame = { x, y, width: BUTTON_SIZE, height: BUTTON_SIZE };
      let score = Number(candidate.score || 0) + Math.abs(x - Number(candidate.x || 0)) * 8 + Math.abs(y - Number(candidate.y || 0)) * 4;
      score += rectOverlapArea(frame, anchor) * 50;
      occupied.forEach((rect) => { score += rectOverlapArea(frame, rect) * 100; });
      if (score < bestScore) { bestScore = score; best = frame; }
    });
    return best;
  }

  function ensureButton(addon) {
    const hostView = getHostView(addon);
    if (!hostView) return null;
    let button = addon.dynamicCommentButton;
    if (!button) {
      const staleButton = findSubviewByTag(hostView, BUTTON_TAG);
      try { if (staleButton && staleButton.removeFromSuperview) staleButton.removeFromSuperview(); } catch (_) {}
    }
    if (!button) {
      button = UIButton.buttonWithType(0);
      button.tag = BUTTON_TAG;
      button.frame = { x: 0, y: 0, width: BUTTON_SIZE, height: BUTTON_SIZE };
      button.layer.cornerRadius = BUTTON_SIZE * 0.5;
      button.layer.shadowOffset = { width: 0, height: 2 };
      button.layer.shadowRadius = 8;
      button.layer.shadowOpacity = 0.18;
      button.layer.shadowColor = MNUtil.hexColorAlpha("#1f2937", 1);
      button.backgroundColor = MNUtil.hexColorAlpha("#ffffff", 0.96);
      button.layer.borderWidth = 1;
      button.layer.borderColor = MNUtil.hexColorAlpha("#d1d5db", 0.95);
      button.setTitleForState("评", 0);
      button.setTitleColorForState(MNUtil.hexColorAlpha("#2563eb", 1), 0);
      button.titleLabel.font = UIFont.boldSystemFontOfSize(15);
      button.accessibilityLabel = "MN Comment Manager 评论";
      button.addTargetActionForControlEvents(addon, "dynamicCommentButtonTouchDown:", 1 << 0);
      button.addTargetActionForControlEvents(addon, "dynamicCommentButtonTapped:", 1 << 6);
      try {
        MNButton.addLongPressGesture(button, addon, "dynamicCommentButtonLongPressed:", 0.45);
      } catch (error) {
        console.log(`[MN Comment Manager] dynamic long-press binding failed: ${error && error.message ? error.message : error}`);
      }
      hostView.addSubview(button);
    }
    button.hidden = true;
    addon.dynamicCommentButton = button;
    return button;
  }

  function hideButton(addon, reason) {
    try {
      const button = addon && (addon.dynamicCommentButton || findSubviewByTag(getHostView(addon), BUTTON_TAG));
      if (button) { button.hidden = true; button.enabled = false; button.userInteractionEnabled = false; }
      if (addon) {
        addon.dynamicCommentContext = null;
        addon.dynamicCommentMenuPopoverController = null;
        addon.dynamicCommentInteractionUntil = 0;
        addon.dynamicCommentTapSuppressedUntil = 0;
      }
      console.log(`[MN Comment Manager] dynamic button hidden: ${reason || ""}`);
    } catch (_) {}
  }

  function disposeButton(addon, reason) {
    try {
      const button = addon && (addon.dynamicCommentButton || findSubviewByTag(getHostView(addon), BUTTON_TAG));
      hideButton(addon, reason || "dispose");
      if (button && button.removeFromSuperview) button.removeFromSuperview();
      if (addon) addon.dynamicCommentButton = null;
      return !!button;
    } catch (error) {
      console.log(`[MN Comment Manager] dispose dynamic button failed: ${error && error.message ? error.message : error}`);
      return false;
    }
  }

  function showForContext(addon, context) {
    if (!addon || !context || !addon.dynamicCommentContext || addon.dynamicCommentContext.token !== context.token) return false;
    refreshAnchorRect(context);
    const button = ensureButton(addon);
    const frame = resolveButtonFrame(addon, context);
    if (!button || !frame) return false;
    button.frame = frame;
    button.hidden = false;
    button.enabled = true;
    button.userInteractionEnabled = true;
    try { button.superview.bringSubviewToFront(button); } catch (_) {}
    return true;
  }

  function handlePopupMenuOnNote(addon, sender) {
    if (!isCurrentWindow(addon)) return false;
    if (!__MN_COMMENT_ACTION_SETTINGS__.getSettings().enableDynamicSingleCardButton) {
      hideButton(addon, "disabled");
      return false;
    }
    const context = resolveContext(addon, sender);
    if (!context) { hideButton(addon, "noSingleNote"); return false; }
    addon.dynamicCommentContext = context;
    delay(INITIAL_SHOW_DELAY, () => showForContext(addon, context));
    return true;
  }

  function handlePopupMenuClosed(addon) {
    if (!isCurrentWindow(addon)) return false;
    const context = addon && addon.dynamicCommentContext;
    const token = context && context.token;
    if (!token) return false;
    delay(POPUP_CLOSE_HIDE_DELAY, () => {
      if (!addon || !addon.dynamicCommentContext || addon.dynamicCommentContext.token !== token) return;
      const remaining = Number(addon.dynamicCommentInteractionUntil || 0) - Date.now();
      if (remaining > 0) return;
      hideButton(addon, "popup.closed");
    });
    return true;
  }

  function openMenu(addon, button) {
    const context = addon && addon.dynamicCommentContext;
    if (!context || !context.note) { hideButton(addon, "menu.noContext"); return false; }
    const param = String(context.noteId || "");
    const item = (title, selector) => ({ title, object: addon, selector, param, checked: false });
    const popover = MNUtil.getPopoverAndPresent(button || addon.dynamicCommentButton, [
      item("── 单选处理 ──", "noopBatchCommentAction:"),
      item("  只保留第一条内容", "runSingleKeepFirstContent:"),
      item("  转换 HTML 为 Markdown", "runSingleConvertHtmlToMarkdown:"),
      item("  转为非摘录版", "runSingleConvertToNoExcerpt:"),
      item("  去掉链接评论", "runSingleRemoveAllLinks:"),
      item("  清空评论", "runSingleClearAllComments:"),
      item("  清空标题", "runSingleClearAllTitles:"),
    ], 280, 0);
    if (!popover) { hideButton(addon, "menu.presentFailed"); return false; }
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    return true;
  }

  function dismissMenu(addon, animated) {
    const popover = addon && addon.dynamicCommentMenuPopoverController;
    if (!popover) return false;
    addon.dynamicCommentMenuPopoverController = null;
    try {
      if (typeof popover.dismissPopoverAnimated === "function") {
        popover.dismissPopoverAnimated(animated !== false);
      }
      return true;
    } catch (error) {
      console.log(`[MN Comment Manager] dismiss dynamic menu failed: ${error && error.message ? error.message : error}`);
      return false;
    }
  }

  function handleMenuDismissed(addon) {
    if (!addon || !addon.dynamicCommentMenuPopoverController) return false;
    hideButton(addon, "menu.dismissed");
    return true;
  }

  function beginInteraction(addon) {
    try {
      if (!addon || !addon.dynamicCommentContext) return false;
      addon.dynamicCommentInteractionUntil = Date.now() + TOUCH_INTERACTION_HOLD_MS;
      return true;
    } catch (_) {
      return false;
    }
  }

  function suppressTapAfterLongPress(addon) {
    try {
      addon.dynamicCommentTapSuppressedUntil = Date.now() + 900;
      addon.dynamicCommentInteractionUntil = Date.now() + 3600;
    } catch (_) {}
  }

  function consumeTapSuppression(addon) {
    try {
      if (Number(addon && addon.dynamicCommentTapSuppressedUntil || 0) > Date.now()) {
        addon.dynamicCommentTapSuppressedUntil = 0;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function noteFromSender(addon, sender) {
    let rawExpectedId = sender;
    try {
      if (sender && typeof sender !== "string" && sender.param !== undefined) {
        rawExpectedId = sender.param;
      }
    } catch (_) {}
    const context = addon && addon.dynamicCommentContext;
    const expectedId = String(rawExpectedId || (context && context.noteId) || "").trim();
    if (!expectedId) throw new Error("未读取到菜单绑定的卡片");
    if (context && context.noteId && String(context.noteId) !== expectedId) {
      throw new Error("单选卡片已变化，请重新打开菜单");
    }
    if (context && context.note && String(context.noteId) === expectedId) return context.note;
    const note = MNNote.new(expectedId, false);
    if (!note || !note.noteId) throw new Error("菜单绑定的卡片不存在或已被删除");
    return note;
  }

  function runAction(addon, sender, action) {
    try {
      const note = noteFromSender(addon, sender);
      return __MN_COMMENT_MUTATIONS__[action]([note], { allowSingle: true });
    } finally {
      dismissMenu(addon, true);
      hideButton(addon, "action.done");
    }
  }

  return { handlePopupMenuOnNote, handlePopupMenuClosed, hideButton, disposeButton, openMenu, handleMenuDismissed, beginInteraction, suppressTapAfterLongPress, consumeTapSuppression,
    runKeepFirstContent: (addon, sender) => runAction(addon, sender, "keepFirstContentForNotes"),
    runConvertHtmlToMarkdown: (addon, sender) => runAction(addon, sender, "convertHtmlCommentsToMarkdownForNotes"),
    runConvertToNoExcerpt: (addon, sender) => runAction(addon, sender, "convertNotesToNoExcerptForNotes"),
    runRemoveAllLinks: (addon, sender) => runAction(addon, sender, "removeAllLinkCommentsForNotes"),
    runClearAllComments: (addon, sender) => runAction(addon, sender, "clearAllCommentsForNotes"),
    runClearAllTitles: (addon, sender) => runAction(addon, sender, "clearAllTitlesForNotes"),
  };
})();
