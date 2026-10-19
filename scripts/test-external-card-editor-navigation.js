const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceRoot = process.argv[2] || path.join(__dirname, '../src');
const A = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const B = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const window = {};
const focusCalls = [];
let methods, response;
const browser = vm.createContext({ window: {
  __MNBridgeReceive_MNCommentManagerAddon(encoded) {
    response = JSON.parse(decodeURIComponent(encoded));
  },
} });
const controller = {
  addon: { window },
  externalCardEditorSession: { noteId: A, language: 'zh-CN' },
  webView: { evaluateJavaScript(script) { vm.runInContext(script, browser); } },
};
const context = vm.createContext({
  console,
  self: controller,
  JSB: { defineClass(_name, members) { methods = members; return {}; } },
  __MN_COMMENT_DATA__: {
    getWrappedNoteById: noteId => ({ noteId }),
    getNoteSnapshot: note => ({ noteId: note.noteId, comments: [] }),
    getCurrentNoteSnapshot: () => ({ noteId: B, comments: [] }),
  },
  Application: { sharedInstance: () => ({ studyController(targetWindow) {
    assert.equal(targetWindow, window, 'navigation must stay in the editor window');
    return {
      focusNoteInMindMapById: id => focusCalls.push(['mindmap', id]),
      focusNoteInFloatMindMapById: id => focusCalls.push(['float', id]),
    };
  } }) },
});
for (const name of ['ExternalCardEditor', 'CommentMutations', 'WebBridgeCommands', 'WebPanelController']) {
  vm.runInContext(fs.readFileSync(path.join(sourceRoot, name + '.js'), 'utf8'), context);
}
function send(command, payload) {
  response = null;
  const absoluteString = 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'navigation-test', command, payload }));
  const allowed = methods.webViewShouldStartLoadWithRequestNavigationType(controller.webView, {
    URL: () => ({ scheme: 'mnaddon', absoluteString: () => absoluteString }),
  }, 0);
  assert.equal(allowed, false);
  assert.ok(response, 'bridge must reply');
  return response;
}
for (const mode of ['mindmap', 'float']) {
  const result = send('focusLinkedNote', { noteId: B, mode });
  assert.equal(result.error, null, 'link targets may differ from the pinned editing card');
  assert.equal(result.payload, true);
  assert.equal(controller.externalCardEditorSession.noteId, A);
  assert.equal(send('refreshCurrentNote', {}).payload.noteId, A, 'navigation must not change the editing target');
}
assert.deepEqual(focusCalls, [['mindmap', B], ['float', B]]);
for (const command of ['editCommentText', 'editMarkdownLink', 'deleteComments', 'moveComments']) {
  assert.match(send(command, { noteId: B }).error.message, /编辑请求已过期/, 'cross-card mutations must remain blocked');
}
const api = context.__MN_CARD_EDITOR_MNCommentManagerAddon;
assert.doesNotThrow(() => api.validateCommand(controller, 'editCommentText', { noteId: A }));
assert.throws(() => api.validateCommand(controller, 'runBatchWorkflow', {}), error => error.code === 'EDITOR_BUSY');
assert.throws(() => api.validateCommand(controller, 'deleteComments', { noteIds: [A, B] }), error => error.code === 'STALE_REQUEST');
api.clear(controller);
assert.equal(send('focusLinkedNote', { noteId: B, mode: 'mindmap' }).error, null, 'ordinary panel navigation must still work');
console.log('PASS external editor link navigation, pinned refresh, window routing and mutation guards');
