var __MN_COMMENT_FORMAT_BRUSH__ = (function () {
  'use strict';
  const previews = new Map(), undoTickets = new Map(), lifetime = 5 * 60 * 1000;
  function fail(message) { throw new Error(message); }
  function note(id) {
    if (typeof id !== 'string' || !id) fail('卡片标识无效');
    const wrapped = __MN_COMMENT_DATA__.getWrappedNoteById(id);
    if (!wrapped) fail('没有找到这张卡片，请刷新后再试');
    return { wrapped, raw: wrapped.note || wrapped };
  }
  function comments(n) { return Array.from(n.raw.comments || []); }
  function fingerprint(n) {
    return JSON.stringify(comments(n).map(c => Object.keys(c).sort().map(k => [k, k === 'rtf' && c[k] ? String(c[k].base64Encoding()) : c[k]])));
  }
  function fields(c) { return { author: c.author == null ? null : c.author, field: c.field == null ? null : c.field, fieldLabel: c.fieldLabel === true }; }
  function targetState(n, c) {
    const format = __MN_COMMENT_RICH_FORMAT__.describe(c);
    if (!format.supported) return format;
    if (Object.keys(c).some(k => !['type', 'text', 'rtf', 'author', 'field', 'fieldLabel'].includes(k))) return { supported: false, style: format.style, reason: '该评论含有暂不支持保留的标识、折叠状态或其他信息' };
    if (c.field != null && typeof n.raw.setCommentField !== 'function') return { supported: false, style: format.style, reason: '当前宿主无法保留评论的字段信息' };
    return format;
  }
  function put(map, value) {
    for (const [key, item] of map) if (Date.now() - item.at > lifetime) map.delete(key);
    while (map.size >= 8) map.delete(map.keys().next().value);
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    map.set(token, { ...value, at: Date.now() }); return token;
  }
  function take(map, token) {
    const item = typeof token === 'string' && map.get(token);
    if (!item || (map === previews && Date.now() - item.at > lifetime)) fail('格式刷记录已失效，请重新选择源评论');
    return item;
  }
  function preview(noteId, sourceIndex) {
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) fail('源评论位置无效');
    const n = note(noteId), list = comments(n), source = list[sourceIndex];
    const format = __MN_COMMENT_RICH_FORMAT__.describe(source);
    if (!format.supported) fail(format.reason);
    if (typeof n.raw.appendRichTextComment !== 'function' || typeof n.raw.sortCommentsByNewIndices !== 'function' || typeof n.raw.removeCommentByIndex !== 'function') fail('当前宿主不支持原生格式刷');
    const targets = list.flatMap((c, index) => {
      if (index === sourceIndex || c.type !== 'HtmlNote') return [];
      const state = targetState(n, c);
      return [{ index, text: String(c.text || ''), style: state.style, eligible: state.supported, reason: state.reason }];
    });
    const token = put(previews, { noteId, sourceIndex, fingerprint: fingerprint(n), style: format.style, targets });
    return { noteId, source: { index: sourceIndex, text: String(source.text || ''), style: format.style }, targets, token };
  }
  function replace(n, index, style) {
    const before = comments(n), old = before[index], count = before.length;
    const same = (a, b) => fingerprint({ raw: { comments: a } }) === fingerprint({ raw: { comments: b } });
    try {
    const originalBody = __MN_COMMENT_RICH_FORMAT__.bodyKey(old);
    const attrs = Object.fromEntries(Object.entries(style).filter(([, value]) => value !== null));
    n.raw.appendRichTextComment(old.text, attrs);
    let list = comments(n), appended = list[count];
    if (list.length !== count + 1 || !appended || appended.type !== 'HtmlNote' || appended.text !== old.text || !appended.rtf) fail('新富文本未通过保存校验');
    if (__MN_COMMENT_RICH_FORMAT__.bodyKey(appended) !== originalBody) fail('无法确认原生富文本正文在转换后完整保留');
    if (JSON.stringify(fields(appended).author) !== JSON.stringify(fields(old).author)) fail('无法保留原评论的作者信息');
    if (old.field != null) n.raw.setCommentField(count, String(old.field), old.fieldLabel === true);
    const parsed = __MN_COMMENT_RICH_FORMAT__.describe(comments(n)[count]);
    if (!parsed.supported || JSON.stringify(parsed.style) !== JSON.stringify(style)) fail('新评论的实际样式与源评论不一致');
    if (JSON.stringify(fields(comments(n)[count])) !== JSON.stringify(fields(old))) fail('评论字段信息未通过校验');
    if (fingerprint({ raw: { comments: comments(n).slice(0, count) } }) !== fingerprint({ raw: { comments: before } })) fail('其他评论在操作期间发生变化');
    // The host expects old-index -> new-index, rather than a list of old indices in display order.
    n.raw.sortCommentsByNewIndices(Array.from({ length: count + 1 }, (_, i) => i === count ? index : (i >= index ? i + 1 : i)));
    list = comments(n);
    if (list[index].text !== old.text || !list[index].rtf || String(list[index].rtf.base64Encoding()) !== String(appended.rtf.base64Encoding())) fail('富文本评论定位未通过校验');
    n.raw.removeCommentByIndex(index + 1);
    list = comments(n);
    if (list.length !== count || list.some((c, i) => c.text !== before[i].text || c.type !== before[i].type || JSON.stringify(fields(c)) !== JSON.stringify(fields(before[i])))) fail('评论正文、顺序或字段信息未通过最终校验');
    for (let i = 0; i < count; i++) if (i !== index && fingerprint({ raw: { comments: [list[i]] } }) !== fingerprint({ raw: { comments: [before[i]] } })) fail('未选中评论发生变化');
    } catch (error) {
      // Remove only the known appended item. Never pop the host's global undo history.
      let list = comments(n);
      if (list.length === count + 1) {
        if (!same(list.slice(0, count), before) && same(list.filter((_, i) => i !== index), before)) {
          n.raw.sortCommentsByNewIndices(Array.from({ length: count + 1 }, (_, i) => i === index ? count : (i > index ? i - 1 : i)));
          list = comments(n);
        }
        if (same(list.slice(0, count), before)) n.raw.removeCommentByIndex(count);
      }
      throw error;
    }
  }
  function mutate(n, changes, action) {
    const before = comments(n), beforeFingerprint = fingerprint(n), completed = [];
    if (typeof UndoManager === 'undefined' || typeof __MN_UNDO_GROUPING_MNCommentManagerAddon === 'undefined') fail('当前环境无法提供整批撤销');
    try {
      __MN_UNDO_GROUPING_MNCommentManagerAddon.run(action, { note: n.wrapped }, () => changes.forEach(c => {
        const originalStyle = __MN_COMMENT_RICH_FORMAT__.describe(comments(n)[c.index]).style;
        replace(n, c.index, c.style);
        completed.push({ index: c.index, style: originalStyle });
      }));
    } catch (error) {
      if (fingerprint(n) !== beforeFingerprint) {
        try {
          const current = comments(n);
          const completedIndices = new Set(completed.map(c => c.index));
          const compatible = current.length === before.length && current.every((c, i) => {
            const clean = value => Object.keys(value).sort().filter(k => k !== 'rtf').map(k => [k, value[k]]);
            return completedIndices.has(i) ? JSON.stringify(clean(c)) === JSON.stringify(clean(before[i])) : fingerprint({ raw: { comments: [c] } }) === fingerprint({ raw: { comments: [before[i]] } });
          });
          if (!compatible) throw new Error('评论状态不匹配');
          __MN_UNDO_GROUPING_MNCommentManagerAddon.run('恢复未完成的格式刷', { note: n.wrapped }, () => completed.slice().reverse().forEach(c => replace(n, c.index, c.style)));
          for (const c of completed) if (JSON.stringify(__MN_COMMENT_RICH_FORMAT__.describe(comments(n)[c.index]).style) !== JSON.stringify(c.style)) throw new Error('恢复校验失败');
        } catch (_) { fail('格式刷未完成，无法确认自动恢复结果；请停止编辑并从版本点恢复'); }
      }
      throw new Error('格式刷未完成，原评论已保留：' + (error.message || String(error)));
    } finally {
      try { if (typeof n.wrapped.refresh === 'function') n.wrapped.refresh(); } catch (_) {}
      __MN_COMMENT_MUTATIONS__.refreshNotebookAfterCommentMutation(n.wrapped);
    }
  }
  function apply(payload) {
    if (!payload || !Array.isArray(payload.indices) || payload.indices.length < 1 || payload.indices.length > 200 || payload.indices.some(i => !Number.isSafeInteger(i) || i < 0) || new Set(payload.indices).size !== payload.indices.length) fail('请选择有效且不重复的目标评论');
    const plan = take(previews, payload.token);
    if (payload.noteId !== plan.noteId) fail('格式刷目标卡片已变化');
    const n = note(plan.noteId);
    if (fingerprint(n) !== plan.fingerprint) fail('评论内容或顺序已变化，请刷新后重新选择');
    const beforeStyles = [], changes = [];
    for (const index of payload.indices) {
      const target = plan.targets.find(c => c.index === index);
      if (!target || !target.eligible) fail('所选评论不支持无损格式刷');
      const state = targetState(n, comments(n)[index]);
      if (!state.supported) fail(state.reason);
      if (JSON.stringify(state.style) !== JSON.stringify(plan.style)) { beforeStyles.push({ index, style: state.style }); changes.push({ index, style: plan.style }); }
    }
    if (changes.length) mutate(n, changes, 'HTML 评论格式刷');
    previews.delete(payload.token);
    const undoToken = changes.length ? put(undoTickets, { noteId: plan.noteId, expected: fingerprint(n), changes: beforeStyles }) : null;
    return { snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(n.wrapped), changedCount: changes.length, undoToken, statusMessage: changes.length ? `已将格式应用到 ${changes.length} 条评论` : '所选评论已具有相同样式' };
  }
  function undo(payload) {
    const ticket = take(undoTickets, payload && payload.token);
    if (payload.noteId !== ticket.noteId) fail('撤销目标卡片已变化');
    const n = note(ticket.noteId);
    if (fingerprint(n) !== ticket.expected) fail('评论已被继续编辑，不能撤销该格式刷；请使用原生撤销检查操作历史');
    // A compensating group avoids undoing an unrelated native operation on another card.
    mutate(n, ticket.changes, '撤销 HTML 评论格式刷');
    undoTickets.delete(payload.token);
    return { snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(n.wrapped), statusMessage: '已撤销整批格式刷' };
  }
  return { preview, apply, undo };
})();
