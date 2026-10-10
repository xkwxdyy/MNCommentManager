var __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon = (function () {
  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function requireReceipt(result) {
    if (!result || result.ok !== true) {
      const detail = result && result.error;
      throw failure(detail && detail.code || "COMMENT_STATE_UNSUPPORTED", detail && detail.message || "未读取到有效的批注折叠状态");
    }
    if (typeof result.revision !== "string" || !result.revision || !Array.isArray(result.comments) ||
      result.comments.some((comment, index) => !comment || comment.index !== index + 1 || typeof comment.collapsed !== "boolean")) {
      throw failure("COMMENT_STATE_UNSUPPORTED", "批注折叠接口返回的状态不完整");
    }
    return result;
  }

  function read(note) {
    const rawNote = note && note.note || note;
    try {
      if (!rawNote || typeof rawNote.commentState !== "function" || typeof rawNote.setCommentsCollapsed !== "function") {
        throw failure("COMMENT_STATE_UNSUPPORTED", "当前宿主未提供批注折叠接口");
      }
      const state = requireReceipt(rawNote.commentState());
      return { supported: true, revision: state.revision, comments: state.comments };
    } catch (error) {
      return { supported: false, revision: "", comments: [], code: error.code || "COMMENT_STATE_UNSUPPORTED", error: error.message || String(error) };
    }
  }

  function setCollapsed(note, indices, collapsed, expectedRevision) {
    if (!Array.isArray(indices) || indices.length < 1 || indices.length > 200 ||
      indices.some((index) => !Number.isSafeInteger(index) || index < 0) || new Set(indices).size !== indices.length ||
      typeof collapsed !== "boolean" || typeof expectedRevision !== "string" || !expectedRevision) {
      throw failure("INVALID_INPUT", "每次操作须选择 1 至 200 条批注，并提供有效的折叠状态和版本");
    }
    const state = read(note);
    if (!state.supported) throw failure(state.code, state.error);
    if (state.revision !== expectedRevision) throw failure("COMMENT_CHANGED", "批注已发生变化，请刷新后重新选择");
    if (indices.some((index) => index >= state.comments.length)) throw failure("INVALID_INPUT", "批注索引超出范围，请刷新后重新选择");
    const rawNote = note && note.note || note;
    try {
      // The panel uses zero-based indices; the host projection uses one-based indices.
      const result = requireReceipt(rawNote.setCommentsCollapsed(indices.map((index) => ({ index: index + 1 })), collapsed, expectedRevision));
      if (result.persisted !== true || !Number.isSafeInteger(result.changedCount) || result.changedCount < 0 || result.changedCount > indices.length) {
        throw failure("COMMENT_NOT_PERSISTED", "宿主未确认批注折叠状态已保存，请刷新后检查");
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
