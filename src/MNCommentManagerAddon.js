function createMNCommentManagerAddon(mainPath) {
  function syncVisiblePanel(addon, reason) {
    if (!addon || !addon.webController) return;
    const view = addon.webController.view;
    if (!view || !view.window || view.hidden) return;
    __MN_WEB_API_MNCommentManagerAddon.syncCurrentNote(addon.webController, reason);
  }

  return JSB.defineClass("MNCommentManagerAddon : JSExtension", {
    sceneWillConnect: function () {
      self.mainPath = mainPath;
      self.webController = __MN_WEB_API_MNCommentManagerAddon.createController(mainPath, self);

      self.layoutViewController = function () {
        __MN_WEB_API_MNCommentManagerAddon.ensureLayout(self.webController);
      };

      MNUtil.addObserver(self, "onPopupMenuOnNote:", "PopupMenuOnNote");
      MNUtil.addObserver(self, "onMindmapViewOnMultipleSelection:", "mindmapViewOnMultipleSelection");
      MNUtil.addObserver(self, "onMindmapViewBottomToolbarClosed:", "mindmapViewBottomToolbarClosed");
      console.log("[MN Comment Manager] initialized");
    },

    sceneDidDisconnect: function () {
      MNUtil.removeObserver(self, "PopupMenuOnNote");
      MNUtil.removeObserver(self, "mindmapViewOnMultipleSelection");
      MNUtil.removeObserver(self, "mindmapViewBottomToolbarClosed");

      if (self.webController && self.webController.view && self.webController.view.superview) {
        self.webController.view.removeFromSuperview();
      }
      self.webController = null;
      console.log("[MN Comment Manager] disconnected");
    },

    notebookWillOpen: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      self.webController.addon = self;
      self.webController.addonWindow = self.window;

      if (__MN_WEB_API_MNCommentManagerAddon.shouldRestorePanel()) {
        __MN_WEB_API_MNCommentManagerAddon.showPanel(self.webController);
        self.layoutViewController();
      }
    },

    controllerWillLayoutSubviews: function (controller) {
      if (controller === Application.sharedInstance().studyController(self.window)) {
        self.layoutViewController();
      }
    },

    queryAddonCommandStatus: function () {
      const checked =
        self.webController &&
        self.webController.view &&
        self.webController.view.window
          ? true
          : false;

      syncVisiblePanel(self, "command-status");

      return {
        image: "icon.png",
        object: self,
        selector: "toggleWebPanel:",
        checked,
      };
    },

    toggleWebPanel: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      if (self.webController.view && self.webController.view.window) {
        __MN_WEB_API_MNCommentManagerAddon.hidePanel(self.webController);
      } else {
        __MN_WEB_API_MNCommentManagerAddon.showPanel(self.webController);
        self.layoutViewController();
      }

      Application.sharedInstance().studyController(self.window).refreshAddonCommands();
    },

    onPopupMenuOnNote: function () {
      syncVisiblePanel(self, "popup-menu-note");
    },

    onMindmapViewOnMultipleSelection: function (sender) {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.handleMultipleSelection(self, sender);
      } catch (error) {
        console.log(`[MN Comment Manager] multiple selection failed: ${error && error.message ? error.message : error}`);
      }
    },

    onMindmapViewBottomToolbarClosed: function () {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.hideButton(self, "bottom-toolbar-closed");
      } catch (error) {
        console.log(`[MN Comment Manager] bottom toolbar close failed: ${error && error.message ? error.message : error}`);
      }
    },

    batchCommentButtonTapped: function (button) {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.openMenu(self, button);
      } catch (error) {
        MNUtil.showHUD(`打开批处理菜单失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] open batch menu failed: ${error && error.message ? error.message : error}`);
      }
    },

    noopBatchCommentAction: function () {
      return false;
    },

    runBatchKeepFirstContent: async function () {
      try {
        await __MN_BATCH_COMMENT_ACTIONS__.runKeepFirstContent(self);
      } catch (error) {
        MNUtil.showHUD(`批处理失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch keep first content failed: ${error && error.message ? error.message : error}`);
      }
    },
  });
}
