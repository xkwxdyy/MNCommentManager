// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
import {defaultSettings} from './lib/commentModules.mjs';
vi.mock('./lib/mnBridge',()=>({default:{send:vi.fn()}}));
let root,host,snapshot,frames,frameSequence;
const card=index=>host.querySelector(`#comment-${index}`);
const selected=()=>[...host.querySelectorAll('[data-comment-index][aria-pressed=true]')].map(n=>Number(n.dataset.commentIndex));
const button=label=>[...host.querySelectorAll('button')].find(n=>n.textContent===label || n.getAttribute('aria-label')===label);
const click=async node=>{expect(node).toBeTruthy();await act(async()=>node.click());};
function geometry() {
  host.querySelector('#comment-pane').getBoundingClientRect=()=>({top:0,bottom:560,height:560});
  [...host.querySelectorAll('[data-comment-index]')].forEach((node,i)=>{node.getBoundingClientRect=()=>({top:i*80,bottom:i*80+65,height:65});});
}
const points=(y,target,gap=30)=>[{identifier:1,clientX:80,clientY:y,target},{identifier:2,clientX:80+gap,clientY:y,target}];
async function touch(type,pts,target=card(0),cancelable=true,flush=true){let event;await act(async()=>{event=new Event(type,{bubbles:true,cancelable});Object.defineProperty(event,'touches',{value:pts});target.dispatchEvent(event);if(type==='touchmove'&&flush){const pair=[...frames][0];if(pair){frames.delete(pair[0]);pair[1](performance.now());}}});return event;}
const drag=async (start,end,target=card(0))=>{await touch('touchstart',points(start,target),target);await touch('touchmove',points(end,target),target);};
beforeEach(async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  frames=new Map();frameSequence=0;
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(cb=>{frames.set(++frameSequence,cb);return frameSequence;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>frames.delete(id));
  snapshot={noteId:'gesture',noteTitle:'手势卡片',error:'',excerpt:{present:true,type:'text',text:'原生摘录',capabilities:{}},moduleSettings:defaultSettings(),commentFold:{supported:true,revision:'1'},comments:[
    {type:'textComment',text:'前置内容'},
    {type:'HtmlComment',text:'模块标题'},
    {type:'markdownComment',text:'## 子章节\n\n**完整正文**'},
    {type:'imageComment',text:'图片说明'},
    {type:'textComment',text:'末尾正文'},
  ].map((c,index)=>({...c,index,collapsed:false,capabilities:{canSetCollapsed:true,isMarkdown:c.type==='markdownComment',canMove:true,canCopyText:true}}))};
  MNBridge.send.mockReset();MNBridge.send.mockImplementation(async command=>['getCurrentNoteComments','refreshCurrentNote'].includes(command)?snapshot:{});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));geometry();MNBridge.send.mockClear();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;vi.restoreAllMocks();vi.unstubAllGlobals();});
it('selects comment zero, adds a visible range and shrinks back while preserving excerpt and outside selection',async()=>{
  await click(card(4).querySelector('input'));await click(host.querySelector('#native-excerpt input'));
  await drag(20,180);expect(selected()).toEqual([0,1,2,4]);
  await touch('touchmove',points(100,card(0)));expect(selected()).toEqual([0,1,4]);
  await touch('touchend',[]);expect(selected()).toEqual([0,1,4]);expect(host.querySelector('#native-excerpt').getAttribute('aria-pressed')).toBe('true');expect(MNBridge.send).not.toHaveBeenCalled();
});
it('selected anchor cancels selection and reverses from the original baseline',async()=>{
  for(const index of [0,1,2,4])await click(card(index).querySelector('input'));
  await drag(20,180);expect(selected()).toEqual([4]);await touch('touchmove',points(100,card(0)));expect(selected()).toEqual([2,4]);await touch('touchend',[]);expect(selected()).toEqual([2,4]);
});
it('single finger and sub-threshold motion preserve selection and native scroll defaults',async()=>{
  const target=card(0);expect((await touch('touchstart',points(20,target).slice(0,1))).defaultPrevented).toBe(false);expect((await touch('touchmove',points(50,target).slice(0,1))).defaultPrevented).toBe(false);await touch('touchend',[]);
  await drag(20,26);expect(selected()).toEqual([]);await touch('touchend',[]);
});
it('pinch, system interruption, and Escape restore the baseline',async()=>{
  await click(card(4).querySelector('input'));
  for(const kind of ['pinch','cancel','system','escape']){
    if(kind==='pinch'){
      await touch('touchstart',points(20,card(0)));
      await touch('touchmove',points(20,card(0),90));
    }else {await drag(20,180);expect(selected()).toEqual([0,1,2,4]);}
    if(kind==='cancel')await touch('touchcancel',[]);
    if(kind==='system')await touch('touchmove',points(190,card(0)),card(0),false);
    if(kind==='escape')await act(async()=>host.querySelector('.comment-manager').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(selected()).toEqual([4]);await touch('touchend',[]);
  }
});
it('additional contact outside the pane cancels and permits a fresh gesture after all fingers lift',async()=>{
  await drag(20,180);const toolbar=button('刷新');await touch('touchstart',[...points(180,card(0)),{identifier:3,clientX:200,clientY:20,target:toolbar}],toolbar);
  expect(selected()).toEqual([]);await touch('touchend',[],toolbar);await drag(20,100);expect(selected()).toEqual([0,1]);await touch('touchend',[]);
});
it('configuration popup restores baseline immediately and blocks further touch selection',async()=>{
  await click(card(4).querySelector('input'));await drag(20,180);await click(button('模块划分设置'));
  expect(selected()).toEqual([4]);expect(host.querySelector('[role=dialog]')).not.toBeNull();await touch('touchmove',points(250,card(0)));expect(selected()).toEqual([4]);await touch('touchend',[]);
});
it('card switching never applies old baseline indices to the next card',async()=>{
  await click(card(4).querySelector('input'));await drag(20,180);
  const next={...snapshot,noteId:'next',noteTitle:'新的卡片',comments:[{...snapshot.comments[0],index:0}]};
  await act(async()=>window.__MNCommentManagerNativeSync(JSON.stringify({snapshot:next})));
  expect(selected()).toEqual([]);await touch('touchend',[],host.querySelector('#comment-pane'));expect(selected()).toEqual([]);
});
it('gesture range excludes filtered and module-hidden comments',async()=>{
  await click([...host.querySelectorAll('.segmented button')].find(n=>n.textContent.startsWith('文本')));geometry();await drag(20,100);expect(selected()).toEqual([0,2]);await touch('touchend',[]);
});
it('buttons, module headings and original excerpt cannot start gestures or select complete groups',async()=>{
  for(const target of [card(0).querySelector('input'),host.querySelector('#module-1 header strong'),host.querySelector('#native-excerpt')]){
    await touch('touchstart',points(70,target),target);await touch('touchmove',points(180,target),target);await touch('touchend',[],target);expect(selected()).toEqual([]);
  }
});
it('Markdown touch target remains connected through selection updates',async()=>{
  const target=card(2).querySelector('.markdown-content strong');expect(target).toBeTruthy();await drag(180,260,target);expect(target.isConnected).toBe(true);await touch('touchmove',points(340,target),target);expect(selected()).toEqual([2,3,4]);await touch('touchend',[],target);
});
it('module visibility excludes hidden members from touch ranges',async()=>{
  await click(host.querySelector('#module-1 .module-icon'));geometry();await drag(20,50);expect(selected()).toEqual([0]);await touch('touchend',[]);expect(card(2)).toBeNull();
});
it('collapsed Markdown summary keeps its original touch target connected',async()=>{
  snapshot={...snapshot,comments:snapshot.comments.map(c=>c.index===2?{...c,collapsed:true}:c)};await click(button('刷新'));geometry();
  const target=card(2).querySelector('.comment-fold-summary strong');expect(target).toBeTruthy();await drag(180,260,target);expect(target.isConnected).toBe(true);await touch('touchmove',points(340,target),target);expect(selected()).toEqual([2,3,4]);await touch('touchend',[],target);
});

it('leaving the page restores the original selection and ignores later touch motion',async()=>{
  await click(card(4).querySelector('input'));await drag(20,180);
  await act(async()=>window.dispatchEvent(new Event('blur')));expect(selected()).toEqual([4]);
  await touch('touchmove',points(260,card(0)));expect(selected()).toEqual([4]);await touch('touchend',[],document.body);
  await drag(20,100);expect(selected()).toEqual([0,1,4]);await touch('touchend',[]);
});
it('system cancellation outside the pane restores selection and leaves keyboard controls usable',async()=>{
  await click(card(4).querySelector('input'));await drag(20,180);await touch('touchcancel',[],document.body);
  expect(selected()).toEqual([4]);await click(card(0).querySelector('input'));expect(selected()).toEqual([0,4]);
});

it('normal finger spreading after recognition retains the range',async()=>{
  await drag(20,180);await touch('touchmove',points(260,card(0),78).reverse());
  expect(selected()).toEqual([0,1,2,3]);await touch('touchend',[]);expect(selected()).toEqual([0,1,2,3]);
});

it('comment gaps and body anchors can launch selection without link navigation',async()=>{
  await touch('touchstart',points(72,card(0)));await touch('touchmove',points(180,card(0)));await touch('touchend',[]);
  expect(selected()).toEqual([0,1,2]);await click(button('清空'));
  snapshot={...snapshot,comments:snapshot.comments.map(c=>c.index===2?{...c,text:'[正文链接](https://example.com)'}:c)};
  await click(button('刷新'));geometry();const anchor=card(2).querySelector('a');expect(anchor).toBeTruthy();
  await drag(180,260,anchor);await touch('touchend',[]);expect(selected()).toEqual([2,3]);expect(anchor.isConnected).toBe(true);expect(MNBridge.send).toHaveBeenCalledTimes(1);
});

it('release before a frame commits the pending range, while Escape discards it',async()=>{
  await touch('touchstart',points(20,card(0)));await touch('touchmove',points(260,card(0)),card(0),true,false);
  expect(selected()).toEqual([]);await touch('touchend',[]);expect(selected()).toEqual([0,1,2,3]);expect(frames.size).toBe(0);
  await click(button('清空'));await touch('touchstart',points(20,card(0)));await touch('touchmove',points(260,card(0)),card(0),true,false);
  await act(async()=>host.querySelector('.comment-manager').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await touch('touchend',[]);expect(selected()).toEqual([]);expect(frames.size).toBe(0);
});

it('release outside the pane before a frame uses the last visible endpoint',async()=>{
  await touch('touchstart',points(20,card(0)));await touch('touchmove',points(700,card(0)),card(0),true,false);
  await touch('touchend',[],document.body);expect(selected()).toEqual([0,1,2,3,4]);expect(frames.size).toBe(0);
});

it('explicit toolbar selection supersedes an unfinished gesture',async()=>{
  await click(card(4).querySelector('input'));await drag(20,180);await click(button('清空'));expect(selected()).toEqual([]);
  await touch('touchmove',points(260,card(0)));expect(selected()).toEqual([]);await touch('touchend',[]);expect(selected()).toEqual([]);
});
