function createMNCommentManagerAddon(mainPath) {
  function boolValue(value) {
    if (value === true || value === false) return value;
    if (value === undefined || value === null) return false;
    if (typeof value.boolValue === "function") return !!value.boolValue();
    if ("boolValue" in Object(value)) return !!value.boolValue;
    return !!value;
  }

  function readExtendValue(obj, keys) {
    if (!obj) return undefined;
    const candidates = Array.isArray(keys) ? keys : [keys];
    for (let i = 0; i < candidates.length; i += 1) {
      const key = candidates[i];
      try {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
      } catch (_) {}
      try {
        if (typeof obj[key] === "function") {
          const value = obj[key]();
          if (value !== undefined && value !== null) return value;
        }
      } catch (_) {}
      try {
        if (typeof obj.objectForKey === "function") {
          const value = obj.objectForKey(key);
          if (value !== undefined && value !== null) return value;
        }
      } catch (_) {}
      try {
        if (typeof obj.valueForKey === "function") {
          const value = obj.valueForKey(key);
          if (value !== undefined && value !== null) return value;
        }
      } catch (_) {}
    }
    return undefined;
  }

  function hasExtendValue(value) {
    if (value === undefined || value === null || value === "" || value === false) return false;
    try {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value.count === "function") return value.count() > 0;
      if ("length" in Object(value) && typeof value !== "number" && typeof value !== "boolean") return value.length > 0;
    } catch (_) {}
    return true;
  }

  function hasBlankHighlight(note) {
    const direct = readExtendValue(note, "blankHighlight");
    const options = readExtendValue(note, "options");
    const blankHighlight = direct || (options ? readExtendValue(options, "blankHighlight") : null);
    if (!blankHighlight) return false;
    return hasExtendValue(readExtendValue(blankHighlight, "blankPageNo")) ||
      hasExtendValue(readExtendValue(blankHighlight, "blankSelList"));
  }

  function resolveExtendNote(target) {
    if (!target) return null;
    if (target.note) return target.note;
    if (target.q_hblank && target.noteid) {
      return MNUtil.getNoteById(target.noteid, false);
    }
    if (typeof target === "string") {
      const note = MNNote.new(target, false);
      return note ? note.note : null;
    }
    return target;
  }

  function isExtendNote(target) {
    try {
      const note = resolveExtendNote(target);
      return !!(note && ((("blank" in Object(note)) && boolValue(note.blank)) || hasBlankHighlight(note)));
    } catch (_) {
      return false;
    }
  }

  function isPopupMenuExtendNote(sender) {
    const info = sender && sender.userInfo ? sender.userInfo : {};
    return isExtendNote(info.note || info.noteid);
  }

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

      MNUtil.addObserver(self, "onMindmapViewOnMultipleSelection:", "mindmapViewOnMultipleSelection");
      MNUtil.addObserver(self, "onMindmapViewBottomToolbarClosed:", "mindmapViewBottomToolbarClosed");
      console.log("[MN Comment Manager] initialized");
    },

    sceneDidDisconnect: function () {
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

    onPopupMenuOnNote: function (sender) {
      if (isPopupMenuExtendNote(sender)) return;
      syncVisiblePanel(self, "popup-menu-note");
    },

    onMindmapViewOnMultipleSelection: function (sender) {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.handleMultipleSelection(self, sender);
      } catch (error) {
        console.log(`[MN Comment Manager] multiple selection failed: ${error && error.message ? error.message : error}`);
      }
    },

    onMindmapViewBottomToolbarClosed: function (sender) {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.keepVisibleIfStillMultipleSelection(self, sender);
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

    runBatchKeepFirstContent: async function (sender) {
      try {
        await __MN_BATCH_COMMENT_ACTIONS__.runKeepFirstContent(self, sender);
      } catch (error) {
        MNUtil.showHUD(`批处理失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch keep first content failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchClearAllComments: async function (sender) {
      try {
        await __MN_BATCH_COMMENT_ACTIONS__.runClearAllComments(self, sender);
      } catch (error) {
        MNUtil.showHUD(`清空评论失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch clear all comments failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchConvertHtmlToMarkdown: async function (sender) {
      try {
        await __MN_BATCH_COMMENT_ACTIONS__.runConvertHtmlToMarkdown(self, sender);
      } catch (error) {
        MNUtil.showHUD(`转换 HTML 评论失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch convert HTML comments failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchClearAllTitles: async function (sender) {
      try {
        await __MN_BATCH_COMMENT_ACTIONS__.runClearAllTitles(self, sender);
      } catch (error) {
        MNUtil.showHUD(`清空标题失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch clear all titles failed: ${error && error.message ? error.message : error}`);
      }
    },
  });
}
