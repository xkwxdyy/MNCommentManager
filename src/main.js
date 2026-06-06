JSB.require("vendor/mnutils");
JSB.require("vendor/mnnote");
JSB.require("WebDevServerConfig");
JSB.require("CommentData");
JSB.require("UndoGroupingHelper");
JSB.require("CommentMutations");
JSB.require("BatchCommentActions");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  MNUtil.init(mainPath);
  return createMNCommentManagerAddon(mainPath);
};
