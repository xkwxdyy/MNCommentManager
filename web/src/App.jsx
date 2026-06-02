import { useEffect, useMemo, useRef, useState } from "react";
import MNBridge from "./lib/mnBridge";

const TYPE_META = {
  textComment: { label: "文本", filter: "text" },
  tagComment: { label: "标签", filter: "text" },
  markdownComment: { label: "Markdown", filter: "text" },
  markdownLinkComment: { label: "Markdown", filter: "text" },
  HtmlComment: { label: "HTML", filter: "html" },
  linkComment: { label: "卡片链接", filter: "link" },
  summaryComment: { label: "概要链接", filter: "link" },
  imageComment: { label: "图片", filter: "image" },
  imageCommentWithDrawing: { label: "图片手写", filter: "image" },
  drawingComment: { label: "手写", filter: "image" },
  mergedImageComment: { label: "合并图片", filter: "image" },
  mergedImageCommentWithDrawing: { label: "合并图片手写", filter: "image" },
  mergedChildMapComment: { label: "子脑图", filter: "other" },
  mergedTextComment: { label: "合并文本", filter: "text" },
  blankTextComment: { label: "空文本", filter: "text" },
  blankImageComment: { label: "空图片", filter: "image" },
  audioComment: { label: "音频", filter: "audio" },
  unknownComment: { label: "未知", filter: "other" },
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "text", label: "文本" },
  { key: "image", label: "图片" },
  { key: "link", label: "链接" },
  { key: "html", label: "HTML" },
  { key: "audio", label: "音频" },
  { key: "other", label: "其他" },
];

const STAGE_LABELS = {
  text: "文本层",
  html: "HTML 层",
  "merged-text": "合并文本",
  "merged-image": "合并图片",
  "merged-child-map": "子脑图",
  paint: "绘图层",
  audio: "音频层",
  unknown: "未知层",
};

const LINK_DIRECTION_LABELS = {
  both: "双向",
  "one-way": "单向",
};

function getTypeMeta(comment) {
  return TYPE_META[comment?.type] || TYPE_META.unknownComment;
}

function normalizeError(error) {
  if (!error) return "未知错误";
  if (typeof error === "string") return error;
  return error.message || JSON.stringify(error);
}

function clampText(text, maxLength = 360) {
  const source = String(text || "");
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength).trimEnd()}...`;
}

function normalizeImageSource(comment) {
  if (!comment?.imageBase64) return "";
  if (/^data:/i.test(comment.imageBase64)) return comment.imageBase64;
  return `data:${comment.imageMimeType || "image/jpeg"};base64,${comment.imageBase64}`;
}

function commentText(comment) {
  return comment?.text || comment?.htmlText || "";
}

function commentSearchText(comment) {
  return [
    comment?.index,
    comment?.type,
    getTypeMeta(comment).label,
    commentText(comment),
    comment?.linkedNoteTitle,
    comment?.originalType,
    comment?.lifecycleStage,
    comment?.linkDirection,
  ].filter(Boolean).join(" ").toLowerCase();
}

function canComment(comment, capability) {
  return !!(comment?.capabilities && comment.capabilities[capability]);
}

function allSelectedCan(comments, capability) {
  return comments.length > 0 && comments.every((comment) => canComment(comment, capability));
}

function anySelectedCan(comments, capability) {
  return comments.some((comment) => canComment(comment, capability));
}

function getStageLabel(comment) {
  return STAGE_LABELS[comment?.lifecycleStage] || "未知层";
}

function getSelectionHint(comments) {
  if (comments.length === 0) return "未选择评论";
  const textCount = comments.filter((comment) => canComment(comment, "canCopyText")).length;
  const imageCount = comments.filter((comment) => canComment(comment, "canCopyImage")).length;
  const linkCount = comments.filter((comment) => canComment(comment, "canFocusLink")).length;
  const parts = [`${comments.length} 条`];
  if (textCount) parts.push(`${textCount} 文本`);
  if (imageCount) parts.push(`${imageCount} 图片`);
  if (linkCount) parts.push(`${linkCount} 链接`);
  return parts.join(" / ");
}

function sortedSetValues(set) {
  return Array.from(set).sort((a, b) => a - b);
}

function buildFieldGroups(comments) {
  const groups = [];
  let current = null;

  const ensureCurrent = () => {
    if (!current) {
      current = {
        id: "field-default",
        name: "未分组",
        anchorIndex: comments[0]?.index ?? 0,
        comments: [],
      };
    }
    return current;
  };

  comments.forEach((comment) => {
    if (comment.type === "HtmlComment") {
      if (current && current.comments.length > 0) {
        groups.push(current);
      }
      current = {
        id: `field-${comment.index}`,
        name: commentText(comment).replace(/<[^>]*>/g, "").trim() || "HTML 字段",
        anchorIndex: comment.index,
        comments: [],
      };
      return;
    }
    ensureCurrent().comments.push(comment);
  });

  if (current && current.comments.length > 0) {
    groups.push(current);
  }
  if (groups.length === 0 && comments.length > 0) {
    groups.push({
      id: "field-all",
      name: "全部评论",
      anchorIndex: comments[0].index,
      comments,
    });
  }
  return groups;
}

function makeEmptySnapshot() {
  return { noteId: "", noteTitle: "", comments: [], error: "" };
}

function Button({ children, className = "", disabled = false, onClick, title, type = "button" }) {
  const handleClick = (event) => {
    if (disabled || !onClick) return;
    try {
      const result = onClick(event);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {
      // Command handlers set user-visible status before rethrowing.
    }
  };

  return (
    <button type={type} className={className} disabled={disabled} onClick={handleClick} title={title}>
      {children}
    </button>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(() => makeEmptySnapshot());
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("正在加载当前卡片...");
  const [loading, setLoading] = useState(false);
  const [rangePicking, setRangePicking] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState(null);
  const [insertMode, setInsertMode] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [deletePressing, setDeletePressing] = useState(false);
  const deleteTimer = useRef(null);
  const deleteLongPressFired = useRef(false);
  const didInitialLoad = useRef(false);
  const quickMoveTimers = useRef({});

  const comments = snapshot.comments || [];
  const allIndices = useMemo(() => comments.map((comment) => comment.index), [comments]);
  const commentByIndex = useMemo(() => {
    const map = new Map();
    comments.forEach((comment) => map.set(comment.index, comment));
    return map;
  }, [comments]);
  const selectedIndices = useMemo(() => sortedSetValues(selected), [selected]);
  const selectedComments = useMemo(
    () => selectedIndices.map((index) => commentByIndex.get(index)).filter(Boolean),
    [commentByIndex, selectedIndices],
  );
  const filterCounts = useMemo(() => (
    comments.reduce((counts, comment) => {
      const key = getTypeMeta(comment).filter;
      counts.all += 1;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, { all: 0, text: 0, image: 0, link: 0, html: 0, audio: 0, other: 0 })
  ), [comments]);
  const visibleComments = useMemo(() => (
    comments.filter((comment) => {
      if (filter !== "all" && getTypeMeta(comment).filter !== filter) return false;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return commentSearchText(comment).includes(query);
    })
  ), [comments, filter, search]);
  const fieldGroups = useMemo(() => buildFieldGroups(comments), [comments]);
  const hasSelection = selectedIndices.length > 0;
  const hasOneSelection = selectedIndices.length === 1;
  const hasMultiSelection = selectedIndices.length > 1;
  const selectedCanCopyText = anySelectedCan(selectedComments, "canCopyText");
  const selectedCanCopyImage = hasOneSelection && canComment(selectedComments[0], "canCopyImage");
  const selectedCanEditText = hasOneSelection && canComment(selectedComments[0], "canEditText");
  const selectedCanMergeText = hasMultiSelection && allSelectedCan(selectedComments, "canMergeText") && allSelectedCan(selectedComments, "canCopyText");
  const selectedCanFocusLink = hasOneSelection && canComment(selectedComments[0], "canFocusLink");
  const selectedCanBidirectionalDelete = hasSelection && allSelectedCan(selectedComments, "canBidirectionalDelete");
  const selectionIsContinuous = useMemo(() => {
    if (!hasSelection) return false;
    const first = selectedIndices[0];
    const last = selectedIndices[selectedIndices.length - 1];
    return last - first + 1 === selectedIndices.length;
  }, [hasSelection, selectedIndices]);

  const applySnapshot = (nextSnapshot, message = "") => {
    setSnapshot(nextSnapshot || makeEmptySnapshot());
    setSelected(new Set());
    setRangePicking(false);
    setRangeAnchor(null);
    setInsertMode(false);
    setStatus(message || (nextSnapshot?.error ? nextSnapshot.error : "已同步当前卡片"));
  };

  const runCommand = async (command, payload, options = {}) => {
    const { message = "操作完成", keepSelection = false } = options;
    setLoading(true);
    try {
      const result = await MNBridge.send(command, payload);
      if (result?.snapshot) {
        applySnapshot(result.snapshot, message);
      } else if (result?.comments) {
        applySnapshot(result, message);
      } else if (!keepSelection) {
        setStatus(message);
      }
      return result;
    } catch (error) {
      setStatus(normalizeError(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentNote = async () => {
    try {
      await runCommand("getCurrentNoteComments", null, { message: "已加载当前卡片" });
    } catch (_) {
      // status has been set by runCommand
    }
  };

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    loadCurrentNote();
    return () => {
      clearDeleteTimer();
    };
  }, []);

  useEffect(() => {
    window.__MNCommentManagerNativeSync = (rawPayload) => {
      try {
        const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        if (!payload?.snapshot) return;
        applySnapshot(payload.snapshot, payload.snapshot.error ? payload.snapshot.error : "已识别当前卡片");
      } catch (error) {
        setStatus(normalizeError(error));
      }
    };

    return () => {
      if (window.__MNCommentManagerNativeSync) {
        delete window.__MNCommentManagerNativeSync;
      }
    };
  }, []);

  const execute = async (callback) => {
    try {
      await callback();
    } catch (_) {
      // status has been set by the command path
    }
  };

  const setSelection = (indices) => {
    const valid = new Set(allIndices);
    setSelected(new Set(indices.filter((index) => valid.has(index))));
  };

  const toggleIndex = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCommentClick = (index) => {
    if (rangePicking) {
      if (rangeAnchor === null) {
        setRangeAnchor(index);
        setSelected(new Set([index]));
        setStatus(`已设范围起点 #${index}，再点一个终点`);
        return;
      }
      const start = Math.min(rangeAnchor, index);
      const end = Math.max(rangeAnchor, index);
      setSelection(allIndices.filter((item) => item >= start && item <= end));
      setRangePicking(false);
      setRangeAnchor(null);
      setStatus(`已选择 #${start} - #${end}`);
      return;
    }
    toggleIndex(index);
  };

  const requireSelection = () => {
    if (selectedIndices.length === 0) {
      setStatus("请先选择评论");
      return false;
    }
    return true;
  };

  const moveSelection = async (targetIndex) => {
    if (!requireSelection()) return;
    await runCommand("moveComments", {
      noteId: snapshot.noteId,
      indices: selectedIndices,
      targetIndex,
    }, { message: "已移动评论" });
  };

  const getCommentPosition = (index) => comments.findIndex((comment) => comment.index === index);

  const moveSingleComment = async (commentIndex, direction, toEdge = false) => {
    const position = getCommentPosition(commentIndex);
    if (position < 0) {
      setStatus("未找到目标评论");
      return;
    }

    if (direction === "up") {
      if (position === 0) {
        setStatus("已经在最顶部");
        return;
      }
      const targetIndex = toEdge ? 0 : comments[position - 1].index;
      await runCommand("moveComments", {
        noteId: snapshot.noteId,
        indices: [commentIndex],
        targetIndex,
      }, { message: toEdge ? "已置顶评论" : "已上移评论" });
      return;
    }

    if (position >= comments.length - 1) {
      setStatus("已经在最底部");
      return;
    }
    const afterNext = comments[position + 2];
    const targetIndex = toEdge || !afterNext ? comments.length : afterNext.index;
    await runCommand("moveComments", {
      noteId: snapshot.noteId,
      indices: [commentIndex],
      targetIndex,
    }, { message: toEdge ? "已置底评论" : "已下移评论" });
  };

  const deleteSingleComment = async (commentIndex) => {
    await runCommand("deleteComments", {
      noteId: snapshot.noteId,
      indices: [commentIndex],
    }, { message: "已删除评论" });
  };

  const moveByStep = async (direction) => {
    if (!requireSelection()) return;
    const first = selectedIndices[0];
    const last = selectedIndices[selectedIndices.length - 1];
    const expected = last - first + 1;
    if (expected !== selectedIndices.length) {
      setStatus("上移/下移只支持连续选择");
      return;
    }
    if (direction === "up") {
      if (first === 0) {
        setStatus("已经在最顶部");
        return;
      }
      await moveSelection(first - 1);
      return;
    }
    if (last >= comments.length - 1) {
      setStatus("已经在最底部");
      return;
    }
    await moveSelection(last + 2);
  };

  const deleteSelection = async () => {
    if (!requireSelection()) return;
    await runCommand("deleteComments", {
      noteId: snapshot.noteId,
      indices: selectedIndices,
    }, { message: "已删除评论" });
  };

  const confirmBidirectionalDelete = async () => {
    if (!requireSelection()) return;
    if (!selectedCanBidirectionalDelete) {
      setStatus("选中评论没有纯卡片链接，不能双向删除");
      return;
    }
    try {
      const result = await runCommand("countReverseLinks", {
        noteId: snapshot.noteId,
        indices: selectedIndices,
      }, { keepSelection: true });
      const reverseCount = result?.reverseCount || 0;
      setDialog({
        title: "双向删除",
        body: `将删除当前卡片 ${selectedIndices.length} 条评论，并删除目标卡片中约 ${reverseCount} 条纯反向链接。Markdown 行内链接不会被处理。`,
        confirmText: "确认双向删除",
        danger: true,
        onConfirm: async () => {
          setDialog(null);
          await runCommand("deleteBidirectionalLinks", {
            noteId: snapshot.noteId,
            indices: selectedIndices,
          }, { message: "已完成双向删除" });
        },
      });
    } catch (_) {
      // status has been set
    }
  };

  function clearDeleteTimer() {
    if (deleteTimer.current) {
      clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
    }
  }

  function clearDeletePress() {
    clearDeleteTimer();
    setDeletePressing(false);
  }

  const startDeletePress = () => {
    if (loading || !hasSelection) {
      setStatus("请先选择评论");
      return;
    }
    clearDeletePress();
    deleteLongPressFired.current = false;
    setDeletePressing(true);
    deleteTimer.current = setTimeout(() => {
      deleteLongPressFired.current = true;
      clearDeletePress();
      execute(confirmBidirectionalDelete);
    }, 560);
  };

  const endDeletePress = () => {
    const fired = deleteLongPressFired.current;
    clearDeletePress();
    if (!fired) execute(deleteSelection);
  };

  const cancelDeletePress = () => {
    deleteLongPressFired.current = true;
    clearDeletePress();
  };

  const startQuickMovePress = (event, commentIndex, direction) => {
    event.stopPropagation();
    if (loading) return;
    clearTimeout(quickMoveTimers.current[commentIndex]);
    quickMoveTimers.current[commentIndex] = setTimeout(() => {
      quickMoveTimers.current[commentIndex] = null;
      execute(() => moveSingleComment(commentIndex, direction, true));
    }, 520);
  };

  const finishQuickMovePress = (event, commentIndex, direction) => {
    event.stopPropagation();
    const timer = quickMoveTimers.current[commentIndex];
    if (!timer) return;
    clearTimeout(timer);
    quickMoveTimers.current[commentIndex] = null;
    execute(() => moveSingleComment(commentIndex, direction, false));
  };

  const cancelQuickMovePress = (event, commentIndex) => {
    event.stopPropagation();
    clearTimeout(quickMoveTimers.current[commentIndex]);
    quickMoveTimers.current[commentIndex] = null;
  };

  const startRangeSelection = () => {
    if (comments.length === 0) {
      setStatus("当前卡片没有评论");
      return;
    }
    const anchor = selectedIndices[0] ?? null;
    setRangePicking(true);
    setRangeAnchor(anchor);
    setStatus(anchor === null ? "请选择范围起点" : `范围起点 #${anchor}，再点一个终点`);
  };

  const openMergeDialog = () => {
    if (selectedIndices.length < 2) {
      setStatus("请至少选择 2 条评论");
      return;
    }
    if (!selectedCanMergeText) {
      setStatus("只能合并有文本内容的文本/HTML/链接类评论");
      return;
    }
    const text = selectedComments.map(commentText).filter(Boolean).join("\n\n");
    setDialog({
      title: "合并文本评论",
      body: "将选中的文本内容合并为一条新的 Markdown 评论，原评论会被删除。",
      inputLabel: "合并后的内容",
      inputValue: text,
      confirmText: "确认合并",
      onConfirm: async (value) => {
        setDialog(null);
        await runCommand("mergeTextComments", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
          text: value,
          markdown: true,
        }, { message: "已合并评论" });
      },
    });
  };

  const openEditDialog = () => {
    if (selectedIndices.length !== 1) {
      setStatus("编辑需要且只能选择 1 条评论");
      return;
    }
    const index = selectedIndices[0];
    const current = commentByIndex.get(index);
    if (!canComment(current, "canEditText")) {
      setStatus(`#${index} ${getTypeMeta(current).label} 不支持文本编辑`);
      return;
    }
    setDialog({
      title: `编辑 #${index}`,
      body: "只修改当前评论文本，不维护反向链接。",
      inputLabel: "评论内容",
      inputValue: commentText(current),
      confirmText: "保存",
      onConfirm: async (value) => {
        setDialog(null);
        await runCommand("editCommentText", {
          noteId: snapshot.noteId,
          index,
          text: value,
          markdown: !!current?.capabilities?.isMarkdown,
        }, { message: "已更新评论" });
      },
    });
  };

  const openExtractDialog = () => {
    if (!requireSelection()) return;
    setDialog({
      title: "原样提取为子卡片",
      body: "将克隆当前卡片并只保留选中的评论，HTML 样式、手写、图片、音频等原生评论数据会尽量保留；原卡片不会被删改。",
      inputLabel: "新卡片标题",
      inputValue: `提取自 ${snapshot.noteTitle || "当前卡片"}`,
      confirmText: "原样提取",
      onConfirm: async (value) => {
        setDialog(null);
        await runCommand("extractCommentsToChildNote", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
          title: value,
        }, { message: "已创建子卡片" });
      },
    });
  };

  const copySelectedText = async () => {
    if (!requireSelection()) return;
    const text = selectedComments.filter((comment) => canComment(comment, "canCopyText")).map(commentText).filter(Boolean).join("\n\n");
    if (!text) {
      setStatus("选中评论没有可复制文本");
      return;
    }
    await runCommand("copyText", { text }, { message: "已复制文本", keepSelection: true });
  };

  const copySelectedImage = async () => {
    if (!hasOneSelection) {
      setStatus("复制图片需要且只能选择 1 条图片评论");
      return;
    }
    const current = selectedComments[0];
    if (!canComment(current, "canCopyImage")) {
      setStatus(`#${current?.index ?? ""} 没有可复制图片`);
      return;
    }
    await runCommand("copyCommentImage", {
      noteId: snapshot.noteId,
      index: current.index,
    }, { message: "已复制图片", keepSelection: true });
  };

  const focusSelectedLink = async () => {
    if (!hasOneSelection) {
      setStatus("定位链接需要且只能选择 1 条卡片链接评论");
      return;
    }
    const current = selectedComments[0];
    if (!canComment(current, "canFocusLink")) {
      setStatus(`#${current?.index ?? ""} 不是纯卡片链接`);
      return;
    }
    await runCommand("focusLinkedNote", { noteId: current.linkedNoteId }, { message: "已定位链接卡片", keepSelection: true });
  };

  const scrollToComment = (index) => {
    document.getElementById(`comment-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="comment-manager">
      <header className="topbar">
        <div>
          <h1>MN Comment Manager</h1>
          <p>{snapshot.noteTitle || "未选择卡片"}</p>
        </div>
        <div className="topbar-actions">
          <Button className="secondary" onClick={loadCurrentNote} disabled={loading}>刷新</Button>
          <Button className="secondary" onClick={() => MNBridge.send("closePanel")}>关闭</Button>
        </div>
      </header>

      <div className="statusbar" aria-live="polite">
        <span>评论 {comments.length}</span>
        <span>已选 {selectedIndices.length}</span>
        <span>显示 {visibleComments.length}</span>
        <span>{status}</span>
      </div>

      <main className="workspace">
        <aside className="left-pane">
          <section className="pane-section">
            <h2>筛选</h2>
            <label className="search-box">
              <span>搜索</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="文本 / 类型 / 标题"
              />
            </label>
            <div className="segmented">
              {FILTERS.map((item) => (
                <Button
                  key={item.key}
                  className={filter === item.key ? "active" : ""}
                  onClick={() => setFilter(item.key)}
                >
                  <span>{item.label}</span>
                  <b>{filterCounts[item.key] || 0}</b>
                </Button>
              ))}
            </div>
          </section>

          <section className="pane-section">
            <h2>选择</h2>
            <div className="button-grid">
              <Button className="secondary" disabled={comments.length === 0} onClick={() => setSelected(new Set(visibleComments.map((comment) => comment.index)))}>全选</Button>
              <Button className="secondary" disabled={comments.length === 0} onClick={() => setSelected((prev) => new Set(visibleComments.map((comment) => comment.index).filter((index) => !prev.has(index))))}>反选</Button>
              <Button className="secondary" disabled={!hasSelection} onClick={() => setSelected(new Set())}>清空</Button>
              <Button className={rangePicking ? "active" : "secondary"} disabled={comments.length === 0} onClick={startRangeSelection}>范围</Button>
            </div>
            <p className="helper-text">
              {rangePicking ? (rangeAnchor === null ? "点一条评论作为起点" : `起点 #${rangeAnchor}，点终点完成`) : "筛选后全选/反选只作用于当前显示项"}
            </p>
          </section>

          <section className="pane-section">
            <h2>字段目录</h2>
            <Button className="nav-item" disabled={comments.length === 0} onClick={() => scrollToComment(comments[0]?.index ?? 0)}>顶部</Button>
            {fieldGroups.map((field) => (
              <Button
                key={field.id}
                className="nav-item"
                onClick={() => scrollToComment(field.anchorIndex)}
              >
                <span>{field.name}</span>
                <b>{field.comments.length}</b>
              </Button>
            ))}
          </section>
        </aside>

        <section className="comment-list" aria-label="评论列表">
          {visibleComments.length === 0 ? (
            <div className="empty">暂无评论数据</div>
          ) : visibleComments.map((comment, visiblePosition) => {
            const meta = getTypeMeta(comment);
            const selectedNow = selected.has(comment.index);
            const imageSrc = normalizeImageSource(comment);
            const commentPosition = getCommentPosition(comment.index);
            const isFirstComment = commentPosition === 0;
            const isLastComment = commentPosition >= comments.length - 1;
            return (
              <div className="comment-row" key={comment.index}>
                {insertMode && !selectedNow ? (
                  <Button className="insert-target" disabled={loading || !hasSelection} onClick={() => moveSelection(comment.index)}>
                    移动到 #{comment.index} 前
                  </Button>
                ) : null}
                <article
                  id={`comment-${comment.index}`}
                  className={`comment-card ${selectedNow ? "selected" : ""} ${rangeAnchor === comment.index ? "range-anchor" : ""}`}
                  onClick={() => handleCommentClick(comment.index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCommentClick(comment.index);
                    }
                  }}
                >
                  <div className="comment-head">
                    <input
                      type="checkbox"
                      checked={selectedNow}
                      aria-label={`选择评论 #${comment.index}`}
                      onChange={() => {}}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleIndex(comment.index);
                      }}
                    />
                    <span className="comment-index">#{comment.index}</span>
                    <span className={`type-pill type-${meta.filter}`}>{meta.label}</span>
                    <span className="stage-pill">{getStageLabel(comment)}</span>
                    {comment.linkDirection ? (
                      <span className={`direction-pill direction-${comment.linkDirection}`}>
                        {LINK_DIRECTION_LABELS[comment.linkDirection] || comment.linkDirection}
                      </span>
                    ) : null}
                    <span className="comment-position">{visiblePosition + 1}/{visibleComments.length}</span>
                    {comment.linkedNoteTitle ? (
                      <Button
                        className="text-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          return runCommand("focusLinkedNote", { noteId: comment.linkedNoteId }, { message: "已定位链接卡片", keepSelection: true });
                        }}
                      >
                        定位
                      </Button>
                    ) : null}
                    <div className="comment-inline-actions" aria-label={`评论 #${comment.index} 快捷操作`}>
                      <button
                        type="button"
                        className="quick-action-btn"
                        disabled={loading || isFirstComment}
                        title="单击上移，长按置顶"
                        onPointerDown={(event) => startQuickMovePress(event, comment.index, "up")}
                        onPointerUp={(event) => finishQuickMovePress(event, comment.index, "up")}
                        onPointerLeave={(event) => cancelQuickMovePress(event, comment.index)}
                        onPointerCancel={(event) => cancelQuickMovePress(event, comment.index)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="quick-action-btn"
                        disabled={loading || isLastComment}
                        title="单击下移，长按置底"
                        onPointerDown={(event) => startQuickMovePress(event, comment.index, "down")}
                        onPointerUp={(event) => finishQuickMovePress(event, comment.index, "down")}
                        onPointerLeave={(event) => cancelQuickMovePress(event, comment.index)}
                        onPointerCancel={(event) => cancelQuickMovePress(event, comment.index)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="quick-action-btn danger"
                        disabled={loading}
                        title="删除这条评论"
                        onClick={(event) => {
                          event.stopPropagation();
                          execute(() => deleteSingleComment(comment.index));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="comment-body">
                    {imageSrc ? <img src={imageSrc} alt={`评论 #${comment.index}`} /> : null}
                    {commentText(comment) ? (
                      <pre>{clampText(commentText(comment))}</pre>
                    ) : comment.capabilities?.hasImage ? (
                      <p className="no-text">图片/手写评论</p>
                    ) : comment.capabilities?.hasAudio ? (
                      <p className="no-text">音频评论</p>
                    ) : (
                      <p className="no-text">无文本内容</p>
                    )}
                    {comment.linkedNoteTitle ? <p className="linked-title">{comment.linkedNoteTitle}</p> : null}
                  </div>
                </article>
              </div>
            );
          })}
          {insertMode && visibleComments.length > 0 ? (
            <Button className="insert-end" disabled={loading || !hasSelection} onClick={() => moveSelection(comments.length)}>移动到底部</Button>
          ) : null}
        </section>

        <aside className="right-pane">
          <section className="pane-section selection-summary">
            <h2>当前选择</h2>
            <p>{hasSelection ? `${getSelectionHint(selectedComments)}：${selectedIndices.map((index) => `#${index}`).join(" ")}` : "未选择评论"}</p>
          </section>

          <section className="pane-section">
            <h2>移动</h2>
            <div className="button-grid">
              <Button onClick={() => moveSelection(0)} disabled={loading || !hasSelection}>置顶</Button>
              <Button onClick={() => moveByStep("up")} disabled={loading || !selectionIsContinuous}>上移</Button>
              <Button onClick={() => moveByStep("down")} disabled={loading || !selectionIsContinuous}>下移</Button>
              <Button onClick={() => moveSelection(comments.length)} disabled={loading || !hasSelection}>置底</Button>
            </div>
            <Button className={insertMode ? "active wide" : "secondary wide"} disabled={!hasSelection} onClick={() => setInsertMode((value) => !value)}>插入位置</Button>
          </section>

          <section className="pane-section">
            <h2>编辑</h2>
            <div className="stack">
              <Button className="secondary" disabled={loading || !selectedCanCopyText} onClick={copySelectedText}>复制文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanCopyImage} onClick={copySelectedImage}>复制图片</Button>
              <Button className="secondary" disabled={loading || !selectedCanEditText} onClick={openEditDialog}>编辑文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanMergeText} onClick={openMergeDialog}>合并文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanFocusLink} onClick={focusSelectedLink}>定位链接</Button>
              <Button className="secondary" disabled={loading || !hasSelection} onClick={openExtractDialog}>原样提取</Button>
            </div>
          </section>

          <section className="pane-section danger-zone">
            <h2>删除</h2>
            <button
              type="button"
              className={deletePressing ? "danger wide pressing" : "danger wide"}
              onPointerDown={startDeletePress}
              onPointerUp={endDeletePress}
              onPointerLeave={cancelDeletePress}
              onPointerCancel={cancelDeletePress}
              disabled={loading || !hasSelection}
              title="单击普通删除，长按触发双向删除确认"
            >
              删除
            </button>
            <p>单击普通删除。长按 0.56 秒后进入双向删除确认，只处理纯卡片链接。</p>
          </section>
        </aside>
      </main>

      {dialog ? (
        <Dialog dialog={dialog} loading={loading} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function Dialog({ dialog, loading, onClose }) {
  const [value, setValue] = useState(dialog.inputValue || "");

  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        Promise.resolve(dialog.onConfirm(value)).catch(() => {});
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog, onClose, value]);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>
        {dialog.inputLabel ? (
          <label>
            <span>{dialog.inputLabel}</span>
            <textarea value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
          </label>
        ) : null}
        <div className="dialog-actions">
          <Button className="secondary" disabled={loading} onClick={onClose}>取消</Button>
          <Button
            className={dialog.danger ? "danger" : ""}
            disabled={loading}
            onClick={() => dialog.onConfirm(value)}
          >
            {dialog.confirmText || "确认"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default App;
