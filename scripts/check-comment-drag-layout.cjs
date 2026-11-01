const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { chromium } = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.MNCM_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.argv[3] || '.tmp/drag-handle-layout');
const url = process.argv[2] || 'http://127.0.0.1:5187/';
fs.mkdirSync(output, {recursive:true});
(async () => {
 const { defaultSettings } = await import(path.join(root, 'web/src/lib/commentModules.mjs'));
 const snapshot={noteId:'layout-fixture',noteTitle:'评论布局验证',commentFold:{supported:true,revision:'1'},moduleSettings:defaultSettings(),excerpt:{present:false},comments:[
  {index:0,type:'HtmlComment',text:'<b>Remark</b>'},
  {index:1,type:'drawingComment',text:'',drawingHash:'fixture',drawingPreviewError:'绘图含未支持的字段或字段类型：8'},
  {index:2,type:'textComment',text:'长正文用于验证手柄不会覆盖阅读区。'.repeat(60)},
  {index:3,type:'linkComment',text:'链接评论',linkedNoteId:'linked-fixture',linkedNoteTitle:'较长的链接标题',linkDirection:'both'},
 ].map(c=>({...c,collapsed:false,capabilities:{canMove:true,canCopyText:true,canSetCollapsed:true,canDelete:true,hasImage:c.index===1}}))};
 const browser=await chromium.launch({headless:true,executablePath:process.env.MN_CHROMIUM_EXECUTABLE||undefined});
 const results=[];
 try {
  for(const width of [320,390,640,708,999,1000,1280]) for(const coarse of [false,true]) {
   const page=await browser.newPage({viewport:{width,height:width===640?300:700},hasTouch:coarse,colorScheme:coarse?'dark':'light',reducedMotion:'reduce'});
   // Browser-only favicon requests are outside the embedded WebView fixture.
   await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text()+' '+message.location().url);});
   await page.addInitScript(snapshot=>{
    const original=Node.prototype.appendChild;
    Node.prototype.appendChild=function(node){
     if(node.tagName==='IFRAME'&&node.src.startsWith('mnaddon://bridge?payload=')){
      const msg=JSON.parse(decodeURIComponent(node.src.split('?payload=')[1]));
      queueMicrotask(()=>window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:msg.requestId,payload:['getCurrentNoteComments','refreshCurrentNote'].includes(msg.command)?snapshot:{}})));
      return node;
     }
     return original.call(this,node);
    };
   },snapshot);
   await page.goto(url);await page.waitForSelector('.comment-card.has-drag-handle');
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const measure=()=>page.locator('.comment-card.has-drag-handle').evaluateAll(rows=>rows.map(row=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const handle=row.querySelector('.comment-drag-handle'), h=rect(handle);
    const content=[...row.querySelectorAll('.comment-head,.comment-body,.comment-head button,.comment-head .selection-checkbox')].map(rect);
    return {id:row.id,handle:h,overlap:content.filter(r=>r.right>h.left+.5&&r.left<h.right&&r.top<h.bottom&&r.bottom>h.top)};
   }));
   if(width===708&&!coarse&&process.env.MNCM_COMPARE_BASELINE){
    const selector='style[data-vite-dev-id$="/CommentDragOverview.css"]';
    const style=page.locator(selector),fixed=await style.textContent();
    const original=cp.execFileSync('git',['show',process.env.MNCM_COMPARE_BASELINE+':web/src/components/CommentDragOverview.css'],{cwd:root,encoding:'utf8'});
    await style.evaluate((el,text)=>el.textContent=text,original);
    const before=await measure();assert(before.some(r=>r.overlap.length),'must reproduce original overlap');
    fs.writeFileSync(path.join(output,'before.json'),JSON.stringify(before,null,2));
    await page.screenshot({path:path.join(output,'before.png')});
    await style.evaluate((el,text)=>el.textContent=text,fixed);
   }
   const rows=await measure();
   for(const row of rows){assert.equal(row.overlap.length,0,JSON.stringify({width,coarse,row}));assert(row.handle.width>=43.99&&row.handle.height>=43.99,JSON.stringify({width,coarse,row}));}
   assert.deepEqual(errors,[]);
   if([320,708].includes(width))await page.screenshot({path:path.join(output,`${width}-${coarse?'touch-dark':'mouse-light'}.png`)});
   results.push({width,coarse,rows:rows.length,overlap:0});await page.close();
  }
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(results,null,2));console.log(`Drag-handle layout passed (${results.length} real component viewport/theme/pointer cases).`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
