var __MN_BATCH_COMMENT_ACTIONS__ = (function () {
  const BUTTON_TAG = 9304101;
  const BUTTON_SIZE = 36;
  const BUTTON_GAP = 10;
  const INITIAL_SHOW_DELAY = 0.02;
  const STALE_HIDE_DELAY = 4.0;

  function nowToken() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function findSubviewByTag(parent, tag) {
    try {
      if (!parent || !Array.isArray(parent.subviews)) return null;
      for (let i = 0; i < parent.subviews.length; i += 1) {
        const child = parent.subviews[i];
        if (child && Number(child.tag) === Number(tag)) return child;
      }
    } catch (error) {
      return null;
    }
    return null;
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
        note = candidate && candidate.noteId ? candidate : MNNote.new(noteId, false);
      } catch (error) {
        note = null;
      }
      if (!note || !note.noteId) return;
      seen.add(String(note.noteId || noteId));
      notes.push(note);
    };

    try {
      const userInfo = sender && sender.userInfo ? sender.userInfo : {};
      const selViewLst = Array.isArray(userInfo.selViewLst)
        ? userInfo.selViewLst
        : (MNUtil && MNUtil.mindmapView && Array.isArray(MNUtil.mindmapView.selViewLst) ? MNUtil.mindmapView.selViewLst : []);
      selViewLst.forEach(pushNote);
    } catch (error) {
      // fall back below
    }

    if (notes.length <= 1) {
      try {
        const focusNotes = MNNote && typeof MNNote.getFocusNotes === "function" ? MNNote.getFocusNotes() : [];
        if (Array.isArray(focusNotes)) focusNotes.forEach(pushNote);
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

  function resolveButtonFrame(addon, context) {
    const hostView = getHostView(addon);
    const bounds = hostView && hostView.bounds ? hostView.bounds : null;
    if (!bounds || !context || !context.anchorRect) return null;
    const maxX = Math.max(0, Number(bounds.width || 0) - BUTTON_SIZE);
    const maxY = Math.max(0, Number(bounds.height || 0) - BUTTON_SIZE);
    const anchor = context.anchorRect;
    const rightX = Number(anchor.x || 0) + Number(anchor.width || 0) + BUTTON_GAP;
    const leftX = Number(anchor.x || 0) - BUTTON_SIZE - BUTTON_GAP;
    const centerY = Number(anchor.y || 0) + Number(anchor.height || 0) * 0.5 - BUTTON_SIZE * 0.5;
    const topY = Number(anchor.y || 0) - BUTTON_SIZE - BUTTON_GAP;
    const bottomY = Number(anchor.y || 0) + Number(anchor.height || 0) + BUTTON_GAP;
    const candidates = [
      { x: rightX, y: centerY, score: 0 },
      { x: leftX, y: centerY, score: 20 },
      { x: rightX, y: topY, score: 40 },
      { x: rightX, y: bottomY, score: 50 },
    ];
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate) => {
      const x = Math.max(0, Math.min(maxX, Number(candidate.x || 0)));
      const y = Math.max(0, Math.min(maxY, Number(candidate.y || 0)));
      const score = Number(candidate.score || 0) + Math.abs(x - Number(candidate.x || 0)) * 8 + Math.abs(y - Number(candidate.y || 0)) * 4;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y, width: BUTTON_SIZE, height: BUTTON_SIZE };
      }
    });
    return best;
  }

  function ensureButton(addon) {
    const hostView = getHostView(addon);
    if (!hostView) return null;
    let button = addon.batchCommentButton || findSubviewByTag(hostView, BUTTON_TAG);
    if (!button) {
      button = UIButton.buttonWithType(0);
      button.tag = BUTTON_TAG;
      button.frame = { x: 0, y: 0, width: BUTTON_SIZE, height: BUTTON_SIZE };
      button.layer.cornerRadius = BUTTON_SIZE * 0.5;
      button.layer.masksToBounds = false;
      button.layer.shadowOffset = { width: 0, height: 2 };
      button.layer.shadowRadius = 8;
      button.layer.shadowOpacity = 0.18;
      button.layer.shadowColor = MNUtil.hexColorAlpha("#1f2937", 1.0);
      button.backgroundColor = MNUtil.hexColorAlpha("#ffffff", 0.96);
      button.layer.borderWidth = 1;
      button.layer.borderColor = MNUtil.hexColorAlpha("#d1d5db", 0.95);
      try { button.setTitleForState("批", 0); } catch (error) {}
      try { button.setTitleColorForState(MNUtil.hexColorAlpha("#2563eb", 1.0), 0); } catch (error) {}
      try { button.titleLabel.font = UIFont.boldSystemFontOfSize(15); } catch (error) {}
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
    delay(STALE_HIDE_DELAY, function () {
      const latest = addon.batchCommentContext;
      if (latest && String(latest.token || "") === String(context.token || "")) hideButton(addon, "stale");
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
    const context = addon && addon.batchCommentContext ? addon.batchCommentContext : null;
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("请先多选至少 2 张卡片");
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

  async function runKeepFirstContent(addon) {
    const context = addon && addon.batchCommentContext ? addon.batchCommentContext : null;
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      MNUtil.showHUD("请先多选至少 2 张卡片");
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
    openMenu,
    runKeepFirstContent,
  };
})();
