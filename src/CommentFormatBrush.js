// Retain the original command contract; all rich comment writes share one lifecycle.
var __MN_COMMENT_FORMAT_BRUSH__ = (function () {
  return {
    preview(noteId, sourceIndex) {
      return __MN_RICH_COMMENTS_MNCommentManagerAddon__.previewFormat(
        { noteId, sourceIndex },
        'brush',
      );
    },
    apply(payload) {
      return __MN_RICH_COMMENTS_MNCommentManagerAddon__.applyFormat(payload, 'brush');
    },
    undo(payload) {
      return __MN_RICH_COMMENTS_MNCommentManagerAddon__.undo(payload);
    },
  };
})();
