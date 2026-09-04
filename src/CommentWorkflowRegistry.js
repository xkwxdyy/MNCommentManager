var __MN_COMMENT_WORKFLOW_REGISTRY__ = (function () {
  const API_VERSION = 2;
  const builtinActions = {};
  const extensionActions = {};
  const extensionPresets = {};
  const builtinActionOrder = [];
  const extensionActionOrder = [];
  const extensionPresetOrder = [];
  const root = typeof globalThis !== "undefined" ? globalThis : {};

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function normalizeScope(scope) {
    const value = text(scope).trim().toLowerCase();
    return value === "single" || value === "both" ? value : "batch";
  }

  function log(message, detail) {
    try {
      console.log(`[MN Comment Manager] ${message}`, detail || "");
    } catch (error) {}
  }

  function isValidId(id, builtin) {
    if (!id || !/^[A-Za-z0-9._:-]+$/.test(id)) return false;
    return builtin || id.indexOf(".") > 0;
  }

  function normalizeDefinition(raw, builtin, ownerId) {
    const definition = raw && typeof raw === "object" ? raw : {};
    const id = text(definition.id).trim();
    if (!isValidId(id, builtin)) throw new Error(`动作 ID 无效: ${id || "(empty)"}`);
    if (!builtin && id.indexOf(".") <= 0) throw new Error(`扩展动作 ID 必须带命名空间: ${id}`);
    if (typeof definition.run !== "function") throw new Error(`动作 ${id} 缺少 run 函数`);
    return {
      id,
      title: text(definition.title).trim().slice(0, 120) || id,
      scope: normalizeScope(definition.scope),
      input: text(definition.input).trim().toLowerCase() === "selection" ? "selection" : "notes",
      dangerous: definition.dangerous === true,
      description: text(definition.description).trim().slice(0, 240),
      canRun: typeof definition.canRun === "function" ? definition.canRun : null,
      run: definition.run,
      ownerId: text(ownerId || definition.ownerId).trim() || (builtin ? "core" : "extension"),
      builtin: builtin === true,
    };
  }

  function registerBuiltinAction(definition) {
    const normalized = normalizeDefinition(definition, true, "core");
    if (!builtinActions[normalized.id]) builtinActionOrder.push(normalized.id);
    builtinActions[normalized.id] = normalized;
    return normalized.id;
  }

  function registerAction(definition, ownerId) {
    let normalized;
    try {
      normalized = normalizeDefinition(definition, false, ownerId);
    } catch (error) {
      log("注册扩展动作失败", error && error.message ? error.message : error);
      return false;
    }
    if (builtinActions[normalized.id] || extensionActions[normalized.id]) {
      log(`拒绝覆盖已存在的动作: ${normalized.id}`);
      return false;
    }
    extensionActions[normalized.id] = normalized;
    extensionActionOrder.push(normalized.id);
    return true;
  }

  function normalizePreset(raw, ownerId) {
    const preset = raw && typeof raw === "object" ? raw : {};
    const id = text(preset.id).trim();
    if (!isValidId(id, false)) throw new Error(`预设 ID 无效: ${id || "(empty)"}`);
    if (!Array.isArray(preset.steps) || preset.steps.length <= 0) throw new Error(`预设 ${id} 没有步骤`);
    const steps = preset.steps.map((step) => {
      if (step && text(step.kind).trim().toLowerCase() === "select") {
        return { kind: "select", selector: JSON.parse(JSON.stringify(step.selector || {})) };
      }
      const actionId = text(step && step.actionId).trim();
      if (!actionId) throw new Error(`预设 ${id} 包含空动作`);
        return {
          kind: "action",
          actionId,
        options: step && step.options && typeof step.options === "object" && !Array.isArray(step.options)
          ? JSON.parse(JSON.stringify(step.options))
          : {},
      };
    });
    return {
      id,
      title: text(preset.title).trim().slice(0, 120) || id,
      scope: normalizeScope(preset.scope),
      input: "notes",
      steps,
      ownerId: text(ownerId || preset.ownerId).trim() || "extension",
    };
  }

  function registerPreset(preset, ownerId) {
    let normalized;
    try {
      normalized = normalizePreset(preset, ownerId);
    } catch (error) {
      log("注册扩展预设失败", error && error.message ? error.message : error);
      return false;
    }
    if (extensionPresets[normalized.id]) {
      log(`拒绝覆盖已存在的预设: ${normalized.id}`);
      return false;
    }
    extensionPresets[normalized.id] = normalized;
    extensionPresetOrder.push(normalized.id);
    return true;
  }

  function unregister(ownerId) {
    const owner = text(ownerId).trim();
    if (!owner) return false;
    let removed = false;
    Object.keys(extensionActions).forEach((id) => {
      if (extensionActions[id].ownerId === owner) {
        delete extensionActions[id];
        const actionIndex = extensionActionOrder.indexOf(id);
        if (actionIndex >= 0) extensionActionOrder.splice(actionIndex, 1);
        removed = true;
      }
    });
    Object.keys(extensionPresets).forEach((id) => {
      if (extensionPresets[id].ownerId === owner) {
        delete extensionPresets[id];
        const presetIndex = extensionPresetOrder.indexOf(id);
        if (presetIndex >= 0) extensionPresetOrder.splice(presetIndex, 1);
        removed = true;
      }
    });
    if (Array.isArray(root.__MN_COMMENT_MANAGER_PATCH_QUEUE__)) {
      const queue = root.__MN_COMMENT_MANAGER_PATCH_QUEUE__;
      const retained = queue.filter((item) => text(item && item.ownerId).trim() !== owner);
      if (retained.length !== queue.length) removed = true;
      root.__MN_COMMENT_MANAGER_PATCH_QUEUE__ = retained;
    }
    return removed;
  }

  function getAction(actionId) {
    const id = text(actionId).trim();
    return builtinActions[id] || extensionActions[id] || null;
  }

  function actionToCatalog(action, scope) {
    if (!action) return null;
    const requestedScope = normalizeScope(scope);
    const compatible = requestedScope === "both" || action.scope === "both" || action.scope === requestedScope;
    return {
      id: action.id,
      title: action.title,
      scope: action.scope,
      dangerous: action.dangerous === true,
      input: action.input || "notes",
      description: action.description,
      ownerId: action.ownerId,
      builtin: action.builtin === true,
      compatible,
    };
  }

  function getCatalog(scope) {
    const actions = [];
    builtinActionOrder.concat(extensionActionOrder).forEach((id) => {
      const item = actionToCatalog(getAction(id), scope);
      if (item) actions.push(item);
    });
    return actions;
  }

  function getPresets(scope) {
    const requestedScope = normalizeScope(scope);
    return extensionPresetOrder
      .map((id) => extensionPresets[id])
      .filter((preset) => requestedScope === "both" || preset.scope === "both" || preset.scope === requestedScope)
      .map((preset) => JSON.parse(JSON.stringify(preset)));
  }

  function installQueuedRegistration(item) {
    if (!item || typeof item !== "object") return false;
    if (item.kind === "action") return registerAction(item.definition, item.ownerId);
    if (item.kind === "preset") return registerPreset(item.definition, item.ownerId);
    return false;
  }

  const api = {
    apiVersion: API_VERSION,
    registerAction,
    registerPreset,
    unregister,
    getActionCatalog: getCatalog,
    getPresets,
    onReady(callback) {
      if (typeof callback !== "function") return false;
      try {
        callback(api);
        return true;
      } catch (error) {
        log("扩展 onReady 回调失败", error && error.message ? error.message : error);
        return false;
      }
    },
  };

  try {
    root.__MN_COMMENT_MANAGER_API__ = api;
    const queue = Array.isArray(root.__MN_COMMENT_MANAGER_PATCH_QUEUE__)
      ? root.__MN_COMMENT_MANAGER_PATCH_QUEUE__.slice()
      : [];
    root.__MN_COMMENT_MANAGER_PATCH_QUEUE__ = [];
    queue.forEach(installQueuedRegistration);
  } catch (error) {
    log("初始化工作流扩展 API 失败", error && error.message ? error.message : error);
  }

  return {
    apiVersion: API_VERSION,
    registerBuiltinAction,
    registerAction,
    registerPreset,
    unregister,
    getAction,
    getCatalog,
    getPresets,
    api,
  };
})();
