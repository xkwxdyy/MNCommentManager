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
    const fonts = {}, charsets = {}, fontCodePages = {}, codePage = Number((text.match(/\\ansicpg(\d+)/) || [])[1] || 1252);
    for (const match of fontGroup.matchAll(/\\f(\d+)(?:\\[a-z]+-?\d*\s*)+([^{};\\]+);/g)) {
      fonts[Number(match[1])] = match[2].trim();
      charsets[Number(match[1])] = Number((match[0].match(/\\fcharset(\d+)/) || [])[1] || 0);
      fontCodePages[Number(match[1])] = Number((match[0].match(/\\cpg(\d+)/) || [])[1] || 0);
    }
    const colorText = colorsGroup.replace(/^\{\\colortbl\s?/, '').slice(0, -1);
    const colors = colorText.split(';').map(entry => {
      if (!entry.trim()) return null;
      const rgb = ['red', 'green', 'blue'].map(name => Number((entry.match(new RegExp('\\\\' + name + '(\\d+)')) || [])[1]));
      if (rgb.some(n => !Number.isFinite(n) || n < 0 || n > 255)) reject('富文本颜色无法读取');
      return hex(rgb);
    });
    const unsupportedColors = new Set();
    if (expandedGroup) {
      const expanded = expandedGroup.replace(/^\{\\\*\\expandedcolortbl\s?/, '').slice(0, -1).split(';');
      expanded.forEach((entry, index) => {
        if (!entry.trim()) return;
        const rgbMatch = entry.match(/^\s*\\cssrgb\\c(\d+)\\c(\d+)\\c(\d+)\s*$/);
        const grayMatch = entry.match(/^\s*\\csgray\\c(\d+)\s*$/);
        if (!rgbMatch && !grayMatch) { unsupportedColors.add(index); return; }
        const rgb = rgbMatch ? rgbMatch.slice(1).map(Number) : Array(3).fill(Number(grayMatch[1]));
        if (rgb.some(n => n > 100000)) { unsupportedColors.add(index); return; }
        colors[index] = hex(rgb.map(n => n * 255 / 100000));
      });
    }
    let state = { f: Number((text.match(/\\deff(\d+)/) || [])[1] || 0), fs: 24, cf: 0, cb: 0, extra: {}, bold: false, italic: false, skip: false, body: false, uc: 1 };
    const stack = [], resolvedFonts = new Map(); let baseline = null, fallback = 0, count = 0;
    function fontWithTraits(fontName) {
      if (!state.bold && !state.italic) return fontName;
      const traits = (state.bold ? 2 : 0) | (state.italic ? 1 : 0);
      const key = JSON.stringify([fontName, state.fs, traits]);
      if (resolvedFonts.has(key)) return resolvedFonts.get(key);
      const namedBold = /(?:^|[-_.]|UIFont)(?:Semi|Demi|Extra|Ultra)?Bold(?:Italic|Oblique)?(?:MT)?$/i.test(fontName);
      const namedItalic = /(?:Italic|Oblique)(?:MT)?$/i.test(fontName);
      let name = fontName;
      if (state.bold && !namedBold && !state.italic && typeof UIFont !== 'undefined' && typeof UIFont.systemFontOfSize === 'function' && typeof UIFont.boldSystemFontOfSize === 'function') {
        const regular = UIFont.systemFontOfSize(state.fs / 2);
        if (regular && regular.fontName === fontName) name = UIFont.boldSystemFontOfSize(state.fs / 2).fontName;
      }
      // Cocoa includes both the concrete face and redundant \b/\i controls.
      // Preserve that face. Never drop a trait that has no writable font name.
      if ((state.bold && !namedBold && name === fontName) || (state.italic && !namedItalic)) {
        reject('该评论的粗体或斜体没有可保存的字体名称，暂不支持修改');
      }
      resolvedFonts.set(key, name);
      return name;
    }
    function visible(value, encodedByte) {
      if (state.skip || !state.body) return;
      if (Object.values(state.extra).some(Boolean)) reject('评论含有暂不支持保留的字符或段落格式');
      const fontName = fonts[state.f];
      if (!fontName || !Number.isFinite(state.fs) || state.fs <= 0 || state.fs > 2000) reject('富文本字体或字号无法读取');
      if (state.cf < 0 || state.cb < 0 || state.cf >= colors.length || state.cb >= colors.length) reject('富文本颜色索引无效');
      if (unsupportedColors.has(state.cf) || unsupportedColors.has(state.cb)) reject('暂不支持该富文本颜色空间');
      const style = { fontName: fontWithTraits(fontName), fontSize: state.fs / 2, textColor: colors[state.cf] || null, backgroundColor: colors[state.cb] || null };
      if (baseline && JSON.stringify(baseline) !== JSON.stringify(style)) reject('混合格式暂不支持格式刷');
      baseline = style;
      if (character) character(encodedByte ? `b${fontCodePages[state.f] || codePage}:${fontCodePages[state.f] ? 1 : charsets[state.f]}:${value};` : `u${value};`);
    }
    for (let i = 0; i < text.length;) {
      if (++count > MAX_RTF) reject('富文本内容过长');
      const char = text[i++];
      if (char === '{') { if (stack.length > 64) reject('富文本结构过深'); stack.push({ ...state, extra: { ...state.extra } }); continue; }
      if (char === '}') { if (!stack.length) reject('富文本结构无效'); state = stack.pop(); continue; }
      if (char !== '\\') { if (char !== '\r' && char !== '\n') { if (fallback) fallback--; else visible(char.charCodeAt(0), char.charCodeAt(0) < 128); } continue; }
      if (i >= text.length) reject('富文本结构不完整');
      const symbol = text[i];
      if (symbol === '\r' || symbol === '\n') { i++; if (symbol === '\r' && text[i] === '\n') i++; visible(10); continue; }
      if (symbol === '*') { state.skip = true; i++; continue; }
      if (symbol === "'") { if (!/^[\da-f]{2}$/i.test(text.slice(i + 1, i + 3))) reject('富文本编码无效'); const byte = parseInt(text.slice(i + 1, i + 3), 16); i += 3; if (fallback) fallback--; else visible(byte, true); continue; }
      if ('\\{}~_-'.includes(symbol)) { i++; if (fallback) fallback--; else visible(({ '~': 160, '_': 8209, '-': 173 })[symbol] || symbol.charCodeAt(0), '\\{}'.includes(symbol)); continue; }
      const match = text.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);
      if (!match) reject('富文本控制符无效');
      i += match[0].length; const word = match[1].toLowerCase(), number = match[2] === undefined ? 1 : Number(match[2]);
      if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'footer'].includes(word)) state.skip = true;
      if (state.skip) continue;
      if (word === 'pard') {
        state.body = true;
        for (const key of ['alignment', 'li', 'ri', 'fi', 'sb', 'sa', 'sl', 'partightenfactor', 'cbpat']) delete state.extra[key];
      }
      else if (['f', 'fs', 'cf', 'cb'].includes(word)) state[word] = number;
      else if (word === 'highlight') state.cb = number;
      else if (word === 'uc') { if (number < 0 || number > 10) reject('富文本编码无效'); state.uc = number; }
      else if (word === 'u') { visible(number & 65535); fallback = state.uc; }
      else if (['par', 'line', 'tab', 'emdash', 'endash', 'bullet', 'lquote', 'rquote', 'ldblquote', 'rdblquote'].includes(word)) visible(({ par: 10, line: 10, tab: 9, emdash: 8212, endash: 8211, bullet: 8226, lquote: 8216, rquote: 8217, ldblquote: 8220, rdblquote: 8221 })[word]);
      else if (word === 'b') state.bold = number !== 0;
      else if (word === 'i') state.italic = number !== 0;
      else if (word === 'ulnone' || /^ul/.test(word)) state.extra.underline = word !== 'ulnone' && number !== 0;
      else if (word === 'charscalex') state.extra.charscalex = number !== 100;
      else if (['ql', 'qc', 'qr', 'qj'].includes(word)) state.extra.alignment = word !== 'ql';
      else if (word === 'nosupersub') state.extra.script = false;
      else if (word === 'super' || word === 'sub') state.extra.script = number !== 0;
      else if (['strike', 'v', 'cbpat', 'expnd', 'expndtw', 'outl', 'shad', 'caps', 'scaps', 'li', 'ri', 'fi', 'sb', 'sa', 'sl', 'kerning', 'up', 'dn', 'partightenfactor'].includes(word)) state.extra[word] = number !== 0;
      else if (/^(?:brdr|chbrdr|clbrdr|trbrdr)/.test(word)) state.extra.border = true;
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
  // NSString encoding values were checked with CoreFoundation's Windows-codepage conversion.
  const codePageEncodings = { 1252: 12, 936: 2147484705, 950: 2147484707, 932: 8, 949: 2147484706, 1361: 2147484944, 1253: 13, 1254: 14, 1258: 2147484936, 1255: 2147484933, 1256: 2147484934, 1257: 2147484935, 1251: 11, 874: 2147484701, 1250: 15, 437: 2147484672, 65001: 4 };
  const charsetCodePages = { 0: 1252, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250, 254: 437 };
  function base64Bytes(values) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let result = '';
    for (let i = 0; i < values.length; i += 3) {
      const a = values[i], b = values[i + 1], c = values[i + 2];
      result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : alphabet[c & 63]);
    }
    return result;
  }
  function bodyKey(comment) {
    const tokens = []; let pending = [], encoding = null;
    const unicode = text => { for (let i = 0; i < text.length; i++) tokens.push('u' + text.charCodeAt(i) + ';'); };
    function flush() {
      if (!pending.length) return;
      if (pending.every(n => n < 128) && typeof encoding === 'number') unicode(pending.map(n => String.fromCharCode(n)).join(''));
      else if (typeof encoding === 'number' && typeof NSString !== 'undefined' && typeof NSString.stringWithContentsOfURLEncoding === 'function' && typeof NSData !== 'undefined' && typeof NSData.dataWithStringEncoding === 'function' && typeof MNUtil.genNSURL === 'function') {
        const encoded = base64Bytes(pending);
        const decoded = NSString.stringWithContentsOfURLEncoding(MNUtil.genNSURL('data:application/octet-stream;base64,' + encoded), encoding);
        if (typeof decoded !== 'string' || String(NSData.dataWithStringEncoding(decoded, encoding).base64Encoding()) !== encoded) reject('富文本正文编码无法完整校验，原评论已保留');
        unicode(decoded);
      } else tokens.push('bytes' + encoding + ':' + pending.join(',') + ';');
      pending = [];
    }
    read(bytes(comment), token => {
      const byte = /^b(\d+):(\d+):(\d+);$/.exec(token);
      if (!byte) { flush(); tokens.push(token); return; }
      const charset = Number(byte[2]), codePage = charset === 1 ? Number(byte[1]) : charsetCodePages[charset];
      const next = charset === 77 ? 30 : codePageEncodings[codePage] || ('unknown-' + byte[1] + '-' + charset);
      if (next !== encoding) flush();
      encoding = next;
      pending.push(Number(byte[3]));
    });
    flush();
    return tokens.join('');
  }
  return { read, describe, bodyKey };
})();
