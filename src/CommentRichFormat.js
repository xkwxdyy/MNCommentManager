var __MN_COMMENT_RICH_FORMAT__ = (function () {
  'use strict';
  // ponytail: only uniform native RTF is supported; reject mixed/extra character formatting until a lossless native setter is available.
  const MAX_RTF = 512000;
  function reject(message) { throw new Error(message); }
  function group(text, name) {
    const start = text.indexOf('{\\' + name);
    const starred = start < 0 ? text.indexOf('{\\*\\' + name) : start;
    if (starred < 0) return '';
    let depth = 0;
    for (let i = starred; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '{') depth++;
      if (text[i] === '}' && --depth === 0) return text.slice(starred, i + 1);
    }
    reject('富文本结构不完整');
  }
  function hex(rgb) { return '#' + rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  function read(text, character) {
    if (typeof text !== 'string' || !text.startsWith('{\\rtf') || text.length > MAX_RTF) reject('不是受支持的原生富文本');
    if (/\\(?:pict|object|field|footnote|annotation|shp)\b/.test(text)) reject('评论含有链接、附件或其他复杂格式');
    const fontGroup = group(text, 'fonttbl'), colorsGroup = group(text, 'colortbl'), expandedGroup = group(text, 'expandedcolortbl');
    const fonts = {}, charsets = {}, codePage = Number((text.match(/\\ansicpg(\d+)/) || [])[1] || 1252);
    for (const match of fontGroup.matchAll(/\\f(\d+)(?:\\[a-z]+-?\d*\s*)+([^{};\\]+);/g)) {
      fonts[Number(match[1])] = match[2].trim();
      charsets[Number(match[1])] = Number((match[0].match(/\\fcharset(\d+)/) || [])[1] || 0);
    }
    const colorText = colorsGroup.replace(/^\{\\colortbl\s?/, '').slice(0, -1);
    const colors = colorText.split(';').map(entry => {
      if (!entry.trim()) return null;
      const rgb = ['red', 'green', 'blue'].map(name => Number((entry.match(new RegExp('\\\\' + name + '(\\d+)')) || [])[1]));
      if (rgb.some(n => !Number.isFinite(n) || n < 0 || n > 255)) reject('富文本颜色无法读取');
      return hex(rgb);
    });
    if (expandedGroup) {
      const expanded = expandedGroup.replace(/^\{\\\*\\expandedcolortbl\s?/, '').slice(0, -1).split(';');
      expanded.forEach((entry, index) => {
        if (!entry.trim()) return;
        const match = entry.match(/^\s*\\cssrgb\\c(\d+)\\c(\d+)\\c(\d+)\s*$/);
        if (!match) reject('暂不支持该富文本颜色空间');
        const rgb = match.slice(1).map(Number);
        if (rgb.some(n => n > 100000)) reject('富文本颜色数值无效');
        colors[index] = hex(rgb.map(n => n * 255 / 100000));
      });
    }
    let state = { f: Number((text.match(/\\deff(\d+)/) || [])[1] || 0), fs: 24, cf: 0, cb: 0, bad: false, skip: false, body: false, uc: 1 };
    const stack = []; let baseline = null, fallback = 0, count = 0;
    function visible(value, encodedByte) {
      if (state.skip || !state.body) return;
      if (state.bad) reject('评论含有暂不支持保留的字符或段落格式');
      const fontName = fonts[state.f];
      if (!fontName || !Number.isFinite(state.fs) || state.fs <= 0 || state.fs > 2000) reject('富文本字体或字号无法读取');
      if (state.cf < 0 || state.cb < 0 || state.cf >= colors.length || state.cb >= colors.length) reject('富文本颜色索引无效');
      const style = { fontName, fontSize: state.fs / 2, textColor: colors[state.cf] || null, backgroundColor: colors[state.cb] || null };
      if (baseline && JSON.stringify(baseline) !== JSON.stringify(style)) reject('混合格式暂不支持格式刷');
      baseline = style;
      if (character) character(encodedByte && value >= 128 ? `b${codePage}:${charsets[state.f]}:${value};` : `u${value};`);
    }
    for (let i = 0; i < text.length;) {
      if (++count > MAX_RTF) reject('富文本内容过长');
      const char = text[i++];
      if (char === '{') { if (stack.length > 64) reject('富文本结构过深'); stack.push({ ...state }); continue; }
      if (char === '}') { if (!stack.length) reject('富文本结构无效'); state = stack.pop(); continue; }
      if (char !== '\\') { if (char !== '\r' && char !== '\n') { if (fallback) fallback--; else visible(char.charCodeAt(0)); } continue; }
      if (i >= text.length) reject('富文本结构不完整');
      const symbol = text[i];
      if (symbol === '\r' || symbol === '\n') { i++; if (symbol === '\r' && text[i] === '\n') i++; visible(10); continue; }
      if (symbol === '*') { state.skip = true; i++; continue; }
      if (symbol === "'") { if (!/^[\da-f]{2}$/i.test(text.slice(i + 1, i + 3))) reject('富文本编码无效'); const byte = parseInt(text.slice(i + 1, i + 3), 16); i += 3; if (fallback) fallback--; else visible(byte, true); continue; }
      if ('\\{}~_-'.includes(symbol)) { i++; if (fallback) fallback--; else visible(({ '~': 160, '_': 8209, '-': 173 })[symbol] || symbol.charCodeAt(0)); continue; }
      const match = text.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);
      if (!match) reject('富文本控制符无效');
      i += match[0].length; const word = match[1].toLowerCase(), number = match[2] === undefined ? 1 : Number(match[2]);
      if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'footer'].includes(word)) state.skip = true;
      if (state.skip) continue;
      if (word === 'pard') state.body = true;
      else if (['f', 'fs', 'cf', 'cb'].includes(word)) state[word] = number;
      else if (word === 'highlight') state.cb = number;
      else if (word === 'uc') { if (number < 0 || number > 10) reject('富文本编码无效'); state.uc = number; }
      else if (word === 'u') { visible(number & 65535); fallback = state.uc; }
      else if (['par', 'line', 'tab', 'emdash', 'endash', 'bullet', 'lquote', 'rquote', 'ldblquote', 'rdblquote'].includes(word)) visible(({ par: 10, line: 10, tab: 9, emdash: 8212, endash: 8211, bullet: 8226, lquote: 8216, rquote: 8217, ldblquote: 8220, rdblquote: 8221 })[word]);
      else if (['b', 'i', 'ul', 'uldb', 'strike', 'super', 'sub', 'v', 'qc', 'qr', 'qj', 'cbpat', 'expnd', 'expndtw', 'charscalex', 'outl', 'shad', 'caps', 'scaps'].includes(word) && number) state.bad = true;
      else if (/^(?:ul|brdr|chbrdr|clbrdr|trbrdr)/.test(word) && word !== 'ulnone') state.bad = true;
      else if (['li', 'ri', 'fi', 'sb', 'sa', 'sl', 'kerning', 'up', 'dn', 'partightenfactor'].includes(word) && number) state.bad = true;
      else if (['plain', 'bin'].includes(word)) reject('暂不支持该富文本格式');
    }
    if (stack.length) reject('富文本结构不完整');
    if (!baseline) reject('评论没有可读取的统一样式');
    return baseline;
  }
  function bytes(comment) {
    if (!comment || comment.type !== 'HtmlNote' || !comment.rtf) reject('仅支持可原生编辑的 HTML 评论');
    if (typeof MNUtil === 'undefined' || typeof MNUtil.dataToString !== 'function') reject('当前环境无法读取原生富文本');
    const text = MNUtil.dataToString(comment.rtf);
    if (typeof text !== 'string') reject('原生富文本读取失败');
    return text;
  }
  function describe(comment) {
    try { return { supported: true, style: read(bytes(comment)), reason: '' }; }
    catch (error) { return { supported: false, style: null, reason: error.message || String(error) }; }
  }
  function bodyKey(comment) { const tokens = []; read(bytes(comment), token => tokens.push(token)); return tokens.join(''); }
  return { read, describe, bodyKey };
})();
