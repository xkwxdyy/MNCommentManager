const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:5176';
const output = path.resolve(process.argv[3] || 'Resources/quick-input/interaction-review');
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.MN_CHROMIUM_EXECUTABLE || undefined});
 console.log('browser ready');
 const report = { settings:[], motion:[] };
 try {
  for(const [width,height,theme] of [[320,568,'light'],[375,812,'light'],[600,700,'light'],[1024,768,'dark']]) {
   console.log('settings',width);
   const page = await browser.newPage({viewport:{width,height},colorScheme:theme});
   page.setDefaultTimeout(15000);
   await page.addInitScript(() => {
    const settings={showBatchButton:true,enableDynamicSingleCardButton:true,showQuickCommentButton:true};
    new MutationObserver(records => {
     for (const record of records) for (const node of record.addedNodes) {
      if(node.tagName!=='IFRAME'||!node.src.startsWith('mnaddon://bridge?payload='))continue;
      const message=JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
      if(message.command==='updateActionButtonSettings')Object.assign(settings,message.payload);
      const payload = message.command==='getCurrentNoteComments' ? {noteId:'layout-card',noteTitle:'界面检查',comments:[]} : ['getActionButtonSettings','updateActionButtonSettings'].includes(message.command) ? {...settings} : {};
      queueMicrotask(()=>window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,payload})));
     }
    }).observe(document,{childList:true,subtree:true});
   });
   await page.goto(origin+'/'); console.log('main loaded');
   await page.getByRole('button',{name:'设置',exact:true}).click();
   await page.locator('.dynamic-action-settings').waitFor();console.log('settings open');
   await page.locator('.dynamic-action-settings').scrollIntoViewIfNeeded();
   const rows=await page.locator('.dynamic-action-settings > label').evaluateAll(rows => rows.map(row=>{
    const span=row.querySelector('span'), select=row.querySelector('.html-select');
    const text=span.getBoundingClientRect(), box=select.getBoundingClientRect();
    return {label:span.textContent,height:text.height,lineHeight:parseFloat(getComputedStyle(span).lineHeight),nowrap:getComputedStyle(span).whiteSpace==='nowrap',right:box.right,gap:box.left-text.right,selectWidth:box.width};
   }));
   assert.equal(rows.length,4); assert(rows.every(row=>row.nowrap&&row.gap>=11.9&&row.right<=width&&row.selectWidth>=100));
   await page.getByRole('combobox',{name:'管理按钮单击',exact:true}).click();
   await page.getByRole('option',{name:'添加评论',exact:true}).click();console.log('settings action chosen');
   await page.locator('.dynamic-action-settings').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,`settings-${width}-${theme}.png`)});
   report.settings.push({width,height,theme,rows,passed:true}); await page.close();
  }
  for(const [width,height,theme] of [[1100,700,'light'],[375,812,'light'],[1024,768,'dark']]) {
   const page=await browser.newPage({viewport:{width,height},colorScheme:theme});
   await page.goto(origin+'/quick-comment.html?demo=1');
   const input=page.getByRole('textbox',{name:'评论内容'}); await input.fill('保存后连续缩小并移向目标卡片。');
   await page.locator('.quick-card').evaluate(async element=>{await Promise.all(element.getAnimations().map(a=>a.finished));});
   await page.evaluate(()=>{
    window.__motionFrames=[]; window.__exitStarted=0; window.__exitEnded=0;
    const sample=()=>{
     const card=document.querySelector('.quick-card'), success=document.querySelector('.quick-success');
     if(success&&!window.__exitStarted)window.__exitStarted=performance.now();
     if(window.__exitStarted){
      const style=getComputedStyle(card);window.__motionFrames.push({t:performance.now()-window.__exitStarted,opacity:parseFloat(style.opacity),backdropOpacity:parseFloat(getComputedStyle(document.querySelector('.quick-backdrop')).opacity),transform:style.transform,visible:!document.querySelector('.quick-closed')});
      if(document.querySelector('.quick-closed')){window.__exitEnded=performance.now();return;}
     }
     requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
   });
   await input.press('Enter'); await page.locator('.quick-closed').waitFor({state:'attached'});
   await page.waitForFunction(()=>window.__exitEnded>0,null,{timeout:15000});
   const motion=await page.evaluate(()=>({frames:window.__motionFrames,duration:window.__exitEnded-window.__exitStarted}));
   assert(motion.duration>=620&&motion.duration<880,JSON.stringify(motion));
   assert(motion.frames.filter(f=>f.visible).length>=20);
   assert(new Set(motion.frames.map(f=>f.transform)).size>=20);
   assert(motion.frames.some(f=>f.t>300&&f.opacity>.75),'panel must remain visible during the flight');
   assert(motion.frames.some(f=>f.t>180&&f.t<480&&f.backdropOpacity>.1&&f.backdropOpacity<.95),'backdrop must fade throughout the panel flight');
   const nearEnd=motion.frames.find(f=>f.t>=540);
   assert(nearEnd?.backdropOpacity<.005,'backdrop must finish fading while the panel is still shrinking');
   assert(nearEnd.visible&&nearEnd.opacity>.3,'panel must remain visible after the backdrop disappears');
   assert(new Set(motion.frames.map(f=>f.backdropOpacity.toFixed(3))).size>=20);
   assert.equal(await page.locator('#quick-demo-comments p').count(),1);
   report.motion.push({width,height,theme,...motion,passed:true});await page.close();
  }
  // Pause only for review screenshots; the checks above sample the real running animation.
  const page=await browser.newPage({viewport:{width:1100,height:700}});
  await page.goto(origin+'/quick-comment.html?demo=1');await page.getByRole('textbox',{name:'评论内容'}).fill('连续缩小、定向移动、末段淡出');
  await page.getByRole('textbox',{name:'评论内容'}).press('Enter');await page.locator('.quick-success').waitFor();
  await page.evaluate(()=>document.querySelector('.quick-overlay').getAnimations({subtree:true}).forEach(a=>a.pause()));
  for(const ms of [80,220,380,520,640]) {
   await page.evaluate(ms=>document.querySelector('.quick-overlay').getAnimations({subtree:true}).forEach(a=>a.currentTime=ms),ms);
   await page.screenshot({path:path.join(output,`flight-${ms}.png`)});
  }
  await page.close();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({settings:report.settings.map(({width,passed})=>({width,passed})),motion:report.motion.map(({width,duration,frames,passed})=>({width,duration,frames:frames.length,passed}))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
