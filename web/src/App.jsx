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
  imageCommentWithDrawing: { label: "图片+手写", filter: "image" },
  drawingComment: { label: "手写", filter: "image" },
  mergedImageComment: { label: "合并图片", filter: "image" },
  mergedImageCommentWithDrawing: { label: "合并图片+手写", filter: "image" },
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

const LINK_DIRECTION_LABELS = {
  both: "双向",
  "one-way": "单向",
};

const INLINE_MERGE_TYPES = new Set([
  "textComment",
  "markdownComment",
  "markdownLinkComment",
  "tagComment",
  "linkComment",
  "summaryComment",
  "mergedTextComment",
]);

const LINK_FOCUS_LONG_PRESS_MS = 520;

function getTypeMeta(comment) {
  return TYPE_META[comment?.type] || TYPE_META.unknownComment;
}

function normalizeError(error) {
  if (!error) return "操作失败，请重试";
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

function getSelectionHint(comments) {
  if (comments.length === 0) return "尚未选择";
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

function isPureMarginNoteLinkText(text) {
  return /^marginnote\d*(?:app)?:\/\/note\/[^\s]+$/i.test(String(text || "").trim());
}

function escapeMarkdownLinkText(text) {
  return String(text || "").replace(/\]/g, "\\]");
}

function escapeMarkdownLinkUrl(url) {
  return String(url || "").replace(/\)/g, "%29").trim();
}

function splitListMarkerForInlineLink(text) {
  const rawText = String(text || "");
  const match = rawText.match(/^(\s*-\s+)(\S[\s\S]*)$/);
  if (!match) return { prefix: "", text: rawText };
  return { prefix: match[1], text: match[2] };
}

function makeMarkdownInlineLink(text, url) {
  const material = splitListMarkerForInlineLink(text);
  const displayText = escapeMarkdownLinkText(material.text || "链接");
  return `${material.prefix}[${displayText}](${escapeMarkdownLinkUrl(url)})`;
}

function getInlineMergeLinkUrl(comment) {
  const text = commentText(comment).trim();
  if (comment?.linkedNoteUrl) return comment.linkedNoteUrl;
  if (isPureMarginNoteLinkText(text)) return text;
  return "";
}

function getLinkedNoteDisplay(comment) {
  if (!canComment(comment, "canFocusLink")) return null;
  const rawText = commentText(comment).trim();
  const url = comment?.linkedNoteUrl || (isPureMarginNoteLinkText(rawText) ? rawText : "");
  const title = String(comment?.linkedNoteTitle || "").trim();
  if (!title && !url) return null;
  return {
    title: title || "未命名卡片",
    url,
  };
}

function canInlineMergeComment(comment) {
  if (!comment || !canComment(comment, "canCopyText")) return false;
  return INLINE_MERGE_TYPES.has(comment.type);
}

function buildInlineMergeMaterial(comment, order) {
  const text = commentText(comment);
  const linkUrl = getInlineMergeLinkUrl(comment);
  const isLink = !!linkUrl && (comment.type === "linkComment" || comment.type === "summaryComment");
  return {
    index: comment.index,
    order,
    kind: isLink ? "link" : "text",
    label: isLink ? "链接" : getTypeMeta(comment).label,
    text,
    linkUrl: linkUrl || text,
    defaultText: isLink ? (linkUrl || text) : text,
  };
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
        name: commentText(comment).replace(/<[^>]*>/g, "").trim() || "字段标题",
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

function Button({ children, className = "", disabled = false, onClick, title, type = "button", ...props }) {
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
    <button type={type} className={className} disabled={disabled} onClick={handleClick} title={title} {...props}>
      {children}
    </button>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(() => makeEmptySnapshot());
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("正在读取当前卡片...");
  const [statusKey, setStatusKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rangePicking, setRangePicking] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState(null);
  const [insertMode, setInsertMode] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [deletePressing, setDeletePressing] = useState(false);
  const [singleDeletePressing, setSingleDeletePressing] = useState(null);
  const deleteTimer = useRef(null);
  const deleteLongPressFired = useRef(false);
  const singleDeleteTimer = useRef(null);
  const singleDeleteLongPressFired = useRef(false);
  const didInitialLoad = useRef(false);
  const quickMoveTimers = useRef({});
  const linkFocusTimers = useRef({});
  const linkFocusLongPressFired = useRef({});
  const selectedLinkFocusTimer = useRef(null);
  const selectedLinkFocusLongPressFired = useRef(false);
  const [selectedLinkPressing, setSelectedLinkPressing] = useState(false);

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
  const selectedCanInlineMerge = hasMultiSelection
    && selectionIsContinuous
    && selectedComments.every(canInlineMergeComment)
    && selectedComments.some((comment) => getInlineMergeLinkUrl(comment));

  const notifyStatus = (message) => {
    setStatus(message);
    setStatusKey((current) => current + 1);
  };

  const applySnapshot = (nextSnapshot, message = "") => {
    setSnapshot(nextSnapshot || makeEmptySnapshot());
    setSelected(new Set());
    setRangePicking(false);
    setRangeAnchor(null);
    setInsertMode(false);
    notifyStatus(message || (nextSnapshot?.error ? nextSnapshot.error : "当前卡片已更新"));
  };

  const runCommand = async (command, payload, options = {}) => {
    const { message = "已完成", keepSelection = false } = options;
    setLoading(true);
    try {
      const result = await MNBridge.send(command, payload);
      if (result?.snapshot) {
        applySnapshot(result.snapshot, message);
      } else if (result?.comments) {
        applySnapshot(result, message);
      } else if (!keepSelection) {
        notifyStatus(message);
      }
      return result;
    } catch (error) {
      notifyStatus(normalizeError(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentNote = async () => {
    try {
      await runCommand("getCurrentNoteComments", null, { message: "当前卡片已刷新" });
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
      clearSingleDeleteTimer();
      if (selectedLinkFocusTimer.current) {
        clearTimeout(selectedLinkFocusTimer.current);
        selectedLinkFocusTimer.current = null;
      }
      Object.values(quickMoveTimers.current).forEach((timer) => clearTimeout(timer));
      Object.values(linkFocusTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    window.__MNCommentManagerNativeSync = (rawPayload) => {
      try {
        const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        if (!payload?.snapshot) return;
        applySnapshot(payload.snapshot, payload.snapshot.error ? payload.snapshot.error : "已切换到当前卡片");
      } catch (error) {
        notifyStatus(normalizeError(error));
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
        notifyStatus(`范围起点为 #${index}，再选择终点`);
        return;
      }
      const start = Math.min(rangeAnchor, index);
      const end = Math.max(rangeAnchor, index);
      setSelection(allIndices.filter((item) => item >= start && item <= end));
      setRangePicking(false);
      setRangeAnchor(null);
      notifyStatus(`已选中 #${start} 到 #${end}`);
      return;
    }
    toggleIndex(index);
  };

  const requireSelection = () => {
    if (selectedIndices.length === 0) {
      notifyStatus("先选择要处理的评论");
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
    }, { message: "评论位置已更新" });
  };

  const getCommentPosition = (index) => comments.findIndex((comment) => comment.index === index);

  const moveSingleComment = async (commentIndex, direction, toEdge = false) => {
    const position = getCommentPosition(commentIndex);
    if (position < 0) {
      notifyStatus("这条评论已不存在，请刷新后再试");
      return;
    }

    if (direction === "up") {
      if (position === 0) {
        notifyStatus("已在最上方");
        return;
      }
      const targetIndex = toEdge ? 0 : comments[position - 1].index;
      await runCommand("moveComments", {
        noteId: snapshot.noteId,
        indices: [commentIndex],
        targetIndex,
      }, { message: toEdge ? "已移到最上方" : "已上移一位" });
      return;
    }

    if (position >= comments.length - 1) {
      notifyStatus("已在最下方");
      return;
    }
    const afterNext = comments[position + 2];
    const targetIndex = toEdge || !afterNext ? comments.length : afterNext.index;
    await runCommand("moveComments", {
      noteId: snapshot.noteId,
      indices: [commentIndex],
      targetIndex,
    }, { message: toEdge ? "已移到最下方" : "已下移一位" });
  };

  const deleteSingleComment = async (commentIndex) => {
    await runCommand("deleteComments", {
      noteId: snapshot.noteId,
      indices: [commentIndex],
    }, { message: "评论已删除" });
  };

  const moveByStep = async (direction) => {
    if (!requireSelection()) return;
    const first = selectedIndices[0];
    const last = selectedIndices[selectedIndices.length - 1];
    const expected = last - first + 1;
    if (expected !== selectedIndices.length) {
      notifyStatus("批量上移/下移需要选择连续评论");
      return;
    }
    if (direction === "up") {
      if (first === 0) {
        notifyStatus("已在最上方");
        return;
      }
      await moveSelection(first - 1);
      return;
    }
    if (last >= comments.length - 1) {
      notifyStatus("已在最下方");
      return;
    }
    await moveSelection(last + 2);
  };

  const deleteSelection = async () => {
    if (!requireSelection()) return;
    await runCommand("deleteComments", {
      noteId: snapshot.noteId,
      indices: selectedIndices,
    }, { message: "所选评论已删除" });
  };

  const confirmBidirectionalDelete = async () => {
    if (!requireSelection()) return;
    if (!selectedCanBidirectionalDelete) {
      notifyStatus("双向删除只适用于纯卡片链接评论");
      return;
    }
    try {
      const result = await runCommand("countReverseLinks", {
        noteId: snapshot.noteId,
        indices: selectedIndices,
      }, { keepSelection: true });
      const reverseCount = result?.reverseCount || 0;
      setDialog({
        title: "删除双向链接",
        body: `将删除当前卡片中的 ${selectedIndices.length} 条链接评论，并同步删除目标卡片中的 ${reverseCount} 条反向链接。Markdown 文本里的行内链接不会被改动。`,
        confirmText: "确认双向删除",
        danger: true,
        onConfirm: async () => {
          setDialog(null);
          await runCommand("deleteBidirectionalLinks", {
            noteId: snapshot.noteId,
            indices: selectedIndices,
          }, { message: "双向链接已删除" });
        },
      });
    } catch (_) {
      // status has been set
    }
  };

  const confirmSingleBidirectionalDelete = async (commentIndex) => {
    const comment = commentByIndex.get(commentIndex);
    if (!canComment(comment, "canBidirectionalDelete")) {
      notifyStatus("双向删除只适用于纯卡片链接评论");
      return;
    }
    try {
      const result = await runCommand("countReverseLinks", {
        noteId: snapshot.noteId,
        indices: [commentIndex],
      }, { keepSelection: true });
      const reverseCount = result?.reverseCount || 0;
      setDialog({
        title: "删除双向链接",
        body: `将删除当前卡片中的 #${commentIndex} 链接评论，并同步删除目标卡片中的 ${reverseCount} 条反向链接。Markdown 文本里的行内链接不会被改动。`,
        confirmText: "确认双向删除",
        danger: true,
        onConfirm: async () => {
          setDialog(null);
          await runCommand("deleteBidirectionalLinks", {
            noteId: snapshot.noteId,
            indices: [commentIndex],
          }, { message: "双向链接已删除" });
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

  function clearSingleDeleteTimer() {
    if (singleDeleteTimer.current) {
      clearTimeout(singleDeleteTimer.current);
      singleDeleteTimer.current = null;
    }
  }

  function clearSingleDeletePress() {
    clearSingleDeleteTimer();
    setSingleDeletePressing(null);
  }

  const startDeletePress = () => {
    if (loading || !hasSelection) {
      notifyStatus("先选择要删除的评论");
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

  const startSingleDeletePress = (event, commentIndex) => {
    event.stopPropagation();
    if (loading) return;
    clearSingleDeletePress();
    singleDeleteLongPressFired.current = false;
    setSingleDeletePressing(commentIndex);
    singleDeleteTimer.current = setTimeout(() => {
      singleDeleteLongPressFired.current = true;
      clearSingleDeletePress();
      execute(() => confirmSingleBidirectionalDelete(commentIndex));
    }, 560);
  };

  const endSingleDeletePress = (event, commentIndex) => {
    event.stopPropagation();
    const fired = singleDeleteLongPressFired.current;
    clearSingleDeletePress();
    if (!fired) execute(() => deleteSingleComment(commentIndex));
  };

  const cancelSingleDeletePress = (event) => {
    event.stopPropagation();
    singleDeleteLongPressFired.current = true;
    clearSingleDeletePress();
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

  const locateLinkedNote = async (noteId, mode = "mindmap") => {
    if (!noteId) {
      notifyStatus("没有找到目标卡片");
      return;
    }
    await runCommand("focusLinkedNote", { noteId, mode }, {
      message: mode === "float" ? "已在浮窗定位目标卡片" : "已定位目标卡片",
      keepSelection: true,
    });
  };

  const startInlineLinkFocusPress = (event, comment) => {
    event.stopPropagation();
    if (loading || !canComment(comment, "canFocusLink")) return;
    const key = comment.index;
    clearTimeout(linkFocusTimers.current[key]);
    linkFocusLongPressFired.current[key] = false;
    linkFocusTimers.current[key] = setTimeout(() => {
      linkFocusLongPressFired.current[key] = true;
      linkFocusTimers.current[key] = null;
      execute(() => locateLinkedNote(comment.linkedNoteId, "float"));
    }, LINK_FOCUS_LONG_PRESS_MS);
  };

  const finishInlineLinkFocusPress = (event, comment) => {
    event.stopPropagation();
    const key = comment.index;
    const timer = linkFocusTimers.current[key];
    if (timer) {
      clearTimeout(timer);
      linkFocusTimers.current[key] = null;
    }
    if (linkFocusLongPressFired.current[key]) {
      linkFocusLongPressFired.current[key] = false;
      return;
    }
    execute(() => locateLinkedNote(comment.linkedNoteId, "mindmap"));
  };

  const cancelInlineLinkFocusPress = (event, commentIndex) => {
    event.stopPropagation();
    clearTimeout(linkFocusTimers.current[commentIndex]);
    linkFocusTimers.current[commentIndex] = null;
    linkFocusLongPressFired.current[commentIndex] = false;
  };

  function clearSelectedLinkFocusPress() {
    if (selectedLinkFocusTimer.current) {
      clearTimeout(selectedLinkFocusTimer.current);
      selectedLinkFocusTimer.current = null;
    }
    setSelectedLinkPressing(false);
  }

  const startSelectedLinkFocusPress = () => {
    if (loading || !selectedCanFocusLink) {
      notifyStatus("定位链接时只能选择 1 条卡片链接评论");
      return;
    }
    clearSelectedLinkFocusPress();
    selectedLinkFocusLongPressFired.current = false;
    setSelectedLinkPressing(true);
    selectedLinkFocusTimer.current = setTimeout(() => {
      selectedLinkFocusLongPressFired.current = true;
      clearSelectedLinkFocusPress();
      execute(() => focusSelectedLink("float"));
    }, LINK_FOCUS_LONG_PRESS_MS);
  };

  const endSelectedLinkFocusPress = () => {
    const fired = selectedLinkFocusLongPressFired.current;
    clearSelectedLinkFocusPress();
    if (!fired) execute(() => focusSelectedLink("mindmap"));
  };

  const cancelSelectedLinkFocusPress = () => {
    selectedLinkFocusLongPressFired.current = true;
    clearSelectedLinkFocusPress();
  };

  const startRangeSelection = () => {
    if (comments.length === 0) {
      notifyStatus("当前卡片还没有评论");
      return;
    }
    const anchor = selectedIndices[0] ?? null;
    setRangePicking(true);
    setRangeAnchor(anchor);
    notifyStatus(anchor === null ? "选择第一条评论作为范围起点" : `起点为 #${anchor}，再选择终点`);
  };

  const openMergeDialog = () => {
    if (selectedIndices.length < 2) {
      notifyStatus("至少选择 2 条评论才能合并");
      return;
    }
    if (!selectedCanMergeText) {
      notifyStatus("只能合并带文本的评论");
      return;
    }
    const text = selectedComments.map(commentText).filter(Boolean).join("\n\n");
    setDialog({
      title: "合并为一条评论",
      body: "所选文本会合并成一条新的 Markdown 评论，原评论会被移除。",
      inputLabel: "合并后的内容",
      inputValue: text,
      confirmText: "合并",
      onConfirm: async (value) => {
        setDialog(null);
        await runCommand("mergeTextComments", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
          text: value,
          markdown: true,
        }, { message: "评论已合并" });
      },
    });
  };

  const openInlineMergeDialog = () => {
    if (selectedIndices.length < 2) {
      notifyStatus("至少选择 2 条评论才能合并");
      return;
    }
    if (!selectionIsContinuous) {
      notifyStatus("行内链接合并需要选择连续评论");
      return;
    }
    const unsupported = selectedComments.find((comment) => !canInlineMergeComment(comment));
    if (unsupported) {
      notifyStatus(`#${unsupported.index} 不是可合并的文本或链接评论`);
      return;
    }
    if (!selectedComments.some((comment) => getInlineMergeLinkUrl(comment))) {
      notifyStatus("至少包含 1 条纯卡片链接评论");
      return;
    }
    setDialog({
      kind: "inlineMerge",
      title: "合并为行内链接",
      body: "把连续选择的文本和卡片链接整理成一条 Markdown 评论，原评论会被移除。",
      materials: selectedComments.map((comment, order) => buildInlineMergeMaterial(comment, order)),
      indices: selectedIndices,
      confirmText: "合并",
      onConfirm: async (value) => {
        const text = String(value || "").trim();
        if (!text) {
          notifyStatus("请先填写合并后的内容");
          return;
        }
        setDialog(null);
        await runCommand("mergeTextComments", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
          text,
          markdown: true,
        }, { message: "行内链接已合并" });
      },
    });
  };

  const openEditDialog = () => {
    if (selectedIndices.length !== 1) {
      notifyStatus("编辑文本时只能选择 1 条评论");
      return;
    }
    const index = selectedIndices[0];
    const current = commentByIndex.get(index);
    if (!canComment(current, "canEditText")) {
      notifyStatus(`#${index} 不是可编辑的文本评论`);
      return;
    }
    setDialog({
      title: `编辑评论 #${index}`,
      body: "只修改这条评论的文本内容；如需维护卡片链接，请使用链接相关操作。",
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
        }, { message: "评论已更新" });
      },
    });
  };

  const openExtractDialog = () => {
    if (!requireSelection()) return;
    setDialog({
      title: "提取为子卡片",
      body: "将创建一个子卡片，只保留所选评论。原卡片不会被修改，图片、手写、音频等内容会尽量保留。",
      inputLabel: "新卡片标题",
      inputValue: `提取自 ${snapshot.noteTitle || "当前卡片"}`,
      confirmText: "创建子卡片",
      onConfirm: async (value) => {
        setDialog(null);
        await runCommand("extractCommentsToChildNote", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
          title: value,
        }, { message: "子卡片已创建" });
      },
    });
  };

  const copySelectedText = async () => {
    if (!requireSelection()) return;
    const text = selectedComments.filter((comment) => canComment(comment, "canCopyText")).map(commentText).filter(Boolean).join("\n\n");
    if (!text) {
      notifyStatus("所选评论没有可复制的文本");
      return;
    }
    await runCommand("copyText", { text }, { message: "文本已复制", keepSelection: true });
  };

  const copySelectedImage = async () => {
    if (!hasOneSelection) {
      notifyStatus("复制图片时只能选择 1 条图片评论");
      return;
    }
    const current = selectedComments[0];
    if (!canComment(current, "canCopyImage")) {
      notifyStatus(`#${current?.index ?? ""} 没有可复制的图片`);
      return;
    }
    await runCommand("copyCommentImage", {
      noteId: snapshot.noteId,
      index: current.index,
    }, { message: "图片已复制", keepSelection: true });
  };

  const focusSelectedLink = async (mode = "mindmap") => {
    if (!hasOneSelection) {
      notifyStatus("定位链接时只能选择 1 条卡片链接评论");
      return;
    }
    const current = selectedComments[0];
    if (!canComment(current, "canFocusLink")) {
      notifyStatus(`#${current?.index ?? ""} 不是可定位的卡片链接`);
      return;
    }
    await locateLinkedNote(current.linkedNoteId, mode);
  };

  const scrollToComment = (index) => {
    document.getElementById(`comment-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="comment-manager">
      <header className="topbar">
        <div>
          <h1>评论管理器</h1>
          <p title={snapshot.noteTitle}>{snapshot.noteTitle || "当前没有选中的卡片"}</p>
        </div>
        <div className="topbar-actions">
          <Button className="secondary" onClick={loadCurrentNote} disabled={loading}>刷新</Button>
          <Button className="secondary" onClick={() => MNBridge.send("closePanel")}>关闭</Button>
        </div>
      </header>

      <div className="statusbar" aria-live="polite">
        <span>共 {comments.length} 条</span>
        <span>已选 {selectedIndices.length} 条</span>
        <span>当前显示 {visibleComments.length} 条</span>
        <span key={statusKey} className="status-message updated">{status}</span>
      </div>

      <main className="workspace">
        <aside className="left-pane">
          <section className="pane-section">
            <h2>查找</h2>
            <label className="search-box">
              <span>搜索</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索文本、类型或目标卡片"
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
            <h2>批量选择</h2>
            <div className="button-grid">
              <Button className="secondary" disabled={comments.length === 0} onClick={() => setSelected(new Set(visibleComments.map((comment) => comment.index)))}>全选</Button>
              <Button className="secondary" disabled={comments.length === 0} onClick={() => setSelected((prev) => new Set(visibleComments.map((comment) => comment.index).filter((index) => !prev.has(index))))}>反选</Button>
              <Button className="secondary" disabled={!hasSelection} onClick={() => setSelected(new Set())}>取消选择</Button>
              <Button className={rangePicking ? "active" : "secondary"} disabled={comments.length === 0} onClick={startRangeSelection}>选范围</Button>
            </div>
            <p className="helper-text">
              {rangePicking ? (rangeAnchor === null ? "先点范围的第一条评论" : `起点 #${rangeAnchor}，再点最后一条`) : "全选和反选只作用于当前显示结果"}
            </p>
          </section>

          <section className="pane-section">
            <h2>快速定位</h2>
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
            <Button className="nav-item" disabled={comments.length === 0} onClick={() => scrollToComment(comments[comments.length - 1]?.index ?? 0)}>底部</Button>
          </section>
        </aside>

        <section className="comment-list" aria-label="评论列表">
          {visibleComments.length === 0 ? (
            <div className="empty">{comments.length === 0 ? "当前卡片还没有评论" : "没有匹配的评论"}</div>
          ) : visibleComments.map((comment, visiblePosition) => {
            const meta = getTypeMeta(comment);
            const selectedNow = selected.has(comment.index);
            const imageSrc = normalizeImageSource(comment);
            const linkedDisplay = getLinkedNoteDisplay(comment);
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
                    {comment.linkDirection ? (
                      <span className={`direction-pill direction-${comment.linkDirection}`}>
                        {LINK_DIRECTION_LABELS[comment.linkDirection] || comment.linkDirection}
                      </span>
                    ) : null}
                    <span className="comment-position">{visiblePosition + 1}/{visibleComments.length}</span>
                    <div className="comment-inline-actions" aria-label={`评论 #${comment.index} 快捷操作`}>
                      {linkedDisplay ? (
                        <Button
                          className="quick-action-btn locate-action"
                          title="点按定位，按住在浮窗定位"
                          onPointerDown={(event) => startInlineLinkFocusPress(event, comment)}
                          onPointerUp={(event) => finishInlineLinkFocusPress(event, comment)}
                          onPointerLeave={(event) => cancelInlineLinkFocusPress(event, comment.index)}
                          onPointerCancel={(event) => cancelInlineLinkFocusPress(event, comment.index)}
                          onClick={(event) => event.stopPropagation()}
                          onContextMenu={(event) => event.preventDefault()}
                          disabled={loading}
                          aria-label={`定位链接卡片：${linkedDisplay.title}`}
                        >
                          ⌖
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        className="quick-action-btn"
                        disabled={loading || isFirstComment}
                        title="点按上移，按住移到最上方"
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
                        title="点按下移，按住移到最下方"
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
                        className={singleDeletePressing === comment.index ? "quick-action-btn danger pressing" : "quick-action-btn danger"}
                        disabled={loading}
                        title="点按删除这条评论；按住可同时清理反向链接"
                        onPointerDown={(event) => startSingleDeletePress(event, comment.index)}
                        onPointerUp={(event) => endSingleDeletePress(event, comment.index)}
                        onPointerLeave={cancelSingleDeletePress}
                        onPointerCancel={cancelSingleDeletePress}
                        onClick={(event) => event.stopPropagation()}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="comment-body">
                    {imageSrc ? <img src={imageSrc} alt={`评论 #${comment.index}`} loading="lazy" /> : null}
                    {linkedDisplay ? (
                      <div className="link-summary">
                        <p className="link-summary-title">{linkedDisplay.title}</p>
                        {linkedDisplay.url ? <p className="link-summary-url">{linkedDisplay.url}</p> : null}
                      </div>
                    ) : commentText(comment) ? (
                      <pre>{clampText(commentText(comment))}</pre>
                    ) : comment.capabilities?.hasImage ? (
                      <p className="no-text">图片/手写评论</p>
                    ) : comment.capabilities?.hasAudio ? (
                      <p className="no-text">音频评论</p>
                    ) : (
                      <p className="no-text">无文本内容</p>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
          {insertMode && visibleComments.length > 0 ? (
            <Button className="insert-end" disabled={loading || !hasSelection} onClick={() => moveSelection(comments.length)}>移动到最后</Button>
          ) : null}
        </section>

        <aside className="right-pane">
          <section className="pane-section selection-summary">
            <h2>当前选择</h2>
            <p>{hasSelection ? `${getSelectionHint(selectedComments)}：${selectedIndices.map((index) => `#${index}`).join(" ")}` : "尚未选择"}</p>
          </section>

          <section className="pane-section">
            <h2>移动</h2>
            <div className="button-grid move-controls">
              <Button onClick={() => moveSelection(0)} disabled={loading || !hasSelection}>移到最上方</Button>
              <Button onClick={() => moveByStep("up")} disabled={loading || !selectionIsContinuous}>上移</Button>
              <Button onClick={() => moveByStep("down")} disabled={loading || !selectionIsContinuous}>下移</Button>
              <Button onClick={() => moveSelection(comments.length)} disabled={loading || !hasSelection}>移到最下方</Button>
            </div>
            <Button className={insertMode ? "active wide" : "secondary wide"} disabled={!hasSelection} onClick={() => setInsertMode((value) => !value)}>选择插入位置</Button>
          </section>

          <section className="pane-section">
            <h2>处理</h2>
            <div className="stack">
              <Button className="secondary" disabled={loading || !selectedCanCopyText} onClick={copySelectedText}>复制文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanCopyImage} onClick={copySelectedImage}>复制图片</Button>
              <Button className="secondary" disabled={loading || !selectedCanEditText} onClick={openEditDialog}>编辑文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanMergeText} onClick={openMergeDialog}>合并文本</Button>
              <Button className="secondary" disabled={loading || !selectedCanInlineMerge} onClick={openInlineMergeDialog}>生成行内链接</Button>
              <button
                type="button"
                className={selectedLinkPressing ? "secondary pressing" : "secondary"}
                disabled={loading || !selectedCanFocusLink}
                title="点按定位链接卡片，按住在浮窗定位"
                onPointerDown={startSelectedLinkFocusPress}
                onPointerUp={endSelectedLinkFocusPress}
                onPointerLeave={cancelSelectedLinkFocusPress}
                onPointerCancel={cancelSelectedLinkFocusPress}
                onContextMenu={(event) => event.preventDefault()}
              >
                定位链接卡片
              </button>
              <Button className="secondary" disabled={loading || !hasSelection} onClick={openExtractDialog}>提取为子卡片</Button>
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
              title="点按只删除当前卡片评论；按住可同时清理反向链接"
            >
              删除
            </button>
            <p>点按只删除当前卡片中的所选评论。按住可进入双向链接删除确认，只处理纯卡片链接。</p>
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
  if (dialog.kind === "inlineMerge") {
    return <InlineMergeDialog dialog={dialog} loading={loading} onClose={onClose} />;
  }
  return <TextDialog dialog={dialog} loading={loading} onClose={onClose} />;
}

function TextDialog({ dialog, loading, onClose }) {
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
            className={dialog.danger ? "danger" : "primary"}
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

function InlineMergeDialog({ dialog, loading, onClose }) {
  const [builderText, setBuilderText] = useState("");
  const [builderLink, setBuilderLink] = useState("");
  const [cookingText, setCookingText] = useState("");
  const cookingRef = useRef(null);
  const materials = Array.isArray(dialog.materials) ? dialog.materials : [];

  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        Promise.resolve(dialog.onConfirm(cookingText)).catch(() => {});
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog, onClose, cookingText]);

  const focusCooking = () => {
    if (cookingRef.current) cookingRef.current.focus();
  };

  const insertAtCursor = (text) => {
    const textarea = cookingRef.current;
    const insertText = String(text || "");
    if (!textarea || !insertText) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    setCookingText((current) => {
      const next = current.slice(0, start) + insertText + current.slice(end);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + insertText.length;
        textarea.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  };

  const wrapCookingSelection = (url) => {
    const textarea = cookingRef.current;
    if (!textarea) return false;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    if (end <= start) return false;
    const selectedText = cookingText.slice(start, end);
    const inlineLink = makeMarkdownInlineLink(selectedText, url);
    const next = cookingText.slice(0, start) + inlineLink + cookingText.slice(end);
    setCookingText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + inlineLink.length;
      textarea.setSelectionRange(cursor, cursor);
    });
    return true;
  };

  const applyMaterial = (material) => {
    if (!material) return;
    if (material.kind === "link") {
      if (wrapCookingSelection(material.linkUrl)) return;
      setBuilderLink(material.linkUrl || "");
      return;
    }
    setBuilderText(material.text || "");
  };

  const appendMaterial = (material) => {
    if (!material) return;
    insertAtCursor(material.defaultText || material.text || material.linkUrl || "");
  };

  const insertBuilderText = () => {
    if (!builderText.trim()) return;
    insertAtCursor(builderText);
  };

  const insertBuilderLink = () => {
    const text = builderText.trim();
    const link = builderLink.trim();
    if (!text || !link) return;
    insertAtCursor(makeMarkdownInlineLink(text, link));
  };

  const canConfirm = cookingText.trim().length > 0 && materials.length >= 2 && !loading;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog inline-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>

        <section className="merge-section">
          <h3>已选内容</h3>
          <div className="merge-material-list">
            {materials.map((material) => (
              <button
                key={`${material.index}-${material.order}`}
                type="button"
                className="merge-material"
                title="点按填入下方输入框，双击直接加入最终内容"
                onClick={() => applyMaterial(material)}
                onDoubleClick={() => appendMaterial(material)}
              >
                <span className="merge-material-meta">#{material.index} · {material.label}</span>
                <span className="merge-material-content">{material.kind === "link" ? material.linkUrl : material.text}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="merge-section">
          <h3>组合链接</h3>
          <div className="merge-builder-row">
            <input value={builderText} onChange={(event) => setBuilderText(event.target.value)} placeholder="显示文本" />
            <input value={builderLink} onChange={(event) => setBuilderLink(event.target.value)} placeholder="链接地址" />
          </div>
          <div className="merge-actions">
            <Button className="secondary" disabled={!builderText.trim()} onClick={insertBuilderText}>插入文本</Button>
            <Button className="secondary" disabled={!builderText.trim() || !builderLink.trim()} onClick={insertBuilderLink}>插入行内链接</Button>
            <Button className="secondary" disabled={!builderText && !builderLink} onClick={() => {
              setBuilderText("");
              setBuilderLink("");
            }}>清空输入</Button>
          </div>
        </section>

        <section className="merge-section">
          <h3>最终内容</h3>
          <textarea
            ref={cookingRef}
            value={cookingText}
            onChange={(event) => setCookingText(event.target.value)}
            autoFocus
            spellCheck={false}
          />
          <div className="merge-actions">
            <Button className="secondary" disabled={!cookingText} onClick={() => {
              setCookingText("");
              focusCooking();
            }}>清空内容</Button>
          </div>
        </section>

        <div className="dialog-actions">
          <Button className="secondary" disabled={loading} onClick={onClose}>取消</Button>
          <Button className="primary" disabled={!canConfirm} onClick={() => dialog.onConfirm(cookingText)}>
            {dialog.confirmText || "合并"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default App;
