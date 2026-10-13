const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const presentations = [], hud = [];
const context = vm.createContext({ console: { log() {} }, MNUtil: {
  getPopoverAndPresent(button, items, width, position) { presentations.push({ button, items, width, position }); return {}; },
  showHUD(message) { hud.push(message); },
} });
const load = (name) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', `${name}.js`), 'utf8'), context);
load('CommentWorkflowStore');
const store = context.__MN_COMMENT_WORKFLOW_STORE__;
let workflows = store.templates().concat([
  { id: 'user.root', name: '一级自定义', scope: 'both', steps: [{ actionId: 'clearAllComments' }], menu: {
    single: { position: 'hidden', order: 10 }, batch: { position: 'root', order: 10 },
  } },
  { id: 'user.saved', name: '子菜单自定义', scope: 'both', steps: [{ actionId: 'clearAllComments' }], menu: {
    single: { position: 'root', order: 11 }, batch: { position: 'submenu', order: 11 },
  } },
  { id: 'user.missing', name: '依赖缺失', scope: 'batch', steps: [{ actionId: 'patch.missing' }] },
  { id: 'user.single', name: '仅单卡', scope: 'single', steps: [{ actionId: 'clearAllComments' }] },
]);
store.list = () => workflows;
context.__MN_COMMENT_WORKFLOW_REGISTRY__ = {
  getPresets: () => [{ id: 'patch.preset', title: 'Patch 预设', scope: 'both', steps: [{ actionId: 'clearAllComments' }] }],
  getCatalog: () => [{ id: 'patch.action', title: 'Patch 动作', scope: 'both', builtin: false }],
  getAction: (id) => id === 'patch.missing' ? null : { id },
};
load('CommentWorkflowMenu');
const menu = context.__MN_COMMENT_WORKFLOW_MENU__;
const addon = { batchCommentButton: {}, batchCommentContext: { token: 'selection-1', notes: [{ noteId: 'A' }, { noteId: 'B' }] } };
assert.strictEqual(menu.openBatchMenu(addon, addon.batchCommentButton, addon.batchCommentContext), true);
const root = presentations[0].items;
const rootWorkflows = root.filter((item) => item.selector === 'runBatchWorkflow:');
assert.strictEqual(rootWorkflows.length, 7);
assert.strictEqual(rootWorkflows[0].param.workflowId, 'builtin.keepFirstContent');
assert.strictEqual(rootWorkflows[6].param.workflowId, 'user.root');
assert(rootWorkflows.every((item) => item.param.token === 'selection-1'));
assert(!root.some((item) => item.param?.workflowId === 'user.single'));
const links = root.find((item) => item.param?.section === 'links');
assert(links, 'the existing invalid-links submenu is retained');
assert.strictEqual(menu.openBatchWorkflows(addon, links), true);
assert.deepStrictEqual(Array.from(presentations[1].items.filter((item) => item.param?.workflow), (item) => item.param.workflow.steps[0].options.mode), ['card', 'markdown', 'all']);
assert.strictEqual(menu.backWorkflowMenu(addon), true);
assert.strictEqual(menu.openBatchWorkflows(addon, root.find((item) => item.param?.section === 'saved')), true);
const submenu = presentations[3].items;
const missing = submenu.find((item) => item.param?.workflowId === 'user.missing');
assert.strictEqual(missing.selector, 'showWorkflowMissing:');
menu.showWorkflowMissing(addon, missing);
assert(hud[0].includes('patch.missing'));
assert.strictEqual(submenu.find((item) => item.param?.workflowId === 'user.saved').param.workflow.scope, 'both');
assert.strictEqual(menu.backWorkflowMenu(addon), true);
assert.strictEqual(menu.openBatchWorkflows(addon, root.find((item) => item.param?.section === 'extension')), true);
assert(presentations[5].items.some((item) => item.param?.workflow?.id === 'action:patch.action'));
assert.throws(() => menu.openBatchWorkflows(addon, { token: 'stale' }), /多选卡片已变化/);
const singleRoot = menu.buildItems(addon, { token: 'single', noteId: 'A' }, 'single', 'root');
assert(!singleRoot.some((item) => item.param?.workflowId === 'user.root'), 'hidden in one mode remains visible in the other');
assert(singleRoot.some((item) => item.param?.workflowId === 'user.saved' && item.param.noteId === 'A' && item.param.mode === 'single'));
assert(!menu.buildItems(addon, {}, 'single', 'saved').some((item) => item.param?.workflowId === 'user.missing'));
const before = Array.from(rootWorkflows, (item) => item.param.workflowId);
workflows = workflows.map((item) => ({ ...item, usageCount: 99, lastUsedAt: Date.now() }));
assert.deepStrictEqual(Array.from(menu.buildRootItems(addon, addon.batchCommentContext).filter((item) => item.selector === 'runBatchWorkflow:'), (item) => item.param.workflowId), before);
workflows = workflows.map((item) => ({ ...item, menu: { single: { position: 'hidden', order: 0 }, batch: { position: 'hidden', order: 0 } } }));
assert(menu.buildRootItems(addon, addon.batchCommentContext).some((item) => item.selector === 'openWorkflowManager:'), 'management remains accessible when all workflows are hidden');
console.log('comment workflow menu tests passed');
