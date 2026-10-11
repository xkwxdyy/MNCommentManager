var __MN_COMMENT_MODULE_OPERATIONS__ = (function () {
  const rules = __MN_COMMENT_MODULE_RULES__;
  function prepare(payload) {
    if (!payload || typeof payload.noteId !== 'string' || !payload.noteId) throw new Error('卡片标识无效');
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(payload.noteId);
    if (!note) throw new Error('卡片已不存在，请刷新');
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    const settings = __MN_COMMENT_MODULE_STORE__.read();
    if (settings.revision !== payload.expectedRevision || rules.structureSignature(snapshot.comments) !== payload.expectedStructure) throw new Error('评论或模块方案已变化，请刷新后重试');
    const effective = rules.effectiveSettings(settings, payload.noteId);
    return { snapshot, tree: rules.buildModules(snapshot.comments, effective.profile), effective };
  }
  function reorder(payload) {
    const p = prepare(payload);
    const plan = rules.moduleMovePlan(p.tree, p.snapshot.comments, payload.moduleId, payload.direction);
    return __MN_COMMENT_MUTATIONS__.moveComments(payload.noteId, plan.indices, plan.targetIndex);
  }
  function moveBody(payload) {
    const p = prepare(payload);
    const plan = rules.bodyMovePlan(p.tree, p.snapshot.comments, payload.indices, payload.targetId);
    return __MN_COMMENT_MUTATIONS__.moveModuleBodyComments(payload.noteId, plan.indices, plan.targetIndex);
  }
  function extract(payload) {
    const p = prepare(payload), node = p.tree.flat.find(n => n.id === payload.moduleId);
    if (!node) throw new Error('模块已不存在');
    const indices = rules.moduleIds(node, p.snapshot.comments, p.tree.titleIds, p.effective.includeTitle);
    if (!indices.length) throw new Error('模块没有可提取的内容');
    return __MN_COMMENT_MUTATIONS__.extractCommentsToChildNote(payload.noteId, indices, String(payload.title || node.title), payload.removeOriginal === true);
  }
  return { reorder, moveBody, extract };
})();
