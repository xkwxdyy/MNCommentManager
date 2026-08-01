var __MN_COMMENT_MUTATIONS__ = (function () {
  const INLINE_MERGE_TYPES = [
    "textComment",
    "markdownComment",
    "markdownLinkComment",
    "tagComment",
    "linkComment",
    "summaryComment",
    "mergedTextComment",
  ];

  function normalizeIndexArray(indices) {
    if (!Array.isArray(indices)) return [];
    return Array.from(new Set(indices
      .map((index) => parseInt(index, 10))
      .filter((index) => Number.isFinite(index) && index >= 0)))
      .sort((a, b) => a - b);
  }

  function getNoteOrThrow(noteId) {
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(noteId);
    if (!note) throw new Error("没有找到这张卡片，请刷新后再试");
    return note;
  }

  function withUndoGrouping(actionName, options, block) {
    return __MN_UNDO_GROUPING_MNCommentManagerAddon.run(actionName, options, block);
  }

  function refreshNote(note) {
    try {
      if (note && typeof note.refresh === "function") note.refresh();
    } catch (error) {
      // ignore refresh failure
    }
  }

  function getCommentCount(note) {
    return note && Array.isArray(note.comments) ? note.comments.length : 0;
  }

  function getInverseCommentIndices(note, keepIndices) {
    const keepSet = new Set(normalizeIndexArray(keepIndices));
    return Array.from({ length: getCommentCount(note) }, (_, index) => index)
      .filter((index) => !keepSet.has(index))
      .sort((a, b) => b - a);
  }

  function getSerializedComments(note) {
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    return snapshot && Array.isArray(snapshot.comments) ? snapshot.comments : [];
  }

  function getSerializedComment(note, index) {
    return getSerializedComments(note).find((comment) => comment.index === index) || null;
  }

  function requireComment(note, index) {
    const rawComment = note.comments && note.comments[index];
    if (!rawComment) throw new Error(`没有找到评论 #${index}，请刷新后再试`);
    return rawComment;
  }

  function requireCapability(serializedComment, capability, message) {
    if (!serializedComment || !serializedComment.capabilities || !serializedComment.capabilities[capability]) {
      throw new Error(message || "这条评论不支持当前操作");
    }
  }

  function moveSingleComment(note, fromIndex, toIndex) {
    if (typeof note.moveComment === "function") {
      note.moveComment(fromIndex, toIndex, false);
      return;
    }
    if (note.note && typeof note.note.moveComment === "function") {
      note.note.moveComment(fromIndex, toIndex);
      return;
    }
    throw new Error("当前版本无法移动评论，请更新 MarginNote 后再试");
  }

  function removeSingleComment(note, index) {
    if (typeof note.removeCommentByIndex === "function") {
      note.removeCommentByIndex(index);
      return;
    }
    if (note.note && typeof note.note.removeCommentByIndex === "function") {
      note.note.removeCommentByIndex(index);
      return;
    }
    throw new Error("当前版本无法删除评论，请更新 MarginNote 后再试");
  }

  function removeCommentsByIndices(note, indices) {
    const sorted = normalizeIndexArray(indices).sort((a, b) => b - a);
    if (sorted.length === 0) return;
    if (typeof note.removeCommentsByIndices === "function") {
      note.removeCommentsByIndices(sorted);
      return;
    }
    if (typeof note.removeCommentsByIndexArr === "function") {
      note.removeCommentsByIndexArr(sorted);
      return;
    }
    sorted.forEach((index) => removeSingleComment(note, index));
  }

  function getRawNote(note) {
    return note && note.note ? note.note : note;
  }

  function getNoteId(note) {
    try {
      return String(note && note.noteId || "").trim();
    } catch (error) {
      return "";
    }
  }

  function getNoteUrl(note) {
    if (!note) return "";
    if (note.noteURL) return String(note.noteURL || "");
    const noteId = getNoteId(note);
    if (!noteId) return "";
    try {
      if (typeof MNUtil !== "undefined" && MNUtil && MNUtil.version && MNUtil.version.version) {
        return String(MNUtil.version.version) + "app://note/" + noteId;
      }
    } catch (error) {
      // fall through
    }
    return "marginnote4app://note/" + noteId;
  }

  function extractNoteIdFromLink(text) {
    const link = __MN_COMMENT_DATA__.extractPureMarginNoteLink(text);
    return link && link.noteId ? link.noteId : "";
  }

  function getCommentText(comment) {
    return String(
      comment && (comment.text || comment.q_htext) ||
      "",
    );
  }

  function getLinkCommentIndices(note, targetUrl) {
    const target = String(targetUrl || "").trim();
    if (!target) return [];
    const targetId = extractNoteIdFromLink(target);
    return getSerializedComments(note)
      .filter((comment) => {
        if (!comment || (comment.type !== "linkComment" && comment.type !== "summaryComment")) return false;
        if (targetId && String(comment.linkedNoteId || "") === targetId) return true;
        return String(comment.linkedNoteUrl || comment.text || "").trim() === target;
      })
      .map((comment) => comment.index);
  }

  function replaceLinkCommentWithMarkdown(note, index, targetUrl) {
    removeSingleComment(note, index);
    appendMarkdownComment(note, targetUrl);
    moveSingleComment(note, getCommentCount(note) - 1, index);
  }

  function updateMarkdownLinksInNote(note, sourceUrl, targetUrl) {
    const comments = note && Array.isArray(note.comments) ? note.comments : [];
    comments.forEach((comment) => {
      if (!comment || String(comment.type || "") !== "TextNote") return;
      const text = getCommentText(comment);
      if (!text || text.indexOf(sourceUrl) < 0) return;
      const nextText = text.split(sourceUrl).join(targetUrl);
      if (nextText === text) return;
      try {
        if ("text" in comment) comment.text = nextText;
        else if ("q_htext" in comment) comment.q_htext = nextText;
      } catch (error) {
        // Link migration is best-effort; merge should still proceed.
      }
    });
  }

  function updateIncomingLinks(sourceNote, targetNote) {
    const sourceUrl = getNoteUrl(sourceNote);
    const targetUrl = getNoteUrl(targetNote);
    if (!sourceUrl || !targetUrl) return;
    const comments = getSerializedComments(sourceNote);
    const processed = new Set();

    comments.forEach((comment) => {
      const linkedIds = [];
      const directLinkedId = String(comment && comment.linkedNoteId || "").trim();
      if (directLinkedId) linkedIds.push(directLinkedId);
      const markdownLinks = comment && Array.isArray(comment.markdownLinks) ? comment.markdownLinks : [];
      markdownLinks.forEach((link) => {
        const linkedId = extractNoteIdFromLink(link && link.url);
        if (linkedId) linkedIds.push(linkedId);
      });

      linkedIds.forEach((linkedId) => {
        if (!linkedId || processed.has(linkedId)) return;
        processed.add(linkedId);
        const linkedNote = __MN_COMMENT_DATA__.getWrappedNoteById(linkedId);
        if (!linkedNote) return;
        getLinkCommentIndices(linkedNote, sourceUrl)
          .sort((a, b) => b - a)
          .forEach((index) => replaceLinkCommentWithMarkdown(linkedNote, index, targetUrl));
        updateMarkdownLinksInNote(linkedNote, sourceUrl, targetUrl);
        refreshNote(linkedNote);
      });
    });
  }

  function removeMarkdownLinksToNote(note, targetUrl) {
    const targetId = extractNoteIdFromLink(targetUrl);
    if (!note || !targetId) return;
    const comments = note && Array.isArray(note.comments) ? note.comments : [];
    comments.forEach((comment) => {
      if (!comment || String(comment.type || "") !== "TextNote") return;
      const text = getCommentText(comment);
      if (!text) return;
      const nextText = text.replace(/\[[^\]]*?\]\(([^)]+?)\)/g, (markdown, url) => (
        extractNoteIdFromLink(url) === targetId ? "" : markdown
      ));
      if (nextText === text) return;
      try {
        if ("text" in comment) comment.text = nextText;
        else if ("q_htext" in comment) comment.q_htext = nextText;
      } catch (error) {
        // Link cleanup is best-effort; merge should still proceed.
      }
    });
  }

  function removeTargetLinksToSource(targetNote, sourceNote) {
    const sourceUrl = getNoteUrl(sourceNote);
    if (!sourceUrl) return;
    getLinkCommentIndices(targetNote, sourceUrl)
      .sort((a, b) => b - a)
      .forEach((index) => removeSingleComment(targetNote, index));
    removeMarkdownLinksToNote(targetNote, sourceUrl);
  }

  function mergeIntoWithLinkMigration(sourceNote, targetNote) {
    if (!sourceNote || !targetNote) throw new Error("无法合并卡片，请刷新后再试");

    const rawSource = getRawNote(sourceNote);
    const rawTarget = getRawNote(targetNote);

    updateIncomingLinks(sourceNote, targetNote);
    removeTargetLinksToSource(targetNote, sourceNote);

    if (typeof targetNote.merge === "function") {
      targetNote.merge(sourceNote);
      return targetNote;
    }
    if (rawTarget && typeof rawTarget.merge === "function") {
      rawTarget.merge(rawSource);
      return targetNote;
    }

    throw new Error("当前版本无法合并卡片，请更新 MarginNote 后再试");
  }

  function noteHasExcerpt(note) {
    const excerpt = __MN_COMMENT_DATA__.getExcerptState(note);
    return !!(excerpt && excerpt.present);
  }

  function getExcerptType(note) {
    return __MN_COMMENT_DATA__.getExcerptType(note);
  }

  function getNoExcerptConversionState(note, allowTextExcerpt) {
    if (!note || !getNoteId(note)) return { eligible: false, reason: "invalid", excerptType: "unknown" };
    const excerpt = __MN_COMMENT_DATA__.getExcerptState(note);
    const excerptType = excerpt && excerpt.type || getExcerptType(note);
    if (!excerpt || !excerpt.present) return { eligible: false, reason: "noExcerpt", excerptType };
    if (!note.parentNote) return { eligible: false, reason: "noParent", excerptType };
    if (excerptType === "image") return { eligible: true, reason: "image", excerptType };
    if (allowTextExcerpt && excerptType === "text" && String(excerpt.text || "").trim()) {
      return { eligible: true, reason: "text", excerptType };
    }
    if (excerptType === "audio" || excerptType === "video") {
      return { eligible: false, reason: "unsupportedMedia", excerptType };
    }
    return { eligible: false, reason: "noExcerpt", excerptType };
  }

  function getNoteTitle(note) {
    return String(note && (note.noteTitle || note.title) || "");
  }

  function getNotePayloadSnapshot(note) {
    const rawNote = getRawNote(note);
    return {
      commentCount: getCommentCount(note),
      childCount: note && Array.isArray(note.childNotes) ? note.childNotes.length : 0,
      hasExcerptText: !!String(note && note.excerptText || rawNote && rawNote.excerptText || "").trim(),
      hasExcerptPic: !!(note && note.excerptPic || rawNote && rawNote.excerptPic),
    };
  }

  function isEmptyConversionTarget(note, initialSnapshot) {
    const snapshot = getNotePayloadSnapshot(note);
    const initial = initialSnapshot || {};
    return snapshot.commentCount <= Number(initial.commentCount || 0) &&
      snapshot.childCount <= Number(initial.childCount || 0) &&
      !snapshot.hasExcerptText &&
      !snapshot.hasExcerptPic;
  }

  function detachMergedSourceFromParent(sourceNote, targetNote, expectedParentNote) {
    try {
      if (typeof MNNote !== "undefined" && MNNote && typeof MNNote.detachMergedSourceFromParent === "function") {
        if (MNNote.detachMergedSourceFromParent(sourceNote, targetNote, expectedParentNote)) return true;
      }
      const sourceParent = sourceNote && sourceNote.parentNote;
      if (!sourceParent || !targetNote) return false;
      if (expectedParentNote && getNoteId(sourceParent) !== getNoteId(expectedParentNote)) return false;
      if (String(sourceNote.groupNoteId || "") !== getNoteId(targetNote)) return false;
      if (typeof sourceNote.removeFromParent !== "function") return false;
      sourceNote.removeFromParent();
      return true;
    } catch (error) {
      return false;
    }
  }

  function syncPinnedNoteId(sourceNoteId, targetNoteId) {
    try {
      if (typeof pinnerUtils !== "undefined" && pinnerUtils && typeof pinnerUtils.updateCardPinsNoteId === "function") {
        pinnerUtils.updateCardPinsNoteId(sourceNoteId, targetNoteId);
      }
    } catch (error) {
      // MNPinner is optional; conversion should not fail when it is unavailable.
    }
  }

  function convertNoteToNoExcerpt(note, options) {
    const opts = options && typeof options === "object" ? options : {};
    const state = getNoExcerptConversionState(note, opts.allowTextExcerpt === true);
    if (!state.eligible) return { changed: false, reason: state.reason, note };

    const parentNote = note.parentNote;
    const sourceNoteId = getNoteId(note);
    const sourceTitle = getNoteTitle(note);
    const sourceIndex = Number(note.indexInBrotherNotes);
    const target = createBlankChildNoteOrThrow(parentNote, sourceTitle, note.colorIndex);
    const targetInitialSnapshot = getNotePayloadSnapshot(target);

    try {
      setNoteTitle(note, "");
      mergeIntoWithLinkMigration(note, target);
    } catch (error) {
      setNoteTitle(note, sourceTitle);
      if (target && isEmptyConversionTarget(target, targetInitialSnapshot)) removeDetachedNote(target);
      throw error;
    }

    const sourceDetached = detachMergedSourceFromParent(note, target, parentNote);
    if (!sourceDetached && note.parentNote && getNoteId(note.parentNote) === getNoteId(parentNote)) {
      throw new Error("摘录已合并，但源卡片仍残留在原父卡片下，请撤销后重试");
    }
    if (Number.isFinite(sourceIndex) && typeof target.moveTo === "function") {
      target.moveTo(sourceIndex);
    }
    setNoteTitle(target, sourceTitle);
    syncPinnedNoteId(sourceNoteId, getNoteId(target));
    refreshNote(target);
    return { changed: true, reason: state.reason, note: target, sourceNoteId };
  }

  function normalizeContentSelection(selection, commentCount) {
    const source = selection && typeof selection === "object" ? selection : {};
    const normalized = {
      excerptSelected: source.excerptSelected === true,
      commentIndices: normalizeIndexArray(source.commentIndices),
    };
    if (!normalized.excerptSelected && normalized.commentIndices.length === 0) {
      throw new Error("先选择要处理的内容");
    }
    const invalid = normalized.commentIndices.filter((index) => index >= commentCount);
    if (invalid.length > 0) {
      throw new Error(`评论位置已变化，请刷新后重试：#${invalid.join(", #")}`);
    }
    return normalized;
  }

  function getCommentFingerprint(comment) {
    const capabilities = comment && comment.capabilities || {};
    return JSON.stringify([
      String(comment && comment.originalType || ""),
      String(comment && comment.type || ""),
      String(comment && (comment.text || comment.htmlText) || ""),
      String(comment && comment.imageHash || ""),
      String(comment && comment.audioHash || ""),
      String(comment && comment.linkedNoteId || ""),
      capabilities.isMarkdown === true,
      capabilities.isHtml === true,
    ]);
  }

  function getMergedSourceNoteId(comment) {
    const candidates = [
      comment && comment.noteid,
      comment && comment.noteId,
      comment && comment.note_id,
      comment && comment.q_hpic && comment.q_hpic.noteid,
      comment && comment.q_hpic && comment.q_hpic.noteId,
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const noteId = String(candidates[i] || "").trim();
      if (noteId) return noteId.toUpperCase();
    }
    return "";
  }

  function validateConvertedCommentMapping(sourceSnapshot, targetNote, sourceNoteId, selection) {
    const sourceComments = sourceSnapshot && Array.isArray(sourceSnapshot.comments)
      ? sourceSnapshot.comments
      : [];
    const targetComments = getSerializedComments(targetNote);
    if (targetComments.length !== sourceComments.length + 1) {
      throw new Error(`转换后的评论数量异常：预期 ${sourceComments.length + 1}，实际 ${targetComments.length}`);
    }
    const rawFirst = targetNote && Array.isArray(targetNote.comments) ? targetNote.comments[0] : null;
    if (!rawFirst || String(rawFirst.type || "") !== "LinkNote") {
      throw new Error("转换后的第 1 条内容不是原摘录，请撤销后重试");
    }
    const mergedSourceId = getMergedSourceNoteId(rawFirst);
    if (!mergedSourceId || mergedSourceId !== String(sourceNoteId || "").toUpperCase()) {
      throw new Error("转换后的摘录来源无法验证，请撤销后重试");
    }
    for (let i = 0; i < sourceComments.length; i += 1) {
      if (getCommentFingerprint(sourceComments[i]) !== getCommentFingerprint(targetComments[i + 1])) {
        throw new Error(`转换后的原评论 #${i} 未保持在 #${i + 1}，已停止后续操作`);
      }
    }
    const normalizedSelection = selection || { excerptSelected: false, commentIndices: [] };
    const mappedIndices = normalizedSelection.commentIndices.map((index) => index + 1);
    if (normalizedSelection.excerptSelected) mappedIndices.unshift(0);
    return normalizeIndexArray(mappedIndices);
  }

  function getConversionErrorMessage(reason) {
    if (reason === "noParent") return "当前摘录卡没有父卡片，无法转为非摘录版";
    if (reason === "unsupportedMedia") return "当前音频或视频摘录暂不支持转为非摘录版";
    if (reason === "noExcerpt") return "当前卡片没有可转换的文本或图片摘录";
    return "当前卡片无法转为非摘录版";
  }

  function makeSelectionActionResult(note, options) {
    const opts = options && typeof options === "object" ? options : {};
    return {
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(note),
      noteId: getNoteId(note),
      sourceNoteId: String(opts.sourceNoteId || getNoteId(note)),
      converted: opts.converted === true,
      actionCompleted: opts.actionCompleted !== false,
      mappedIndices: normalizeIndexArray(opts.mappedIndices),
      selectedIndices: normalizeIndexArray(opts.selectedIndices),
      statusMessage: String(opts.statusMessage || ""),
      error: String(opts.error || ""),
    };
  }

  function executeContentSelection(noteId, selection, actionName, handlers) {
    const sourceNote = getNoteOrThrow(noteId);
    const sourceSnapshot = __MN_COMMENT_DATA__.getNoteSnapshot(sourceNote);
    const normalizedSelection = normalizeContentSelection(selection, sourceSnapshot.comments.length);
    const excerpt = sourceSnapshot.excerpt || __MN_COMMENT_DATA__.getExcerptState(sourceNote);
    if (normalizedSelection.excerptSelected && !excerpt.present) {
      throw new Error("当前卡片已没有原生摘录，请刷新后重试");
    }
    const actionHandlers = handlers && typeof handlers === "object" ? handlers : {};
    if (typeof actionHandlers.preflight === "function") {
      actionHandlers.preflight(sourceNote, normalizedSelection, sourceSnapshot);
    }

    const sourceNoteId = getNoteId(sourceNote);
    if (!normalizedSelection.excerptSelected) {
      let actionResult = {};
      withUndoGrouping(actionName, { note: sourceNote }, () => {
        actionResult = actionHandlers.apply(
          sourceNote,
          normalizedSelection.commentIndices,
          {
            converted: false,
            sourceSnapshot,
            sourceSelection: normalizedSelection,
          },
        ) || {};
      });
      return makeSelectionActionResult(sourceNote, {
        sourceNoteId,
        converted: false,
        actionCompleted: true,
        mappedIndices: normalizedSelection.commentIndices,
        selectedIndices: actionResult.selectedIndices,
        statusMessage: actionResult.statusMessage,
      });
    }

    const conversionState = getNoExcerptConversionState(sourceNote, true);
    if (!conversionState.eligible) throw new Error(getConversionErrorMessage(conversionState.reason));

    let convertedNote = null;
    let mappedIndices = [];
    let actionResult = {};
    let partialError = "";
    withUndoGrouping(actionName, { note: sourceNote }, () => {
      const conversion = convertNoteToNoExcerpt(sourceNote, { allowTextExcerpt: true });
      if (!conversion.changed || !conversion.note) {
        throw new Error(getConversionErrorMessage(conversion.reason));
      }
      convertedNote = conversion.note;
      try {
        mappedIndices = validateConvertedCommentMapping(
          sourceSnapshot,
          convertedNote,
          sourceNoteId,
          normalizedSelection,
        );
        actionResult = actionHandlers.apply(
          convertedNote,
          mappedIndices,
          {
            converted: true,
            sourceSnapshot,
            sourceSelection: normalizedSelection,
          },
        ) || {};
      } catch (error) {
        partialError = error && error.message ? error.message : String(error);
      }
    });

    if (partialError) {
      return makeSelectionActionResult(convertedNote, {
        sourceNoteId,
        converted: true,
        actionCompleted: false,
        mappedIndices: [],
        selectedIndices: [],
        statusMessage: `卡片已转为非摘录版，但后续操作已停止：${partialError}`,
        error: partialError,
      });
    }
    return makeSelectionActionResult(convertedNote, {
      sourceNoteId,
      converted: true,
      actionCompleted: true,
      mappedIndices,
      selectedIndices: actionResult.selectedIndices,
      statusMessage: actionResult.statusMessage,
    });
  }

  function removeClonedChildren(note) {
    try {
      const childNotes = note && Array.isArray(note.childNotes) ? note.childNotes : [];
      for (let i = childNotes.length - 1; i >= 0; i--) {
        if (childNotes[i] && typeof childNotes[i].removeFromParent === "function") {
          childNotes[i].removeFromParent();
        }
      }
    } catch (error) {
      // Keeping cloned child notes is less harmful than failing the extraction.
    }
  }

  function cloneNoteOrThrow(note) {
    let clonedNote = null;
    if (note && typeof note.clone === "function") {
      clonedNote = note.clone();
    } else if (typeof MNNote !== "undefined" && MNNote && typeof MNNote.clone === "function") {
      clonedNote = MNNote.clone(note);
    }
    if (!clonedNote) throw new Error("当前版本无法创建子卡片，请更新 MarginNote 后再试");
    return clonedNote;
  }

  function createBlankChildNoteOrThrow(parentNote, title, colorIndex) {
    const config = {
      title,
      content: "",
      markdown: true,
      colorIndex,
    };
    let child = null;
    if (parentNote && typeof parentNote.createChildNote === "function") {
      child = parentNote.createChildNote(config, false);
    }
    if (!child && typeof MNNote !== "undefined" && MNNote && typeof MNNote.new === "function") {
      child = MNNote.new(config);
      if (child && parentNote && typeof parentNote.addChild === "function") {
        parentNote.addChild(child);
      }
    }
    if (!child) throw new Error("当前版本无法创建空白子卡片，请更新 MarginNote 后再试");
    return child;
  }

  function setNoteTitle(note, title) {
    const normalizedTitle = String(title || "");
    if (!note) return;
    try {
      note.title = normalizedTitle;
    } catch (error) {}
    try {
      note.noteTitle = normalizedTitle;
    } catch (error) {}
    try {
      if (note.note) note.note.noteTitle = normalizedTitle;
    } catch (error) {}
  }

  function removeDetachedNote(note) {
    try {
      if (note && typeof note.delete === "function") {
        note.delete(false, false, false);
        return;
      }
      if (note && typeof note._delete === "function") {
        note._delete(false);
        return;
      }
      if (note && typeof note.removeFromParent === "function") note.removeFromParent();
    } catch (error) {
      // ignore cleanup failure
    }
  }

  function attachClonedChildOrThrow(parentNote, childNote) {
    if (parentNote && typeof parentNote.addChild === "function") {
      parentNote.addChild(childNote);
      return;
    }
    const rawParent = getRawNote(parentNote);
    const rawChild = getRawNote(childNote);
    if (rawParent && typeof rawParent.addChild === "function") {
      rawParent.addChild(rawChild);
      return;
    }
    throw new Error("当前版本无法挂载子卡片，请更新 MarginNote 后再试");
  }

  function cloneSelectionToChild(sourceNote, selection, childTitle) {
    const sourceSnapshot = __MN_COMMENT_DATA__.getNoteSnapshot(sourceNote);
    const normalizedSelection = normalizeContentSelection(selection, sourceSnapshot.comments.length);
    const clone = cloneNoteOrThrow(sourceNote);
    try {
      setNoteTitle(clone, childTitle);
      removeClonedChildren(clone);
      removeCommentsByIndices(clone, getInverseCommentIndices(clone, normalizedSelection.commentIndices));
      attachClonedChildOrThrow(sourceNote, clone);
      return clone;
    } catch (error) {
      removeDetachedNote(clone);
      throw error;
    }
  }

  function appendTextComment(note, text) {
    if (typeof note.appendTextComment === "function") {
      note.appendTextComment(text);
      return;
    }
    if (note.note && typeof note.note.appendTextComment === "function") {
      note.note.appendTextComment(text);
      return;
    }
    throw new Error("当前版本无法新增文本评论，请更新 MarginNote 后再试");
  }

  function appendMarkdownComment(note, text) {
    if (typeof note.appendMarkdownComment === "function") {
      note.appendMarkdownComment(text);
      return;
    }
    if (note.note && typeof note.note.appendMarkdownComment === "function") {
      note.note.appendMarkdownComment(text);
      return;
    }
    appendTextComment(note, text);
  }

  function escapeMarkdownLinkText(text) {
    return String(text || "").replace(/\]/g, "\\]");
  }

  function escapeMarkdownLinkUrl(url) {
    return String(url || "").replace(/\)/g, "%29").trim();
  }

  function replaceCommentText(note, index, text, markdown) {
    const rawComment = requireComment(note, index);
    const serialized = getSerializedComment(note, index);
    requireCapability(serialized, "canEditText", `#${index} 不是可编辑的文本评论`);
    const nextText = String(text || "");
    if (!nextText.trim()) throw new Error("评论内容不能为空");

    if (rawComment && rawComment.type === "LinkNote" && "q_htext" in rawComment) {
      rawComment.q_htext = nextText;
      if (markdown && "markdown" in rawComment) rawComment.markdown = true;
      if (rawComment.noteid) {
        const mergedNote = __MN_COMMENT_DATA__.getWrappedNoteById(rawComment.noteid);
        if (mergedNote) mergedNote.excerptText = nextText;
      }
      return;
    }

    removeSingleComment(note, index);
    if (markdown) appendMarkdownComment(note, nextText);
    else appendTextComment(note, nextText);
    moveSingleComment(note, getCommentCount(note) - 1, index);
  }

  function replaceCommentWithMarkdown(note, index, text) {
    requireComment(note, index);
    const nextText = String(text || "").trim();
    if (!nextText) throw new Error(`#${index} 没有可转换的文本`);

    appendMarkdownComment(note, nextText);
    moveSingleComment(note, getCommentCount(note) - 1, index);
    removeSingleComment(note, index + 1);
  }

  function getHtmlCommentIndices(note) {
    return getSerializedComments(note)
      .filter((comment) => comment && comment.capabilities && comment.capabilities.isHtml)
      .map((comment) => comment.index);
  }

  function getPureLinkCommentIndices(note) {
    return getSerializedComments(note)
      .filter((comment) => comment && (comment.type === "linkComment" || comment.type === "summaryComment"))
      .map((comment) => comment.index);
  }

  function convertHtmlCommentIndicesInNote(note, indices, stats) {
    const sorted = normalizeIndexArray(indices).sort((a, b) => b - a);
    sorted.forEach((index) => {
      try {
        const serialized = getSerializedComment(note, index);
        requireCapability(serialized, "isHtml", `#${index} 不是 HTML 评论`);
        const text = String(serialized.text || serialized.htmlText || "").trim();
        if (!text) {
          stats.skippedEmpty += 1;
          return;
        }
        replaceCommentWithMarkdown(note, index, text);
        stats.convertedComments += 1;
      } catch (error) {
        stats.failed += 1;
        stats.errors.push({
          noteId: String(note && note.noteId || ""),
          index,
          message: error && error.message ? error.message : String(error),
        });
      }
    });
  }

  function moveCommentIndices(note, indices, targetIndex) {
    const sorted = normalizeIndexArray(indices);
    if (sorted.length === 0) throw new Error("先选择要移动的评论");
    sorted.forEach((index) => requireComment(note, index));

    const count = getCommentCount(note);
    let target = parseInt(targetIndex, 10);
    if (!Number.isFinite(target)) target = count;
    target = Math.max(0, Math.min(count, target));
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    if (target >= min && target <= max) {
      throw new Error("不能把评论移动到所选范围内部");
    }
    if (max - min + 1 === sorted.length && target === max + 1) {
      throw new Error("目标位置与当前位置相同");
    }

    if (target < min) {
      sorted.forEach((index, offset) => moveSingleComment(note, index, target + offset));
      return Array.from({ length: sorted.length }, (_, offset) => target + offset);
    }
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      moveSingleComment(note, sorted[i], target - (sorted.length - i));
    }
    return Array.from({ length: sorted.length }, (_, offset) => target - sorted.length + offset);
  }

  function removeCommentIndices(note, indices) {
    const sorted = normalizeIndexArray(indices);
    if (sorted.length === 0) throw new Error("先选择要删除的评论");
    sorted.forEach((index) => requireComment(note, index));
    removeCommentsByIndices(note, sorted);
  }

  function mergeTextCommentIndices(note, indices, text, markdown) {
    const sorted = normalizeIndexArray(indices);
    const finalText = String(text || "").trim();
    if (sorted.length < 2) throw new Error("至少选择 2 条内容才能合并");
    if (!finalText) throw new Error("请填写合并后的内容");
    const serializedComments = getSerializedComments(note);
    sorted.forEach((index) => {
      const comment = serializedComments.find((item) => item.index === index);
      requireCapability(comment, "canMergeText", `#${index} 不是可合并的文本评论`);
      requireCapability(comment, "canCopyText", `#${index} 没有可合并的文本`);
    });

    if (markdown) appendMarkdownComment(note, finalText);
    else appendTextComment(note, finalText);
    const insertedIndex = getCommentCount(note) - 1;
    const firstIndex = sorted[0];
    moveSingleComment(note, insertedIndex, firstIndex);
    sorted.sort((a, b) => b - a).forEach((index) => removeSingleComment(note, index + 1));
    return [firstIndex];
  }

  function getSelectionVirtualPositions(selection, excerptPresent) {
    const offset = excerptPresent ? 1 : 0;
    const positions = selection.commentIndices.map((index) => index + offset);
    if (excerptPresent && selection.excerptSelected) positions.unshift(0);
    return normalizeIndexArray(positions);
  }

  function isContinuousPositions(positions) {
    if (!positions.length) return false;
    return positions[positions.length - 1] - positions[0] + 1 === positions.length;
  }

  function requireSelectionCommentsCapability(snapshot, selection, capability, message) {
    selection.commentIndices.forEach((index) => {
      const comment = snapshot.comments.find((item) => item.index === index);
      requireCapability(comment, capability, message || `#${index} 不支持当前操作`);
    });
  }

  function normalizeVirtualTarget(targetIndex, sourceSnapshot) {
    const excerptPresent = !!(sourceSnapshot.excerpt && sourceSnapshot.excerpt.present);
    const total = sourceSnapshot.comments.length + (excerptPresent ? 1 : 0);
    let target = parseInt(targetIndex, 10);
    if (!Number.isFinite(target)) target = total;
    return Math.max(0, Math.min(total, target));
  }

  function moveContentSelection(noteId, selection, targetIndex) {
    let virtualTarget = null;
    const result = executeContentSelection(noteId, selection, "移动内容", {
      preflight(_note, normalizedSelection, sourceSnapshot) {
        requireSelectionCommentsCapability(sourceSnapshot, normalizedSelection, "canMove");
        virtualTarget = normalizeVirtualTarget(targetIndex, sourceSnapshot);
        const excerptPresent = !!(sourceSnapshot.excerpt && sourceSnapshot.excerpt.present);
        const positions = getSelectionVirtualPositions(normalizedSelection, excerptPresent);
        if (virtualTarget >= positions[0] && virtualTarget <= positions[positions.length - 1]) {
          throw new Error("不能把内容移动到所选范围内部");
        }
        if (isContinuousPositions(positions) && virtualTarget === positions[positions.length - 1] + 1) {
          throw new Error("目标位置与当前位置相同");
        }
        if (!normalizedSelection.excerptSelected && excerptPresent && virtualTarget < 1) {
          throw new Error("卡片自身的摘录固定在评论列表上方，普通评论不能移到摘录之前");
        }
      },
      apply(note, mappedIndices, context) {
        const sourceHadExcerpt = !!(context.sourceSnapshot.excerpt && context.sourceSnapshot.excerpt.present);
        const actualTarget = context.converted || !sourceHadExcerpt ? virtualTarget : virtualTarget - 1;
        const selectedIndices = moveCommentIndices(note, mappedIndices, actualTarget);
        refreshNote(note);
        return { selectedIndices, statusMessage: "内容位置已更新" };
      },
    });
    if (result.actionCompleted) MNUtil.showHUD("内容位置已更新");
    return result;
  }

  function deleteContentSelection(noteId, selection) {
    const result = executeContentSelection(noteId, selection, "删除内容", {
      preflight(_note, normalizedSelection, sourceSnapshot) {
        requireSelectionCommentsCapability(sourceSnapshot, normalizedSelection, "canDelete");
      },
      apply(note, mappedIndices) {
        removeCommentIndices(note, mappedIndices);
        refreshNote(note);
        return { selectedIndices: [], statusMessage: `已删除 ${mappedIndices.length} 项内容` };
      },
    });
    if (result.actionCompleted) MNUtil.showHUD(result.statusMessage);
    return result;
  }

  function mergeContentSelection(noteId, selection, text, markdown, mode) {
    const mergeMode = mode === "inline" ? "inline" : "text";
    const result = executeContentSelection(noteId, selection, mergeMode === "inline" ? "生成行内链接" : "合并文本", {
      preflight(_note, normalizedSelection, sourceSnapshot) {
        const excerpt = sourceSnapshot.excerpt || {};
        const selectedCount = normalizedSelection.commentIndices.length + (normalizedSelection.excerptSelected ? 1 : 0);
        if (selectedCount < 2) throw new Error("至少选择 2 项内容才能合并");
        if (normalizedSelection.excerptSelected && !excerpt.capabilities.canMergeText) {
          throw new Error("所选原生摘录不是可合并的文本摘录");
        }
        requireSelectionCommentsCapability(sourceSnapshot, normalizedSelection, "canMergeText");
        requireSelectionCommentsCapability(sourceSnapshot, normalizedSelection, "canCopyText");
        if (mergeMode === "inline") {
          const positions = getSelectionVirtualPositions(normalizedSelection, !!excerpt.present);
          if (!isContinuousPositions(positions)) throw new Error("行内链接合并需要选择连续内容");
          const selectedComments = normalizedSelection.commentIndices.map((index) => (
            sourceSnapshot.comments.find((comment) => comment.index === index)
          ));
          if (selectedComments.some((comment) => !comment || INLINE_MERGE_TYPES.indexOf(comment.type) < 0)) {
            throw new Error("所选内容包含不能生成行内链接的类型");
          }
          if (!selectedComments.some((comment) => comment.type === "linkComment" || comment.type === "summaryComment")) {
            throw new Error("至少包含 1 条纯卡片链接评论");
          }
        }
      },
      apply(note, mappedIndices) {
        const selectedIndices = mergeTextCommentIndices(note, mappedIndices, text, markdown !== false);
        refreshNote(note);
        return {
          selectedIndices,
          statusMessage: mergeMode === "inline" ? "行内链接已生成" : "文本已合并",
        };
      },
    });
    if (result.actionCompleted) MNUtil.showHUD(result.statusMessage);
    return result;
  }

  function moveComments(noteId, indices, targetIndex) {
    const note = getNoteOrThrow(noteId);
    let selectedIndices = [];
    withUndoGrouping("移动评论", { note }, () => {
      selectedIndices = moveCommentIndices(note, indices, targetIndex);
      refreshNote(note);
    });

    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    snapshot.selectedIndices = selectedIndices;
    return snapshot;
  }

  function deleteComments(noteId, indices) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices).sort((a, b) => b - a);
    if (sorted.length === 0) throw new Error("先选择要删除的评论");

    withUndoGrouping("删除评论", { note }, () => {
      sorted.forEach((index) => removeSingleComment(note, index));
      refreshNote(note);
    });

    MNUtil.showHUD(`已删除 ${sorted.length} 条评论`);
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function countReverseLinks(noteId, indices) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices);
    const serializedComments = getSerializedComments(note);
    let reverseCount = 0;
    sorted.forEach((index) => {
      const serialized = serializedComments.find((item) => item.index === index);
      if (!serialized || !serialized.capabilities || !serialized.capabilities.canBidirectionalDelete) return;
      const comment = note.comments && note.comments[index];
      const link = __MN_COMMENT_DATA__.extractPureMarginNoteLink(comment && comment.text);
      if (!link) return;
      const targetNote = __MN_COMMENT_DATA__.getWrappedNoteById(link.noteId);
      if (!targetNote || !Array.isArray(targetNote.comments)) return;
      targetNote.comments.forEach((targetComment) => {
        const reverseLink = __MN_COMMENT_DATA__.extractPureMarginNoteLink(targetComment && targetComment.text);
        if (reverseLink && reverseLink.noteId === String(noteId).toUpperCase()) reverseCount += 1;
      });
    });
    return reverseCount;
  }

  function deleteBidirectionalLinks(noteId, indices) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices).sort((a, b) => b - a);
    if (sorted.length === 0) throw new Error("先选择要删除的链接评论");

    const sourceId = String(noteId || "").toUpperCase();
    const serializedComments = getSerializedComments(note);
    const invalid = sorted.filter((index) => {
      const serialized = serializedComments.find((item) => item.index === index);
      return !serialized || !serialized.capabilities || !serialized.capabilities.canBidirectionalDelete;
    });
    if (invalid.length > 0) {
      throw new Error(`双向删除只适用于纯卡片链接，请取消选择 #${invalid.join(", #")}`);
    }
    const reverseTargets = [];
    sorted.forEach((index) => {
      const comment = note.comments && note.comments[index];
      const link = __MN_COMMENT_DATA__.extractPureMarginNoteLink(comment && comment.text);
      if (!link) return;
      const targetNote = __MN_COMMENT_DATA__.getWrappedNoteById(link.noteId);
      if (!targetNote || !Array.isArray(targetNote.comments)) return;
      const reverseIndices = [];
      targetNote.comments.forEach((targetComment, targetIndex) => {
        const reverseLink = __MN_COMMENT_DATA__.extractPureMarginNoteLink(targetComment && targetComment.text);
        if (reverseLink && reverseLink.noteId === sourceId) reverseIndices.push(targetIndex);
      });
      if (reverseIndices.length > 0) reverseTargets.push({ targetNote, reverseIndices });
    });

    withUndoGrouping("删除双向链接评论", { note }, () => {
      sorted.forEach((index) => removeSingleComment(note, index));
      reverseTargets.forEach((item) => {
        normalizeIndexArray(item.reverseIndices).sort((a, b) => b - a)
          .forEach((index) => removeSingleComment(item.targetNote, index));
        refreshNote(item.targetNote);
      });
      refreshNote(note);
    });

    const reverseCount = reverseTargets.reduce((sum, item) => sum + item.reverseIndices.length, 0);
    MNUtil.showHUD(`已删除 ${sorted.length} 条链接评论，并清理 ${reverseCount} 条反向链接`);
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function mergeTextComments(noteId, indices, text, markdown) {
    const note = getNoteOrThrow(noteId);
    let selectedIndices = [];
    withUndoGrouping("合并评论", { note }, () => {
      selectedIndices = mergeTextCommentIndices(note, indices, text, markdown);
      refreshNote(note);
    });

    MNUtil.showHUD(`已合并 ${normalizeIndexArray(indices).length} 条评论`);
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    snapshot.selectedIndices = selectedIndices;
    return snapshot;
  }

  function editCommentText(noteId, index, text, markdown) {
    const note = getNoteOrThrow(noteId);
    const commentIndex = parseInt(index, 10);
    if (!Number.isFinite(commentIndex) || commentIndex < 0) throw new Error("评论位置无效，请刷新后再试");

    withUndoGrouping("编辑评论", { note }, () => {
      replaceCommentText(note, commentIndex, text, !!markdown);
      refreshNote(note);
    });

    MNUtil.showHUD("评论已更新");
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function editMarkdownLink(noteId, commentIndex, linkIndex, displayText, url) {
    const note = getNoteOrThrow(noteId);
    const parsedCommentIndex = parseInt(commentIndex, 10);
    const parsedLinkIndex = parseInt(linkIndex, 10);
    if (!Number.isFinite(parsedCommentIndex) || parsedCommentIndex < 0) {
      throw new Error("评论位置无效，请刷新后再试");
    }
    if (!Number.isFinite(parsedLinkIndex) || parsedLinkIndex < 0) {
      throw new Error("链接位置无效，请刷新后再试");
    }

    const serialized = getSerializedComment(note, parsedCommentIndex);
    requireCapability(serialized, "canEditText", `#${parsedCommentIndex} 不是可编辑的文本评论`);
    requireCapability(serialized, "hasMarkdownLinks", `#${parsedCommentIndex} 没有行内链接`);

    const links = Array.isArray(serialized.markdownLinks) ? serialized.markdownLinks : [];
    const targetLink = links[parsedLinkIndex];
    if (!targetLink) throw new Error("没有找到这个行内链接，请刷新后再试");

    const nextDisplayText = String(displayText || "").trim();
    const nextUrl = String(url || "").trim();
    if (!nextDisplayText) throw new Error("请输入链接文本");
    if (!nextUrl) throw new Error("请输入链接地址");
    if (nextDisplayText === targetLink.displayText && nextUrl === targetLink.url) {
      throw new Error("链接未修改");
    }

    const originalText = String(serialized.text || "");
    const nextLinkMarkdown = `[${escapeMarkdownLinkText(nextDisplayText)}](${escapeMarkdownLinkUrl(nextUrl)})`;
    const nextText = originalText.slice(0, targetLink.startIndex) +
      nextLinkMarkdown +
      originalText.slice(targetLink.endIndex);

    withUndoGrouping("编辑行内链接", { note }, () => {
      replaceCommentText(note, parsedCommentIndex, nextText, true);
      refreshNote(note);
    });

    MNUtil.showHUD("行内链接已更新");
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function convertHtmlCommentsToMarkdown(noteId, indices) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices);
    if (sorted.length === 0) throw new Error("先选择要转换的 HTML 评论");

    const serializedComments = getSerializedComments(note);
    const htmlIndices = sorted.filter((index) => {
      const serialized = serializedComments.find((item) => item.index === index);
      return serialized && serialized.capabilities && serialized.capabilities.isHtml;
    });
    if (htmlIndices.length === 0) throw new Error("所选评论中没有 HTML 评论");

    const stats = {
      total: 1,
      changed: 0,
      convertedComments: 0,
      skippedNonHtml: sorted.length - htmlIndices.length,
      skippedEmpty: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("转换 HTML 评论", { note }, () => {
      convertHtmlCommentIndicesInNote(note, htmlIndices, stats);
      if (stats.convertedComments > 0) {
        stats.changed = 1;
        refreshNote(note);
      }
    });

    MNUtil.showHUD(`已转换 ${stats.convertedComments} 条 HTML 评论`);
    return {
      stats,
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(note),
    };
  }

  function extractContentSelectionToChildNote(noteId, selection, title, removeOriginal) {
    const sourceNote = getNoteOrThrow(noteId);
    const sourceSnapshot = __MN_COMMENT_DATA__.getNoteSnapshot(sourceNote);
    const normalizedSelection = normalizeContentSelection(selection, sourceSnapshot.comments.length);
    const excerpt = sourceSnapshot.excerpt || __MN_COMMENT_DATA__.getExcerptState(sourceNote);
    if (normalizedSelection.excerptSelected) {
      if (!excerpt.present) throw new Error("当前卡片已没有原生摘录，请刷新后重试");
      if (!excerpt.capabilities.canExtract) throw new Error("当前原生摘录暂不支持提取为子卡片");
    }
    normalizedSelection.commentIndices.forEach((index) => requireComment(sourceNote, index));
    const childTitle = String(title || "").trim();
    let child = null;
    let finalSourceNote = sourceNote;
    let converted = false;
    let mappedIndices = normalizedSelection.commentIndices;
    let partialError = "";

    if (removeOriginal === true && normalizedSelection.excerptSelected) {
      const conversionState = getNoExcerptConversionState(sourceNote, true);
      if (!conversionState.eligible) throw new Error(getConversionErrorMessage(conversionState.reason));
    }

    withUndoGrouping("提取内容为子卡片", { note: sourceNote }, () => {
      child = cloneSelectionToChild(sourceNote, normalizedSelection, childTitle);
      refreshNote(child);
      if (removeOriginal === true) {
        if (normalizedSelection.excerptSelected) {
          const conversion = convertNoteToNoExcerpt(sourceNote, { allowTextExcerpt: true });
          if (!conversion.changed || !conversion.note) {
            throw new Error(getConversionErrorMessage(conversion.reason));
          }
          converted = true;
          finalSourceNote = conversion.note;
          try {
            mappedIndices = validateConvertedCommentMapping(
              sourceSnapshot,
              finalSourceNote,
              getNoteId(sourceNote),
              normalizedSelection,
            );
            removeCommentIndices(finalSourceNote, mappedIndices);
          } catch (error) {
            partialError = error && error.message ? error.message : String(error);
          }
        } else {
          removeCommentIndices(sourceNote, normalizedSelection.commentIndices);
        }
      }
      refreshNote(finalSourceNote);
    });

    if (child && child.noteId) {
      MNUtil.focusNoteInMindMapById(child.noteId, 0.2);
    }
    const selectedCount = normalizedSelection.commentIndices.length + (normalizedSelection.excerptSelected ? 1 : 0);
    const statusMessage = partialError
      ? `子卡片已创建，源卡片也已转为非摘录版，但删除已停止：${partialError}`
      : (removeOriginal === true
        ? `已用 ${selectedCount} 项内容创建子卡片，并删除源内容`
        : `已用 ${selectedCount} 项内容创建子卡片`);
    MNUtil.showHUD(statusMessage);
    return {
      createdNoteId: child && child.noteId ? child.noteId : "",
      createdNoteTitle: child && child.noteTitle ? child.noteTitle : childTitle,
      sourceNoteId: getNoteId(sourceNote),
      noteId: getNoteId(finalSourceNote),
      converted,
      actionCompleted: !partialError,
      mappedIndices: partialError ? [] : normalizeIndexArray(mappedIndices),
      selectedIndices: [],
      statusMessage,
      error: partialError,
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(finalSourceNote),
    };
  }

  function extractCommentsToChildNote(noteId, indices, title, removeOriginal) {
    return extractContentSelectionToChildNote(noteId, {
      excerptSelected: false,
      commentIndices: indices,
    }, title, removeOriginal);
  }

  function copyText(text) {
    MNUtil.copy(String(text || ""));
    return true;
  }

  function copyContentText(noteId, selection) {
    const note = getNoteOrThrow(noteId);
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    const normalizedSelection = normalizeContentSelection(selection, snapshot.comments.length);
    const parts = [];
    let skippedCount = 0;

    if (normalizedSelection.excerptSelected) {
      const excerpt = snapshot.excerpt || {};
      if (!excerpt.present) throw new Error("当前卡片已没有原生摘录，请刷新后重试");
      if (excerpt.present && excerpt.capabilities && excerpt.capabilities.canCopyText && String(excerpt.text || "").trim()) {
        parts.push(String(excerpt.text));
      } else {
        skippedCount += 1;
      }
    }
    normalizedSelection.commentIndices.forEach((index) => {
      const comment = snapshot.comments.find((item) => item.index === index);
      if (comment && comment.capabilities && comment.capabilities.canCopyText && String(comment.text || comment.htmlText || "").trim()) {
        parts.push(String(comment.text || comment.htmlText));
      } else {
        skippedCount += 1;
      }
    });
    if (parts.length === 0) throw new Error("所选内容没有可复制的文本");

    MNUtil.copy(parts.join("\n\n"));
    const statusMessage = skippedCount > 0
      ? `已复制 ${parts.length} 项文本，跳过 ${skippedCount} 项无文本内容`
      : `已复制 ${parts.length} 项文本`;
    MNUtil.showHUD(statusMessage);
    return { copiedCount: parts.length, skippedCount, statusMessage };
  }

  function copyCommentImage(noteId, index) {
    const note = getNoteOrThrow(noteId);
    const commentIndex = parseInt(index, 10);
    if (!Number.isFinite(commentIndex) || commentIndex < 0) throw new Error("评论位置无效，请刷新后再试");
    const serialized = getSerializedComment(note, commentIndex);
    requireCapability(serialized, "canCopyImage", `#${commentIndex} 没有可复制的图片`);
    const rawComment = requireComment(note, commentIndex);
    const imageHash = serialized.imageHash ||
      (rawComment && rawComment.paint) ||
      (rawComment && rawComment.q_hpic && rawComment.q_hpic.paint);
    const imageData = imageHash ? MNUtil.getMediaByHash(imageHash) : null;
    if (!imageData) throw new Error("没有读取到图片数据，请刷新后再试");
    MNUtil.copyImage(imageData);
    MNUtil.showHUD("图片已复制");
    return true;
  }

  function copyContentImage(noteId, selection) {
    const note = getNoteOrThrow(noteId);
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    const normalizedSelection = normalizeContentSelection(selection, snapshot.comments.length);
    const selectedCount = normalizedSelection.commentIndices.length + (normalizedSelection.excerptSelected ? 1 : 0);
    if (selectedCount !== 1) throw new Error("复制图片时只能选择 1 项图片内容");

    if (!normalizedSelection.excerptSelected) {
      copyCommentImage(noteId, normalizedSelection.commentIndices[0]);
      return { copiedExcerpt: false, statusMessage: "图片已复制" };
    }
    const excerpt = snapshot.excerpt || {};
    if (!excerpt.present || excerpt.type !== "image" || !excerpt.capabilities || !excerpt.capabilities.canCopyImage) {
      throw new Error("所选原生摘录不是可复制的图片摘录");
    }
    const imageData = __MN_COMMENT_DATA__.getExcerptMediaData(note, "image");
    if (!imageData) throw new Error("没有读取到摘录图片数据，请刷新后再试");
    MNUtil.copyImage(imageData);
    MNUtil.showHUD("摘录图片已复制");
    return { copiedExcerpt: true, statusMessage: "摘录图片已复制" };
  }

  function getStudyController(window) {
    try {
      const app = Application.sharedInstance();
      return app && typeof app.studyController === "function"
        ? app.studyController(window)
        : null;
    } catch (error) {
      return null;
    }
  }

  function focusLinkedNote(noteId, mode, window) {
    if (!noteId) throw new Error("没有找到目标卡片");
    const studyController = getStudyController(window);
    if (mode === "float") {
      if (studyController && typeof studyController.focusNoteInFloatMindMapById === "function") {
        studyController.focusNoteInFloatMindMapById(String(noteId));
      } else {
        MNUtil.focusNoteInFloatMindMapById(String(noteId), 0.2);
      }
    } else {
      if (!studyController || typeof studyController.focusNoteInMindMapById !== "function") {
        throw new Error("当前窗口无法执行 Focus in Mind Map");
      }
      studyController.focusNoteInMindMapById(String(noteId));
    }
    return true;
  }

  function appendNoteLink(note, targetNote) {
    if (note && typeof note.appendNoteLink === "function") {
      note.appendNoteLink(targetNote);
      return;
    }
    const rawNote = getRawNote(note);
    const rawTarget = getRawNote(targetNote);
    if (rawNote && typeof rawNote.appendNoteLink === "function") {
      rawNote.appendNoteLink(rawTarget);
      return;
    }
    throw new Error("当前版本无法新增卡片链接，请更新 MarginNote 后再试");
  }

  function getReverseLinkIndices(note, sourceNoteId) {
    const sourceId = String(sourceNoteId || "").toUpperCase();
    if (!note || !sourceId || !Array.isArray(note.comments)) return [];
    const indices = [];
    note.comments.forEach((comment, index) => {
      const link = __MN_COMMENT_DATA__.extractPureMarginNoteLink(comment && comment.text);
      if (link && link.noteId === sourceId) indices.push(index);
    });
    return indices;
  }

  function updateLinkCommentFromClipboard(noteId, index) {
    const note = getNoteOrThrow(noteId);
    const commentIndex = parseInt(index, 10);
    if (!Number.isFinite(commentIndex) || commentIndex < 0) {
      throw new Error("评论位置无效，请刷新后再试");
    }

    const serialized = getSerializedComment(note, commentIndex);
    requireCapability(serialized, "canUpdateLink", `#${commentIndex} 不是可更新的卡片链接`);
    const clipboardUrl = String(MNUtil.clipboardText || "").trim();
    const nextLink = __MN_COMMENT_DATA__.extractPureMarginNoteLink(clipboardUrl);
    if (!nextLink) throw new Error("剪贴板中没有有效的 MarginNote 卡片链接");
    if (String(serialized.linkedNoteId || "") === nextLink.noteId) throw new Error("链接未修改");

    const rawComment = requireComment(note, commentIndex);
    const oldTarget = __MN_COMMENT_DATA__.getWrappedNoteById(serialized.linkedNoteId);
    const newTarget = __MN_COMMENT_DATA__.getWrappedNoteById(nextLink.noteId);
    if (!newTarget) throw new Error("剪贴板链接对应的卡片不存在");

    const reverseIndices = serialized.type === "linkComment"
      ? getReverseLinkIndices(oldTarget, noteId)
      : [];
    const shouldPreserveReverseLink = reverseIndices.length > 0;

    withUndoGrouping("更新链接", { notes: [note, oldTarget, newTarget].filter(Boolean) }, () => {
      rawComment.text = clipboardUrl;
      if (shouldPreserveReverseLink) {
        removeCommentsByIndices(oldTarget, reverseIndices);
        if (getReverseLinkIndices(newTarget, noteId).length === 0) appendNoteLink(newTarget, note);
        refreshNote(oldTarget);
        refreshNote(newTarget);
      }
      refreshNote(note);
    });

    MNUtil.showHUD(shouldPreserveReverseLink ? "链接及反向链接已更新" : "链接已更新");
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function keepFirstContentForNotes(notes, options) {
    const sourceNotes = Array.isArray(notes) ? notes : [];
    const seen = new Set();
    const targetNotes = [];

    sourceNotes.forEach((candidate) => {
      if (!candidate || !candidate.noteId) return;
      const noteId = String(candidate.noteId || "").trim();
      if (!noteId || seen.has(noteId)) return;
      seen.add(noteId);
      targetNotes.push(candidate);
    });

    if (targetNotes.length < ((options && options.allowSingle === true) ? 1 : 2)) throw new Error("请先选择卡片");

    const stats = {
      total: targetNotes.length,
      changed: 0,
      excerptCleared: 0,
      keptFirst: 0,
      noComment: 0,
      removedComments: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("批量保留第一条内容", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const commentCount = getCommentCount(note);
          if (commentCount <= 0) {
            stats.noComment += 1;
            return;
          }

          const indices = noteHasExcerpt(note)
            ? Array.from({ length: commentCount }, (_, index) => index)
            : Array.from({ length: Math.max(0, commentCount - 1) }, (_, index) => index + 1);

          if (indices.length <= 0) {
            stats.noComment += 1;
            return;
          }

          removeCommentsByIndices(note, indices);
          refreshNote(note);
          stats.changed += 1;
          stats.removedComments += indices.length;
          if (noteHasExcerpt(note)) stats.excerptCleared += 1;
          else stats.keptFirst += 1;
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: String(note && note.noteId || ""),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    MNUtil.showHUD(`已处理 ${stats.changed}/${stats.total} 张卡片，删除 ${stats.removedComments} 条评论`);
    return stats;
  }

  function normalizeNoteArray(notes, options) {
    const sourceNotes = Array.isArray(notes) ? notes : [];
    const seen = new Set();
    const targetNotes = [];

    sourceNotes.forEach((candidate) => {
      if (!candidate || !candidate.noteId) return;
      const noteId = String(candidate.noteId || "").trim();
      if (!noteId || seen.has(noteId)) return;
      seen.add(noteId);
      targetNotes.push(candidate);
    });

    if (targetNotes.length < ((options && options.allowSingle === true) ? 1 : 2)) throw new Error("请先选择卡片");
    return targetNotes;
  }

  function clearAllCommentsForNotes(notes, options) {
    const targetNotes = normalizeNoteArray(notes, options);
    const stats = {
      total: targetNotes.length,
      changed: 0,
      noComment: 0,
      removedComments: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("批量清空评论", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const commentCount = getCommentCount(note);
          if (commentCount <= 0) {
            stats.noComment += 1;
            return;
          }

          removeCommentsByIndices(note, Array.from({ length: commentCount }, (_, index) => index));
          refreshNote(note);
          stats.changed += 1;
          stats.removedComments += commentCount;
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: String(note && note.noteId || ""),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    MNUtil.showHUD(`已清空 ${stats.changed}/${stats.total} 张卡片的评论，删除 ${stats.removedComments} 条`);
    return stats;
  }

  function clearAllTitlesForNotes(notes, options) {
    const targetNotes = normalizeNoteArray(notes, options);
    const stats = {
      total: targetNotes.length,
      changed: 0,
      blankTitle: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("批量清空标题", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const currentTitle = String(note.noteTitle || "").trim();
          if (!currentTitle) {
            stats.blankTitle += 1;
            return;
          }

          note.noteTitle = "";
          refreshNote(note);
          stats.changed += 1;
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: String(note && note.noteId || ""),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    MNUtil.showHUD(`已清空 ${stats.changed}/${stats.total} 张卡片的标题`);
    return stats;
  }

  function convertHtmlCommentsToMarkdownForNotes(notes, options) {
    const targetNotes = normalizeNoteArray(notes, options);
    const stats = {
      total: targetNotes.length,
      changed: 0,
      noHtmlComment: 0,
      convertedComments: 0,
      skippedEmpty: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("批量转换 HTML 评论", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const htmlIndices = getHtmlCommentIndices(note);
          if (htmlIndices.length <= 0) {
            stats.noHtmlComment += 1;
            return;
          }
          const before = stats.convertedComments;
          convertHtmlCommentIndicesInNote(note, htmlIndices, stats);
          if (stats.convertedComments > before) {
            stats.changed += 1;
            refreshNote(note);
          }
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: String(note && note.noteId || ""),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    MNUtil.showHUD(`已转换 ${stats.changed}/${stats.total} 张卡片的 ${stats.convertedComments} 条 HTML 评论`);
    return stats;
  }

  function removeAllLinkCommentsForNotes(notes, options) {
    const targetNotes = normalizeNoteArray(notes, options);
    const stats = {
      total: targetNotes.length,
      changed: 0,
      noLinkComment: 0,
      removedLinks: 0,
      failed: 0,
      errors: [],
    };

    withUndoGrouping("批量去掉所有链接", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const linkIndices = getPureLinkCommentIndices(note);
          if (linkIndices.length <= 0) {
            stats.noLinkComment += 1;
            return;
          }

          removeCommentsByIndices(note, linkIndices);
          refreshNote(note);
          stats.changed += 1;
          stats.removedLinks += linkIndices.length;
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: String(note && note.noteId || ""),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    MNUtil.showHUD(`已处理 ${stats.changed}/${stats.total} 张卡片，去掉 ${stats.removedLinks} 条链接`);
    return stats;
  }

  function convertNotesToNoExcerptForNotes(notes, options) {
    const targetNotes = normalizeNoteArray(notes, options);
    const stats = {
      total: targetNotes.length,
      changed: 0,
      imageExcerpt: 0,
      textExcerpt: 0,
      noExcerpt: 0,
      noParent: 0,
      unsupportedMedia: 0,
      failed: 0,
      convertedNoteIds: [],
      errors: [],
    };

    withUndoGrouping("批量转为非摘录版", { notes: targetNotes }, () => {
      targetNotes.forEach((note) => {
        try {
          const result = convertNoteToNoExcerpt(note, { allowTextExcerpt: true });
          if (!result.changed) {
            if (result.reason === "noParent") stats.noParent += 1;
            else if (result.reason === "unsupportedMedia") stats.unsupportedMedia += 1;
            else stats.noExcerpt += 1;
            return;
          }
          stats.changed += 1;
          if (result.reason === "image") stats.imageExcerpt += 1;
          else if (result.reason === "text") stats.textExcerpt += 1;
          const convertedNoteId = getNoteId(result.note);
          if (convertedNoteId) stats.convertedNoteIds.push(convertedNoteId);
        } catch (error) {
          stats.failed += 1;
          stats.errors.push({
            noteId: getNoteId(note),
            message: error && error.message ? error.message : String(error),
          });
        }
      });
    });

    if (stats.failed > 0) {
      MNUtil.showHUD(`转为非摘录版失败 ${stats.failed} 张，已完成 ${stats.changed}/${stats.total} 张`);
    }
    return stats;
  }

  return {
    moveComments,
    moveContentSelection,
    deleteComments,
    deleteContentSelection,
    countReverseLinks,
    deleteBidirectionalLinks,
    mergeTextComments,
    mergeContentSelection,
    editCommentText,
    editMarkdownLink,
    convertHtmlCommentsToMarkdown,
    extractCommentsToChildNote,
    extractContentSelectionToChildNote,
    copyText,
    copyContentText,
    copyCommentImage,
    copyContentImage,
    focusLinkedNote,
    updateLinkCommentFromClipboard,
    keepFirstContentForNotes,
    clearAllCommentsForNotes,
    clearAllTitlesForNotes,
    convertHtmlCommentsToMarkdownForNotes,
    removeAllLinkCommentsForNotes,
    getNoExcerptConversionState,
    convertNotesToNoExcerptForNotes,
  };
})();
