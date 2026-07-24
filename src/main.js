var __MN_COMMENT_MANAGER_USES_VENDORED_MNUTILS__ = typeof MNUtil === "undefined";
if (__MN_COMMENT_MANAGER_USES_VENDORED_MNUTILS__) {
  JSB.require("vendor/mnutils");
}

var __MN_COMMENT_MANAGER_USES_VENDORED_MNNOTE__ = typeof MNNote === "undefined";
if (__MN_COMMENT_MANAGER_USES_VENDORED_MNNOTE__) {
  JSB.require("vendor/mnnote");
}
JSB.require("WebDevServerConfig");
JSB.require("CommentData");
JSB.require("UndoGroupingHelper");
JSB.require("CommentMutations");
JSB.require("BatchCommentActions");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  if (__MN_COMMENT_MANAGER_USES_VENDORED_MNUTILS__) {
    MNUtil.init(mainPath);
  }
  return createMNCommentManagerAddon(mainPath);
};
