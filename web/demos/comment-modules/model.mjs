import { randomUUID } from 'node:crypto';
import { buildModules, effectiveSettings, moduleIds } from './engine.mjs';
import { initialState } from './fixtures.mjs';

const modes = new Set(['html', 'markdown', 'nested', 'text']);
const matchModes = new Set(['all', 'exact', 'prefix', 'contains']);
export function validateSettings(settings) {
  if (!settings || typeof settings.includeTitle !== 'boolean' || !Array.isArray(settings.profiles) || settings.profiles.length < 1 || settings.profiles.length > 30) throw new Error('模块配置无效');
  const ids = new Set();
  for (const p of settings.profiles) {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,80}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || !modes.has(p.mode) || !matchModes.has(p.match) || typeof p.value !== 'string' || p.value.length > 200 || !Array.isArray(p.levels) || p.levels.some(n => !Number.isInteger(n) || n < 1 || n > 6) || (p.match !== 'all' && !p.value.trim())) throw new Error('划分方案无效，请检查名称、匹配文字和标题级别');
    ids.add(p.id);
  }
  if (!ids.has(settings.defaultProfileId) || !settings.cardOverrides || typeof settings.cardOverrides !== 'object' || Array.isArray(settings.cardOverrides)) throw new Error('默认方案或卡片覆盖无效');
  for (const [id, override] of Object.entries(settings.cardOverrides)) {
    if (!id || !override || !ids.has(override.profileId) || typeof override.includeTitle !== 'boolean') throw new Error('卡片覆盖无效');
  }
}

export function validateState(state) {
  if (!state || state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 1 || !Array.isArray(state.cards) || !state.cards.length || !Array.isArray(state.history)) throw new Error('演示存储格式无效，原文件已保留');
  validateSettings(state.settings);
  const noteIds = new Set();
  for (const card of state.cards) {
    if (!card || typeof card.id !== 'string' || noteIds.has(card.id) || typeof card.title !== 'string' || !Array.isArray(card.comments)) throw new Error('演示卡片格式无效');
    noteIds.add(card.id);
    const commentIds = new Set();
    for (const c of card.comments) {
      if (!c || typeof c.id !== 'string' || !c.id || commentIds.has(c.id) || typeof c.text !== 'string' || typeof c.type !== 'string' || typeof c.collapsed !== 'boolean') throw new Error('演示评论格式无效');
      commentIds.add(c.id);
    }
  }
  if (state.history.length > 40) throw new Error('演示撤销历史超出范围');
  return state;
}

export function publicState(state) {
  return { schemaVersion: state.schemaVersion, revision: state.revision, cards: state.cards, settings: state.settings, undoLabel: state.history.at(-1)?.label || '' };
}

export function dispatch(state, command, payload = {}) {
  if (['getState', 'getModuleSettings'].includes(command)) return state;
  if (payload.expectedRevision !== state.revision) throw new Error('演示数据已变化，请刷新后重新操作');
  const next = structuredClone(state);
  if (command === 'undo') {
    const old = next.history.pop();
    if (!old) throw new Error('没有可撤销的操作');
    next.cards = old.cards; next.settings = old.settings;
  } else {
    const label = { saveModuleSettings: '模块设置', reorderModule: '模块排序', moveBody: '正文移动', extract: '提取子卡片', setCollapsed: '评论折叠', reset: '重置演示' }[command];
    if (!label) throw new Error('演示不支持该操作');
    next.history.push({ label, cards: structuredClone(state.cards), settings: structuredClone(state.settings) });
    if (next.history.length > 40) next.history.shift();
    if (command === 'reset') {
      const fresh = initialState(); next.cards = fresh.cards; next.settings = fresh.settings;
    } else if (command === 'saveModuleSettings') {
      validateSettings(payload.settings); next.settings = structuredClone(payload.settings);
    } else {
      const card = next.cards.find(n => n.id === payload.noteId);
      if (!card) throw new Error('演示卡片不存在');
      const profile = effectiveSettings(next.settings, card.id).profile;
      const tree = buildModules(card.comments, profile);
      if (command === 'reorderModule') {
        const node = tree.flat.find(n => n.id === payload.moduleId && n.titleId);
        if (!node || !['up', 'down'].includes(payload.direction)) throw new Error('模块或移动方向无效');
        const siblings = tree.flat.filter(n => n.parentId === node.parentId && n.rank === node.rank && n.titleId);
        const at = siblings.indexOf(node);
        const adjacent = siblings[at + (payload.direction === 'up' ? -1 : 1)];
        if (!adjacent) throw new Error('模块已位于同级边界');
        // Keep a block intact; inserting at a sibling boundary keeps ancestry.
        const block = card.comments.splice(node.start, node.end - node.start);
        const target = payload.direction === 'up' ? adjacent.start : adjacent.end - block.length;
        card.comments.splice(target, 0, ...block);
      } else {
        if (!Array.isArray(payload.ids) || !payload.ids.length || new Set(payload.ids).size !== payload.ids.length || payload.ids.some(id => !card.comments.some(c => c.id === id))) throw new Error('评论选区无效，请重新选择');
        const selected = new Set(payload.ids);
        if (command === 'moveBody') {
          if (payload.ids.some(id => tree.titleIds.has(id))) throw new Error('正文移动不能包含结构标题，请使用仅选择正文');
          const target = tree.flat.find(n => n.id === payload.targetModuleId);
          if (!target) throw new Error('目标模块不存在');
          const targetRange = new Set(moduleIds(target, card.comments, tree.titleIds));
          if (payload.ids.some(id => targetRange.has(id))) throw new Error('不能将正文移动到当前所属模块');
          const end = target.end - card.comments.slice(0, target.end).filter(c => selected.has(c.id)).length;
          const block = card.comments.filter(c => selected.has(c.id));
          card.comments = card.comments.filter(c => !selected.has(c.id));
          card.comments.splice(end, 0, ...block);
        } else if (command === 'extract') {
          const title = String(payload.title || '').trim();
          if (!title || title.length > 120 || typeof payload.removeOriginal !== 'boolean') throw new Error('子卡片标题或提取选项无效');
          const id = `child-${randomUUID()}`;
          next.cards.push({ id, parentId: card.id, title, description: '模拟提取生成的子卡片', comments: card.comments.filter(c => selected.has(c.id)).map(c => ({ ...c, id: `${id}-${c.id}` })) });
          next.settings.cardOverrides[id] = { profileId: profile.id, includeTitle: effectiveSettings(next.settings, card.id).includeTitle };
          if (payload.removeOriginal) card.comments = card.comments.filter(c => !selected.has(c.id));
        } else if (command === 'setCollapsed') {
          if (typeof payload.collapsed !== 'boolean') throw new Error('折叠状态无效');
          card.comments.forEach(c => { if (selected.has(c.id)) c.collapsed = payload.collapsed; });
        }
      }
    }
  }
  next.revision = state.revision + 1;
  return validateState(next);
}
