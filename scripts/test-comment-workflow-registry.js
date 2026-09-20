const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const queuedRun = () => ({ changed: 1 });
const context = {
  console: { log() {} },
  __MN_COMMENT_MANAGER_PATCH_QUEUE__: [
    {
      kind: "action",
      ownerId: "queued.patch",
      definition: {
        id: "queued.action",
        title: "队列动作",
        scope: "batch",
        run: queuedRun,
      },
    },
    {
      kind: "preset",
      ownerId: "queued.patch",
      definition: {
        id: "queued.preset",
        title: "队列预设",
        scope: "batch",
        steps: [{ actionId: "queued.action", options: { count: 1 } }],
      },
    },
  ],
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "CommentWorkflowRegistry.js"), "utf8"),
  context,
  { filename: "CommentWorkflowRegistry.js" },
);

const registry = context.__MN_COMMENT_WORKFLOW_REGISTRY__;
for (const id of ["constructor", "toString", "__proto__"]) {
  assert.strictEqual(registry.getAction(id), null, "only registered actions may resolve");
}
assert.strictEqual(context.__MN_COMMENT_MANAGER_PATCH_QUEUE__.length, 0);
assert.strictEqual(registry.getAction("queued.action").ownerId, "queued.patch");
assert.strictEqual(String(registry.getPresets("batch")[0].id), "queued.preset");
assert.strictEqual(registry.registerBuiltinAction({ id: "clearAllComments", title: "内置", run() {} }), "clearAllComments");
assert.strictEqual(registry.registerAction({ id: "clearAllComments", title: "冲突", run() {} }, "other.patch"), false);
assert.strictEqual(registry.registerAction({ id: "invalid", title: "没有命名空间", run() {} }, "other.patch"), false);
assert.strictEqual(registry.registerAction({ id: "other.action", title: "扩展动作", scope: "both", run() {} }, "other.patch"), true);
assert.strictEqual(registry.registerPreset({ id: "other.preset", title: "扩展预设", scope: "both", steps: [{ actionId: "other.action" }] }, "other.patch"), true);
assert.strictEqual(registry.api.apiVersion, 2);
let readyApi = null;
assert.strictEqual(registry.api.onReady((api) => { readyApi = api; }), true);
assert.strictEqual(readyApi, registry.api);
assert.ok(registry.getCatalog("batch").some((item) => item.id === "other.action" && item.compatible));
assert.strictEqual(registry.unregister("other.patch"), true);
assert.strictEqual(registry.getAction("other.action"), null);
assert.strictEqual(registry.getPresets("batch").some((item) => item.id === "other.preset"), false);
assert.strictEqual(registry.unregister("queued.patch"), true);
assert.strictEqual(registry.getAction("queued.action"), null);
context.__MN_COMMENT_MANAGER_PATCH_QUEUE__.push({ ownerId: "future.patch", kind: "preset", definition: { id: "future.preset", title: "未来", steps: [{ actionId: "clearAllComments" }] } });
assert.strictEqual(registry.unregister("future.patch"), true);
assert.strictEqual(context.__MN_COMMENT_MANAGER_PATCH_QUEUE__.length, 0);

console.log("comment workflow registry tests passed");
