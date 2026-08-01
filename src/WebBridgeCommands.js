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

  function moveContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.moveContentSelection(
      payload.noteId,
      payload.selection,
      payload.targetIndex,
    );
  }

  function deleteComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteComments(payload.noteId, payload.indices);
  }

  function deleteContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteContentSelection(payload.noteId, payload.selection);
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

  function mergeContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.mergeContentSelection(
      payload.noteId,
      payload.selection,
      payload.text,
      payload.markdown !== false,
      payload.mode,
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

  function editMarkdownLink(context, payload) {
    return __MN_COMMENT_MUTATIONS__.editMarkdownLink(
      payload.noteId,
      payload.commentIndex,
      payload.linkIndex,
      payload.displayText,
      payload.url,
    );
  }

  function convertHtmlCommentsToMarkdown(context, payload) {
    return __MN_COMMENT_MUTATIONS__.convertHtmlCommentsToMarkdown(
      payload.noteId,
      payload.indices,
    );
  }

  function extractCommentsToChildNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.extractCommentsToChildNote(
      payload.noteId,
      payload.indices,
      payload.title,
      payload.removeOriginal === true,
    );
  }

  function extractContentSelectionToChildNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.extractContentSelectionToChildNote(
      payload.noteId,
      payload.selection,
      payload.title,
      payload.removeOriginal === true,
    );
  }

  function copyText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyText(payload.text);
  }

  function copyContentText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyContentText(payload.noteId, payload.selection);
  }

  function copyCommentImage(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyCommentImage(payload.noteId, payload.index);
  }

  function copyContentImage(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyContentImage(payload.noteId, payload.selection);
  }

  function focusLinkedNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.focusLinkedNote(
      payload.noteId,
      payload.mode,
      context && context.addon ? context.addon.window : null,
    );
  }

  function updateLinkCommentFromClipboard(context, payload) {
    return __MN_COMMENT_MUTATIONS__.updateLinkCommentFromClipboard(
      payload.noteId,
      payload.commentIndex,
    );
  }

  function getActionButtonSettings() {
    return __MN_COMMENT_ACTION_SETTINGS__.getSettings();
  }

  function updateActionButtonSettings(context, payload) {
    const settings = __MN_COMMENT_ACTION_SETTINGS__.updateSettings(payload);
    if (settings.showBatchButton !== true) __MN_BATCH_COMMENT_ACTIONS__.hideButton(context.addon, "settings.disabled");
    if (settings.enableDynamicSingleCardButton !== true) __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(context.addon, "settings.disabled");
    return settings;
  }

  const commands = {
    ping,
    echo,
    closePanel,
    getCurrentNoteComments,
    refreshCurrentNote,
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
    getActionButtonSettings,
    updateActionButtonSettings,
  };

  return {
    commands,
  };
})();
