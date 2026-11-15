import { marked } from 'marked';
import { defaultSettings } from '../../src/lib/commentModules.mjs';
const clone = (value) => JSON.parse(JSON.stringify(value));
export const DEFAULT_STYLE = {
  fontName: 'PingFangSC-Regular',
  fontSize: 16,
  textColor: '#175D62',
  backgroundColor: '#E3F2FD',
};
const math = (text) => /\$\$|\$[^$\n]+\$|\\\(|\\\[|\\begin\{/.test(text);
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
      if (!(name in names)) throw Error('包含暂不支持的字符实体');
      return names[name];
    }
    const n = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff))
      throw Error('字符实体无效');
    return String.fromCodePoint(n);
  });
}
export function markdownToText(source) {
  try {
    function inline(tokens) {
      const mathSource = (rows) =>
        (rows || [])
          .map((t) =>
            t.type === 'codespan' ? '' : t.tokens ? mathSource(t.tokens) : t.raw || t.text || '',
          )
          .join('');
      if (math(mathSource(tokens))) throw Error('包含公式，暂不转换');
      return (tokens || [])
        .map((t) => {
          if (['strong', 'em', 'del'].includes(t.type)) return inline(t.tokens);
          if (t.type === 'codespan' || t.type === 'escape') return decode(t.text);
          if (t.type === 'br') return '\n';
          if (t.type === 'text') {
            if (math(t.text)) throw Error('包含公式，暂不转换');
            return t.tokens ? inline(t.tokens) : decode(t.text);
          }
          if (t.type === 'image') throw Error('包含图片，暂不转换');
          if (t.type === 'link') throw Error('包含链接，暂不转换，以保留链接信息');
          throw Error('包含 HTML 或复杂行内结构，暂不转换');
        })
        .join('');
    }
    function blocks(tokens, nested = false) {
      return tokens
        .filter((t) => t.type !== 'space')
        .map((t) => {
          if (['paragraph', 'heading', 'text'].includes(t.type))
            return t.tokens ? inline(t.tokens) : decode(t.text);
          if (t.type === 'code') return t.text;
          if (t.type === 'list') {
            if (nested || t.items.some((item) => item.task))
              throw Error('包含嵌套或任务列表，暂不转换');
            return t.items
              .map(
                (item, i) =>
                  `${t.ordered ? Number(t.start || 1) + i + '.' : '•'} ${blocks(item.tokens, true)}`,
              )
              .join('\n');
          }
          if (t.type === 'table') throw Error('包含表格，暂不转换');
          throw Error('包含引用、HTML 或其他复杂结构，暂不转换');
        })
        .join('\n\n');
    }
    const text = blocks(marked.lexer(String(source)));
    if (!text.trim()) throw Error('没有可转换的显示文字');
    return { supported: true, text, reason: '' };
  } catch (e) {
    return { supported: false, text: '', reason: e.message };
  }
}
const rich = (key, text, style = DEFAULT_STYLE, extra = {}) => ({
  key,
  kind: 'html',
  text,
  style: clone(style),
  ...extra,
});
const md = (key, text) => ({ key, kind: 'markdown', text });
export const FIXTURES = [
  {
    id: 'demo-proof',
    title: '命题 · 有界算子',
    tab: '命题卡',
    comments: [
      rich('proof', '证明', DEFAULT_STYLE, { field: '证明', fieldLabel: true }),
      {
        key: 'body',
        kind: 'text',
        text: '设 xₙ → x，且 Txₙ → y。由 T 的连续性，Txₙ → Tx，因此 y = Tx。',
      },
      rich('thought', '相关思考', {
        ...DEFAULT_STYLE,
        fontSize: 18,
        textColor: '#9A3412',
        backgroundColor: '#FFF0DC',
      }),
      md('simple-md', '**有界性**提供了连续性。\n\n保留显示文字，并移除 Markdown 标记。'),
      rich('mixed', '包含不同字重的原生评论', DEFAULT_STYLE, { mixed: true }),
      md('math', '含公式的评论：$\\|Tx\\| \\le C\\|x\\|$'),
    ],
  },
  {
    id: 'demo-definition',
    title: '定义 · 紧算子',
    tab: '定义卡',
    comments: [
      md('definition', '## 定义\n\n算子 **T** 将有界集映为相对紧集。'),
      {
        key: 'plain',
        kind: 'text',
        text: '普通文字也可以粘贴格式，并转换为可原生编辑的 HTML 评论。',
      },
      rich('application', '应用', {
        ...DEFAULT_STYLE,
        fontSize: 15,
        fontName: 'PingFangSC-Semibold',
        textColor: '#166534',
        backgroundColor: '#E7F5EC',
      }),
      md(
        'image',
        '图片评论需要保留原图。\n\n![图片示例](data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%2264%22%20viewBox%3D%220%200%20180%2064%22%3E%3Crect%20width%3D%22180%22%20height%3D%2264%22%20rx%3D%226%22%20fill%3D%22%23e3f2fd%22%2F%3E%3Crect%20x%3D%2216%22%20y%3D%2216%22%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%224%22%20fill%3D%22%23bdd9f3%22%2F%3E%3Cpath%20d%3D%22M60%2024h100M60%2036h80%22%20stroke%3D%22%23315d92%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E)',
      ),
      md('table', '| 条件 | 结论 |\n| --- | --- |\n| 有界 | 连续 |'),
      md('link', '[参考资料](#reference)'),
      rich('protected', '带有受保护元数据的评论', DEFAULT_STYLE, { locked: true }),
    ],
  },
  { id: 'demo-empty', title: '原生富文本 · 空白卡片', tab: '空白卡片', comments: [] },
];
export function targetState(c) {
  if (!c) return { supported: false, reason: '评论不存在' };
  if (c.mixed) return { supported: false, reason: '混合格式先保留原样，暂不覆盖' };
  if (c.locked) return { supported: false, reason: '含有暂无法完整保留的元数据' };
  if (c.kind === 'markdown') return markdownToText(c.text);
  if (['html', 'text'].includes(c.kind)) return { supported: true, text: c.text, reason: '' };
  return { supported: false, reason: '图片、音频等媒体评论不转换' };
}
export function validateStyle(style) {
  if (
    !style ||
    !['PingFangSC-Regular', 'PingFangSC-Semibold'].includes(style.fontName) ||
    !Number.isFinite(Number(style.fontSize)) ||
    style.fontSize < 8 ||
    style.fontSize > 96
  )
    throw Error('字号应为 8 至 96');
  for (const name of ['textColor', 'backgroundColor'])
    if (style[name] !== null && !/^#[\da-f]{6}$/i.test(style[name] || ''))
      throw Error('颜色应为 #RRGGBB 格式');
  return {
    fontName: style.fontName,
    fontSize: Number(style.fontSize),
    textColor: style.textColor?.toUpperCase() || null,
    backgroundColor: style.backgroundColor?.toUpperCase() || null,
  };
}
export function createStore(fixtures = FIXTURES) {
  let cards = clone(fixtures),
    currentId = cards[0].id,
    clipboard = null,
    serial = 0,
    epoch = 0;
  const histories = new Map(),
    revisions = new Map(cards.map((c) => [c.id, 0])),
    listeners = new Set();
  const current = () => cards.find((c) => c.id === currentId);
  const emit = (changed = false) => listeners.forEach((fn) => fn({ changed }));
  function mutate(label, fn) {
    const before = clone(current().comments);
    fn(current().comments);
    if (JSON.stringify(before) === JSON.stringify(current().comments)) return false;
    const history = histories.get(currentId) || [];
    history.push({ label, comments: before });
    histories.set(currentId, history);
    revisions.set(currentId, revisions.get(currentId) + 1);
    emit(true);
    return true;
  }
  function guard(plan) {
    if (
      !plan ||
      plan.cardId !== currentId ||
      plan.epoch !== epoch ||
      plan.revision !== revisions.get(currentId)
    )
      throw Error('卡片或评论已变化，请重新打开预览');
  }
  function readSource(index) {
    const c = current().comments[index];
    if (!c || c.kind !== 'html' || c.mixed) throw Error('仅支持具有统一样式的原生 HTML 评论');
    return {
      style: clone(c.style),
      sourceCard: current().title,
      sourceKey: c.key,
      sourceText: c.text,
      sourceIndex: index,
    };
  }
  function makePlan(source, mode, sourceIndex = null) {
    return {
      cardId: currentId,
      epoch,
      revision: revisions.get(currentId),
      mode,
      source: clone(source),
      targets: current()
        .comments.map((c, index) => {
          const state = targetState(c);
          return {
            index,
            key: c.key,
            kind: c.kind,
            text: c.text,
            style: clone(c.style || null),
            afterText: state.text || '',
            eligible: state.supported,
            reason: state.reason,
            converted: c.kind !== 'html',
          };
        })
        .filter((c) => mode !== 'brush' || (c.kind === 'html' && c.index !== sourceIndex)),
    };
  }
  function applyPlan(plan, indices, mode) {
    guard(plan);
    if (plan.mode !== mode) throw Error('操作类型已变化，请重新打开预览');
    if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length)
      throw Error('请选择目标评论');
    const rows = indices.map((i) => plan.targets.find((c) => c.index === i));
    if (rows.some((c) => !c?.eligible)) throw Error('目标含有不支持转换的内容');
    if (rows.some((c) => current().comments[c.index]?.key !== c.key)) throw Error('评论位置已变化');
    const style = validateStyle(plan.source.style);
    return mutate(mode === 'brush' ? '撤销格式刷' : '撤销粘贴格式', (comments) =>
      rows.forEach((c) => {
        comments[c.index] = {
          ...comments[c.index],
          kind: 'html',
          text: c.afterText,
          style: clone(style),
        };
      }),
    );
  }
  function draft(index = null) {
    const c = index === null ? null : current().comments[index];
    if (index !== null && (!c || c.kind !== 'html' || !targetState(c).supported))
      throw Error('该评论暂不支持富文本编辑');
    return {
      cardId: currentId,
      epoch,
      revision: revisions.get(currentId),
      index,
      key: c?.key || null,
      text: c?.text || '',
      style: clone(c?.style || clipboard?.style || DEFAULT_STYLE),
    };
  }
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get cards() {
      return clone(cards);
    },
    get card() {
      return clone(current());
    },
    get clipboard() {
      return clone(clipboard);
    },
    get undoLabel() {
      return histories.get(currentId)?.slice(-1)[0]?.label || '';
    },
    snapshot() {
      return {
        noteId: currentId,
        noteTitle: current().title,
        moduleSettings: defaultSettings(),
        excerpt: { present: false },
        commentFold: { supported: false },
        comments: current().comments.map((c, index) => ({
          index,
          key: c.key,
          text: c.text,
          htmlText: c.kind === 'html' ? c.text : '',
          type:
            { html: 'HtmlComment', markdown: 'markdownComment', text: 'textComment' }[c.kind] ||
            'imageComment',
          originalType: c.kind === 'html' ? 'HtmlNote' : 'TextNote',
          richFormat:
            c.kind === 'html'
              ? {
                  supported: !c.mixed,
                  style: clone(c.style),
                  reason: c.mixed ? '混合格式暂不支持格式刷' : '',
                }
              : null,
          capabilities: {
            isHtml: c.kind === 'html',
            isMarkdown: c.kind === 'markdown',
            canCopyText: true,
            canMove: true,
            canDelete: true,
            canEditText: ['text', 'markdown'].includes(c.kind),
          },
        })),
      };
    },
    switchCard(id) {
      if (!cards.some((c) => c.id === id)) throw Error('卡片不存在');
      currentId = id;
      emit(true);
    },
    copy(index) {
      clipboard = { ...readSource(index), serial: ++serial };
      emit();
      return this.clipboard;
    },
    clearClipboard() {
      clipboard = null;
      emit();
    },
    pastePlan() {
      if (!clipboard) throw Error('请先复制格式');
      return makePlan(clipboard, 'paste');
    },
    brushPlan(index) {
      return makePlan(readSource(index), 'brush', index);
    },
    paste(plan, indices) {
      return applyPlan(plan, indices, 'paste');
    },
    brush(plan, indices) {
      return applyPlan(plan, indices, 'brush');
    },
    draft,
    save(plan, text, style) {
      guard(plan);
      if (typeof text !== 'string' || !text.trim()) throw Error('请填写评论正文');
      if (text.length > 50000) throw Error('评论正文过长');
      const valid = validateStyle(style);
      return mutate(plan.index === null ? '撤销新增富文本' : '撤销富文本编辑', (comments) => {
        if (plan.index === null) comments.push(rich('new-' + ++serial, text, valid));
        else {
          const c = comments[plan.index];
          if (c?.key !== plan.key || !targetState(c).supported) throw Error('评论已变化');
          comments[plan.index] = { ...c, text, style: valid };
        }
      });
    },
    undo() {
      const history = histories.get(currentId) || [],
        item = history.pop();
      if (!item) return false;
      current().comments = clone(item.comments);
      revisions.set(currentId, revisions.get(currentId) + 1);
      emit(true);
      return true;
    },
    editText(index, text) {
      const c = current().comments[index];
      if (!c || !['text', 'markdown'].includes(c.kind)) throw Error('该评论请使用富文本编辑入口');
      if (typeof text !== 'string' || !text.trim()) throw Error('请填写评论正文');
      return mutate('撤销正文编辑', (comments) => {
        comments[index] = { ...c, text };
      });
    },
    remove(indices) {
      return mutate('撤销删除评论', (comments) => {
        const kept = comments.filter((_, i) => !indices.includes(i));
        comments.splice(0, comments.length, ...kept);
      });
    },
    move(indices, boundary) {
      return mutate('撤销移动评论', (comments) => {
        const selected = comments.filter((_, i) => indices.includes(i)),
          rest = comments.filter((_, i) => !indices.includes(i));
        const to = Math.max(
          0,
          Math.min(rest.length, boundary - indices.filter((i) => i < boundary).length),
        );
        rest.splice(to, 0, ...selected);
        comments.splice(0, comments.length, ...rest);
      });
    },
    reset() {
      cards = clone(fixtures);
      currentId = cards[0].id;
      clipboard = null;
      histories.clear();
      revisions.clear();
      cards.forEach((c) => revisions.set(c.id, 0));
      epoch++;
      emit(true);
    },
  };
}
