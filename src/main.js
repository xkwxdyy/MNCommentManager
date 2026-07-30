JSB.require("WebDevServerConfig");
JSB.require("CommentData");
JSB.require("UndoGroupingHelper");
JSB.require("CommentMutations");
JSB.require("CommentActionSettings");
JSB.require("BatchCommentActions");
JSB.require("DynamicCommentActions");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  return createMNCommentManagerAddon(mainPath);
};
