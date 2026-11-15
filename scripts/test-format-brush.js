const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value,(k,v)=>k==='rtf'?{value:v.value}:v));
function data(value){return {value,base64Encoding(){return Buffer.from(value).toString('base64');}};}
function rtf(text,style){const rgb=hex=>[0,2,4].map(i=>parseInt(hex.slice(1+i,3+i),16));const colors=[style.textColor,style.backgroundColor].map(c=>c?rgb(c).map((v,i)=>'\\'+['red','green','blue'][i]+v).join('')+';':';').join('');return data('{\\rtf1{\\fonttbl\\f0\\fnil '+style.fontName+';}{\\colortbl;'+colors+'}\\pard\\f0\\fs'+style.fontSize*2+'\\cf1\\cb2 '+text.replace(/\n/g,'\\line ')+'}');}
const blue={fontName:'PingFangSC-Regular',fontSize:16,textColor:'#175D62',backgroundColor:'#E3F2FD'},red={...blue,fontSize:12,textColor:'#9A3412',backgroundColor:'#FFF0DC'};
function setup(mode='ok',refreshMode='mnutil'){
 let groups=[],events=[],writes=0,saved=null,last=null,nativeUndos=0;
 const rows=[{type:'HtmlNote',text:'相关思考',author:'',rtf:rtf('相关思考',blue)},{type:'HtmlNote',text:'目标甲\n第二行',author:'',field:'证明',fieldLabel:true,rtf:rtf('目标甲\n第二行',red)},{type:'TextNote',text:'unselected text'},{type:'HtmlNote',text:'目标乙',author:'',rtf:rtf('目标乙',red)},{type:'HtmlNote',text:'untouched',author:'',rtf:rtf('untouched',red)}];
 const n={noteId:'N',notebookId:'B',comments:rows,refresh(){},appendRichTextComment(text,style){writes++;if(mode==='silent')return;if(mode==='second-failure'&&writes===2)throw Error('native failure');this.comments.push({type:'HtmlNote',text:mode==='wrong-text'?'corrupt':text,author:'',rtf:rtf(text,style)});},setCommentField(i,field,fieldLabel){Object.assign(this.comments[i],{field,fieldLabel});},sortCommentsByNewIndices(map){if(mode==='bad-sort')return;const old=this.comments.slice();map.forEach((to,from)=>this.comments[to]=old[from]);},removeCommentByIndex(i){this.comments.splice(i,1);}};
 function restore(snapshot){n.comments=snapshot.map(c=>({...c,rtf:c.rtf?data(c.rtf.value):undefined}));n.comments.forEach(c=>{if(!c.rtf)delete c.rtf;});}
 const undo={canUndo:()=>!!saved,undo(){nativeUndos++;if(saved){restore(saved);saved=null;}}};
 const context=vm.createContext({console,Map,Date,Math,UndoManager:{sharedInstance:()=>undo},MNUtil:{dataToString:d=>d.value,app:{refreshAfterDBChanged:id=>events.push("app-refresh:"+id)}},__MN_UNDO_GROUPING_MNCommentManagerAddon:{run(action,_opts,block){groups.push(action);events.push("group-start");saved=copy(n.comments);try{last=block();return last;}finally{events.push("group-end");}}},__MN_COMMENT_DATA__:{getWrappedNoteById:id=>id==='N'?n:null,getNoteSnapshot:note=>({noteId:'N',comments:note.comments.map((c,index)=>({index,text:c.text,type:c.type}))})}});
 if(refreshMode==='mnutil')context.MNUtil.refreshAfterDBChanged=id=>events.push('native-refresh:'+id);
 for(const file of ['CommentRichFormat.js','CommentMutations.js','CommentFormatBrush.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
 return {api:context.__MN_COMMENT_FORMAT_BRUSH__,n,groups,events,undo,get writes(){return writes;},get nativeUndos(){return nativeUndos;},before:()=>copy(n.comments),format:c=>JSON.parse(JSON.stringify(context.__MN_COMMENT_RICH_FORMAT__.describe(c).style))};
}
{
 const t=setup(),before=t.before(),p=t.api.preview('N',0);assert.equal(p.targets.length,3);assert(p.targets.every(c=>c.eligible));
 const result=t.api.apply({noteId:'N',token:p.token,indices:[1,3]});assert.equal(result.changedCount,2);assert.equal(t.groups.length,1);assert.deepEqual(t.n.comments.map(c=>c.text),before.map(c=>c.text));assert.deepEqual(t.format(t.n.comments[1]),blue);assert.deepEqual(t.format(t.n.comments[3]),blue);assert.equal(t.n.comments[1].field,'证明');assert.equal(t.n.comments[1].fieldLabel,true);assert.deepEqual(copy(t.n.comments[4]),before[4]);
 t.undo.undo();assert.deepEqual(t.before(),before,'one native undo restores the whole batch, including bytes and metadata');
}
{
 const t=setup(),before=t.before(),p=t.api.preview('N',0);const result=t.api.apply({noteId:'N',token:p.token,indices:[1,3]});t.api.undo({noteId:'N',token:result.undoToken});assert.deepEqual(t.before(),before,'web undo restores styles and fields');
}
for(const mode of ['silent','wrong-text','bad-sort','second-failure']){
 const t=setup(mode),before=t.before(),p=t.api.preview('N',0);assert.throws(()=>t.api.apply({noteId:'N',token:p.token,indices:[1,3]}));assert.deepEqual(t.before(),before,mode+' preserves the entire original batch');assert.equal(t.nativeUndos,0,'failure recovery must not pop the host undo history');
}
{
 const t=setup(),p=t.api.preview('N',0);t.n.comments.reverse();assert.throws(()=>t.api.apply({noteId:'N',token:p.token,indices:[1]}),/变化/);assert.equal(t.writes,0);
}
{
 const t=setup();t.n.comments[1].mnCommentId='stable-identity';t.n.comments[3].mnCommentDisplay={v:1,collapsed:true};const p=t.api.preview('N',0);assert.equal(p.targets[0].eligible,false);assert.equal(p.targets[1].eligible,false);assert.throws(()=>t.api.apply({noteId:'N',token:p.token,indices:[1]}));assert.equal(t.writes,0);
}
for(const indices of [[0],[2],[1,1],[-1],['1'],[]]){const t=setup(),p=t.api.preview('N',0);assert.throws(()=>t.api.apply({noteId:'N',token:p.token,indices}));assert.equal(t.writes,0);}
{
 const t=setup();t.n.comments[1].rtf=rtf('与 text 镜像不同的真实正文',red);const before=t.before(),p=t.api.preview('N',0);assert.throws(()=>t.api.apply({noteId:'N',token:p.token,indices:[1]}),/正文/);assert.deepEqual(t.before(),before,'a mismatched text mirror must never replace the original RTF body');assert.equal(t.nativeUndos,0);
}
{
 const t=setup(),p=t.api.preview('N',0),r=t.api.apply({noteId:'N',token:p.token,indices:[1]});t.n.comments[2].text='new user edit';const before=t.before();assert.throws(()=>t.api.undo({noteId:'N',token:r.undoToken}),/继续编辑/);assert.deepEqual(t.before(),before);
}
console.log('Format brush: native group, compensation undo, fields/text/order, unselected bytes, atomic failure recovery, stale plans and protected metadata passed');

for(const mode of ['mnutil','app']){
 const t=setup('ok',mode),p=t.api.preview('N',0);assert.equal(t.events.length,0,'preview does not refresh');const r=t.api.apply({noteId:'N',token:p.token,indices:[1,3]});const event=(mode==='mnutil'?'native-refresh:':'app-refresh:')+'B';assert.equal(t.events.filter(e=>e===event).length,1,'one immediate host refresh per applied batch');assert(t.events.indexOf(event)>t.events.indexOf('group-end'),'host refresh follows the committed undo group');t.api.undo({noteId:'N',token:r.undoToken});assert.equal(t.events.filter(e=>e===event).length,2,'batch undo immediately redraws the host too');
}
