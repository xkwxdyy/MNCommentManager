// Cross-addon workspace regression. Native rendering and notification delivery are simulated.
// Installed Toolbar/ChatAI comparisons are opt-in through MN_FLOATING_COMPARE_INSTALLED_REFERENCES=1.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'Resources/dynamic-button-stability'), workspace = path.dirname(root);
const installed = path.join(require('os').homedir(), 'Library/Containers/QReader.MarginStudy.easy/Data/Library/MarginNote Extensions');
const plugins = process.env.MN_FLOATING_COMPARE_INSTALLED_REFERENCES === '1' ? ['toolbar','chat','comments','literature','pinner'] : ['comments','literature','pinner'];
const read = p => fs.readFileSync(p, 'utf8');
const report = { assumptions: ['No device rendering or measured device latency.', 'Lifecycle tests for Pinner/Literature inject a valid frame to isolate notifications.', 'Reference selectors are read from the actual installed Toolbar/ChatAI main.js.', 'Geometry tests execute the unchanged production shared layout separately.'], timing: [], rapid: [], geometry: [], parsing: [] };
const fixtureFile = path.join(workspace, 'mnpinner/tests/test-floating-control-integrations.js');
const fixtureSource = read(fixtureFile).split("const sender = { userInfo:")[0];
const loader = vm.createContext({ require, __dirname: path.dirname(fixtureFile), process, console: { log() {} } });
vm.runInContext(fixtureSource + '\nthis.makeFixture=fixture;this.makeNative=native;', loader);
const literatureSource = read(process.env.MN_FLOATING_LITERATURE_MAIN || path.join(workspace, 'mnliterature/main.js'));
const utilSource = read(path.join(workspace, 'mnutils/mnutils/mnutils.js'));
const parserStart = utilSource.indexOf('  static parseWinRect(winRect) {');
const parserBody = utilSource.slice(parserStart + '  static '.length, utilSource.indexOf('\n  }', parserStart) + 4);
const parseWinRect = vm.runInNewContext('(function ' + parserBody + ')').bind({ genFrame: (x,y,width,height) => ({x,y,width,height}) });

function loadLiteratureMethod(ctx, name) {
  const marker = '  MNLiteratureClass.prototype.' + name + ' = ';
  const start = literatureSource.indexOf(marker), end = literatureSource.indexOf('\n\n  MNLiteratureClass.prototype.', start + marker.length);
  assert(start >= 0 && end > start, name);
  vm.runInContext(literatureSource.slice(start, end), ctx);
}

function ownedFixture(kind, options = {}) {
  const h = loader.makeFixture(), s = h.sandbox;
  let now = 1000, menu = null;
  const nativePush = Array.prototype.push;
  h.timers.push = function (...items) { items.forEach(item => { item.at = now + item.seconds * 1000; }); return nativePush.apply(this, items); };
  s.MNUtil.parseWinRect = parseWinRect;
  s.MNNote.new = noteId => ({ noteId, comments: [] });
  s.PopupMenu = { currentMenu: () => menu };
  function advance(ms) {
    const until = now + ms;
    for (let n=0;;n++) {
      assert(n < 5000, 'timer loop');
      const timer = h.timers.filter(t => t.at <= until).sort((a,b) => a.at-b.at)[0];
      if (!timer) break;
      h.timers.splice(h.timers.indexOf(timer), 1); h.advance(timer.at-now); now=timer.at; timer.callback();
    }
    h.advance(until-now); now=until;
  }
  let addon, open, close, button, stateKey;
  const frame = () => now < 1000 + (options.blockUntil || 0) ? null : {x:400,y:200,width:34,height:34};
  if (kind === 'pinner') {
    addon = new s.pinnerController(); addon.window=h.window;
    button = loader.makeNative(); button.tag=9205101; button.hidden=true; h.host.addSubview(button);
    addon.followModeButton=button; addon._getFollowModeHostView=()=>h.host;
    addon.isFollowModeEnabled=()=>true; if(!options.realEnsure)addon._ensureFollowModeButton=()=>button;
    if(!options.realGeometry)addon._resolveFollowModeButtonFrame=ctx=>{ctx.popupMenuRect=menu && menu.frame;return frame();};
    addon._syncFollowModeExtraButtonInternal=()=>{};
    open=sender=>addon.onFollowModePopupMenuOnNoteInternal(sender);
    close=sender=>addon.onFollowModeClosePopupMenuOnNoteInternal(sender);
    stateKey='_followModeCurrentContext';
  } else if (kind === 'literature') {
    for (const name of ['_extractLiteratureFollowCreateNoteId','onLiteratureFollowCreatePopupOnNoteInternal']) loadLiteratureMethod(s,name);
    addon = new s.MNLiteratureClass(); addon.window=h.window;
    button=loader.makeNative(); button.tag=762041; button.hidden=true; h.host.addSubview(button);
    addon.literatureFollowCreateButton=button; addon.isPrimaryInstance=()=>true;
    addon.isLiteratureFollowCreateModeEnabled=()=>true; addon._getLiteratureFollowCreateHostView=()=>h.host;
    if(options.realEnsure)loadLiteratureMethod(s,'_ensureLiteratureFollowCreateButton');
    else addon._ensureLiteratureFollowCreateButton=()=>button;
    if(!options.realGeometry)addon._resolveLiteratureFollowCreateButtonFrame=frame;
    addon._delayLiteratureFollowCreate=(seconds,callback)=>h.timers.push({seconds,callback});
    open=sender=>addon.onLiteratureFollowCreatePopupOnNoteInternal(sender);
    close=sender=>addon.onLiteratureFollowCreateClosePopupOnNoteInternal(sender);
    stateKey='literatureFollowCreateContext';
  } else {
    addon={window:h.window};
    const actions=s.__MN_DYNAMIC_COMMENT_ACTIONS__;
    const place=s.__MN_ADDON_FLOATING_LAYOUT__.place;
    s.__MN_ADDON_FLOATING_LAYOUT__.place=(host,opts)=> now < 1000+(options.blockUntil || 0) ? null : place(host,opts);
    open=sender=>actions.handlePopupMenuOnNote(addon,sender);
    close=sender=>actions.handlePopupMenuClosed(addon,sender);
    stateKey='dynamicCommentContext';
  }
  if (options.copyContext) {
    let stored=null;
    function copy(value, seen=new Map()) {
      if (!value || typeof value!=='object' || value===h.host || value===h.window || value.subviews) return value;
      if (seen.has(value)) return seen.get(value);
      const next=Array.isArray(value)?[]:{};seen.set(value,next);
      Object.keys(value).forEach(key=>{next[key]=copy(value[key],seen);});return next;
    }
    Object.defineProperty(addon,stateKey,{get(){return copy(stored);},set(value){stored=copy(value);}});
  }
  return {advance, addon, sandbox:s, host:h.host, button:()=>button || addon.dynamicCommentButton, timers:h.timers, setMenu(value){menu=value;}, open(id, rawRect) {
    const rect={x:200,y:200,width:100,height:40};
    menu=options.noMenu ? null : {frame:{x:200,y:140,width:280,height:40},targetWinRect:rect,visible:true};
    return open({userInfo:{noteid:id,note:{noteId:id},winRect:rawRect || rect}});
  }, close(id){return close({userInfo:{noteid:id}});}, visible(){const v=button || addon.dynamicCommentButton;return !!v && !v.hidden && Number(v.layer.opacity ?? 1)>0.01;}, current(){return addon[stateKey] && addon[stateKey].noteId;}};
}

function selector(source, name) {
  const marker = name + ': async function (sender)';
  const start=source.indexOf(marker), next=source.indexOf('\n      on',start+marker.length);
  assert(start>=0 && next>start,name);
  let body=source.slice(start+name.length+2,next).trim();
  // Installed selectors here end with a trailing property comma and no intervening declarations.
  body=body.slice(0,body.lastIndexOf('},')+1);
  return '('+body+')';
}

function referenceFixture(kind) {
  let now=1000;const timers=[];
  const schedule=(seconds,callback)=>timers.push({at:now+seconds*1000,callback});
  const view={hidden:true,layer:{opacity:1},frame:{x:0,y:0,width:40,height:200}};
  const controller={view,screenButton:{hidden:true},onClick:false,miniMode:()=>true,refresh(frame){view.frame={...frame};},setToolbarLayout(){}};
  const addon={window:{},studyView:{frame:{x:0,y:0,width:800,height:600},bringSubviewToFront(){}},studyController:{docMapSplitMode:0},addonController:{popupReplace(){}},testController:controller,ensureView(){},blur(){}};
  const popup={targetWinRect:{x:200,y:200,width:100,height:40},frame:{x:200,y:140,width:280,height:40}};
  class Clock extends Date { static now(){return now;} }
  const ctx=vm.createContext({console:{log(){}},Date:Clock,self:addon,PopupMenu:{currentMenu:()=>popup},MNUtil:{currentWindow:addon.window,studyView:addon.studyView,parseWinRect,genFrame:(x,y,width,height)=>({x,y,width,height}),delay:seconds=>new Promise(resolve=>schedule(seconds,resolve)),animate(fn){fn();return Promise.resolve();},},toolbarConfig:{dynamic:true,vertical:()=>true,horizontal:()=>false},toolbarUtils:{executeAutoAction(){},addErrorLog(e){throw e;}},getMNChatglmClass:()=>addon,chatAIConfig:{config:{dynamic:true}},chatAIUtils:{currentNoteId:'',dynamicController:controller,checkSender:()=>true,blur(){},async checkDynamicController(frame){view.frame=frame;view.hidden=false;},ensureView(){},ensureNotifyController(){},notifyController:{view:{hidden:true}},getTextForSearch:async()=>'',addErrorLog(e){throw e;}},MNNote:{new:id=>({noteId:id})}});
  const source=read(path.join(installed,'marginnote.extension.'+(kind==='toolbar'?'mntoolbar':'mnchatglm')+'/main.js'));
  const open=vm.runInContext(selector(source,'onPopupMenuOnNote'),ctx),close=vm.runInContext(selector(source,'onClosePopupMenuOnNote'),ctx);
  const pending=[];
  const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
  return {async advance(ms){const until=now+ms;await flush();for(let n=0;;n++){assert(n<5000);timers.sort((a,b)=>a.at-b.at);if(!timers.length || timers[0].at>until)break;const t=timers.shift();now=t.at;t.callback();await flush();}now=until;await flush();},open(id){const promise=open({userInfo:{noteid:id,note:{noteId:id},winRect:'{{200, 200}, {100, 40}}'}});pending.push(promise);},close(id){pending.push(close({userInfo:{noteid:id}}));},visible:()=>!view.hidden && view.layer.opacity>0.01,current:()=>kind==='toolbar'?addon.noteid:ctx.chatAIUtils.currentNoteId};
}

async function timing() {
  const sequences={
    ordinary:async f=>{f.open('A');await f.advance(200);},
    previousCloseAfterNewOpen:async f=>{f.open('A');await f.advance(50);f.open('B');await f.advance(30);f.close('A');await f.advance(500);},
    sameCardReopen:async f=>{f.open('A');await f.advance(50);f.open('A');await f.advance(30);f.close('A');await f.advance(500);},
    oldCloseBeyondReferenceWindow:async f=>{f.open('A');await f.advance(50);f.open('B');await f.advance(400);f.close('A');await f.advance(500);},
    tenCards80msApart:async f=>{for(let n=0;n<10;n++){f.open('card-'+n);await f.advance(25);if(n)f.close('card-'+(n-1));await f.advance(55);}await f.advance(700);},
    tenRepeats80msApart:async f=>{for(let n=0;n<10;n++){f.open('A');await f.advance(25);if(n)f.close('A');await f.advance(55);}await f.advance(700);},
  };
  for(const [sequence,run] of Object.entries(sequences))for(const kind of plugins) {
    const fixture=['toolbar','chat'].includes(kind)?referenceFixture(kind):ownedFixture(kind);
    await run(fixture);report.timing.push({sequence,plugin:kind,visible:fixture.visible(),boundNote:fixture.current() || null});
  }
  for(const copyContext of [false,true])for(const kind of ['comments','literature','pinner']) {
    const f=ownedFixture(kind,{copyContext,blockUntil:350});f.open('A');await f.advance(2000);
    report.timing.push({sequence:'lateFreeSpace_contextCopy='+copyContext,plugin:kind,visible:f.visible(),boundNote:f.current() || null});
  }
  for(const rawRect of [{x:200,y:200,width:100,height:40},'{{200, 200}, {100, 40}}']) {
    const f=ownedFixture('comments',{noMenu:true});f.open('A',rawRect);await f.advance(1);
    report.parsing.push({rawRect,commentVisibleBeforeGlobalMenu:f.visible(),mnUtilsParsed:typeof rawRect==='string'?parseWinRect(rawRect):rawRect});
  }
}

async function rapid() {
  for(const intervalMs of [20,40,80,150,300])for(const scenario of ['differentCards_noClose','differentCards_oldClose','sameCard_oldClose'])for(const kind of plugins) {
    const f=['toolbar','chat'].includes(kind)?referenceFixture(kind):ownedFixture(kind);
    let hiddenMs=0,visibleMs=0,longestHiddenMs=0,streak=0;
    for(let n=0;n<12;n++) {
      const id=scenario==='sameCard_oldClose'?'A':'card-'+n;f.open(id);
      const closeAt=Math.min(25,intervalMs/2);
      for(let elapsed=0;elapsed<intervalMs;elapsed+=5) {
        if(elapsed===closeAt && n && scenario!=='differentCards_noClose')f.close(scenario==='sameCard_oldClose'?'A':'card-'+(n-1));
        await f.advance(5);
        if(n) {
          if(f.visible()){visibleMs+=5;streak=0;}
          else{hiddenMs+=5;streak+=5;longestHiddenMs=Math.max(longestHiddenMs,streak);}
        }
      }
    }
    await f.advance(700);
    report.rapid.push({intervalMs,scenario,plugin:kind,cards:12,logicalVisibleMs:visibleMs,logicalHiddenMs:hiddenMs,longestLogicalHiddenMs:longestHiddenMs,finalVisible:f.visible(),finalTarget:f.current()||null});
  }
}

function geometry() {
  const ctx=vm.createContext({});vm.runInContext(read(path.join(root,'src/FloatingControlLayout.js')),ctx);
  const layout=ctx.__MN_ADDON_FLOATING_LAYOUT__;
  function host(){return {bounds:{x:0,y:0,width:800,height:600},subviews:[]};}
  function add(parent,frame,extra={}){const v=Object.assign({frame,bounds:{x:0,y:0,width:frame.width,height:frame.height},subviews:[],superview:parent,hidden:false,alpha:1,layer:{opacity:1},userInteractionEnabled:true,className:'UIView'},extra);parent.subviews.push(v);return v;}
  for(const crowded of [false,true])for(const priority of [10,20,30]) {
    const h=host();add(h,{x:200,y:140,width:280,height:40},{className:'QBPopupMenu',addTargetActionForControlEvents(){}});
    if(crowded){for(let n=0;n<270;n++){const group=add(h,{x:10+(n%20)*4,y:10+Math.floor(n/20)*4,width:3,height:3});add(group,{x:0,y:0,width:1,height:1},{className:'UILabel'});}}
    const obstacles=layout.collect(h,{priority});
    const frame=layout.place(h,{priority,preferred:{x:400,y:240,width:priority===30?92:34,height:44}});
    report.geometry.push({crowded,priority,frame,scanIncomplete:!!obstacles.incomplete,reservedWholeHost:obstacles.some(r=>r.x===0&&r.y===0&&r.width===800&&r.height===600),actualInteractiveControls:1});
  }
}

(async()=>{await timing();await rapid();geometry();
  assert(report.timing.filter(row=>row.sequence==='ordinary').every(row=>row.visible));
  for (const plugin of plugins) {
    const expected = true;
    assert.strictEqual(report.timing.find(r=>r.sequence==='previousCloseAfterNewOpen' && r.plugin===plugin).visible, expected);
    assert.strictEqual(report.timing.find(r=>r.sequence==='sameCardReopen' && r.plugin===plugin).visible, true);
  }
  assert.strictEqual(report.rapid.length, 15 * plugins.length);
  assert.strictEqual(report.timing.length, 6 * plugins.length + 6);
  assert(report.geometry.filter(row=>!row.crowded).every(row=>row.frame!==null));
  assert(report.geometry.filter(row=>row.crowded).every(row=>!row.reservedWholeHost && row.frame!==null));
  assert.strictEqual(report.parsing.find(row=>typeof row.rawRect==='string').commentVisibleBeforeGlobalMenu,true);
  for (const row of report.parsing) assert(row.commentVisibleBeforeGlobalMenu);
  for (const row of report.rapid.filter(r=>['comments','literature','pinner'].includes(r.plugin))) {
    assert(row.finalVisible, JSON.stringify(row));
    assert.strictEqual(row.logicalHiddenMs, 0, JSON.stringify(row));
  }
  for (const plugin of ['literature','pinner']) {
    const f=ownedFixture(plugin,{realEnsure:true});f.open('A');await f.advance(50);
    const b=f.button();assert(!b.hidden);
    f.open('B');assert(!b.hidden && b.enabled!==false, plugin+' reuses actual native ensure method without hiding');
  }
  {
    const f=ownedFixture('pinner',{realEnsure:true,realGeometry:true,noMenu:true});
    f.open('A');assert(f.button().hidden, 'Pinner first reveal waits for a real menu');
    const menu={frame:{x:200,y:140,width:280,height:40},targetWinRect:{x:200,y:200,width:100,height:40},visible:true};
    f.setMenu(menu);await f.advance(50);assert(!f.button().hidden && f.button().enabled);
    f.open('B',{x:500,y:350,width:150,height:80});
    assert(!f.button().hidden && f.button().enabled===false, 'pending B keeps A view visible but disabled');
    f.addon._performFollowModeAction=()=>{throw new Error('pending target action executed');};
    assert.strictEqual(await f.addon.followModeButtonTappedInternal(f.button()),false);
    f.button().enabled=true;f.button()._followModeContextToken='old';
    assert.strictEqual(await f.addon.followModeButtonTappedInternal(f.button()),false);
    f.setMenu(menu);await f.advance(50);assert(f.button().enabled===false, 'old menu geometry cannot activate B');
    f.setMenu({...menu,frame:{x:440,y:290,width:280,height:40},targetWinRect:{x:500,y:350,width:150,height:80}});await f.advance(300);
    assert(!f.button().hidden && f.button().enabled && f.button()._followModeContextToken===f.addon._followModeCurrentContext.token, 'resolved B becomes executable with its own token '+JSON.stringify({hidden:f.button().hidden,enabled:f.button().enabled,buttonToken:f.button()._followModeContextToken,token:f.addon._followModeCurrentContext.token,popup:f.addon._followModeCurrentContext.popupMenuRect,anchor:f.addon._followModeCurrentContext.anchorRect}));
  }
  for (const plugin of ['comments','literature']) {
    const f=ownedFixture(plugin,{realEnsure:true,realGeometry:true});
    f.open('large',{x:0,y:0,width:800,height:600});await f.advance(200);
    assert(f.visible(), plugin+' full-host card still has a slot beside the real menu');
  }
  {
    const f=ownedFixture('literature',{realEnsure:true});
    for(const name of ['literatureFollowCreateButtonTappedInternal','literatureFollowCreateButtonLongPressedInternal'])loadLiteratureMethod(f.sandbox,name);
    f.open('A');await f.advance(50);const b=f.button();
    f.addon.ensureLiteratureOnboardingReady=()=>true;
    f.addon.openLiteratureCardifyMenuInternal=()=>{throw Error('stale Literature target executed');};
    b.enabled=false;assert.strictEqual(await f.addon.literatureFollowCreateButtonTappedInternal(b),false);
    b.enabled=true;b._literatureFollowCreateContextToken='old';assert.strictEqual(await f.addon.literatureFollowCreateButtonTappedInternal(b),false);
    assert.strictEqual(await f.addon.literatureFollowCreateButtonLongPressedInternal({state:1,view:b}),false);
  }
  for (const plugin of ['comments','literature','pinner']) {
    const f=ownedFixture(plugin); f.open('A');await f.advance(50);f.setMenu(null);f.close('A');await f.advance(500);
    assert.strictEqual(f.visible(),false, plugin+' must hide after the real menu closes');
    const late=ownedFixture(plugin); late.open('A');await late.advance(50);late.setMenu(null);late.close('A');await late.advance(50);late.open('B');await late.advance(500);
    assert(late.visible() && late.current()==='B', plugin+' ignores an already scheduled old hide');
  }
  assert(report.timing.filter(r=>r.sequence==='lateFreeSpace_contextCopy=true').every(r=>r.visible), 'context tokens survive native dictionary copies');
  fs.writeFileSync(path.join(out,'replay-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
