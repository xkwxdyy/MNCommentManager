var __MN_COMMENT_MOVE_VIEWS_MNCommentManagerAddon = (function () {
  const BLUE = "#2563eb", INK = "#1f2937", MUTED = "#64748b";

  function color(value) { return MNUtil.hexColorAlpha(value, 1); }
  function input(state, extra) { return Object.assign({ panelToken: state.panelToken }, extra || {}); }
  function handwriting(comment) { return !!(comment.drawingHash || comment.drawingPreviewDataURI || /drawing|paint/i.test(String(comment.type || ""))); }
  function summary(comment) {
    if (!comment) return "";
    const text = String(comment.linkedNoteTitle || comment.text || comment.htmlText || "")
      .replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
    return text || (handwriting(comment) ? "手写评论" : comment.imageHash || comment.imageBase64 || comment.mediaKind === "image" ? "图片评论" :
      comment.mediaKind === "audio" || comment.audioHash ? "音频评论" : comment.linkedNoteId ? "链接评论" : "无文字评论");
  }
  function glyph(comment) {
    if (!comment) return "↕";
    if (handwriting(comment)) return "✎";
    if (comment.imageHash || comment.imageBase64 || comment.mediaKind === "image") return "▧";
    if (comment.audioHash || comment.mediaKind === "audio") return "▶";
    return comment.linkedNoteId ? "↗" : "≡";
  }
  function label(frame, text, size, tint, bold) {
    const view = new UILabel(frame);
    view.text = text;
    view.font = bold ? UIFont.boldSystemFontOfSize(size) : UIFont.systemFontOfSize(size);
    view.textColor = color(tint || INK);
    view.userInteractionEnabled = false;
    return view;
  }
  function button(addon, frame, text, name, selector, value) {
    const view = UIButton.buttonWithType(0);
    view.frame = frame;
    view.setTitleForState(text, 0);
    view.setTitleColorForState(color(BLUE), 0);
    view.titleLabel.font = UIFont.systemFontOfSize(22);
    view.accessibilityLabel = name;
    view.param = value;
    if (selector) view.addTargetActionForControlEvents(addon, selector, 1 << 6);
    return view;
  }
  function surface(frame) {
    const view = new UIView(frame);
    view.backgroundColor = color("#ffffff");
    view.layer.cornerRadius = 12;
    view.layer.borderWidth = 1;
    view.layer.borderColor = color("#dbe3ef");
    view.layer.shadowOpacity = 0.16;
    view.layer.shadowRadius = 8;
    view.layer.shadowOffset = { width: 0, height: 3 };
    return view;
  }
  function image(state, comment) {
    if (!comment) return null;
    const cache = state.views.images;
    function cached(key, decode) {
      if (!Object.prototype.hasOwnProperty.call(cache, key)) {
        cache[key] = null;
        try { cache[key] = decode() || null; } catch (_) {}
      }
      return cache[key];
    }
    if (comment.imageHash) {
      const bitmap = cached("hash:" + comment.imageHash, function () {
        const data = MNUtil.getMediaByHash(comment.imageHash);
        return data ? UIImage.imageWithData(data) : null;
      });
      if (bitmap) return bitmap;
    }
    if (typeof MNUtil.imageFromBase64 !== "function") return null;
    if (comment.imageBase64) {
      const bitmap = cached("base64:" + comment.imageBase64, function () {
        return MNUtil.imageFromBase64(comment.imageBase64, /jpe?g/i.test(String(comment.imageMimeType || "")) ? "jpeg" : "png");
      });
      if (bitmap) return bitmap;
    }
    const preview = String(comment.drawingPreviewDataURI || "");
    if (/^data:image\/(png|jpe?g);base64,/i.test(preview)) {
      return cached("drawing-preview:" + preview, function () {
        return MNUtil.imageFromBase64(preview, /^data:image\/jpe?g;/i.test(preview) ? "jpeg" : "png");
      });
    }
    return null;
  }
  function thumbnail(state, parent, frame, comment) {
    const bitmap = image(state, comment);
    if (bitmap) {
      const view = new UIImageView(frame);
      view.image = bitmap;
      view.contentMode = 1;
      view.userInteractionEnabled = false;
      parent.addSubview(view);
      return view;
    }
    const view = label(frame, glyph(comment), 20, BLUE);
    view.textAlignment = 1;
    parent.addSubview(view);
    return view;
  }
  function detach(view) { if (view) view.removeFromSuperview(); }
  function createInline(addon, state) {
    const rail = surface(state.geometry.rail), count = state.comments.length;
    const views = { rail, images: Object.create(null), pickerRows: [], preview: null, picker: null, dots: [] };
    state.views = views;
    rail.clipsToBounds = true;
    const line = new UIView({ x: 16, y: 21, width: (count - 1) * 32, height: 2 });
    line.backgroundColor = color("#bfdbfe"); line.userInteractionEnabled = false; rail.addSubview(line);
    for (let index = 0; index < count; index++) {
      const dot = button(addon, { x: index * 32, y: 0, width: 32, height: 44 }, "", "", "openMoveCommentActions:", input(state, { index }));
      const marker = new UIView({ x: 11, y: 17, width: 10, height: 10 });
      marker.userInteractionEnabled = false; marker.layer.cornerRadius = 5;
      dot.addSubview(marker); dot.marker = marker;
      const pan = new UIPanGestureRecognizer(addon, "dynamicMoveRailPanned:");
      pan.cancelsTouchesInView = true; dot.addGestureRecognizer(pan);
      rail.addSubview(dot); views.dots.push(dot);
    }
    views.list = button(addon, { x: count * 32, y: 0, width: 44, height: 44 }, "≡", "按内容选择评论", "backMoveCommentMenu:", input(state));
    views.undo = button(addon, { x: count * 32 + 44, y: 0, width: 44, height: 44 }, "↶", "撤回评论移动", "undoQuickCommentMove:", input(state));
    views.close = button(addon, { x: count * 32 + 88, y: 0, width: 44, height: 44 }, "×", "关闭评论移动控件", "closeMoveCommentRail:", input(state));
    views.status = label({ x: 10, y: 44, width: rail.frame.width - 62, height: 20 }, "", 11, MUTED);
    views.inlineText = label({ x: 48, y: 68, width: rail.frame.width - 60, height: 62 }, "", 13, INK);
    views.inlineText.numberOfLines = 3;
    views.fold = button(addon, { x: rail.frame.width - 44, y: 44, width: 44, height: 32 }, "", "", "toggleMoveCommentFold:", input(state));
    views.inlineThumb = new UIView({ x: 8, y: 78, width: 32, height: 32 });
    views.inlineThumb.userInteractionEnabled = false;
    [views.list, views.undo, views.close, views.status, views.inlineThumb, views.inlineText, views.fold].forEach(view => rail.addSubview(view));
    state.host.addSubview(rail);
    renderInline(state);
    return views;
  }
  function renderInline(state, frame) {
    const views = state.views, comment = state.comments[state.sourceIndex];
    const expanded = !!comment && !views.picker;
    views.rail.frame = expanded ? state.geometry.expanded : state.geometry.rail;
    views.rail.hidden = !!views.picker;
    views.dots.forEach(function (dot, index) {
      const selected = index === state.sourceIndex, item = state.comments[index];
      dot.param = input(state, { index });
      dot.enabled = !!item && (!item.capabilities || item.capabilities.canMove !== false);
      dot.accessibilityLabel = "第 " + (index + 1) + " 条：" + summary(item) + (item && item.collapsed ? "，已折叠" : "");
      dot.accessibilityValue = selected ? "已选中，左右拖动排序" : "轻点选择";
      dot.marker.frame = { x: selected ? 9 : 11, y: selected ? 15 : 17, width: selected ? 14 : 10, height: selected ? 14 : 10 };
      dot.marker.layer.cornerRadius = selected ? 7 : 5;
      dot.marker.backgroundColor = color(item && item.collapsed ? "#ffffff" : selected ? BLUE : "#94a3b8");
      dot.marker.layer.borderWidth = item && item.collapsed ? 2 : 0;
      dot.marker.layer.borderColor = color(selected ? BLUE : "#94a3b8");
    });
    views.knob = views.dots[state.sourceIndex] || views.list;
    [views.list, views.undo, views.close, views.fold].forEach(view => { view.param = input(state); });
    views.undo.enabled = !!state.history.length; views.undo.alpha = views.undo.enabled ? 1 : 0.3;
    [views.status, views.inlineText, views.inlineThumb].forEach(view => { view.hidden = !expanded; });
    views.fold.hidden = !expanded || !state.commentFold || !state.commentFold.supported || !!frame;
    views.fold.setTitleForState(comment && comment.collapsed ? "▸" : "▾", 0);
    views.fold.accessibilityLabel = comment && comment.collapsed ? "展开当前评论" : "折叠当前评论";
    if (expanded) {
      if (views.inlineThumbIndex !== state.sourceIndex || views.inlineThumbComment !== comment) {
        detach(views.sourceThumb);
        views.sourceThumb = thumbnail(state, views.inlineThumb, { x: 0, y: 0, width: 32, height: 32 }, comment);
        views.inlineThumbIndex = state.sourceIndex; views.inlineThumbComment = comment;
      }
      views.status.text = state.notice || "第 " + (state.sourceIndex + 1) + " 条，共 " + state.comments.length + " 条";
      views.inlineText.text = summary(comment);
    }
    if (frame) {
      const remaining = state.comments.filter((_, index) => index !== state.sourceIndex);
      views.status.text = frame.cancelled ? "松手取消移动" : "移到第 " + (frame.targetIndex + 1) + " 条";
      views.inlineText.text = "上方：" + (summary(remaining[frame.targetIndex - 1]) || "评论开头") + "\n下方：" + (summary(remaining[frame.targetIndex]) || "评论末尾");
      const marker = views.dots[state.sourceIndex].marker;
      marker.frame = { x: Math.max(16, Math.min(16 + (state.comments.length - 1) * 32, frame.thumbY - state.geometry.rail.x)) - state.sourceIndex * 32 - 7, y: 15, width: 14, height: 14 };
      views.rail.bringSubviewToFront(views.dots[state.sourceIndex]);
    }
    if (views.picker) { views.search.param = input(state); views.pickerClose.param = input(state); }
  }
  function create(addon, state) {
    if (state.geometry.inline) return createInline(addon, state);
    const rail = surface(state.geometry.rail);
    rail.clipsToBounds = true;
    const views = { rail, images: Object.create(null), pickerRows: [], preview: null, picker: null };
    state.views = views;
    views.up = button(addon, { x: 0, y: 0, width: 44, height: 44 }, "↑", "上移评论", null, input(state, { direction: -1 }));
    views.knob = button(addon, { x: 0, y: 44, width: 44, height: 44 }, "", "选择要移动的评论", "backMoveCommentMenu:", input(state));
    views.down = button(addon, { x: 0, y: 88, width: 44, height: 44 }, "↓", "下移评论", null, input(state, { direction: 1 }));
    views.undo = button(addon, { x: 0, y: 132, width: 44, height: 44 }, "↶", "撤回评论移动", "undoQuickCommentMove:", input(state));
    views.close = button(addon, { x: 0, y: 176, width: 44, height: 44 }, "×", "关闭评论移动控件", "closeMoveCommentRail:", input(state));
    views.status = label({ x: 0, y: 29, width: 44, height: 15 }, "", 10, BLUE, true);
    views.status.textAlignment = 1;
    views.knob.addSubview(views.status);
    [views.up, views.down].forEach(function (view) {
      view.addTargetActionForControlEvents(addon, "dynamicMoveStepBegan:", 1 << 0);
      view.addTargetActionForControlEvents(addon, "dynamicMoveStepEnded:", 1 << 6);
      view.addTargetActionForControlEvents(addon, "dynamicMoveStepCancelled:", (1 << 7) | (1 << 8));
    });
    views.knob.addTargetActionForControlEvents(addon, "dynamicMoveSourceTouchDown:", 1 << 0);
    views.pan = new UIPanGestureRecognizer(addon, "dynamicMoveRailPanned:");
    views.pan.cancelsTouchesInView = true;
    views.knob.addGestureRecognizer(views.pan);
    [views.up, views.knob, views.down, views.undo, views.close].forEach(function (view) { rail.addSubview(view); });
    state.host.addSubview(rail);
    render(state);
    return views;
  }
  function render(state) {
    const views = state.views;
    if (!views) return;
    if (state.geometry.inline) return renderInline(state);
    const comment = state.comments[state.sourceIndex];
    views.up.param = input(state, { direction: -1 });
    views.down.param = input(state, { direction: 1 });
    views.knob.param = input(state);
    views.undo.param = input(state);
    views.close.param = input(state);
    views.up.enabled = !!comment && state.sourceIndex > 0;
    views.down.enabled = !!comment && state.sourceIndex < state.comments.length - 1;
    views.up.alpha = views.up.enabled ? 1 : 0.3;
    views.down.alpha = views.down.enabled ? 1 : 0.3;
    views.undo.enabled = !!(state.history && state.history.length);
    views.undo.alpha = views.undo.enabled ? 1 : 0.3;
    views.close.hidden = !!state.geometry.compactControls;
    views.status.text = comment ? (state.sourceIndex + 1) + "/" + state.comments.length : "";
    views.knob.accessibilityLabel = comment ? "当前评论：" + summary(comment) + "。轻点更换，拖动快速移动" : "选择要移动的评论";
    views.knob.accessibilityValue = comment ? "第 " + (state.sourceIndex + 1) + " 条，共 " + state.comments.length + " 条" : "尚未选择评论";
    detach(views.sourceThumb);
    views.sourceThumb = thumbnail(state, views.knob, { x: 10, y: 2, width: 24, height: 24 }, comment);
    if (views.picker) {
      views.search.param = input(state);
      views.pickerClose.param = input(state);
      filterPicker(state, views.search.text || "");
    }
  }
  function resetRail(state) {
    const views = state.views;
    views.rail.frame = state.geometry.rail;
    [[views.up, 0], [views.down, 88], [views.undo, 132], [views.close, 176]].forEach(function (entry) {
      entry[0].frame = { x: 0, y: entry[1], width: 44, height: 44 };
    });
    views.knob.frame = { x: 0, y: 44, width: 44, height: 44 };
    views.up.hidden = views.down.hidden = views.undo.hidden = false;
    views.close.hidden = !!state.geometry.compactControls;
    views.status.text = state.sourceIndex >= 0 ? (state.sourceIndex + 1) + "/" + state.comments.length : "";
    detach(views.track);
    views.track = null;
  }
  function clearPreview(state) {
    if (!state || !state.views) return;
    const views = state.views;
    if (state.geometry.inline) { renderInline(state); return; }
    detach(views.preview);
    views.preview = null;
    views.overview = null;
    views.previewLayout = views.previewContent = views.previewStatus = views.previewRemaining = null;
    resetRail(state);
  }
  function createOverview(state, frame) {
    const panel = new UIView(frame), width = frame.width;
    panel.userInteractionEnabled = false;
    const heading = label({ x: 8, y: 2, width: width - 16, height: 20 }, "", 13, BLUE, true);
    const footer = label({ x: 8, y: frame.height - 20, width: width - 16, height: 18 }, "", 11, MUTED);
    const viewport = new UIView({ x: 4, y: 24, width: width - 8, height: frame.height - 44 });
    viewport.clipsToBounds = true;
    viewport.userInteractionEnabled = false;
    const marker = label({ x: 4, y: 0, width: viewport.frame.width - 8, height: 24 }, "↓ " + summary(state.comments[state.sourceIndex]), 12, BLUE, true);
    marker.backgroundColor = color("#eff6ff");
    const line = new UIView({ x: 0, y: 0, width: marker.frame.width, height: 1 });
    line.backgroundColor = color(BLUE);
    marker.addSubview(line);
    const beforeEdge = label({ x: 4, y: 0, width: viewport.frame.width - 8, height: 18 }, "评论开头", 12, MUTED);
    const afterEdge = label({ x: 4, y: 0, width: viewport.frame.width - 8, height: 18 }, "评论末尾", 12, MUTED);
    const rows = [];
    // Keep a viewport-sized pool; a large image list must not decode every thumbnail.
    for (let index = 0; index < Math.ceil(viewport.frame.height / 24) + 2; index++) {
      const view = new UIView({ x: 4, y: 0, width: viewport.frame.width - 8, height: 24 });
      const bitmap = new UIImageView({ x: 0, y: 0, width: 28, height: 28 });
      bitmap.contentMode = 1;
      const icon = label({ x: 0, y: 0, width: 28, height: 24 }, "", 16, MUTED);
      icon.textAlignment = 1;
      const text = label({ x: 34, y: 0, width: view.frame.width - 34, height: 24 }, "", 12, MUTED);
      [bitmap, icon, text].forEach(function (child) { child.userInteractionEnabled = false; view.addSubview(child); });
      view.userInteractionEnabled = false;
      viewport.addSubview(view);
      rows.push({ view, bitmap, icon, text });
    }
    [marker, beforeEdge, afterEdge].forEach(function (view) { viewport.addSubview(view); });
    [heading, viewport, footer].forEach(function (view) { panel.addSubview(view); });
    state.views.overview = { heading, footer, viewport, marker, beforeEdge, afterEdge, rows };
    state.views.preview = panel;
    state.views.rail.addSubview(panel);
    state.views.rail.bringSubviewToFront(state.views.knob);
  }
  function positionOverview(state, frame, target, sidebar) {
    const overview = state.views.overview, remaining = state.views.previewRemaining;
    const count = remaining.length, height = overview.viewport.frame.height;
    const head = target === 0 ? 18 : 0;
    const markerY = head + target * 24 + (target > 0 ? 30 : 0);
    const contentHeight = head + count * 24 + (target > 0 ? 30 : 0) + (target < count ? 30 : 0) + 24 + (target === count ? 18 : 0);
    const margin = Math.min(66, height / 2);
    const desiredY = Math.max(margin, Math.min(height - margin, frame.thumbY - sidebar.y - 24));
    const offset = Math.max(0, Math.min(Math.max(0, contentHeight - height), markerY + 12 - desiredY));
    overview.offset = offset;
    overview.contentHeight = contentHeight;
    overview.heading.text = frame.cancelled ? "松手取消" : "目标位置";
    overview.footer.text = frame.cancelled ? "返回控件可继续" : frame.cancelHint || "横向移开可取消";
    overview.marker.frame = { x: 4, y: markerY - offset, width: overview.marker.frame.width, height: 24 };
    overview.marker.alpha = frame.cancelled ? 0.45 : 1;
    overview.beforeEdge.hidden = target !== 0;
    overview.beforeEdge.frame = { x: 4, y: -offset, width: overview.beforeEdge.frame.width, height: 18 };
    overview.afterEdge.hidden = target !== count;
    overview.afterEdge.frame = { x: 4, y: contentHeight - 18 - offset, width: overview.afterEdge.frame.width, height: 18 };
    let slot = 0;
    const first = Math.max(0, Math.floor((offset - 102) / 24));
    for (let index = first; index < count && slot < overview.rows.length; index++) {
      const side = index === target - 1 ? -1 : index === target ? 1 : 0;
      const adjacent = side !== 0;
      const rowHeight = adjacent ? 54 : 24;
      const y = head + index * 24 + (target > 0 && index >= target ? 30 : 0) + (target < count && index > target ? 30 : 0) + (index >= target ? 24 : 0);
      if (y >= offset + height) break;
      if (y + rowHeight <= offset) continue;
      const row = overview.rows[slot++], comment = remaining[index];
      row.view.hidden = false;
      row.view.alpha = adjacent ? 1 : 0.45;
      row.view.frame = { x: 4, y: y - offset, width: row.view.frame.width, height: rowHeight };
      row.bitmap.frame = { x: 0, y: adjacent ? 2 : 3, width: adjacent ? 28 : 20, height: adjacent ? 28 : 18 };
      row.text.frame = { x: 34, y: 0, width: row.text.frame.width, height: rowHeight };
      if (row.comment !== comment) {
        const bitmap = image(state, comment);
        row.bitmap.hidden = !bitmap;
        if (bitmap) row.bitmap.image = bitmap;
        row.icon.hidden = !!bitmap;
        row.icon.text = glyph(comment);
      }
      if (row.comment !== comment || row.index !== index || row.side !== side) {
        row.text.text = (side ? side < 0 ? "上方：" : "下方：" : "") + summary(comment);
        row.text.font = UIFont.systemFontOfSize(adjacent ? 13 : 12);
        row.text.numberOfLines = adjacent ? 4 : 1;
        row.text.textColor = color(adjacent ? INK : MUTED);
      }
      row.comment = comment;
      row.index = index;
      row.side = side;
    }
    for (; slot < overview.rows.length; slot++) overview.rows[slot].view.hidden = true;
  }
  function preview(state, frame) {
    const views = state.views;
    if (!views) return;
    if (state.geometry.inline) return renderInline(state, frame);
    const dragging = frame.kind === "drag";
    const column = dragging ? state.geometry.expanded : state.geometry.rail;
    const sidebar = (dragging ? state.geometry.sidebar : state.geometry.holdSidebar) || column;
    const columnX = column.x - sidebar.x;
    const layoutKey = frame.kind + JSON.stringify([sidebar, column]);
    if (views.previewLayout !== layoutKey) {
      clearPreview(state);
      views.previewLayout = layoutKey;
      views.previewRemaining = state.comments.filter(function (_, index) { return index !== state.sourceIndex; });
      views.rail.frame = sidebar;
      views.up.hidden = views.down.hidden = dragging;
      views.undo.hidden = views.close.hidden = true;
      [[views.up, 0], [views.down, 88]].forEach(function (entry) {
        entry[0].frame = { x: columnX, y: state.geometry.rail.y - sidebar.y + entry[1], width: 44, height: 44 };
      });
    }
    const knobY = dragging
      ? Math.max(0, Math.min(sidebar.height - 44, frame.thumbY - sidebar.y - 22))
      : Math.max(0, Math.min(sidebar.height - 44, state.geometry.rail.y + 44 - sidebar.y));
    views.knob.frame = { x: columnX, y: knobY, width: 44, height: 44 };
    const status = frame.cancelled ? "取消" : (frame.targetIndex + 1) + "/" + state.comments.length;
    if (views.previewStatus !== status) { views.status.text = status; views.previewStatus = status; }
    if (dragging && !views.track) {
      views.track = new UIView({ x: columnX + 21, y: column.y - sidebar.y + 22, width: 2, height: Math.max(0, column.height - 44) });
      views.track.backgroundColor = color("#bfdbfe");
      views.track.userInteractionEnabled = false;
      views.rail.addSubview(views.track);
    }
    const remaining = views.previewRemaining;
    const target = Math.max(0, Math.min(remaining.length, frame.targetIndex));
    if (sidebar.width > 44) {
      if (!views.overview) createOverview(state, { x: columnX === 0 ? 44 : 0, y: 0, width: sidebar.width - 44, height: sidebar.height });
      positionOverview(state, frame, target, sidebar);
      return;
    }
    const contentKey = target + ":" + !!frame.cancelled;
    if (views.preview && views.previewContent === contentKey) return;
    detach(views.preview);
    let panel;
    {
      // Compact previews use the free part of the same column, never the card face.
      const above = knobY, below = sidebar.height - knobY - 44;
      const y = dragging ? (below >= above ? knobY + 48 : 2) : 134;
      const height = dragging ? Math.max(0, (below >= above ? below : above) - 6) : Math.max(0, sidebar.height - 136);
      panel = new UIView({ x: 2, y, width: 40, height });
      const snippet = function (comment, fallback) { const text = comment ? summary(comment) : fallback; return text; };
      const before = "前：" + snippet(remaining[target - 1], "开头"), after = "后：" + snippet(remaining[target], "末尾");
      if (!dragging && sidebar.height < 220) {
        const movingDown = frame.targetIndex > frame.startIndex;
        views.up.hidden = movingDown;
        views.down.hidden = !movingDown;
        panel.frame = { x: 2, y: movingDown ? 2 : 90, width: 40, height: sidebar.height - (movingDown ? 4 : 92) };
        const beforeLabel = label({ x: 0, y: 0, width: 40, height: 40 }, before, 10, INK);
        const afterLabel = label({ x: 0, y: 134 - panel.frame.y, width: 40, height: 40 }, after, 10, INK);
        beforeLabel.numberOfLines = afterLabel.numberOfLines = 3;
        panel.addSubview(beforeLabel);
        panel.addSubview(afterLabel);
      } else {
        const text = label({ x: 0, y: 0, width: 40, height }, before + "\n" + after, 10, INK);
        text.numberOfLines = 0;
        panel.addSubview(text);
      }
    }
    panel.userInteractionEnabled = false;
    views.preview = panel;
    views.previewContent = contentKey;
    views.rail.addSubview(panel);
    views.rail.bringSubviewToFront(views.knob);
  }
  function hidePicker(state) {
    if (!state || !state.views) return;
    const views = state.views;
    if (views.search && typeof views.search.resignFirstResponder === "function") views.search.resignFirstResponder();
    detach(views.picker);
    views.picker = views.search = views.scroll = views.pickerClose = null;
    views.pickerRows = [];
    if (state.geometry.inline) renderInline(state);
  }
  function showPicker(addon, state) {
    const views = state.views;
    if (views.picker) return;
    clearPreview(state);
    const panel = surface(state.geometry.picker), width = panel.frame.width, height = panel.frame.height;
    views.picker = panel;
    views.pickerAddon = addon;
    panel.addSubview(label({ x: 14, y: 10, width: width - 66, height: 26 }, "选择评论", 15, INK, true));
    views.pickerClose = button(addon, { x: width - 44, y: 0, width: 44, height: 44 }, "×", state.geometry.compactControls ? "关闭评论移动控件" : "关闭评论列表", state.geometry.compactControls ? "closeMoveCommentRail:" : "backMoveCommentMenu:", input(state));
    panel.addSubview(views.pickerClose);
    const search = new UITextField({ x: 12, y: 46, width: width - 24, height: 40 });
    search.placeholder = "搜索评论内容";
    search.font = UIFont.systemFontOfSize(14);
    search.textColor = color(INK);
    search.borderStyle = 3;
    search.clearButtonMode = 1;
    search.param = input(state);
    search.accessibilityLabel = "搜索评论内容";
    search.addTargetActionForControlEvents(addon, "filterMoveCommentPicker:", 1 << 17);
    views.search = search;
    panel.addSubview(search);
    views.scroll = new UIScrollView({ x: 8, y: 94, width: width - 16, height: Math.max(0, height - 102) });
    views.scroll.clipsToBounds = true;
    panel.addSubview(views.scroll);
    filterPicker(state, "");
    if (state.geometry.inline) renderInline(state);
    state.host.addSubview(panel);
    state.host.bringSubviewToFront(views.rail);
  }
  function filterPicker(state, query) {
    const views = state.views;
    if (!views || !views.picker) return;
    views.pickerRows.forEach(detach);
    views.pickerRows = [];
    const needle = String(query || "").toLowerCase().trim(), width = views.scroll.frame.width;
    let count = 0;
    state.comments.forEach(function (comment, index) {
      if (needle && summary(comment).toLowerCase().indexOf(needle) < 0) return;
      const row = button(views.pickerAddon, { x: 0, y: count * 62, width, height: 60 }, "", summary(comment), "openMoveCommentActions:", input(state, { index }));
      row.backgroundColor = color(index === state.sourceIndex ? "#eff6ff" : "#f8fafc");
      row.layer.cornerRadius = 8;
      row.enabled = !comment.capabilities || comment.capabilities.canMove !== false;
      row.alpha = row.enabled ? 1 : 0.4;
      thumbnail(state, row, { x: 8, y: 14, width: 32, height: 32 }, comment);
      const text = label({ x: 48, y: 8, width: width - 60, height: 44 }, summary(comment), 13, INK);
      text.numberOfLines = 2;
      row.addSubview(text);
      views.scroll.addSubview(row);
      views.pickerRows.push(row);
      count++;
    });
    if (!count) {
      const empty = label({ x: 8, y: 12, width: width - 16, height: 44 }, "没有匹配的评论", 13, MUTED);
      views.scroll.addSubview(empty);
      views.pickerRows.push(empty);
    }
    views.scroll.contentSize = { width, height: count ? count * 62 : 68 };
    views.scroll.showsVerticalScrollIndicator = views.scroll.contentSize.height > views.scroll.frame.height;
    views.scroll.contentOffset = { x: 0, y: 0 };
  }
  function result(addon, state, text) {
    if (!state.views) return;
    state.notice = text;
    clearPreview(state);
    render(state);
    state.views.knob.accessibilityValue = text + "，第 " + (state.sourceIndex + 1) + " 条，共 " + state.comments.length + " 条";
  }
  function dispose(state) {
    if (!state || !state.views) return;
    hidePicker(state);
    clearPreview(state);
    detach(state.views.rail);
    state.views = null;
  }
  return { create, render, preview, clearPreview, showPicker, filterPicker, hidePicker, result, dispose };
})();
