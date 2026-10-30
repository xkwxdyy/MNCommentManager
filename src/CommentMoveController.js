var __MN_COMMENT_MOVE_MNCommentManagerAddon = (function () {
  const sessions = Object.create(null);
  const views = __MN_COMMENT_MOVE_VIEWS_MNCommentManagerAddon;
  function param(sender) { return sender && sender.param !== undefined ? sender.param : sender || {}; }
  function same(left, right) { return left === right || !!(left && right && typeof left.isEqual === "function" && left.isEqual(right)); }
  function stateFor(addon) { return addon && sessions[addon.dynamicMoveRailSessionId] || null; }
  function active(addon, state) { return stateFor(addon) === state && !state.closed && same(addon.window, MNUtil.currentWindow) && addon.dynamicCommentContext && addon.dynamicCommentContext.token === state.token; }
  function timer(callback, ms) {
    const value = NSTimer.scheduledTimerWithTimeInterval(ms / 1000, false, callback);
    // Some hosts expose common modes for continuous touch tracking.
    if (typeof NSRunLoop !== "undefined") NSRunLoop.mainRunLoop().addTimerForMode(value, "kCFRunLoopCommonModes");
    return value;
  }
  function clearTimer(value) { if (value && typeof value.invalidate === "function") value.invalidate(); }
  function read(addon, input) {
    const context = addon && addon.dynamicCommentContext;
    if (!context || !context.noteId || !same(addon.window, MNUtil.currentWindow)) throw new Error("当前卡片已变化，请重新打开移动菜单");
    if (input && (input.token !== context.token || input.noteId !== context.noteId)) throw new Error("当前卡片已变化，请重新打开移动菜单");
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(context.noteId);
    if (!note || !note.noteId) throw new Error("卡片不存在，请重新选择");
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    if (!snapshot || snapshot.error) throw new Error(snapshot && snapshot.error || "读取评论失败");
    const raw = note.comments || [];
    const order = snapshot.comments.map((comment, index) => [
      comment.originalType, comment.type, comment.text, comment.htmlText,
      comment.imageHash || comment.imageBase64, comment.drawingHash || comment.drawingPreviewDataURI,
      comment.audioHash, comment.linkedNoteId, String(raw[index] && (raw[index].noteid || raw[index].noteId) || ""),
    ]);
    return { context, note, snapshot, order, signature: JSON.stringify([snapshot.commentFold && snapshot.commentFold.revision || "", order]) };
  }
  function rect(value) {
    if (!value) return null;
    const result = { x: Number(value.x || 0), y: Number(value.y || 0), width: Number(value.width), height: Number(value.height) };
    return Object.keys(result).every(key => Number.isFinite(result[key])) && result.width > 0 && result.height > 0 ? result : null;
  }
  function cardRect(addon, state) {
    const study = Application.sharedInstance().studyController(addon.window);
    const notebook = study && study.notebookController;
    const mindmap = notebook && notebook.mindmapView;
    if (mindmap && !mindmap.hidden && !(notebook.view && notebook.view.hidden)) {
      // mindmapNodes may contain only root nodes; selected cards expose their actual view.
      const selected = mindmap.selViewLst || [];
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index], note = item && item.note;
        if (String(note && (note.noteId || note.note && note.note.noteId) || "") !== state.noteId) continue;
        const view = item.view;
        if (view && !view.hidden && view.superview && typeof view.convertRectToView === "function") return rect(view.convertRectToView(view.bounds, state.host));
      }
      const nodes = mindmap.mindmapNodes || [];
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index], note = node && node.note;
        if (String(note && (note.noteId || note.note && note.note.noteId) || "") === state.noteId) return rect(mindmap.convertRectToView(node.frame, state.host));
      }
    }
    return null;
  }
  function geometry(addon, state) {
    const bounds = rect(state.host && state.host.bounds), card = cardRect(addon, state);
    state.layoutIssue = "";
    if (!bounds || bounds.width < 160 || bounds.height < 220) { state.layoutIssue = "当前窗口尚未提供可用的操作区域"; return null; }
    if (!card) { state.layoutIssue = "未能定位所选卡片，请重新选择卡片"; return null; }
    if (card.x >= bounds.x + bounds.width || card.y >= bounds.y + bounds.height || card.x + card.width <= bounds.x || card.y + card.height <= bounds.y) { state.layoutIssue = "所选卡片已离开当前可见区域"; return null; }
    const clampX = (x, width) => Math.max(bounds.x + 4, Math.min(bounds.x + bounds.width - width - 4, x));
    const clampY = (y, height) => Math.max(bounds.y + 4, Math.min(bounds.y + bounds.height - height - 4, y));
    const own = (state.views ? [state.views.rail, state.views.preview, state.views.picker] : [])
      .concat([addon.dynamicCommentButton, addon.dynamicCommentMenuButton, addon.dynamicAddCommentButton, addon.dynamicMoveCommentButton]).filter(Boolean);
    let right;
    if (state.comments.length <= 6) {
      const width = state.comments.length ? state.comments.length * 32 + (state.showAdd === false ? 132 : 176) : state.showAdd === false ? 88 : 132;
      const area = __MN_ADDON_FLOATING_LAYOUT__.place(state.host, {
        priority: 30, width, height: 140, anchor: card, avoid: [card], ownViews: own,
        preferred: { x: clampX(card.x + card.width / 2 - width / 2, width), y: card.y + card.height + 8, width, height: 140 },
      });
      if (area) return { inline: true, rail: { x: area.x, y: area.y, width, height: 44 }, expanded: area,
        picker: { x: clampX(area.x, Math.min(320, bounds.width - 8)), y: clampY(area.y + 48, Math.min(430, bounds.height - 8)), width: Math.min(320, bounds.width - 8), height: Math.min(430, bounds.height - 8) },
        card, bounds, trackTop: area.x + 16, trackBottom: area.x + 16 + (state.comments.length - 1) * 32, cancelHint: "上下移开可取消" };
    }
    function placeRail(height, width) {
      const area = __MN_ADDON_FLOATING_LAYOUT__.place(state.host, {
        priority: 30, width, height, anchor: card, avoid: [card], ownViews: own,
        preferred: { x: card.x + card.width + 8, y: clampY(card.y + card.height / 2 - height / 2, height), width, height },
      });
      if (!area) return null;
      right = width === 44 ? area.x + 22 >= card.x + card.width / 2
        : area.x + width <= card.x ? false : true;
      return { x: right ? area.x : area.x + width - 44, y: area.y, width: 44, height };
    }
    let rail = placeRail(220, 244) || placeRail(176, 244) || placeRail(220, 44) || placeRail(176, 44);
    const compactControls = !!rail && rail.height === 176;
    if (!rail) { state.layoutIssue = "当前窗口没有可容纳移动控件的空白区域"; return null; }
    let top = Math.min(rail.y, Math.max(bounds.y + 4, card.y));
    let bottom = Math.max(rail.y + rail.height, Math.min(bounds.y + bounds.height - 4, card.y + card.height));
    const obstacles = __MN_ADDON_FLOATING_LAYOUT__.collect(state.host, { priority: 30, ownViews: own }).concat([card]);
    obstacles.forEach(obstacle => {
      if (rail.x >= obstacle.x + obstacle.width + 7 || rail.x + 44 + 7 <= obstacle.x) return;
      if (obstacle.y + obstacle.height + 7 <= rail.y) top = Math.max(top, obstacle.y + obstacle.height + 7);
      else if (obstacle.y - 7 >= rail.y + rail.height) bottom = Math.min(bottom, obstacle.y - 7);
    });
    // Align the selected comment with the grip while keeping one scale for the full list.
    const originY = rail.y + 66;
    let availableTop = bounds.y + 4, availableBottom = bounds.y + bounds.height - 4;
    obstacles.forEach(obstacle => {
      if (rail.x >= obstacle.x + obstacle.width + 7 || rail.x + 44 + 7 <= obstacle.x) return;
      if (obstacle.y + obstacle.height + 7 <= originY) availableTop = Math.max(availableTop, obstacle.y + obstacle.height + 7);
      else if (obstacle.y - 7 >= originY) availableBottom = Math.min(availableBottom, obstacle.y - 7);
    });
    const ratio = state.sourceIndex >= 0 && state.comments.length > 1 ? state.sourceIndex / (state.comments.length - 1) : 0;
    const span = Math.min(bottom - top - 44,
      ratio > 0 ? (originY - 22 - availableTop) / ratio : Infinity,
      ratio < 1 ? (availableBottom - originY - 22) / (1 - ratio) : Infinity);
    const expanded = { x: rail.x, y: originY - 22 - ratio * span, width: 44, height: span + 44 };
    // Widen only into verified blank space on the outside of the control column.
    function widen(column) {
      const preferredHeight = Math.max(column.height, Math.min(432, 144 + state.comments.length * 24, bounds.height - 8));
      const heights = [preferredHeight, Math.max(column.height, 280), Math.max(column.height, 220), Math.max(column.height, 176)];
      for (const height of heights) {
        if (height > bounds.height - 8) continue;
        for (const width of [284, 264, 244, 224]) {
          const candidate = { x: right ? column.x : column.x + 44 - width, y: clampY(column.y, height), width, height };
          if (candidate.x < bounds.x || candidate.x + width > bounds.x + bounds.width) continue;
          if (obstacles.some(obstacle => candidate.x < obstacle.x + obstacle.width + 7 && candidate.x + width + 7 > obstacle.x && candidate.y < obstacle.y + obstacle.height + 7 && candidate.y + candidate.height + 7 > obstacle.y)) continue;
          return candidate;
        }
      }
      return column;
    }
    const sidebar = widen(expanded), holdSidebar = widen(rail);
    const pickerWidth = Math.min(320, bounds.width - 8), pickerHeight = Math.min(430, bounds.height - 8, 102 + state.comments.length * 62);
    const picker = { x: clampX(right ? rail.x - pickerWidth - 8 : rail.x + 52, pickerWidth), y: clampY(card.y, pickerHeight), width: pickerWidth, height: pickerHeight };
    return { rail, expanded, sidebar, holdSidebar, compactControls, preview: sidebar, picker, card, bounds, trackTop: expanded.y + 22, trackBottom: expanded.y + expanded.height - 22, cancelHint: right ? "向左移开可取消" : "向右移开可取消" };
  }
  function remove(addon) {
    const state = stateFor(addon), oldView = addon && addon.dynamicMoveRailView;
    if (!addon) return false;
    if (state) {
      state.closed = true;
      dismissActions(state);
      delete sessions[addon.dynamicMoveRailSessionId];
      clearTimer(state.pollTimer);
      state.controller.dispose();
      views.dispose(state);
    } else if (oldView) oldView.removeFromSuperview();
    addon.dynamicMoveRailSessionId = null;
    addon.dynamicMoveRailView = null;
    addon.dynamicMoveRailState = null;
    return !!(state || oldView);
  }
  function close(addon, sender) {
    const state = stateFor(addon), input = param(sender);
    if (input.panelToken && (!state || input.panelToken !== state.panelToken)) return false;
    const removed = remove(addon);
    __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(addon, "move.closed");
    return removed;
  }
  function checked(addon, sender, fresh, allowPending) {
    const state = stateFor(addon), input = param(sender);
    if (!state || input.panelToken !== state.panelToken) {
      const error = new Error("评论控件已变化，请重新选择"); error.code = "MOVE_PANEL_STALE"; throw error;
    }
    if (!active(addon, state)) { remove(addon); throw new Error("当前卡片已变化，请重新打开移动菜单"); }
    if (state.mutationPending && !allowPending) {
      const error = new Error("评论操作正在等待确认或执行"); error.code = "MOVE_PANEL_BUSY"; throw error;
    }
    if (!fresh) return { state, input };
    const current = read(addon, state);
    if (current.signature !== state.signature) {
      state.controller.cancel();
      adopt(state, current, -1);
      state.history = [];
      views.hidePicker(state);
      layout(addon);
      if (!active(addon, state)) throw new Error("评论列表已变化，请重新打开移动菜单");
      views.render(state);
      views.showPicker(addon, state);
      const error = new Error("评论列表已变化，已刷新列表，请重新选择"); error.code = "COMMENT_CHANGED"; throw error;
    }
    return { state, input, current };
  }
  function adopt(state, current, source) {
    state.signature = current.signature;
    state.order = current.order;
    state.comments = current.snapshot.comments;
    state.commentFold = current.snapshot.commentFold;
    state.excerpt = current.snapshot.excerpt;
    state.selectedIndices = [];
    state.selecting = false;
    state.notice = "";
    state.sourceIndex = state.targetIndex = source;
    state.panelToken = Date.now() + "_" + Math.random().toString(36).slice(2);
  }
  function performMove(addon, state, target, undoing) {
    const current = checked(addon, { panelToken: state.panelToken }, true).current;
    const source = state.sourceIndex;
    if (!Number.isInteger(target) || source < 0 || target < 0 || target >= state.comments.length || target === source) return false;
    if (state.comments[source].capabilities && state.comments[source].capabilities.canMove === false) throw new Error("当前评论不能移动");
    const expected = current.order.slice();
    expected.splice(target, 0, expected.splice(source, 1)[0]);
    const result = __MN_COMMENT_MUTATIONS__.moveComments(state.noteId, [source], target < source ? target : target + 1);
    const after = read(addon, state);
    if (JSON.stringify(after.order) !== JSON.stringify(expected)) { remove(addon); throw new Error("未能确认评论移动结果，请刷新后检查"); }
    if (undoing) {
      const reversed = state.history.pop(), previous = state.history[state.history.length - 1];
      // Host revisions advance during inverse moves, even when the order is restored.
      if (previous && previous.after === reversed.before) previous.after = after.signature;
      else if (previous) state.history = [];
    } else state.history.push({ from: source, to: target, before: current.signature, after: after.signature });
    adopt(state, after, target);
    views.render(state);
    views.result(addon, state, undoing ? "已撤回评论移动" : "已移到第 " + (target + 1) + " 条");
    layout(addon);
    return result;
  }
  function guarded(addon, state, action) {
    if (!active(addon, state)) { if (stateFor(addon) === state) remove(addon); return; }
    try { return action(); }
    catch (error) {
      if (error.code !== "COMMENT_CHANGED" && error.code !== "MOVE_PANEL_STALE") remove(addon);
      MNUtil.showHUD(error.message || "评论移动失败");
      console.log("[MN Comment Manager] quick move failed: " + (error.message || error));
    }
  }
  function poll(addon, state) {
    state.pollTimer = timer(function () {
      if (!active(addon, state)) { if (stateFor(addon) === state) remove(addon); return; }
      guarded(addon, state, function () { layout(addon); if (active(addon, state)) poll(addon, state); });
    }, 250);
  }
  function open(addon, sender) {
    const input = param(sender);
    const current = read(addon, input.token ? input : null);
    if (!current.snapshot.comments.length && !(current.snapshot.excerpt && current.snapshot.excerpt.present)) { MNUtil.showHUD("当前卡片尚无可处理的内容，请使用新增评论入口"); return false; }
    remove(addon);
    const state = { host: MNUtil.studyView, noteId: current.context.noteId, token: current.context.token, sourceTapAllowed: false, history: [], closed: false,
      showAdd: typeof __MN_COMMENT_ACTION_SETTINGS__ === "undefined" || __MN_COMMENT_ACTION_SETTINGS__.getSettings().showQuickCommentButton !== false };
    adopt(state, current, -1);
    state.geometry = geometry(addon, state);
    if (!state.geometry) throw new Error(state.layoutIssue);
    state.controller = __MN_COMMENT_MOVE_GESTURE_MNCommentManagerAddon.createMoveGesture({
      setTimer: timer, clearTimer, now: () => Date.now(),
      onPreview: frame => guarded(addon, state, function () {
        if (!frame) { state.targetIndex = state.sourceIndex; views.clearPreview(state); return; }
        state.targetIndex = frame.targetIndex;
        views.preview(state, Object.assign({}, frame, { cancelHint: state.geometry.cancelHint }));
      }),
      onCommit: frame => guarded(addon, state, () => performMove(addon, state, frame.targetIndex, false)),
      onTap: frame => { if (frame.kind === "hold") guarded(addon, state, () => performMove(addon, state, state.sourceIndex + frame.direction, false)); },
    });
    const id = "move_" + state.panelToken;
    sessions[id] = state;
    addon.dynamicMoveRailSessionId = id;
    try {
      views.create(addon, state);
      state.views.rail.tag = 9304105;
      addon.dynamicMoveRailView = state.views.rail;
      const popover = addon.dynamicCommentMenuPopoverController;
      addon.dynamicCommentMenuPopoverController = null;
      if (popover && typeof popover.dismissPopoverAnimated === "function") popover.dismissPopoverAnimated(false);
      [addon.dynamicCommentButton, addon.dynamicCommentMenuButton, addon.dynamicAddCommentButton, addon.dynamicMoveCommentButton].filter(Boolean).forEach(view => { view.hidden = true; });
      addon.dynamicCommentInteractionUntil = 0;
      if (!state.geometry.inline) views.showPicker(addon, state);
      poll(addon, state);
    } catch (error) { remove(addon); throw error; }
    return true;
  }
  function select(addon, sender) {
    const { state, input, current } = checked(addon, sender, true), comment = state.comments[input.index];
    if (state.selecting) {
      if (!Number.isInteger(input.index) || !comment) throw new Error("评论已变化，请重新选择");
      const at = state.selectedIndices.indexOf(input.index);
      if (at < 0) state.selectedIndices.push(input.index); else state.selectedIndices.splice(at, 1);
      dismissActions(state);
      views.render(state);
      if (state.views.picker) views.filterPicker(state, state.views.search.text || "", true);
      return true;
    }
    if (!Number.isInteger(input.index) || !comment || comment.capabilities && comment.capabilities.canMove === false) throw new Error("评论已变化或不能移动");
    state.controller.cancel();
    adopt(state, current, input.index);
    views.hidePicker(state);
    layout(addon);
    views.render(state);
    return true;
  }
  function begin(addon, sender, kind, point, direction) {
    if (kind === "drag") layout(addon);
    const { state } = checked(addon, sender, true);
    if (state.selecting || state.sourceIndex < 0 || state.views.picker) return false;
    state.controller.begin({ kind, direction, pointerId: kind, sourceId: String(state.sourceIndex), comments: state.comments,
      startIndex: state.sourceIndex, x: state.geometry.inline ? point.y : point.x, y: state.geometry.inline ? point.x : point.y,
      top: state.geometry.trackTop, bottom: state.geometry.trackBottom });
    state.gestureKind = kind;
    return true;
  }
  function stepBegan(addon, sender) {
    const state = stateFor(addon);
    if (!state || ![state.views.up, state.views.down].some(view => same(view, sender)) || sender.enabled === false) return false;
    const frame = state.geometry.rail;
    return begin(addon, sender, "hold", { x: frame.x + 22, y: frame.y + sender.frame.y + 22 }, param(sender).direction);
  }
  function stepEnded(addon, sender) {
    const { state } = checked(addon, sender, false);
    if (![state.views.up, state.views.down].some(view => same(view, sender))) return false;
    state.controller.end({ pointerId: "hold" });
    state.gestureKind = null;
    return true;
  }
  function stepCancelled(addon, sender) {
    const { state } = checked(addon, sender, false);
    state.controller.cancel(); state.gestureKind = null;
    return true;
  }
  function gesture(addon, sender) {
    const state = stateFor(addon);
    if (!state || !sender || !same(sender.view, state.views.knob)) return false;
    if (sender.state === 4 || sender.state === 5) { state.controller.cancel(); state.gestureKind = null; return false; }
    if (![1, 2, 3].includes(sender.state)) return false;
    const point = sender.locationInView(state.host);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (sender.state === 1) {
      state.sourceTapAllowed = false;
      const delta = sender.translationInView(state.host);
      if (!begin(addon, state.views.knob, "drag", { x: point.x - delta.x, y: point.y - delta.y })) return false;
    }
    state.controller.update({ pointerId: "drag", x: state.geometry.inline ? point.y : point.x, y: state.geometry.inline ? point.x : point.y });
    if (sender.state === 3) { state.controller.end({ pointerId: "drag" }); state.gestureKind = null; }
    return true;
  }
  function sourceTouchDown(addon, sender) {
    const { state } = checked(addon, sender, false);
    if (!same(sender, state.views.knob)) return false;
    state.sourceTapAllowed = true;
    return true;
  }
  function back(addon, sender) {
    const { state } = checked(addon, sender, true);
    if (!state.geometry.inline && same(sender, state.views.knob) && !state.sourceTapAllowed) return false;
    state.sourceTapAllowed = false;
    state.controller.cancel();
    if (state.views.picker) views.hidePicker(state); else views.showPicker(addon, state);
    return true;
  }
  function filter(addon, sender) {
    const { state } = checked(addon, sender, false);
    if (same(sender, state.views.search)) views.filterPicker(state, sender.text);
  }
  function undo(addon, sender) {
    const { state } = checked(addon, sender, true), last = state.history[state.history.length - 1];
    if (!last || last.after !== state.signature) return false;
    state.controller.cancel();
    state.sourceIndex = last.to;
    return performMove(addon, state, last.from, true);
  }
  function dismissActions(state) {
    const popover = state && state.quickPopover;
    if (state) { state.quickPopover = null; state.quickMenuItems = null; }
    if (popover && typeof popover.dismissPopoverAnimated === "function") popover.dismissPopoverAnimated(false);
  }
  function menuDismissed(addon, controller) {
    const state = stateFor(addon);
    if (!state || !same(state.quickPopover, controller)) return false;
    state.quickPopover = null; state.quickMenuItems = null;
    return true;
  }
  function toggleSelection(addon, sender) {
    const { state } = checked(addon, sender, true);
    state.controller.cancel(); dismissActions(state);
    state.selecting = !state.selecting; state.selectedIndices = [];
    views.render(state);
    if (state.views.picker) views.filterPicker(state, state.views.search.text || "", true);
    return true;
  }
  function setSelection(addon, sender, all) {
    const { state } = checked(addon, sender, true);
    if (!state.selecting) return false;
    if (all && state.comments.length > 200) throw new Error('每次最多选择 200 条评论');
    state.controller.cancel(); dismissActions(state);
    state.selectedIndices = all ? state.comments.map((_, index) => index) : [];
    views.render(state);
    if (state.views.picker) views.filterPicker(state, state.views.search.text || '', true);
    return true;
  }
  function addComment(addon, sender) {
    const { state, current } = checked(addon, sender, true);
    if (state.showAdd === false) return false;
    const target = { noteId: state.noteId, anchorRect: current.context.anchorRect };
    remove(addon);
    return __MN_QUICK_COMMENT_MNCommentManagerAddon.open(addon, target);
  }
  function selected(state) {
    return (state.selecting ? state.selectedIndices : [state.sourceIndex]).slice().filter(index => Number.isInteger(index) && index >= 0 && index < state.comments.length).sort((a, b) => a - b);
  }
  function conversionSignature(current) {
    return JSON.stringify([current.snapshot.excerpt, current.note.noteTitle, String(current.note.parentNote && current.note.parentNote.noteId || ""),
      (current.note.childNotes || []).map(note => String(note.noteId)), current.note.indexInBrotherNotes]);
  }
  function openActions(addon, sender) {
    const { state, current } = checked(addon, sender, true), indices = selected(state);
    state.controller.cancel(); dismissActions(state);
    const value = { panelToken: state.panelToken, signature: current.signature, indices, conversionSignature: conversionSignature(current) };
    const items = [], add = (title, action) => items.push({ title, object: addon, selector: "runQuickCommentAction:", param: Object.assign({}, value, { action }), checked: false });
    if (indices.length) {
      if (state.commentFold && state.commentFold.supported) {
        if (indices.some(index => !state.comments[index].collapsed)) add(state.selecting ? "折叠所选评论" : "折叠评论", "fold");
        if (indices.some(index => state.comments[index].collapsed)) add(state.selecting ? "展开所选评论" : "展开评论", "expand");
      }
      add("复制评论到新子卡片", "copy");
      add("移动评论到新子卡片", "extract");
      if (indices.every(index => !state.comments[index].capabilities || state.comments[index].capabilities.canDelete !== false)) add("删除所选评论…", "delete");
    }
    if (state.selecting) {
      if (indices.length < state.comments.length) add("全选评论", "selectAll");
      if (indices.length) add("清空选择", "clear");
    }
    else if (__MN_COMMENT_MUTATIONS__.getNoExcerptConversionState && __MN_COMMENT_MUTATIONS__.getNoExcerptConversionState(current.note, true).eligible) {
      add("主摘录转为评论…", "convert");
      if (state.commentFold && state.commentFold.supported) add("主摘录转为折叠评论…", "convertFold");
    }
    if (!items.length) return false;
    state.quickMenuItems = items;
    const hostWidth = state.host.bounds.width;
    const anchor = sender || state.views.actions || state.views.list || state.views.knob;
    state.quickPopover = typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== 'undefined'
      ? __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.present(addon, anchor, items, Math.min(310, hostWidth - 16), 2, { title: state.selecting ? '所选评论操作' : '评论操作', subtitle: state.selecting ? '已选择 ' + indices.length + ' 条评论 · 主摘录保留' : '当前卡片' })
      : MNUtil.getPopoverAndPresent(anchor, items, Math.min(300, hostWidth - 16), 2);
    if (state.quickPopover) state.quickPopover.delegate = addon;
    return !!state.quickPopover;
  }
  async function runQuickAction(addon, sender) {
    const { state, input, current } = checked(addon, sender, true);
    const indices = selected(state), action = input.action;
    if (input.signature !== current.signature || JSON.stringify(input.indices) !== JSON.stringify(indices)) throw new Error("选区已变化，请重新打开操作菜单");
    if (action === 'selectAll') return setSelection(addon, sender, true);
    if (action === "clear") { state.selectedIndices = []; dismissActions(state); views.render(state); if (state.views.picker) views.filterPicker(state, state.views.search.text || "", true); return true; }
    if (!["fold", "expand", "copy", "extract", "delete", "convert", "convertFold"].includes(action)) return false;
    const converting = action === "convert" || action === "convertFold";
    if (!converting && (!indices.length || indices.length > 200)) throw new Error("请选择至多 200 条评论后重试");
    if (converting && input.conversionSignature !== conversionSignature(current)) throw new Error("主摘录已变化，请重新打开操作菜单");
    const panelToken = state.panelToken, selecting = state.selecting;
    state.mutationPending = true; state.controller.cancel(); dismissActions(state); views.render(state);
    try {
      if (!["fold", "expand"].includes(action)) {
        const title = converting ? action === "convertFold" ? "主摘录转为折叠评论？" : "主摘录转为评论？" : action === "delete" ? "删除所选评论？" : action === "extract" ? "移动评论到新子卡片？" : "复制评论到新子卡片？";
        const content = converting ? "主摘录将成为首条评论，原有评论与子卡片保留。转换会创建替代卡片并迁移卡片链接。" : indices.map(index => views.summary(state.comments[index])).join("\n") + "\n\n" + (action === "delete" ? "删除后可以使用撤销恢复。" : "将新建一张子卡片，" + (action === "extract" ? "移入" : "复制") + "所选的 " + indices.length + " 条评论。主摘录保留。" + (action === "extract" ? "目标内容核对完成后，再移除原卡片中的所选评论；未选评论保留。" : "原卡片保留全部内容。"));
        if (!await MNUtil.confirm(title, content, ["取消", action === "copy" ? "复制并新建" : action === "extract" ? "移动并新建" : action === "delete" ? "确认删除" : "确认转换"])) return false;
      }
      const fresh = checked(addon, { panelToken }, true, true).current;
      if (converting && conversionSignature(fresh) !== input.conversionSignature) throw new Error("主摘录或卡片结构已变化，操作已停止");
      let result;
      if (action === "fold" || action === "expand") {
        const collapsed = action === "fold";
        result = __MN_COMMENT_MUTATIONS__.setCommentsCollapsed(state.noteId, indices, collapsed, fresh.snapshot.commentFold && fresh.snapshot.commentFold.revision);
        const after = read(addon, state);
        if (JSON.stringify(after.order) !== JSON.stringify(fresh.order) || after.snapshot.comments.some((comment, index) => comment.collapsed !== (indices.includes(index) ? collapsed : fresh.snapshot.comments[index].collapsed))) {
          throw new Error("评论折叠结果未通过核对，请刷新检查");
        }
        state.history = []; adopt(state, after, state.sourceIndex);
        state.selecting = selecting; state.selectedIndices = selecting ? indices : [];
        return result;
      }
      if (action === "copy" || action === "extract") {
        result = __MN_COMMENT_MUTATIONS__.extractCommentsToChildNote(state.noteId, indices, "", action === "extract");
        if (!result || !result.createdNoteId || result.actionCompleted === false) throw new Error(result && result.error || "子卡片创建结果未通过核对，请检查卡片");
      } else if (action === "delete") {
        result = __MN_COMMENT_MUTATIONS__.deleteComments(state.noteId, indices);
        if (JSON.stringify(read(addon, state).order) !== JSON.stringify(fresh.order.filter((_, index) => !indices.includes(index)))) throw new Error("评论删除结果未通过核对，请检查卡片或撤销");
      }
      else {
        result = __MN_UNDO_GROUPING_MNCommentManagerAddon.run("主摘录转为评论", { notes: [fresh.note] }, () => {
          const conversion = __MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes([fresh.note], { allowSingle: true });
          if (!conversion || conversion.failed || conversion.changed !== 1) throw new Error("主摘录转换未完成，请检查卡片或撤销");
          const id = conversion.convertedNoteMap && conversion.convertedNoteMap[state.noteId] || conversion.convertedNoteIds[0];
          if (action === "convertFold") {
            const note = __MN_COMMENT_DATA__.getWrappedNoteById(id), snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
            try { __MN_COMMENT_MUTATIONS__.setCommentsCollapsed(id, [0], true, snapshot.commentFold && snapshot.commentFold.revision); }
            catch (error) { throw new Error("主摘录已转换，但折叠未能确认：" + error.message + "。可以撤销恢复。"); }
          }
          if (id) MNUtil.focusNoteInMindMapById(id, 0.2);
          return conversion;
        });
      }
      close(addon);
      return result;
    } finally {
      state.mutationPending = false;
      if (active(addon, state)) { layout(addon); if (active(addon, state)) { views.render(state); if (state.views.picker) views.filterPicker(state, state.views.search.text || "", true); } }
    }
  }
  function toggleFold(addon, sender) {
    const { state, current } = checked(addon, sender, true);
    const index = state.sourceIndex, comment = state.comments[index];
    if (!comment || !state.commentFold || !state.commentFold.supported) return false;
    state.controller.cancel();
    const result = __MN_COMMENT_MUTATIONS__.setCommentsCollapsed(state.noteId, [index], !comment.collapsed, current.snapshot.commentFold.revision);
    const after = read(addon, state);
    state.history = [];
    adopt(state, after, index);
    views.render(state);
    return result;
  }
  function dismiss(addon, sender) { const { state } = checked(addon, sender, false); views.clearPreview(state); }
  function layout(addon) {
    const state = stateFor(addon);
    if (!state) return;
    if (!active(addon, state) || !same(state.host, MNUtil.studyView)) { remove(addon); return; }
    if (state.mutationPending) return;
    const next = geometry(addon, state);
    if (!next) { remove(addon); return; }
    if (JSON.stringify([next.card, next.bounds, next.rail, next.expanded, next.sidebar, next.holdSidebar]) === JSON.stringify([state.geometry.card, state.geometry.bounds, state.geometry.rail, state.geometry.expanded, state.geometry.sidebar, state.geometry.holdSidebar])) return;
    state.controller.cancel(); state.gestureKind = null;
    const query = state.views.search && state.views.search.text || "", picking = !!state.views.picker;
    views.hidePicker(state);
    views.clearPreview(state);
    const recreate = !!next.inline !== !!state.geometry.inline || next.inline && state.views.dots.length !== state.comments.length;
    if (recreate) views.dispose(state);
    state.geometry = next;
    if (recreate) {
      views.create(addon, state);
      state.views.rail.tag = 9304105;
      addon.dynamicMoveRailView = state.views.rail;
    }
    state.views.rail.frame = next.rail;
    views.render(state);
    if (picking) { views.showPicker(addon, state); state.views.search.text = query; views.filterPicker(state, query); }
  }
  return { open, select, close, remove, back, layout, gesture, stepBegan, stepEnded, stepCancelled, sourceTouchDown, filter, undo, toggleFold, dismiss, stateFor,
    selectAll: (addon, sender) => setSelection(addon, sender, true), clearSelection: (addon, sender) => setSelection(addon, sender, false),
    toggleSelection, openActions, runQuickAction, addComment, menuDismissed };
})();
