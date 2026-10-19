var __MN_DYNAMIC_COMMENT_ACTIONS__ = (function () {
  const BUTTON_TAG = 9304102;
  const ADD_BUTTON_TAG = 9304103;
  const MOVE_BUTTON_TAG = 9304104;
  const MNPINNER_FOLLOW_BUTTON_TAG = 9205101;
  const MNPINNER_EXTRA_BUTTON_TAG = 9205103;
  const MNLITERATURE_FOLLOW_BUTTON_TAG = 762041;
  const BUTTON_SIZE = 44;
  const GROUP_GAP = 4;
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
      if (!view) return null;
      let ancestor = view;
      for (let depth = 0; ancestor && depth < 12; depth += 1, ancestor = ancestor.superview) {
        if (ancestor.hidden === true || ancestor.alpha !== undefined && Number(ancestor.alpha) < 0.01 ||
            ancestor.layer && ancestor.layer.opacity !== undefined && Number(ancestor.layer.opacity) < 0.01) return null;
        if (ancestor === hostView) break;
      }
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

  function debug(event, details) {
    try { console.log(`[MN Comment Manager][single-workflow] ${event}`, details || ""); } catch (_) {}
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
      if (!noteId) { debug("context.no-note-id", { hasUserInfo: !!userInfo }); return null; }
      const note = MNNote.new(noteId, false);
      if (!note || !note.noteId) { debug("context.note-create-failed", { noteId }); return null; }
      const hostView = getHostView(addon);
      let anchorRect = null;
      try {
        const popup = typeof PopupMenu !== "undefined" && PopupMenu && typeof PopupMenu.currentMenu === "function" ? PopupMenu.currentMenu() : null;
        anchorRect = popup ? (popup.targetWinRect || popup.frame || null) : null;
      } catch (_) {}
      anchorRect = anchorRect || userInfo.winRect || null;
      if (!anchorRect) { debug("context.no-anchor", { noteId }); return null; }
      const result = {
        token: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        note,
        noteId: String(note.noteId),
        sender,
        anchorRect: { x: Number(anchorRect.x || 0), y: Number(anchorRect.y || 0), width: Number(anchorRect.width || 0), height: Number(anchorRect.height || 0) },
        hostView,
      };
      debug("context.resolved", { noteId: result.noteId, token: result.token, hasAnchor: true });
      return result;
    } catch (_) {
      debug("context.exception");
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
    try {
      if (typeof pinnerUtils !== "undefined" && pinnerUtils && pinnerUtils.pinnerController) {
        ["followModeButton", "followModeExtraButton", "pinActionMenuWebView", "actionMenuWebView"].forEach((name) => push(pinnerUtils.pinnerController[name]));
      }
    } catch (_) {}
    try { push(findSubviewByTag(hostView, MNPINNER_FOLLOW_BUTTON_TAG)); } catch (_) {}
    try { push(findSubviewByTag(hostView, MNPINNER_EXTRA_BUTTON_TAG)); } catch (_) {}
    try { push(findSubviewByTag(hostView, MNLITERATURE_FOLLOW_BUTTON_TAG)); } catch (_) {}
    try { if (typeof PopupMenu !== "undefined" && PopupMenu && typeof PopupMenu.currentMenu === "function") push(PopupMenu.currentMenu()); } catch (_) {}
    try {
      const chatDynamic = (typeof chatAIUtils !== "undefined" && chatAIUtils && chatAIUtils.dynamicController)
        ? chatAIUtils.dynamicController
        : ((typeof dynamicController !== "undefined" && dynamicController) ? dynamicController : null);
      if (chatDynamic) {
        push(chatDynamic.view);
        ["addButton", "aiButton", "chatButton", "sourceButton", "modelButton"].forEach((name) => push(chatDynamic[name]));
      }
    } catch (_) {}
    const collectToolbars = (parent, depth) => {
      if (!parent || parent.hidden === true || depth > 3) return;
      toArrayLike(parent.subviews).forEach((view) => {
        try { if (view && view.mntoolbar === true) push(view); } catch (_) {}
        collectToolbars(view, depth + 1);
      });
    };
    collectToolbars(hostView, 0);
    return views.map((view) => rectFromView(view, hostView)).filter(Boolean);
  }

  function buttonGroup(context) {
    const adding = __MN_COMMENT_ACTION_SETTINGS__.getSettings().showQuickCommentButton !== false;
    // All serialized comments currently support canMove; counting needs no media snapshot.
    const comments = context && context.note && context.note.comments;
    const moving = Array.isArray(comments) && comments.length > 1;
    const count = 1 + (adding ? 1 : 0) + (moving ? 1 : 0);
    return { adding, moving, width: count * BUTTON_SIZE + (count - 1) * GROUP_GAP };
  }

  function resolveButtonFrame(addon, context, group) {
    const preferred = resolvePreferredButtonFrame(addon, context, group);
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ === "undefined") return preferred;
    if (!context || !context.anchorRect) return null;
    const host = getHostView(addon);
    let anchor = context.anchorRect;
    try { if (host && typeof host.convertRectFromView === "function") anchor = host.convertRectFromView(anchor, addon.window); } catch (_) { return null; }
    const frame = __MN_ADDON_FLOATING_LAYOUT__.place(host, {
      priority: 30,
      preferred: preferred || { x: context.anchorRect.x, y: context.anchorRect.y, width: group.width, height: BUTTON_SIZE },
      width: group.width, height: BUTTON_SIZE, ownViews: [addon.dynamicCommentButton, addon.dynamicAddCommentButton, addon.dynamicMoveCommentButton],
      anchor, avoid: [anchor], previous: context._floatingGroupFrame
    });
    context._floatingGroupFrame = frame;
    return frame;
  }

  function resolvePreferredButtonFrame(addon, context, group) {
    const hostView = getHostView(addon);
    const bounds = hostView && hostView.bounds;
    if (!bounds || !context || !context.anchorRect) return null;
    let anchor = context.anchorRect;
    try { if (typeof hostView.convertRectFromView === "function") anchor = hostView.convertRectFromView(anchor, addon.window); } catch (_) {}
    if (!anchor) return null;
    const groupWidth = group.width;
    if (Number(bounds.width || 0) < groupWidth || Number(bounds.height || 0) < BUTTON_SIZE) return null;
    const maxX = Math.max(0, Number(bounds.width || 0) - groupWidth);
    const maxY = Math.max(0, Number(bounds.height || 0) - BUTTON_SIZE);
    const occupied = collectOccupiedRects(hostView).map((rect) => ({ x: rect.x - 6, y: rect.y - 6, width: rect.width + 12, height: rect.height + 12 }));
    const rightX = Number(anchor.x || 0) + Number(anchor.width || 0) + BUTTON_GAP;
    const leftX = Number(anchor.x || 0) - groupWidth - BUTTON_GAP;
    const topY = Number(anchor.y || 0) - BUTTON_SIZE - BUTTON_GAP;
    const bottomY = Number(anchor.y || 0) + Number(anchor.height || 0) + BUTTON_GAP;
    const centerY = Number(anchor.y || 0) + Number(anchor.height || 0) * 0.5 - BUTTON_SIZE * 0.5;
    const centerX = Number(anchor.x || 0) + Number(anchor.width || 0) * 0.5 - groupWidth * 0.5;
    const candidates = [
      { x: rightX, y: centerY, score: 0 }, { x: leftX, y: centerY, score: 20 },
      { x: centerX, y: bottomY, score: 40 }, { x: centerX, y: topY, score: 60 },
    ];
    // Obstacle edges supply free positions when all four card-adjacent slots are blocked.
    const xs = [rightX, leftX, centerX, 6, maxX - 6], ys = [centerY, topY, bottomY, 6, maxY - 6];
    occupied.forEach((rect) => { xs.push(rect.x - groupWidth, rect.x + rect.width); ys.push(rect.y - BUTTON_SIZE, rect.y + rect.height); });
    xs.forEach((x) => ys.forEach((y) => candidates.push({ x, y, score: 80 + Math.abs(x - rightX) + Math.abs(y - centerY) })));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const x = Math.max(0, Math.min(maxX, Number(candidate.x || 0)));
      const y = Math.max(0, Math.min(maxY, Number(candidate.y || 0)));
      const frame = { x, y, width: groupWidth, height: BUTTON_SIZE };
      let score = Number(candidate.score || 0) + Math.abs(x - Number(candidate.x || 0)) * 8 + Math.abs(y - Number(candidate.y || 0)) * 4;
      if (rectOverlapArea(frame, anchor) > 0 || occupied.some((rect) => rectOverlapArea(frame, rect) > 0)) return;
      if (score < bestScore) { bestScore = score; best = frame; }
    });
    return best;
  }

  function ensureButton(addon, adding) {
    const hostView = getHostView(addon);
    if (!hostView) return null;
    const moving = adding === "move";
    const property = moving ? "dynamicMoveCommentButton" : adding ? "dynamicAddCommentButton" : "dynamicCommentButton";
    const tag = moving ? MOVE_BUTTON_TAG : adding ? ADD_BUTTON_TAG : BUTTON_TAG;
    let button = addon[property];
    if (!button) {
      const staleButton = findSubviewByTag(hostView, tag);
      try { if (staleButton && staleButton.removeFromSuperview) staleButton.removeFromSuperview(); } catch (_) {}
    }
    if (!button) {
      button = UIButton.buttonWithType(0);
      button.tag = tag;
      button.frame = { x: 0, y: 0, width: BUTTON_SIZE, height: BUTTON_SIZE };
      button.layer.cornerRadius = BUTTON_SIZE * 0.5;
      button.layer.shadowOffset = { width: 0, height: 2 };
      button.layer.shadowRadius = 8;
      button.layer.shadowOpacity = 0.18;
      button.layer.shadowColor = MNUtil.hexColorAlpha("#1f2937", 1);
      button.backgroundColor = MNUtil.hexColorAlpha("#ffffff", 0.96);
      button.layer.borderWidth = 1;
      button.layer.borderColor = MNUtil.hexColorAlpha("#d1d5db", 0.95);
      if (moving) button.setTitleForState("↕", 0);
      else try { button.setImageForState(MNUtil.getImage(`${addon.mainPath}/${adding ? "comment-add" : "comment-manage"}.png`, 3), 0); }
      catch (_) { button.setTitleForState(adding ? "＋" : "☷", 0); }
      button.setTitleColorForState(MNUtil.hexColorAlpha("#2563eb", 1), 0);
      button.titleLabel.font = UIFont.boldSystemFontOfSize(15);
      button.accessibilityLabel = moving ? "移动评论" : adding ? "添加评论" : "评论管理器";
      button.addTargetActionForControlEvents(addon, "dynamicCommentButtonTouchDown:", 1 << 0);
      button.addTargetActionForControlEvents(addon, moving ? "dynamicMoveCommentButtonTapped:" : adding ? "dynamicAddCommentButtonTapped:" : "dynamicCommentButtonTapped:", 1 << 6);
      if (!moving) try {
        MNButton.addLongPressGesture(button, addon, adding ? "dynamicAddCommentButtonLongPressed:" : "dynamicCommentButtonLongPressed:", 0.45);
      } catch (error) {
        console.log(`[MN Comment Manager] dynamic long-press binding failed: ${error && error.message ? error.message : error}`);
      }
      hostView.addSubview(button);
    } else if (button.superview !== hostView) {
      hostView.addSubview(button);
    }
    button.hidden = true;
    addon[property] = button;
    return button;
  }

  function hideButton(addon, reason) {
    try {
      if (typeof __MN_COMMENT_MOVE_MNCommentManagerAddon !== "undefined") __MN_COMMENT_MOVE_MNCommentManagerAddon.remove(addon);
      if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined") __MN_ADDON_FLOATING_LAYOUT__.release([addon.dynamicCommentButton, addon.dynamicAddCommentButton, addon.dynamicMoveCommentButton]);
      const button = addon && (addon.dynamicCommentButton || findSubviewByTag(getHostView(addon), BUTTON_TAG));
      if (button) { button.hidden = true; button.enabled = false; button.userInteractionEnabled = false; }
      const addButton = addon && addon.dynamicAddCommentButton;
      if (addButton) { addButton.hidden = true; addButton.enabled = false; addButton.userInteractionEnabled = false; }
      const moveButton = addon && addon.dynamicMoveCommentButton;
      if (moveButton) { moveButton.hidden = true; moveButton.enabled = false; moveButton.userInteractionEnabled = false; }
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
      const addButton = addon && addon.dynamicAddCommentButton;
      if (addButton && addButton.removeFromSuperview) addButton.removeFromSuperview();
      const moveButton = addon && addon.dynamicMoveCommentButton;
      if (moveButton && moveButton.removeFromSuperview) moveButton.removeFromSuperview();
      if (addon) addon.dynamicMoveCommentButton = null;
      if (addon) addon.dynamicAddCommentButton = null;
      if (addon) addon.dynamicCommentButton = null;
      return !!button;
    } catch (error) {
      console.log(`[MN Comment Manager] dispose dynamic button failed: ${error && error.message ? error.message : error}`);
      return false;
    }
  }

  function showForContext(addon, context) {
    if (!addon || addon.window !== MNUtil.currentWindow || !__MN_COMMENT_ACTION_SETTINGS__.getSettings().enableDynamicSingleCardButton) return false;
    if (Number(addon && addon.dynamicCommentInteractionUntil || 0) > Date.now() || addon && (addon.dynamicCommentMenuPopoverController || addon.dynamicMoveRailView)) return false;
    if (!addon || !context || !addon.dynamicCommentContext || addon.dynamicCommentContext.token !== context.token) return false;
    refreshAnchorRect(context);
    const button = ensureButton(addon);
    const group = buttonGroup(context);
    const frame = resolveButtonFrame(addon, context, group);
    if (!button || !frame) {
      if (button) { button.hidden = true; button.enabled = false; button.userInteractionEnabled = false; }
      if (addon.dynamicAddCommentButton) { addon.dynamicAddCommentButton.hidden = true; addon.dynamicAddCommentButton.enabled = false; addon.dynamicAddCommentButton.userInteractionEnabled = false; }
      if (addon.dynamicMoveCommentButton) { addon.dynamicMoveCommentButton.hidden = true; addon.dynamicMoveCommentButton.enabled = false; addon.dynamicMoveCommentButton.userInteractionEnabled = false; }
      return false;
    }
    button.frame = { x: frame.x, y: frame.y, width: BUTTON_SIZE, height: BUTTON_SIZE };
    button.hidden = false;
    button.enabled = true;
    button.userInteractionEnabled = true;
    try { button.superview.bringSubviewToFront(button); } catch (_) {}
    const adding = group.adding;
    const addButton = ensureButton(addon, true);
    if (addButton) {
      addButton.frame = { x: frame.x + BUTTON_SIZE + GROUP_GAP, y: frame.y, width: BUTTON_SIZE, height: BUTTON_SIZE };
      addButton.hidden = !adding;
      addButton.enabled = adding;
      addButton.userInteractionEnabled = adding;
      try { if (adding) addButton.superview.bringSubviewToFront(addButton); } catch (_) {}
    }
    const moveButton = ensureButton(addon, "move");
    if (moveButton) {
      moveButton.frame = { x: frame.x + (adding ? 2 : 1) * (BUTTON_SIZE + GROUP_GAP), y: frame.y, width: BUTTON_SIZE, height: BUTTON_SIZE };
      moveButton.hidden = !group.moving;
      moveButton.enabled = group.moving;
      moveButton.userInteractionEnabled = group.moving;
      try { if (group.moving) moveButton.superview.bringSubviewToFront(moveButton); } catch (_) {}
    }
    return true;
  }

  function handlePopupMenuOnNote(addon, sender) {
    if (!isCurrentWindow(addon)) return false;
    if (addon.quickCommentController && !addon.quickCommentController._quickClosePending && Number(addon.quickCommentController._quickExiting || 0) !== 1) return false;
    if (!__MN_COMMENT_ACTION_SETTINGS__.getSettings().enableDynamicSingleCardButton) {
      hideButton(addon, "disabled");
      return false;
    }
    const context = resolveContext(addon, sender);
    if (!context) { hideButton(addon, "noSingleNote"); return false; }
    if (typeof __MN_COMMENT_MOVE_MNCommentManagerAddon !== "undefined") __MN_COMMENT_MOVE_MNCommentManagerAddon.remove(addon);
    addon.dynamicCommentInteractionUntil = 0;
    addon.dynamicCommentContext = context;
    delay(INITIAL_SHOW_DELAY, () => showForContext(addon, context));
    // Other addons reveal their controls after the popup notification has finished.
    const settle = typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined"
      ? (callback) => __MN_ADDON_FLOATING_LAYOUT__.settle(delay, () => !!addon.dynamicCommentContext && addon.dynamicCommentContext.token === context.token, callback)
      : (callback) => [0.12, 0.3].forEach(seconds => delay(seconds, callback));
    settle(() => {
      if (isCurrentWindow(addon) && (!addon.quickCommentController || addon.quickCommentController._quickClosePending || Number(addon.quickCommentController._quickExiting || 0) === 1) && !addon.dynamicCommentMenuPopoverController &&
          Number(addon.dynamicCommentInteractionUntil || 0) <= Date.now() &&
          __MN_COMMENT_ACTION_SETTINGS__.getSettings().enableDynamicSingleCardButton &&
          addon.dynamicCommentContext && addon.dynamicCommentContext.token === context.token) showForContext(addon, context);
    });
    return true;
  }

  function handlePopupMenuClosed(addon, sender) {
    if (!isCurrentWindow(addon)) return false;
    const context = addon && addon.dynamicCommentContext;
    const info = sender && sender.userInfo || {};
    const closingNoteId = extractNoteId(info.note || info.noteid || info.noteId);
    if (closingNoteId && context && closingNoteId !== context.noteId) return false;
    const token = context && context.token;
    if (!token) return false;
    delay(POPUP_CLOSE_HIDE_DELAY, () => {
      if (!addon || !addon.dynamicCommentContext || addon.dynamicCommentContext.token !== token) return;
      if (addon.dynamicMoveRailView) return;
      const remaining = Number(addon.dynamicCommentInteractionUntil || 0) - Date.now();
      if (remaining > 0) return;
      hideButton(addon, "popup.closed");
    });
    return true;
  }

  function presentSingleMenu(sender, items, requestedWidth, preferredPosition) {
    let width = requestedWidth;
    let position = preferredPosition;
    try {
      const view = MNUtil.studyView;
      const bounds = view && view.bounds;
      const rect = sender && typeof sender.convertRectToView === 'function'
        ? sender.convertRectToView(sender.bounds, view) : null;
      if (bounds && rect && Number(bounds.width) > 16 && Number(bounds.height) > 0) {
        const x = Number(rect.x), y = Number(rect.y), w = Number(rect.width), h = Number(rect.height);
        const leftEdge = Number(bounds.x || 0), topEdge = Number(bounds.y || 0);
        if ([x, y, w, h, leftEdge, topEdge, Number(bounds.width), Number(bounds.height), Number(width)].every(Number.isFinite)) {
          width = Math.min(Number(width), Number(bounds.width) - 16);
          const left = x - leftEdge, right = leftEdge + Number(bounds.width) - x - w;
          const needed = width + 12;
          if (position === 0 && left < needed) {
            position = right >= needed || right > left ? 4 : 0;
          } else if (position === 4 && right < needed) {
            position = left >= needed || left > right ? 0 : 4;
          }
          if ((position === 0 || position === 4) && Math.max(left, right) < needed) {
            const above = y - topEdge, below = topEdge + Number(bounds.height) - y - h;
            position = below >= above ? 3 : 2;
          }
        }
      }
    } catch (_) {
      // Keep the existing presentation path if the host cannot provide geometry.
    }
    return MNUtil.getPopoverAndPresent(sender, items, width, position);
  }

  function openMenu(addon, button) {
    const context = addon && addon.dynamicCommentContext;
    debug("menu.open", { hasContext: !!context, noteId: context && context.noteId, token: context && context.token });
    if (!context || !context.note) { hideButton(addon, "menu.noContext"); return false; }
    const items = __MN_COMMENT_WORKFLOW_MENU__.buildItems(addon, context, "single", "root");
    const popover = presentSingleMenu(button || addon.dynamicCommentButton, items, 280, 0);
    if (!popover) { hideButton(addon, "menu.presentFailed"); return false; }
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    addon.dynamicCommentMenuItems = items;
    debug("menu.presented", { itemCount: items.length, hasWorkflowEntry: items.some((entry) => entry.selector === "openSingleWorkflows:") });
    return true;
  }

  function openSingleWorkflows(addon, sender) {
    const context = addon && addon.dynamicCommentContext;
    debug("workflow-submenu.open", { hasContext: !!context, noteId: context && context.noteId, token: context && context.token });
    if (!context || !context.note || !context.noteId) throw new Error("未读取到当前卡片，请重新打开菜单");
    const param = sender && typeof sender === "object" && sender.param !== undefined ? sender.param : (sender || {});
    if (param.noteId && String(param.noteId) !== String(context.noteId)) throw new Error("单卡已变化，请重新打开工作流菜单");
    if (param.token && context.token && String(param.token) !== String(context.token)) throw new Error("单卡已变化，请重新打开工作流菜单");
    addon.dynamicCommentMenuStack = addon.dynamicCommentMenuStack || [];
    addon.dynamicCommentMenuStack.push({ items: addon.dynamicCommentMenuItems || [], width: 280, position: 0 });
    addon.dynamicCommentMenuTransitioning = true;
    const items = __MN_COMMENT_WORKFLOW_MENU__.buildItems(addon, context, "single", param.section || "saved");
    const popover = presentSingleMenu(addon.dynamicCommentButton, items, 320, 0);
    if (!popover) return false;
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    addon.dynamicCommentMenuItems = items;
    debug("workflow-submenu.presented", { itemCount: items.length, stackDepth: addon.dynamicCommentMenuStack.length });
    return true;
  }

  function backSingleWorkflowMenu(addon) {
    const stack = addon && addon.dynamicCommentMenuStack;
    if (!Array.isArray(stack) || stack.length === 0) return false;
    const previous = stack.pop();
    addon.dynamicCommentMenuTransitioning = true;
    const popover = presentSingleMenu(addon.dynamicCommentButton, previous.items, previous.width || 280, previous.position || 0);
    if (!popover) return false;
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    addon.dynamicCommentMenuItems = previous.items;
    return true;
  }

  function showSingleWorkflowMissing(addon, sender) {
    const param = sender && typeof sender === "object" && sender.param !== undefined ? sender.param : (sender || {});
    const missing = Array.isArray(param.missingActions) ? param.missingActions : [];
    const invalid = Array.isArray(param.invalidSelectors) ? param.invalidSelectors : [];
    if (param.scopeMismatch) {
      if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") MNUtil.showHUD("该工作流仅支持多卡，请在工作流管理器中将支持范围改为单卡或单卡/多卡");
      return false;
    }
    const suffix = missing.length > 0 ? `：${missing.join("、")}` : (invalid.length > 0 ? `：${invalid.map((entry) => `第 ${(Number(entry.step) || 0) + 1} 个选择步骤${entry.message ? `（${entry.message}）` : ""}`).join("、")}` : "");
    if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") MNUtil.showHUD(missing.length > 0 ? `工作流依赖的扩展动作不可用${suffix}` : `工作流选择器不可用${suffix}`);
    return false;
  }

  async function runSingleWorkflow(addon, sender) {
    try {
      // MarginNote normally invokes a selector with the item's `param` value
      // directly. Some test/bridge paths pass the full menu item instead, so
      // accept both shapes without dropping the direct payload.
      const param = sender && typeof sender === "object" && sender.param !== undefined ? sender.param : (sender || {});
      const workflow = param && (param.workflow || param.workflowId);
      debug("workflow.run.request", { hasSender: !!sender, hasParam: !!param, workflowId: param && param.workflowId, mode: param && param.mode, noteId: param && param.noteId, token: param && param.token });
      if (!workflow) throw new Error("未读取到工作流");
      // Close before execution can refresh selection and clear the popover
      // reference. Keep the single-card context for the runner's validation.
      dismissMenu(addon, true);
      return await __MN_COMMENT_WORKFLOW_RUNNER__.run(addon, workflow, Object.assign({}, param, { mode: "single" }));
    } finally {
      debug("workflow.run.finally", { hasContext: !!(addon && addon.dynamicCommentContext), noteId: addon && addon.dynamicCommentContext && addon.dynamicCommentContext.noteId });
      dismissMenu(addon, true);
      hideButton(addon, "single-workflow.done");
    }
  }

  function openSingleInvalidLinkMenu(addon) {
    const context = addon && addon.dynamicCommentContext;
    if (!context || !context.note) throw new Error("未读取到当前卡片");
    addon.dynamicCommentMenuStack = addon.dynamicCommentMenuStack || [];
    addon.dynamicCommentMenuStack.push(addon.dynamicCommentMenuItems || []);
    addon.dynamicCommentMenuTransitioning = true;
    const item = (title, mode) => ({ title, object: addon, selector: "runSingleClearInvalidLinks:", param: { noteId: String(context.noteId || ""), mode }, checked: false });
    const items = [
      { title: "↩ 返回单选处理", object: addon, selector: "backSingleInvalidLinkMenu:", param: "", checked: false },
      item("  纯卡片链接", "card"),
      item("  Markdown 行内链接", "markdown"),
      item("  全部失效链接", "all"),
    ];
    const popover = presentSingleMenu(addon.dynamicCommentButton, items, 280, 0);
    if (!popover) return false;
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    addon.dynamicCommentMenuItems = items;
    return true;
  }

  function backSingleInvalidLinkMenu(addon) {
    const stack = addon && addon.dynamicCommentMenuStack;
    if (!Array.isArray(stack) || stack.length === 0) return false;
    const items = stack.pop();
    addon.dynamicCommentMenuTransitioning = true;
    const popover = presentSingleMenu(addon.dynamicCommentButton, items, 280, 0);
    if (!popover) return false;
    popover.delegate = addon;
    addon.dynamicCommentMenuPopoverController = popover;
    addon.dynamicCommentMenuItems = items;
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

  function handleMenuDismissed(addon, controller) {
    if (!addon || !addon.dynamicCommentMenuPopoverController) return false;
    if (controller && controller !== addon.dynamicCommentMenuPopoverController) return true;
    hideButton(addon, "menu.dismissed");
    return true;
  }

  function beginInteraction(addon) {
    try {
      if (!addon || !addon.dynamicCommentContext) return false;
      if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined") __MN_ADDON_FLOATING_LAYOUT__.freeze([addon.dynamicCommentButton, addon.dynamicAddCommentButton, addon.dynamicMoveCommentButton], TOUCH_INTERACTION_HOLD_MS);
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
    if (rawExpectedId && typeof rawExpectedId === "object") rawExpectedId = rawExpectedId.noteId || rawExpectedId.id || "";
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

  async function runInvalidLinkCleanup(addon, sender) {
    try {
      const param = sender && typeof sender === "object" && sender.param !== undefined ? sender.param : {};
      const note = noteFromSender(addon, param);
      const mode = String(param.mode || "card");
      const preview = __MN_COMMENT_MUTATIONS__.previewInvalidLinkCleanupForNotes([note], { allowSingle: true, mode });
      const removable = Number(preview.removableCardLinks || 0) + Number(preview.removableMarkdownLinks || 0);
      if (removable <= 0) {
        MNUtil.showHUD("当前卡片没有失效链接");
        return preview;
      }
      const confirmed = await MNUtil.confirm(
        "确认清除失效链接？",
        `将清理 ${preview.affectedCards} 张卡片：卡片链接 ${preview.removableCardLinks} 条，Markdown 行内链接 ${preview.removableMarkdownLinks} 条。\n\n操作可撤销。`,
        ["取消", "确认清除"],
      );
      if (!confirmed) {
        MNUtil.showHUD("已取消清除失效链接");
        return { cancelled: true };
      }
      return __MN_COMMENT_MUTATIONS__.clearInvalidLinksForNotes([note], {
        allowSingle: true,
        mode,
        expectedSignature: preview.signature,
      });
    } finally {
      dismissMenu(addon, true);
      hideButton(addon, "invalid-links.done");
    }
  }

  function dispatchAction(addon, adding, holding, sender) {
    if (!holding && consumeTapSuppression(addon)) return false;
    if (holding) suppressTapAfterLongPress(addon);
    if (typeof __MN_COMMENT_MOVE_MNCommentManagerAddon !== "undefined") __MN_COMMENT_MOVE_MNCommentManagerAddon.remove(addon);
    const settings = __MN_COMMENT_ACTION_SETTINGS__.getSettings();
    const key = `${adding ? "add" : "management"}${holding ? "Hold" : "Tap"}Action`;
    const action = settings[key] || (holding ? "menu" : adding ? "quickInput" : "manager");
    const context = addon.dynamicCommentContext;
    if (action === "none") return false;
    if (!context || !context.noteId) throw new Error("未读取到当前卡片");
    if (action === "menu") return openMenu(addon, sender || addon.dynamicCommentButton);
    if (action === "quickInput") {
      __MN_QUICK_COMMENT_MNCommentManagerAddon.open(addon, context);
      if (holding) suppressTapAfterLongPress(addon);
      return true;
    }
    MNUtil.focusNoteInMindMapById(context.noteId, 0);
    __MN_WEB_API_MNCommentManagerAddon.showPanel(addon.webController);
    addon.layoutViewController();
    __MN_WEB_API_MNCommentManagerAddon.syncCurrentNote(addon.webController, "dynamic-single-card");
    hideButton(addon, "tap.openPanel");
    if (holding) suppressTapAfterLongPress(addon);
    return true;
  }
  function refreshButtons(addon) {
    if (addon && addon.dynamicCommentContext && !addon.quickCommentController) showForContext(addon, addon.dynamicCommentContext);
  }
  return { dispatchAction, refreshButtons, handlePopupMenuOnNote, handlePopupMenuClosed, hideButton, disposeButton, openMenu, openSingleWorkflows, backSingleWorkflowMenu, showSingleWorkflowMissing, runSingleWorkflow, openSingleInvalidLinkMenu, backSingleInvalidLinkMenu, handleMenuDismissed, beginInteraction, suppressTapAfterLongPress, consumeTapSuppression,
    runKeepFirstContent: (addon, sender) => runAction(addon, sender, "keepFirstContentForNotes"),
    runConvertHtmlToMarkdown: (addon, sender) => runAction(addon, sender, "convertHtmlCommentsToMarkdownForNotes"),
    runConvertToNoExcerpt: (addon, sender) => runAction(addon, sender, "convertNotesToNoExcerptForNotes"),
    runRemoveAllLinks: (addon, sender) => runAction(addon, sender, "removeAllLinkCommentsForNotes"),
    runClearInvalidLinks: runInvalidLinkCleanup,
    runClearAllComments: (addon, sender) => runAction(addon, sender, "clearAllCommentsForNotes"),
    runClearAllTitles: (addon, sender) => runAction(addon, sender, "clearAllTitlesForNotes"),
  };
})();
