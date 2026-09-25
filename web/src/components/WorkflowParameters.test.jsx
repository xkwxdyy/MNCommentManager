// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import WorkflowParameters from './WorkflowParameters';
const native=vm.createContext({console:{log(){}}});
for(const name of ['CommentWorkflowRegistry','CommentWorkflowRunner']) vm.runInContext(fs.readFileSync(path.resolve('src',`${name}.js`),'utf8'),native);
const schema=JSON.parse(JSON.stringify(native.__MN_COMMENT_WORKFLOW_REGISTRY__.getCatalog('batch').find(a=>a.id==='mergeSelectedComments').parameterSchema));
let root,host;
afterEach(async()=>{if(root) await act(async()=>root.unmount());host?.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
async function mount(initial={},disabled=false,fields=schema){
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
  function Harness(){const [options,setOptions]=useState(initial);return <><WorkflowParameters schema={fields} options={options} onChange={setOptions} disabled={disabled}/><output>{JSON.stringify(options)}</output></>}
  await act(async()=>root.render(<Harness/>));
}
const values=()=>JSON.parse(host.querySelector('output').textContent);
async function change(element,value){await act(async()=>{const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
it('renders the Native schema and preserves unrelated stored options',async()=>{
  await mount({legacy:'kept'});
  expect(host.querySelector('input[type=checkbox]').checked).toBe(true);
  expect(host.querySelector('input:not([type])').value).toBe('\\n\\n');
  await change(host.querySelector('select'),'1');
  await change(host.querySelector('input:not([type])'),' / \\n');
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  expect(values()).toEqual({legacy:'kept',destination:'excerpt',separator:' / \n',markdown:false});
});
it('restores saved values and lets an explicit value return to its Native default',async()=>{
  await mount({markdown:false,destination:'comment'});
  expect(host.querySelector('input[type=checkbox]').checked).toBe(false);
  const label=[...host.querySelectorAll('label')].find(el=>el.textContent.includes('Markdown'));
  await act(async()=>label.parentElement.querySelector('button').click());
  expect(values()).toEqual({destination:'comment'});expect(host.querySelector('input[type=checkbox]').checked).toBe(true);
});
it('displays invalid stored enums and blocks controls during a mutation',async()=>{
  await mount({destination:'removed'},true);
  expect(host.querySelector('select').selectedOptions[0].textContent).toContain('无效');
  for(const control of host.querySelectorAll('input,select,button')) expect(control.disabled).toBe(true);
});
it('stores numbers as numbers and keeps incomplete input invalid for Native validation',async()=>{
  await mount({},false,[{key:'count',type:'number',label:'数量',min:1,max:4,integer:true}]);
  await change(host.querySelector('input'),'2');expect(values()).toEqual({count:2});
  await change(host.querySelector('input'),'');expect(values()).toEqual({count:''});
});
