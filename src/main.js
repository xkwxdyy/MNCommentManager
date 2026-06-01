JSB.require("WebDevServerConfig");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCommentManagerAddon");

JSB.newAddon = function (mainPath) {
  return createMNCommentManagerAddon(mainPath);
};
