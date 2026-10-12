const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:5186';
const output = path.resolve(process.argv[3] || 'Resources/quick-input/opening-review/browser');
(async () => {
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.MN_CHROMIUM_EXECUTABLE || undefined});
 const report=[];
 try {
  for(const [width,height,theme,reduced,failure] of [[1100,700,'light',false,false],[375,812,'light',false,false],[1024,768,'dark',false,false],[375,600,'dark',true,false],[375,600,'light',false,true]]){
   const page=await browser.newPage({viewport:{width,height},colorScheme:theme,reducedMotion:reduced?'reduce':'no-preference'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({failure})=>{
    window.__openRequests=[];
    new MutationObserver(records=>{
     for(const record of records)for(const node of record.addedNodes){
      if(node.tagName!=='IFRAME'||!node.src.startsWith('mnaddon://bridge?payload='))continue;
      const message=JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));window.__openRequests.push(message);
      const reply=()=>window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,...(message.command==='getQuickCommentState'?(failure?{error:{message:'加载失败'}}:{payload:{sessionId:'opening',noteId:'target',draft:'入场草稿',draftRevision:1,markdown:true,submission:null}}):{payload:{started:true}})}));
      if(message.command==='getQuickCommentState')window.__releaseQuickInit=reply;else queueMicrotask(reply);
     }
    }).observe(document,{childList:true,subtree:true});
   },{failure});
   await page.goto(origin+'/quick-comment.html');
   await page.waitForFunction(()=>typeof window.__releaseQuickInit==='function');
   assert.equal(await page.locator('.quick-card').evaluate(e=>Number(getComputedStyle(e).opacity)),0);
   assert.equal(await page.evaluate(()=>window.__openRequests.filter(x=>x.command==='presentQuickComment').length),0);
   await page.evaluate(()=>{
    window.__entryFrames=[];window.__entryStarted=0;
    function sample(){
     const ready=document.querySelector('.quick-ready');
     if(ready&&!window.__entryStarted)window.__entryStarted=performance.now();
     if(window.__entryStarted){const t=performance.now()-window.__entryStarted;window.__entryFrames.push({t,panel:Number(getComputedStyle(document.querySelector('.quick-card')).opacity),backdrop:Number(getComputedStyle(document.querySelector('.quick-backdrop')).opacity),transform:getComputedStyle(document.querySelector('.quick-card')).transform});if(t>360){window.__entryDone=true;return;}}
     requestAnimationFrame(sample);
    }requestAnimationFrame(sample);window.__releaseQuickInit();
   });
   await page.waitForFunction(()=>window.__entryDone);
   const frames=await page.evaluate(()=>window.__entryFrames),requests=await page.evaluate(()=>window.__openRequests);
   assert.equal(requests.filter(x=>x.command==='presentQuickComment').length,1);
   assert.equal(requests.find(x=>x.command==='presentQuickComment').payload.reducedMotion,reduced);
   assert(frames.length>=10);assert(frames.at(-1).panel>.99&&frames.at(-1).backdrop>.99);
   assert(frames.some(x=>x.panel>.05&&x.panel<.9));assert(frames.some(x=>x.backdrop>.05&&x.backdrop<.9));
   assert(frames.every((x,i)=>!i||x.panel>=frames[i-1].panel-.01));
   if(reduced)assert(frames.every(x=>x.transform==='none'));
   if(failure)assert((await page.getByRole('alert').textContent()).includes('加载失败'));
   else assert.equal(await page.getByRole('textbox',{name:'评论内容'}).inputValue(),'入场草稿');
   assert.equal(requests.filter(x=>x.command==='appendQuickComment').length,0);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(output,`opening-${width}-${theme}-${reduced?'reduced':failure?'failure':'normal'}.png`)});
   report.push({width,height,theme,reduced,failure,frames,passed:true});await page.close();
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.map(({frames,...x})=>({...x,frames:frames.length}))));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
