var __MN_COMMENT_WORKFLOW_REGISTRY__ = (function () {
  const API_VERSION = 2;
  const builtinActions = Object.create(null);
  const extensionActions = Object.create(null);
  const extensionPresets = Object.create(null);
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

  function validateParameter(field, value) {
    const fail = () => { throw new Error(`参数「${field.label}」无效`); };
    if (field.type === "string") {
      if (typeof value !== "string" || value.length > field.maxLength) fail();
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") fail();
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) ||
          (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max) ||
          (field.integer && !Number.isInteger(value))) fail();
    } else if (!field.choices.some((choice) => choice.value === value)) fail();
    return value;
  }

  function normalizeParameterSchema(raw) {
    if (raw === undefined || raw === null) return null; // Legacy extensions keep their opaque options.
    if (!Array.isArray(raw) || raw.length > 24) throw new Error("动作参数定义必须为数组（最多 24 项）");
    const seen = Object.create(null);
    return raw.map((item) => {
      if (!item || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(item.key) ||
          ["constructor", "prototype", "__proto__"].includes(item.key) || seen[item.key]) throw new Error("动作参数名称无效或重复");
      if (!["string", "boolean", "number", "enum"].includes(item.type)) throw new Error("不支持的动作参数类型");
      seen[item.key] = true;
      const field = { key: item.key, type: item.type, label: text(item.label || item.key).slice(0, 120), required: item.required === true };
      if (item.type === "string") {
        field.maxLength = item.maxLength === undefined ? 4096 : item.maxLength;
        if (!Number.isInteger(field.maxLength) || field.maxLength < 0 || field.maxLength > 10000) throw new Error("参数长度限制无效");
        field.escapedNewlines = item.escapedNewlines === true;
      }
      if (item.type === "number") {
        for (const key of ["min", "max"]) {
          if (item[key] !== undefined) {
            if (typeof item[key] !== "number" || !Number.isFinite(item[key])) throw new Error("参数范围无效");
            field[key] = item[key];
          }
        }
        if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new Error("参数范围无效");
        field.integer = item.integer === true;
      }
      if (item.type === "enum") {
        if (!Array.isArray(item.choices) || !item.choices.length || item.choices.length > 64) throw new Error("参数选项无效");
        const values = Object.create(null);
        field.choices = item.choices.map((choice) => {
          if (!choice || typeof choice.value !== "string" || choice.value.length > 120 || values[choice.value]) throw new Error("参数选项无效或重复");
          values[choice.value] = true;
          return { value: choice.value, label: text(choice.label || choice.value).slice(0, 120) };
        });
      }
      if (Object.prototype.hasOwnProperty.call(item, "default")) field.default = validateParameter(field, item.default);
      return field;
    });
  }

  function validateOptions(action, options) {
    const source = options === undefined || options === null ? {} : options;
    if (typeof source !== "object" || Array.isArray(source)) throw new Error("动作参数必须为对象");
    if (!action.parameterSchema) return JSON.parse(JSON.stringify(source));
    const output = {};
    const fields = action.parameterSchema;
    Object.keys(source).forEach((key) => {
      if (!fields.some((field) => field.key === key)) throw new Error(`动作 ${action.title} 包含未知参数: ${key}`);
    });
    fields.forEach((field) => {
      const value = Object.prototype.hasOwnProperty.call(source, field.key) ? source[field.key] : field.default;
      if (value === undefined) {
        if (field.required) throw new Error(`缺少参数「${field.label}」`);
      } else output[field.key] = validateParameter(field, value);
    });
    return output;
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
      parameterSchema: normalizeParameterSchema(definition.parameterSchema),
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
      parameterSchema: action.parameterSchema ? JSON.parse(JSON.stringify(action.parameterSchema)) : null,
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
    validateOptions,
    getCatalog,
    getPresets,
    api,
  };
})();
