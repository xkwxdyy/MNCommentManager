JSB.require("vendor/mnutils");
JSB.require("vendor/mnnote");
JSB.require("WebDevServerConfig");
JSB.require("CommentData");
JSB.require("CommentMutations");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  MNUtil.init(mainPath);
  return createMNCommentManagerAddon(mainPath);
};
