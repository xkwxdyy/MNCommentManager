const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const presentations = [];
const hud = [];
const context = {
  console: { log() {} },
  MNUtil: {
    getPopoverAndPresent(button, items, width, position) {
      presentations.push({ button, items, width, position });
      return { delegate: null };
    },
    showHUD(message) { hud.push(message); },
  },
  __MN_COMMENT_WORKFLOW_STORE__: {
    list() {
      return [
        { id: "workflow.clean", name: "清理", steps: [{ actionId: "clearAllComments" }] },
        { id: "workflow.missing", name: "依赖缺失", scope: "batch", steps: [{ actionId: "patch.missing" }] },
      ];
    },
  },
  __MN_COMMENT_WORKFLOW_REGISTRY__: {
    getPresets() { return [{ id: "patch.preset", title: "Patch 预设", scope: "batch", steps: [{ actionId: "clearAllComments" }] }]; },
    getCatalog() { return [{ id: "patch.action", title: "Patch 动作", scope: "batch", builtin: false }]; },
    getAction(id) { return id === "clearAllComments" || id === "patch.action" ? { id } : null; },
  },
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "CommentWorkflowMenu.js"), "utf8"),
  context,
  { filename: "CommentWorkflowMenu.js" },
);

const menu = context.__MN_COMMENT_WORKFLOW_MENU__;
const addon = {
  batchCommentButton: { id: "button" },
  batchCommentContext: { token: "selection-1", notes: [{ noteId: "A" }, { noteId: "B" }] },
};
assert.strictEqual(menu.openBatchMenu(addon, addon.batchCommentButton, addon.batchCommentContext), true);
assert.strictEqual(presentations.length, 1);
const rootItems = presentations[0].items;
assert.strictEqual(rootItems.length, 10);
assert.strictEqual(rootItems[1].param.token, "selection-1");
assert.strictEqual(rootItems[5].selector, "openBatchInvalidLinkMenu:");
assert.strictEqual(rootItems[8].selector, "openBatchWorkflows:");
assert.strictEqual(rootItems[9].selector, "openBatchWorkflows:");
assert.strictEqual(menu.openBatchInvalidLinkMenu(addon, rootItems[5]), true);
assert.strictEqual(presentations.length, 2);
assert.deepStrictEqual(Array.from(presentations[1].items, (item) => String(item.selector)), [
  "backBatchInvalidLinkMenu:", "runBatchClearInvalidLinks:", "runBatchClearInvalidLinks:", "runBatchClearInvalidLinks:",
]);
assert.strictEqual(menu.backBatchInvalidLinkMenu(addon), true);
assert.strictEqual(menu.openBatchWorkflows(addon, rootItems[8]), true);
assert.strictEqual(presentations.length, 4);
const workflowItems = presentations[3].items;
assert.strictEqual(workflowItems[1].selector, "runBatchWorkflow:");
assert.strictEqual(workflowItems[1].param.workflowId, "workflow.clean");
assert.strictEqual(workflowItems[1].param.workflow.scope, "batch");
assert.strictEqual(workflowItems[2].selector, "showWorkflowMissing:");
assert.ok(workflowItems[2].title.includes("缺少动作"));
menu.showWorkflowMissing(addon, workflowItems[2]);
assert.ok(hud[0].includes("patch.missing"));
assert.strictEqual(menu.backWorkflowMenu(addon), true);
assert.strictEqual(presentations.length, 5);
assert.strictEqual(menu.openBatchWorkflows(addon, rootItems[9]), true);
assert.strictEqual(presentations[5].items[2].title.includes("Patch 动作"), true);
assert.strictEqual(presentations[5].items[2].param.workflow.steps[0].actionId, "patch.action");

console.log("comment workflow menu tests passed");
