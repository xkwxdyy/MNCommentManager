const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const calls = [];
let confirmHook = () => true;
const context = vm.createContext({console:{log(){}},
  MNUtil:{confirm:async()=>confirmHook(),showHUD(){}},
  __MN_UNDO_GROUPING_MNCommentManagerAddon:{run(_label,_meta,fn){calls.push('undo');return fn()}},
  __MN_COMMENT_WORKFLOW_STORE__:{get(){return null},save(payload){calls.push('save');return payload}},
  __MN_COMMENT_BATCH_EDITOR__:{buildOverview(){return []},mergeSelected(_notes,_selector,options){calls.push(JSON.parse(JSON.stringify(options)));return {failed:0}}},
});
const sourceDir=process.env.COMMENT_WORKFLOW_SOURCE || path.join(__dirname,'../src');
for(const name of ['CommentWorkflowRegistry','CommentWorkflowRunner','WebBridgeCommands']) vm.runInContext(fs.readFileSync(path.join(sourceDir,name+'.js'),'utf8'),context);
const registry=context.__MN_COMMENT_WORKFLOW_REGISTRY__, runner=context.__MN_COMMENT_WORKFLOW_RUNNER__;
const commands=context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
const addon={batchCommentContext:{token:'t',notes:[{noteId:'A'},{noteId:'B'}]}};
const workflow=options=>({name:'参数验证',scope:'batch',steps:[{actionId:'mergeSelectedComments',options}]});
const plain=value=>JSON.parse(JSON.stringify(value));
(async()=>{
  const catalog=registry.getCatalog('batch').find(a=>a.id==='mergeSelectedComments');
  assert.equal(catalog.parameterSchema.length,3);
  catalog.parameterSchema[0].choices[0].value='corrupt';
  assert.equal(registry.getAction('mergeSelectedComments').parameterSchema[0].choices[0].value,'comment');
  await runner.run(addon,workflow({}),{token:'t'});
  assert.deepEqual(calls,['undo',{destination:'comment',separator:'\n\n',markdown:true}]);
  for(const options of [{destination:'unknown'},{markdown:'false'},{separator:3},{extra:true},{separator:'x'.repeat(257)},[]]){
    calls.length=0;
    await assert.rejects(()=>runner.run(addon,workflow(options),{token:'t'}),/参数/);
    assert.deepEqual(calls,[],'preflight cannot enter undo/mutation');
    assert.throws(()=>commands.previewBatchWorkflow({addon},{token:'t',workflow:workflow(options)}),/参数/);
    assert.throws(()=>commands.saveWorkflow({addon},workflow(options)),/参数/);
    assert.deepEqual(calls,[],'invalid save cannot persist');
  }
  // Validate every step before the first mutation, not only the current step.
  calls.length=0;
  const badLater=workflow({});badLater.steps.push({actionId:'mergeSelectedComments',options:{markdown:1}});
  await assert.rejects(()=>runner.run(addon,badLater,{token:'t'}));assert.deepEqual(calls,[]);
  const supplied=workflow({separator:' / '});
  confirmHook=()=>{supplied.steps[0].options.separator='late change';return true};
  await runner.run(addon,supplied,{token:'t'});
  assert.equal(calls[1].separator,' / ','confirmation must not change validated options');
  const preview=commands.previewBatchWorkflow({addon},{token:'t',workflow:workflow({markdown:false})});
  assert.equal(preview.steps[0].options.markdown,false);
  registry.registerAction({id:'legacy.action',run(){}});
  assert.deepEqual(plain(registry.validateOptions(registry.getAction('legacy.action'),{custom:{deep:true}})),{custom:{deep:true}});
  for(const schema of [[{key:'constructor',type:'string'}],[{key:'x',type:'script'}],[{key:'x',type:'boolean',default:'true'}],[{key:'x',type:'string'},{key:'x',type:'number'}]]) {
    assert.equal(registry.registerAction({id:'invalid.schema',parameterSchema:schema,run(){}}),false);
  }
  assert(registry.registerAction({id:'test.number',parameterSchema:[{key:'count',label:'数量',type:'number',min:1,max:4,integer:true,required:true}],run(){}}));
  const numeric=registry.getAction('test.number');
  for(const options of [{},{count:'2'},{count:0},{count:2.5},{count:Infinity}]) assert.throws(()=>registry.validateOptions(numeric,options),/参数/);
  assert.deepEqual(plain(registry.validateOptions(numeric,{count:2})),{count:2});
  console.log('Workflow parameters: catalog, defaults, native preflight/save/preview, late edits and legacy compatibility passed');
})().catch(error=>{console.error(error);process.exitCode=1});
