var __MN_COMMENT_WORKFLOW_RUNNER__ = (function () {
  const BUILTIN_ACTIONS = [
    {
      id: "keepFirstContent",
      title: "只保留第一条内容",
      dangerous: true,
      mutation: "keepFirstContentForNotes",
    },
    {
      id: "convertHtmlCommentsToMarkdown",
      title: "转换 HTML 为 Markdown",
      dangerous: true,
      mutation: "convertHtmlCommentsToMarkdownForNotes",
    },
    {
      id: "convertNotesToNoExcerpt",
      title: "转为非摘录版",
      dangerous: true,
      mutation: "convertNotesToNoExcerptForNotes",
    },
    {
      id: "removeAllLinkComments",
      title: "去掉所有链接",
      dangerous: true,
      mutation: "removeAllLinkCommentsForNotes",
    },
    {
      id: "clearAllComments",
      title: "清空所有评论",
      dangerous: true,
      mutation: "clearAllCommentsForNotes",
    },
    {
      id: "clearAllTitles",
      title: "清空所有标题",
      dangerous: true,
      mutation: "clearAllTitlesForNotes",
    },
  ];

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function debug(event, details) {
    try { console.log(`[MN Comment Manager][workflow-runner] ${event}`, details || ""); } catch (_) {}
  }

  function isPromiseLike(value) {
    return !!value && typeof value.then === "function";
  }

  function registerBuiltins() {
    BUILTIN_ACTIONS.forEach((definition) => {
      __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
        id: definition.id,
        title: definition.title,
        scope: "both",
        dangerous: definition.dangerous,
        run(context, options) {
          const mutation = __MN_COMMENT_MUTATIONS__[definition.mutation];
          if (typeof mutation !== "function") throw new Error(`内置动作不可用: ${definition.id}`);
          const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
          if (context && context.mode === "single") opts.allowSingle = true;
          return mutation(context && Array.isArray(context.notes) ? context.notes : [], opts);
        },
      });
    });
    __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
      id: "convertSelectedHtmlToMarkdown",
      title: "转换选中的 HTML 评论",
      scope: "both",
      input: "selection",
      dangerous: true,
      run(context) {
        return __MN_COMMENT_BATCH_EDITOR__.convertHtml(context.notes, context.selector || { types: ["html"] });
      },
    });
    __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
      id: "mergeSelectedComments",
      title: "合并选中的评论",
      scope: "both",
      input: "selection",
      dangerous: true,
      run(context, options) {
        return __MN_COMMENT_BATCH_EDITOR__.mergeSelected(context.notes, context.selector || {}, options || {});
      },
    });
    __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
      id: "deleteSelectedComments",
      title: "删除选中的评论",
      scope: "both",
      input: "selection",
      dangerous: true,
      run(context) {
        return __MN_COMMENT_BATCH_EDITOR__.deleteSelected(context.notes, context.selector || {});
      },
    });
    __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
      id: "reverseSelectedComments",
      title: "反转选中评论排列",
      scope: "both",
      input: "selection",
      dangerous: true,
      run(context) {
        return __MN_COMMENT_BATCH_EDITOR__.reverseSelected(context.notes, context.selector || {});
      },
    });
    __MN_COMMENT_WORKFLOW_REGISTRY__.registerBuiltinAction({
      id: "convertSelectedCardsToNoExcerpt",
      title: "选中卡片转为非摘录版",
      scope: "both",
      input: "notes",
      dangerous: true,
      run(context) {
        return __MN_COMMENT_MUTATIONS__.convertNotesToNoExcerptForNotes(context.notes);
      },
    });
  }

  function getBatchContext(addon, token) {
    const source = addon && addon.batchCommentContext;
    if (!source || !Array.isArray(source.notes) || source.notes.length <= 1) {
      throw new Error("未读取到多选卡片，请重新多选后再试");
    }
    if (token && source.token && String(token) !== String(source.token)) {
      throw new Error("多选卡片已变化，请重新打开工作流菜单");
    }
    const noteIds = source.notes.map((note) => text(note && note.noteId).trim()).filter(Boolean);
    if (noteIds.length !== source.notes.length) throw new Error("多选卡片中存在无效卡片，请重新选择");
    if (typeof __MN_COMMENT_DATA__ !== "undefined" && __MN_COMMENT_DATA__ &&
      typeof __MN_COMMENT_DATA__.getWrappedNoteById === "function") {
      source.notes.forEach((note) => {
        if (!__MN_COMMENT_DATA__.getWrappedNoteById(note.noteId)) {
          throw new Error(`卡片已不存在，请重新选择：${note.noteId}`);
        }
      });
    }
    return {
      mode: "batch",
      token: source.token || "",
      addon,
      notes: source.notes.slice(),
      noteIds,
      lanes: source.notes.map((note) => ({
        originNoteId: text(note && note.noteId),
        currentNoteId: text(note && note.noteId),
        parentNoteId: text(note && note.parentNote && note.parentNote.noteId),
        originalSiblingIndex: Number(note && note.indexInBrotherNotes),
        status: "ready",
      })),
    };
  }

  function getSingleContext(addon, token, noteId) {
    const source = addon && addon.dynamicCommentContext;
    debug("single-context.read", { hasAddon: !!addon, hasSource: !!source, hasNote: !!(source && source.note), sourceNoteId: source && source.noteId, requestedNoteId: noteId, tokenMatch: !token || !source || !source.token || String(token) === String(source.token) });
    if (!source || !source.note || !source.noteId) {
      throw new Error("未读取到当前卡片，请重新打开单卡菜单");
    }
    if (token && source.token && String(token) !== String(source.token)) {
      throw new Error("单卡已变化，请重新打开工作流菜单");
    }
    if (noteId && String(noteId) !== String(source.noteId)) {
      throw new Error("单卡已变化，请重新打开工作流菜单");
    }
    if (typeof __MN_COMMENT_DATA__ !== "undefined" && __MN_COMMENT_DATA__ &&
      typeof __MN_COMMENT_DATA__.getWrappedNoteById === "function" &&
      !__MN_COMMENT_DATA__.getWrappedNoteById(source.noteId)) {
      throw new Error(`卡片已不存在，请重新打开菜单：${source.noteId}`);
    }
    const note = source.note;
    const id = text(note.noteId || source.noteId).trim();
    if (!id) throw new Error("当前卡片无效，请重新打开菜单");
    return {
      mode: "single",
      token: source.token || "",
      addon,
      notes: [note],
      noteIds: [id],
      noteId: id,
      lanes: [{
        originNoteId: id,
        currentNoteId: id,
        parentNoteId: text(note && note.parentNote && note.parentNote.noteId),
        originalSiblingIndex: Number(note && note.indexInBrotherNotes),
        status: "ready",
      }],
    };
  }

  function refreshContextNotes(context, result) {
    if (!context || !result || !result.convertedNoteMap || typeof result.convertedNoteMap !== "object") return;
    const map = result.convertedNoteMap;
    const nextNotes = context.notes.map((note) => {
      const sourceId = text(note && note.noteId).trim();
      const targetId = text(map[sourceId]).trim();
      if (!targetId) return note;
      if (typeof __MN_COMMENT_DATA__.getWrappedNoteById !== "function") {
        throw new Error("转换后的卡片无法重新读取，请停止后刷新选择");
      }
      const target = __MN_COMMENT_DATA__.getWrappedNoteById(targetId);
      if (!target) throw new Error(`转换后的卡片不存在: ${targetId}`);
      return target;
    });
    context.notes = nextNotes;
    context.noteIds = nextNotes.map((note) => text(note && note.noteId).trim()).filter(Boolean);
    if (context.mode === "single") context.noteId = context.noteIds[0] || context.noteId;
    if (Array.isArray(context.lanes)) {
      context.lanes.forEach((lane) => {
        const targetId = text(map[lane.currentNoteId] || map[lane.originNoteId]).trim();
        if (targetId) lane.currentNoteId = targetId;
      });
    }
    if (context.addon && context.addon.batchCommentContext) {
      context.addon.batchCommentContext.notes = nextNotes;
    }
    if (context.addon && context.mode === "single" && context.addon.dynamicCommentContext) {
      context.addon.dynamicCommentContext.note = nextNotes[0];
      context.addon.dynamicCommentContext.noteId = text(nextNotes[0] && nextNotes[0].noteId).trim();
    }
  }

  function isLiveBatchContext(context) {
    const live = context && context.addon && context.addon.batchCommentContext;
    return !!(live && String(live.token || "") === String(context.token || "") &&
      Array.isArray(live.notes) && live.notes.length > 1);
  }

  function isLiveSingleContext(context) {
    const live = context && context.addon && context.addon.dynamicCommentContext;
    return !!(live && String(live.token || "") === String(context.token || "") &&
      String(live.noteId || "") === String(context.noteId || "") && live.note);
  }

  function isLiveContext(context) {
    return context && context.mode === "single" ? isLiveSingleContext(context) : isLiveBatchContext(context);
  }

  function workflowDanger(workflow) {
    return (workflow.steps || []).some((step) => {
      if (!step || String(step.kind || "action").toLowerCase() === "select") return false;
      const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step.actionId);
      return action && action.dangerous === true;
    });
  }

  function createActionContext(context, action) {
    if (!action || action.builtin === true) return context;
    const safeAddon = context && context.addon
      ? { window: context.addon.window || null }
      : null;
    const safeContext = {
      mode: context.mode,
      token: context.token,
      notes: context.notes.slice(),
      noteIds: context.noteIds.slice(),
      snapshots: context.notes.map((note) => {
        try {
          const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
          return JSON.parse(JSON.stringify(snapshot || {}));
        } catch (error) {
          return { noteId: text(note && note.noteId), error: "snapshot-unavailable" };
        }
      }),
      addon: safeAddon,
      selector: context && context.selector ? JSON.parse(JSON.stringify(context.selector)) : {},
      selection: context && Array.isArray(context.selection) ? JSON.parse(JSON.stringify(context.selection)) : [],
      lanes: context && Array.isArray(context.lanes) ? JSON.parse(JSON.stringify(context.lanes)) : [],
    };
    try {
      Object.freeze(safeContext.notes);
      if (safeAddon) Object.freeze(safeAddon);
      Object.freeze(safeContext);
    } catch (error) {}
    return safeContext;
  }

  function validateActions(workflow, context) {
    const actions = [];
    (workflow.steps || []).forEach((step) => {
      if (step && String(step.kind || "action").toLowerCase() === "select") {
        const selector = __MN_COMMENT_BATCH_EDITOR__.normalizeSelector(step.selector);
        if (selector.position && selector.position.invalid) {
          throw new Error(`选择步骤无效：${selector.position.error}`);
        }
        actions.push({ kind: "select", selector });
        return;
      }
      const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step.actionId);
      if (!action) throw new Error(`工作流依赖的动作不可用: ${step.actionId}`);
      if (action.scope !== "both" && action.scope !== context.mode) {
        throw new Error(`动作 ${action.title} 不支持当前上下文`);
      }
      if (typeof action.canRun === "function" && action.input !== "selection") {
        const result = action.canRun(createActionContext(context, action), step.options || {});
        if (isPromiseLike(result)) throw new Error(`动作 ${action.title} 的 canRun 必须同步返回`);
        if (result === false || (result && result.ok === false)) {
          throw new Error(result && result.reason ? String(result.reason) : `动作 ${action.title} 当前不可用`);
        }
      }
      actions.push(action);
    });
    return actions;
  }

  async function confirmWorkflow(workflow, context) {
    if (!workflowDanger(workflow) || typeof MNUtil === "undefined" || !MNUtil || typeof MNUtil.confirm !== "function") return true;
    const labels = (workflow.steps || []).map((step) => {
      if (step && String(step.kind || "action").toLowerCase() === "select") return "选择评论集合";
      const action = __MN_COMMENT_WORKFLOW_REGISTRY__.getAction(step.actionId);
      return action ? action.title : step.actionId;
    });
    const message = [
      `将对 ${context.notes.length} 张卡片执行 ${workflow.steps.length} 个步骤。`,
      "",
      labels.map((label, index) => `${index + 1}. ${label}`).join("\n"),
      "",
      "危险步骤会在一个撤销分组中执行；如有需要，可以一次撤销整个工作流。",
    ].join("\n");
    return !!(await MNUtil.confirm("确认执行工作流？", message, ["取消", "确认执行"]));
  }

  function executeSync(workflow, context, actions) {
    const stepResults = [];
    let failedStep = null;
    __MN_UNDO_GROUPING_MNCommentManagerAddon.run(`工作流：${workflow.name}`, { notes: context.notes }, () => {
      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        const step = workflow.steps[index];
        try {
          if (!isLiveContext(context)) throw new Error(context.mode === "single"
            ? "单卡上下文已关闭或发生变化，请重新打开菜单"
            : "多卡上下文已关闭或发生变化，请重新选择卡片");
          if (action.kind === "select") {
            context.selector = action.selector;
            context.selection = context.notes.map((note) => ({
              noteId: text(note && note.noteId),
              indices: __MN_COMMENT_BATCH_EDITOR__.selectCommentIndices(note, action.selector),
            }));
            stepResults.push({ kind: "select", selector: action.selector, matched: context.selection.reduce((sum, item) => sum + item.indices.length, 0) });
            continue;
          }
          if (action.input === "selection" && context.selector) {
            // Actions always receive a fresh selection snapshot. Previous
            // actions may have rewritten comments or replaced a card.
            context.selection = context.notes.map((note) => ({
              noteId: text(note && note.noteId),
              indices: __MN_COMMENT_BATCH_EDITOR__.selectCommentIndices(note, context.selector),
            }));
          }
          const actionContext = createActionContext(context, action);
          if (typeof action.canRun === "function" && action.input === "selection") {
            const canRun = action.canRun(actionContext, step.options || {});
            if (isPromiseLike(canRun) || canRun === false || (canRun && canRun.ok === false)) {
              throw new Error(canRun && canRun.reason ? String(canRun.reason) : `动作 ${action.title} 当前不可用`);
            }
          }
          const result = action.run(actionContext, step.options || {});
          if (isPromiseLike(result)) {
            throw new Error(`动作 ${action.title} 返回异步结果；工作流动作暂要求同步执行`);
          }
          refreshContextNotes(context, result);
          stepResults.push({ actionId: action.id, title: action.title, result: result || null });
          if (result && Number(result.failed || 0) > 0) {
            failedStep = { index, actionId: action.id, title: action.title, result };
            break;
          }
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          const result = { failed: 1, error: message };
          stepResults.push({ actionId: action.id, title: action.title, result });
          failedStep = { index, actionId: action.id, title: action.title, result, error: message };
          break;
        }
      }
    });
    return { stepResults, failedStep };
  }

  async function run(addon, workflowOrId, param) {
    registerBuiltins();
    const rawParam = param && typeof param === "object" ? param : {};
    const workflow = typeof workflowOrId === "object" && workflowOrId
      ? workflowOrId
      : __MN_COMMENT_WORKFLOW_STORE__.get(workflowOrId);
    if (!workflow) throw new Error("工作流不存在或已被删除");
    if (Array.isArray(workflow.invalidSelectors) && workflow.invalidSelectors.length > 0) {
      throw new Error(`工作流包含无效选择器：${workflow.invalidSelectors[0].message || "请在工作流管理器中修复"}`);
    }
    const scope = text(workflow.scope).trim().toLowerCase() || "batch";
    debug("run.request", { workflowId: workflow.id, scope, requestedMode: rawParam.mode, token: rawParam.token, noteId: rawParam.noteId, hasBatchContext: !!(addon && addon.batchCommentContext), hasSingleContext: !!(addon && addon.dynamicCommentContext) });
    if (scope !== "batch" && scope !== "single" && scope !== "both") {
      throw new Error(`工作流「${text(workflow.name || "未命名")}」的支持范围无效`);
    }
    const preferSingle = rawParam.mode === "single" || (scope === "single" && !(addon && addon.batchCommentContext));
    const context = preferSingle
      ? getSingleContext(addon, rawParam.token, rawParam.noteId)
      : getBatchContext(addon, rawParam.token);
    debug("run.context", { mode: context.mode, noteIds: context.noteIds, token: context.token });
    if (scope === "single" && context.mode !== "single") throw new Error("该工作流仅支持单卡，请从单卡菜单执行");
    if (scope === "batch" && context.mode !== "batch") throw new Error("该工作流仅支持多卡，请从多选菜单执行");
    const actions = validateActions(workflow, context);
    if (!(await confirmWorkflow(workflow, context))) {
      if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") MNUtil.showHUD("已取消执行工作流");
      return { cancelled: true, workflowId: workflow.id, name: workflow.name };
    }

    const execution = executeSync(workflow, context, actions);
    const completed = !execution.failedStep && execution.stepResults.length === workflow.steps.length;
    const targetLabel = context.mode === "single" ? "当前卡片" : `${context.notes.length} 张卡片`;
    const summary = completed
      ? `工作流「${workflow.name}」已完成（${workflow.steps.length} 步，${targetLabel}）`
      : `工作流「${workflow.name}」已在第 ${(execution.failedStep ? execution.failedStep.index : execution.stepResults.length) + 1} 步停止`;
    const persistedWorkflow = workflow.id && typeof __MN_COMMENT_WORKFLOW_STORE__.get === "function"
      ? __MN_COMMENT_WORKFLOW_STORE__.get(workflow.id)
      : null;
    if (persistedWorkflow && isLiveContext(context) && execution.stepResults.length > 0 && typeof __MN_COMMENT_WORKFLOW_STORE__.recordUsage === "function") {
      try { __MN_COMMENT_WORKFLOW_STORE__.recordUsage(workflow.id); } catch (error) { console.log(`[MN Comment Manager] workflow usage write failed: ${error}`); }
    }
    if (typeof MNUtil !== "undefined" && MNUtil && typeof MNUtil.showHUD === "function") MNUtil.showHUD(summary);
    return {
      workflowId: workflow.id,
      name: workflow.name,
      completed,
      failedStep: execution.failedStep,
      stepResults: execution.stepResults,
      noteIds: context.noteIds,
      statusMessage: summary,
    };
  }

  registerBuiltins();

  return {
    run,
    getBatchContext,
    getSingleContext,
    isLiveContext,
    builtinActions: BUILTIN_ACTIONS.slice(),
  };
})();
