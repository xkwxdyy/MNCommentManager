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
    const popover = typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== 'undefined'
      ? __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.present(addon, button || addon.batchCommentButton, items, width || 300, position || 0, { title: '所选卡片操作', subtitle: '已选择 ' + (addon.batchCommentContext && addon.batchCommentContext.notes || []).length + ' 张卡片 · 分别处理' })
      : MNUtil.getPopoverAndPresent(button || addon.batchCommentButton, items, width || 280, position || 0);
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
    const invalidSelectors = Array.isArray(workflow.invalidSelectors)
      ? workflow.invalidSelectors.slice()
      : (workflow.steps || []).map((step, index) => {
        if (!step || text(step.kind).trim().toLowerCase() !== "select") return null;
        try {
          const selector = __MN_COMMENT_BATCH_EDITOR__.normalizeSelector(step.selector);
          return selector.position && selector.position.invalid
            ? { step: index, message: selector.position.error }
            : null;
        } catch (error) {
          return { step: index, message: error && error.message ? error.message : String(error) };
        }
      }).filter(Boolean);
    return {
      kind,
      id: normalizedWorkflow.id,
      title,
      workflow: normalizedWorkflow,
      missingActions,
      invalidSelectors,
    };
  }

  function getSavedEntries(mode) {
    const workflows = __MN_COMMENT_WORKFLOW_STORE__.list();
    const sorted = typeof __MN_COMMENT_WORKFLOW_STORE__.sortForMenu === "function"
      ? __MN_COMMENT_WORKFLOW_STORE__.sortForMenu(workflows, mode) : workflows;
    return sorted.filter((workflow) => {
      const scope = text(workflow.scope || "batch").toLowerCase();
      return (scope === mode || scope === "both") && (workflow.steps || []).every((step) => {
        if (step.kind === "select") return true;
        const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step.actionId);
        return !action || !action.scope || action.scope === "both" || action.scope === mode;
      });
    }).map((workflow) => decorate("workflow", workflow, workflow.name));
  }

  function getExtensionEntries(mode) {
    const actions = __MN_COMMENT_WORKFLOW_REGISTRY__.getCatalog(mode)
      .filter((action) => action && action.builtin !== true && action.compatible !== false)
      .map((action) => decorate("action", {
        id: `action:${action.id}`, name: action.title, scope: action.scope,
        steps: [{ actionId: action.id, options: {} }],
      }, action.title));
    const presets = __MN_COMMENT_WORKFLOW_REGISTRY__.getPresets(mode)
      .map((preset) => decorate("preset", preset, preset.title));
    return actions.concat(presets);
  }

  function setting(entry, mode) {
    return entry.workflow.menu && entry.workflow.menu[mode] || { position: "submenu", order: 0 };
  }

  function workflowItem(addon, entry, context, mode) {
    const unavailable = entry.missingActions.length > 0 || entry.invalidSelectors.length > 0;
    const label = entry.missingActions.length > 0 ? "缺少动作" : "选择器无效";
    return item(addon, `  ${entry.title}${unavailable ? `（${label}）` : ""}`,
      mode === "single" ? (unavailable ? "showSingleWorkflowMissing:" : "runSingleWorkflow:")
        : (unavailable ? "showWorkflowMissing:" : "runBatchWorkflow:"), {
        workflowId: entry.kind === "workflow" ? entry.id : "", workflow: entry.workflow,
        token: context && context.token || "", noteId: context && context.noteId || "", mode,
        missingActions: entry.missingActions, invalidSelectors: entry.invalidSelectors,
      });
  }

  function buildItems(addon, context, mode, section) {
    const entries = getSavedEntries(mode);
    const extensions = getExtensionEntries(mode);
    const openSelector = mode === "single" ? "openSingleWorkflows:" : "openBatchWorkflows:";
    const param = { token: context && context.token || "", noteId: context && context.noteId || "" };
    const items = [];
    if (!section || section === "root") {
      items.push(item(addon, mode === "single" ? "── 单选处理 ──" : "── 评论批处理 ──", "noopBatchCommentAction:"));
      const root = entries.filter((entry) => setting(entry, mode).position === "root")
        .map((entry) => ({ order: setting(entry, mode).order, item: workflowItem(addon, entry, context, mode) }));
      const links = entries.filter((entry) => setting(entry, mode).position === "links");
      if (links.length) root.push({ order: setting(links[0], mode).order,
        item: item(addon, "  清除失效链接 ➡️", openSelector, Object.assign({}, param, { section: "links" })) });
      root.sort((left, right) => left.order - right.order).forEach((entry) => items.push(entry.item));
      if (entries.some((entry) => setting(entry, mode).position === "submenu")) {
        items.push(item(addon, "  工作流 ➡️", openSelector, Object.assign({}, param, { section: "saved" })));
      }
      if (extensions.length) items.push(item(addon, "  扩展动作 ➡️", openSelector, Object.assign({}, param, { section: "extension" })));
    } else {
      items.push(item(addon, mode === "single" ? "↩ 返回单选处理" : "↩ 返回评论批处理",
        mode === "single" ? "backSingleWorkflowMenu:" : "backWorkflowMenu:"));
      const selected = section === "extension" ? extensions : entries.filter((entry) => (
        setting(entry, mode).position === (section === "links" ? "links" : "submenu")
      ));
      selected.forEach((entry) => items.push(workflowItem(addon, entry, context, mode)));
    }
    items.push(item(addon, "  打开工作流管理器", "openWorkflowManager:"));
    return items;
  }

  function buildRootItems(addon, context) { return buildItems(addon, context, "batch", "root"); }
  function buildWorkflowItems(addon, context) { return buildItems(addon, context, "batch", context.workflowMenuSection || "saved"); }

  function openBatchMenu(addon, button, context) {
    if (!addon) return false;
    addon.mnCommentWorkflowMenuStack = [];
    const items = buildRootItems(addon, context);
    if (typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon !== 'undefined') items.splice(1, 0, item(addon, '打开多卡评论编辑器', 'openBatchCommentEditor:', { token: context.token }));
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
      workflowMenuSection: param.section === "extension" || param.section === "links" ? param.section : "saved",
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
    const popovers = [addon.dynamicCommentMenuPopoverController, addon.batchCommentMenuPopoverController, addon.mncmActionPopover]
      .filter((popover, index, list) => popover && list.indexOf(popover) === index);
    // This is a menu-to-panel handoff, not a cancelled card selection. Detach
    // dismissal delegates and references before UIKit can report the close.
    addon.dynamicCommentMenuPopoverController = null;
    addon.batchCommentMenuPopoverController = null;
    addon.mncmActionPopover = null;
    addon.dynamicCommentMenuAnchor = null;
    addon.dynamicCommentMenuStack = [];
    addon.dynamicCommentMenuItems = [];
    addon.dynamicCommentMenuTransitioning = false;
    addon.mnCommentWorkflowMenuStack = [];
    addon.mnCommentWorkflowMenuCurrentItems = [];
    popovers.forEach((popover) => {
      popover.delegate = null;
      if (typeof popover.dismissPopoverAnimated === "function") popover.dismissPopoverAnimated(false);
    });
    addon.mncmWorkflowPanelOwnsEntries = true;
    addon.mncmWorkflowManagerModalOpen = true;
    if (typeof __MN_DYNAMIC_COMMENT_ACTIONS__ !== "undefined") __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(addon, "workflow.open", { preserveContext: true });
    if (typeof __MN_BATCH_COMMENT_ACTIONS__ !== "undefined") __MN_BATCH_COMMENT_ACTIONS__.hideButton(addon, "workflow.open", { preserveContext: true });
    try {
      __MN_WEB_API_MNCommentManagerAddon.showPanel(addon.webController, { requestedView: "workflow" });
      if (typeof addon.layoutViewController === "function") addon.layoutViewController();
    } catch (error) {
      addon.mncmWorkflowPanelOwnsEntries = false;
      addon.mncmWorkflowManagerModalOpen = false;
      throw error;
    }
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
      const invalid = Array.isArray(param.invalidSelectors) ? param.invalidSelectors : [];
      const suffix = missing.length > 0
        ? `：${missing.join("、")}`
        : (invalid.length > 0 ? `：${invalid.map((item) => `第 ${(Number(item.step) || 0) + 1} 个选择步骤${item.message ? `（${item.message}）` : ""}`).join("、")}` : "");
      if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") {
        MNUtil.showHUD(missing.length > 0 ? `工作流依赖的扩展动作不可用${suffix}` : `工作流选择器不可用${suffix}`);
      }
      return false;
    },
    buildRootItems,
    buildItems,
  };
})();
