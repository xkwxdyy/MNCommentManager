JSB.require("WebDevServerConfig");
JSB.require("HandwritingPreview");
JSB.require("CommentData");
JSB.require("UndoGroupingHelper");
JSB.require("CommentWorkflowStore");
JSB.require("CommentWorkflowRegistry");
JSB.require("CommentHtmlConversion");
JSB.require("CommentMutations");
JSB.require("CommentBatchEditor");
JSB.require("CommentWorkflowRunner");
JSB.require("CommentWorkflowMenu");
JSB.require("CommentActionSettings");
JSB.require("BatchCommentActions");
JSB.require("DynamicCommentActions");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  return createMNCommentManagerAddon(mainPath);
};
