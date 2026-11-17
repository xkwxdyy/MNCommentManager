var __MN_BATCH_COMMENT_ACTIONS__ = (function () {
  const BUTTON_TAG = 9304101;
  const MNPINNER_FOLLOW_BUTTON_TAG = 9205101;
  const MNPINNER_EXTRA_BUTTON_TAG = 9205103;
  const BUTTON_WIDTH = 124;
  const BUTTON_HEIGHT = 64;
  const BUTTON_GAP = 10;
  const INITIAL_SHOW_DELAY = 0.02;
  const SELECTION_CLOSE_HIDE_DELAY = 0.18;

  function nowToken() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function toArrayLike(raw) {
    const out = [];
    try {
      if (!raw) return out;
      if (Array.isArray(raw)) return raw.filter((item) => !!item);
      const length = Number(raw.length);
      if (Number.isFinite(length) && length >= 0) {
        for (let i = 0; i < length; i += 1) {
          const item = raw[i];
          if (item) out.push(item);
        }
        if (out.length > 0 || length === 0) return out;
      }
      const count = typeof raw.count === "function" ? Number(raw.count()) : Number(raw.count);
      if (Number.isFinite(count) && count >= 0 && typeof raw.objectAtIndex === "function") {
        for (let i = 0; i < count; i += 1) {
          const item = raw.objectAtIndex(i);
          if (item) out.push(item);
        }
      }
    } catch (error) {
      // Native NSArray-like objects can throw on unsupported accessors.
    }
    return out;
  }

  function findSubviewByTag(parent, tag) {
    try {
      if (!parent) return null;
      if (typeof parent.viewWithTag === "function") {
        const found = parent.viewWithTag(Number(tag));
        if (found) return found;
      }
      const subviews = toArrayLike(parent.subviews);
      for (let i = 0; i < subviews.length; i += 1) {
        const child = subviews[i];
        if (child && Number(child.tag) === Number(tag)) return child;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function forEachSubview(parent, visitor, depth) {
    try {
      if (!parent || depth > 8) return false;
      const subviews = toArrayLike(parent.subviews);
      if (subviews.length <= 0) return false;
      for (let i = 0; i < subviews.length; i += 1) {
        const child = subviews[i];
        if (!child) continue;
        if (visitor(child)) return true;
        if (forEachSubview(child, visitor, depth + 1)) return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  function getHostView(addon) {
    try {
      if (typeof MNUtil !== "undefined" && MNUtil && MNUtil.studyView) return MNUtil.studyView;
      if (addon && addon.webController && addon.webController.view) return addon.webController.view;
      if (typeof MNUtil !== "undefined" && MNUtil && MNUtil.currentWindow) return MNUtil.currentWindow;
    } catch (error) {
      return null;
    }
    return null;
  }

  function rectFromView(view, hostView) {
    try {
      if (!view || view.hidden === true) return null;
      if (hostView && typeof view.convertRectToView === "function") {
        const rect = view.convertRectToView(view.bounds, hostView);
        if (rect && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0) return rect;
      }
      const frame = view.frame || view.bounds || null;
      if (!frame) return null;
      return {
        x: Number(frame.x || 0),
        y: Number(frame.y || 0),
        width: Number(frame.width || 0),
        height: Number(frame.height || 0),
      };
    } catch (error) {
      return null;
    }
  }

  function extractNoteId(candidate) {
    try {
      if (!candidate) return "";
      if (typeof candidate === "string") return String(candidate || "").trim();
      const direct = String(candidate.noteId || candidate.id || "").trim();
      if (direct) return direct;
      const note = candidate.note || null;
      if (note) {
        const noteDirect = String(note.noteId || note.id || "").trim();
        if (noteDirect) return noteDirect;
        const nested = note.note || null;
        const nestedId = String(nested && (nested.noteId || nested.id) || "").trim();
        if (nestedId) return nestedId;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function selectionSource(sender) {
    try {
      const info = sender && sender.userInfo;
      if (info && info.selViewLst !== undefined) return { available: true, explicit: true, raw: info.selViewLst };
      const mindmap = typeof MNUtil !== 'undefined' && MNUtil && MNUtil.mindmapView;
      if (mindmap && mindmap.selViewLst !== undefined) return { available: true, explicit: false, raw: mindmap.selViewLst };
    } catch (_) {}
    return { available: false, explicit: false, raw: null };
  }

  function resolveSelectedNotes(sender, source) {
    const seen = new Set();
    const notes = [];
    const pushNote = (candidate) => {
      const noteId = extractNoteId(candidate);
      if (!noteId || seen.has(noteId)) return;
      let note = null;
      try {
        if (candidate && candidate.noteId && (Array.isArray(candidate.comments) || typeof candidate.removeCommentByIndex === "function")) {
          note = candidate;
        } else {
          note = __MN_NOTE_ACCESS_MNCommentManagerAddon.byId(noteId);
        }
      } catch (error) {
        note = null;
      }
      if (!note || !note.noteId) return;
      seen.add(String(note.noteId || noteId));
      notes.push(note);
    };

    const selected = source || selectionSource(sender);
    toArrayLike(selected.raw).forEach(pushNote);

    if (!selected.available) {
      try {
        const focusNotes = __MN_NOTE_ACCESS_MNCommentManagerAddon.selected() || [];
        toArrayLike(focusNotes).forEach(pushNote);
      } catch (error) {
        // no selection fallback
      }
    }

    return notes;
  }

  function sameSelection(existing, notes) {
    if (!existing || !Array.isArray(existing.notes) || existing.notes.length !== notes.length) return false;
    const ids = new Set(existing.notes.map(note => extractNoteId(note)));
    return notes.every(note => ids.has(String(note.noteId)));
  }

  function getAnchorRect(sender, hostView) {
    try {
      const userInfo = sender && sender.userInfo ? sender.userInfo : {};
      const bottomToolbar = userInfo.bottomToolbar || null;
      const toolbarRect = rectFromView(bottomToolbar, hostView);
      if (toolbarRect) return toolbarRect;
      if (userInfo.locationInStudyview) {
        const point = userInfo.locationInStudyview;
        return {
          x: Number(point.x || 0) - 20,
          y: Number(point.y || 0) - 20,
          width: 40,
          height: 40,
        };
      }
    } catch (error) {
      // use fallback
    }
    const bounds = hostView && hostView.bounds ? hostView.bounds : { width: 320, height: 240 };
    return {
      x: Math.max(8, Number(bounds.width || 0) * 0.5 - 80),
      y: Math.max(8, Number(bounds.height || 0) - 180),
      width: 160,
      height: 44,
    };
  }

  function rectOverlapArea(left, right) {
    try {
      if (!left || !right) return 0;
      const x1 = Math.max(Number(left.x || 0), Number(right.x || 0));
      const y1 = Math.max(Number(left.y || 0), Number(right.y || 0));
      const x2 = Math.min(Number(left.x || 0) + Number(left.width || 0), Number(right.x || 0) + Number(right.width || 0));
      const y2 = Math.min(Number(left.y || 0) + Number(left.height || 0), Number(right.y || 0) + Number(right.height || 0));
      return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    } catch (error) {
      return 0;
    }
  }

  function collectMNPinnerFollowButtonRects(hostView) {
    const rects = [];
    const seen = [];
    const pushButton = (button) => {
      try {
        if (!button || button.hidden === true) return;
        if (seen.indexOf(button) >= 0) return;
        seen.push(button);
        const rect = rectFromView(button, hostView);
        if (rect && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0) rects.push(rect);
      } catch (error) {
        // ignore sibling inspection failures
      }
    };

    try {
      if (typeof pinnerUtils !== "undefined" && pinnerUtils && pinnerUtils.pinnerController) {
        pushButton(pinnerUtils.pinnerController.followModeButton);
        pushButton(pinnerUtils.pinnerController.followModeExtraButton);
      }
    } catch (error) {
      // pinnerUtils may not exist
    }

    try {
      pushButton(findSubviewByTag(hostView, MNPINNER_FOLLOW_BUTTON_TAG));
      pushButton(findSubviewByTag(hostView, MNPINNER_EXTRA_BUTTON_TAG));
      forEachSubview(hostView, (child) => {
        try {
          if (Number(child.tag) === MNPINNER_FOLLOW_BUTTON_TAG || Number(child.tag) === MNPINNER_EXTRA_BUTTON_TAG) pushButton(child);
        } catch (error) {
          // keep scanning
        }
        return false;
      }, 0);
    } catch (error) {
      // ignore sibling inspection failures
    }

    return rects;
  }

  function resolveButtonFrame(addon, context) {
    const preferred = resolvePreferredButtonFrame(addon, context);
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ === "undefined") return preferred;
    if (!context || !context.anchorRect) return null;
    const host = getHostView(addon);
    const frame = __MN_ADDON_FLOATING_LAYOUT__.place(host, {
      priority: 40,
      preferred: preferred || { x: context.anchorRect.x, y: context.anchorRect.y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
      width: BUTTON_WIDTH, height: BUTTON_HEIGHT, ownViews: batchViews(addon),
      anchor: context.anchorRect, avoid: [context.anchorRect], previous: context._floatingGroupFrame
    });
    context._floatingGroupFrame = frame;
    return frame;
  }

  function resolvePreferredButtonFrame(addon, context) {
    const hostView = getHostView(addon);
    const bounds = hostView && hostView.bounds ? hostView.bounds : null;
    if (!bounds || !context || !context.anchorRect) return null;
    const maxX = Math.max(0, Number(bounds.width || 0) - BUTTON_WIDTH);
    const maxY = Math.max(0, Number(bounds.height || 0) - BUTTON_HEIGHT);
    const anchor = context.anchorRect;
    const occupiedRects = collectMNPinnerFollowButtonRects(hostView);
    // Treat Pinner's visible buttons as a group so the preferred right slot
    // starts after its optional extra action, regardless of discovery order.
    const sibling = occupiedRects.reduce((group, rect) => {
      if (!group) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const x = Math.min(group.x, rect.x);
      const y = Math.min(group.y, rect.y);
      return {
        x, y,
        width: Math.max(group.x + group.width, rect.x + rect.width) - x,
        height: Math.max(group.y + group.height, rect.y + rect.height) - y,
      };
    }, null);
    const rightX = Number(anchor.x || 0) + Number(anchor.width || 0) + BUTTON_GAP;
    const leftX = Number(anchor.x || 0) - BUTTON_WIDTH - BUTTON_GAP;
    const centerY = Number(anchor.y || 0) + Number(anchor.height || 0) * 0.5 - BUTTON_HEIGHT * 0.5;
    const topY = Number(anchor.y || 0) - BUTTON_HEIGHT - BUTTON_GAP;
    const bottomY = Number(anchor.y || 0) + Number(anchor.height || 0) + BUTTON_GAP;
    const centerX = Number(anchor.x || 0) + Number(anchor.width || 0) * 0.5 - BUTTON_WIDTH * 0.5;
    const candidates = [
      // Reserve a separate row above the toolbar for the comments action.
      // Pinner can appear or move after this layout, including into the row just above it.
      { x: centerX, y: topY - BUTTON_HEIGHT - BUTTON_GAP, score: -80 },
      { x: rightX, y: centerY, score: 0 },
      { x: leftX, y: centerY, score: 20 },
      { x: rightX, y: topY, score: 40 },
      { x: rightX, y: bottomY, score: 50 },
      { x: centerX, y: topY, score: 65 },
      { x: centerX, y: bottomY, score: 75 },
    ];
    if (sibling) {
      candidates.unshift(
        { x: Number(sibling.x || 0) + Number(sibling.width || 0) + BUTTON_GAP, y: Number(sibling.y || 0), score: -40 },
        { x: Number(sibling.x || 0) - BUTTON_WIDTH - BUTTON_GAP, y: Number(sibling.y || 0), score: -20 },
        { x: Number(sibling.x || 0), y: Number(sibling.y || 0) + Number(sibling.height || 0) + BUTTON_GAP, score: 10 },
        { x: Number(sibling.x || 0), y: Number(sibling.y || 0) - BUTTON_HEIGHT - BUTTON_GAP, score: 30 },
      );
    }
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const x = Math.max(0, Math.min(maxX, Number(candidate.x || 0)));
      const y = Math.max(0, Math.min(maxY, Number(candidate.y || 0)));
      const frame = { x, y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT };
      let score = Number(candidate.score || 0) + Math.abs(x - Number(candidate.x || 0)) * 8 + Math.abs(y - Number(candidate.y || 0)) * 4;
      occupiedRects.forEach((rect) => {
        score += rectOverlapArea(frame, rect) * 12;
      });
      score += rectOverlapArea(frame, anchor) * 4;
      if (score < bestScore) {
        bestScore = score;
        best = frame;
      }
    });
    return best;
  }

  function refreshContextFromSelection(addon, sender, options) {
    const opts = options && typeof options === "object" ? options : {};
    const existing = addon && addon.batchCommentContext ? addon.batchCommentContext : null;
    const source = selectionSource(sender);
    const notes = resolveSelectedNotes(sender, source);
    if (notes.length <= 1 && opts.allowExisting !== false && existing && Array.isArray(existing.notes) && existing.notes.length > 1 &&
      !source.explicit && (!source.available || notes.length === 0 && ownsSelection(addon, sender, existing))) {
      return existing;
    }
    if (notes.length <= 1) { invalidateSelection(addon, 'selection.invalid'); return null; }
    // A cached sender supplies geometry only; it never supplies the selected cards.
    const sourceSender = source.explicit ? sender : existing && existing.sender || sender || null;
    const hostView = getHostView(addon);
    const context = {
      token: sameSelection(existing, notes) && existing.token ? existing.token : nowToken(),
      notes,
      anchorRect: getAnchorRect(sourceSender, hostView),
      sender: sourceSender,
      nativeToolbarClosed: sameSelection(existing, notes) && existing.nativeToolbarClosed === true,
    };
    if (addon) addon.batchCommentContext = context;
    return context;
  }

  function handleMultipleSelectionClosed(addon) {
    if (addon && addon.mncmWorkflowPanelOwnsEntries === true) return true;
    const context = addon && addon.batchCommentContext ? addon.batchCommentContext : null;
    const token = String(context && context.token || "");
    if (!token) {
      hideButton(addon, "selection.closed.noContext");
      return false;
    }
    context.nativeToolbarClosed = true;
    delay(SELECTION_CLOSE_HIDE_DELAY, () => checkClosedSelection(addon, context));
    return true;
  }
  function checkClosedSelection(addon, context) {
    if (addon && addon.mncmWorkflowPanelOwnsEntries === true) return;
    if (!context || addon.batchCommentContext !== context || !context.nativeToolbarClosed || isTouchHeld(addon)) return;
    const editor = addon.webController;
    if (addon.batchCommentMenuPopoverController || editor && editor.panelMode === 'batch' && editor.view && editor.view.hidden === false) return;
    hideButton(addon, 'selection.closed');
  }

  function batchViews(addon) { return [addon.batchCommentButton, addon.batchCommentMenuButton, addon.batchCommentScopeLabel].filter(Boolean); }
  function ensureButton(addon) {
    const hostView = getHostView(addon);
    if (!hostView) return null;
    let button = addon.batchCommentButton || findSubviewByTag(hostView, BUTTON_TAG);
    if (!button) {
      button = UIButton.buttonWithType(0);
      button.tag = BUTTON_TAG;
      button.frame = { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT };
      button.layer.cornerRadius = BUTTON_HEIGHT * 0.5;
      button.layer.masksToBounds = false;
      button.layer.shadowOffset = { width: 0, height: 2 };
      button.layer.shadowRadius = 8;
      button.layer.shadowOpacity = 0.18;
      button.layer.shadowColor = MNUtil.hexColorAlpha("#1f2937", 1.0);
      button.backgroundColor = MNUtil.hexColorAlpha("#ffffff", 0.96);
      button.layer.borderWidth = 1;
      button.layer.borderColor = MNUtil.hexColorAlpha("#d1d5db", 0.95);
      try { button.setTitleForState("评论", 0); } catch (error) {}
      try { button.setTitleColorForState(MNUtil.hexColorAlpha("#2563eb", 1.0), 0); } catch (error) {}
      try { button.titleLabel.font = UIFont.boldSystemFontOfSize(14); } catch (error) {}
      try { button.accessibilityLabel = "MN Comment Manager 批量处理"; } catch (error) {}
      try { button.addTargetActionForControlEvents(addon, "batchCommentButtonTouchDown:", 1 << 0); } catch (error) {}
      try { button.addTargetActionForControlEvents(addon, "openBatchCommentEditor:", 1 << 6); } catch (error) {}
      try { button.addTargetActionForControlEvents(addon, 'batchCommentButtonTouchEnded:', (1 << 7) | (1 << 8)); } catch (error) {}
      try {
        MNButton.addLongPressGesture(button, addon, "batchCommentButtonLongPressed:", 0.45);
      } catch (error) {
        console.log(`[MN Comment Manager] batch long-press binding failed: ${error && error.message ? error.message : error}`);
      }
      hostView.addSubview(button);
    } else if (button.superview !== hostView && hostView.addSubview) {
      hostView.addSubview(button);
    }
    button.hidden = true;
    addon.batchCommentButton = button;
    if (typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== "undefined") __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.icon(addon, button, 'batch', '多卡评论编辑器');
    [['batchCommentMenuButton', 'down', '所选卡片操作菜单', 'batchCommentButtonTapped:']].forEach(([key, name, title, selector]) => {
      if (!addon[key]) {
        const extra = UIButton.buttonWithType(0); extra.layer.cornerRadius = 9; extra.backgroundColor = MNUtil.hexColorAlpha('#ffffff', 0.96);
        extra.setTitleForState(name === 'down' ? '⌄' : '✎', 0); extra.setTitleColorForState(MNUtil.hexColorAlpha('#2563eb', 1), 0);
        extra.accessibilityLabel = title;
        extra.addTargetActionForControlEvents(addon, 'batchCommentButtonTouchDown:', 1 << 0);
        extra.addTargetActionForControlEvents(addon, 'batchCommentButtonTouchEnded:', (1 << 7) | (1 << 8));
        extra.addTargetActionForControlEvents(addon, selector, 1 << 6); hostView.addSubview(extra); addon[key] = extra;
      }
      if (typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== "undefined") __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.icon(addon, addon[key], name, title);
      if (addon[key].superview !== hostView) hostView.addSubview(addon[key]);
      addon[key].hidden = true;
    });
    if (!addon.batchCommentScopeLabel && typeof UILabel !== 'undefined') {
      const label = new UILabel({ x: 0, y: 0, width: BUTTON_WIDTH, height: 20 }); label.font = UIFont.systemFontOfSize(12); label.textColor = MNUtil.hexColorAlpha('#687180', 1); label.userInteractionEnabled = false; label.hidden = true;
      hostView.addSubview(label); addon.batchCommentScopeLabel = label;
    }
    if (addon.batchCommentScopeLabel && addon.batchCommentScopeLabel.superview !== hostView) hostView.addSubview(addon.batchCommentScopeLabel);
    if (addon.batchCommentScopeLabel && typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== 'undefined') {
      const p = __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.palette();
      addon.batchCommentScopeLabel.textColor = MNUtil.hexColorAlpha(p.muted, 1);
      addon.batchCommentScopeLabel.backgroundColor = MNUtil.hexColorAlpha(p.surface, 1);
      addon.batchCommentScopeLabel.layer.cornerRadius = 4;
      addon.batchCommentScopeLabel.layer.masksToBounds = true;
    }
    return button;
  }

  function delay(seconds, callback) {
    NSTimer.scheduledTimerWithTimeInterval(Math.max(0, Number(seconds || 0)), false, function () {
      try { callback && callback(); } catch (error) {}
    });
  }

  function hideButton(addon, reason, options) {
    try {
      clearHeldInteraction(addon);
      if (addon && !(options && options.preserveTouch === true)) addon.batchCommentTouchRevision = Number(addon.batchCommentTouchRevision || 0) + 1;
      if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined") __MN_ADDON_FLOATING_LAYOUT__.release(batchViews(addon));
      const popover = addon && addon.batchCommentMenuPopoverController;
      addon.batchCommentMenuPopoverController = null;
      if (popover && typeof popover.dismissPopoverAnimated === "function") {
        try { popover.dismissPopoverAnimated(true); } catch (error) {
          console.log(`[MN Comment Manager] dismiss batch menu failed: ${error && error.message ? error.message : error}`);
        }
      }
      const button = addon.batchCommentButton || findSubviewByTag(getHostView(addon), BUTTON_TAG);
      if (button) {
        button.hidden = true;
        try { button.enabled = false; } catch (error) {}
        try { button.userInteractionEnabled = false; } catch (error) {}
      }
      batchViews(addon).forEach(view => { view.hidden = true; view.userInteractionEnabled = false; });
      if (!(options && options.preserveContext === true)) addon.batchCommentContext = null;
      addon.batchCommentInteractionUntil = 0;
      console.log(`[MN Comment Manager] batch button hidden: ${reason || ""}`);
    } catch (error) {
      console.log(`[MN Comment Manager] hide batch button failed: ${error && error.message ? error.message : error}`);
    }
  }

  function disposeButton(addon, reason) {
    if (!addon) return false;
    const button = addon.batchCommentButton;
    hideButton(addon, reason || "dispose");
    try { if (button && button.removeFromSuperview) button.removeFromSuperview(); } catch (_) {}
    batchViews(addon).forEach(view => { if (view !== button && view.removeFromSuperview) view.removeFromSuperview(); });
    addon.batchCommentMenuButton = addon.batchCommentScopeLabel = null;
    addon.batchCommentButton = null;
    return !!button;
  }

  function showForContext(addon, context) {
    if (!addon || addon.mnCommentManagerSceneActive === false || addon.window !== MNUtil.currentWindow || !__MN_COMMENT_ACTION_SETTINGS__.getSettings().showBatchButton) return false;
    if (addon.mncmWorkflowPanelOwnsEntries === true) return false;
    if (isTouchHeld(addon) || Number(addon && addon.batchCommentInteractionUntil || 0) > Date.now() || addon && addon.batchCommentMenuPopoverController) return false;
    if (addon.webController && addon.webController.panelMode === 'batch' && addon.webController.view && addon.webController.view.hidden === false) return false;
    const latest = addon.batchCommentContext;
    if (!context || latest !== context || String(latest.token || "") !== String(context.token || "")) return false;
    const button = ensureButton(addon);
    if (!button) return false;
    const frame = resolveButtonFrame(addon, context);
    if (!frame) { batchViews(addon).forEach(view => { view.hidden = true; view.enabled = false; view.userInteractionEnabled = false; }); return false; }
    button.frame = { x: frame.x, y: frame.y + 20, width: 44, height: 44 };
    if (addon.batchCommentMenuButton) addon.batchCommentMenuButton.frame = { x: frame.x + 44, y: frame.y + 20, width: 44, height: 44 };
    if (addon.batchCommentScopeLabel) { addon.batchCommentScopeLabel.frame = { x: frame.x, y: frame.y, width: BUTTON_WIDTH, height: 20 }; addon.batchCommentScopeLabel.text = '已选择 ' + context.notes.length + ' 张卡片'; }
    batchViews(addon).forEach(view => { view.hidden = false; view.enabled = true; view.userInteractionEnabled = view !== addon.batchCommentScopeLabel; if (view.superview.bringSubviewToFront) view.superview.bringSubviewToFront(view); });
    button.hidden = false;
    try { button.enabled = true; } catch (error) {}
    try { button.userInteractionEnabled = true; } catch (error) {}
    try { if (button.superview && button.superview.bringSubviewToFront) button.superview.bringSubviewToFront(button); } catch (error) {}
    return true;
  }

  function handleMultipleSelection(addon, sender) {
    if (!addon || addon.mnCommentManagerSceneActive === false || addon.window !== MNUtil.currentWindow) return false;
    if (addon.mncmWorkflowPanelOwnsEntries === true) return true;
    if (!__MN_COMMENT_ACTION_SETTINGS__.getSettings().showBatchButton) {
      hideButton(addon, "disabled");
      return false;
    }
    const notes = resolveSelectedNotes(sender);
    if (notes.length <= 1) {
      hideButton(addon, "selection.tooSmall");
      return false;
    }

    const hostView = getHostView(addon);
    const existing = addon.batchCommentContext;
    const holding = sameSelection(existing, notes) && isTouchHeld(addon);
    const context = {
      token: sameSelection(existing, notes) && existing.token ? existing.token : nowToken(),
      notes,
      anchorRect: getAnchorRect(sender, hostView),
      sender,
    };
    addon.batchCommentContext = context;

    if (!holding) {
      clearHeldInteraction(addon);
      const button = ensureButton(addon);
      if (button) {
        try { button.hidden = true; } catch (error) {}
        try { button.enabled = false; } catch (error) {}
        try { button.userInteractionEnabled = false; } catch (error) {}
      }
    }

    delay(INITIAL_SHOW_DELAY, function () {
      showForContext(addon, context);
    });
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined") {
      __MN_ADDON_FLOATING_LAYOUT__.settle(delay,
        () => addon.batchCommentContext === context && addon.window === MNUtil.currentWindow && __MN_COMMENT_ACTION_SETTINGS__.getSettings().showBatchButton,
        () => showForContext(addon, context));
    }
    return true;
  }

  function tableItem(addon, title, selector, param, checked) {
    return {
      title,
      object: addon,
      selector,
      param: param || "",
      checked: checked === true,
    };
  }

  function openMenu(addon, button) {
    if (!entryAvailable(addon)) return false;
    validateEntryToken(addon, button);
    const context = refreshContextFromSelection(addon, button && button.sender ? button.sender : button);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      hideButton(addon, "menu.noSelection");
      return false;
    }
    validateEntryToken(addon, button);
    if (typeof __MN_COMMENT_WORKFLOW_MENU__ !== "undefined" &&
      __MN_COMMENT_WORKFLOW_MENU__ &&
      typeof __MN_COMMENT_WORKFLOW_MENU__.openBatchMenu === "function") {
      return __MN_COMMENT_WORKFLOW_MENU__.openBatchMenu(addon, button, context);
    }
    const commandTable = [
      tableItem(addon, "── 评论批处理 ──", "noopBatchCommentAction:"),
      tableItem(addon, `  只保留第一条内容（${context.notes.length} 张）`, "runBatchKeepFirstContent:"),
      tableItem(addon, `  转换 HTML 为 Markdown（${context.notes.length} 张）`, "runBatchConvertHtmlToMarkdown:"),
      tableItem(addon, `  转为非摘录版（${context.notes.length} 张）`, "runBatchConvertToNoExcerpt:"),
      tableItem(addon, `  去掉所有链接（${context.notes.length} 张）`, "runBatchRemoveAllLinks:"),
      tableItem(addon, "  清除失效链接 ➡️", "openBatchInvalidLinkMenu:"),
      tableItem(addon, `  清空所有评论（${context.notes.length} 张）`, "runBatchClearAllComments:"),
      tableItem(addon, `  清空所有标题（${context.notes.length} 张）`, "runBatchClearAllTitles:"),
    ];
    addon.batchCommentMenuPopoverController = MNUtil.getPopoverAndPresent(
      button || addon.batchCommentButton,
      commandTable,
      280,
      0,
    );
    return true;
  }

  function countActionImpact(notes) {
    const stats = {
      total: 0,
      excerptCards: 0,
      noExcerptCards: 0,
      noCommentCards: 0,
      removableComments: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      const comments = Array.isArray(note.comments) ? note.comments : [];
      const count = comments.length;
      if (count <= 0) {
        stats.noCommentCards += 1;
        return;
      }
      const hasExcerpt = !!(
        String(note.excerptText || "").trim() ||
        note.excerptPic ||
        (note.note && String(note.note.excerptText || "").trim()) ||
        (note.note && note.note.excerptPic)
      );
      if (hasExcerpt) {
        stats.excerptCards += 1;
        stats.removableComments += count;
      } else {
        stats.noExcerptCards += 1;
        stats.removableComments += Math.max(0, count - 1);
      }
    });
    return stats;
  }

  function countClearAllCommentsImpact(notes) {
    const stats = {
      total: 0,
      noCommentCards: 0,
      removableComments: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      const count = Array.isArray(note.comments) ? note.comments.length : 0;
      if (count <= 0) {
        stats.noCommentCards += 1;
        return;
      }
      stats.removableComments += count;
    });
    return stats;
  }

  function countClearAllTitlesImpact(notes) {
    const stats = {
      total: 0,
      titledCards: 0,
      blankTitleCards: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      if (String(note.noteTitle || "").trim()) stats.titledCards += 1;
      else stats.blankTitleCards += 1;
    });
    return stats;
  }

  function countHtmlToMarkdownImpact(notes) {
    const stats = {
      total: 0,
      htmlCards: 0,
      noHtmlCards: 0,
      convertibleComments: 0,
      unsupportedHtmlComments: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      let htmlCount = 0;
      let nonEmptyHtmlCount = 0;
      const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
      const comments = snapshot && Array.isArray(snapshot.comments) ? snapshot.comments : [];
      comments.forEach((comment) => {
        if (!comment || !comment.capabilities || !comment.capabilities.isHtml) return;
        htmlCount += 1;
        const raw = Array.isArray(note.comments) ? note.comments[comment.index] : null;
        if (__MN_COMMENT_HTML__.convert(raw && raw.html).ok) nonEmptyHtmlCount += 1;
        else stats.unsupportedHtmlComments += 1;
      });
      if (htmlCount > 0) stats.htmlCards += 1;
      else stats.noHtmlCards += 1;
      stats.convertibleComments += nonEmptyHtmlCount;
    });
    return stats;
  }

  function countConvertToNoExcerptImpact(notes) {
    const stats = {
      total: 0,
      convertible: 0,
      imageExcerpt: 0,
      textExcerpt: 0,
      noExcerpt: 0,
      noParent: 0,
      unsupportedMedia: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      const state = __MN_COMMENT_MUTATIONS__.getNoExcerptConversionState(note, true);
      if (state.eligible) {
        stats.convertible += 1;
        if (state.excerptType === "image") stats.imageExcerpt += 1;
        else if (state.excerptType === "text") stats.textExcerpt += 1;
        return;
      }
      if (state.reason === "noParent") stats.noParent += 1;
      else if (state.reason === "unsupportedMedia") stats.unsupportedMedia += 1;
      else stats.noExcerpt += 1;
    });
    return stats;
  }

  function countRemoveAllLinksImpact(notes) {
    const stats = {
      total: 0,
      linkCards: 0,
      noLinkCards: 0,
      removableLinks: 0,
    };
    const sourceNotes = Array.isArray(notes) ? notes : [];
    sourceNotes.forEach((note) => {
      if (!note || !note.noteId) return;
      stats.total += 1;
      const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
      const comments = snapshot && Array.isArray(snapshot.comments) ? snapshot.comments : [];
      const linkCount = comments.filter((comment) => (
        comment && (comment.type === "linkComment" || comment.type === "summaryComment")
      )).length;
      if (linkCount > 0) stats.linkCards += 1;
      else stats.noLinkCards += 1;
      stats.removableLinks += linkCount;
    });
    return stats;
  }

  async function confirmKeepFirstContent(context) {
    const stats = countActionImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `有摘录：${stats.excerptCards} 张，清空所有评论。`,
      `无摘录：${stats.noExcerptCards} 张，只保留第一条评论。`,
      `无评论：${stats.noCommentCards} 张，不变。`,
      "",
      `预计删除 ${stats.removableComments} 条评论。`,
    ].join("\n");
    return MNUtil.confirm("确认批量处理评论？", message, ["取消", "确认处理"]);
  }

  async function confirmClearAllComments(context) {
    const stats = countClearAllCommentsImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `无评论：${stats.noCommentCards} 张，不变。`,
      `预计删除 ${stats.removableComments} 条评论。`,
      "",
      "这个操作不会清理目标卡片中的反向链接。",
    ].join("\n");
    return MNUtil.confirm("确认清空所有评论？", message, ["取消", "确认清空"]);
  }

  async function confirmHtmlToMarkdown(context) {
    const stats = countHtmlToMarkdownImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `包含 HTML 评论：${stats.htmlCards} 张。`,
      `无 HTML 评论：${stats.noHtmlCards} 张，不变。`,
      `预计转换 ${stats.convertibleComments} 条 HTML 评论。`,
      stats.unsupportedHtmlComments > 0 ? `无法保真转换：${stats.unsupportedHtmlComments} 条，保留原 HTML。` : "",
      "",
      "可保留的标题、强调、链接、图片、列表和代码会转为 Markdown；含不支持的样式或结构时保留原 HTML。",
    ].filter((line) => line !== "").join("\n");
    return MNUtil.confirm("确认转换 HTML 评论？", message, ["取消", "确认转换"]);
  }

  async function confirmRemoveAllLinks(context) {
    const stats = countRemoveAllLinksImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `包含链接评论：${stats.linkCards} 张。`,
      `无链接评论：${stats.noLinkCards} 张，不变。`,
      `预计去掉 ${stats.removableLinks} 条链接。`,
      "",
      "只删除纯卡片链接评论，不处理 Markdown 行内链接，也不清理目标卡片中的反向链接。",
    ].join("\n");
    return MNUtil.confirm("确认去掉所有链接？", message, ["取消", "确认去掉"]);
  }

  async function runClearInvalidLinks(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const param = sender && typeof sender === "object" && sender.param && typeof sender.param === "object" ? sender.param : {};
    const mode = String(param.mode || "card");
    const preview = __MN_COMMENT_MUTATIONS__.previewInvalidLinkCleanupForNotes(context.notes, { mode });
    const removable = Number(preview.removableCardLinks || 0) + Number(preview.removableMarkdownLinks || 0);
    if (removable <= 0) {
      MNUtil.showHUD("所选卡片没有失效链接");
      hideButton(addon, "invalid-links.empty");
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
    const result = __MN_COMMENT_MUTATIONS__.clearInvalidLinksForNotes(context.notes, { mode, expectedSignature: preview.signature });
    hideButton(addon, "invalid-links.done");
    return result;
  }

  async function confirmConvertToNoExcerpt(context) {
    const stats = countConvertToNoExcerptImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `可转换：${stats.convertible} 张（图片摘录 ${stats.imageExcerpt} 张，文本摘录 ${stats.textExcerpt} 张）。`,
      `已是非摘录或没有有效摘录：${stats.noExcerpt} 张，不变。`,
      stats.noParent > 0 ? `没有父卡片：${stats.noParent} 张，跳过。` : "",
      stats.unsupportedMedia > 0 ? `音频/视频摘录：${stats.unsupportedMedia} 张，跳过。` : "",
      "",
      "转换会新建同级卡片并合并原摘录，卡片 ID 会变化；卡片链接、反向链接和 Markdown 行内链接会迁移到新卡片。",
    ].filter((line) => line !== "").join("\n");
    return {
      confirmed: stats.convertible > 0 && await MNUtil.confirm("确认转为非摘录版？", message, ["取消", "确认转换"]),
      stats,
    };
  }

  async function confirmClearAllTitles(context) {
    const stats = countClearAllTitlesImpact(context && context.notes);
    const message = [
      `将处理 ${stats.total} 张卡片。`,
      "",
      `有标题：${stats.titledCards} 张，将清空标题。`,
      `无标题：${stats.blankTitleCards} 张，不变。`,
    ].join("\n");
    return MNUtil.confirm("确认清空所有标题？", message, ["取消", "确认清空"]);
  }

  async function runKeepFirstContent(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmed = await confirmKeepFirstContent(context);
    if (!confirmed) {
      MNUtil.showHUD("已取消批处理");
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.keepFirstContentForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  async function runClearAllComments(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmed = await confirmClearAllComments(context);
    if (!confirmed) {
      MNUtil.showHUD("已取消清空评论");
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.clearAllCommentsForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  async function runConvertHtmlToMarkdown(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmed = await confirmHtmlToMarkdown(context);
    if (!confirmed) {
      MNUtil.showHUD("已取消转换 HTML 评论");
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.convertHtmlCommentsToMarkdownForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  async function runRemoveAllLinks(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmed = await confirmRemoveAllLinks(context);
    if (!confirmed) {
      MNUtil.showHUD("已取消去掉链接");
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.removeAllLinkCommentsForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  async function runConvertToNoExcerpt(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmation = await confirmConvertToNoExcerpt(context);
    if (confirmation.stats.convertible <= 0) {
      MNUtil.showHUD("所选卡片中没有可转换的图片或文本摘录");
      return false;
    }
    if (!confirmation.confirmed) {
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  async function runClearAllTitles(addon, sender) {
    const context = refreshContextFromSelection(addon, sender);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      return false;
    }
    const confirmed = await confirmClearAllTitles(context);
    if (!confirmed) {
      MNUtil.showHUD("已取消清空标题");
      return false;
    }
    const result = __MN_COMMENT_MUTATIONS__.clearAllTitlesForNotes(context.notes);
    hideButton(addon, "action.done");
    return result;
  }

  function openEditor(addon, sender) {
    if (!addon || addon.window !== MNUtil.currentWindow) throw new Error('当前窗口已变化，请重新选择卡片');
    if (addon.mnCommentManagerSceneActive === false) throw new Error('当前窗口未激活，请返回后重新选择卡片');
    if (!__MN_COMMENT_ACTION_SETTINGS__.getSettings().showBatchButton) throw new Error('多卡跟随按钮已关闭');
    if (!entryAvailable(addon)) throw new Error('未读取到多选卡片，请重新多选后再试');
    validateEntryToken(addon, sender);
    const context = refreshContextFromSelection(addon, sender);
    if (!context || context.notes.length <= 1) throw new Error('未读取到多选卡片');
    validateEntryToken(addon, sender);
    if (!addon.webController) throw new Error('评论管理器尚未初始化');
    if (addon.webController.panelMode === 'batch' && addon.webController.view.hidden === false) {
      __MN_WEB_API_MNCommentManagerAddon.syncBatch(addon.webController, 'batch-editor-refresh');
      hideButton(addon, 'batch-editor-open', { preserveContext: true, preserveTouch: true });
      return true;
    }
    __MN_WEB_API_MNCommentManagerAddon.showPanel(addon.webController, { mode: 'batch' });
    addon.layoutViewController();
    __MN_WEB_API_MNCommentManagerAddon.syncBatch(addon.webController, 'batch-editor-open');
    hideButton(addon, 'batch-editor-open', { preserveContext: true, preserveTouch: true });
    return true;
  }
  function menuDismissed(addon, controller) {
    if (!controller || addon.batchCommentMenuPopoverController !== controller) return false;
    addon.batchCommentMenuPopoverController = null; addon.batchCommentInteractionUntil = 0;
    if (addon.batchCommentContext) showForContext(addon, addon.batchCommentContext);
    return true;
  }
  function editorClosed(addon) {
    addon.batchCommentContext = null;
    return handleMultipleSelection(addon, null);
  }
  function relayout(addon) {
    if (!entryAvailable(addon)) return false;
    if (!validateLiveSelection(addon, true)) return false;
    const context = addon.batchCommentContext;
    context.anchorRect = getAnchorRect(context.sender, getHostView(addon));
    return showForContext(addon, context);
  }
  function refreshForActivation(addon) {
    if (!addon || addon.mnCommentManagerSceneActive === false || addon.window !== MNUtil.currentWindow) return false;
    if (addon.mncmWorkflowPanelOwnsEntries === true) return true;
    if (!selectionSource(null).available) { invalidateSelection(addon, 'activation.selectionUnavailable'); return false; }
    return handleMultipleSelection(addon, null);
  }
  function ownsSelection(addon, sender, context) {
    const editor = addon && addon.webController;
    const touching = isTouchHeld(addon) || Number(addon && addon.batchCommentInteractionUntil || 0) > Date.now();
    const verifiedTouch = [sender, addon && addon.batchCommentButton, addon && addon.batchCommentMenuButton]
      .some(view => view && view.mncmBatchTouchToken && String(view.mncmBatchTouchToken) === String(context.token));
    return !!(addon && addon.batchCommentMenuPopoverController || editor && editor.panelMode === 'batch' && editor.view && editor.view.hidden === false ||
      touching && (context.nativeToolbarClosed || verifiedTouch));
  }
  function invalidateSelection(addon, reason) {
    hideButton(addon, reason);
    const editor = addon && addon.webController;
    if (editor && editor.panelMode === 'batch' && editor.view && editor.view.hidden === false && typeof __MN_WEB_API_MNCommentManagerAddon !== 'undefined') {
      __MN_WEB_API_MNCommentManagerAddon.syncBatch(editor, reason);
    }
  }
  function validateLiveSelection(addon, allowOwnedEmpty) {
    const source = selectionSource(null);
    if (!source.available) return true;
    const notes = resolveSelectedNotes(null, source);
    const context = addon.batchCommentContext;
    if (sameSelection(context, notes) || allowOwnedEmpty && notes.length === 0 && ownsSelection(addon, null, context)) return true;
    invalidateSelection(addon, 'selection.changedWithoutNotification');
    return false;
  }
  function entryAvailable(addon) {
    const context = addon && addon.batchCommentContext;
    return !!(addon && addon.mncmWorkflowPanelOwnsEntries !== true && addon.mnCommentManagerSceneActive !== false && addon.window === MNUtil.currentWindow && __MN_COMMENT_ACTION_SETTINGS__.getSettings().showBatchButton &&
      context && Array.isArray(context.notes) && context.notes.length > 1 && context.notes.every(note => extractNoteId(note)));
  }
  function validateEntryToken(addon, sender) {
    if (sender && sender.mncmBatchTouchRevision !== undefined && sender.mncmBatchTouchRevision !== Number(addon.batchCommentTouchRevision || 0)) {
      throw new Error('跟随按钮交互已结束，请重新选择卡片');
    }
    const token = sender && (sender.mncmBatchTouchToken || sender.param && sender.param.token);
    if (token && String(token) !== String(addon.batchCommentContext.token)) throw new Error('多选卡片已变化，请重新操作跟随按钮');
  }
  function beginInteraction(addon, sender) {
    if (!entryAvailable(addon)) return false;
    if (!validateLiveSelection(addon, false)) return false;
    clearHeldInteraction(addon);
    const id = buttonIdForSender(addon, sender);
    if (sender) {
      sender.mncmBatchTouchToken = addon.batchCommentContext.token;
      sender.mncmBatchTouchRevision = Number(addon.batchCommentTouchRevision || 0);
    }
    if (id) {
      addon.batchCommentHeldControl = id;
      addon.batchCommentHeldToken = addon.batchCommentContext.token;
    }
    addon.batchCommentInteractionUntil = Date.now() + 900;
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== "undefined") __MN_ADDON_FLOATING_LAYOUT__.freeze(batchViews(addon), id ? Infinity : 900);
    return true;
  }
  function buttonIdForSender(addon, sender) {
    if (!addon || !sender) return '';
    return ['batchCommentButton', 'batchCommentMenuButton'].find(key => {
      const button = addon[key];
      try { return button === sender || !!(button && typeof button.isEqual === 'function' && button.isEqual(sender)); } catch (_) { return false; }
    }) || '';
  }
  function isTouchHeld(addon) {
    return !!(entryAvailable(addon) && addon.batchCommentHeldToken === addon.batchCommentContext.token &&
      (addon.batchCommentHeldControl || addon.batchCommentHeldGesture));
  }
  function clearHeldInteraction(addon) {
    if (!addon) return;
    addon.batchCommentHeldControl = addon.batchCommentHeldGesture = addon.batchCommentHeldToken = '';
    addon.batchCommentInteractionUntil = 0;
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== 'undefined') __MN_ADDON_FLOATING_LAYOUT__.release(batchViews(addon));
  }
  function beginLongPress(addon, sender) {
    const id = buttonIdForSender(addon, sender);
    if (!id || !entryAvailable(addon)) return false;
    try { validateEntryToken(addon, sender); } catch (_) { return false; }
    addon.batchCommentHeldGesture = id;
    addon.batchCommentHeldToken = addon.batchCommentContext.token;
    if (!validateLiveSelection(addon, true)) return false;
    if (typeof __MN_ADDON_FLOATING_LAYOUT__ !== 'undefined') __MN_ADDON_FLOATING_LAYOUT__.freeze(batchViews(addon), Infinity);
    return true;
  }
  function finishHeldInteraction(addon) {
    if (addon.batchCommentHeldControl || addon.batchCommentHeldGesture) return;
    const context = addon.batchCommentContext;
    clearHeldInteraction(addon);
    // Native gesture Began can arrive after UIControl Cancel in the same run loop.
    if (context && context.nativeToolbarClosed) delay(0, () => checkClosedSelection(addon, context));
  }
  function endInteraction(addon, sender) {
    const id = buttonIdForSender(addon, sender);
    if (!id || addon.batchCommentHeldControl !== id || sender.mncmBatchTouchToken !== addon.batchCommentHeldToken) return false;
    addon.batchCommentHeldControl = '';
    finishHeldInteraction(addon);
    return true;
  }
  function endLongPress(addon, sender, state) {
    const id = buttonIdForSender(addon, sender);
    if (!id || addon.batchCommentHeldGesture !== id || sender.mncmBatchTouchToken !== addon.batchCommentHeldToken) return false;
    addon.batchCommentHeldGesture = '';
    if ([3, 4, 5].includes(Number(state))) addon.batchCommentHeldControl = '';
    finishHeldInteraction(addon);
    return true;
  }

  return {
    openEditor, editorClosed, menuDismissed, disposeButton, relayout, refreshForActivation,
    beginInteraction, beginLongPress, endInteraction, endLongPress,
    handleMultipleSelection,
    hideButton,
    handleMultipleSelectionClosed,
    openMenu,
    runKeepFirstContent,
    runConvertHtmlToMarkdown,
    runConvertToNoExcerpt,
    runRemoveAllLinks,
    runClearInvalidLinks,
    runClearAllComments,
    runClearAllTitles,
  };
})();
