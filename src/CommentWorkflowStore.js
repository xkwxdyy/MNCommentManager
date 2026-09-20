var __MN_COMMENT_WORKFLOW_STORE__ = (function () {
  const SCHEMA_VERSION = 2;
  const ADDON_ID = "marginnote.extension.mncommentmanager";
  const FILE_NAME = "workflows.json";

  function now() {
    return Date.now();
  }

  function stringValue(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function generateId() {
    return `workflow_${now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getFilePath() {
    const app = Application.sharedInstance();
    const documentPath = stringValue(app && app.documentPath).trim().replace(/\/+$/, "");
    if (!documentPath) throw new Error("MarginNote 文稿目录不可用");
    const root = `${documentPath}/${ADDON_ID}`;
    return {
      root,
      file: `${root}/${FILE_NAME}`,
    };
  }

  function ensureDirectory(root) {
    const manager = NSFileManager.defaultManager();
    if (manager.fileExistsAtPath(root)) return true;
    manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(root, true, null);
    return !!manager.fileExistsAtPath(root);
  }

  function readData(filePath) {
    try {
      return NSData.dataWithContentsOfFile(filePath) || null;
    } catch (error) {
      console.log(`[MN Comment Manager] read workflow file failed: ${error && error.message ? error.message : error}`);
      return null;
    }
  }

  function decodeData(data) {
    if (!data) return null;
    try {
      if (typeof data.length === "function" && data.length() <= 0) return null;
    } catch (error) {}
    try {
      if (typeof NSJSONSerialization !== "undefined" && NSJSONSerialization) {
        const parsed = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (error) {
      console.log(`[MN Comment Manager] parse workflow JSON failed: ${error && error.message ? error.message : error}`);
    }
    try {
      const text = NSString.stringWithContentsOfData(data);
      return JSON.parse(String(text || ""));
    } catch (error) {
      return null;
    }
  }

  function encodeData(value) {
    const json = JSON.stringify(value);
    try {
      if (typeof NSJSONSerialization !== "undefined" && NSJSONSerialization &&
        typeof NSJSONSerialization.dataWithJSONObjectOptions === "function") {
        const data = NSJSONSerialization.dataWithJSONObjectOptions(value, 0);
        if (data) return data;
      }
    } catch (error) {
      console.log(`[MN Comment Manager] encode workflow JSON failed: ${error && error.message ? error.message : error}`);
    }
    if (typeof NSData.dataWithStringEncoding === "function") return NSData.dataWithStringEncoding(json, 4);
    throw new Error("当前版本无法写入工作流配置");
  }

  function readDocument(forWrite) {
    let paths;
    try {
      paths = getFilePath();
      const data = readData(paths.file);
      if (!data && !NSFileManager.defaultManager().fileExistsAtPath(paths.file)) {
        return { version: SCHEMA_VERSION, workflows: [] };
      }
      const parsed = decodeData(data);
      const version = Number(parsed && parsed.version);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.workflows) ||
        !Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
        throw new Error("工作流配置无法读取或版本不受支持，已保留原文件，请恢复配置后再试");
      }
      const workflows = parsed.workflows.map(normalizeWorkflow);
      if (forWrite && workflows.some((workflow, index) => !workflow || workflow.steps.length !== parsed.workflows[index].steps.length)) {
        throw new Error("工作流配置包含无法识别的记录，已保留原文件，请修复配置后再试");
      }
      return {
        version: SCHEMA_VERSION,
        workflows: workflows.filter(Boolean),
      };
    } catch (error) {
      console.log(`[MN Comment Manager] load workflows failed: ${error && error.message ? error.message : error}`);
      if (forWrite) throw error;
      return { version: SCHEMA_VERSION, workflows: [] };
    }
  }

  function writeDocument(workflows) {
    const paths = getFilePath();
    if (!ensureDirectory(paths.root)) throw new Error("无法创建工作流配置目录");
    const data = encodeData({ version: SCHEMA_VERSION, workflows });
    if (!data || typeof data.writeToFileAtomically !== "function" || !data.writeToFileAtomically(paths.file, true)) {
      throw new Error("无法保存工作流配置");
    }
    return true;
  }

  function normalizeScope(scope) {
    const value = stringValue(scope).trim().toLowerCase();
    return value === "single" || value === "both" ? value : "batch";
  }

  function normalizeOptions(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) return {};
    try {
      return JSON.parse(JSON.stringify(options));
    } catch (error) {
      return {};
    }
  }

  function parseSafeInteger(value) {
    if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
    if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function normalizeSelector(selector) {
    if (selector === undefined || selector === null) return { selector: {}, error: "" };
    if (typeof selector !== "object" || Array.isArray(selector)) {
      return { selector: {}, error: "选择器必须是对象" };
    }
    const source = normalizeOptions(selector);
    if (source.position === undefined || source.position === null || source.position === "") {
      return { selector: source, error: "" };
    }
    const position = source.position;
    if (!position || typeof position !== "object" || Array.isArray(position)) {
      return { selector: source, error: "评论位置必须是单个索引或范围" };
    }
    const mode = stringValue(position.mode).trim().toLowerCase();
    if (mode === "all") {
      const next = Object.assign({}, source);
      delete next.position;
      return { selector: next, error: "" };
    }
    if (mode === "single") {
      const index = parseSafeInteger(position.index);
      if (index === null) return { selector: source, error: "评论索引必须是整数" };
      return { selector: Object.assign({}, source, { position: { mode: "single", index } }), error: "" };
    }
    if (mode === "range") {
      const start = parseSafeInteger(position.start);
      const end = parseSafeInteger(position.end);
      if (start === null || end === null) return { selector: source, error: "评论范围的起点和终点必须是整数" };
      return { selector: Object.assign({}, source, { position: { mode: "range", start, end } }), error: "" };
    }
    return { selector: source, error: "评论位置模式只能是 single 或 range" };
  }

  function normalizeWorkflow(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = stringValue(raw.id).trim() || generateId();
    const name = stringValue(raw.name).trim();
    if (!name) return null;
    const invalidSelectors = [];
    const steps = Array.isArray(raw.steps)
      ? raw.steps.map((step, stepIndex) => {
        if (!step || typeof step !== "object") return null;
        if (stringValue(step.kind).trim().toLowerCase() === "select") {
          const normalized = normalizeSelector(step.selector);
          if (normalized.error) invalidSelectors.push({ step: stepIndex, message: normalized.error });
          return {
            kind: "select",
            selector: normalized.selector,
            ...(normalized.error ? { selectorError: normalized.error } : {}),
          };
        }
        const actionId = stringValue(step.actionId).trim();
        if (!actionId) return null;
        return { kind: "action", actionId, options: normalizeOptions(step.options) };
      }).filter(Boolean)
      : [];
    if (steps.length <= 0) return null;
    return {
      id,
      name: name.slice(0, 120),
      scope: normalizeScope(raw.scope),
      steps,
      invalidSelectors,
      usageCount: Math.max(0, Number(raw.usageCount) || 0),
      lastUsedAt: Math.max(0, Number(raw.lastUsedAt) || 0),
      createdAt: Number(raw.createdAt) || now(),
      updatedAt: Number(raw.updatedAt) || now(),
    };
  }

  function validate(raw) {
    const workflow = normalizeWorkflow(raw);
    if (!workflow) return { valid: false, errors: ["工作流必须包含名称和至少一个动作"] };
    if (workflow.invalidSelectors && workflow.invalidSelectors.length > 0) {
      return { valid: false, errors: workflow.invalidSelectors.map((item) => `第 ${item.step + 1} 个选择步骤无效：${item.message}`) };
    }
    return { valid: true, errors: [], workflow };
  }

  function list() {
    return readDocument().workflows.slice();
  }

  function save(raw) {
    const validation = validate(raw);
    if (!validation.valid) throw new Error(validation.errors[0]);
    const next = validation.workflow;
    const document = readDocument(true);
    const index = document.workflows.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      next.createdAt = document.workflows[index].createdAt;
      next.usageCount = document.workflows[index].usageCount;
      next.lastUsedAt = document.workflows[index].lastUsedAt;
      document.workflows[index] = next;
    } else {
      document.workflows.push(next);
    }
    writeDocument(document.workflows);
    return next;
  }

  function remove(id) {
    const normalizedId = stringValue(id).trim();
    if (!normalizedId) return false;
    const document = readDocument(true);
    const next = document.workflows.filter((item) => item.id !== normalizedId);
    if (next.length === document.workflows.length) return false;
    writeDocument(next);
    return true;
  }

  function sortForMenu(workflows) {
    return (Array.isArray(workflows) ? workflows.slice() : []).sort((left, right) => (
      (Number(right.usageCount) || 0) - (Number(left.usageCount) || 0) ||
      (Number(right.lastUsedAt) || 0) - (Number(left.lastUsedAt) || 0) ||
      (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0) ||
      String(left.name || "").localeCompare(String(right.name || ""))
    ));
  }

  function recordUsage(id) {
    const normalizedId = stringValue(id).trim();
    if (!normalizedId) return null;
    const document = readDocument(true);
    const index = document.workflows.findIndex((item) => item.id === normalizedId);
    if (index < 0) return null;
    const workflow = document.workflows[index];
    workflow.usageCount = Math.max(0, Number(workflow.usageCount) || 0) + 1;
    workflow.lastUsedAt = now();
    workflow.updatedAt = now();
    writeDocument(document.workflows);
    return workflow;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    list: () => sortForMenu(readDocument().workflows),
    get: (id) => list().find((item) => item.id === stringValue(id).trim()) || null,
    save,
    remove,
    recordUsage,
    sortForMenu,
    validate,
    path: getFilePath,
  };
})();
