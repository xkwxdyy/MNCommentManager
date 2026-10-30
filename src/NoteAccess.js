var __MN_NOTE_ACCESS_MNCommentManagerAddon = (function () {
  // Keep reads local to this addon. Older MNUtils factories also accept creation
  // configs, so raw native objects must never be passed to MNNote.new here.
  const FOCUS_ALIASES = /^(?:current(?:Note)?|focused(?:Note)?|focuseNote|active(?:Note)?)$/;
  function raw(note) {
    if (!note || (typeof note !== "object" && typeof note !== "function")) return null;
    try { const native = note.note; return native && typeof native === "object" ? native : note; }
    catch (_) { return null; }
  }
  function id(note) {
    try {
      const native = raw(note);
      const candidate = typeof note === "string" ? note : native && native.noteId;
      return typeof candidate === "string" && candidate.trim() && !FOCUS_ALIASES.test(candidate.trim()) ? candidate.trim() : "";
    } catch (_) { return ""; }
  }
  function byId(noteId) {
    const key = typeof noteId === "string" ? id(noteId) : "";
    if (!key) return null;
    try {
      const note = MNNote.new(key, false);
      return id(note).toUpperCase() === key.toUpperCase() ? note : null;
    } catch (_) { return null; }
  }
  function fromNative(note) { return byId(id(note)); }
  function array(value) {
    if (Array.isArray(value)) return value.slice();
    if (!value) return [];
    const count = value.length === undefined || value.length === null
      ? (typeof value.count === "function" ? value.count() : value.count) : value.length;
    const length = Number(count);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("卡片列表尚未就绪，请稍后重试");
    const list = [];
    for (let index = 0; index < length; index += 1) list.push(typeof value.objectAtIndex === "function" ? value.objectAtIndex(index) : value[index]);
    return list;
  }
  function parentId(note) {
    try { const native = raw(note); return native ? id(native.parentNote) : ""; }
    catch (_) { return ""; }
  }
  function parent(note) { return byId(parentId(note)); }
  function children(note) {
    const native = raw(note);
    return array(native && native.childNotes).map(child => {
      const wrapped = fromNative(child);
      if (!wrapped) throw new Error("子卡片标识尚未就绪，请稍后重试");
      return wrapped;
    });
  }
  function siblingIndex(note) {
    const native = raw(note), key = id(note);
    if (!native || !key) return -1;
    const parent = raw(native.parentNote);
    return parent && id(parent) ? array(parent.childNotes).findIndex(child => id(child) === key) : -1;
  }
  function current() {
    try {
      const controller = MNUtil.notebookController;
      if (!controller || !controller.notebookId) return null;
      const notebook = typeof MNUtil.getNoteBookById === "function" ? MNUtil.getNoteBookById(controller.notebookId) : MNUtil.currentNotebook;
      if (notebook && notebook.flags === 1 && MNUtil.currentDocController && MNUtil.currentDocController.focusNote) return fromNative(MNUtil.currentDocController.focusNote);
      if (MNUtil.docMapSplitModeName !== "allDoc" && controller.view && !controller.view.hidden && controller.focusNote) return fromNative(controller.focusNote);
      if (MNUtil.docMapSplitMode) {
        if (MNUtil.currentDocController && MNUtil.currentDocController.focusNote) return fromNative(MNUtil.currentDocController.focusNote);
        for (const doc of array(MNUtil.docControllers)) if (doc && doc.focusNote) return fromNative(doc.focusNote);
        if (MNUtil.popUpNoteInfo) return byId(id(MNUtil.popUpNoteInfo.noteId));
      }
      // Read the stored history directly; a dependency's history helper may
      // itself resolve focus through its unsafe factory.
      const history = array(MNUtil.focusHistory);
      const latest = history[history.length - 1];
      return latest && latest.type === "note" ? byId(id(latest.noteId)) : null;
    } catch (_) { return null; }
  }
  function selected() {
    try {
      const controller = MNUtil.notebookController;
      if (!controller || !controller.notebookId) return null;
      let notes = [];
      if (MNUtil.docMapSplitModeName !== "allDoc" && controller.view && !controller.view.hidden && controller.mindmapView) {
        notes = array(controller.mindmapView.selViewLst).map(view => view && view.note && view.note.note);
      }
      const floating = MNUtil.floatMindmapView;
      if (floating) notes.push(...array(floating.selViewLst).map(view => view && view.note && view.note.note));
      // Preserve incomplete entries so action validation cannot mistake a
      // partially available multi-selection for a valid single selection.
      if (notes.length) return notes;
      const notebook = MNUtil.currentNotebook;
      if (notebook && notebook.flags === 1 && MNUtil.currentDocController && MNUtil.currentDocController.focusNote) return [MNUtil.currentDocController.focusNote];
      if (MNUtil.docMapSplitMode) {
        if (MNUtil.currentDocController && MNUtil.currentDocController.focusNote) return [MNUtil.currentDocController.focusNote];
        for (const doc of array(MNUtil.docControllers)) if (doc && doc.focusNote) return [doc.focusNote];
      }
      if (MNUtil.popUpNoteInfo) return [byId(id(MNUtil.popUpNoteInfo.noteId))];
      return controller.focusNote ? [controller.focusNote] : [];
    } catch (_) { return null; }
  }
  return { raw, id, byId, fromNative, parentId, parent, children, siblingIndex, current, selected };
})();
