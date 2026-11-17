const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../src'));
const cases = [];
for (let level = 1; level <= 6; level++) cases.push([`heading ${level}`, {type:'TextNote', text:'#'.repeat(level)+' 标题\n\n**正文**', markdown:true}, 'markdownComment']);
cases.push(
 ['indented heading', {type:'TextNote',text:'   ## 标题',markdown:true},'markdownComment'],
 ['indented code', {type:'TextNote',text:'    #标签',markdown:true},'markdownComment'],
 ['fenced code', {type:'TextNote',text:'```\n#标签\n```',markdown:true},'markdownComment'],
 ['escaped hash', {type:'TextNote',text:'\\#标签',markdown:true},'markdownComment'],
 ['markdown hashtag text', {type:'TextNote',text:'#标签',markdown:true},'markdownComment'],
 ['markdown tag-like list', {type:'TextNote',text:'#标签 #其他',markdown:true},'markdownComment'],
 ['seven hash paragraph', {type:'TextNote',text:'####### 标题',markdown:true},'markdownComment'],
 ['native tag', {type:'TextNote',text:'#标签'},'tagComment'],
 ['native hierarchical tags', {type:'TextNote',text:'#父标签/子标签 #其他',markdown:false},'tagComment'],
 ['native trailing spaces', {type:'TextNote',text:'#标签   '},'tagComment'],
 ['plain heading notation', {type:'TextNote',text:'## 标题'},'textComment'],
 ['plain multiple hashes', {type:'TextNote',text:'###标签'},'textComment'],
 ['plain indented hash', {type:'TextNote',text:'    #标签'},'textComment'],
 ['plain tag and prose', {type:'TextNote',text:'#标签 正文'},'textComment'],
 ['plain tag and newline', {type:'TextNote',text:'#标签\n正文'},'textComment'],
 ['plain multiline tags', {type:'TextNote',text:'#标签\n#其他'},'textComment'],
 ['hash before markdown link', {type:'TextNote',text:'#[链接](https://example.com)'},'markdownComment'],
 ['tag before markdown link', {type:'TextNote',text:'#标签 [链接](https://example.com)'},'markdownComment'],
 ['whitespace', {type:'TextNote',text:' \n ',markdown:true},'blankTextComment'],
 ['native summary link', {type:'TextNote',text:'marginnote4app://note/22222222-2222-2222-2222-222222222222/summary/0',markdown:true},'summaryComment'],
 ['native rich html', {type:'HtmlNote',text:'## 标题'},'HtmlComment'],
 ['native rich with Cocoa preview cache', {type:'HtmlNote',text:'原生正文',rtf:'native-rtf',html:'<p>原生正文</p>',htmlSize:{}},'HtmlComment'],
 ['merged markdown', {type:'LinkNote',q_htext:'## 标题',markdown:true},'mergedMarkdownComment'],
 ['merged plain', {type:'LinkNote',q_htext:'## 标题',markdown:false},'mergedTextComment'],
);
function legacyType(c) {
 if(c.type==='TextNote') {
  if(/^#\S/.test(c.text))return 'tagComment';
  if(/^marginnote\dapp:\/\/note\//.test(c.text))return c.text.includes('/summary/')?'summaryComment':'linkComment';
  return c.markdown?'markdownComment':'textComment';
 }
 return c.type==='LinkNote'?(c.markdown?'mergedMarkdownComment':'mergedTextComment'):c.type==='HtmlNote'?'HtmlComment':'';
}
for(const mode of ['without-utility','legacy-static-classifier','legacy-detailed-classifier']) {
 const c=vm.createContext({console,MNUtil:{getMediaByHash(){return null;}},MNNote:{new(){return null;}},__MN_HANDWRITING_PREVIEW_MNCommentManagerAddon:{renderMediaDataURI(){return{dataURI:'',error:'',pending:false};}}});
 if(mode!=='without-utility')c.MNComment={getCommentType:legacyType};
 if(mode==='legacy-detailed-classifier')c.MNComment.new=raw=>({type:legacyType(raw),detail:raw});
 for(const f of ['NoteAccess.js','CommentFoldState.js','CommentData.js'])vm.runInContext(fs.readFileSync(path.join(runtime,f),'utf8'),c,{filename:f});
 const note={noteId:'11111111-1111-1111-1111-111111111111',noteTitle:'分类验收',comments:cases.map(([,raw])=>({...raw}))};
 const before=JSON.stringify(note.comments),snapshot=c.__MN_COMMENT_DATA__.getNoteSnapshot(note);
 cases.forEach(([label,raw,expected],index)=>{
  const row=snapshot.comments[index];assert.equal(row.type,expected,mode+': '+label);assert.equal(row.text,raw.text||raw.q_htext);assert.equal(row.index,index);assert.equal(row.originalType,raw.type);
  if(expected==='markdownComment')assert.equal(row.capabilities.isMarkdown,true,label);
  if(raw.rtf)assert.equal(row.capabilities.isRichRtf,true,label);
 });
 assert.equal(JSON.stringify(note.comments),before,'classification must be read-only');
}
console.log('Comment classification: Markdown headings/code/hash text, genuine tags, legacy utility variants, native links and merged types passed');
