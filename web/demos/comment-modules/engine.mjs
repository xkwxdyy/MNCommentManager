// Pure demo rules: comments are indivisible, IDs are stable across mutations.
export const PRESETS = [
  { id: 'html', name: 'HTML 字段', mode: 'html', match: 'all', value: '', levels: [1, 2, 3, 4, 5, 6] },
  { id: 'markdown', name: 'Markdown 章节', mode: 'markdown', match: 'all', value: '', levels: [1, 2, 3, 4, 5, 6] },
  { id: 'nested', name: 'HTML＋Markdown', mode: 'nested', match: 'all', value: '', levels: [1, 2, 3, 4, 5, 6] },
  { id: 'text', name: '指定文本', mode: 'text', match: 'prefix', value: '模块：', levels: [1, 2, 3, 4, 5, 6] },
];

export function plainText(value = '') {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, s => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[s])).trim();
}

export function effectiveSettings(settings, noteId) {
  const override = settings.cardOverrides[noteId];
  return {
    profile: settings.profiles.find(p => p.id === (override?.profileId || settings.defaultProfileId)) || settings.profiles[0],
    includeTitle: override?.includeTitle ?? settings.includeTitle,
    overridden: !!override,
  };
}

export function matches(text, profile) {
  if (profile.match === 'all') return true;
  const value = profile.value.trim();
  if (!value) return false;
  if (profile.match === 'exact') return text === value;
  if (profile.match === 'prefix') return text.startsWith(value);
  return text.includes(value);
}

function heading(comment, profile) {
  if (comment.type !== 'markdownComment') return null;
  const firstLine = comment.text.trim().split(/\r?\n/)[0];
  const markdown = firstLine.match(/^(#{1,6})\s+(.+?)\s*#*$/);
  if (markdown && profile.levels.includes(markdown[1].length)) return { rank: markdown[1].length, title: markdown[2] };
  const htmlmd = firstLine.replace(/^-\s+/, '').match(/^<span\b[^>]*\bid=["'](method|level[1-5])["'][^>]*>([\s\S]*?)<\/span>/i);
  if (!htmlmd) return null;
  const rank = htmlmd[1].toLowerCase() === 'method' ? 0 : Number(htmlmd[1].slice(5));
  return (rank === 0 || profile.levels.includes(rank)) ? { rank, title: plainText(htmlmd[2]) || htmlmd[1] } : null;
}

export function buildModules(comments, profile) {
  const roots = [], flat = [], stack = [];
  const titleIds = new Set();
  let loose = null;
  const endAt = position => { while (stack.length) stack.pop().end = position; };
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    let marker = null;
    if (['html', 'nested'].includes(profile.mode) && comment.type === 'HtmlComment' && matches(plainText(comment.text), profile)) {
      marker = { rank: -1, title: plainText(comment.text) || '空标题' };
    } else if (profile.mode === 'text' && ['textComment', 'markdownComment'].includes(comment.type) && matches(plainText(comment.text), profile)) {
      const text = plainText(comment.text);
      marker = { rank: -1, title: (profile.match === 'prefix' ? text.slice(profile.value.trim().length).trim() : text) || '未命名模块' };
    } else if (['markdown', 'nested'].includes(profile.mode)) marker = heading(comment, profile);
    if (marker) {
      while (stack.length && stack.at(-1).rank >= marker.rank) stack.pop().end = i;
      if (loose) { loose.end = i; loose = null; }
      const parent = stack.at(-1) || null;
      const node = { id: `module-${comment.id}`, titleId: comment.id, title: marker.title, rank: marker.rank, start: i, end: comments.length, parentId: parent?.id || null, children: [], items: [], depth: parent ? parent.depth + 1 : 0 };
      (parent ? parent.children : roots).push(node);
      flat.push(node); stack.push(node); titleIds.add(comment.id);
    } else {
      let node = stack.at(-1);
      if (!node) {
        if (!loose) {
          loose = { id: 'module-ungrouped', titleId: null, title: '未分组', rank: -2, start: i, end: comments.length, parentId: null, children: [], items: [], depth: 0 };
          roots.push(loose); flat.push(loose);
        }
        node = loose;
      }
      node.items.push(comment);
    }
  }
  endAt(comments.length);
  return { roots, flat, titleIds };
}

export function moduleIds(node, comments, titleIds, includeTitle = true) {
  return comments.slice(node.start, node.end).filter(c => includeTitle || !titleIds.has(c.id)).map(c => c.id);
}

export function filterComments(comments, filter, query) {
  const q = query.trim().toLocaleLowerCase();
  return comments.filter(c => (filter === 'all' || c.type === filter || (filter === 'text' && ['textComment', 'markdownComment'].includes(c.type))) &&
    (!q || `${plainText(c.text)} ${c.type}`.toLocaleLowerCase().includes(q)));
}

export function selectionState(ids, selected) {
  const count = ids.filter(id => selected.has(id)).length;
  return { checked: ids.length > 0 && count === ids.length, partial: count > 0 && count < ids.length, count };
}

export function toggleIds(selected, ids) {
  const next = new Set(selected);
  const remove = ids.length > 0 && ids.every(id => next.has(id));
  for (const id of ids) remove ? next.delete(id) : next.add(id);
  return next;
}
