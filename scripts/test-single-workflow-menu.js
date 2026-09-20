const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const presentations = [];
const context = {
  console: { log() {} },
  MNUtil: {
    getPopoverAndPresent(button, items, width, position) {
      const popover = { button, items, width, position, dismissCalls: [],
        dismissPopoverAnimated(animated) { this.dismissCalls.push(animated); } };
      presentations.push(popover);
      return popover;
    },
    showHUD() {},
  },
  __MN_COMMENT_WORKFLOW_STORE__: {
    list() {
      return [
        { id: "single.clean", name: "单卡清理", scope: "single", usageCount: 3, steps: [{ actionId: "clearAllComments" }] },
        { id: "batch.only", name: "仅多卡", scope: "batch", steps: [{ actionId: "clearAllComments" }] },
      ];
    },
  },
  __MN_COMMENT_WORKFLOW_REGISTRY__: {
    getCatalog() { return []; },
    getPresets() { return []; },
    getAction(id) { return id === "clearAllComments" ? { id } : null; },
  },
  __MN_COMMENT_WORKFLOW_RUNNER__: {
    run(_addon, workflow, param) {
      assert.deepStrictEqual(presentations[1].dismissCalls, [true], "close the workflow menu before execution starts");
      assert(_addon.dynamicCommentContext, "closing the menu must preserve the runner context");
      context.__MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(_addon, "workflow.refresh");
      assert.strictEqual(workflow.id, "single.clean");
      assert.strictEqual(param.mode, "single");
      return Promise.resolve({ completed: true });
    },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "DynamicCommentActions.js"), "utf8"), context);

 (async () => {
const addon = {
  dynamicCommentButton: { id: "single-button" },
  dynamicCommentContext: { token: "single-1", noteId: "N1", note: { noteId: "N1" } },
};
const actions = context.__MN_DYNAMIC_COMMENT_ACTIONS__;
assert.strictEqual(actions.openMenu(addon, addon.dynamicCommentButton), true);
const root = presentations[0].items;
const workflowEntry = root.find((item) => item.selector === "openSingleWorkflows:");
assert(workflowEntry, "single-card menu should expose saved workflows");
assert.strictEqual(actions.openSingleWorkflows(addon, workflowEntry), true);
assert.strictEqual(actions.handleMenuDismissed(addon, presentations[0]), true);
assert(addon.dynamicCommentContext, "replacing the root popover must preserve single-card context");
const submenu = presentations[1].items;
assert.strictEqual(submenu[1].selector, "runSingleWorkflow:");
assert.strictEqual(submenu[1].param.mode, "single");
assert.strictEqual(submenu[1].param.noteId, "N1");
assert.strictEqual(submenu[1].param.workflow.scope, "single");
assert.strictEqual(submenu[2].selector, "showSingleWorkflowMissing:");
assert.strictEqual(submenu[2].param.scopeMismatch, true);
assert.strictEqual(actions.backSingleWorkflowMenu(addon), true);
addon.dynamicCommentMenuPopoverController = presentations[1];
const directParamResult = await actions.runSingleWorkflow(addon, {
  workflow: { id: "single.clean", scope: "single", steps: [{ actionId: "clearAllComments" }] },
  mode: "single",
  token: "single-1",
  noteId: "N1",
});
assert.strictEqual(directParamResult.completed, true, "selector direct param must be accepted");
console.log("single workflow menu tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
