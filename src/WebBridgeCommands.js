var __MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon = (function () {
  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function ping(context, payload) {
    return {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    };
  }

  function echo(context, payload) {
    return {
      echoed: toBridgePayload(payload),
    };
  }

  function openHelpVideo(context, payload) {
    const videos = {
      promo: "https://www.bilibili.com/video/BV1vHnE6YEhe/",
      gettingStarted: "https://www.bilibili.com/video/BV1rpEA6fEau/",
    };
    if (!payload || typeof payload.id !== "string" || !Object.prototype.hasOwnProperty.call(videos, payload.id)) throw new Error("视频入口无效");
    const url = videos[payload.id];
    // A disabled addon may leave its runtime global behind. Unknown host state must use the fallback.
    const disabledAddons = typeof NSUserDefaults !== "undefined"
      ? NSUserDefaults.standardUserDefaults().objectForKey("mindbooks_disabled_extensions") : null;
    const browserDisabled = !disabledAddons || (typeof disabledAddons.containsObject === "function"
      ? disabledAddons.containsObject("marginnote.extension.mnbrowser")
      : !Array.isArray(disabledAddons) || disabledAddons.includes("marginnote.extension.mnbrowser"));
    if (!browserDisabled && typeof MNUtil.isAddonRunning === "function" && MNUtil.isAddonRunning("BROWSER") && typeof MNUtil.postNotification === "function") {
      MNUtil.postNotification("openInBrowser", { url, desktop: true });
    } else if (MNUtil.currentNotebookId && typeof MNUtil.openURLInResearch === "function") {
      MNUtil.openURLInResearch(url);
    } else {
      MNUtil.openURL(url);
    }
    return { opened: true };
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return {
      closed: true,
      payload: toBridgePayload(payload),
    };
  }

  function getCurrentNoteComments(context) {
    return typeof __MN_CARD_EDITOR_MNCommentManagerAddon !== "undefined" ? __MN_CARD_EDITOR_MNCommentManagerAddon.getSnapshot(context && context.controller) : __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function refreshCurrentNote(context) {
    return typeof __MN_CARD_EDITOR_MNCommentManagerAddon !== "undefined" ? __MN_CARD_EDITOR_MNCommentManagerAddon.getSnapshot(context && context.controller) : __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function moveComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.moveComments(payload.noteId, payload.indices, payload.targetIndex);
  }

  function setCommentsCollapsed(context, payload) {
    if (!payload || typeof payload.noteId !== "string" || !payload.noteId) throw new Error("未读取到有效的卡片标识");
    return __MN_COMMENT_MUTATIONS__.setCommentsCollapsed(payload.noteId, payload.indices, payload.collapsed, payload.expectedRevision);
  }

  function moveContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.moveContentSelection(
      payload.noteId,
      payload.selection,
      payload.targetIndex,
    );
  }

  function deleteComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteComments(payload.noteId, payload.indices);
  }

  function deleteContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteContentSelection(payload.noteId, payload.selection);
  }

  function countReverseLinks(context, payload) {
    return {
      reverseCount: __MN_COMMENT_MUTATIONS__.countReverseLinks(payload.noteId, payload.indices),
    };
  }

  function deleteBidirectionalLinks(context, payload) {
    return __MN_COMMENT_MUTATIONS__.deleteBidirectionalLinks(payload.noteId, payload.indices);
  }

  function mergeTextComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.mergeTextComments(
      payload.noteId,
      payload.indices,
      payload.text,
      payload.markdown !== false,
    );
  }

  function mergeContentSelection(context, payload) {
    return __MN_COMMENT_MUTATIONS__.mergeContentSelection(
      payload.noteId,
      payload.selection,
      payload.text,
      payload.markdown !== false,
      payload.mode,
    );
  }

  function mergeCommentsToExcerpt(context, payload) {
    return __MN_COMMENT_MUTATIONS__.mergeCommentsToExcerpt(
      payload.noteId,
      payload.selection,
      payload.text,
      payload.markdown !== false,
    );
  }

  function editCommentText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.editCommentText(
      payload.noteId,
      payload.index,
      payload.text,
      payload.markdown === true,
    );
  }

  function editMarkdownLink(context, payload) {
    return __MN_COMMENT_MUTATIONS__.editMarkdownLink(
      payload.noteId,
      payload.commentIndex,
      payload.linkIndex,
      payload.displayText,
      payload.url,
    );
  }

  function convertHtmlCommentsToMarkdown(context, payload) {
    return __MN_COMMENT_MUTATIONS__.convertHtmlCommentsToMarkdown(
      payload.noteId,
      payload.indices,
    );
  }

  function extractCommentsToChildNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.extractCommentsToChildNote(
      payload.noteId,
      payload.indices,
      payload.title,
      payload.removeOriginal === true,
    );
  }

  function extractContentSelectionToChildNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.extractContentSelectionToChildNote(
      payload.noteId,
      payload.selection,
      payload.title,
      payload.removeOriginal === true,
    );
  }

  function copyText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyText(payload.text);
  }

  function copyContentText(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyContentText(payload.noteId, payload.selection);
  }

  function copyCommentImage(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyCommentImage(payload.noteId, payload.index);
  }

  function copyContentImage(context, payload) {
    return __MN_COMMENT_MUTATIONS__.copyContentImage(payload.noteId, payload.selection);
  }

  function focusLinkedNote(context, payload) {
    return __MN_COMMENT_MUTATIONS__.focusLinkedNote(
      payload.noteId,
      payload.mode,
      context && context.addon ? context.addon.window : null,
    );
  }

  function updateLinkCommentFromClipboard(context, payload) {
    return __MN_COMMENT_MUTATIONS__.updateLinkCommentFromClipboard(
      payload.noteId,
      payload.commentIndex,
    );
  }

  function previewInvalidLinkCleanup(context, payload) {
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(payload && payload.noteId);
    if (!note) throw new Error("没有找到这张卡片，请刷新后再试");
    return __MN_COMMENT_MUTATIONS__.previewInvalidLinkCleanupForNotes([note], {
      allowSingle: true,
      mode: payload && payload.mode,
    });
  }

  function clearInvalidLinks(context, payload) {
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(payload && payload.noteId);
    if (!note) throw new Error("没有找到这张卡片，请刷新后再试");
    const result = __MN_COMMENT_MUTATIONS__.clearInvalidLinksForNotes([note], {
      allowSingle: true,
      mode: payload && payload.mode,
      expectedSignature: payload && payload.expectedSignature,
    });
    return Object.assign({}, result, { snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(note) });
  }

  function getActionButtonSettings() {
    return __MN_COMMENT_ACTION_SETTINGS__.getSettings();
  }

  function updateActionButtonSettings(context, payload) {
    const settings = __MN_COMMENT_ACTION_SETTINGS__.updateSettings(payload);
    if (settings.showBatchButton !== true) __MN_BATCH_COMMENT_ACTIONS__.hideButton(context.addon, "settings.disabled");
    if (settings.enableDynamicSingleCardButton !== true) __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(context.addon, "settings.disabled");
    else __MN_DYNAMIC_COMMENT_ACTIONS__.refreshButtons(context.addon);
    return settings;
  }

  function getWorkflowActionCatalog(_context, payload) {
    const requestedScope = payload && (payload.scope === "single" || payload.scope === "batch" || payload.scope === "both")
      ? payload.scope
      : "both";
    return __MN_COMMENT_WORKFLOW_REGISTRY__.getCatalog(requestedScope);
  }

  function missingWorkflowActions(workflow) {
    const missing = [];
    (workflow && Array.isArray(workflow.steps) ? workflow.steps : []).forEach((step) => {
      const actionId = step && String(step.actionId || "").trim();
      if (actionId && !__MN_COMMENT_WORKFLOW_REGISTRY__.getAction(actionId) && missing.indexOf(actionId) < 0) {
        missing.push(actionId);
      }
    });
    return missing;
  }

  function invalidWorkflowSelectors(workflow) {
    return workflow && Array.isArray(workflow.invalidSelectors) ? workflow.invalidSelectors.slice() : [];
  }

  function decorateWorkflow(workflow) {
    if (!workflow) return null;
    const result = JSON.parse(JSON.stringify(workflow));
    result.missingActions = missingWorkflowActions(result);
    result.invalidSelectors = invalidWorkflowSelectors(result);
    return result;
  }

  function listWorkflows() {
    return (__MN_COMMENT_WORKFLOW_STORE__.listStrict || __MN_COMMENT_WORKFLOW_STORE__.list)().map(decorateWorkflow);
  }

  function getWorkflowTemplates() { return __MN_COMMENT_WORKFLOW_STORE__.templates(); }
  function reorderWorkflows(context, payload) {
    return __MN_COMMENT_WORKFLOW_STORE__.reorder(payload.mode, payload.ids, payload.expectedIds).map(decorateWorkflow);
  }

  function getBatchCommentEditorState(context, payload) {
    const addon = context && context.addon;
    const batch = addon && addon.batchCommentContext;
    const token = payload && payload.token ? String(payload.token) : "";
    if (!batch || !Array.isArray(batch.notes) || batch.notes.length <= 1) throw new Error("未读取到多选卡片，请重新多选后再试");
    if (token && String(batch.token) !== token) throw new Error("多选卡片已变化，请重新打开编辑器");
    return {
      mode: "batch",
      token: String(batch.token || ""),
      noteIds: batch.notes.map((note) => String(note && note.noteId || "")),
      cards: __MN_COMMENT_BATCH_EDITOR__.buildOverview(batch.notes),
      catalog: __MN_COMMENT_WORKFLOW_REGISTRY__.getCatalog("batch"),
      workflows: listWorkflows(),
    };
  }

  function previewBatchWorkflow(context, payload) {
    const addon = context && context.addon;
    const workflow = payload && payload.workflow ? payload.workflow : payload;
    const batch = addon && addon.batchCommentContext;
    if (!batch || !Array.isArray(batch.notes) || batch.notes.length <= 1 || !workflow) throw new Error("未读取到批量工作流");
    const token = payload && payload.token ? String(payload.token) : "";
    if (token && String(batch.token) !== token) throw new Error("多选卡片已变化，请重新打开编辑器");
    const cards = __MN_COMMENT_BATCH_EDITOR__.buildOverview(batch.notes);
    const steps = (workflow.steps || []).map((step) => {
      if (step && String(step.kind || "action").toLowerCase() === "select") {
        const selector = __MN_COMMENT_BATCH_EDITOR__.normalizeSelector(step.selector);
        const perCard = batch.notes.map((note) => __MN_COMMENT_BATCH_EDITOR__.previewSelection(note, selector));
        const matched = perCard.map((item) => item.matched);
        return {
          kind: "select",
          selector,
          matched,
          totalMatched: matched.reduce((sum, count) => sum + count, 0),
          perCard: perCard.map((item) => ({
            matched: item.matched,
            indices: item.indices,
            positionOutOfRange: item.positionOutOfRange,
          })),
        };
      }
      const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step && step.actionId);
      if (!action) throw new Error("工作流依赖的动作不可用");
      const options = __MN_COMMENT_WORKFLOW_REGISTRY__.validateOptions(action, step.options);
      return { kind: "action", actionId: action.id, title: action.title, options };
    });
    return { token: String(batch.token || ""), cards, steps, workflowId: workflow.id || "" };
  }

  async function runBatchWorkflow(context, payload) {
    const addon = context && context.addon;
    const workflow = payload && payload.workflow ? payload.workflow : payload;
    const token = payload && payload.token ? payload.token : "";
    return __MN_COMMENT_WORKFLOW_RUNNER__.run(addon, workflow, { token });
  }

  function saveWorkflow(context, payload) {
    (payload && Array.isArray(payload.steps) ? payload.steps : []).forEach((step) => {
      if (!step || step.kind === "select") return;
      const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step.actionId);
      // Preserve missing extension steps so reinstalling the extension can restore them.
      if (action) {
        __MN_COMMENT_WORKFLOW_REGISTRY__.validateOptions(action, step.options);
        const scope = payload.scope || "batch";
        if (action.scope && action.scope !== "both" && action.scope !== scope) throw new Error(`动作 ${action.title} 不支持工作流的全部适用范围`);
      }
    });
    const saved = __MN_COMMENT_WORKFLOW_STORE__.save(payload);
    return decorateWorkflow(saved);
  }

  function deleteWorkflow(context, payload) {
    const id = payload && payload.id !== undefined ? payload.id : payload;
    return {
      deleted: __MN_COMMENT_WORKFLOW_STORE__.remove(id),
      workflows: listWorkflows(),
    };
  }

  function saveCommentModuleSettings(context, payload) {
    const settings = __MN_COMMENT_MODULE_STORE__.save(payload.settings, payload.expectedRevision);
    return { moduleSettings: settings, moduleSettingsError: '', persisted: true };
  }
  function getCommentModuleSettings() { return __MN_COMMENT_MODULE_STORE__.snapshot(); }
  function reorderCommentModule(context, payload) { return __MN_COMMENT_MODULE_OPERATIONS__.reorder(payload); }
  function moveCommentModuleBody(context, payload) { return __MN_COMMENT_MODULE_OPERATIONS__.moveBody(payload); }
  function extractCommentModule(context, payload) { return __MN_COMMENT_MODULE_OPERATIONS__.extract(payload); }

  const commands = {
    getQuickCommentState: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.getState(context.controller, payload),
    presentQuickComment: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.present(context.controller, payload),
    appendQuickComment: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.append(context.controller, payload),
    setQuickCommentExit: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.setExit(context.controller, payload),
    updateQuickCommentDraft: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.updateDraft(context.controller, payload),
    closeQuickComment: (context, payload) => __MN_QUICK_COMMENT_MNCommentManagerAddon.requestClose(context.controller, payload),
    saveCommentModuleSettings,
    getCommentModuleSettings,
    reorderCommentModule,
    moveCommentModuleBody,
    extractCommentModule,
    ping,
    echo,
    closePanel,
    openHelpVideo,
    getCurrentNoteComments,
    refreshCurrentNote,
    setCommentsCollapsed,
    moveComments,
    moveContentSelection,
    deleteComments,
    deleteContentSelection,
    countReverseLinks,
    deleteBidirectionalLinks,
    mergeTextComments,
    mergeContentSelection,
    mergeCommentsToExcerpt,
    editCommentText,
    editMarkdownLink,
    convertHtmlCommentsToMarkdown,
    extractCommentsToChildNote,
    extractContentSelectionToChildNote,
    copyText,
    copyContentText,
    copyCommentImage,
    copyContentImage,
    focusLinkedNote,
    updateLinkCommentFromClipboard,
    previewInvalidLinkCleanup,
    clearInvalidLinks,
    getActionButtonSettings,
    updateActionButtonSettings,
    getWorkflowActionCatalog,
    listWorkflows,
    getWorkflowTemplates,
    reorderWorkflows,
    getBatchCommentEditorState,
    previewBatchWorkflow,
    runBatchWorkflow,
    saveWorkflow,
    deleteWorkflow,
  };

  return {
    commands,
  };
})();
