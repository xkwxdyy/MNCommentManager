const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.MN_PLAYWRIGHT_MODULE||'playwright');
const {setup}=require('../../scripts/test-quick-comment');
const origin=process.argv[2]||'http://127.0.0.1:5186';
const output=path.resolve(process.argv[3]||'Resources/quick-input/transitions-review/browser');
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.MN_CHROMIUM_EXECUTABLE||undefined});const report=[];
 try{
  for(const [width,height,theme,reduced]of[[1100,700,'light',false],[375,812,'light',false],[1024,768,'dark',false],[375,600,'dark',true]]){
   const s=setup(),page=await browser.newPage({viewport:{width,height},colorScheme:theme,reducedMotion:reduced?'reduce':'no-preference'});
   const controllers=new Map(),requests=[],errors=[],scheduled=new Set();let token=0,hook=null;
   page.on('pageerror',e=>errors.push(e.message));
   s.context.NSTimer.scheduledTimerWithTimeInterval=(delay,_repeat,callback)=>{const id=setTimeout(()=>{scheduled.delete(id);callback();},delay*1000);scheduled.add(id);};
   await page.exposeFunction('__rapidNative',async message=>{
    requests.push(message);const controller=controllers.get(message.token);
    try{const custom=await hook?.(message,controller);if(custom)return custom;
     const methods={getQuickCommentState:'getState',presentQuickComment:'present',updateQuickCommentDraft:'updateDraft',appendQuickComment:'append',setQuickCommentExit:'setExit',closeQuickComment:'requestClose'};
     return{payload:s.api[methods[message.command]](controller,message.payload)};
    }catch(error){return{error:{message:error.message}};}
   });
   await page.addInitScript(()=>{
    window.__rapidToken=new URLSearchParams(location.search).get('probe');
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.tagName!=='IFRAME'||!node.src.startsWith('mnaddon://bridge?payload='))continue;
     const message=JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));message.token=window.__rapidToken;
     window.__rapidNative(message).then(response=>{if(!response.drop)window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,...response}));});
    }}).observe(document,{childList:true,subtree:true});
   });
   async function open(){
    const old=s.addon.quickCommentController,controller=s.open();s.controller=controller;const currentToken=String(++token);controllers.set(currentToken,controller);
    if(old&&old._quickClosePending)assert.notEqual(old,controller);
    const original=controller.webView.evaluateJavaScript;
    controller.webView.evaluateJavaScript=(script,done)=>{original(script,done);page.evaluate(({currentToken,script})=>{if(window.__rapidToken!==currentToken)return;if(script.includes('RecoverOpen'))window.__MNQuickCommentRecoverOpen?.();else window.__MNQuickCommentFocus?.();},{currentToken,script}).catch(()=>{});};
    await page.goto(origin+'/quick-comment.html?probe='+currentToken);await page.waitForFunction(()=>!document.querySelector('textarea').disabled);
    return controller;
   }
   const input=()=>page.getByRole('textbox',{name:'评论内容'});
   try{
    let expectedDraft='',saved=0;
    for(let cycle=0;cycle<12;cycle++){
     const controller=await open();assert.equal(await input().inputValue(),expectedDraft);
     const body=`连续操作 ${cycle}\n保留完整正文`,markdown=cycle%2===1;
     if((await page.getByRole('switch',{name:'Markdown 评论'}).getAttribute('aria-checked'))!==String(markdown))await page.getByRole('switch',{name:'Markdown 评论'}).click();
     await input().fill(body);
     if(cycle%3!==2){
      await page.evaluate(()=>{const b=document.querySelector('[aria-label="关闭输入并保留草稿"]');b.click();b.click();});
      await page.locator('.quick-closed').waitFor({state:'attached'});
      assert.equal(s.api.getState(controller).draft,body);assert.equal(s.api.getState(controller).markdown,markdown);
      assert.equal(await page.locator('.quick-card').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
      assert.equal(await page.locator('.quick-overlay').evaluate(e=>getComputedStyle(e).display),'block');
      expectedDraft=body;
     }else{
      // Force an unfinished entry to make an opacity reset deterministic.
      const pose=await page.locator('.quick-overlay').evaluate(e=>{
       e.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=40;});
       return{panel:Number(getComputedStyle(e.querySelector('.quick-card')).opacity),backdrop:Number(getComputedStyle(e.querySelector('.quick-backdrop')).opacity)};
      });
      await page.evaluate(()=>{
       window.__rapidFrames=[];window.__rapidFinished=false;
       function sample(){const e=document.querySelector('.quick-overlay');if(e.classList.contains('quick-success'))window.__rapidFrames.push({panel:Number(getComputedStyle(e.querySelector('.quick-card')).opacity),backdrop:Number(getComputedStyle(e.querySelector('.quick-backdrop')).opacity)});if(e.classList.contains('quick-closed')){window.__rapidFinished=true;return;}requestAnimationFrame(sample);}
       requestAnimationFrame(sample);
       const e=document.querySelector('textarea');e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));document.querySelector('[aria-label="添加评论"]').click();
      });
      await page.waitForFunction(()=>window.__rapidFinished);
      const frames=await page.evaluate(()=>window.__rapidFrames);
      assert(frames.length>=5);assert(frames.every(f=>f.panel<=pose.panel+.015&&f.backdrop<=pose.backdrop+.015),'early submission must not increase opacity');
      saved++;expectedDraft='';assert.equal(s.a.comments.length,1+saved);assert.equal(s.a.comments.at(-1).text,body);assert.equal(s.a.comments.at(-1).markdown===true,markdown);
      report.push({scenario:'early-submit-opacity-continuity',width,theme,reduced,pose,maxPanel:Math.max(...frames.map(f=>f.panel)),maxBackdrop:Math.max(...frames.map(f=>f.backdrop)),frames:frames.length,passed:true});
     }
     const perWindow=requests.filter(x=>x.token===String(token));assert.equal(perWindow.filter(x=>x.command==='closeQuickComment').length,1);assert.equal(perWindow.filter(x=>x.command==='appendQuickComment').length,cycle%3===2?1:0);
    }
    // A missing close delivery must recover the same body and never retry its write.
    await open();await input().fill('关闭失败保留正文');hook=message=>message.command==='closeQuickComment'?{drop:true}:null;
    await page.getByRole('button',{name:'关闭输入并保留草稿'}).click();await page.getByRole('alert').waitFor();
    assert.equal(await input().inputValue(),'关闭失败保留正文');assert.equal(await input().isEnabled(),true);assert.equal(s.a.comments.length,1+saved);
    assert.equal(requests.filter(x=>x.token===String(token)&&x.command==='closeQuickComment').length,1);hook=null;
    await page.getByRole('button',{name:'关闭输入并保留草稿'}).click();await page.locator('.quick-closed').waitFor({state:'attached'});
    await open();assert.equal(await input().inputValue(),'关闭失败保留正文');
    // An already saved reply can time out during close without an extra append.
    await input().fill('保存完成后关闭未送达');hook=message=>message.command==='closeQuickComment'?{drop:true}:null;
    await input().press('Enter');await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').textContent()).includes('评论已保存'));assert.equal(await input().inputValue(),'保存完成后关闭未送达');assert.equal(await input().isEnabled(),false);
    await page.keyboard.press('Enter');assert.equal(s.a.comments.length,2+saved);assert.equal(requests.filter(x=>x.token===String(token)&&x.command==='appendQuickComment').length,1);
    assert.equal(s.controller.view.alpha,1);assert(!await page.locator('.quick-success').count());
    const closeIds=new Set(requests.filter(x=>x.command==='closeQuickComment').map(x=>x.requestId));assert(!(await page.evaluate(()=>Object.keys(window.__MNBridgePending))).some(id=>closeIds.has(id)));
    assert.deepEqual(errors,[]);report.push({scenario:'repeated-open-close-and-lost-close-recovery',width,theme,reduced,cycles:12,addedComments:1+saved,passed:true});
   }finally{scheduled.forEach(clearTimeout);await page.close();}
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
