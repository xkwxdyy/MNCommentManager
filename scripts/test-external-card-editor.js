const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const A='AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const B='BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const C='CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';
const win={};
const notes = new Map([A,B,C].map(noteId => [noteId,{noteId}]));
const shows=[];
const callbacks=[];
const timers=[];
const controller = { view:{ hidden:true,superview:null }, _webContentReady:false,
  webView:{evaluateJavaScript(script,callback){callbacks.push(callback);}} };
const addon={window:win,mnCommentManagerInitialized:true,webController:controller};
const context=vm.createContext({
  console,
  MNUtil:{currentWindow:win},
  NSTimer:{scheduledTimerWithTimeInterval(_delay,_repeat,callback){const timer={callback,invalid:false,invalidate(){this.invalid=true;}};timers.push(timer);return timer;}},
  __MN_COMMENT_DATA__:{getWrappedNoteById:id=>notes.get(id),getNoteSnapshot:note=>({noteId:note.noteId,comments:[]}),getCurrentNoteSnapshot:()=>({noteId:B,comments:[]})},
  __MN_WEB_API_MNCommentManagerAddon:{showPanel(c,options){assert.equal(options.externalCardEditor,true);shows.push(c.externalCardEditorSession.noteId);c.view.hidden=false;c.view.superview={};}}
});
vm.runInContext(fs.readFileSync(path.join(root,'src/ExternalCardEditor.js'),'utf8'),context);
const api=context.__MN_CARD_EDITOR_MNCommentManagerAddon;
const request=(noteId,requestId)=>({schema:1,source:'mnpinner',action:'openCardEditor',noteId,requestId,window:win,language:'en-US'});
async function rejects(promise,code){await assert.rejects(promise,error=>error.code===code);}
(async()=>{
  await rejects(api.open(request(A,'before-register')),'EDITOR_UNAVAILABLE');
  api.register(addon);
  const first=await api.open(request(A,'first'));
  assert.equal(first.accepted,true);
  assert.deepEqual(shows,[A]);
  assert.equal(api.getSnapshot(controller).noteId,A,'refresh stays on A despite focus B');
  await api.open(request(A,'first'));
  assert.deepEqual(shows,[A],'duplicate request is idempotent');
  await rejects(api.open(request(B,'first')),'STALE_REQUEST');
  assert.throws(()=>api.validateCommand(controller,'editComment',{noteId:B}),error=>error.code==='STALE_REQUEST');
  api.validateCommand(controller,'editComment',{noteId:A});
  assert.throws(()=>api.validateCommand(controller,'runBatchWorkflow',{}),error=>error.code==='EDITOR_BUSY');
  notes.delete(A);
  assert.throws(()=>api.getSnapshot(controller),error=>error.code==='TARGET_UNAVAILABLE');
  notes.set(A,{noteId:A});
  controller._webContentReady=true;
  const busy=api.open(request(B,'busy'));
  callbacks.shift()('{"ready":false}');
  await rejects(busy,'EDITOR_BUSY');
  assert.equal(api.getSnapshot(controller).noteId,A,'draft rejection preserves target');
  const older=api.open(request(B,'older'));
  const newer=api.open(request(C,'newer'));
  const oldReply=callbacks.shift(); const newReply=callbacks.shift();
  newReply('{"ready":true}'); await newer;
  oldReply('{"ready":true}'); await rejects(older,'STALE_REQUEST');
  assert.equal(api.getSnapshot(controller).noteId,C,'late older request cannot replace C');
  const closing=api.open(request(A,'closing'));
  api.clear(controller); callbacks.shift()('{"ready":true}');
  await rejects(closing,'STALE_REQUEST');
  assert.equal(api.getSnapshot(controller).noteId,B,'close restores ordinary focus-based mode');
  const timeout=api.open(request(A,'timeout'));
  timers[timers.length-1].callback();
  await rejects(timeout,'EDITOR_BUSY');
  callbacks.shift()('{"ready":true}');
  assert.equal(controller.externalCardEditorSession,null,'late preflight after timeout cannot open');
  const cancelled=api.open(request(A,'cancelled'));
  api.cancel('cancelled',win); callbacks.shift()('{"ready":true}');
  await rejects(cancelled,'STALE_REQUEST');
  const switching=api.open(request(A,'switching'));
  context.MNUtil.currentWindow={};callbacks.shift()('{"ready":true}');
  await rejects(switching,'STALE_REQUEST');
  context.MNUtil.currentWindow=win;
  api.unregister(addon);
  await rejects(api.open(request(A,'unregistered')),'EDITOR_UNAVAILABLE');
  await rejects(api.open({...request(A,'wrong-source'),source:'unknown'}),'EDITOR_UNAVAILABLE');
  await rejects(api.open({...request(A,'missing-id'),noteId:''}),'EDITOR_UNAVAILABLE');
  // Production read commands must use the session resolver rather than current focus.
  vm.runInContext(fs.readFileSync(path.join(root,'src/WebBridgeCommands.js'),'utf8'),context);
  api.register(addon);controller.view.hidden=true;
  const hiddenBusy=api.open(request(A,'hidden-busy'));
  callbacks.shift()('{"ready":false}'); await rejects(hiddenBusy,'EDITOR_BUSY');
  const reopened=api.open(request(A,'reopened'));
  callbacks.shift()('{"ready":true}'); await reopened;
  const commands=context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
  assert.equal(commands.getCurrentNoteComments({controller}).noteId,A);
  assert.equal(commands.refreshCurrentNote({controller}).noteId,A);
  console.log('PASS external card editor target, duplicate, drafts, late requests, timeout, window and lifecycle');
})().catch(error=>{console.error(error);process.exitCode=1;});
