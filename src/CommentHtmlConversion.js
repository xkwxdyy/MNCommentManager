// Conservative HTML -> Markdown contract for JavaScriptCore (no DOM or network).
var __MN_COMMENT_HTML__ = (function () {
  const allowed = new Set(['p','div','br','strong','b','em','i','del','s','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','a','img','hr']);
  const voidTags = new Set(['br','img','hr']);
  function reject(reason) { throw new Error(reason); }
  function decode(text) {
    return text.replace(/&([^;\s]+);/g, (_all, key) => {
      const entities = { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0' };
      if (Object.prototype.hasOwnProperty.call(entities,key)) return entities[key];
      if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(key)) {
        const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
        if (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) return String.fromCodePoint(n);
      }
      reject('不支持的 HTML 实体');
    });
  }
  function parse(html) {
    const root = {tag:'root',children:[]}, stack=[root]; let pos=0, count=0;
    while (pos < html.length) {
      if (++count > 20000 || stack.length > 100) reject('HTML 结构过深或过长');
      if (html[pos] !== '<') {
        const end=html.indexOf('<',pos), stop=end < 0 ? html.length : end;
        stack[stack.length-1].children.push({text:decode(html.slice(pos,stop))}); pos=stop; continue;
      }
      const match=html.slice(pos).match(/^<\s*(\/?)\s*([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i);
      if (!match) reject('无法解析 HTML 结构');
      pos+=match[0].length;const tag=match[2].toLowerCase();
      if (!allowed.has(tag)) reject('不支持的 HTML 元素: '+tag);
      if (match[1]) {
        if (match[3].trim() || stack.length===1 || stack[stack.length-1].tag!==tag) reject('HTML 标签不匹配');
        stack.pop();continue;
      }
      let tail=match[3], selfClosing=/\/\s*$/.test(tail);if(selfClosing)tail=tail.replace(/\/\s*$/,'');
      const attrs={};
      while(tail.trim()) {
        const a=tail.match(/^\s+([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
        if(!a)reject('无法解析 HTML 属性');tail=tail.slice(a[0].length);const key=a[1].toLowerCase();
        if(Object.prototype.hasOwnProperty.call(attrs,key))reject('重复 HTML 属性');
        const permitted=tag==='a'?['href','title']:tag==='img'?['src','alt','title']:tag==='ol'?['start']:tag==='code'?['class']:[];
        if(!permitted.includes(key))reject('无法保留 HTML 属性: '+key);
        attrs[key]=decode(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);
      }
      if(tag==='a' && stack.some(n=>n.tag==='a'))reject('嵌套链接');
      const emphasis=['strong','b','em','i','del','s'];
      if(emphasis.includes(tag) && stack.some(n=>emphasis.includes(n.tag)))reject('嵌套强调格式暂不支持');
      if(['p','h1','h2','h3','h4','h5','h6'].includes(stack[stack.length-1].tag) && !['strong','b','em','i','del','s','code','a','img','br'].includes(tag))reject('块级元素嵌套无效');
      if(tag==='li' && !['ul','ol'].includes(stack[stack.length-1].tag))reject('孤立列表项');
      const siblings=stack[stack.length-1].children;
      if(emphasis.includes(tag) && siblings.length && emphasis.includes(siblings[siblings.length-1].tag))reject('相邻强调格式暂不支持');
      const node={tag,attrs,children:[]};stack[stack.length-1].children.push(node);
      if(!voidTags.has(tag)){if(selfClosing)reject('不支持自闭合容器');stack.push(node);}
    }
    if(stack.length!==1)reject('HTML 标签未闭合');return root;
  }
  function escape(text){return text.replace(/&/g,'&amp;').replace(/([\\`*_{}\[\]<>#!|~$.+-])/g,'\\$1');}
  function url(value){
    if(typeof value!=='string'||!value||/[\x00-\x20<>\\]/.test(value)||! /^(https?:|mailto:|marginnote\d*(?:app)?:|\/|#)/i.test(value))reject('无法安全保留链接地址');
    return '<'+value+'>';
  }
  function inlineOnly(node){if(node.children.some(n=>n.tag && !['strong','b','em','i','del','s','code','a','img','br'].includes(n.tag)))reject('不支持的行内容器结构');}
  function render(node) {
    if(node.text!==undefined){if(node.text.includes('\u00a0'))reject('不换行空格暂不转换');return escape(node.text.replace(/[\t\r\n ]+/g,' '));}
    const tag=node.tag;
    const content=()=>node.children.map((child,index)=>{
      if(['strong','b','em','i','del','s'].includes(child.tag)) {
        const before=node.children[index-1],after=node.children[index+1];
        if((before && (before.text===undefined || /\S$/.test(before.text))) || (after && (after.text===undefined || /^\S/.test(after.text))))reject('强调边界暂不能保真转换');
      }
      return render(child);
    }).join('');
    const wrap=marker=>{inlineOnly(node);const body=content();if(!body.trim())reject('空强调元素');if(/^[\s]*[!.,;:?，。；：！？]|[!.,;:?，。；：！？][\s]*$/.test(body))reject('强调标点边界暂不支持');return body.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_m,a,b,c)=>a+marker+b+marker+c);};
    if(tag==='root')return content();
    if(tag==='strong'||tag==='b')return wrap('**');
    if(tag==='em'||tag==='i')return wrap('_');
    if(tag==='del'||tag==='s')return wrap('~~');
    if(tag==='p'||tag==='div')return '\n\n'+content().trim()+'\n\n';
    if(/^h[1-6]$/.test(tag)){inlineOnly(node);return '\n\n'+'#'.repeat(Number(tag[1]))+' '+content().trim()+'\n\n';}
    if(tag==='br')return '  \n';
    if(tag==='hr')return '\n\n---\n\n';
    if(tag==='a'){
      inlineOnly(node);if(node.children.some(n=>n.tag==='a'))reject('嵌套链接');
      if(node.attrs.title && /[\r\n]/.test(node.attrs.title))reject('链接标题含换行');
      const title=node.attrs.title!==undefined?' "'+node.attrs.title.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,' ')+'"':'';
      return '['+content()+']('+url(node.attrs.href)+title+')';
    }
    if(tag==='img'){
      if(node.attrs.title!==undefined)reject('图片标题暂不支持');
      return '!['+(node.attrs.alt||'').replace(/[^a-z0-9 \u0080-\uffff]/gi,c=>'&#'+c.charCodeAt(0)+';')+']('+url(node.attrs.src)+')';
    }
    if(tag==='code'){
      if(node.children.some(n=>n.text===undefined)||node.attrs.class)reject('独立代码格式不支持');
      const text=node.children.map(n=>n.text).join('');if(/[\r\n]/.test(text))reject('行内代码含换行');
      const ticks='`'.repeat(Math.max(0,...(text.match(/`+/g)||[]).map(x=>x.length))+1);
      const pad=/^`|`$|^ .* $/.test(text)?' ':'';return ticks+pad+text+pad+ticks;
    }
    if(tag==='pre'){
      let children=node.children,lang='';
      if(children.length===1&&children[0].tag==='code'){
        const code=children[0];if(code.attrs.class){const m=code.attrs.class.match(/^language-([\w+-]+)$/);if(!m)reject('未知代码语言标记');lang=m[1];}children=code.children;
      }
      if(children.some(n=>n.text===undefined))reject('代码块包含结构元素');
      const text=children.map(n=>n.text).join('');const fence='`'.repeat(Math.max(3,...(text.match(/`+/g)||[]).map(x=>x.length+1)));
      return '\n\n'+fence+lang+'\n'+text+(text.endsWith('\n')?'':'\n')+fence+'\n\n';
    }
    if(tag==='blockquote')return '\n\n'+content().trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
    if(tag==='ul'||tag==='ol'){
      if(node.children.some(n=>n.tag!=='li'&&(n.text===undefined||n.text.trim())))reject('列表包含非列表项');
      let index=1;if(node.attrs.start!==undefined){if(!/^[1-9][0-9]{0,8}$/.test(node.attrs.start))reject('列表起始值无效');index=Number(node.attrs.start);}
      return '\n\n'+node.children.filter(n=>n.tag==='li').map(n=>{
        const prefix=tag==='ol'?(index++)+'. ':'- ';return prefix+render(n).trim().replace(/\n/g,'\n'+' '.repeat(prefix.length));
      }).join('\n')+'\n\n';
    }
    if(tag==='li')return content();
    reject('无法转换的结构');
  }
  function convert(html) {
    try {
      if(typeof html!=='string'||!html.trim()||html.length>500000)reject('HTML 内容缺失或过长');
      const markdown=render(parse(html)).trim();if(!markdown)reject('转换内容为空');
      return {ok:true,format:'markdown',markdown,canFullyConvertedToMarkdown:true,reasons:[]};
    }catch(error){return {ok:false,format:'html',markdown:'',canFullyConvertedToMarkdown:false,reasons:[error.message]};}
  }
  return {convert};
})();
