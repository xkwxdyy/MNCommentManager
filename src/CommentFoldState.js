var __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon = (function () {
  function failure(code, message, details) {
    const error = new Error(message);
    error.code = code;
    if (details !== undefined) error.details = details;
    return error;
  }

  function requireReceipt(result, noteId) {
    if (!result || result.ok !== true) {
      const detail = result && result.error;
      throw failure(detail && detail.code || "COMMENT_STATE_UNSUPPORTED", detail && detail.message || "未读取到有效的评论折叠状态", detail && detail.details);
    }
    // Index targets do not consume ownerNoteId/commentId. Historical comments may
    // omit their stable ID; do not disable the whole card for unused metadata.
    const invalid = (field, actual) => {
      throw failure("COMMENT_STATE_UNSUPPORTED", "评论折叠状态返回不完整：" + field,
        { field: field, actualType: actual === null ? "null" : typeof actual });
    };
    if (typeof result.noteid !== "string" || !result.noteid || (noteId && result.noteid !== noteId)) invalid("noteid", result.noteid);
    if (typeof result.revision !== "string" || !result.revision) invalid("revision", result.revision);
    if (!Array.isArray(result.comments)) invalid("comments", result.comments);
    result.comments.forEach((comment, index) => {
      if (!comment || typeof comment !== "object") invalid("comments[" + index + "]", comment);
      if (comment.index !== index + 1) invalid("comments[" + index + "].index", comment.index);
      if (typeof comment.collapsed !== "boolean") invalid("comments[" + index + "].collapsed", comment.collapsed);
    });
    return result;
  }

  function read(note) {
    const rawNote = note && note.note || note;
    try {
      if (!rawNote || typeof rawNote.commentState !== "function" || typeof rawNote.setCommentsCollapsed !== "function") {
        throw failure("COMMENT_STATE_UNSUPPORTED", "当前版本暂不支持折叠或展开评论");
      }
      const state = requireReceipt(rawNote.commentState(), note.noteId || rawNote.noteId);
      return { supported: true, revision: state.revision, comments: state.comments };
    } catch (error) {
      return { supported: false, revision: "", comments: [], code: error.code || "COMMENT_STATE_UNSUPPORTED", error: error.message || String(error), details: error.details };
    }
  }

  function setCollapsed(note, indices, collapsed, expectedRevision) {
    if (!Array.isArray(indices) || indices.length < 1 || indices.length > 200 ||
      indices.some((index) => !Number.isSafeInteger(index) || index < 0) || new Set(indices).size !== indices.length ||
      typeof collapsed !== "boolean" || typeof expectedRevision !== "string" || !expectedRevision) {
      throw failure("INVALID_INPUT", "单次请选择 1 至 200 条评论，并提供有效的折叠状态和版本");
    }
    const state = read(note);
    if (!state.supported) throw failure(state.code, state.error, state.details);
    if (state.revision !== expectedRevision) throw failure("COMMENT_CHANGED", "评论内容已变化，请刷新后重新选择");
    if (indices.some((index) => index >= state.comments.length)) throw failure("INVALID_INPUT", "评论位置超出范围，请刷新后重新选择");
    const rawNote = note && note.note || note;
    try {
      // The panel uses zero-based indices; the host projection uses one-based indices.
      const result = requireReceipt(rawNote.setCommentsCollapsed(indices.map((index) => ({ index: index + 1 })), collapsed, expectedRevision), note.noteId || rawNote.noteId);
      if (result.persisted !== true || result.collapsed !== collapsed || result.requestedCount !== indices.length ||
        !Number.isSafeInteger(result.changedCount) || result.changedCount < 0 || result.changedCount > indices.length ||
        !Array.isArray(result.affectedOwnerNoteIds) || result.affectedOwnerNoteIds.some((id) => typeof id !== "string" || !id) ||
        result.comments.length !== state.comments.length || indices.some((index) => result.comments[index].collapsed !== collapsed)) {
        throw failure("COMMENT_NOT_PERSISTED", "未能确认评论折叠状态已保存，请刷新后检查");
      }
      return result;
    } catch (error) {
      // The host owns rollback; re-read without retrying a write with the old revision.
      read(note);
      throw error;
    }
  }

  return { read, setCollapsed };
})();
