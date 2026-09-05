var __MN_COMMENT_BATCH_EDITOR__ = (function () {
  function text(value) { return value === undefined || value === null ? "" : String(value); }

  function parseSafeInteger(value) {
    if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
    if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function normalizePosition(position) {
    if (position === undefined || position === null || position === "") return null;
    if (!position || typeof position !== "object" || Array.isArray(position)) {
      return { invalid: true, error: "评论位置必须是单个索引或范围" };
    }
    const mode = text(position.mode).trim().toLowerCase();
    if (mode === "all") return null;
    if (mode === "single") {
      const index = parseSafeInteger(position.index);
      if (index === null) return { invalid: true, error: "评论索引必须是整数" };
      return { mode: "single", index };
    }
    if (mode === "range") {
      const start = parseSafeInteger(position.start);
      const end = parseSafeInteger(position.end);
      if (start === null || end === null) return { invalid: true, error: "评论范围的起点和终点必须是整数" };
      return { mode: "range", start, end };
    }
    return { invalid: true, error: "评论位置模式只能是 single 或 range" };
  }

  function normalizeSelector(selector) {
    const source = selector && typeof selector === "object" ? selector : {};
    const types = Array.isArray(source.types) ? source.types.map(text).filter(Boolean) : [];
    const capabilities = Array.isArray(source.capabilities) ? source.capabilities.map(text).filter(Boolean) : [];
    const position = normalizePosition(source.position);
    return {
      subject: "comments",
      types,
      capabilities,
      includeExcerpt: source.includeExcerpt === true,
      order: text(source.order).toLowerCase() === "reverse" ? "reverse" : "forward",
      position,
    };
  }

  function matches(comment, selector) {
    if (!comment) return false;
    const normalized = normalizeSelector(selector);
    if (normalized.types.length > 0) {
      const typeMatches = normalized.types.some((type) => {
        const capabilities = comment.capabilities || {};
        if (type === "text") return capabilities.hasText === true && capabilities.isHtml !== true && capabilities.isMarkdown !== true;
        if (type === "markdown") return capabilities.isMarkdown === true;
        if (type === "html") return capabilities.isHtml === true;
        if (type === "image") return capabilities.hasImage === true;
        if (type === "link") return comment.type === "linkComment" || comment.type === "summaryComment";
        return comment.type === type;
      });
      if (!typeMatches) return false;
    }
    return normalized.capabilities.every((capability) => comment.capabilities && comment.capabilities[capability] === true);
  }

  function resolveSelectionFromSnapshot(snapshot, selector) {
    const normalized = normalizeSelector(selector);
    if (normalized.position && normalized.position.invalid) throw new Error(normalized.position.error);
    const comments = Array.isArray(snapshot.comments) ? snapshot.comments : [];
    const count = comments.length;
    let positionSet = null;
    let positionValid = true;
    if (normalized.position && normalized.position.mode === "single") {
      const resolved = normalized.position.index < 0 ? count + normalized.position.index : normalized.position.index;
      positionValid = resolved >= 0 && resolved < count;
      positionSet = positionValid ? new Set([resolved]) : new Set();
    } else if (normalized.position && normalized.position.mode === "range") {
      const rawStart = normalized.position.start;
      const rawEnd = normalized.position.end;
      const start = rawStart < 0 ? count + rawStart : rawStart;
      const end = rawEnd < 0 ? count + rawEnd : rawEnd;
      // Do not clamp a range: a missing endpoint means this card is skipped.
      positionValid = start >= 0 && start < count && end >= 0 && end < count;
      if (positionValid) {
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        positionSet = new Set();
        for (let index = low; index <= high; index += 1) positionSet.add(index);
      } else {
        positionSet = new Set();
      }
    }
    const indices = comments
      .filter((comment, position) => (positionSet === null || positionSet.has(position)) && matches(comment, normalized))
      .map((comment) => comment.index);
    return {
      selector: normalized,
      indices: normalized.order === "reverse" ? indices.reverse() : indices,
      positionValid: normalized.position === null ? true : positionValid,
    };
  }

  function selectCommentIndices(note, selector) {
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    return resolveSelectionFromSnapshot(snapshot, selector).indices;
  }

  function previewSelection(note, selector) {
    const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
    const result = resolveSelectionFromSnapshot(snapshot, selector);
    return {
      indices: result.indices,
      matched: result.indices.length,
      positionValid: result.positionValid,
      positionOutOfRange: result.positionValid === false,
    };
  }

  function buildOverview(notes) {
    const source = Array.isArray(notes) ? notes : [];
    return source.map((note) => {
      const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
      const counts = { all: 0, text: 0, markdown: 0, html: 0, image: 0, link: 0 };
      (snapshot.comments || []).forEach((comment) => {
        counts.all += 1;
        const capabilities = comment.capabilities || {};
        if (capabilities.isHtml) counts.html += 1;
        if (capabilities.isMarkdown) counts.markdown += 1;
        if (capabilities.hasText && !capabilities.isHtml && !capabilities.isMarkdown) counts.text += 1;
        if (capabilities.hasImage) counts.image += 1;
        if (comment.type === "linkComment" || comment.type === "summaryComment") counts.link += 1;
      });
      return {
        noteId: text(snapshot.noteId || note.noteId),
        title: text(snapshot.noteTitle || "未命名卡片"),
        excerptType: text(snapshot.excerpt && snapshot.excerpt.type || "none"),
        commentCount: Array.isArray(snapshot.comments) ? snapshot.comments.length : 0,
        commentCounts: counts,
      };
    });
  }

  function composeText(snapshot, indices, options) {
    const separator = options && options.separator !== undefined ? text(options.separator) : "\n\n";
    const byIndex = new Map((snapshot.comments || []).map((comment) => [comment.index, comment]));
    return indices.map((index) => {
      const comment = byIndex.get(index);
      return text(comment && comment.text).trim();
    }).filter(Boolean).join(separator).trim();
  }

  function reverseIndicesInPlace(note, indices) {
    const selected = Array.from(new Set((Array.isArray(indices) ? indices : []).map((value) => Number(value))))
      .filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (selected.length < 2) return { changed: false, selectedIndices: selected };
    const rawComments = note && Array.isArray(note.comments) ? note.comments : [];
    const order = Array.from({ length: rawComments.length }, (_, index) => index);
    for (let step = 0; step < selected.length; step += 1) {
      const sourceToken = selected[selected.length - 1 - step];
      const sourceIndex = order.indexOf(sourceToken);
      const destinationIndex = selected[step];
      if (sourceIndex < 0 || sourceIndex === destinationIndex) continue;
      if (typeof note.moveComment === "function") note.moveComment(sourceIndex, destinationIndex, false);
      else if (note.note && typeof note.note.moveComment === "function") note.note.moveComment(sourceIndex, destinationIndex);
      else throw new Error("当前版本不支持反转评论排列");
      const token = order.splice(sourceIndex, 1)[0];
      order.splice(destinationIndex, 0, token);
    }
    return { changed: true, selectedIndices: selected };
  }

  function runForNotes(notes, selector, operation) {
    const source = Array.isArray(notes) ? notes : [];
    const stats = { total: source.length, changed: 0, skipped: 0, failed: 0, errors: [], perNote: [] };
    source.forEach((note) => {
      const noteId = text(note && note.noteId);
      try {
        const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(note);
        const indices = selectCommentIndices(note, selector);
        if (indices.length === 0) {
          stats.skipped += 1;
          stats.perNote.push({ noteId, status: "skipped", matched: 0 });
          return;
        }
        const result = operation(note, snapshot, indices) || {};
        if (result.changed !== false) stats.changed += 1;
        stats.perNote.push({ noteId, status: result.changed === false ? "skipped" : "changed", matched: indices.length });
        if (result.convertedNoteMap) stats.convertedNoteMap = Object.assign(stats.convertedNoteMap || {}, result.convertedNoteMap);
      } catch (error) {
        stats.failed += 1;
        stats.errors.push({ noteId, message: error && error.message ? error.message : String(error) });
        stats.perNote.push({ noteId, status: "failed", matched: 0, message: error && error.message ? error.message : String(error) });
      }
    });
    return stats;
  }

  function mergeSelected(notes, selector, options) {
    return runForNotes(notes, selector, (note, snapshot, indices) => {
      const eligibleIndices = indices.filter((index) => {
        const comment = (snapshot.comments || []).find((item) => item.index === index);
        const capabilities = comment && comment.capabilities;
        return capabilities && capabilities.canMergeText === true && capabilities.canCopyText === true;
      });
      const excerpt = snapshot.excerpt || {};
      const excerptSelected = selector && selector.includeExcerpt === true && excerpt.present === true &&
        excerpt.capabilities && excerpt.capabilities.canMergeText === true;
      if (eligibleIndices.length + (excerptSelected ? 1 : 0) < 2) return { changed: false };
      const commentText = composeText(snapshot, eligibleIndices, options);
      const finalText = excerptSelected && text(excerpt.text).trim()
        ? `${text(excerpt.text).trim()}${options && options.separator !== undefined ? text(options.separator) : "\n\n"}${commentText}`.trim()
        : commentText;
      if (!finalText) return { changed: false };
      const destination = text(options && options.destination).toLowerCase() === "excerpt" ? "excerpt" : "comment";
      const result = destination === "excerpt"
        ? __MN_COMMENT_MUTATIONS__.mergeCommentsToExcerpt(note.noteId, { excerptSelected, commentIndices: eligibleIndices }, finalText, options && options.markdown !== false)
        : __MN_COMMENT_MUTATIONS__.mergeContentSelection(note.noteId, { excerptSelected, commentIndices: eligibleIndices }, finalText, options && options.markdown !== false, "text");
      if (result && result.actionCompleted === false) throw new Error(text(result.error || result.statusMessage || "合并失败"));
      return { changed: true, convertedNoteMap: result && result.convertedNoteMap };
    });
  }

  function convertHtml(notes, selector) {
    return runForNotes(notes, selector, (note, snapshot, indices) => {
      const htmlIndices = indices.filter((index) => {
        const comment = (snapshot.comments || []).find((item) => item.index === index);
        return comment && comment.capabilities && comment.capabilities.isHtml === true;
      });
      if (htmlIndices.length === 0) return { changed: false };
      const result = __MN_COMMENT_MUTATIONS__.convertHtmlCommentsToMarkdown(note.noteId, htmlIndices);
      const converted = result && result.stats ? Number(result.stats.convertedComments || 0) : 0;
      if (result && result.stats && Number(result.stats.failed || 0) > 0) throw new Error("部分 HTML 评论转换失败");
      return { changed: converted > 0 };
    });
  }

  function deleteSelected(notes, selector) {
    return runForNotes(notes, selector, (note, _snapshot, indices) => {
      __MN_COMMENT_MUTATIONS__.deleteContentSelection(note.noteId, { excerptSelected: false, commentIndices: indices });
      return { changed: true };
    });
  }

  function reverseSelected(notes, selector) {
    return runForNotes(notes, selector, (note, _snapshot, indices) => {
      if (typeof __MN_COMMENT_MUTATIONS__.reverseCommentIndices !== "function") throw new Error("当前版本不支持反转评论排列");
      return __MN_COMMENT_MUTATIONS__.reverseCommentIndices(note.noteId, indices);
    });
  }

  return {
    normalizeSelector,
    selectCommentIndices,
    previewSelection,
    buildOverview,
    mergeSelected,
    convertHtml,
    deleteSelected,
    reverseSelected,
  };
})();
