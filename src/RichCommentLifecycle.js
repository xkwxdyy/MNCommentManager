var __MN_RICH_COMMENTS_MNCommentManagerAddon__ = (function () {
  'use strict';
  const plans = new Map(),
    histories = new Map();
  const STYLE_PREF_KEY = 'mncommentmanager.richComment.lastStyle';
  const neutralDefaults = {
    fontName: 'PingFangSC-Regular',
    fontSize: 16,
    textColor: null,
    backgroundColor: null,
  };
  let clipboard = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => {
    throw new Error(message);
  };
  function foldHost(noteOrRaw) {
    if (
      typeof __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon === 'undefined' ||
      !__MN_COMMENT_FOLD_STATE_MNCommentManagerAddon ||
      typeof __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon.read !== 'function'
    ) {
      return { supported: false, revision: '', comments: [] };
    }
    return __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon.read(noteOrRaw);
  }
  function validFoldDisplay(v) {
    return (
      !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).every((k) => k === 'v' || k === 'collapsed') &&
      typeof v.collapsed === 'boolean'
    );
  }
  function note(id) {
    if (typeof id !== 'string' || !id) fail('没有读取到当前卡片，请重新打开评论管理器');
    const wrapped = __MN_COMMENT_DATA__.getWrappedNoteById(id);
    if (!wrapped) fail('没有找到这张卡片，请刷新后再试');
    return { wrapped, raw: wrapped.note || wrapped, id };
  }
  const rows = (n) => Array.from(n.raw.comments || []);
  const stable = (c) =>
    JSON.stringify(
      Object.keys(c)
        .sort()
        .map((k) => [k, k === 'rtf' && c[k] ? String(c[k].base64Encoding()) : c[k]]),
    );
  const fingerprint = (n) => JSON.stringify(rows(n).map(stable));
  const metadata = (c) => ({
    author: c.author == null ? '' : String(c.author),
    field: c.field == null ? null : String(c.field),
    fieldLabel: c.fieldLabel === true,
  });
  function style(value) {
    if (
      !value ||
      typeof value.fontName !== 'string' ||
      !value.fontName.trim() ||
      value.fontName.length > 128 ||
      /[\x00-\x1f]/.test(value.fontName)
    )
      fail('请选择有效字体');
    if (
      typeof value.fontSize !== 'number' ||
      !Number.isFinite(value.fontSize) ||
      value.fontSize < 8 ||
      value.fontSize > 96
    )
      fail('字号应为 8 至 96');
    const result = { fontName: value.fontName, fontSize: value.fontSize };
    for (const name of ['textColor', 'backgroundColor']) {
      if (value[name] !== null && !/^#[\da-f]{6}$/i.test(value[name] || ''))
        fail('颜色应为 #RRGGBB 格式，例如 #E3F2FD');
      result[name] = value[name] === null ? null : value[name].toUpperCase();
    }
    return result;
  }
  function readPreferredStyle() {
    try {
      if (
        typeof NSUserDefaults === 'undefined' ||
        !NSUserDefaults ||
        typeof NSUserDefaults.standardUserDefaults !== 'function'
      ) {
        return clone(neutralDefaults);
      }
      const saved = NSUserDefaults.standardUserDefaults().objectForKey(STYLE_PREF_KEY);
      if (typeof saved !== 'string' || !saved.trim()) return clone(neutralDefaults);
      return style(JSON.parse(saved));
    } catch (_) {
      return clone(neutralDefaults);
    }
  }
  function writePreferredStyle(nextStyle) {
    try {
      if (
        typeof NSUserDefaults === 'undefined' ||
        !NSUserDefaults ||
        typeof NSUserDefaults.standardUserDefaults !== 'function'
      )
        return;
      const valid = style(nextStyle);
      NSUserDefaults.standardUserDefaults().setObjectForKey(JSON.stringify(valid), STYLE_PREF_KEY);
    } catch (_) {}
  }
  function requireHost(n) {
    for (const name of [
      'appendRichTextComment',
      'sortCommentsByNewIndices',
      'removeCommentByIndex',
    ])
      if (typeof n.raw[name] !== 'function') fail('当前 MarginNote 版本不支持原生富文本评论编辑');
    if (
      typeof Database === 'undefined' ||
      typeof Database.sharedInstance !== 'function' ||
      typeof Database.sharedInstance().savedb !== 'function'
    )
      fail('当前环境无法确认评论已保存');
    if (
      typeof UndoManager === 'undefined' ||
      typeof __MN_UNDO_GROUPING_MNCommentManagerAddon === 'undefined'
    )
      fail('当前环境无法提供整批撤销');
  }
  function access(noteOrRaw, c, commentIndex) {
    const raw = noteOrRaw && noteOrRaw.note ? noteOrRaw.note : noteOrRaw;
    try {
      if (!c || !['HtmlNote', 'TextNote'].includes(c.type))
        fail('图片、音频和链接评论暂不支持此操作');
      const rich = c.type === 'HtmlNote' ? __MN_COMMENT_RICH_FORMAT__.describe(c) : null;
      if (rich && !rich.supported) fail(rich.reason);
      if ((c.type === 'HtmlNote' && c.markdown === true) || (c.type === 'TextNote' && c.rtf))
        fail('该评论包含额外的格式信息，暂不支持修改');
      if (c.field != null && typeof c.field !== 'string') fail('该评论的字段信息暂不支持修改');
      const allowed = ['type', 'text', 'rtf', 'author', 'field', 'fieldLabel', 'markdown'];
      // Cocoa's native editor also writes a derived HTML preview beside RTF.
      // RTF remains authoritative; appending rich text regenerates that preview.
      if (c.type === 'HtmlNote' && c.rtf) allowed.push('html', 'htmlSize');
      const extraKeys = Object.keys(c).filter((k) => !allowed.includes(k));
      if (extraKeys.length > 0) {
        const foldOnly = extraKeys.every((k) => k === 'mnCommentId' || k === 'mnCommentDisplay');
        if (
          !foldOnly ||
          ('mnCommentId' in c && typeof c.mnCommentId !== 'string') ||
          ('mnCommentDisplay' in c && !validFoldDisplay(c.mnCommentDisplay))
        ) {
          fail('该评论包含折叠设置或其他附加信息，暂不支持修改');
        }
        const fold = foldHost(noteOrRaw);
        if (!fold.supported) {
          fail('该评论包含折叠设置或其他附加信息，暂不支持修改');
        }
        const list = Array.from((raw && raw.comments) || []);
        const idx = Number.isSafeInteger(commentIndex) ? commentIndex : list.indexOf(c);
        const foldItem = idx >= 0 ? fold.comments[idx] : null;
        const ownerNoteId = String(
          (noteOrRaw && noteOrRaw.noteId) || (raw && raw.noteId) || '',
        );
        if (
          !foldItem ||
          (foldItem.ownerNoteId && ownerNoteId && foldItem.ownerNoteId !== ownerNoteId)
        ) {
          fail('跨卡片引用的折叠评论暂不支持直接修改');
        }
      }
      if (metadata(c).author) fail('该评论包含作者信息，当前版本无法在修改时完整保留');
      if (c.field != null && typeof raw.setCommentField !== 'function')
        fail('当前版本无法保留该评论的字段信息');
      if (typeof c.text !== 'string' || !c.text.trim()) fail('评论没有可编辑的正文');
      if (c.text.length > 50000) fail('评论内容过长，暂不支持此操作');
      if (c.type === 'TextNote') {
        const restore = c.markdown === true ? 'appendMarkdownComment' : 'appendTextComment';
        if (typeof raw[restore] !== 'function') fail('当前版本无法在撤销时恢复原评论类型');
      }
      let text = c.text;
      if (c.type === 'TextNote' && c.markdown === true) {
        const converted = __MN_COMMENT_MARKDOWN_MNCommentManagerAddon__.markdownToText(c.text);
        if (!converted.supported) fail(converted.reason);
        text = converted.text;
      }
      return { supported: true, reason: '', text, style: rich ? rich.style : null };
    } catch (error) {
      return { supported: false, reason: error.message || String(error), style: null };
    }
  }
  function collapsedOf(n, c, index) {
    if (c && validFoldDisplay(c.mnCommentDisplay)) return c.mnCommentDisplay.collapsed === true;
    const fold = n ? foldHost(n.wrapped) : { supported: false };
    return !!(
      fold.supported &&
      Number.isSafeInteger(index) &&
      fold.comments[index] &&
      fold.comments[index].collapsed === true
    );
  }
  function descriptor(c, n, index) {
    return {
      type: c.type,
      text: c.text,
      markdown: c.markdown === true,
      ...metadata(c),
      collapsed: collapsedOf(n, c, index),
      style: c.type === 'HtmlNote' ? __MN_COMMENT_RICH_FORMAT__.describe(c).style : null,
      body: c.type === 'HtmlNote' ? __MN_COMMENT_RICH_FORMAT__.bodyKey(c) : null,
    };
  }
  function semantic(n) {
    return JSON.stringify(
      rows(n).map((c, idx) =>
        access(n.wrapped, c, idx).supported ? JSON.stringify(descriptor(c, n, idx)) : stable(c),
      ),
    );
  }
  function put(plan) {
    for (const [key, p] of plans)
      if (p.kind !== 'edit' && Date.now() - p.at > 300000) plans.delete(key);
    while (plans.size >= 24) plans.delete(plans.keys().next().value);
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    plans.set(token, { ...plan, at: Date.now() });
    return token;
  }
  function take(payload, kind) {
    const p = payload && plans.get(payload.token);
    if (!p || (p.kind !== 'edit' && Date.now() - p.at > 300000))
      fail('预览已失效，请关闭后重新打开');
    if (p.kind !== kind || p.noteId !== payload.noteId) fail('操作对象已变化，请重新打开预览');
    const n = note(p.noteId);
    requireHost(n);
    if (fingerprint(n) !== p.fingerprint)
      fail('评论内容或顺序已变化，当前输入尚未保存；请重新打开评论后再操作');
    return { p, n };
  }
  function source(n, index) {
    if (!Number.isSafeInteger(index) || index < 0) fail('源评论位置无效');
    const c = rows(n)[index],
      format = __MN_COMMENT_RICH_FORMAT__.describe(c);
    if (!format.supported) fail(format.reason);
    return {
      index,
      text: String(c.text || ''),
      style: clone(format.style),
      noteId: n.id,
      noteTitle: String(n.wrapped.noteTitle || n.raw.noteTitle || '未命名卡片'),
    };
  }
  function copyFormat(payload) {
    const n = note(payload.noteId),
      value = source(n, payload.sourceIndex);
    if (payload.expectedText !== undefined && payload.expectedText !== value.text)
      fail('源评论已变化，请刷新后重新复制格式');
    if (
      payload.expectedStyle &&
      JSON.stringify(payload.expectedStyle) !== JSON.stringify(value.style)
    )
      fail('源评论的格式已变化，请刷新后重新复制');
    clipboard = clone(value);
    return { state: state(n.id), statusMessage: '格式已复制' };
  }
  function previewFormat(payload, mode) {
    const n = note(payload.noteId);
    requireHost(n);
    const from = mode === 'brush' ? source(n, payload.sourceIndex) : clipboard && clone(clipboard);
    if (!from) fail('请先复制一条富文本评论的格式');
    const includeConvertible = mode !== 'brush' || payload.includeConvertible === true;
    const targets = rows(n).flatMap((c, index) => {
      if (mode === 'brush' && index === payload.sourceIndex) return [];
      if (mode === 'brush' && !includeConvertible && c.type !== 'HtmlNote') return [];
      if (mode === 'brush' && includeConvertible && !['HtmlNote', 'TextNote'].includes(c.type))
        return [];
      const a = access(n.wrapped, c, index);
      const kind =
        c.type === 'HtmlNote'
          ? 'html'
          : c.type === 'TextNote'
            ? c.markdown === true
              ? 'markdown'
              : 'text'
            : 'media';
      return [
        {
          index,
          text: String(c.text || ''),
          afterText: a.text || '',
          kind,
          style: a.style,
          eligible: a.supported,
          reason: a.reason,
        },
      ];
    });
    if (
      payload.targetIndex !== undefined &&
      payload.expectedText !== undefined &&
      rows(n)[payload.targetIndex]?.text !== payload.expectedText
    )
      fail('目标评论已变化，请刷新后重新选择');
    const requestedIndices = Array.isArray(payload.selectedIndices)
      ? payload.selectedIndices
      : Number.isSafeInteger(payload.targetIndex)
        ? [payload.targetIndex]
        : [];
    const selectedIndices = Array.from(
      new Set(
        requestedIndices.filter(
          (idx) => Number.isSafeInteger(idx) && targets.some((t) => t.index === idx && t.eligible),
        ),
      ),
    );
    const token = put({
      kind: 'format',
      mode,
      noteId: n.id,
      fingerprint: fingerprint(n),
      source: from,
      targets,
    });
    return {
      token,
      noteId: n.id,
      mode,
      source: from,
      targets,
      selectedIndices,
    };
  }
  function draft(payload) {
    const n = note(payload.noteId);
    requireHost(n);
    const index = payload.index == null ? null : payload.index;
    const requestedMode = ['rich', 'text', 'markdown'].includes(payload.initialMode)
      ? payload.initialMode
      : null;
    let c = null,
      a = null;
    if (index !== null) {
      if (!Number.isSafeInteger(index) || index < 0) fail('评论位置无效');
      c = rows(n)[index];
      a = access(n.wrapped, c, index);
      if (!a.supported || !['HtmlNote', 'TextNote'].includes(c.type))
        fail(a.reason || '请选择一条可编辑的评论');
      if (payload.expectedText !== undefined && payload.expectedText !== c.text)
        fail('评论已变化，请刷新后重新打开');
    }
    const mode =
      requestedMode ||
      (c ? (c.type === 'HtmlNote' ? 'rich' : c.markdown === true ? 'markdown' : 'text') : 'rich');
    const initialText = c
      ? c.type === 'TextNote' && c.markdown === true && mode === 'rich'
        ? a.text
        : c.text
      : '';
    const token = put({ kind: 'edit', noteId: n.id, index, fingerprint: fingerprint(n) });
    return {
      token,
      noteId: n.id,
      index,
      mode,
      originalKind: c
        ? c.type === 'HtmlNote'
          ? 'rich'
          : c.markdown === true
            ? 'markdown'
            : 'text'
        : null,
      rawText: c ? c.text : '',
      plainText: a ? a.text : '',
      text: initialText,
      style: clone(a && a.style ? a.style : clipboard ? clipboard.style : readPreferredStyle()),
    };
  }
  function append(n, value) {
    const before = rows(n),
      count = before.length;
    if (value.type === 'HtmlNote')
      n.raw.appendRichTextComment(
        value.text,
        Object.fromEntries(Object.entries(value.style).filter(([, v]) => v !== null)),
      );
    else {
      const method = value.markdown ? 'appendMarkdownComment' : 'appendTextComment';
      if (typeof n.raw[method] !== 'function') fail('当前版本无法恢复原评论类型');
      n.raw[method](value.text);
    }
    let list = rows(n),
      c = list[count];
    if (
      list.length !== count + 1 ||
      !c ||
      c.type !== value.type ||
      c.text !== value.text ||
      (value.type === 'TextNote' && (c.markdown === true) !== value.markdown)
    )
      fail('新评论未通过保存校验');
    if (JSON.stringify(list.slice(0, count).map(stable)) !== JSON.stringify(before.map(stable)))
      fail('其他评论在操作期间发生变化');
    if (value.field != null) n.raw.setCommentField(count, value.field, value.fieldLabel === true);
    c = rows(n)[count];
    if (
      JSON.stringify(metadata(c)) !==
      JSON.stringify({
        author: value.author || '',
        field: value.field == null ? null : value.field,
        fieldLabel: value.fieldLabel === true,
      })
    )
      fail('评论信息未通过保存校验');
    if (value.type === 'HtmlNote') {
      const actual = __MN_COMMENT_RICH_FORMAT__.describe(c);
      if (!actual.supported || JSON.stringify(actual.style) !== JSON.stringify(value.style))
        fail('保存后的文字格式与设置不一致');
      if (
        value.body !== null &&
        value.body !== undefined &&
        __MN_COMMENT_RICH_FORMAT__.bodyKey(c) !== value.body
      )
        fail('评论正文与富文本内容不一致，原评论已保留；请在 MarginNote 中核对正文后再操作');
    }
    return c;
  }
  function replace(n, index, value) {
    const before = rows(n),
      count = before.length;
    try {
      if (index === null) {
        append(n, value);
        return;
      }
      const old = before[index];
      // When editing the body, verify that rebuilding the existing text can preserve its RTF body first.
      if (old.type === 'HtmlNote' && value.text !== old.text) {
        append(n, descriptor(old));
        n.raw.removeCommentByIndex(count);
        if (fingerprint(n) !== JSON.stringify(before.map(stable)))
          fail('正文校验未完成，原评论已保留');
      }
      const c = append(n, value),
        expected = stable(c);
      n.raw.sortCommentsByNewIndices(
        Array.from({ length: count + 1 }, (_, i) => (i === count ? index : i >= index ? i + 1 : i)),
      );
      if (
        stable(rows(n)[index]) !== expected ||
        JSON.stringify(
          rows(n)
            .filter((_, i) => i !== index)
            .map(stable),
        ) !== JSON.stringify(before.map(stable))
      )
        fail('评论定位未通过保存校验');
      n.raw.removeCommentByIndex(index + 1);
      const after = rows(n);
      if (
        after.length !== count ||
        stable(after[index]) !== expected ||
        after.some((c, i) => i !== index && stable(c) !== stable(before[i]))
      )
        fail('评论顺序或其他内容未通过保存校验');
    } catch (error) {
      let list = rows(n);
      if (list.length === count + 1) {
        if (
          index !== null &&
          JSON.stringify(list.filter((_, i) => i !== index).map(stable)) ===
            JSON.stringify(before.map(stable))
        ) {
          n.raw.sortCommentsByNewIndices(
            Array.from({ length: count + 1 }, (_, i) =>
              i === index ? count : i > index ? i - 1 : i,
            ),
          );
          list = rows(n);
        }
        if (JSON.stringify(list.slice(0, count).map(stable)) === JSON.stringify(before.map(stable)))
          n.raw.removeCommentByIndex(count);
      }
      throw error;
    }
  }
  function restoreCollapsedIndices(n, indices) {
    const unique = Array.from(new Set(indices)).filter((i) => Number.isSafeInteger(i) && i >= 0);
    if (!unique.length) return;
    const foldNow = foldHost(n.wrapped);
    if (!foldNow.supported) fail('无法恢复评论的折叠状态');
    const toCollapse = unique.filter(
      (i) => foldNow.comments[i] && foldNow.comments[i].collapsed !== true,
    );
    if (!toCollapse.length) return;
    __MN_COMMENT_FOLD_STATE_MNCommentManagerAddon.setCollapsed(
      n.wrapped,
      toCollapse,
      true,
      foldNow.revision,
    );
  }
  function mutate(n, changes, label) {
    const before = fingerprint(n),
      beforeSemantic = semantic(n),
      completed = [],
      collapsedTargets = [];
    requireHost(n);
    try {
      __MN_UNDO_GROUPING_MNCommentManagerAddon.run(label, { note: n.wrapped }, () => {
        changes.forEach((change) => {
          const index = change.index === null ? rows(n).length : change.index;
          const old = change.index === null ? null : descriptor(rows(n)[index], n, index);
          if (change.value === null) {
            if (index !== rows(n).length - 1) fail('评论位置已变化，无法撤销此次添加');
            n.raw.removeCommentByIndex(index);
          } else {
            const wantCollapsed =
              change.value.collapsed !== undefined
                ? change.value.collapsed === true
                : !!(old && old.collapsed);
            replace(n, change.index, { ...change.value, collapsed: wantCollapsed });
            if (wantCollapsed) collapsedTargets.push(index);
          }
          completed.push({ index, value: old, removed: change.value === null });
        });
        if (typeof Database !== 'undefined') Database.sharedInstance().savedb();
      });
      restoreCollapsedIndices(n, collapsedTargets);
    } catch (error) {
      if (fingerprint(n) !== before) {
        try {
          const recoveryCollapsed = [];
          __MN_UNDO_GROUPING_MNCommentManagerAddon.run(
            '恢复未完成的评论修改',
            { note: n.wrapped },
            () =>
              completed
                .slice()
                .reverse()
                .forEach((c) => {
                  if (c.value === null) n.raw.removeCommentByIndex(c.index);
                  else {
                    replace(n, c.removed ? null : c.index, c.value);
                    if (c.value.collapsed) recoveryCollapsed.push(c.index);
                  }
                }),
          );
          restoreCollapsedIndices(n, recoveryCollapsed);
          if (semantic(n) !== beforeSemantic) fail('恢复校验失败');
          if (typeof Database !== 'undefined') Database.sharedInstance().savedb();
        } catch (_) {
          fail('操作未完成，自动恢复未通过校验；请停止编辑并从版本记录恢复');
        }
      }
      fail('操作未完成，原评论已保留：' + (error.message || String(error)));
    } finally {
      try {
        if (typeof n.wrapped.refresh === 'function') n.wrapped.refresh();
      } catch (_) {}
      __MN_COMMENT_MUTATIONS__.refreshNotebookAfterCommentMutation(n.wrapped);
    }
    return { before, beforeSemantic, changes: completed };
  }
  function commit(n, changes, label, message) {
    let history = histories.get(n.id) || [];
    if (changes.length) {
      const before = fingerprint(n);
      if (history.length && history[history.length - 1].expected !== before) history = [];
      const recovery = mutate(n, changes, label);
      const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
      history.push({
        ...recovery,
        label,
        token,
        expected: fingerprint(n),
        afterSemantic: semantic(n),
      });
      while (history.length > 12) history.shift();
      histories.delete(n.id);
      histories.set(n.id, history);
      while (histories.size > 8) histories.delete(histories.keys().next().value);
    }
    const undo = history[history.length - 1];
    return {
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(n.wrapped),
      undoToken: undo ? undo.token : null,
      changedCount: changes.length,
      statusMessage: changes.length ? message : '内容与格式没有变化',
    };
  }
  function applyFormat(payload, expectedMode) {
    const { p, n } = take(payload, 'format');
    if (expectedMode && p.mode !== expectedMode) fail('操作类型不匹配，请重新打开预览');
    const indices = payload.indices;
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      indices.length > 200 ||
      indices.some((i) => !Number.isSafeInteger(i) || i < 0) ||
      new Set(indices).size !== indices.length
    )
      fail('请选择有效且不重复的目标评论');
    const nextStyle = style(p.source.style),
      changes = [];
    for (const index of indices) {
      const t = p.targets.find((t) => t.index === index),
        old = rows(n)[index],
        a = access(n.wrapped, old, index);
      if (!t || !t.eligible || !a.supported) fail(a.reason || '所选评论暂不支持此操作');
      if (old.type !== 'HtmlNote' || JSON.stringify(a.style) !== JSON.stringify(nextStyle))
        changes.push({
          index,
          value: {
            ...metadata(old),
            type: 'HtmlNote',
            text: t.afterText,
            style: nextStyle,
            body: old.type === 'HtmlNote' ? __MN_COMMENT_RICH_FORMAT__.bodyKey(old) : null,
          },
        });
    }
    const result = commit(
      n,
      changes,
      p.mode === 'brush' ? '格式刷' : '粘贴格式',
      p.mode === 'brush' ? '格式已应用' : '格式已粘贴',
    );
    plans.delete(payload.token);
    return result;
  }
  function save(payload) {
    const { p, n } = take(payload, 'edit');
    if (typeof payload.text !== 'string' || !payload.text.trim()) fail('请输入评论正文');
    if (payload.text.length > 50000) fail('评论正文过长，请缩短后再保存');
    const targetMode = ['rich', 'text', 'markdown'].includes(payload.mode)
      ? payload.mode
      : 'rich';
    const old = p.index === null ? null : rows(n)[p.index];
    if (targetMode !== 'rich') {
      const isMd = targetMode === 'markdown';
      const method = isMd ? 'appendMarkdownComment' : 'appendTextComment';
      if (typeof n.raw[method] !== 'function')
        fail('当前 MarginNote 版本不支持添加或转换该评论类型');
      const value = {
        ...(old ? metadata(old) : { author: '', field: null, fieldLabel: false }),
        type: 'TextNote',
        markdown: isMd,
        text: payload.text,
        style: null,
        body: null,
      };
      const changed =
        !old ||
        old.type !== 'TextNote' ||
        (old.markdown === true) !== isMd ||
        old.text !== payload.text;
      const label = old
        ? old.type === 'HtmlNote'
          ? isMd
            ? '富文本转为 Markdown'
            : '富文本转为普通文本'
          : isMd
            ? '编辑 Markdown 评论'
            : '编辑普通文本评论'
        : isMd
          ? '添加 Markdown 评论'
          : '添加普通文本评论';
      const message = old
        ? '评论已保存'
        : isMd
          ? 'Markdown 评论已添加'
          : '普通文本评论已添加';
      const result = commit(n, changed ? [{ index: p.index, value }] : [], label, message);
      plans.delete(payload.token);
      return result;
    }
    const nextStyle = style(payload.style);
    const value = {
      ...(old ? metadata(old) : { author: '', field: null, fieldLabel: false }),
      type: 'HtmlNote',
      text: payload.text,
      style: nextStyle,
      body:
        old && old.type === 'HtmlNote' && old.text === payload.text
          ? __MN_COMMENT_RICH_FORMAT__.bodyKey(old)
          : null,
    };
    const changed =
      !old ||
      old.type !== 'HtmlNote' ||
      old.text !== payload.text ||
      JSON.stringify(__MN_COMMENT_RICH_FORMAT__.describe(old).style) !== JSON.stringify(nextStyle);
    writePreferredStyle(nextStyle);
    const label = old
      ? old.type === 'HtmlNote'
        ? '编辑富文本评论'
        : '转为富文本评论'
      : '添加富文本评论';
    const message = old
      ? old.type === 'HtmlNote'
        ? '评论已保存'
        : '已转为富文本评论'
      : '富文本评论已添加';
    const result = commit(n, changed ? [{ index: p.index, value }] : [], label, message);
    plans.delete(payload.token);
    return result;
  }
  function undo(payload) {
    const n = note(payload.noteId),
      history = histories.get(n.id) || [],
      ticket = history[history.length - 1];
    if (!ticket || ticket.token !== payload.token) fail('请先撤销较新的评论修改');
    if (fingerprint(n) !== ticket.expected)
      fail('评论已被继续编辑，无法撤销该操作；后续修改已保留');
    mutate(n, ticket.changes.slice().reverse(), '撤销' + ticket.label);
    if (semantic(n) !== ticket.beforeSemantic) fail('撤销后的评论未通过校验，请核对正文与格式');
    history.pop();
    const previous = history[history.length - 1];
    if (previous && previous.afterSemantic === semantic(n)) previous.expected = fingerprint(n);
    return {
      snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(n.wrapped),
      statusMessage: '已撤销' + ticket.label,
    };
  }
  function state(id) {
    const history = histories.get(id) || [],
      ticket = history[history.length - 1];
    let current = false;
    try {
      current = !!ticket && fingerprint(note(id)) === ticket.expected;
    } catch (_) {}
    return {
      clipboard: clipboard ? clone(clipboard) : null,
      undo: current ? { token: ticket.token, label: '撤销' + ticket.label, noteId: id } : null,
    };
  }
  return {
    access,
    copyFormat,
    previewFormat,
    draft,
    applyFormat,
    save,
    undo,
    state,
    clearClipboard(id) {
      clipboard = null;
      return { state: state(id) };
    },
  };
})();
