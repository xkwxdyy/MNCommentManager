// Test the production App bundle with an isolated, in-memory native Bridge stand-in.
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { defaultSettings, buildModules, effectiveSettings, moduleMovePlan, structureSignature } from '../web/src/lib/commentModules.mjs';
import { initialState } from '../web/demos/comment-modules/fixtures.mjs';
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.MN_MODULE_DEMO_PLAYWRIGHT || 'playwright');
const root=path.resolve(process.env.MN_MODULE_PANEL_OUTPUT || '/tmp/mncommentmanager-module-integration');
const output=path.resolve('dist/comment-modules-integration-checks');
await mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep))return res.writeHead(404).end();
    const bytes=await readFile(filename);
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(filename)] || 'application/octet-stream';
    res.writeHead(200,{'Content-Type':type}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.MN_MODULE_DEMO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[], errors=[], touchChecks=[];
try{
  for(const [width,height,dark,touchMode=false] of [[1200,800,false],[935,609,false],[600,360,false],[375,480,false],[320,360,false],[375,480,true],[985,1000,false,true]]){
    const context=await browser.newContext({viewport:{width,height},colorScheme:dark?'dark':'light',reducedMotion:'reduce',hasTouch:touchMode});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const fixture=width===600 || touchMode ? initialState().cards.find(c=>c.id==='long') : initialState().cards[0];
    let revision=1;
    let snapshot={noteId:fixture.id,noteTitle:fixture.title,error:'',moduleSettings:defaultSettings(),commentFold:{supported:true,revision:'1'},excerpt:{present:false,capabilities:{}},comments:fixture.comments.map((c,index)=>({...c,index,htmlText:c.type==='HtmlComment'?c.text:'',capabilities:{...c.capabilities,canSetCollapsed:true,canMove:true,canEditText:true,canCopyText:true,isHtml:c.type==='HtmlComment',isMarkdown:c.type==='markdownComment'}}))};
    await page.exposeFunction('__moduleNativeSend',async(command,payload)=>{
      if(['getCurrentNoteComments','refreshCurrentNote'].includes(command))return snapshot;
      if(command==='setCommentsCollapsed'){
        assert.equal(payload.expectedRevision,snapshot.commentFold.revision);
        snapshot={...snapshot,commentFold:{supported:true,revision:String(++revision)},comments:snapshot.comments.map(c=>payload.indices.includes(c.index)?{...c,collapsed:payload.collapsed}:c)};return{snapshot,persisted:true};
      }
      if(command==='saveCommentModuleSettings'){
        assert.equal(payload.expectedRevision,snapshot.moduleSettings.revision);
        snapshot={...snapshot,moduleSettings:{...payload.settings,revision:payload.expectedRevision+1}};return{moduleSettings:snapshot.moduleSettings,persisted:true};
      }
      if(command==='reorderCommentModule'){
        assert.equal(payload.expectedStructure,structureSignature(snapshot.comments));
        const tree=buildModules(snapshot.comments,effectiveSettings(snapshot.moduleSettings,snapshot.noteId).profile);
        const plan=moduleMovePlan(tree,snapshot.comments,payload.moduleId,payload.direction);
        const moving=snapshot.comments.filter(c=>plan.indices.includes(c.index)), remaining=snapshot.comments.filter(c=>!plan.indices.includes(c.index));
        const destination=plan.targetIndex-plan.indices.filter(i=>i<plan.targetIndex).length;
        remaining.splice(destination,0,...moving);snapshot={...snapshot,comments:remaining.map((c,index)=>({...c,index}))};return snapshot;
      }
      return{};
    });
    await page.addInitScript(()=>{
      const append=Node.prototype.appendChild;
      Node.prototype.appendChild=function(node){
        if(node.tagName==='IFRAME' && node.src.startsWith('mnaddon://bridge?payload=')){
          const message=JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
          window.__moduleNativeSend(message.command,message.payload).then(payload=>window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,payload})),error=>window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,error:{message:error.message}})));
          return node;
        }
        return append.call(this,node);
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button',{name:'模块划分设置',exact:true}).waitFor();
    assert.ok(await page.locator('.comment-module').count()>1);
    if(touchMode){
      const cdp=await context.newCDPSession(page);
      const dispatch=async(type,touchPoints)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});if(type==='touchMove')await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
      const point=async index=>{
        const rect=await page.locator(`#comment-${index} .comment-body`).boundingBox();assert.ok(rect);
        return {x:Math.round(rect.x+60),y:Math.round(rect.y+Math.min(24,rect.height/2))};
      };
      const pair=(p,gap=28)=>[{x:p.x,y:p.y,id:1},{x:p.x+gap,y:p.y,id:2}];
      const indices=()=>page.locator('[data-comment-index][aria-pressed=true]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.commentIndex)));
      const record=name=>touchChecks.push(name);
      await page.locator('#comment-4 .comment-head input').check();
      await page.locator('#comment-pane').evaluate(el=>{el.scrollTop=0;});
      const a=await point(0),b=await point(1);
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));
      await page.waitForFunction(()=>document.querySelector('#comment-0 input').checked);
      assert.deepEqual(await indices(),[0,1,4]);
      await dispatch('touchMove',pair(a));assert.deepEqual(await indices(),[0,4]);
      await dispatch('touchMove',pair(b));await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[0,1,4]);record('双指增选、评论序号 0 与反向回缩');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));assert.deepEqual(await indices(),[4]);
      await dispatch('touchMove',pair(a));await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[1,4]);record('双指取消选择并保留范围外选区');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(a,85));await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[1,4]);record('识别前捏合不进入多选');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));await dispatch('touchStart',[...pair(b),{x:10,y:10,id:3}]);await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[1,4]);record('列表外额外触点取消');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));await dispatch('touchCancel',[]);
      assert.deepEqual(await indices(),[1,4]);record('系统取消恢复原有选区');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));await dispatch('touchEnd',[]);
      await page.locator('#comment-0 .comment-head input').focus();await page.keyboard.press('Space');
      assert.deepEqual(await indices(),[1,4]);record('抬手后立即通过键盘调整选区');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));
      await page.getByRole('button',{name:'模块划分设置',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
      assert.deepEqual(await indices(),[1,4]);await dispatch('touchEnd',[]);await page.keyboard.press('Escape');record('配置弹窗中断恢复选区');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));
      await page.getByRole('button',{name:'清空',exact:true}).focus();await page.keyboard.press('Enter');
      await dispatch('touchMove',pair(a));await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[]);record('顶栏选区操作终止手势并保留新选区');
      await dispatch('touchStart',pair(a));await dispatch('touchMove',pair(b));
      await page.evaluate(next=>window.__MNCommentManagerNativeSync({snapshot:next}),{...snapshot,noteId:'switch-test',comments:snapshot.comments.slice(0,2)});
      await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[]);
      await page.evaluate(next=>window.__MNCommentManagerNativeSync({snapshot:next}),snapshot);record('卡片切换清空旧选区');
      await page.locator('#comment-pane').evaluate(el=>{el.scrollTop=0;});
      const origin=await point(0),pane=await page.locator('#comment-pane').boundingBox();
      await dispatch('touchStart',pair(origin));await dispatch('touchMove',pair({x:origin.x,y:Math.round(pane.y+pane.height-8)}));
      await page.waitForFunction(()=>document.querySelector('#comment-pane').scrollTop>45);await dispatch('touchEnd',[]);record('列表边缘自动滚动');
      await page.locator('#comment-pane').evaluate(el=>{el.scrollTop=0;});
      const one=await point(0);await dispatch('touchStart',[{...one,id:1}]);await dispatch('touchMove',[{x:one.x,y:one.y-70,id:1}]);await dispatch('touchMove',[{x:one.x,y:one.y-140,id:1}]);await dispatch('touchEnd',[]);
      await page.waitForFunction(()=>document.querySelector('#comment-pane').scrollTop>30);record('单指原生滚动');
      // Start an independent scenario after inertia rather than claiming a touch
      // that the browser has already committed to native scrolling.
      await page.reload();await page.getByRole('button',{name:'模块划分设置',exact:true}).waitFor();
      await page.locator('.segmented button').filter({hasText:'图片'}).click();
      const imageA=await point(4),imageB=await point(8);
      await dispatch('touchStart',pair(imageA));await dispatch('touchMove',pair(imageB));await dispatch('touchEnd',[]);assert.deepEqual(await indices(),[4,8]);record('筛选后仅选择显示的评论');
      await page.screenshot({path:path.join(output,'panel-touch-selection.png')});
      await page.waitForTimeout(550);
      await page.locator('.segmented button').filter({hasText:'全部'}).click();await page.getByRole('button',{name:'清空',exact:true}).click();
    }
    const header=page.locator('.comment-module-head').nth(2);
    await header.locator('input').check();
    await header.locator('.module-comment-fold').click();
    await page.waitForFunction(()=>document.querySelectorAll('.comment-module-head input:checked').length>0);
    await header.locator('.module-icon').first().click();
    assert.equal(await header.locator('.module-comment-fold').count(),1);
    await header.locator('.module-icon').first().click();
    await page.getByRole('button',{name:'模块划分设置',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'模块划分'});
    await dialog.getByRole('combobox',{name:'设置范围',exact:true}).click();
    await dialog.getByRole('option',{name:'当前卡片',exact:true}).click();
    await dialog.getByRole('combobox',{name:'划分方案',exact:true}).click();
    await dialog.getByRole('option',{name:'HTML＋Markdown',exact:true}).click();
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(snapshot.moduleSettings.cardOverrides[fixture.id].profileId,'nested');
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headers:[...document.querySelectorAll('.comment-module-head')].map(n=>({right:n.getBoundingClientRect().right,left:n.getBoundingClientRect().left})),footer:document.querySelector('.right-pane')?.getBoundingClientRect().toJSON(),pane:document.querySelector('.comment-pane').getBoundingClientRect().toJSON()}));
    assert.ok(layout.scrollWidth<=width+1,JSON.stringify(layout));
    assert.ok(layout.headers.every(h=>h.right<=width+1 && h.left>=-1),JSON.stringify(layout));
    assert.ok(layout.footer.bottom<=height+1 && layout.footer.top>=0,JSON.stringify(layout));
    assert.ok(layout.pane.height>=70,JSON.stringify(layout));
    await page.getByRole('button',{name:'顶部',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.comment-row')].every(n=>getComputedStyle(n).opacity==='1'));
    await page.screenshot({path:path.join(output,`panel-${width}-${height}${dark?'-dark':''}.png`)});
    await page.getByRole('button',{name:'模块划分设置',exact:true}).click();
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'模块划分设置');
    checks.push({viewport:`${width}x${height}`,dark,touchMode,modules:await page.locator('.comment-module').count(),layout});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify({checks,touchChecks,errors},null,2));
  console.log(`Formal panel: ${checks.length} viewport/theme checks and ${touchChecks.length} trusted touch checks passed; no page errors.`);
}finally{await browser.close();server.close();}
