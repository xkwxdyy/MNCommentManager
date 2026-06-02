var __MN_BATCH_COMMENT_ACTIONS__ = (function () {
  const BUTTON_TAG = 9304101;
  const MNPINNER_FOLLOW_BUTTON_TAG = 9205101;
  const BUTTON_WIDTH = 54;
  const BUTTON_HEIGHT = 36;
  const BUTTON_GAP = 10;
  const INITIAL_SHOW_DELAY = 0.02;

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

  function resolveSelectedNotes(sender) {
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
          note = MNNote.new(noteId, false);
        }
      } catch (error) {
        note = null;
      }
      if (!note || !note.noteId) return;
      seen.add(String(note.noteId || noteId));
      notes.push(note);
    };

    try {
      const userInfo = sender && sender.userInfo ? sender.userInfo : {};
      let selViewLst = toArrayLike(userInfo.selViewLst);
      if (selViewLst.length <= 0 && typeof MNUtil !== "undefined" && MNUtil && MNUtil.mindmapView) {
        selViewLst = toArrayLike(MNUtil.mindmapView.selViewLst);
      }
      selViewLst.forEach(pushNote);
    } catch (error) {
      // fall back below
    }

    if (notes.length <= 1) {
      try {
        const focusNotes = MNNote && typeof MNNote.getFocusNotes === "function" ? MNNote.getFocusNotes() : [];
        toArrayLike(focusNotes).forEach(pushNote);
      } catch (error) {
        // no selection fallback
      }
    }

    return notes;
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
      }
    } catch (error) {
      // pinnerUtils may not exist
    }

    try {
      pushButton(findSubviewByTag(hostView, MNPINNER_FOLLOW_BUTTON_TAG));
      forEachSubview(hostView, (child) => {
        try {
          if (Number(child.tag) === MNPINNER_FOLLOW_BUTTON_TAG) pushButton(child);
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
    const hostView = getHostView(addon);
    const bounds = hostView && hostView.bounds ? hostView.bounds : null;
    if (!bounds || !context || !context.anchorRect) return null;
    const maxX = Math.max(0, Number(bounds.width || 0) - BUTTON_WIDTH);
    const maxY = Math.max(0, Number(bounds.height || 0) - BUTTON_HEIGHT);
    const anchor = context.anchorRect;
    const occupiedRects = collectMNPinnerFollowButtonRects(hostView);
    const sibling = occupiedRects[0] || null;
    const rightX = Number(anchor.x || 0) + Number(anchor.width || 0) + BUTTON_GAP;
    const leftX = Number(anchor.x || 0) - BUTTON_WIDTH - BUTTON_GAP;
    const centerY = Number(anchor.y || 0) + Number(anchor.height || 0) * 0.5 - BUTTON_HEIGHT * 0.5;
    const topY = Number(anchor.y || 0) - BUTTON_HEIGHT - BUTTON_GAP;
    const bottomY = Number(anchor.y || 0) + Number(anchor.height || 0) + BUTTON_GAP;
    const centerX = Number(anchor.x || 0) + Number(anchor.width || 0) * 0.5 - BUTTON_WIDTH * 0.5;
    const candidates = [
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
    const sourceSender = sender || (existing && existing.sender) || null;
    const notes = resolveSelectedNotes(sourceSender);
    if (notes.length <= 1 && opts.allowExisting !== false && existing && Array.isArray(existing.notes) && existing.notes.length > 1) {
      return existing;
    }
    if (notes.length <= 1) return null;
    const hostView = getHostView(addon);
    const context = {
      token: existing && existing.token ? existing.token : nowToken(),
      notes,
      anchorRect: getAnchorRect(sourceSender, hostView),
      sender: sourceSender,
    };
    if (addon) addon.batchCommentContext = context;
    return context;
  }

  function keepVisibleIfStillMultipleSelection(addon, sender) {
    const context = refreshContextFromSelection(addon, sender, { allowExisting: false });
    if (!context) {
      hideButton(addon, "selection.closed");
      return false;
    }
    return showForContext(addon, context);
  }

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
      try { button.addTargetActionForControlEvents(addon, "batchCommentButtonTapped:", 1 << 6); } catch (error) {}
      hostView.addSubview(button);
    } else if (button.superview !== hostView && hostView.addSubview) {
      hostView.addSubview(button);
    }
    button.hidden = true;
    addon.batchCommentButton = button;
    return button;
  }

  function delay(seconds, callback) {
    NSTimer.scheduledTimerWithTimeInterval(Math.max(0, Number(seconds || 0)), false, function () {
      try { callback && callback(); } catch (error) {}
    });
  }

  function hideButton(addon, reason) {
    try {
      const button = addon.batchCommentButton || findSubviewByTag(getHostView(addon), BUTTON_TAG);
      if (button) {
        button.hidden = true;
        try { button.enabled = false; } catch (error) {}
        try { button.userInteractionEnabled = false; } catch (error) {}
      }
      addon.batchCommentContext = null;
      addon.batchCommentMenuPopoverController = null;
      console.log(`[MN Comment Manager] batch button hidden: ${reason || ""}`);
    } catch (error) {
      console.log(`[MN Comment Manager] hide batch button failed: ${error && error.message ? error.message : error}`);
    }
  }

  function showForContext(addon, context) {
    const latest = addon.batchCommentContext;
    if (!latest || !context || String(latest.token || "") !== String(context.token || "")) return false;
    const button = ensureButton(addon);
    if (!button) return false;
    const frame = resolveButtonFrame(addon, context);
    if (!frame) return false;
    button.frame = frame;
    button.hidden = false;
    try { button.enabled = true; } catch (error) {}
    try { button.userInteractionEnabled = true; } catch (error) {}
    try { if (button.superview && button.superview.bringSubviewToFront) button.superview.bringSubviewToFront(button); } catch (error) {}
    return true;
  }

  function handleMultipleSelection(addon, sender) {
    if (!addon || addon.window !== MNUtil.currentWindow) return false;
    const notes = resolveSelectedNotes(sender);
    if (notes.length <= 1) {
      hideButton(addon, "selection.tooSmall");
      return false;
    }

    const hostView = getHostView(addon);
    const context = {
      token: nowToken(),
      notes,
      anchorRect: getAnchorRect(sender, hostView),
      sender,
    };
    addon.batchCommentContext = context;

    const button = ensureButton(addon);
    if (button) {
      try { button.hidden = true; } catch (error) {}
      try { button.enabled = false; } catch (error) {}
      try { button.userInteractionEnabled = false; } catch (error) {}
    }

    delay(INITIAL_SHOW_DELAY, function () {
      showForContext(addon, context);
    });
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
    const context = refreshContextFromSelection(addon, button && button.sender ? button.sender : null);
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("未读取到多选卡片，请重新多选后再试");
      hideButton(addon, "menu.noSelection");
      return false;
    }
    const commandTable = [
      tableItem(addon, "── 评论批处理 ──", "noopBatchCommentAction:"),
      tableItem(addon, `  只保留第一条内容（${context.notes.length} 张）`, "runBatchKeepFirstContent:"),
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

  return {
    handleMultipleSelection,
    hideButton,
    keepVisibleIfStillMultipleSelection,
    openMenu,
    runKeepFirstContent,
  };
})();
