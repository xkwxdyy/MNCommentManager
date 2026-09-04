function createMNCommentManagerAddon(mainPath) {
  const missingMNUtilsMessage = "MN Comment Manager 需要先安装并启用 MN Utils";
  const unavailableMNUtilsMessage = "MN Utils 已安装，但运行时尚未就绪；请确认已启用后重新打开笔记本";
  const mnUtilsRetryInterval = 0.1;
  const mnUtilsRetryCount = 10;

  function hasMNUtilsRuntime() {
    return typeof MNUtil !== "undefined" &&
      !!MNUtil &&
      typeof MNUtil.addObserver === "function" &&
      typeof MNUtil.removeObserver === "function" &&
      typeof MNNote !== "undefined" &&
      !!MNNote &&
      typeof MNNote.new === "function";
  }

  function isMNUtilsInstalled() {
    if (hasMNUtilsRuntime()) return true;
    try {
      const normalizedMainPath = String(mainPath || "").replace(/\/+$/, "");
      const separatorIndex = normalizedMainPath.lastIndexOf("/");
      if (separatorIndex <= 0) return false;
      const extensionFolder = normalizedMainPath.slice(0, separatorIndex);
      return !!NSFileManager.defaultManager().fileExistsAtPath(
        `${extensionFolder}/marginnote.extension.mnutils/main.js`,
      );
    } catch (_) {
      return false;
    }
  }

  function showMNUtilsDependencyStatus(addon) {
    const message = isMNUtilsInstalled() ? unavailableMNUtilsMessage : missingMNUtilsMessage;
    if (addon && addon.mnCommentManagerDependencyNotice === message) return;
    if (addon) addon.mnCommentManagerDependencyNotice = message;
    console.log(`[MN Comment Manager] ${message}`);
    try {
      const app = Application.sharedInstance();
      const targetWindow = addon && addon.window ? addon.window : app.focusWindow;
      if (app && typeof app.showHUD === "function") {
        app.showHUD(message, targetWindow, 4);
      }
    } catch (_) {}
  }

  function waitForMNUtilsRuntime() {
    return new Promise((resolve) => {
      let remainingAttempts = mnUtilsRetryCount;

      function checkRuntime() {
        if (hasMNUtilsRuntime()) {
          resolve(true);
          return;
        }
        if (remainingAttempts <= 0) {
          resolve(false);
          return;
        }
        remainingAttempts -= 1;
        NSTimer.scheduledTimerWithTimeInterval(mnUtilsRetryInterval, false, checkRuntime);
      }

      checkRuntime();
    });
  }

  function initializeAddon(addon) {
    if (addon && addon.mnCommentManagerInitialized) return true;
    if (!hasMNUtilsRuntime()) {
      if (addon) addon.mnCommentManagerRuntimeReady = false;
      return false;
    }

    addon.mnCommentManagerRuntimeReady = true;
    addon.mnCommentManagerDependencyNotice = null;
    addon.mainPath = mainPath;
    addon.webController = __MN_WEB_API_MNCommentManagerAddon.createController(mainPath, addon);
    addon.layoutViewController = function () {
      __MN_WEB_API_MNCommentManagerAddon.ensureLayout(addon.webController);
    };

    MNUtil.addObserver(addon, "onMindmapViewOnMultipleSelection:", "mindmapViewOnMultipleSelection");
    MNUtil.addObserver(addon, "onMindmapViewBottomToolbarClosed:", "mindmapViewBottomToolbarClosed");
    MNUtil.addObserver(addon, "onPopupMenuOnNote:", "PopupMenuOnNote");
    MNUtil.addObserver(addon, "onClosePopupMenuOnNote:", "ClosePopupMenuOnNote");
    addon.mnCommentManagerInitialized = true;
    console.log("[MN Comment Manager] initialized with MN Utils runtime");
    return true;
  }

  async function initializeAddonWhenReady(addon, notifyIfUnavailable) {
    if (initializeAddon(addon)) return true;
    if (isMNUtilsInstalled() && await waitForMNUtilsRuntime()) {
      return initializeAddon(addon);
    }
    if (notifyIfUnavailable) showMNUtilsDependencyStatus(addon);
    return false;
  }

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
      // MNUtils owns the canonical Extend Note contract. Fall back to the
      // legacy bridge-field inspection when running with an older MNUtils or
      // while the bridge is still bootstrapping.
      if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.isExtendNote === "function") {
        try {
          return !!MNUtil.isExtendNote(target);
        } catch (_) {}
      }
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

  async function runSingleMenuAction(addon, sender, actionName, failureLabel) {
    try {
      return await __MN_DYNAMIC_COMMENT_ACTIONS__[actionName](addon, sender);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      MNUtil.showHUD(`${failureLabel}: ${message}`);
      console.log(`[MN Comment Manager] single-card ${actionName} failed: ${message}`);
      return false;
    }
  }

  function selectorParam(sender) {
    try {
      if (sender && typeof sender === "object" && sender.param !== undefined) return sender.param;
    } catch (_) {}
    return sender || {};
  }

  function validateBatchMenuToken(addon, sender) {
    const param = selectorParam(sender);
    const context = addon && addon.batchCommentContext;
    if (param && param.token && context && context.token && String(param.token) !== String(context.token)) {
      throw new Error("多选卡片已变化，请重新打开批处理菜单");
    }
    return param;
  }

  async function runBatchWorkflowMenuAction(addon, sender) {
    const param = selectorParam(sender);
    const workflow = param && param.workflow ? param.workflow : param && param.workflowId;
    if (!workflow) throw new Error("未读取到工作流");
    const result = await __MN_COMMENT_WORKFLOW_RUNNER__.run(addon, workflow, param);
    __MN_BATCH_COMMENT_ACTIONS__.hideButton(addon, "workflow.done");
    return result;
  }

  return JSB.defineClass("MNCommentManagerAddon : JSExtension <UIPopoverControllerDelegate>", {
    sceneWillConnect: async function () {
      await initializeAddonWhenReady(self, false);
    },

    sceneDidDisconnect: function () {
      const runtimeAvailable = hasMNUtilsRuntime();
      if (self.mnCommentManagerInitialized && runtimeAvailable) {
        MNUtil.removeObserver(self, "mindmapViewOnMultipleSelection");
        MNUtil.removeObserver(self, "mindmapViewBottomToolbarClosed");
        MNUtil.removeObserver(self, "PopupMenuOnNote");
        MNUtil.removeObserver(self, "ClosePopupMenuOnNote");
      }
      __MN_DYNAMIC_COMMENT_ACTIONS__.disposeButton(self, "scene.disconnect");

      if (self.webController && self.webController.view && self.webController.view.superview) {
        self.webController.view.removeFromSuperview();
      }
      self.webController = null;
      self.mnCommentManagerInitialized = false;
      self.mnCommentManagerRuntimeReady = false;
      console.log("[MN Comment Manager] disconnected");
    },

    notebookWillOpen: async function () {
      if (!(await initializeAddonWhenReady(self, true))) return;
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
      if (!self.mnCommentManagerInitialized) return;
      if (controller === Application.sharedInstance().studyController(self.window)) {
        self.layoutViewController();
      }
    },

    queryAddonCommandStatus: function () {
      if (!initializeAddon(self)) {
        return {
          image: "icon.png",
          object: self,
          selector: "toggleWebPanel:",
          checked: false,
        };
      }
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

    toggleWebPanel: async function () {
      if (!(await initializeAddonWhenReady(self, true))) return;
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

    showMissingMNUtilsDependency: function () {
      showMNUtilsDependencyStatus(self);
    },

    onPopupMenuOnNote: function (sender) {
      if (self.window !== MNUtil.currentWindow) return;
      if (isPopupMenuExtendNote(sender)) return;
      __MN_BATCH_COMMENT_ACTIONS__.hideButton(self, "singleNote");
      syncVisiblePanel(self, "popup-menu-note");
      try {
        __MN_DYNAMIC_COMMENT_ACTIONS__.handlePopupMenuOnNote(self, sender);
      } catch (error) {
        console.log(`[MN Comment Manager] dynamic single-card button failed: ${error && error.message ? error.message : error}`);
      }
    },

    onClosePopupMenuOnNote: function () {
      if (self.window !== MNUtil.currentWindow) return;
      try {
        __MN_DYNAMIC_COMMENT_ACTIONS__.handlePopupMenuClosed(self);
      } catch (error) {
        console.log(`[MN Comment Manager] dynamic single-card close failed: ${error && error.message ? error.message : error}`);
      }
    },

    onMindmapViewOnMultipleSelection: function (sender) {
      try {
        __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(self, "multipleSelection");
        const hasBatchSelection = __MN_BATCH_COMMENT_ACTIONS__.handleMultipleSelection(self, sender);
        if (!hasBatchSelection && self.webController && self.webController.panelMode === "batch") {
          __MN_WEB_API_MNCommentManagerAddon.hidePanel(self.webController);
        } else if (hasBatchSelection && self.webController && self.webController.panelMode === "batch" &&
          self.webController.view && self.webController.view.window) {
          __MN_WEB_API_MNCommentManagerAddon.syncBatch(self.webController, "selection-changed");
        }
      } catch (error) {
        console.log(`[MN Comment Manager] multiple selection failed: ${error && error.message ? error.message : error}`);
      }
    },

    onMindmapViewBottomToolbarClosed: function () {
      try {
        __MN_BATCH_COMMENT_ACTIONS__.handleMultipleSelectionClosed(self);
      } catch (error) {
        console.log(`[MN Comment Manager] bottom toolbar close failed: ${error && error.message ? error.message : error}`);
      }
    },

    batchCommentButtonTapped: function (button) {
      if (self._batchCommentLongPressFired) {
        self._batchCommentLongPressFired = false;
        return;
      }
      try {
        __MN_BATCH_COMMENT_ACTIONS__.openMenu(self, button);
      } catch (error) {
        MNUtil.showHUD(`打开批处理菜单失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] open batch menu failed: ${error && error.message ? error.message : error}`);
      }
    },

    batchCommentButtonLongPressed: function (gesture) {
      if (!gesture || gesture.state !== 1) return;
      self._batchCommentLongPressFired = true;
      try {
        const context = self.batchCommentContext;
        if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
          throw new Error("未读取到多选卡片");
        }
        if (!self.webController) throw new Error("评论管理器尚未初始化");
        __MN_WEB_API_MNCommentManagerAddon.showPanel(self.webController, { mode: "batch" });
        self.layoutViewController();
        __MN_WEB_API_MNCommentManagerAddon.syncBatch(self.webController, "batch-long-press");
        __MN_BATCH_COMMENT_ACTIONS__.hideButton(self, "batch-editor-open", { preserveContext: true });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        MNUtil.showHUD(`打开多卡评论编辑器失败: ${message}`);
        console.log(`[MN Comment Manager] batch editor failed: ${message}`);
      }
    },

    openBatchWorkflows: function (sender) {
      try {
        return __MN_COMMENT_WORKFLOW_MENU__.openBatchWorkflows(self, sender);
      } catch (error) {
        MNUtil.showHUD(`打开工作流菜单失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] open batch workflows failed: ${error && error.message ? error.message : error}`);
        return false;
      }
    },

    backWorkflowMenu: function () {
      try {
        return __MN_COMMENT_WORKFLOW_MENU__.backWorkflowMenu(self);
      } catch (error) {
        console.log(`[MN Comment Manager] back workflow menu failed: ${error && error.message ? error.message : error}`);
        return false;
      }
    },

    openWorkflowManager: function () {
      try {
        return __MN_COMMENT_WORKFLOW_MENU__.openWorkflowManager(self);
      } catch (error) {
        MNUtil.showHUD(`打开工作流管理器失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] open workflow manager failed: ${error && error.message ? error.message : error}`);
        return false;
      }
    },

    showWorkflowMissing: function (sender) {
      try {
        return __MN_COMMENT_WORKFLOW_MENU__.showWorkflowMissing(self, sender);
      } catch (error) {
        MNUtil.showHUD(`工作流依赖不可用: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] show missing workflow dependency failed: ${error && error.message ? error.message : error}`);
        return false;
      }
    },

    runBatchWorkflow: async function (sender) {
      try {
        return await runBatchWorkflowMenuAction(self, sender);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        __MN_BATCH_COMMENT_ACTIONS__.hideButton(self, "workflow.failed");
        MNUtil.showHUD(`工作流执行失败: ${message}`);
        console.log(`[MN Comment Manager] batch workflow failed: ${message}`);
        return false;
      }
    },

    dynamicCommentButtonTouchDown: function () {
      __MN_DYNAMIC_COMMENT_ACTIONS__.beginInteraction(self);
    },

    dynamicCommentButtonTapped: function () {
      try {
        if (__MN_DYNAMIC_COMMENT_ACTIONS__.consumeTapSuppression(self)) return;
        const context = self.dynamicCommentContext;
        if (!context || !context.noteId) throw new Error("未读取到当前卡片");
        MNUtil.focusNoteInMindMapById(context.noteId, 0);
        __MN_WEB_API_MNCommentManagerAddon.showPanel(self.webController);
        self.layoutViewController();
        __MN_WEB_API_MNCommentManagerAddon.syncCurrentNote(self.webController, "dynamic-single-card");
        __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(self, "tap.openPanel");
      } catch (error) {
        __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(self, "tap.failed");
        MNUtil.showHUD(`打开评论管理器失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] dynamic single-card tap failed: ${error && error.message ? error.message : error}`);
      }
    },

    dynamicCommentButtonLongPressed: function (gesture) {
      if (!gesture || gesture.state !== 1) return;
      try {
        __MN_DYNAMIC_COMMENT_ACTIONS__.suppressTapAfterLongPress(self);
        if (!__MN_DYNAMIC_COMMENT_ACTIONS__.openMenu(self, gesture.view)) {
          throw new Error("未读取到当前卡片");
        }
      } catch (error) {
        MNUtil.showHUD(`打开单选处理菜单失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] dynamic single-card menu failed: ${error && error.message ? error.message : error}`);
      }
    },

    popoverControllerDidDismissPopover: function (controller) {
      __MN_DYNAMIC_COMMENT_ACTIONS__.handleMenuDismissed(self, controller);
    },

    runSingleKeepFirstContent: async function (sender) { await runSingleMenuAction(self, sender, "runKeepFirstContent", "单选处理失败"); },
    runSingleConvertHtmlToMarkdown: async function (sender) { await runSingleMenuAction(self, sender, "runConvertHtmlToMarkdown", "转换 HTML 评论失败"); },
    runSingleConvertToNoExcerpt: async function (sender) { await runSingleMenuAction(self, sender, "runConvertToNoExcerpt", "转为非摘录版失败"); },
    runSingleRemoveAllLinks: async function (sender) { await runSingleMenuAction(self, sender, "runRemoveAllLinks", "去掉链接失败"); },
    openSingleInvalidLinkMenu: function () { return __MN_DYNAMIC_COMMENT_ACTIONS__.openSingleInvalidLinkMenu(self); },
    backSingleInvalidLinkMenu: function () { return __MN_DYNAMIC_COMMENT_ACTIONS__.backSingleInvalidLinkMenu(self); },
    runSingleClearInvalidLinks: async function (sender) { await runSingleMenuAction(self, sender, "runClearInvalidLinks", "清除失效链接失败"); },
    runSingleClearAllComments: async function (sender) { await runSingleMenuAction(self, sender, "runClearAllComments", "清空评论失败"); },
    runSingleClearAllTitles: async function (sender) { await runSingleMenuAction(self, sender, "runClearAllTitles", "清空标题失败"); },

    noopBatchCommentAction: function () {
      return false;
    },

    runBatchKeepFirstContent: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runKeepFirstContent(self, sender);
      } catch (error) {
        MNUtil.showHUD(`批处理失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch keep first content failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchClearAllComments: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runClearAllComments(self, sender);
      } catch (error) {
        MNUtil.showHUD(`清空评论失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch clear all comments failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchConvertHtmlToMarkdown: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runConvertHtmlToMarkdown(self, sender);
      } catch (error) {
        MNUtil.showHUD(`转换 HTML 评论失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch convert HTML comments failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchConvertToNoExcerpt: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runConvertToNoExcerpt(self, sender);
      } catch (error) {
        MNUtil.showHUD(`转为非摘录版失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch convert to no-excerpt failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchRemoveAllLinks: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runRemoveAllLinks(self, sender);
      } catch (error) {
        MNUtil.showHUD(`去掉链接失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch remove all links failed: ${error && error.message ? error.message : error}`);
      }
    },

    openBatchInvalidLinkMenu: function (sender) {
      try {
        return __MN_COMMENT_WORKFLOW_MENU__.openBatchInvalidLinkMenu(self, sender);
      } catch (error) {
        MNUtil.showHUD(`打开失效链接菜单失败: ${error && error.message ? error.message : error}`);
        return false;
      }
    },

    backBatchInvalidLinkMenu: function () {
      return __MN_COMMENT_WORKFLOW_MENU__.backBatchInvalidLinkMenu(self);
    },

    runBatchClearInvalidLinks: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runClearInvalidLinks(self, sender);
      } catch (error) {
        MNUtil.showHUD(`清除失效链接失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch clear invalid links failed: ${error && error.message ? error.message : error}`);
      }
    },

    runBatchClearAllTitles: async function (sender) {
      try {
        validateBatchMenuToken(self, sender);
        await __MN_BATCH_COMMENT_ACTIONS__.runClearAllTitles(self, sender);
      } catch (error) {
        MNUtil.showHUD(`清空标题失败: ${error && error.message ? error.message : error}`);
        console.log(`[MN Comment Manager] batch clear all titles failed: ${error && error.message ? error.message : error}`);
      }
    },
  });
}
