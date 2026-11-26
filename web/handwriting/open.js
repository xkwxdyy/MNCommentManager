(async function () {
  const status = document.getElementById("status");
  let noteId, opened = false;
  async function notify(command, fields) {
    return mn.call(command, Object.assign({ noteId }, fields));
  }
  function checked(result, fallback) {
    if (!result || result.error) throw new Error(result?.error?.message || fallback);
    return result;
  }

  try {
    const target = checked(await mn.call("getQuickHandwritingTarget"), "未读取到目标卡片");
    if (!target.noteId) return;
    noteId = target.noteId;
    const note = "/notes/" + encodeURIComponent(noteId);
    const before = checked(await mn.api(note + "/comments"), "未读取到目标卡片评论");
    if (typeof before.revision !== "string" || !before.revision || !Array.isArray(before.comments)) throw new Error("未读取到卡片评论版本");
    const previousAnnotations = new Set(before.comments.filter(comment => comment.cardAnnotation).map(comment => comment.commentId));

    mn.on("practice", event => {
      if (opened && event?.noteid === noteId) notify("quickHandwritingFinished", { saved: event.saved === true }).catch(() => {});
    });
    mn.on("comments", async event => {
      if (!opened || event?.noteid !== noteId && !event?.noteids?.includes(noteId)) return;
      try {
        const after = checked(await mn.api(note + "/comments"), "未读取到手写评论");
        if (after.revision !== before.revision && after.comments?.some(comment => comment.cardAnnotation && comment.commentId && !previousAnnotations.has(comment.commentId))) {
          await notify("quickHandwritingFinished", { saved: true });
        }
      } catch (_) { /* The next panel refresh will read the card again. */ }
    });

    const permission = await notify("startQuickHandwriting");
    if (!permission?.accepted) throw new Error("目标学习集或卡片已变化，请重新打开添加评论");
    const result = checked(await mn.api(note + "/annotation-editor", {
      method: "POST", body: { expectedRevision: before.revision, confirm: true },
    }), "无法打开原生手写编辑器");
    if (result.editorOpened !== true || result.noteid !== noteId) throw new Error("未收到目标卡片的手写编辑器回执");
    opened = true;
    await notify("quickHandwritingOpened");
    status.textContent = "在原生编辑器中书写并保存。";
  } catch (error) {
    const message = String(error?.message || error);
    status.textContent = message;
    if (noteId && !opened) {
      try { await notify("quickHandwritingFailed", { message }); } catch (_) {}
    }
  }
})();
