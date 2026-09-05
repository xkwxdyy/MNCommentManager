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

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return {
      closed: true,
      payload: toBridgePayload(payload),
    };
  }

  function getCurrentNoteComments() {
    return __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function refreshCurrentNote() {
    return __MN_COMMENT_DATA__.getCurrentNoteSnapshot();
  }

  function moveComments(context, payload) {
    return __MN_COMMENT_MUTATIONS__.moveComments(payload.noteId, payload.indices, payload.targetIndex);
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
    return __MN_COMMENT_WORKFLOW_STORE__.list().map(decorateWorkflow);
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
    if (!batch || !workflow) throw new Error("未读取到批量工作流");
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
      return { kind: "action", actionId: step && step.actionId ? String(step.actionId) : "", title: action ? action.title : "未知动作" };
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

  const commands = {
    ping,
    echo,
    closePanel,
    getCurrentNoteComments,
    refreshCurrentNote,
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
