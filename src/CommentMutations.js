var __MN_COMMENT_MUTATIONS__ = (function () {
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

  function noteHasExcerpt(note) {
    try {
      if (!note) return false;
      if (String(note.excerptText || "").trim()) return true;
      if (note.excerptPic) return true;
      if (note.note) {
        if (String(note.note.excerptText || "").trim()) return true;
        if (note.note.excerptPic) return true;
      }
    } catch (error) {
      return false;
    }
    return false;
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

  function replaceCommentText(note, index, text, markdown) {
    const rawComment = requireComment(note, index);
    const serialized = getSerializedComment(note, index);
    requireCapability(serialized, "canEditText", `#${index} 不是可编辑的文本评论`);

    if (rawComment && "text" in rawComment) {
      rawComment.text = String(text || "");
      return;
    }
    if (rawComment && "q_htext" in rawComment) {
      rawComment.q_htext = String(text || "");
      if (rawComment.noteid) {
        const mergedNote = __MN_COMMENT_DATA__.getWrappedNoteById(rawComment.noteid);
        if (mergedNote) mergedNote.excerptText = String(text || "");
      }
      return;
    }

    removeSingleComment(note, index);
    if (markdown) appendMarkdownComment(note, text);
    else appendTextComment(note, text);
    moveSingleComment(note, getCommentCount(note) - 1, index);
  }

  function moveComments(noteId, indices, targetIndex) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices);
    if (sorted.length === 0) throw new Error("先选择要移动的评论");

    const count = getCommentCount(note);
    let target = parseInt(targetIndex, 10);
    if (!Number.isFinite(target)) target = count;
    target = Math.max(0, Math.min(count, target));

    if (sorted.indexOf(target) >= 0) {
      throw new Error("不能把评论移动到所选范围内部");
    }

    MNUtil.undoGrouping(() => {
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      if (target < min) {
        sorted.forEach((index, offset) => moveSingleComment(note, index, target + offset));
      } else if (target > max) {
        for (let i = sorted.length - 1; i >= 0; i--) {
          moveSingleComment(note, sorted[i], target - (sorted.length - i));
        }
      }
      refreshNote(note);
    });

    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function deleteComments(noteId, indices) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices).sort((a, b) => b - a);
    if (sorted.length === 0) throw new Error("先选择要删除的评论");

    MNUtil.undoGrouping(() => {
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

    MNUtil.undoGrouping(() => {
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
    const sorted = normalizeIndexArray(indices);
    const finalText = String(text || "").trim();
    if (sorted.length < 2) throw new Error("至少选择 2 条评论才能合并");
    if (!finalText) throw new Error("请填写合并后的内容");
    const serializedComments = getSerializedComments(note);
    sorted.forEach((index) => {
      const comment = serializedComments.find((item) => item.index === index);
      requireCapability(comment, "canMergeText", `#${index} 不是可合并的文本评论`);
      requireCapability(comment, "canCopyText", `#${index} 没有可合并的文本`);
    });

    MNUtil.undoGrouping(() => {
      if (markdown) appendMarkdownComment(note, finalText);
      else appendTextComment(note, finalText);
      const insertedIndex = getCommentCount(note) - 1;
      const firstIndex = sorted[0];
      moveSingleComment(note, insertedIndex, firstIndex);
      sorted.sort((a, b) => b - a).forEach((index) => removeSingleComment(note, index + 1));
      refreshNote(note);
    });

    MNUtil.showHUD(`已合并 ${sorted.length} 条评论`);
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function editCommentText(noteId, index, text, markdown) {
    const note = getNoteOrThrow(noteId);
    const commentIndex = parseInt(index, 10);
    if (!Number.isFinite(commentIndex) || commentIndex < 0) throw new Error("评论位置无效，请刷新后再试");

    MNUtil.undoGrouping(() => {
      replaceCommentText(note, commentIndex, text, !!markdown);
      refreshNote(note);
    });

    MNUtil.showHUD("评论已更新");
    return __MN_COMMENT_DATA__.getNoteSnapshot(note);
  }

  function extractCommentsToChildNote(noteId, indices, title, removeOriginal) {
    const note = getNoteOrThrow(noteId);
    const sorted = normalizeIndexArray(indices);
    if (sorted.length === 0) throw new Error("先选择要提取的评论");
    const childTitle = String(title || "").trim() || `提取自 ${note.noteTitle || "当前卡片"}`;
    let child = null;

    sorted.forEach((index) => requireComment(note, index));

    MNUtil.undoGrouping(() => {
      child = cloneNoteOrThrow(note);
      child.title = childTitle;
      removeClonedChildren(child);
      removeCommentsByIndices(child, getInverseCommentIndices(child, sorted));
      note.addChild(child);
      refreshNote(child);
      if (removeOriginal === true) {
        removeCommentsByIndices(note, sorted);
      }
      refreshNote(note);
    });

    if (child && child.noteId) {
      MNUtil.focusNoteInMindMapById(child.noteId, 0.2);
    }
    MNUtil.showHUD(removeOriginal === true
      ? `已用 ${sorted.length} 条评论创建子卡片，并删除原评论`
      : `已用 ${sorted.length} 条评论创建子卡片`);
    return {
      createdNoteId: child && child.noteId ? child.noteId : "",
      createdNoteTitle: child && child.noteTitle ? child.noteTitle : childTitle,
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(note),
    };
  }

  function copyText(text) {
    MNUtil.copy(String(text || ""));
    return true;
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

  function focusLinkedNote(noteId, mode) {
    if (!noteId) throw new Error("没有找到目标卡片");
    if (mode === "float") {
      MNUtil.focusNoteInFloatMindMapById(String(noteId), 0.2);
    } else {
      MNUtil.focusNoteInMindMapById(String(noteId), 0.2);
    }
    return true;
  }

  function keepFirstContentForNotes(notes) {
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

    if (targetNotes.length <= 1) throw new Error("请先多选至少 2 张卡片");

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

    MNUtil.undoGrouping(() => {
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

  return {
    moveComments,
    deleteComments,
    countReverseLinks,
    deleteBidirectionalLinks,
    mergeTextComments,
    editCommentText,
    extractCommentsToChildNote,
    copyText,
    copyCommentImage,
    focusLinkedNote,
    keepFirstContentForNotes,
  };
})();
