// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, snapshot, original, blue, preview, applyError;
const click = async el => { expect(el).toBeTruthy(); await act(async () => el.click()); };
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label);
beforeEach(async () => {
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 blue = { fontName:'PingFangSC-Regular', fontSize:16, textColor:'#175D62', backgroundColor:'#E3F2FD' };
 const red={...blue,textColor:'#9A3412',backgroundColor:'#FFF0DC',fontSize:12};
 original = [{index:0,text:'相关思考',style:blue},{index:1,text:'目标甲',style:red},{index:2,text:'目标乙',style:red},{index:3,text:'保护评论',style:red}].map(c=>({...c,type:'HtmlComment',capabilities:{isHtml:true,canCopyText:true,canMove:true},richFormat:{supported:true,style:c.style}}));
 snapshot={noteId:'N',noteTitle:'格式刷测试',excerpt:{present:false},comments:original}; applyError=null;
 preview={noteId:'N',source:original[0],token:'preview',targets:original.slice(1).map(c=>({...c,eligible:c.index!==3,reason:c.index===3?'含有需要保留的标识':''}))};
 MNBridge.send.mockReset();MNBridge.send.mockImplementation(async(command,payload)=>{
  if(['getCurrentNoteComments','refreshCurrentNote'].includes(command))return snapshot;
  if(command==='getFormatBrushPreview')return {...preview,source:original[payload.sourceIndex],targets:original.filter(c=>c.index!==payload.sourceIndex).map(c=>({...c,eligible:c.index!==3,reason:c.index===3?'含有需要保留的标识':''}))};
  if(command==='applyFormatBrush') { if(applyError)throw Error(applyError);snapshot={...snapshot,comments:original.map(c=>payload.indices.includes(c.index)?{...c,richFormat:{supported:true,style:blue}}:c)};return {snapshot,undoToken:'undo-batch',changedCount:payload.indices.length}; }
  if(command==='undoFormatBrush'){snapshot={...snapshot,comments:original};return {snapshot};}
  return {};
 });
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
async function open(){await click(host.querySelector('#comment-0-format-brush'));expect(document.querySelector('.brush-dialog')).toBeTruthy();}
it('previews only eligible targets, applies selected styles, and supports a batch undo',async()=>{
 await open();expect(window.__MNCommentManagerCanSwitchCard()).toBe(false);expect(document.querySelector('[aria-label="选择目标评论 #3"]').disabled).toBe(true);
 await click(document.querySelector('[aria-label="选择目标评论 #1"]'));await click(document.querySelector('[aria-label="选择目标评论 #2"]'));expect(button('应用到 2 条评论').disabled).toBe(false);
 expect(host.querySelector('#comment-1 pre').style.backgroundColor).toBe('rgb(255, 240, 220)');
 await click(button('应用到 2 条评论'));expect(MNBridge.send).toHaveBeenCalledWith('applyFormatBrush',{noteId:'N',token:'preview',indices:[1,2]});expect(document.querySelector('.brush-dialog')).toBeNull();
 expect(host.querySelector('#comment-1 pre').textContent).toBe('目标甲');expect(host.querySelector('#comment-1 pre').style.backgroundColor).toBe('rgb(227, 242, 253)');
 await click(host.querySelector('[aria-label="撤销上次富文本修改"]'));expect(MNBridge.send).toHaveBeenCalledWith('undoFormatBrush',{noteId:'N',token:'undo-batch'});expect(host.querySelector('#comment-1 pre').style.backgroundColor).toBe('rgb(255, 240, 220)');
});
it('cancels preview without submitting a mutation',async()=>{await open();await click(document.querySelector('[aria-label="选择目标评论 #1"]'));await click(button('取消'));expect(document.querySelector('.brush-dialog')).toBeNull();expect(MNBridge.send.mock.calls.some(([c])=>c==='applyFormatBrush')).toBe(false);});
it('retains the target selection and shows a failed mutation in the dialog',async()=>{await open();applyError='评论内容或顺序已变化';await click(document.querySelector('[aria-label="选择目标评论 #1"]'));await click(button('应用到 1 条评论'));expect(document.querySelector('.brush-error').textContent).toContain('顺序已变化');expect(document.querySelector('[aria-label="选择目标评论 #1"]').checked).toBe(true);});
it('does not reopen a stale preview after changing cards',async()=>{
 let done;MNBridge.send.mockImplementation((command)=>command==='getFormatBrushPreview'?new Promise(resolve=>{done=resolve;}):Promise.resolve(command==='getCurrentNoteComments'?snapshot:{}));
 await click(host.querySelector('#comment-0 input'));await click(host.querySelector('#comment-0-format-brush'));
 await act(async()=>window.__MNCommentManagerNativeSync({snapshot:{...snapshot,noteId:'OTHER'}}));await act(async()=>done(preview));expect(document.querySelector('.brush-dialog')).toBeNull();
});

it('opens from the button next to any HTML comment without selecting the row',async()=>{
 await click(host.querySelector('#comment-1-format-brush'));expect(MNBridge.send).toHaveBeenCalledWith('getFormatBrushPreview',{noteId:'N',sourceIndex:1});expect(document.querySelector('.brush-source').textContent).toContain('目标甲');expect(host.querySelector('#comment-1 input').checked).toBe(false);
});
it('disables the nearby brush for unsupported HTML formatting',async()=>{
 await act(async()=>window.__MNCommentManagerNativeSync({snapshot:{...snapshot,comments:original.map(c=>c.index===1?{...c,richFormat:{supported:false,reason:'混合格式暂不支持格式刷'}}:c)}}));const trigger=host.querySelector('#comment-1-format-brush');expect(trigger.disabled).toBe(true);expect(trigger.title).toContain('混合格式');
});
