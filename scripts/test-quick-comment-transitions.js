const assert = require('node:assert/strict');
const { setup } = require('./test-quick-comment');
const results=[];
function check(name,test){try{test();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
check('reopen-during-pending-close',()=>{
 const s=setup(),old=s.controller;
 s.api.updateDraft(old,{...s.payload,text:'最后草稿',markdown:true});
 s.api.requestClose(old,{...s.payload,text:'最后草稿',markdown:true});
 const next=s.open();assert.notEqual(next,old,'pending-close windows must not swallow a new open');
 assert.equal(s.api.getState(next).draft,'最后草稿');
 while(s.timers.length)s.timers.shift()();
 assert.equal(s.addon.quickCommentController,next);assert.equal(s.a.comments.length,1);
});
check('old-host-focus-must-not-steal-new-input',()=>{
 const s=setup();s.api.requestClose(s.controller,{sessionId:s.payload.sessionId});s.timers.shift()();
 const next=s.open();s.api.present(next);while(s.timers.length)s.timers.shift()();
 assert(!s.events.includes('focus-host'),'an old close callback must not focus the host after a reopen');
});
check('saved-close-delivery-loss-must-not-reveal-white-canvas',()=>{
 const s=setup();s.api.present(s.controller);s.api.append(s.controller,s.payload);
 s.api.setExit(s.controller,{sessionId:s.payload.sessionId,submissionId:s.payload.submissionId,active:true});
 s.timers.shift()();assert.equal(s.addon.quickCommentController,null,'a confirmed save must finish closing instead of revealing a blank canvas');
 assert.equal(s.a.comments.length,2);
});
check('old-exit-watchdog-must-not-close-a-recovered-input',()=>{
 const s=setup();s.api.present(s.controller);s.api.append(s.controller,s.payload);
 const request={sessionId:s.payload.sessionId,submissionId:s.payload.submissionId,active:true};
 s.api.setExit(s.controller,request);const oldTimer=s.timers.shift();
 s.api.setExit(s.controller,{...request,active:false});s.api.setExit(s.controller,request);
 oldTimer();assert.equal(s.addon.quickCommentController,s.controller);
 s.api.setExit(s.controller,{...request,active:false});while(s.timers.length)s.timers.shift()();
 assert.equal(s.addon.quickCommentController,s.controller);assert.equal(s.controller.view.alpha,1);assert.equal(s.a.comments.length,2);
});
check('reopen-after-save-during-exit-keeps-a-fresh-target',()=>{
 const s=setup(),old=s.controller;s.payload.markdown=true;s.api.append(old,s.payload);
 s.api.setExit(old,{sessionId:s.payload.sessionId,submissionId:s.payload.submissionId,active:true});
 const next=s.open('b');assert.notEqual(next,old);assert.equal(s.api.getState(next).noteId,'b');assert.equal(s.api.getState(next).draft,'');assert.equal(s.api.getState(next).markdown,true);
 while(s.timers.length)s.timers.shift()();assert.equal(s.addon.quickCommentController,next);assert.equal(s.a.comments.length,2);assert.equal(s.b.comments.length,1);
});
check('late-recovery-must-not-reveal-an-accepted-close',()=>{
 const s=setup();s.api.present(s.controller);s.api.append(s.controller,s.payload);
 s.api.requestClose(s.controller,{sessionId:s.payload.sessionId});
 s.api.setExit(s.controller,{sessionId:s.payload.sessionId,submissionId:s.payload.submissionId,active:false});
 assert.equal(s.controller.view.alpha,0);assert.equal(s.addon.quickCommentController,null);assert.equal(s.a.comments.length,2);
});
check('missing-page-readiness-closes-without-losing-draft',()=>{
 const s=setup();s.api.updateDraft(s.controller,{...s.payload,text:'原草稿',markdown:true});
 s.context.self=s.controller;s.bindings.webViewDidFinishLoad();s.timers.shift()();
 assert.equal(s.controller.view.alpha,0);s.timers.shift()();assert.equal(s.addon.quickCommentController,null);
 const next=s.open();assert.equal(s.api.getState(next).draft,'原草稿');assert.equal(s.api.getState(next).markdown,true);assert.equal(s.a.comments.length,1);
});
console.log(JSON.stringify(results,null,2));if(results.some(x=>!x.passed))process.exitCode=1;
