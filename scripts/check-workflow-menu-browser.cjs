const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.MN_PLAYWRIGHT_MODULE || 'playwright');
const input=path.resolve(process.argv[2] || 'dist');
const output=path.resolve(process.argv[3] || 'dist/workflow-menu-browser');
fs.mkdirSync(output,{recursive:true});
const preview=path.join(output,'preview');
fs.mkdirSync(path.join(preview,'assets'),{recursive:true});
for(const name of ['CommentWorkflowStore.js','CommentWorkflowRegistry.js','CommentWorkflowRunner.js','CommentWorkflowMenu.js','WebBridgeCommands.js']) fs.copyFileSync(path.join(input,name),path.join(preview,name));
for(const name of ['app.js','app.css']) fs.copyFileSync(path.join(input,'web-dist/assets',name),path.join(preview,'assets',name));
fs.writeFileSync(path.join(preview,'demo-native.js'), `
const demoFiles = new Map(), demoDirs = new Set();
class DemoData { constructor(value) { this.value=value; } length() { return this.value.length; } writeToFileAtomically(path) { demoFiles.set(path,this.value); return true; } }
var Application={ sharedInstance:()=>({documentPath:'/demo'}) };
var NSFileManager={ defaultManager:()=>({fileExistsAtPath:path=>demoFiles.has(path)||demoDirs.has(path),createDirectoryAtPathWithIntermediateDirectoriesAttributes:path=>demoDirs.add(path)}) };
var NSData={dataWithContentsOfFile:path=>demoFiles.has(path)?new DemoData(demoFiles.get(path)):null,dataWithStringEncoding:value=>new DemoData(value)};
var NSJSONSerialization={JSONObjectWithDataOptions:data=>JSON.parse(data.value),dataWithJSONObjectOptions:value=>new DemoData(JSON.stringify(value))};
var NSString={stringWithContentsOfData:data=>data.value};
var __MN_COMMENT_DATA__={getCurrentNoteSnapshot:()=>({noteId:'demo-card',title:'工作流菜单演示',comments:[],excerpt:{present:false}})};
var __MN_COMMENT_ACTION_SETTINGS__={getSettings:()=>({showBatchButton:true,enableDynamicSingleCardButton:true})};
new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
 if(node.tagName!=='IFRAME'||!node.src.startsWith('mnaddon://bridge?payload='))return;
 const message=JSON.parse(decodeURIComponent(node.src.split('payload=')[1]));
 try {const handler=__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands[message.command];
 const result=handler?handler({addon:{}},message.payload):{};
 window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,payload:result}));
 }catch(error){window.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({requestId:message.requestId,error:{message:error.message}}));}
}))).observe(document.body,{childList:true});
`);
const scripts=['demo-native.js','CommentWorkflowStore.js','CommentWorkflowRegistry.js','CommentWorkflowRunner.js','CommentWorkflowMenu.js','WebBridgeCommands.js','assets/app.js'];
fs.writeFileSync(path.join(preview,'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作流菜单验证</title><link rel="stylesheet" href="assets/app.css"><body><div id="root"></div>'+scripts.map(name=>'<script src="'+name+'"></script>').join('')+'</body></html>');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.MN_CHROMIUM_EXECUTABLE || undefined});
 const report=[];
 try {
  for(const [width,height,colorScheme] of [[1200,700,'light'],[985,600,'light'],[600,480,'light'],[600,360,'light'],[375,480,'light'],[320,360,'light'],[1024,768,'dark']]){
   const page=await browser.newPage({viewport:{width,height},colorScheme,hasTouch:width<800});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(require('node:url').pathToFileURL(path.join(preview,'index.html')).href);
   await page.getByRole('button',{name:'工作流',exact:true}).click();
   await page.locator('.workflow-list-item').first().waitFor();
   assert.equal(await page.locator('.workflow-list-item').count(),9);
   const dialog=page.locator('.workflow-manager');
   await dialog.evaluate(async el => {
     await Promise.all([...el.getAnimations(), ...el.parentElement.getAnimations()].map(animation => animation.finished));
   });
   const layout=await dialog.evaluate(el=>{
    const rect=el.getBoundingClientRect();
    const save=[...el.querySelectorAll('button')].find(button=>button.textContent==='保存').getBoundingClientRect();
    return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,saveTop:save.top,saveBottom:save.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert(!layout.overflow,JSON.stringify({width,height,layout}));
   assert(layout.left>=0&&layout.top>=0&&layout.right<=width+.1&&layout.bottom<=height+.1,JSON.stringify({width,height,layout}));
   assert(layout.saveTop>=0&&layout.saveBottom<=height,JSON.stringify({width,height,layout}));
   assert(await page.locator('.workflow-list').evaluate(el=>el.getBoundingClientRect().height>0),'the workflow list must not collapse to zero height');
   await page.screenshot({path:path.join(output,`${width}x${height}-${colorScheme}.png`)});
   // Reach the controls through the real scrolling body and HTML selector.
   const single=dialog.getByRole('combobox',{name:'单选菜单展示位置'});
   await single.click();await dialog.getByRole('option',{name:'不在菜单中显示',exact:true}).click();
   await dialog.getByRole('button',{name:'保存',exact:true}).click();
   await page.getByText('工作流「只保留第一条内容」已保存',{exact:true}).last().waitFor();
   const positions=await page.evaluate(()=>__MN_COMMENT_WORKFLOW_STORE__.list()[0].menu);
   assert.equal(positions.single.position,'hidden');assert.equal(positions.batch.position,'root');
   await dialog.getByRole('button',{name:'下移工作流',exact:true}).click();
   await page.getByText('菜单顺序已保存',{exact:true}).waitFor();
   const nativeMenus=await page.evaluate(()=>({single:__MN_COMMENT_WORKFLOW_MENU__.buildItems({}, {token:'single',noteId:'demo-card'}, 'single','root').map(item=>item.param?.workflowId),batch:__MN_COMMENT_WORKFLOW_MENU__.buildRootItems({}, {token:'batch',notes:[]}).map(item=>item.param?.workflowId)}));
   assert(!nativeMenus.single.includes('builtin.keepFirstContent'));assert(nativeMenus.batch.includes('builtin.keepFirstContent'));
   const orders=await page.evaluate(()=>__MN_COMMENT_WORKFLOW_STORE__.get('builtin.keepFirstContent').menu);
   assert.equal(orders.single.order,1);assert.equal(orders.batch.order,0);
   assert.deepEqual(errors,[]);
   report.push({width,height,colorScheme,layout,errors,passed:true});await page.close();
  }
  fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
