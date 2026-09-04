var __MN_COMMENT_WORKFLOW_MENU__ = (function () {
  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function item(addon, title, selector, param) {
    return {
      title,
      object: addon,
      selector,
      param: param || "",
      checked: false,
    };
  }

  function getSenderParam(sender) {
    try {
      if (sender && typeof sender === "object" && sender.param !== undefined) return sender.param;
    } catch (error) {}
    return sender;
  }

  function present(addon, button, items, width, position) {
    const popover = MNUtil.getPopoverAndPresent(button || addon.batchCommentButton, items, width || 280, position || 0);
    if (!popover) return null;
    try { popover.delegate = addon; } catch (error) {}
    addon.batchCommentMenuPopoverController = popover;
    addon.mnCommentWorkflowMenuCurrentItems = items;
    return popover;
  }

  function decorate(kind, workflow, title) {
    const normalizedWorkflow = Object.assign({}, workflow, {
      scope: String(workflow && workflow.scope || "batch").toLowerCase() || "batch",
    });
    const missingActions = (workflow.steps || [])
      .map((step) => text(step && step.actionId).trim())
      .filter((actionId, index, list) => actionId && !__MN_COMMENT_WORKFLOW_REGISTRY__.getAction(actionId) && list.indexOf(actionId) === index);
    return {
      kind,
      id: normalizedWorkflow.id,
      title,
      workflow: normalizedWorkflow,
      missingActions,
    };
  }

  function getSavedEntries() {
    return __MN_COMMENT_WORKFLOW_STORE__.list()
      .filter((workflow) => {
        const scope = String(workflow && workflow.scope || "batch").toLowerCase();
        return scope === "batch" || scope === "both";
      })
      .map((workflow) => decorate("workflow", workflow, workflow.name));
  }

  function getExtensionEntries() {
    const actions = __MN_COMMENT_WORKFLOW_REGISTRY__.getCatalog("batch")
      .filter((action) => action && action.builtin !== true && action.compatible !== false)
      .map((action) => decorate("action", {
        id: `action:${action.id}`,
        name: action.title,
        scope: action.scope,
        steps: [{ actionId: action.id, options: {} }],
      }, action.title));
    const presets = __MN_COMMENT_WORKFLOW_REGISTRY__.getPresets("batch")
      .map((preset) => decorate("preset", preset, preset.title));
    return actions.concat(presets);
  }

  function getEntries(section) {
    return section === "extension" ? getExtensionEntries() : getSavedEntries();
  }

  function buildRootItems(addon, context) {
    const count = context && Array.isArray(context.notes) ? context.notes.length : 0;
    const token = context && context.token ? context.token : "";
    const savedEntries = getSavedEntries();
    const extensionEntries = getExtensionEntries();
    const items = [
      item(addon, "── 评论批处理 ──", "noopBatchCommentAction:"),
      item(addon, `  只保留第一条内容（${count} 张）`, "runBatchKeepFirstContent:", { token }),
      item(addon, `  转换 HTML 为 Markdown（${count} 张）`, "runBatchConvertHtmlToMarkdown:", { token }),
      item(addon, `  转为非摘录版（${count} 张）`, "runBatchConvertToNoExcerpt:", { token }),
      item(addon, `  去掉所有链接（${count} 张）`, "runBatchRemoveAllLinks:", { token }),
      item(addon, `  清除失效链接 ➡️`, "openBatchInvalidLinkMenu:", { token }),
      item(addon, `  清空所有评论（${count} 张）`, "runBatchClearAllComments:", { token }),
      item(addon, `  清空所有标题（${count} 张）`, "runBatchClearAllTitles:", { token }),
    ];
    if (savedEntries.length > 0) {
      items.push(item(addon, `  已保存工作流（${savedEntries.length}） ➡️`, "openBatchWorkflows:", {
        token,
        section: "saved",
      }));
    }
    if (extensionEntries.length > 0) {
      items.push(item(addon, `  扩展动作（${extensionEntries.length}） ➡️`, "openBatchWorkflows:", {
        token,
        section: "extension",
      }));
    }
    return items;
  }

  function buildWorkflowItems(addon, context) {
    const section = context && context.workflowMenuSection === "extension" ? "extension" : "saved";
    const entries = getEntries(section);
    const token = context && context.token ? context.token : "";
    const items = [item(addon, "↩ 返回评论批处理", "backWorkflowMenu:")];
    if (section === "extension") items.push(item(addon, "── Patch 动作与预设 ──", "noopBatchCommentAction:"));
    entries.forEach((entry) => {
      const noteCount = context && Array.isArray(context.notes) ? context.notes.length : 0;
      items.push(item(
        addon,
        `  ${entry.title}${entry.missingActions.length ? "（缺少动作）" : `（${noteCount} 张 · ${entry.workflow.usageCount || 0} 次）`}`,
        entry.missingActions.length ? "showWorkflowMissing:" : "runBatchWorkflow:",
        {
          workflowId: entry.kind === "workflow" ? entry.id : "",
          // Pass the same normalized snapshot that was used to render the
          // menu. This avoids a menu/runner scope mismatch caused by a second
          // read of legacy workflow data at click time.
          workflow: entry.workflow,
          token,
          missingActions: entry.missingActions,
        },
      ));
    });
    items.push(item(addon, "── 工作流管理 ──", "noopBatchCommentAction:"));
    items.push(item(addon, "  打开工作流管理器", "openWorkflowManager:"));
    return items;
  }

  function openBatchMenu(addon, button, context) {
    if (!addon) return false;
    addon.mnCommentWorkflowMenuStack = [];
    const items = buildRootItems(addon, context);
    const popover = present(addon, button, items, 280, 0);
    if (!popover) return false;
    addon.batchCommentMenuPopoverController = popover;
    return true;
  }

  function openBatchWorkflows(addon, sender) {
    const context = addon && addon.batchCommentContext;
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) {
      throw new Error("未读取到多选卡片，请重新多选后再试");
    }
    const param = getSenderParam(sender) || {};
    if (param.token && context.token && String(param.token) !== String(context.token)) {
      throw new Error("多选卡片已变化，请重新打开工作流菜单");
    }
    addon.mnCommentWorkflowMenuStack = addon.mnCommentWorkflowMenuStack || [];
    addon.mnCommentWorkflowMenuStack.push({
      items: addon.mnCommentWorkflowMenuCurrentItems || buildRootItems(addon, context),
      width: 280,
      position: 0,
    });
    const submenuContext = Object.assign({}, context, {
      workflowMenuSection: param.section === "extension" ? "extension" : "saved",
    });
    return !!present(addon, addon.batchCommentButton, buildWorkflowItems(addon, submenuContext), 320, 0);
  }

  function backWorkflowMenu(addon) {
    const stack = addon && addon.mnCommentWorkflowMenuStack;
    if (!Array.isArray(stack) || stack.length <= 0) return false;
    const previous = stack.pop();
    return !!present(addon, addon.batchCommentButton, previous.items, previous.width, previous.position);
  }

  function openBatchInvalidLinkMenu(addon, sender) {
    const context = addon && addon.batchCommentContext;
    if (!context || !Array.isArray(context.notes) || context.notes.length <= 1) throw new Error("未读取到多选卡片，请重新多选后再试");
    const param = getSenderParam(sender) || {};
    if (param.token && context.token && String(param.token) !== String(context.token)) throw new Error("多选卡片已变化，请重新打开批处理菜单");
    addon.mnCommentWorkflowMenuStack = addon.mnCommentWorkflowMenuStack || [];
    addon.mnCommentWorkflowMenuStack.push({ items: addon.mnCommentWorkflowMenuCurrentItems || buildRootItems(addon, context), width: 280, position: 0 });
    const token = context.token;
    const modes = [
      { title: "  纯卡片链接", mode: "card" },
      { title: "  Markdown 行内链接", mode: "markdown" },
      { title: "  全部失效链接", mode: "all" },
    ];
    const items = [item(addon, "↩ 返回评论批处理", "backBatchInvalidLinkMenu:"), ...modes.map((entry) => item(addon, entry.title, "runBatchClearInvalidLinks:", { token, mode: entry.mode }))];
    return !!present(addon, addon.batchCommentButton, items, 280, 0);
  }

  function backBatchInvalidLinkMenu(addon) {
    return backWorkflowMenu(addon);
  }

  function openWorkflowManager(addon) {
    if (!addon || !addon.webController) throw new Error("评论管理器尚未初始化");
    __MN_WEB_API_MNCommentManagerAddon.showPanel(addon.webController);
    if (typeof addon.layoutViewController === "function") addon.layoutViewController();
    return true;
  }

  return {
    openBatchMenu,
    openBatchWorkflows,
    backWorkflowMenu,
    openBatchInvalidLinkMenu,
    backBatchInvalidLinkMenu,
    openWorkflowManager,
    showWorkflowMissing(addon, sender) {
      const param = getSenderParam(sender) || {};
      const missing = Array.isArray(param.missingActions) ? param.missingActions : [];
      const suffix = missing.length > 0 ? `：${missing.join("、")}` : "";
      if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") {
        MNUtil.showHUD(`工作流依赖的 Patch 动作不可用${suffix}`);
      }
      return false;
    },
    buildRootItems,
  };
})();
