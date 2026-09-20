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
assert.strictEqual(store.list()[0].id, second.id, "usage count should drive menu order");
assert.strictEqual(store.list().find((item) => item.id === second.id).usageCount, 2);

assert.throws(() => store.save({ name: "无步骤", steps: [] }), /至少一个动作/);
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
assert.strictEqual(store.list().length, 1);
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
const invalidLoaded = store.list()[0];
assert.strictEqual(invalidLoaded.invalidSelectors.length, 1);
assert.ok(invalidLoaded.steps[0].selectorError);
assert.throws(() => store.save(invalidLoaded), /选择步骤无效/);
files.set(expectedPath, JSON.stringify({ version: 1, workflows: [saved] }));
assert.strictEqual(store.remove(saved.id), true);
assert.strictEqual(JSON.stringify(store.list()), "[]");
assert.strictEqual(store.remove(saved.id), false);

console.log("comment workflow store tests passed");
