var __MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon = (function () {
  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function ping(context, payload) {
    return {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    };
  }

  function echo(context, payload) {
    return {
      echoed: toBridgePayload(payload),
    };
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return {
      closed: true,
      payload: toBridgePayload(payload),
    };
  }

  function getCurrentNoteComments() {
    return __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function refreshCurrentNote() {
    return __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function moveComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.moveComments(payload.noteId, payload.indices, payload.targetIndex);
  }

  function deleteComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteComments(payload.noteId, payload.indices);
  }

  function countReverseLinks(context, payload) {
    return {
      reverseCount: __MN_COMMENT_MUTATIONS__.countReverseLinks(payload.noteId, payload.indices),
    };
  }

  function deleteBidirectionalLinks(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteBidirectionalLinks(payload.noteId, payload.indices);
  }

  function mergeTextComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.mergeTextComments(
      payload.noteId,
      payload.indices,
      payload.text,
      payload.markdown !== false,
    );
  }

  function editCommentText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.editCommentText(
      payload.noteId,
      payload.index,
      payload.text,
      payload.markdown === true,
    );
  }

  function extractCommentsToChildNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.extractCommentsToChildNote(
      payload.noteId,
      payload.indices,
      payload.title,
    );
  }

  function copyText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyText(payload.text);
  }

  function copyCommentImage(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyCommentImage(payload.noteId, payload.index);
  }

  function focusLinkedNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.focusLinkedNote(payload.noteId);
  }

  const commands = {
    ping,
    echo,
    closePanel,
    getCurrentNoteComments,
    refreshCurrentNote,
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
  };

  return {
    commands,
  };
})();
