var __MN_COMMENT_WORKFLOW_STORE__ = (function () {
  const SCHEMA_VERSION = 3;
  const ADDON_ID = "marginnote.extension.mncommentmanager";
  const FILE_NAME = "workflows.json";

  function templates() {
    const definitions = [
      ["keepFirstContent", "只保留第一条内容"],
      ["convertHtmlCommentsToMarkdown", "转换 HTML 为 Markdown"],
      ["convertNotesToNoExcerpt", "转为非摘录版"],
      ["removeAllLinkComments", "去掉所有链接"],
      ["clearInvalidLinks.card", "清除失效卡片链接", "card"],
      ["clearInvalidLinks.markdown", "清除失效 Markdown 行内链接", "markdown"],
      ["clearInvalidLinks.all", "清除全部失效链接", "all"],
      ["clearAllComments", "清空所有评论"],
      ["clearAllTitles", "清空所有标题"],
    ];
    return definitions.map(([id, name, mode], order) => ({
      id: `builtin.${id}`, name, scope: "both", templateId: `builtin.${id}`,
      steps: [{ kind: "action", actionId: mode ? "clearInvalidLinks" : id, options: mode ? { mode } : {} }],
      menu: {
        single: { position: mode ? "links" : "root", order },
        batch: { position: mode ? "links" : "root", order },
      },
    }));
  }

  function menuSettings(raw, fallbackOrder) {
    const result = {};
    ["single", "batch"].forEach((mode) => {
      const setting = raw && raw[mode] || {};
      const order = Number(setting.order);
      result[mode] = {
        position: ["root", "submenu", "links", "hidden"].indexOf(setting.position) >= 0 ? setting.position : "submenu",
        order: setting.order !== null && setting.order !== undefined && Number.isSafeInteger(order) && order >= 0 ? order : fallbackOrder,
      };
    });
    return result;
  }

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
        return { version: SCHEMA_VERSION, workflows: templates().map(normalizeWorkflow), needsMigration: true, sourceVersion: 0 };
      }
      const parsed = decodeData(data);
      const version = Number(parsed && parsed.version);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.workflows) ||
        !Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
        throw new Error("工作流配置无法读取或版本不受支持，已保留原文件，请恢复配置后再试");
      }
      const workflows = parsed.workflows.map(normalizeWorkflow);
      if (forWrite && (workflows.some((workflow, index) => !workflow || workflow.steps.length !== parsed.workflows[index].steps.length) ||
        new Set(workflows.map((workflow) => workflow && workflow.id)).size !== workflows.length)) {
        throw new Error("工作流配置包含无法识别的记录，已保留原文件，请修复配置后再试");
      }
      const legacy = version < SCHEMA_VERSION;
      const ordered = legacy ? sortLegacyForMenu(workflows.filter(Boolean)) : workflows.filter(Boolean);
      if (legacy) ordered.forEach((workflow, index) => { workflow.menu = menuSettings(null, templates().length + index); });
      return {
        version: SCHEMA_VERSION,
        workflows: legacy ? templates().filter((template) => !ordered.some((workflow) => workflow.id === template.id)).map(normalizeWorkflow).concat(ordered) : ordered,
        needsMigration: legacy,
        sourceVersion: version,
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

  function readManagedDocument() {
    const document = readDocument(true);
    if (!document.needsMigration) return document;
    const paths = getFilePath();
    if (!ensureDirectory(paths.root)) throw new Error("无法创建工作流配置目录");
    if (document.sourceVersion) {
      let backup = `${paths.root}/workflows-v${document.sourceVersion}-before-menu-migration.json`;
      const original = readData(paths.file);
      if (!original) throw new Error("工作流迁移备份失败，原配置已保留");
      if (NSFileManager.defaultManager().fileExistsAtPath(backup) &&
        JSON.stringify(canonicalValue(decodeData(readData(backup)))) !== JSON.stringify(canonicalValue(decodeData(original)))) {
        backup = `${paths.root}/workflows-v${document.sourceVersion}-before-menu-migration-${generateId()}.json`;
      }
      if (!NSFileManager.defaultManager().fileExistsAtPath(backup)) {
        if (!original || !original.writeToFileAtomically(backup, true)) throw new Error("工作流迁移备份失败，原配置已保留");
        if (JSON.stringify(canonicalValue(decodeData(readData(backup)))) !== JSON.stringify(canonicalValue(decodeData(original)))) {
          throw new Error("工作流迁移备份未通过回读校验，原配置已保留");
        }
      }
    }
    writeDocument(document.workflows);
    const stored = readDocument(true);
    if (stored.needsMigration || JSON.stringify(canonicalValue(stored.workflows)) !== JSON.stringify(canonicalValue(document.workflows))) {
      throw new Error("工作流迁移结果未通过回读校验，请从备份恢复配置");
    }
    return stored;
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
    return { selector: source, error: "评论位置模式无效，请选择单个位置或位置范围" };
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
      templateId: templates().some((item) => item.id === raw.templateId) ? raw.templateId : "",
      menu: menuSettings(raw.menu, 0),
      steps,
      invalidSelectors,
      usageCount: Math.max(0, Number(raw.usageCount) || 0),
      lastUsedAt: Math.max(0, Number(raw.lastUsedAt) || 0),
      createdAt: Number(raw.createdAt) || now(),
      updatedAt: Number(raw.updatedAt) || now(),
    };
  }

  function validate(raw) {
    if (raw && raw.menu !== undefined) {
      if (!raw.menu || typeof raw.menu !== "object" || Array.isArray(raw.menu)) return { valid: false, errors: ["菜单配置无效"] };
      for (const mode of ["single", "batch"]) {
        const setting = raw.menu[mode];
        if (setting === undefined) continue;
        if (!setting || typeof setting !== "object" || Array.isArray(setting) ||
          ["root", "submenu", "links", "hidden"].indexOf(setting.position) < 0 ||
          (setting.order !== undefined && setting.order !== null && (!Number.isSafeInteger(setting.order) || setting.order < 0))) {
          return { valid: false, errors: ["菜单展示位置或顺序无效"] };
        }
      }
    }
    const workflow = normalizeWorkflow(raw);
    if (!workflow) return { valid: false, errors: ["工作流必须包含名称和至少一个动作"] };
    if (workflow.steps.length !== raw.steps.length) return { valid: false, errors: ["工作流包含空动作或无效步骤，草稿已保留，请修正后保存"] };
    if (workflow.invalidSelectors && workflow.invalidSelectors.length > 0) {
      return { valid: false, errors: workflow.invalidSelectors.map((item) => `第 ${item.step + 1} 个选择步骤无效：${item.message}`) };
    }
    if (!workflow.steps.some((step) => step.kind === "action" && step.actionId)) {
      return { valid: false, errors: ["请至少添加一个执行动作；评论筛选条件不能单独运行"] };
    }
    return { valid: true, errors: [], workflow };
  }

  function list() {
    try { return sortForMenu(readManagedDocument().workflows); }
    catch (error) { console.log(`[MN Comment Manager] load workflows failed: ${error}`); return []; }
  }

  function save(raw) {
    const validation = validate(raw);
    if (!validation.valid) throw new Error(validation.errors[0]);
    const next = validation.workflow;
    const document = readManagedDocument();
    const index = document.workflows.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      next.createdAt = document.workflows[index].createdAt;
      next.usageCount = document.workflows[index].usageCount;
      next.lastUsedAt = document.workflows[index].lastUsedAt;
      next.templateId = document.workflows[index].templateId;
      if (!raw.menu) next.menu = document.workflows[index].menu;
      else ["single", "batch"].forEach((mode) => {
        if (!raw.menu[mode]) next.menu[mode] = document.workflows[index].menu[mode];
        else if (raw.menu[mode].order === undefined || raw.menu[mode].order === null) next.menu[mode].order = document.workflows[index].menu[mode].order;
      });
      document.workflows[index] = next;
    } else {
      ["single", "batch"].forEach((mode) => {
        if (!raw.menu || raw.menu[mode]?.order === undefined || raw.menu[mode]?.order === null) {
          next.menu[mode].order = document.workflows.reduce((max, item) => Math.max(max, item.menu[mode].order), -1) + 1;
        }
      });
      document.workflows.push(next);
    }
    writeDocument(document.workflows);
    // Verify the actual file instead of trusting the write boolean or echoing the draft.
    try {
      const stored = readDocument(true).workflows.find((item) => item.id === next.id);
      if (!stored || JSON.stringify(canonicalValue(stored)) !== JSON.stringify(canonicalValue(next))) {
        throw new Error("工作流回读内容与保存请求不一致");
      }
    } catch (cause) {
      const error = new Error("保存结果未确认：工作流文件未通过回读校验，请核对保存状态；当前草稿已保留");
      error.code = "WORKFLOW_SAVE_UNCONFIRMED";
      error.details = { message: cause && cause.message ? cause.message : String(cause) };
      throw error;
    }
    return next;
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === "object") {
      const result = {};
      Object.keys(value).sort().forEach((key) => { result[key] = canonicalValue(value[key]); });
      return result;
    }
    return value;
  }

  function remove(id) {
    const normalizedId = stringValue(id).trim();
    if (!normalizedId) return false;
    const document = readManagedDocument();
    const next = document.workflows.filter((item) => item.id !== normalizedId);
    if (next.length === document.workflows.length) return false;
    writeDocument(next);
    if (readDocument(true).workflows.some((item) => item.id === normalizedId)) throw new Error("工作流删除结果未通过回读校验");
    return true;
  }

  function sortLegacyForMenu(workflows) {
    return (Array.isArray(workflows) ? workflows.slice() : []).sort((left, right) => (
      (Number(right.usageCount) || 0) - (Number(left.usageCount) || 0) ||
      (Number(right.lastUsedAt) || 0) - (Number(left.lastUsedAt) || 0) ||
      (Number(right.createdAt) || 0) - (Number(left.createdAt) || 0) ||
      String(left.name || "").localeCompare(String(right.name || ""))
    ));
  }

  function sortForMenu(workflows, mode) {
    const key = mode === "batch" ? "batch" : "single";
    return (Array.isArray(workflows) ? workflows.slice() : []).sort((left, right) => (
      menuSettings(left.menu, 0)[key].order - menuSettings(right.menu, 0)[key].order || String(left.id).localeCompare(String(right.id))
    ));
  }

  function reorder(mode, ids, expectedIds) {
    if (mode !== "single" && mode !== "batch") throw new Error("菜单范围无效");
    const document = readManagedDocument();
    const currentIds = sortForMenu(document.workflows, mode).map((item) => item.id);
    if (!Array.isArray(ids) || ids.length !== currentIds.length || new Set(ids).size !== ids.length || ids.some((id) => currentIds.indexOf(id) < 0)) {
      throw new Error("工作流列表已变化，请重新打开管理器后排序");
    }
    if (JSON.stringify(currentIds) !== JSON.stringify(expectedIds)) throw new Error("菜单顺序已变化，请重新打开管理器后排序");
    document.workflows.forEach((item) => { item.menu[mode].order = ids.indexOf(item.id); });
    writeDocument(document.workflows);
    const stored = readDocument(true).workflows;
    if (JSON.stringify(sortForMenu(stored, mode).map((item) => item.id)) !== JSON.stringify(ids)) throw new Error("菜单排序结果未通过回读校验");
    return sortForMenu(stored);
  }

  function recordUsage(id) {
    const normalizedId = stringValue(id).trim();
    if (!normalizedId) return null;
    const document = readManagedDocument();
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
    list,
    get: (id) => list().find((item) => item.id === stringValue(id).trim()) || null,
    save,
    remove,
    recordUsage,
    sortForMenu,
    menuSettings,
    templates,
    reorder,
    listStrict: () => sortForMenu(readManagedDocument().workflows),
    validate,
    path: getFilePath,
  };
})();
