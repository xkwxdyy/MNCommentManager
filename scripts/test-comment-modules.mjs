import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import * as rules from '../web/src/lib/commentModules.mjs';
const source = name => readFileSync(new URL(`../src/${name}.js`,import.meta.url),'utf8');
const row = (type,text,index) => ({index,type,text});
const comments = [row('textComment','前置',0),row('HtmlComment','空',1),row('HtmlComment','应用',2),row('markdownComment','\n## 方法\n正文保持完整',3),row('markdownComment','### 示例',4),row('textComment','正文',5),row('HtmlComment','应用',6),row('textComment','末尾',7)];
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
  let document = null, fail = false, writes = 0, groups = 0;
  const note = { noteId:'card', noteTitle:'card', comments:comments.map(c => ({...c})), moveComment(from,to) { this.comments.splice(to,0,this.comments.splice(from,1)[0]); }, refresh() {} };
  const context = vm.createContext({ console:{log(){}}, Application:{sharedInstance:()=>({documentPath:'/documents'})},
    NSFileManager:{defaultManager:()=>({fileExistsAtPath:p=>p.endsWith('.json') ? document!==null : true})},
    NSData:{dataWithContentsOfFile:()=>({value:document})},
    NSJSONSerialization:{JSONObjectWithDataOptions:data=>JSON.parse(data.value),dataWithJSONObjectOptions:value=>({writeToFileAtomically(){if(fail)return false;writes++;document=JSON.stringify(value);return true;}})},
    __MN_COMMENT_DATA__:{getWrappedNoteById:()=>note,getNoteSnapshot:()=>({noteId:'card',comments:note.comments.map((c,index)=>({...c,index}))})},
    MNUtil:{showHUD(){},refreshNote(){},refreshNotebook(){},refreshStudyView(){}},
    __MN_UNDO_GROUPING_MNCommentManagerAddon:{run(_label,_metadata,block){groups++;return block();}},
  });
  ['CommentModuleRules','CommentModuleStore','CommentMutations','CommentModuleOperations','WebBridgeCommands'].forEach(name=>vm.runInContext(source(name),context));
  return {context,note,get document(){return document;},set document(v){document=v;},set fail(v){fail=v;},get writes(){return writes;},get groups(){return groups;}};
}
test('full-list boundaries preserve empty modules and repeated headings',()=>{
  const tree=rules.buildModules(comments,rules.PRESETS[0]);
  assert.deepEqual(tree.flat.map(n=>[n.title,n.start,n.end]),[['未分组',0,1],['空',1,2],['应用',2,6],['应用',6,8]]);
  assert.deepEqual(rules.moduleIds(tree.flat[2],comments,tree.titleIds,false),[3,4,5]);
});
test('nested Markdown levels and HtmlMD markers remain indivisible',()=>{
  const tree=rules.buildModules(comments,rules.PRESETS[2]);
  assert.deepEqual(tree.flat.map(n=>n.depth),[0,0,0,1,2,0]);
  assert.deepEqual(rules.moduleIds(tree.flat[2],comments,tree.titleIds,false),[5]);
  const markers=[row('markdownComment','- <span id="method">章节</span>',0),row('markdownComment','<span id="level2">内层</span>',1)];
  assert.deepEqual(rules.buildModules(markers,rules.PRESETS[1]).flat.map(n=>[n.title,n.rank,n.depth]),[['章节',0,0],['内层',2,1]]);
});
test('matching modes and explicit heading levels determine boundaries',()=>{
  for(const [match,value,expected] of [['all','',3],['exact','应用',2],['prefix','应',2],['contains','用',2]]) assert.equal(rules.buildModules(comments,{...rules.PRESETS[0],match,value}).titleIds.size,expected);
  assert.equal(rules.buildModules(comments,{...rules.PRESETS[1],levels:[3]}).titleIds.size,1);
});
test('body-only selection excludes all descendant structure headings and retains unrelated selection',()=>{
  const tree=rules.buildModules(comments,rules.PRESETS[2]), ids=rules.moduleIds(tree.flat[2],comments,tree.titleIds,false);
  const selection=rules.toggleIds(new Set([0]),ids);
  assert.deepEqual([...selection],[0,5]);assert.equal(rules.selectionState(ids,selection).checked,true);
});
test('configuration validates card overrides and detects invalid profiles',()=>{
  const settings=rules.defaultSettings();settings.cardOverrides.card={profileId:'nested',includeTitle:false};
  assert.equal(rules.effectiveSettings(rules.validateSettings(settings),'card').profile.mode,'nested');
  assert.equal(rules.effectiveSettings(settings,'other').profile.mode,'html');
  assert.throws(()=>rules.validateSettings({...settings,version:2}));
  assert.throws(()=>rules.validateSettings({...settings,profiles:[]}));
});
test('native generated rules produce the same module tree and signature',()=>{
  const {context}=setup();
  assert.deepEqual(plain(context.__MN_COMMENT_MODULE_RULES__.buildModules(comments,rules.PRESETS[2]).flat),plain(rules.buildModules(comments,rules.PRESETS[2]).flat));
  assert.equal(context.__MN_COMMENT_MODULE_RULES__.structureSignature(comments),rules.structureSignature(comments));
});
test('native config saves atomically, restores after reload, and rejects stale revisions',()=>{
  const state=setup(), store=state.context.__MN_COMMENT_MODULE_STORE__;
  const settings=rules.defaultSettings(); settings.defaultProfileId='nested';settings.cardOverrides.card={profileId:'markdown',includeTitle:false};
  assert.equal(store.save(settings,0).revision,1);assert.equal(state.writes,1);
  vm.runInContext(source('CommentModuleStore'),state.context);
  assert.equal(state.context.__MN_COMMENT_MODULE_STORE__.read().cardOverrides.card.profileId,'markdown');
  assert.throws(()=>store.save(settings,0),/已变化/);assert.equal(state.writes,1);
});
test('corrupt, empty, newer files and failed writes are preserved',()=>{
  for(const data of ['{','',JSON.stringify({...rules.defaultSettings(),version:2})]) {
    const state=setup();state.document=data;const store=state.context.__MN_COMMENT_MODULE_STORE__;
    assert.ok(store.snapshot().moduleSettingsError);assert.throws(()=>store.save(rules.defaultSettings(),0));assert.equal(state.document,data);
  }
  const state=setup();state.fail=true;assert.throws(()=>state.context.__MN_COMMENT_MODULE_STORE__.save(rules.defaultSettings(),0),/保存失败/);assert.equal(state.document,null);
});
test('module movement includes headings, respects siblings, and rejects stale snapshots before mutation',()=>{
  const state=setup(), commands=state.context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
  const payload={noteId:'card',moduleId:'module-2',direction:'down',expectedRevision:0,expectedStructure:rules.structureSignature(comments)};
  const result=commands.reorderCommentModule({},payload);
  assert.deepEqual(state.note.comments.map(c=>c.text),[comments[0].text,comments[1].text,comments[6].text,comments[7].text,...comments.slice(2,6).map(c=>c.text)]);
  assert.deepEqual(plain(result.selectedIndices),[4,5,6,7]);assert.equal(state.groups,1);
  assert.throws(()=>commands.reorderCommentModule({},payload),/已变化/);assert.equal(state.groups,1);
});
test('body movement preserves order when selection straddles a destination and excludes headings',()=>{
  const state=setup(), commands=state.context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands;
  const result=commands.moveCommentModuleBody({}, {noteId:'card',indices:[0,7],targetId:'module-2',expectedRevision:0,expectedStructure:rules.structureSignature(comments)});
  assert.deepEqual(state.note.comments.map(c=>c.index),[1,2,3,4,5,0,7,6]);assert.deepEqual(plain(result.selectedIndices),[5,6]);assert.equal(state.groups,1);
  assert.throws(()=>rules.bodyMovePlan(rules.buildModules(comments,rules.PRESETS[0]),comments,[2],'module-6'),/结构标题/);
});
test('module extraction derives its scope natively, including hidden descendants',()=>{
  const state=setup();let args;
  state.context.__MN_COMMENT_MUTATIONS__.extractCommentsToChildNote=(...value)=>{args=value;return{createdNoteId:'child'};};
  const settings=rules.defaultSettings();settings.defaultProfileId='nested';settings.includeTitle=false;state.document=JSON.stringify(settings);
  const result=state.context.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.extractCommentModule({}, {noteId:'card',moduleId:'module-2',title:'子卡片',removeOriginal:false,expectedRevision:0,expectedStructure:rules.structureSignature(comments)});
  assert.equal(result.createdNoteId,'child');assert.deepEqual(plain(args),['card',[5],'子卡片',false]);
});
test('configuration readback ignores dictionary key enumeration order',()=>{
  const settings=rules.defaultSettings();settings.cardOverrides.z={profileId:'html',includeTitle:true};settings.cardOverrides.a={profileId:'nested',includeTitle:false};
  const reversed={...settings,cardOverrides:{a:settings.cardOverrides.a,z:settings.cardOverrides.z}};
  assert.equal(JSON.stringify(rules.validateSettings(settings)),JSON.stringify(rules.validateSettings(reversed)));
});
test('structure signature detects media-only changes and ignores comment collapse',()=>{
  const first=[{index:0,type:'audioComment',audioHash:'A',collapsed:false}];
  assert.notEqual(rules.structureSignature(first),rules.structureSignature([{...first[0],audioHash:'B'}]));
  assert.equal(rules.structureSignature(first),rules.structureSignature([{...first[0],collapsed:true}]));
});

test('native merged Markdown and text types use the same heading and text rules',()=>{
  const merged=[row('mergedMarkdownComment','## 合并章节',0),row('mergedTextComment','模块：补充',1)];
  assert.equal(rules.buildModules(merged,rules.PRESETS[1]).flat[0].title,'合并章节');
  assert.equal(rules.buildModules(merged,rules.PRESETS[3]).flat[1].title,'补充');
});
