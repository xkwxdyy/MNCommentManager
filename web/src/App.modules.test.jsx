import { chooseHtmlOption } from './test/chooseHtmlOption';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
import { defaultSettings, structureSignature } from './lib/commentModules.mjs';
vi.mock('./lib/mnBridge',()=>({default:{send:vi.fn()}}));
let root,host,snapshot;
const click=async node=>{expect(node).toBeTruthy();await act(async()=>node.click());};
const named=name=>host.querySelector(`[aria-label="${name}"]`);
const section=index=>host.querySelector(`#module-${index}`);
const card=index=>host.querySelector(`#comment-${index}`);
const btn=text=>[...host.querySelectorAll('button')].find(n=>n.textContent===text);
const change=async (node,value)=>{if(node.getAttribute('role')==='combobox')return chooseHtmlOption(node,value);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('change',{bubbles:true}));node.dispatchEvent(new Event('input',{bubbles:true}));});};
beforeEach(async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  snapshot={noteId:'modules',noteTitle:'模块卡片',error:'',moduleSettings:defaultSettings(),commentFold:{supported:true,revision:'fold-1'},excerpt:{present:false,capabilities:{}},comments:[
    {index:0,type:'textComment',text:'前置内容'},
    {index:1,type:'HtmlComment',text:'空模块',htmlText:'空模块'},
    {index:2,type:'HtmlComment',text:'应用',htmlText:'应用'},
    {index:3,type:'markdownComment',text:'## 子标题\n结构评论保持完整'},
    {index:4,type:'textComment',text:'正文内容'},
    {index:5,type:'HtmlComment',text:'应用',htmlText:'应用'},
    {index:6,type:'textComment',text:'末尾正文'},
  ].map(c=>({...c,collapsed:false,capabilities:{canSetCollapsed:true,canMove:true,isHtml:c.type==='HtmlComment',isMarkdown:c.type==='markdownComment',canCopyText:true,canEditText:true}}))};
  MNBridge.send.mockReset();MNBridge.send.mockImplementation(async(command,payload)=>{
    if(['getCurrentNoteComments','refreshCurrentNote'].includes(command))return snapshot;
    if(command==='setCommentsCollapsed'){snapshot={...snapshot,comments:snapshot.comments.map(c=>payload.indices.includes(c.index)?{...c,collapsed:payload.collapsed}:c)};return{snapshot,persisted:true};}
    if(command==='saveCommentModuleSettings'){snapshot={...snapshot,moduleSettings:{...payload.settings,revision:payload.expectedRevision+1}};return{persisted:true,moduleSettings:snapshot.moduleSettings};}
    if(command==='extractCommentModule')return{createdNoteId:'child',createdNoteTitle:payload.title,snapshot};
    return{};
  });
  host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));MNBridge.send.mockClear();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;vi.unstubAllGlobals();});
it('renders original comment editors inside full-list modules with empty and repeated headings',()=>{
  expect(host.querySelectorAll('.comment-module')).toHaveLength(4);expect(section(1).textContent).toContain('模块正文为空');
  expect(section(2).querySelectorAll('article.comment-item, article.comment')).toBeTruthy();expect(card(3)).not.toBeNull();expect(section(5)).not.toBeNull();
  expect(named('隐藏模块内容：未分组').textContent).toBe('');
});
it('folder visibility changes no native comment fold state and retains hidden selection',async()=>{
  await click(named('选择模块：应用（含标题）'));expect(section(2).querySelector('.module-comment-fold')).not.toBeNull();
  await click(section(2).querySelector('.module-icon'));
  expect(card(4)).toBeNull();expect(MNBridge.send).not.toHaveBeenCalled();expect(section(2).querySelector('input').checked).toBe(true);
  await click(section(2).querySelector('.module-comment-fold'));
  expect(MNBridge.send).toHaveBeenCalledWith('setCommentsCollapsed',{noteId:'modules',indices:[2,3,4],collapsed:true,expectedRevision:'fold-1'});
  expect(card(4)).toBeNull();expect(section(2).querySelector('input').checked).toBe(true);
});
it('filter-hidden members take part in module selection and batch folding',async()=>{
  await click([...host.querySelectorAll('.segmented button')].find(n => n.textContent.startsWith('文本')));await click(named('选择模块：应用（含标题）'));
  expect(section(2).textContent).toContain('隐藏 1');expect(host.textContent).toContain('模块选择包含 1 条筛选隐藏评论');
  await click(section(2).querySelector('.module-comment-fold'));
  expect(MNBridge.send).toHaveBeenCalledWith('setCommentsCollapsed',expect.objectContaining({indices:[2,3,4]}));
});
it('partially selected modules do not show batch disclosure',async()=>{
  await click(card(4).querySelector('input'));
  expect(section(2).querySelector('header input').indeterminate).toBe(true);expect(section(2).querySelector('.module-comment-fold')).toBeNull();
});
it('nested selection includes descendants while body-only mode excludes every structure heading',async()=>{
  snapshot={...snapshot,moduleSettings:{...snapshot.moduleSettings,defaultProfileId:'nested',includeTitle:false}};await click(btn('刷新'));
  expect(section(3)).not.toBeNull();await click(named('选择模块：应用（仅正文）'));
  expect(card(4).getAttribute('aria-pressed')).toBe('true');expect(card(3).getAttribute('aria-pressed')).toBe('false');expect(card(2).getAttribute('aria-pressed')).toBe('false');
  expect(section(3).querySelector('header input').checked).toBe(true);
});
it('module movement sends complete structure and settings guards',async()=>{
  await click(named('下移模块：应用'));
  expect(MNBridge.send).toHaveBeenCalledWith('reorderCommentModule',{noteId:'modules',moduleId:'module-2',direction:'down',expectedRevision:0,expectedStructure:structureSignature(snapshot.comments)});
});
it('body move dialog sends body indices without structural headings',async()=>{
  await click(section(2).querySelector('.module-menu button'));
  const modal=host.querySelector('[role=dialog]');await click([...modal.querySelectorAll('button')].find(b=>b.textContent==='确认'));
  expect(MNBridge.send).toHaveBeenCalledWith('moveCommentModuleBody',expect.objectContaining({moduleId:'module-2',indices:[3,4],targetId:'module-ungrouped'}));
});
it('extraction preserves draft on failure and exposes result entry on success',async()=>{
  await click(section(2).querySelectorAll('.module-menu button')[1]);await change(host.querySelector('[role=dialog] input:not([type=checkbox])'),'提取结果');
  MNBridge.send.mockRejectedValueOnce(new Error('宿主保存失败'));await click(btn('确认'));expect(host.querySelector('[role=dialog]')).not.toBeNull();expect(host.textContent).toContain('宿主保存失败');
  await click(btn('确认'));expect(host.querySelector('[role=dialog]')).toBeNull();expect(btn('查看提取结果')).toBeTruthy();
});
it('card override is saved through Bridge and is restored by refreshed snapshots',async()=>{
  await click(named('模块划分设置'));const selects=host.querySelectorAll('[role=dialog] [role=combobox]');await change(selects[0],'card');await change(selects[1],'nested');await click(btn('保存'));
  expect(MNBridge.send).toHaveBeenCalledWith('saveCommentModuleSettings',expect.objectContaining({expectedRevision:0,settings:expect.objectContaining({cardOverrides:{modules:{profileId:'nested',includeTitle:true}}})}));
  expect(section(3)).not.toBeNull();await click(btn('刷新'));expect(section(3)).not.toBeNull();
});
it('settings failures retain editable draft and reject missing persistence receipts',async()=>{
  await click(named('模块划分设置'));await change(host.querySelectorAll('[role=dialog] [role=combobox]')[1],'nested');MNBridge.send.mockResolvedValueOnce({});await click(btn('保存'));
  expect(host.textContent).toContain('模块配置未确认保存');expect(host.querySelector('.status-message').textContent).not.toContain('模块设置已保存');expect(host.querySelectorAll('[role=dialog] [role=combobox]')[1].textContent).toContain('HTML＋Markdown');await click(btn('保存'));expect(section(3)).not.toBeNull();
});
it('unreadable config permits default display but blocks saving',async()=>{
  snapshot={...snapshot,moduleSettingsError:'原文件无法读取，已保留'};await click(btn('刷新'));await click(named('模块划分设置'));expect(btn('保存').disabled).toBe(true);expect(host.querySelector('[role=dialog]').textContent).toContain('已保留');
});
it('settings support keyboard Escape and restore trigger focus',async()=>{
  const trigger=named('模块划分设置');trigger.focus();await click(trigger);const modal=host.querySelector('[role=dialog]');expect(modal.contains(document.activeElement)).toBe(true);
  await act(async()=>modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(host.querySelector('[role=dialog]')).toBeNull();expect(document.activeElement).toBe(trigger);
});
it('mixed fold state unifies only the selected module and preserves unrelated selection',async()=>{
  snapshot={...snapshot,comments:snapshot.comments.map(c=>c.index===3?{...c,collapsed:true}:c)};await click(btn('刷新'));
  await click(card(0).querySelector('input'));await click(named('选择模块：应用（含标题）'));await click(section(2).querySelector('.module-comment-fold'));
  expect(MNBridge.send).toHaveBeenLastCalledWith('setCommentsCollapsed',expect.objectContaining({indices:[2,3,4],collapsed:true}));expect(card(0).getAttribute('aria-pressed')).toBe('true');expect(card(0).querySelector('.comment-fold-button').getAttribute('aria-expanded')).toBe('true');
  await click(section(2).querySelector('.module-comment-fold'));expect(MNBridge.send).toHaveBeenLastCalledWith('setCommentsCollapsed',expect.objectContaining({indices:[2,3,4],collapsed:false}));
});
it('late config receipt updates global settings without applying an old card override to a new card',async()=>{
  let resolveSave;MNBridge.send.mockImplementation(async(command,payload)=>{
    if(command==='saveCommentModuleSettings')return new Promise(resolve=>{resolveSave=()=>resolve({persisted:true,moduleSettings:{...payload.settings,revision:1}});});
    if(['getCurrentNoteComments','refreshCurrentNote'].includes(command))return snapshot;
    return{};
  });
  await click(named('模块划分设置'));await change(host.querySelectorAll('[role=dialog] [role=combobox]')[0],'card');await change(host.querySelectorAll('[role=dialog] [role=combobox]')[1],'nested');await click(btn('保存'));
  const next={...snapshot,noteId:'other',noteTitle:'另一卡片'};
  await act(async()=>window.__MNCommentManagerNativeSync(JSON.stringify({snapshot:next})));
  expect(host.querySelector('[role=dialog]')).toBeNull();
  await act(async()=>resolveSave());expect(section(3)).toBeNull();expect(host.textContent).toContain('另一卡片');
  await click(named('模块划分设置'));expect(host.querySelectorAll('[role=dialog] [role=combobox]')[1].textContent).toContain('HTML');
});

it('malformed, false, and mismatched save receipts retain draft and never announce success',async()=>{
  await click(named('模块划分设置'));await change(host.querySelectorAll('[role=dialog] [role=combobox]')[1],'nested');
  for(const receipt of [
    {persisted:'true',moduleSettings:{...defaultSettings(),revision:1,defaultProfileId:'nested'}},
    {persisted:true,moduleSettings:{...defaultSettings(),version:2,revision:1}},
    {persisted:true,moduleSettings:{...defaultSettings(),revision:1}},
  ]){
    MNBridge.send.mockResolvedValueOnce(receipt);await click(btn('保存'));
    expect(host.querySelector('[role=dialog]')).not.toBeNull();expect(host.querySelectorAll('[role=dialog] [role=combobox]')[1].textContent).toContain('HTML＋Markdown');
    expect(host.querySelector('.status-message').textContent).not.toContain('模块设置已保存');expect(section(3)).toBeNull();
  }
  await click(btn('保存'));expect(host.querySelector('[role=dialog]')).toBeNull();expect(section(3)).not.toBeNull();expect(host.querySelector('.status-message').textContent).toBe('模块设置已保存');
});

it('dismisses open module menus on outside click, Escape, or opening another menu, and guards IME Escape in module dialogs',async()=>{
  const firstMenu=section(1).querySelector('.module-menu');
  const secondMenu=section(2).querySelector('.module-menu');
  await act(async()=>{firstMenu.open=true;firstMenu.dispatchEvent(new Event('toggle'));});
  expect(firstMenu.open).toBe(true);
  await act(async()=>{secondMenu.open=true;secondMenu.dispatchEvent(new Event('toggle'));});
  expect(firstMenu.open).toBe(false);
  expect(secondMenu.open).toBe(true);
  secondMenu.querySelector('button').focus();
  await act(async()=>secondMenu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(secondMenu.open).toBe(false);
  expect(document.activeElement).toBe(secondMenu.querySelector('summary'));
  await act(async()=>{firstMenu.open=true;firstMenu.dispatchEvent(new Event('toggle'));});
  await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  expect(firstMenu.open).toBe(false);

  await click(named('模块划分设置'));
  const modal=host.querySelector('[role=dialog]');
  expect(modal.querySelector('.dialog-actions .secondary')?.textContent).toBe('取消');
  expect(modal.querySelector('.dialog-actions .primary')?.textContent).toBe('保存');
  await act(async()=>modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true})));
  expect(host.querySelector('[role=dialog]')).not.toBeNull();
  await act(async()=>modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:229,bubbles:true})));
  expect(host.querySelector('[role=dialog]')).not.toBeNull();
  await act(async()=>modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('[role=dialog]')).toBeNull();
});
