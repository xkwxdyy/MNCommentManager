const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {JSDOM}=require('jsdom'),{marked}=require('marked');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(process.env.MNCM_HTML_SOURCE||path.join(__dirname,'../src/CommentHtmlConversion.js'),'utf8'),ctx);
const convert=ctx.__MN_COMMENT_HTML__.convert;
marked.setOptions({mangle:false,headerIds:false});
function semantic(html){
 const doc=new JSDOM('<body>'+html+'</body>').window.document;
 function walk(n){if(n.nodeType===3)return n.textContent.replace(/[\t\r\n ]+/g,' ');if(n.nodeType!==1)return '';
 const tag=({b:'strong',i:'em',s:'del',div:'p'})[n.tagName.toLowerCase()]||n.tagName.toLowerCase();
 const attrs=Array.from(n.attributes).map(a=>[a.name,a.value]);
 let children=Array.from(n.childNodes).map(walk).filter(x=>x!=='' && !(typeof x==='string'&&!x.trim()));
 if(tag==='code')children=[n.textContent];
 return [tag,attrs,children];}
 return Array.from(doc.body.childNodes).map(walk).filter(x=>x!==''&&!(typeof x==='string'&&!x.trim()));
}
for(const html of [
 '<p>中文 <strong>重点</strong> &amp; 文本</p>',
 '<h2>标题</h2><p><em>斜体</em> 和 <del>删除</del></p>',
 '<p><a href="https://example.test/a?q=1&amp;x=2" title="title">链接</a></p>',
 '<p><img src="https://example.test/i.png" alt="图 * 1"></p>',
 '<ul><li>一</li><li>二</li></ul>', '<ol start="3"><li>三</li><li>四</li></ol>',
 '<blockquote><p>引用</p></blockquote>', '<p>一<br>二</p>',
 '<pre><code class="language-js">const x = 1;\n</code></pre>',
 '<p><code>a ` b</code></p>', '<p>1. literal - + &amp;copy; $x$</p>'
]){const result=convert(html);assert(result.ok,html+': '+result.reasons);assert.deepEqual(semantic(marked.parse(result.markdown)),semantic(html),html+' -> '+result.markdown);}
for(const html of ['<table><tr><td>x</td></tr></table>','<p style="color:red">red</p>','<span>x</span>','<script>x</script>','<a href="javascript:alert(1)">x</a>','<p>unclosed','<p>&unknown;</p>','<strong><b>x</b></strong>','<strong>x</strong><b>y</b>','<li>x</li>','<p><div>x</div></p>','<a href="/x"><b><a href="/y">x</a></b></a>',null,'']){
 const result=convert(html);assert.equal(result.ok,false,String(html));assert.equal(result.markdown,'');assert.equal(result.format,'html');assert(result.reasons.length);
}
console.log('PASS HTML fidelity: semantic Markdown round trips, raw HTML source, unsupported structure/style/link rejection');
