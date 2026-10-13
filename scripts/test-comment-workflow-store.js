const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const files = new Map();
const directories = new Set();
const documentPath = "/test-documents";

class MockData {
  constructor(value) {
    this.value = String(value || "");
  }

  length() {
    return this.value.length;
  }

  writeToFileAtomically(filePath) {
    files.set(filePath, this.value);
    return true;
  }
}

const context = {
  console: { log() {} },
  Application: {
    sharedInstance() {
      return { documentPath };
    },
  },
  NSFileManager: {
    defaultManager() {
      return {
        fileExistsAtPath(filePath) {
          return directories.has(filePath) || files.has(filePath);
        },
        createDirectoryAtPathWithIntermediateDirectoriesAttributes(filePath) {
          directories.add(filePath);
        },
      };
    },
  },
  NSData: {
    dataWithContentsOfFile(filePath) {
      return files.has(filePath) ? new MockData(files.get(filePath)) : null;
    },
    dataWithStringEncoding(value) {
      return new MockData(value);
    },
  },
  NSJSONSerialization: {
    JSONObjectWithDataOptions(data) {
      return JSON.parse(data.value);
    },
    dataWithJSONObjectOptions(value) {
      return new MockData(JSON.stringify(value));
    },
  },
  NSString: {
    stringWithContentsOfData(data) {
      return data.value;
    },
  },
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "CommentWorkflowStore.js"), "utf8"),
  context,
  { filename: "CommentWorkflowStore.js" },
);

const store = context.__MN_COMMENT_WORKFLOW_STORE__;
const expectedPath = `${documentPath}/marginnote.extension.mncommentmanager/workflows.json`;

// Fresh installations receive editable defaults, persisted only once.
assert.strictEqual(store.list().length, store.templates().length);
const fresh = files.get(expectedPath);
assert.strictEqual(JSON.parse(fresh).version, 3);
assert.strictEqual(store.list().length, 9);
assert.strictEqual(files.get(expectedPath), fresh);
const defaultWorkflow = store.list()[0];
store.save({ ...defaultWorkflow, name: "定制默认操作", menu: {
  single: { position: "hidden", order: 0 }, batch: { position: "root", order: 8 },
} });
store.remove(defaultWorkflow.id);
assert.strictEqual(store.list().some((item) => item.id === defaultWorkflow.id), false, "deleted defaults must not reappear on reload");
// Existing empty v3 documents intentionally contain no defaults.
files.set(expectedPath, JSON.stringify({ version: 3, workflows: [] }));
assert.strictEqual(JSON.stringify(store.list()), "[]");
const saved = store.save({
  name: "清理评论",
  scope: "batch",
  steps: [
    { actionId: "convertHtmlCommentsToMarkdown", options: { keep: true } },
  ],
});
assert.ok(saved.id.startsWith("workflow_"));
assert.strictEqual(store.path().file, expectedPath);
assert.strictEqual(JSON.stringify(store.list()[0].steps[0].options), JSON.stringify({ keep: true }));
assert.ok(files.has(expectedPath));
assert.ok(directories.has(`${documentPath}/marginnote.extension.mncommentmanager`));
assert.throws(() => store.save({
  name: "非法位置",
  steps: [{ kind: "select", selector: { position: { mode: "single", index: "1.5" } } }],
}), /评论索引必须是整数/);

const updated = store.save({
  id: saved.id,
  name: "清理评论（更新）",
  steps: [{ actionId: "clearAllComments", options: {} }],
  createdAt: 1,
  updatedAt: 2,
});
assert.strictEqual(updated.createdAt, saved.createdAt);
assert.strictEqual(store.list()[0].name, "清理评论（更新）");

const second = store.save({ name: "另一个流程", steps: [{ actionId: "clearAllTitles" }] });
store.recordUsage(second.id);
store.recordUsage(second.id);
store.recordUsage(updated.id);
assert.strictEqual(store.list()[0].id, saved.id, "usage count must not change manual menu order");
const originalOrder = store.list().map((item) => item.id);
store.reorder("single", originalOrder.slice().reverse(), originalOrder);
assert.strictEqual(store.list()[0].id, second.id);
assert.strictEqual(store.get(saved.id).menu.batch.order, 0, "single menu reordering must not change batch order");
assert.throws(() => store.reorder("single", originalOrder, originalOrder), /菜单顺序已变化/);
assert.throws(() => store.reorder("batch", [saved.id, saved.id], originalOrder), /工作流列表已变化/);
assert.strictEqual(store.list().find((item) => item.id === second.id).usageCount, 2);

assert.throws(() => store.save({ name: "无步骤", steps: [] }), /至少一个动作/);
const legacy = JSON.stringify({ version: 2, workflows: [{ ...saved, usageCount: 1 }, { ...second, usageCount: 4 }] });
files.set(expectedPath, legacy);
const migrated = store.list();
assert.strictEqual(migrated.length, 11);
assert.strictEqual(files.get(expectedPath.replace("workflows.json", "workflows-v2-before-menu-migration.json")), legacy);
assert.strictEqual(migrated[9].id, second.id, "migration freezes the previous usage-based order");
assert.strictEqual(migrated[10].menu.single.position, "submenu");
assert.strictEqual(migrated[10].menu.batch.position, "submenu");
const editedDefault = migrated[0];
store.save({ ...editedDefault, name: "用户定制", steps: [{ actionId: "clearAllTitles" }] });
assert.strictEqual(store.get(editedDefault.id).name, "用户定制");
store.save(store.templates()[0]);
assert.strictEqual(store.get(editedDefault.id).name, store.templates()[0].name);
const invalidMenuFile = files.get(expectedPath);
assert.throws(() => store.save({ ...saved, menu: { single: { position: "unknown", order: 0 } } }), /菜单展示/);
assert.strictEqual(files.get(expectedPath), invalidMenuFile);
files.set(expectedPath, "");
assert.strictEqual(JSON.stringify(store.list()), "[]");
const invalidDocuments = ["", "{not-json", JSON.stringify({ version: 999, workflows: [saved] }),
  JSON.stringify({ version: 1.5, workflows: [saved] }), JSON.stringify({ workflows: [saved] }),
  JSON.stringify({ version: 2, workflows: [saved, null] }),
  JSON.stringify({ version: 2, workflows: [{ ...saved, steps: [...saved.steps, null] }] })];
for (const content of invalidDocuments) {
  files.set(expectedPath, content);
  for (const mutate of [() => store.save(saved), () => store.remove(saved.id), () => store.recordUsage(saved.id)]) {
    assert.throws(mutate, /工作流配置/);
    assert.strictEqual(files.get(expectedPath), content, "unreadable documents must remain untouched");
  }
}
files.set(expectedPath, JSON.stringify({ version: 2, workflows: [saved] }));
const readData = context.NSData.dataWithContentsOfFile;
const readableContent = files.get(expectedPath);
context.NSData.dataWithContentsOfFile = () => null;
assert.throws(() => store.save(saved), /工作流配置/);
assert.strictEqual(files.get(expectedPath), readableContent);
context.NSData.dataWithContentsOfFile = () => { throw new Error("read unavailable"); };
assert.throws(() => store.save(saved), /工作流配置/);
assert.strictEqual(files.get(expectedPath), readableContent);
context.NSData.dataWithContentsOfFile = readData;
files.set(expectedPath, "{not-json");
assert.strictEqual(JSON.stringify(store.list()), "[]");
files.set(expectedPath, JSON.stringify({ version: 999, workflows: [saved] }));
assert.strictEqual(JSON.stringify(store.list()), "[]");
files.set(expectedPath, JSON.stringify({ version: 1, workflows: [saved, null, { name: "无步骤", steps: [] }] }));
assert.strictEqual(store.list().length, 0, "invalid legacy records must not be silently dropped during migration");
files.set(expectedPath, JSON.stringify({
  version: 2,
  workflows: [{
    id: "invalid-position",
    name: "非法位置（已存在）",
    steps: [
      { kind: "select", selector: { position: { mode: "single", index: "oops" } } },
      { actionId: "deleteSelectedComments" },
    ],
  }],
}));
const invalidLoaded = store.get("invalid-position");
assert.strictEqual(invalidLoaded.invalidSelectors.length, 1);
assert.ok(invalidLoaded.steps[0].selectorError);
assert.throws(() => store.save(invalidLoaded), /选择步骤无效/);
files.set(expectedPath, JSON.stringify({ version: 1, workflows: [saved] }));
assert.strictEqual(store.remove(saved.id), true);
assert.strictEqual(store.list().length, 9);
assert.strictEqual(store.remove(saved.id), false);

for (const actionId of ["foldSelectedComments", "unfoldSelectedComments"]) {
  const folded = store.save({ name: actionId, scope: "both", steps: [
    { kind: "select", selector: { types: ["text"], position: { mode: "single", index: 0 } } },
    { kind: "action", actionId, options: {} },
  ] });
  assert.strictEqual(store.get(folded.id).steps[1].actionId, actionId);
}
const existingMenuWorkflow = store.list()[0];
const menuBeforePartialSave = existingMenuWorkflow.menu.batch;
store.save({ ...existingMenuWorkflow, menu: { single: { position: "hidden", order: null } } });
assert.strictEqual(JSON.stringify(store.get(existingMenuWorkflow.id).menu.batch), JSON.stringify(menuBeforePartialSave), "partial menu edits must preserve the other mode");
const beforeSelectorOnly = files.get(expectedPath);
assert.throws(() => store.save({ name: '只有筛选', scope: 'both', steps: [{ kind: 'select', selector: {} }] }), /不能单独运行/);
assert.strictEqual(files.get(expectedPath), beforeSelectorOnly);
const beforeInvalid = files.get(expectedPath);
assert.throws(() => store.save({ name: "空动作", steps: [{ kind: "select", selector: {} }, { kind: "action", actionId: "" }] }), /空动作/);
assert.strictEqual(files.get(expectedPath), beforeInvalid, "invalid new steps must not silently disappear or overwrite the file");

// Migration must abort before touching the source if its backup cannot be verified.
const sourceBeforeBackupFailure = JSON.stringify({ version: 1, workflows: [saved] });
files.set(expectedPath, sourceBeforeBackupFailure);
for (const backupPath of [...files.keys()]) if (backupPath.includes('before-menu-migration')) files.delete(backupPath);
const backupWrite = MockData.prototype.writeToFileAtomically;
MockData.prototype.writeToFileAtomically = function (filePath) {
  if (filePath.includes('before-menu-migration')) return false;
  return backupWrite.call(this, filePath);
};
assert.throws(() => store.listStrict(), /迁移备份失败/);
assert.strictEqual(files.get(expectedPath), sourceBeforeBackupFailure);
MockData.prototype.writeToFileAtomically = backupWrite;
assert.strictEqual(store.listStrict().length, 10);
files.set(expectedPath, JSON.stringify({ version: 2, workflows: [{ ...saved, id: 'builtin.keepFirstContent', name: '同名标识的旧工作流' }] }));
assert.strictEqual(store.listStrict().filter(item => item.id === 'builtin.keepFirstContent').length, 1);
assert.strictEqual(store.get('builtin.keepFirstContent').name, '同名标识的旧工作流');
const duplicateContent = JSON.stringify({ version: 3, workflows: [saved, saved] });
files.set(expectedPath, duplicateContent);
assert.throws(() => store.save(saved), /工作流配置/);
assert.strictEqual(files.get(expectedPath), duplicateContent);
files.set(expectedPath, JSON.stringify({ version: 3, workflows: [saved] }));

const originalWrite = MockData.prototype.writeToFileAtomically;
let writeAttempts = 0;
MockData.prototype.writeToFileAtomically = function (filePath) {
  writeAttempts += 1;
  const document = JSON.parse(this.value);
  document.workflows.at(-1).steps.pop();
  files.set(filePath, JSON.stringify(document));
  return true;
};
assert.throws(() => store.save({ name: "回读丢失动作", steps: [
  { kind: "select", selector: {} }, { actionId: "foldSelectedComments" },
] }), (error) => error.code === "WORKFLOW_SAVE_UNCONFIRMED");
assert.strictEqual(writeAttempts, 1, "a write reporting true but dropping a step must not be retried or acknowledged");
MockData.prototype.writeToFileAtomically = originalWrite;

console.log("comment workflow store tests passed");
