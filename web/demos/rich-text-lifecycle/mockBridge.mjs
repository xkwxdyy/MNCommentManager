export function createPrototypeBridge(store) {
  const plans = new Map();
  let sequence = 0;
  const state = () => store.snapshot().richText;
  function token(plan) {
    const id = 'prototype-plan-' + ++sequence;
    plans.set(id, plan);
    return id;
  }
  function requireCard(payload) {
    if (payload.noteId !== store.card.id) throw Error('当前卡片已变化，请重新打开评论');
  }
  function preview(plan) {
    return {
      ...plan,
      noteId: plan.cardId,
      token: token(plan),
      source: {
        text: plan.source.sourceText,
        noteTitle: plan.source.sourceCard,
        index: plan.source.sourceIndex,
        style: plan.source.style,
      },
    };
  }
  function receipt(changed) {
    return {
      snapshot: store.snapshot(),
      undoToken: state().undo?.token || null,
      changedCount: changed ? 1 : 0,
      statusMessage: changed ? '评论已更新' : '内容与格式没有变化',
    };
  }
  return async (command, payload = {}) => {
    if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return store.snapshot();
    if (command === 'getActionButtonSettings') return {};
    if (command === 'listWorkflows') return [];
    if (command === 'getAddonUpdateState') return { status: 'idle', version: '交互原型' };
    if (
      [
        'copyRichCommentFormat',
        'clearRichCommentFormat',
        'getFormatBrushPreview',
        'getRichCommentPastePreview',
        'getRichCommentDraft',
        'applyFormatBrush',
        'applyRichCommentFormat',
        'saveRichComment',
        'undoRichComment',
      ].includes(command)
    )
      requireCard(payload);
    if (command === 'copyRichCommentFormat') {
      store.copy(payload.sourceIndex);
      return { state: state(), statusMessage: '格式已复制' };
    }
    if (command === 'clearRichCommentFormat') {
      store.clearClipboard();
      return { state: state() };
    }
    if (command === 'getFormatBrushPreview') return preview(store.brushPlan(payload.sourceIndex));
    if (command === 'getRichCommentPastePreview') {
      const p = preview(store.pastePlan());
      const requested = Array.isArray(payload.selectedIndices)
        ? payload.selectedIndices
        : Number.isInteger(payload.targetIndex)
          ? [payload.targetIndex]
          : [];
      return {
        ...p,
        selectedIndices: requested.filter((i) => p.targets.some((t) => t.index === i && t.eligible)),
      };
    }
    if (command === 'getRichCommentDraft') {
      const draft = store.draft(payload.index, payload.initialMode);
      return { ...draft, noteId: draft.cardId, token: token(draft) };
    }
    if (command === 'saveRichComment') {
      const p = plans.get(payload.token);
      if (!p) throw Error('编辑已失效，请重新打开评论');
      const result = receipt(store.save(p, payload.text, payload.style, payload.mode));
      plans.delete(payload.token);
      return result;
    }
    if (command === 'applyFormatBrush' || command === 'applyRichCommentFormat') {
      const p = plans.get(payload.token);
      if (!p) throw Error('预览已失效，请重新打开');
      const result = receipt(
        p.mode === 'brush' ? store.brush(p, payload.indices) : store.paste(p, payload.indices),
      );
      plans.delete(payload.token);
      return result;
    }
    if (command === 'undoRichComment' || command === 'undoFormatBrush') {
      if (payload.token !== state().undo?.token) throw Error('撤销记录已变化');
      return receipt(store.undo());
    }
    if (command === 'editCommentText') {
      store.editText(payload.index, payload.text);
      return receipt(true);
    }
    if (command === 'deleteContentSelection' || command === 'deleteComments') {
      store.remove(payload.indices || payload.selection?.commentIndices || []);
      return receipt(true);
    }
    if (command === 'moveContentSelection' || command === 'moveComments') {
      store.move(
        payload.indices || payload.selection?.commentIndices || [],
        payload.targetIndex ?? 0,
      );
      return receipt(true);
    }
    throw Error('该操作不在本次富文本原型的测试范围内');
  };
}
