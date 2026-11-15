import { Marked } from 'marked';
// Use the same dollar-math token boundaries as markdownRenderer / marked-katex-extension.
// Only tokenization is needed here; the native bundle does not include KaTeX rendering.
const inlineMath = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/;
const blockMath = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
const converter = new Marked({
  extensions: [
    {
      name: 'inlineKatex',
      level: 'inline',
      start(src) {
        let offset = 0;
        while (offset < src.length) {
          const at = src.indexOf('$', offset);
          if (at < 0) return;
          if (inlineMath.test(src.slice(at))) return at;
          offset = at + 1;
        }
      },
      tokenizer(src) {
        const m = src.match(inlineMath);
        if (m) return { type: 'inlineKatex', raw: m[0], text: m[2] };
      },
    },
    {
      name: 'blockKatex',
      level: 'block',
      tokenizer(src) {
        const m = src.match(blockMath);
        if (m) return { type: 'blockKatex', raw: m[0], text: m[2] };
      },
    },
  ],
});
const math = (text) => /\\\(|\\\[|\\begin\{/.test(text);
function decode(text) {
  const names = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    copy: '©',
    reg: '®',
    trade: '™',
    hellip: '…',
    ndash: '–',
    mdash: '—',
  };
  return String(text).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, name) => {
    if (name[0] !== '#') {
      if (!(name in names)) throw Error('评论包含暂不支持的字符，请先核对原文');
      return names[name];
    }
    const n = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff))
      throw Error('字符实体无效');
    return String.fromCodePoint(n);
  });
}
function mathSource(tokens) {
  return (tokens || [])
    .map((t) => {
      if (t.type === 'code' || t.type === 'codespan' || (t.type === 'escape' && t.raw === '\\$'))
        return '';
      if (t.items) return t.items.map((item) => mathSource(item.tokens)).join('\n');
      return t.tokens ? mathSource(t.tokens) : t.raw || t.text || '';
    })
    .join('\n');
}
export function markdownToText(source) {
  try {
    function inline(tokens) {
      if (math(mathSource(tokens))) throw Error('评论包含公式，暂不支持转换为 HTML');
      return (tokens || [])
        .map((t) => {
          if (['strong', 'em', 'del'].includes(t.type)) return inline(t.tokens);
          if (t.type === 'codespan' || t.type === 'escape') return decode(t.text);
          if (t.type === 'br') return '\n';
          if (t.type === 'text') {
            if (math(t.text)) throw Error('评论包含公式，暂不支持转换为 HTML');
            return t.tokens ? inline(t.tokens) : decode(t.text);
          }
          if (t.type === 'inlineKatex') throw Error('评论包含公式，暂不支持转换为 HTML');
          if (t.type === 'image') throw Error('评论包含图片，暂不支持转换为 HTML');
          if (t.type === 'link') throw Error('评论包含链接，暂不支持转换，以免丢失链接信息');
          throw Error('评论包含 HTML 或复杂的行内格式，暂不支持转换');
        })
        .join('');
    }
    function blocks(tokens, nested = false) {
      return tokens
        .filter((t) => t.type !== 'space')
        .map((t) => {
          if (['paragraph', 'heading', 'text'].includes(t.type))
            return t.tokens ? inline(t.tokens) : decode(t.text);
          if (t.type === 'blockKatex') throw Error('评论包含公式，暂不支持转换为 HTML');
          if (t.type === 'code') return t.text;
          if (t.type === 'list') {
            if (nested || t.items.some((item) => item.task))
              throw Error('评论包含嵌套列表或任务列表，暂不支持转换');
            return t.items
              .map(
                (item, i) =>
                  `${t.ordered ? Number(t.start || 1) + i + '.' : '•'} ${blocks(item.tokens, true)}`,
              )
              .join('\n');
          }
          if (t.type === 'table') throw Error('评论包含表格，暂不支持转换为 HTML');
          throw Error('评论包含引用、HTML 或其他复杂结构，暂不支持转换');
        })
        .join('\n\n');
    }
    const tokens = converter.lexer(String(source), converter.defaults);
    if (math(mathSource(tokens))) throw Error('评论包含公式，暂不支持转换为 HTML');
    const text = blocks(tokens);
    if (!text.trim()) throw Error('没有可转换的显示文字');
    return { supported: true, text, reason: '' };
  } catch (e) {
    return { supported: false, text: '', reason: e.message };
  }
}
