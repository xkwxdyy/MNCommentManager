import { memo, useEffect, useMemo, useRef, useState } from "react";
import MNBridge from "./lib/mnBridge";
import CommentTypeSelector from "./components/CommentTypeSelector";
import WorkflowParameters from "./components/WorkflowParameters";
import {
  getMoveState,
  getVirtualPositionForComment,
  makeContentSelection,
  selectionFromVirtualRange,
} from "./lib/contentSelection";
import { renderMarkdownToHtml } from "./lib/markdownRenderer";

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
  mergedImageComment: { label: "合并摘录", filter: "image" },
  mergedImageCommentWithDrawing: { label: "合并摘录+手写", filter: "image" },
  mergedChildMapComment: { label: "子脑图", filter: "other" },
  mergedTextComment: { label: "合并文本", filter: "text" },
  mergedMarkdownComment: { label: "合并 Markdown", filter: "text" },
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

const INVALID_LINK_CLEANUP_MODE_LABELS = {
  card: "纯卡片链接",
  markdown: "Markdown 行内链接",
  all: "全部失效链接",
};

const INLINE_MERGE_TYPES = new Set([
  "textComment",
  "markdownComment",
  "markdownLinkComment",
  "tagComment",
  "linkComment",
  "summaryComment",
  "mergedTextComment",
  "mergedMarkdownComment",
]);

const LINK_FOCUS_LONG_PRESS_MS = 520;

// Apple Pencil contact is reported as pointerType=pen or Touch.touchType=stylus.
// Keep finger/mouse timing unchanged, while giving Pencil a larger hold window
// so a slightly slow tap does not become a long press.
function getLongPressDelay(event, baseMs) {
  const pointerType = String(event?.pointerType || '').toLowerCase();
  const touch = (event?.touches && event.touches[0]) || (event?.changedTouches && event.changedTouches[0]);
  const touchType = String(touch?.touchType || '').toLowerCase();
  const isPencil = pointerType === 'pen' || pointerType === 'stylus' || touchType === 'stylus';
  return isPencil ? Math.min(Number(baseMs) + 220, 760) : Number(baseMs);
}

function getTypeMeta(comment) {
  if (comment?.type === "textComment" && comment?.capabilities?.isMarkdown) {
    return TYPE_META.markdownComment;
  }
  return TYPE_META[comment?.type] || TYPE_META.unknownComment;
}

function normalizeError(error) {
  if (!error) return "操作失败，请重试";
  if (typeof error === "string") return error;
  return error.message || JSON.stringify(error);
}

function nonNegativeCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function buildBatchExecutionFailure(result, workflow, getStepTitle) {
  const workflowSteps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  const resultSteps = Array.isArray(result?.stepResults) ? result.stepResults : [];
  const failedStep = result?.failedStep && typeof result.failedStep === "object" ? result.failedStep : {};
  const candidateIndex = Number(failedStep.index);
  const fallbackIndex = Math.max(0, Math.min(
    Math.max(workflowSteps.length - 1, 0),
    Math.max(resultSteps.length - 1, 0),
  ));
  const failedIndex = Number.isInteger(candidateIndex) && candidateIndex >= 0
    ? candidateIndex
    : fallbackIndex;
  const totalSteps = Math.max(workflowSteps.length, resultSteps.length, failedIndex + 1, 1);
  const failedDefinition = workflowSteps[failedIndex] || {};
  const resolvedTitle = typeof getStepTitle === "function" ? getStepTitle(failedDefinition) : "";
  const details = failedStep.result && typeof failedStep.result === "object" ? failedStep.result : {};
  const allErrors = Array.isArray(details.errors)
    ? details.errors.map((item) => ({
      noteId: String(item?.noteId || ""),
      message: String(item?.message || item?.error || "").trim(),
    })).filter((item) => item.message)
    : [];
  const directError = String(failedStep.error || details.error || "").trim();
  const counts = [
    { key: "total", label: "涉及卡片", value: nonNegativeCount(details.total) },
    { key: "changed", label: "已修改", value: nonNegativeCount(details.changed) },
    { key: "skipped", label: "已跳过", value: nonNegativeCount(details.skipped) },
    { key: "failed", label: "失败", value: nonNegativeCount(details.failed) },
  ].filter((item) => item.value !== null);

  return {
    statusMessage: String(result?.statusMessage || `批量操作已在第 ${failedIndex + 1} 步停止`),
    failedStepNumber: failedIndex + 1,
    totalSteps,
    completedSteps: Math.min(failedIndex, totalSteps),
    failedStepTitle: String(
      failedStep.title ||
      resolvedTitle ||
      failedStep.actionId ||
      failedDefinition.actionId ||
      "当前步骤",
    ),
    steps: workflowSteps.map((step, index) => ({
      number: index + 1,
      title: String(typeof getStepTitle === "function" ? getStepTitle(step) : step?.actionId || `步骤 ${index + 1}`),
      status: index < failedIndex ? "completed" : index === failedIndex ? "failed" : "pending",
    })),
    directError: directError || (allErrors.length === 0 ? "部分卡片处理失败，本次工作流已停止" : ""),
    errors: allErrors.slice(0, 3),
    remainingErrorCount: Math.max(0, allErrors.length - 3),
    counts,
  };
}

async function runRecoverableDialogSubmission(onConfirm, args, onSuccess, onError) {
  try {
    await onConfirm(...args);
    onSuccess();
    return true;
  } catch (error) {
    onError(normalizeError(error));
    return false;
  }
}

function runCloseBeforeDialogConfirmation(onClose, onConfirm, args) {
  onClose();
  return onConfirm(...args);
}

function applyActionButtonSettingsForSession(current, sessionId, settings) {
  return current?.sessionId === sessionId ? { ...current, values: settings } : current;
}

function applyInvalidLinkCleanupForSession(current, sessionId, changes) {
  return current?.sessionId === sessionId ? { ...current, ...changes } : current;
}

function summarizeInvalidLinkCleanupPreview(preview) {
  const removableCardLinks = nonNegativeCount(preview?.removableCardLinks) ?? 0;
  const removableMarkdownLinks = nonNegativeCount(preview?.removableMarkdownLinks) ?? 0;
  const affectedCards = nonNegativeCount(preview?.affectedCards) ?? 0;
  const errors = Array.isArray(preview?.errors)
    ? preview.errors.map((item) => ({
      index: nonNegativeCount(item?.index),
      message: String(item?.message || item?.error || "").trim(),
    })).filter((item) => item.message)
    : [];
  const failed = Math.max(nonNegativeCount(preview?.failed) ?? 0, errors.length);
  return {
    removableCardLinks,
    removableMarkdownLinks,
    removable: removableCardLinks + removableMarkdownLinks,
    affectedCards,
    failed,
    errors,
  };
}

async function persistActionButtonSetting(onChange, onReload, key, nextValue, label) {
  let updateError = null;
  let settings = null;

  try {
    settings = await onChange({ [key]: nextValue });
  } catch (error) {
    updateError = error;
  }

  if (settings && settings[key] === nextValue) {
    return { kind: "success", message: `“${label}”已保存`, settings };
  }

  try {
    const refreshed = await onReload();
    if (refreshed && refreshed[key] === nextValue) {
      return {
        kind: updateError ? "warning" : "success",
        message: updateError
          ? `“${label}”已生效，但保存回执异常：${normalizeError(updateError)}。已重新核对当前设置。`
          : `“${label}”已保存并完成核对`,
        settings: refreshed,
      };
    }
    const detail = updateError ? `：${normalizeError(updateError)}` : "";
    return {
      kind: "error",
      message: `“${label}”未能保存${detail}。已重新读取当前设置，请重试。`,
      settings: refreshed,
    };
  } catch (reloadError) {
    const detail = updateError
      ? `保存未确认：${normalizeError(updateError)}`
      : `“${label}”的保存结果与请求不一致`;
    return {
      kind: "error",
      message: `${detail}；重新读取当前设置也失败：${normalizeError(reloadError)}。请关闭后重新打开核对。`,
      settings: null,
    };
  }
}

function createEmptyWorkflowDraft() {
  return { id: "", name: "新工作流", scope: "both", steps: [] };
}

function cloneWorkflowDraft(workflow) {
  const source = workflow && typeof workflow === "object" ? workflow : createEmptyWorkflowDraft();
  try {
    return JSON.parse(JSON.stringify(source));
  } catch (_) {
    return createEmptyWorkflowDraft();
  }
}

function stableWorkflowDraftValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableWorkflowDraftValue(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") return result;
      result[key] = stableWorkflowDraftValue(item);
      return result;
    }, {});
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  return value;
}

function workflowDraftSignature(workflow) {
  const source = workflow && typeof workflow === "object" ? workflow : createEmptyWorkflowDraft();
  const steps = Array.isArray(source.steps) ? source.steps.map((step) => (
    step?.kind === "select"
      ? { kind: "select", selector: stableWorkflowDraftValue(step.selector || {}) }
      : {
        kind: "action",
        actionId: String(step?.actionId || ""),
        options: stableWorkflowDraftValue(step?.options || {}),
      }
  )) : [];
  return JSON.stringify({
    id: String(source.id || ""),
    name: String(source.name || ""),
    scope: source.scope === "single" || source.scope === "both" ? source.scope : "batch",
    steps,
  });
}

function routeWorkflowDraftTransition(hasUnsavedChanges, transition, queueTransition, applyTransition) {
  if (!transition) return false;
  if (hasUnsavedChanges) {
    queueTransition(transition);
    return false;
  }
  applyTransition(transition);
  return true;
}

function buildWorkflowMutationCloseConfirmation(kind, name) {
  const workflowName = clampText(String(name || "").trim(), 80) || "当前工作流";
  const deleting = kind === "delete";
  return {
    kind: deleting ? "delete" : "save",
    title: deleting ? "删除请求已发出，仍要关闭？" : "保存请求已发出，仍要关闭？",
    description: deleting
      ? `工作流「${workflowName}」的删除请求仍在处理。关闭管理器不会撤回该请求，最终结果可能在关闭后返回。`
      : `工作流「${workflowName}」的保存请求仍在处理。关闭管理器不会撤回该请求，最终结果可能在关闭后返回。`,
    note: "关闭后请重新打开工作流管理器核对最终结果；系统不会自动重试。",
    cancelText: "继续等待",
    confirmText: "仍然关闭",
  };
}

function batchRecordingDraftSignature(name, steps) {
  return JSON.stringify({
    name: String(name || "").trim(),
    steps: stableWorkflowDraftValue(Array.isArray(steps) ? steps : []),
  });
}

function buildBatchRecordingCloseConfirmation({ saving, name, steps, savedSignature, feedback }) {
  const fullName = String(name || "").trim();
  const normalizedName = clampText(fullName, 80);
  const normalizedSteps = Array.isArray(steps) ? steps : [];
  const currentSignature = batchRecordingDraftSignature(fullName, normalizedSteps);

  if (saving) {
    return {
      kind: "saving",
      title: "保存请求已发出，仍要关闭？",
      description: `工作流「${normalizedName || "未命名工作流"}」的保存请求已经发出。关闭编辑器不会撤回该请求，最终结果可能在关闭后返回。`,
      note: "关闭后请到工作流管理器核对最终结果；系统不会自动重试。",
      cancelText: "继续等待",
      confirmText: "仍然关闭",
    };
  }

  if (currentSignature === String(savedSignature || "")) return null;

  const stepCount = normalizedSteps.length;
  const draftLabel = stepCount > 0
    ? `${normalizedName ? `名称“${normalizedName}”和 ` : ""}${stepCount} 个录制步骤`
    : `工作流名称“${normalizedName || "未命名工作流"}”`;
  const saveFailed = feedback?.kind === "error";

  return {
    kind: saveFailed ? "failed" : "unsaved",
    title: saveFailed ? "放弃保存失败的录制草稿？" : "放弃未保存的录制草稿？",
    description: saveFailed
      ? `上次保存没有成功确认。当前${draftLabel}将丢失，且无法恢复。`
      : `当前${draftLabel}尚未保存。关闭后将丢失，且无法恢复。`,
    note: "系统不会自动保存或自动重试。",
    cancelText: "继续编辑",
    confirmText: "放弃并关闭",
  };
}

function clampText(text, maxLength = 360) {
  const source = String(text || "");
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength).trimEnd()}...`;
}

function snapshotViewState(snapshot) {
  const current = snapshot && typeof snapshot === "object" ? snapshot : makeEmptySnapshot();
  const error = String(current.error || "").trim();
  if (current.noteId) return { phase: "ready", error: "" };
  if (/没有读取到当前卡片|请先选中一张卡片/.test(error)) {
    return { phase: "unselected", error };
  }
  if (error) return { phase: "error", error };
  return { phase: "unselected", error: "" };
}

function prefersReducedMotion() {
  try {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {
    return false;
  }
}

function scrollElementIntoView(element) {
  if (!element || typeof element.scrollIntoView !== "function") return false;
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  return true;
}

function isTextPreviewTruncated(text, maxLength) {
  const source = String(text || "");
  return source.length > maxLength || source.split(/\r\n?|\n/).length > 8;
}

function hasSelectedTextWithin(element) {
  const selection = window.getSelection?.();
  if (!element || !selection || selection.isCollapsed) return false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (selection.getRangeAt(index).intersectsNode(element)) return true;
  }
  return false;
}

function normalizeImageSource(comment) {
  if (!comment?.imageBase64) return "";
  if (/^data:/i.test(comment.imageBase64)) return comment.imageBase64;
  return `data:${comment.imageMimeType || "image/jpeg"};base64,${comment.imageBase64}`;
}

function getCommentMediaSources(comment) {
  const sources = [];
  const imageSource = normalizeImageSource(comment);
  const drawingSource = String(comment?.drawingPreviewDataURI || "").trim();
  if (imageSource) sources.push({ key: "image", src: imageSource, alt: `评论 #${comment.index}` });
  if (drawingSource && drawingSource !== imageSource) {
    sources.push({ key: "drawing", src: drawingSource, alt: `评论 #${comment.index} 的手写预览` });
  }
  return sources;
}

function getExcerptTypeLabel(excerpt) {
  if (excerpt?.type === "text") return "文本摘录";
  if (excerpt?.type === "image") return "图片摘录";
  if (excerpt?.type === "audio") return "音频摘录";
  if (excerpt?.type === "video") return "视频摘录";
  return "原生摘录";
}

function getExcerptConversionError(excerpt) {
  const reason = excerpt?.conversion?.reason;
  if (reason === "noParent") return "当前摘录卡没有父卡片，无法转为非摘录版";
  if (reason === "unsupportedMedia") return "当前音频或视频摘录暂不支持转为非摘录版";
  return "当前卡片没有可转换的文本或图片摘录";
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

function suppressPressDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  if (target?.setPointerCapture && event.pointerId !== undefined) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch (_) {
      // Some WebViews throw if capture is already released.
    }
  }
  window.getSelection?.()?.removeAllRanges?.();
}

function releasePressCapture(event) {
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  if (target?.releasePointerCapture && event.pointerId !== undefined) {
    try {
      target.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Pointer capture may already be released after cancel/leave.
    }
  }
  window.getSelection?.()?.removeAllRanges?.();
}

function handleQuickActionKeyboardEvent(event, action) {
  const isEnter = event.key === "Enter";
  const isSpace = event.key === " " || event.key === "Spacebar";
  if (!isEnter && !isSpace) return;
  event.preventDefault();
  event.stopPropagation();
  const shouldActivate = (isEnter && event.type === "keydown" && !event.repeat) ||
    (isSpace && event.type === "keyup");
  if (shouldActivate && typeof action === "function") action();
}

// React handlers and document listeners both receive composition keystrokes.
function isComposingKeyEvent(event) {
  const nativeEvent = event?.nativeEvent || event;
  return nativeEvent?.isComposing === true || nativeEvent?.keyCode === 229;
}

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getDialogFocusableElements(dialogElement) {
  if (!dialogElement || typeof dialogElement.querySelectorAll !== "function") return [];
  return Array.from(dialogElement.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)).filter((element) => (
    element &&
    element.disabled !== true &&
    element.hidden !== true &&
    element.tabIndex >= 0 &&
    element.getAttribute?.("aria-hidden") !== "true" &&
    String(element.getAttribute?.("type") || "").toLowerCase() !== "hidden"
  ));
}

function keepFocusWithinDialog(event, dialogElement) {
  if (event?.key !== "Tab" || !dialogElement) return false;
  const focusableElements = getDialogFocusableElements(dialogElement);
  const activeElement = dialogElement.ownerDocument?.activeElement || null;
  const firstElement = focusableElements[0] || dialogElement;
  const lastElement = focusableElements[focusableElements.length - 1] || dialogElement;
  const activeIndex = focusableElements.indexOf(activeElement);
  let nextElement = null;

  if (focusableElements.length === 0 || !dialogElement.contains?.(activeElement) || activeIndex === -1) {
    nextElement = event.shiftKey ? lastElement : firstElement;
  } else if (event.shiftKey && activeElement === firstElement) {
    nextElement = lastElement;
  } else if (!event.shiftKey && activeElement === lastElement) {
    nextElement = firstElement;
  }

  if (!nextElement || typeof nextElement.focus !== "function") return false;
  event.preventDefault();
  nextElement.focus();
  return true;
}

function focusInitialDialogControl(dialogElement, preferredTarget = null) {
  if (!dialogElement) return false;
  const target = preferredTarget && typeof preferredTarget.focus === "function"
    ? preferredTarget
    : getDialogFocusableElements(dialogElement)[0] || dialogElement;
  if (!target || typeof target.focus !== "function") return false;
  target.focus();
  return true;
}

function restoreFocusAfterDialogClose(target, fallbackTarget = null) {
  const targetCanFocus = !!target && typeof target.focus === "function";
  const explicitFallbackCanFocus = !!fallbackTarget && typeof fallbackTarget.focus === "function";
  if (!targetCanFocus && !explicitFallbackCanFocus) return;
  const restore = () => {
    const closestFallback = targetCanFocus && typeof target.closest === "function"
      ? target.closest(".comment-card")
      : null;
    const fallback = explicitFallbackCanFocus ? fallbackTarget : closestFallback;
    const focusTarget = targetCanFocus && target.isConnected !== false && target.disabled !== true
      ? target
      : fallback;
    if (!focusTarget || focusTarget.isConnected === false || typeof focusTarget.focus !== "function") return;
    focusTarget.focus();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
  else setTimeout(restore, 0);
}

function isPureMarginNoteLinkText(text) {
  return /^marginnote\d*(?:app)?:\/\/note\/[^\s]+$/i.test(String(text || "").trim());
}

function extractMarginNoteUrlNoteId(url) {
  const source = String(url || "").trim();
  const withoutQuery = source.split(/[?#]/)[0];
  const match = withoutQuery.match(/^marginnote\d*(?:app)?:\/\/note\/([0-9A-Fa-f-]{36})(?:\/[^\s]*)?$/i);
  return match?.[1] ? match[1].toUpperCase() : "";
}

function getMarkdownLinks(comment) {
  return Array.isArray(comment?.markdownLinks) ? comment.markdownLinks : [];
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
  const linkedTitle = isLink ? String(comment?.linkedNoteTitle || "").trim() : "";
  const title = isLink ? (linkedTitle || linkUrl || text || "未命名卡片") : "";
  const content = isLink ? (linkUrl && title !== linkUrl ? linkUrl : "") : text;
  return {
    index: comment.index,
    order,
    kind: isLink ? "link" : "text",
    label: isLink ? "链接" : getTypeMeta(comment).label,
    text,
    linkUrl: linkUrl || text,
    title,
    content,
    defaultText: isLink ? (linkUrl || text) : text,
  };
}

function buildExcerptInlineMergeMaterial(excerpt) {
  return {
    index: "excerpt",
    order: 0,
    kind: "text",
    label: "原生摘录",
    text: excerpt?.text || "",
    linkUrl: "",
    title: "",
    content: excerpt?.text || "",
    defaultText: excerpt?.text || "",
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
  return {
    noteId: "",
    noteTitle: "",
    excerpt: {
      present: false,
      type: "none",
      text: "",
      imageBase64: "",
      imageMimeType: "",
      conversion: { eligible: false, reason: "noExcerpt" },
      capabilities: {},
    },
    comments: [],
    handwritingPendingCount: 0,
    error: "",
  };
}

function getMarkdownLinkPressKey(comment, link, linkIndex) {
  return `markdown:${comment.index}:${linkIndex}:${link.startIndex ?? ""}`;
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

function SelectionCheckbox({ checked, label, onToggle, descriptionId }) {
  return (
    <label
      className="selection-checkbox"
      title={label}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-describedby={descriptionId}
        onChange={onToggle}
      />
    </label>
  );
}

function PlainTextPreview({ text, maxLength, expanded, onToggle, contentId, label }) {
  const source = String(text || "");
  const truncated = isTextPreviewTruncated(source, maxLength);
  const contentRef = useRef(null);
  const reading = expanded && truncated;
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [expanded, source]);
  return (
    <div className="plain-text-preview" data-expanded={expanded} data-truncated={truncated}>
      <pre
        ref={contentRef}
        id={contentId}
        role={reading ? "region" : undefined}
        aria-label={reading ? label : undefined}
        aria-describedby={reading ? `${contentId}-hint` : undefined}
        tabIndex={reading ? 0 : undefined}
      >{expanded || !truncated ? source : clampText(source, maxLength)}</pre>
      {truncated ? (
        <div className="text-preview-footer">
          <Button
            className="text-preview-toggle ghost"
            aria-controls={contentId}
            aria-expanded={expanded ? "true" : "false"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "收起全文" : "展开全文"}
          </Button>
          <span id={`${contentId}-hint`} className="text-preview-hint">
            {expanded ? "滚动查看全文" : "显示部分内容"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ tone = "neutral", title, body, actionText = "", onAction = null }) {
  return (
    <div className={`empty-state ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {actionText && onAction ? <Button className="secondary" onClick={onAction}>{actionText}</Button> : null}
    </div>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(() => makeEmptySnapshot());
  const [selected, setSelected] = useState(() => new Set());
  const [excerptSelected, setExcerptSelected] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);
  const [status, setStatus] = useState("正在读取当前卡片...");
  const [statusKey, setStatusKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [noteViewState, setNoteViewState] = useState({ phase: "loading", error: "" });
  const [expandedPreviews, setExpandedPreviews] = useState(() => new Set());
  const [openingOverlay, setOpeningOverlay] = useState("");
  const [closingPanel, setClosingPanel] = useState(false);
  const [rangePicking, setRangePicking] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState(null);
  const [insertMode, setInsertMode] = useState(false);
  const selectionModeTriggerRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [mergeToExcerptDefault, setMergeToExcerptDefault] = useState(false);
  const [showImageExcerptText, setShowImageExcerptText] = useState(false);
  const [mergeDefaultLoadError, setMergeDefaultLoadError] = useState("");
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
  const [inlineLinkPressing, setInlineLinkPressing] = useState(null);
  const [actionButtonSettings, setActionButtonSettings] = useState(null);
  const actionButtonSettingsSessionRef = useRef(0);
  const [workflowManager, setWorkflowManager] = useState(null);
  const [batchEditor, setBatchEditor] = useState(null);
  const [invalidLinkCleanup, setInvalidLinkCleanup] = useState(null);
  const invalidLinkCleanupSessionRef = useRef(0);
  const invalidLinkCleanupPreviewRef = useRef(null);
  const invalidLinkCleanupConfirmingRef = useRef(false);
  const commandInFlightRef = useRef(null);
  const overlayOpeningRef = useRef("");
  const panelCloseRef = useRef(false);
  const mergeDefaultPersistenceRef = useRef({ busy: false, queued: null, latest: false });
  const appMountedRef = useRef(true);

  const comments = snapshot.comments || [];
  const excerpt = snapshot.excerpt || makeEmptySnapshot().excerpt;
  const excerptPresent = excerpt.present === true;
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
  const contentSelection = useMemo(
    () => makeContentSelection(excerptSelected, selectedIndices),
    [excerptSelected, selectedIndices],
  );
  const filterCounts = useMemo(() => (
    comments.reduce((counts, comment) => {
      const key = getTypeMeta(comment).filter;
      counts.all += 1;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, { all: 0, text: 0, image: 0, link: 0, html: 0, audio: 0, other: 0 })
  ), [comments]);
  const visibleFilters = useMemo(
    () => FILTERS.filter((item) => item.key === "all" || (filterCounts[item.key] || 0) > 0),
    [filterCounts],
  );
  const commentSearchIndex = useMemo(() => {
    const index = new Map();
    comments.forEach((comment) => index.set(comment.index, commentSearchText(comment)));
    return index;
  }, [comments]);
  const visibleComments = useMemo(() => (
    comments.filter((comment) => {
      if (filter !== "all" && getTypeMeta(comment).filter !== filter) return false;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return String(commentSearchIndex.get(comment.index) || "").includes(query);
    })
  ), [commentSearchIndex, comments, filter, search]);
  const hiddenSelectedCount = selectedIndices.length - visibleComments.filter((comment) => selected.has(comment.index)).length;
  const hasActiveFilter = filter !== "all" || search.trim().length > 0;
  const filterDescription = [
    FILTERS.find((item) => item.key === filter)?.label || "全部",
    search.trim() ? `搜索「${search.trim()}」` : "",
  ].filter(Boolean).join(" · ");
  const fieldGroups = useMemo(() => buildFieldGroups(visibleComments), [visibleComments]);
  const selectedContentCount = selectedIndices.length + (excerptSelected ? 1 : 0);
  const hasSelection = selectedContentCount > 0;
  const hasOneSelection = selectedContentCount === 1;
  const hasMultiSelection = selectedContentCount > 1;
  const excerptCanCopyText = excerptSelected && excerpt?.capabilities?.canCopyText === true;
  const excerptCanCopyImage = excerptSelected && excerpt?.capabilities?.canCopyImage === true;
  const excerptCanMergeText = !excerptSelected || excerpt?.capabilities?.canMergeText === true;
  const selectedCanCopyText = excerptCanCopyText || anySelectedCan(selectedComments, "canCopyText");
  const selectedCanCopyImage = hasOneSelection && (
    excerptCanCopyImage || (!excerptSelected && canComment(selectedComments[0], "canCopyImage"))
  );
  const selectedCanEditText = !excerptSelected && hasOneSelection && canComment(selectedComments[0], "canEditText");
  const selectedCanMergeText = hasMultiSelection && excerptCanMergeText && allSelectedCan(selectedComments, "canMergeText") && allSelectedCan(selectedComments, "canCopyText");
  const selectedCommentsCanMergeToExcerpt = selectedComments.length >= (excerptSelected ? 1 : 2)
    && allSelectedCan(selectedComments, "canMergeText")
    && allSelectedCan(selectedComments, "canCopyText");
  const selectedCanMergeAction = selectedCanMergeText
    || (selectedCommentsCanMergeToExcerpt && (!excerptSelected || excerpt.type === "image"));
  const mergeToExcerptBlockedByMedia = excerptPresent && (excerpt.type === "audio" || excerpt.type === "video");
  const canMergeToExcerpt = selectedCommentsCanMergeToExcerpt && !mergeToExcerptBlockedByMedia;
  const selectedCanBidirectionalDelete = hasSelection && !excerptSelected && allSelectedCan(selectedComments, "canBidirectionalDelete");
  const selectedHtmlComments = useMemo(
    () => selectedComments.filter((comment) => comment?.capabilities?.isHtml),
    [selectedComments],
  );
  const selectedHasHtmlComments = selectedHtmlComments.length > 0;
  const moveState = useMemo(
    () => getMoveState(contentSelection, excerptPresent, comments.length),
    [comments.length, contentSelection, excerptPresent],
  );
  const selectionIsContinuous = moveState.continuous;
  const selectedCanInlineMerge = hasMultiSelection
    && selectionIsContinuous
    && excerptCanMergeText
    && selectedComments.every(canInlineMergeComment)
    && selectedComments.some((comment) => getInlineMergeLinkUrl(comment));
  const canMoveSelectionToTop = moveState.canMoveToTop;
  const canMoveSelectionUp = moveState.canMoveUp;
  const canMoveSelectionDown = moveState.canMoveDown;
  const canMoveSelectionToBottom = moveState.canMoveToBottom;
  const canPickInsertPosition = moveState.canPickInsertPosition;
  const canInsertAtEnd = !(moveState.continuous && moveState.positions[moveState.positions.length - 1] + 1 === moveState.totalCount);

  const notifyStatus = (message) => {
    setStatus(message);
    setStatusKey((current) => current + 1);
  };

  const applySnapshot = (nextSnapshot, message = "", nextSelection = null) => {
    const normalizedSnapshot = nextSnapshot || makeEmptySnapshot();
    setSnapshot(normalizedSnapshot);
    setNoteViewState(snapshotViewState(normalizedSnapshot));
    setExpandedPreviews(new Set());
    setSelected(new Set(Array.isArray(nextSelection?.commentIndices) ? nextSelection.commentIndices : []));
    setExcerptSelected(nextSelection?.excerptSelected === true && normalizedSnapshot?.excerpt?.present === true);
    setRangePicking(false);
    setRangeAnchor(null);
    setInsertMode(false);
    notifyStatus(message || (normalizedSnapshot?.error ? normalizedSnapshot.error : "当前卡片已更新"));
  };

  const runCommand = async (command, payload, options = {}) => {
    const { message = "已完成", keepSelection = false } = options;
    if (commandInFlightRef.current) {
      const error = new Error("正在处理上一项操作，请稍候");
      error.code = "MNCM_WEB_BUSY";
      notifyStatus(error.message);
      throw error;
    }

    const operation = { command };
    commandInFlightRef.current = operation;
    setLoading(true);
    try {
      const result = await MNBridge.send(command, payload);
      if (!appMountedRef.current) return result;
      const resultMessage = result?.statusMessage || message;
      if (result?.snapshot) {
        applySnapshot(result.snapshot, resultMessage, Array.isArray(result.selectedIndices)
          ? makeContentSelection(false, result.selectedIndices)
          : null);
      } else if (result?.comments) {
        applySnapshot(result, resultMessage, Array.isArray(result.selectedIndices)
          ? makeContentSelection(false, result.selectedIndices)
          : null);
      } else if (!keepSelection) {
        notifyStatus(resultMessage);
      } else if (result?.statusMessage) {
        notifyStatus(result.statusMessage);
      }
      return result;
    } catch (error) {
      if (appMountedRef.current) notifyStatus(normalizeError(error));
      throw error;
    } finally {
      if (commandInFlightRef.current === operation) {
        commandInFlightRef.current = null;
        if (appMountedRef.current) setLoading(false);
      }
    }
  };

  const loadCurrentNote = async () => {
    const hadCurrentNote = !!snapshot.noteId;
    if (!hadCurrentNote) setNoteViewState({ phase: "loading", error: "" });
    try {
      await runCommand("getCurrentNoteComments", null, { message: "当前卡片已刷新" });
    } catch (error) {
      if (appMountedRef.current && !hadCurrentNote && error?.code !== "MNCM_WEB_BUSY") {
        setNoteViewState({ phase: "error", error: normalizeError(error) });
      }
      // status has been set by runCommand
    }
  };

  const openInvalidLinkCleanup = (event) => {
    const returnFocusTarget = event?.currentTarget || null;
    const returnFocusFallback = document.getElementById("comment-list");
    const sessionId = invalidLinkCleanupSessionRef.current + 1;
    invalidLinkCleanupSessionRef.current = sessionId;
    setInvalidLinkCleanup({
      sessionId,
      noteId: snapshot.noteId,
      mode: "",
      preview: null,
      phase: "select",
      error: "",
      returnFocusTarget,
      returnFocusFallback,
    });
  };

  const closeInvalidLinkCleanup = () => {
    invalidLinkCleanupSessionRef.current += 1;
    setInvalidLinkCleanup(null);
  };

  const previewInvalidLinkCleanup = async (mode, sessionId, noteId) => {
    if (invalidLinkCleanupSessionRef.current !== sessionId) return;
    if (!mode) {
      setInvalidLinkCleanup((current) => applyInvalidLinkCleanupForSession(current, sessionId, {
        mode: "",
        preview: null,
        phase: "select",
        error: "",
      }));
      return;
    }

    if (invalidLinkCleanupPreviewRef.current?.sessionId === sessionId) return;
    const previewOperation = { sessionId, mode };
    invalidLinkCleanupPreviewRef.current = previewOperation;

    setInvalidLinkCleanup((current) => applyInvalidLinkCleanupForSession(current, sessionId, {
      mode,
      preview: null,
      phase: "previewing",
      error: "",
    }));

    try {
      const preview = await MNBridge.send("previewInvalidLinkCleanup", { noteId, mode });
      if (invalidLinkCleanupSessionRef.current !== sessionId) return;
      if (!preview || typeof preview !== "object" || typeof preview.signature !== "string" || !preview.signature) {
        throw new Error("预览结果缺少校验信息，请重新扫描");
      }
      const summary = summarizeInvalidLinkCleanupPreview(preview);
      setInvalidLinkCleanup((current) => applyInvalidLinkCleanupForSession(current, sessionId, {
        mode,
        preview,
        phase: "preview",
        error: "",
      }));
      if (summary.failed > 0) {
        notifyStatus(summary.removable > 0
          ? `已找到 ${summary.removable} 条可清理链接，另有 ${summary.failed} 条无法确认`
          : `未发现可安全清理的链接，但有 ${summary.failed} 条无法确认`);
      } else if (summary.removable > 0) {
        notifyStatus(`扫描完成：找到 ${summary.removable} 条可清理链接`);
      } else {
        notifyStatus("当前卡片没有失效链接");
      }
    } catch (error) {
      if (invalidLinkCleanupSessionRef.current !== sessionId) return;
      const message = normalizeError(error);
      setInvalidLinkCleanup((current) => applyInvalidLinkCleanupForSession(current, sessionId, {
        mode,
        preview: null,
        phase: "error",
        error: message,
      }));
      notifyStatus(`失效链接扫描失败：${message}`);
    } finally {
      if (invalidLinkCleanupPreviewRef.current === previewOperation) {
        invalidLinkCleanupPreviewRef.current = null;
      }
    }
  };

  const confirmInvalidLinkCleanup = async () => {
    const current = invalidLinkCleanup;
    const mode = current?.mode;
    const preview = current?.preview;
    const signature = typeof preview?.signature === "string" ? preview.signature : "";
    if (!mode || !preview || !signature || invalidLinkCleanupConfirmingRef.current) {
      if (mode && preview && !signature) {
        const message = "预览结果缺少校验信息，请重新扫描";
        setInvalidLinkCleanup((value) => applyInvalidLinkCleanupForSession(value, current?.sessionId, {
          preview: null,
          phase: "error",
          error: message,
        }));
        notifyStatus(message);
      }
      return;
    }

    invalidLinkCleanupConfirmingRef.current = true;
    invalidLinkCleanupSessionRef.current += 1;
    setInvalidLinkCleanup(null);
    try {
      await execute(() => runCommand("clearInvalidLinks", {
        noteId: current.noteId,
        mode,
        expectedSignature: signature,
      }, { message: "失效链接已清除" }));
    } finally {
      invalidLinkCleanupConfirmingRef.current = false;
      restoreFocusAfterDialogClose(current.returnFocusTarget, current.returnFocusFallback);
    }
  };

  useEffect(() => {
    appMountedRef.current = true;
    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      loadCurrentNote();
      MNBridge.send("getActionButtonSettings")
        .then((settings) => {
          if (!appMountedRef.current) return;
          setMergeToExcerptDefault(settings?.mergeToExcerptDefault === true);
          setShowImageExcerptText(settings?.showImageExcerptText === true);
          setMergeDefaultLoadError("");
        })
        .catch((error) => {
          if (!appMountedRef.current) return;
          setMergeDefaultLoadError(normalizeError(error));
        });
    }
    return () => {
      appMountedRef.current = false;
      clearDeleteTimer();
      clearSingleDeleteTimer();
      Object.values(quickMoveTimers.current).forEach((timer) => clearTimeout(timer));
      Object.values(linkFocusTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    window.__MNCommentManagerBatchNativeSync = (raw) => {
      try {
        const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (payload?.state?.mode === "batch") setBatchEditor(payload.state);
        else setBatchEditor(null);
      } catch (error) {
        notifyStatus(normalizeError(error));
      }
    };
    return () => { delete window.__MNCommentManagerBatchNativeSync; };
  }, []);

  const persistMergeToExcerptDefault = (nextChecked) => {
    const normalized = nextChecked === true;
    const persistence = mergeDefaultPersistenceRef.current;
    persistence.latest = normalized;
    setMergeToExcerptDefault(normalized);

    if (persistence.busy) {
      persistence.queued = normalized;
      notifyStatus("正在保存默认合并设置，已记录最新选择");
      return;
    }

    const persistValue = async (value) => {
      persistence.busy = true;
      const result = await persistActionButtonSetting(
        (changes) => MNBridge.send("updateActionButtonSettings", changes),
        () => MNBridge.send("getActionButtonSettings"),
        "mergeToExcerptDefault",
        value,
        "默认合并到摘录",
      );
      if (appMountedRef.current && persistence.latest === value) {
        if (result.settings) setMergeToExcerptDefault(result.settings.mergeToExcerptDefault === true);
        setMergeDefaultLoadError(result.kind === "error" ? result.message : "");
      }
      persistence.busy = false;
      const queued = persistence.queued;
      persistence.queued = null;
      if (queued !== null && queued !== value) return persistValue(queued);
      if (appMountedRef.current) notifyStatus(result.message);
      return result;
    };

    Promise.resolve(persistValue(normalized)).catch((error) => {
      persistence.busy = false;
      persistence.queued = null;
      if (!appMountedRef.current) return;
      const message = normalizeError(error);
      setMergeDefaultLoadError(message);
      notifyStatus(`默认合并设置保存失败：${message}`);
    });
  };

  useEffect(() => {
    if (filter !== "all" && (filterCounts[filter] || 0) === 0) {
      setFilter("all");
    }
  }, [filter, filterCounts]);

  useEffect(() => {
    if (insertMode && !canPickInsertPosition) {
      setInsertMode(false);
    }
  }, [insertMode, canPickInsertPosition]);

  useEffect(() => {
    window.__MNCommentManagerNativeSync = (rawPayload) => {
      try {
        const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        // A native close or a switch back to single-card mode must dismiss a
        // stale batch overlay that may still be mounted in the WebView.
        setBatchEditor(null);
        if (!payload?.snapshot) return;
        const syncMessage = payload.snapshot.error
          ? payload.snapshot.error
          : payload.snapshot.handwritingPendingCount > 0
            ? "手写内容正在转换，完成后将自动刷新"
            : payload.reason === "handwriting-preview-retry"
              ? "手写内容转换完成，页面已自动刷新"
              : "已切换到当前卡片";
        applySnapshot(payload.snapshot, syncMessage);
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

  const togglePreviewExpansion = (key) => {
    setExpandedPreviews((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSearchAndFilter = () => {
    setSearch("");
    setFilter("all");
    searchInputRef.current?.focus({ preventScroll: true });
  };

  const clearSearch = () => {
    setSearch("");
    searchInputRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const list = document.getElementById("comment-list");
    if (list) list.scrollTop = 0;
  }, [filter, search]);

  const setContentSelection = (selection, keepRangePicking = false) => {
    setSelection(selection?.commentIndices || []);
    setExcerptSelected(excerptPresent && selection?.excerptSelected === true);
    if (!keepRangePicking) {
      setRangePicking(false);
      setRangeAnchor(null);
      setInsertMode(false);
    }
  };

  const toggleIndex = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleExcerpt = () => {
    if (!excerptPresent) return;
    setExcerptSelected((current) => !current);
  };

  const handleContentClick = (kind, index = null) => {
    const position = kind === "excerpt" ? 0 : getVirtualPositionForComment(index, excerptPresent);
    if (rangePicking) {
      if (rangeAnchor === null) {
        setRangeAnchor(position);
        setContentSelection(kind === "excerpt"
          ? makeContentSelection(true, [])
          : makeContentSelection(false, [index]), true);
        notifyStatus(kind === "excerpt" ? "范围起点为原生摘录，再选择终点" : `范围起点为评论 #${index}，再选择终点`);
        return;
      }
      const rangeSelection = selectionFromVirtualRange(rangeAnchor, position, excerptPresent, comments.length);
      setContentSelection(rangeSelection);
      notifyStatus(`已选中连续 ${rangeSelection.commentIndices.length + (rangeSelection.excerptSelected ? 1 : 0)} 项内容`);
      return;
    }
    if (kind === "excerpt") toggleExcerpt();
    else toggleIndex(index);
  };

  const handleCommentClick = (index) => handleContentClick("comment", index);

  const requireSelection = () => {
    if (!hasSelection) {
      notifyStatus("先选择要处理的内容");
      return false;
    }
    return true;
  };

  const executeMoveSelection = async (targetIndex, message) => {
    if (!requireSelection()) return;
    await runCommand("moveContentSelection", {
      noteId: snapshot.noteId,
      selection: contentSelection,
      targetIndex,
    }, { message: message || "内容位置已更新" });
  };

  const moveSelection = async (targetIndex, message, returnFocusTarget = null) => {
    if (!requireSelection()) return;
    if (!excerptSelected) {
      await executeMoveSelection(targetIndex, message);
      return;
    }
    if (excerpt?.conversion?.eligible !== true) {
      notifyStatus(getExcerptConversionError(excerpt));
      return;
    }
    setDialog({
      focusManaged: true,
      closeBeforeConfirm: true,
      title: "移动摘录前需转换卡片",
      body: "这是卡片自身的摘录，不是普通评论。继续后会先把当前卡片转为非摘录版，再按当前完整选区自动完成移动。",
      confirmText: "转换并移动",
      returnFocusTarget,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async () => {
        await executeMoveSelection(targetIndex, message);
      },
    });
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

  const moveByStep = async (direction, returnFocusTarget = null) => {
    if (!requireSelection()) return;
    const first = moveState.positions[0];
    const last = moveState.positions[moveState.positions.length - 1];
    if (!selectionIsContinuous) {
      notifyStatus("批量上移/下移需要选择连续内容");
      return;
    }
    if (direction === "up") {
      if (first <= moveState.topBoundary) {
        notifyStatus("已在最上方");
        return;
      }
      await moveSelection(first - 1, "已上移一位", returnFocusTarget);
      return;
    }
    if (last >= moveState.totalCount - 1) {
      notifyStatus("已在最下方");
      return;
    }
    await moveSelection(last + 2, "已下移一位", returnFocusTarget);
  };

  const executeDeleteSelection = async () => {
    if (!requireSelection()) return;
    await runCommand("deleteContentSelection", {
      noteId: snapshot.noteId,
      selection: contentSelection,
    }, { message: "所选内容已删除" });
  };

  const deleteSelection = async (returnFocusTarget = null) => {
    if (!requireSelection()) return;
    if (!excerptSelected) {
      await executeDeleteSelection();
      return;
    }
    if (excerpt?.conversion?.eligible !== true) {
      notifyStatus(getExcerptConversionError(excerpt));
      return;
    }
    setDialog({
      focusManaged: true,
      closeBeforeConfirm: true,
      title: "删除原生摘录",
      body: "删除所选原生摘录需要先把当前卡片转为非摘录版。转换并验证内容映射后，系统会删除完整选区。",
      confirmText: "转换并删除",
      danger: true,
      returnFocusTarget,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async () => {
        await executeDeleteSelection();
      },
    });
  };

  const confirmBidirectionalDelete = async (returnFocusTarget = null) => {
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
        focusManaged: true,
        closeBeforeConfirm: true,
        title: "删除双向链接",
        body: `将删除当前卡片中的 ${selectedIndices.length} 条链接评论，并同步删除目标卡片中的 ${reverseCount} 条反向链接。Markdown 文本里的行内链接不会被改动。`,
        confirmText: "确认双向删除",
        danger: true,
        returnFocusTarget,
        returnFocusFallback: document.getElementById("selection-summary"),
        onConfirm: async () => {
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

  const confirmSingleBidirectionalDelete = async (commentIndex, returnFocusTarget = null) => {
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
        focusManaged: true,
        closeBeforeConfirm: true,
        title: "删除双向链接",
        body: `将删除当前卡片中的 #${commentIndex} 链接评论，并同步删除目标卡片中的 ${reverseCount} 条反向链接。Markdown 文本里的行内链接不会被改动。`,
        confirmText: "确认双向删除",
        danger: true,
        returnFocusTarget,
        returnFocusFallback: document.getElementById("comment-list"),
        onConfirm: async () => {
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

  const handleMainDeleteKeyboardEvent = (event) => {
    const returnFocusTarget = event.currentTarget;
    handleQuickActionKeyboardEvent(event, () => {
      execute(() => deleteSelection(returnFocusTarget));
    });
  };

  const startDeletePress = (event) => {
    suppressPressDefaults(event);
    if (loading || !hasSelection) {
      notifyStatus("先选择要删除的内容");
      return;
    }
    const returnFocusTarget = event.currentTarget;
    clearDeletePress();
    deleteLongPressFired.current = false;
    setDeletePressing(true);
    deleteTimer.current = setTimeout(() => {
      deleteLongPressFired.current = true;
      clearDeletePress();
      execute(() => confirmBidirectionalDelete(returnFocusTarget));
    }, 560);
  };

  const endDeletePress = (event) => {
    const returnFocusTarget = event.currentTarget;
    releasePressCapture(event);
    const fired = deleteLongPressFired.current;
    clearDeletePress();
    if (!fired) execute(() => deleteSelection(returnFocusTarget));
  };

  const cancelDeletePress = (event) => {
    releasePressCapture(event);
    deleteLongPressFired.current = true;
    clearDeletePress();
  };

  const startSingleDeletePress = (event, commentIndex) => {
    suppressPressDefaults(event);
    if (loading) return;
    const returnFocusTarget = event.currentTarget;
    clearSingleDeletePress();
    singleDeleteLongPressFired.current = false;
    setSingleDeletePressing(commentIndex);
    singleDeleteTimer.current = setTimeout(() => {
      singleDeleteLongPressFired.current = true;
      clearSingleDeletePress();
      execute(() => confirmSingleBidirectionalDelete(commentIndex, returnFocusTarget));
    }, 560);
  };

  const endSingleDeletePress = (event, commentIndex) => {
    releasePressCapture(event);
    const fired = singleDeleteLongPressFired.current;
    clearSingleDeletePress();
    if (!fired) execute(() => deleteSingleComment(commentIndex));
  };

  const cancelSingleDeletePress = (event) => {
    releasePressCapture(event);
    singleDeleteLongPressFired.current = true;
    clearSingleDeletePress();
  };

  const startQuickMovePress = (event, commentIndex, direction) => {
    suppressPressDefaults(event);
    if (loading) return;
    clearTimeout(quickMoveTimers.current[commentIndex]);
    quickMoveTimers.current[commentIndex] = setTimeout(() => {
      quickMoveTimers.current[commentIndex] = null;
      execute(() => moveSingleComment(commentIndex, direction, true));
    }, 520);
  };

  const finishQuickMovePress = (event, commentIndex, direction) => {
    releasePressCapture(event);
    const timer = quickMoveTimers.current[commentIndex];
    if (!timer) return;
    clearTimeout(timer);
    quickMoveTimers.current[commentIndex] = null;
    execute(() => moveSingleComment(commentIndex, direction, false));
  };

  const cancelQuickMovePress = (event, commentIndex) => {
    releasePressCapture(event);
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
    suppressPressDefaults(event);
    if (loading || !canComment(comment, "canFocusLink")) return;
    const key = comment.index;
    clearTimeout(linkFocusTimers.current[key]);
    linkFocusLongPressFired.current[key] = false;
    setInlineLinkPressing(key);
    linkFocusTimers.current[key] = setTimeout(() => {
      linkFocusLongPressFired.current[key] = true;
      linkFocusTimers.current[key] = null;
      setInlineLinkPressing(null);
      execute(() => locateLinkedNote(comment.linkedNoteId, "float"));
    }, getLongPressDelay(event, LINK_FOCUS_LONG_PRESS_MS));
  };

  const startMarkdownLinkFocusPress = (event, comment, link, linkIndex) => {
    suppressPressDefaults(event);
    if (loading || !extractMarginNoteUrlNoteId(link?.url)) return;
    const key = getMarkdownLinkPressKey(comment, link, linkIndex);
    clearTimeout(linkFocusTimers.current[key]);
    linkFocusLongPressFired.current[key] = false;
    setInlineLinkPressing(key);
    linkFocusTimers.current[key] = setTimeout(() => {
      linkFocusLongPressFired.current[key] = true;
      linkFocusTimers.current[key] = null;
      setInlineLinkPressing(null);
      execute(() => locateMarkdownLink(link, "float"));
    }, getLongPressDelay(event, LINK_FOCUS_LONG_PRESS_MS));
  };

  const finishInlineLinkFocusPress = (event, comment) => {
    releasePressCapture(event);
    const key = comment.index;
    const timer = linkFocusTimers.current[key];
    if (timer) {
      clearTimeout(timer);
      linkFocusTimers.current[key] = null;
    }
    setInlineLinkPressing(null);
    if (linkFocusLongPressFired.current[key]) {
      linkFocusLongPressFired.current[key] = false;
      return;
    }
    execute(() => locateLinkedNote(comment.linkedNoteId, "mindmap"));
  };

  const finishMarkdownLinkFocusPress = (event, comment, link, linkIndex) => {
    releasePressCapture(event);
    const key = getMarkdownLinkPressKey(comment, link, linkIndex);
    const timer = linkFocusTimers.current[key];
    if (timer) {
      clearTimeout(timer);
      linkFocusTimers.current[key] = null;
    }
    setInlineLinkPressing(null);
    if (linkFocusLongPressFired.current[key]) {
      linkFocusLongPressFired.current[key] = false;
      return;
    }
    execute(() => locateMarkdownLink(link, "mindmap"));
  };

  const cancelInlineLinkFocusPress = (event, commentIndex) => {
    releasePressCapture(event);
    clearTimeout(linkFocusTimers.current[commentIndex]);
    linkFocusTimers.current[commentIndex] = null;
    linkFocusLongPressFired.current[commentIndex] = false;
    setInlineLinkPressing(null);
  };

  const cancelMarkdownLinkFocusPress = (event, comment, link, linkIndex) => {
    releasePressCapture(event);
    const key = getMarkdownLinkPressKey(comment, link, linkIndex);
    clearTimeout(linkFocusTimers.current[key]);
    linkFocusTimers.current[key] = null;
    linkFocusLongPressFired.current[key] = false;
    setInlineLinkPressing(null);
  };

  const cancelSelectionMode = () => {
    if (loading || commandInFlightRef.current) return;
    const trigger = selectionModeTriggerRef.current;
    selectionModeTriggerRef.current = null;
    setRangePicking(false);
    setRangeAnchor(null);
    setInsertMode(false);
    notifyStatus(rangePicking ? "已退出范围选择，保留当前选区" : "已退出插入位置选择，保留当前选区");
    restoreFocusAfterDialogClose(trigger, document.getElementById("comment-list"));
  };

  const handleSelectionModeKeyDown = (event) => {
    if ((!rangePicking && !insertMode) || loading || commandInFlightRef.current) return;
    if (dialog || actionButtonSettings || workflowManager || batchEditor || invalidLinkCleanup || openingOverlay) return;
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const target = event.target;
    if (target.closest?.('textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]')) return;
    if (target.tagName === "INPUT" && target.type !== "checkbox" && target.type !== "radio") return;
    event.preventDefault();
    event.stopPropagation();
    cancelSelectionMode();
  };

  const startRangeSelection = (event) => {
    if (loading || commandInFlightRef.current) return;
    if (rangePicking) {
      cancelSelectionMode();
      return;
    }
    if (!excerptPresent && comments.length === 0) {
      notifyStatus("当前卡片还没有可选择的内容");
      return;
    }
    selectionModeTriggerRef.current = event?.currentTarget || null;
    const anchor = moveState.positions[0] ?? null;
    setInsertMode(false);
    setRangePicking(true);
    setRangeAnchor(anchor);
    notifyStatus(anchor === null
      ? "选择范围起点"
      : (anchor === 0 && excerptPresent ? "起点为原生摘录，再选择终点" : "已使用当前首项作为起点，再选择终点"));
  };

  const toggleInsertMode = (event) => {
    if (loading || commandInFlightRef.current || !canPickInsertPosition) return;
    if (insertMode) {
      cancelSelectionMode();
      return;
    }
    selectionModeTriggerRef.current = event?.currentTarget || null;
    setRangePicking(false);
    setRangeAnchor(null);
    setInsertMode(true);
    notifyStatus("点击评论间的插入线，确定移动位置");
  };

  const openMergeDialog = (event) => {
    if (!selectedCanMergeAction) {
      notifyStatus("至少选择 2 条可合并的文本评论");
      return;
    }
    const mergeExcerptText = excerptPresent && excerpt.type === "text" && excerptCanCopyText
      ? String(excerpt.text || "").trim()
      : "";
    const text = [
      (excerptSelected || (canMergeToExcerpt && mergeToExcerptDefault)) && excerpt?.capabilities?.canCopyText
        ? excerpt.text
        : "",
      ...selectedComments.map(commentText),
    ].filter(Boolean).join("\n\n");
    const autoExcerptPrefix = mergeExcerptText ? `${mergeExcerptText}\n\n` : "";
    let autoExcerptPrefixApplied = canMergeToExcerpt && mergeToExcerptDefault && !excerptSelected && !!autoExcerptPrefix;
    setDialog({
      focusManaged: true,
      closeBeforeConfirm: true,
      title: "合并为一条评论",
      body: `${excerptSelected
        ? (excerpt.type === "image"
          ? "已选中的图片摘录会跳过；所选文本评论可继续合并，图片摘录只会在选择“合并到摘录”时转为普通合并摘录评论。"
          : "原生文本摘录已包含在当前选区中；你也可以改为把结果写回文本摘录。")
        : "所选文本会合并成一条新的 Markdown 评论，原评论会被移除。"}${mergeDefaultLoadError ? `\n\n默认合并设置读取失败：${mergeDefaultLoadError}。本次先按未启用处理；手动切换后会重新核对保存结果。` : ""}`,
      inputLabel: "合并后的内容",
      inputValue: text,
      checkboxLabel: "合并到摘录",
      checkboxDescription: mergeToExcerptBlockedByMedia
        ? "音频/视频摘录暂不支持；请使用普通合并。"
        : (excerpt.type === "image"
          ? "先将图片摘录转为合并摘录评论，再把编辑后的文本设为新的文本摘录。"
          : (mergeExcerptText ? "把现有文本摘录放在前面，并将编辑后的结果写回文本摘录。" : "把编辑后的结果设为新的文本摘录。")),
      checkboxDisabled: !canMergeToExcerpt,
      checkboxDefault: canMergeToExcerpt && mergeToExcerptDefault,
      onCheckChange: (checked, currentValue) => {
        persistMergeToExcerptDefault(checked);
        if (!mergeExcerptText) return currentValue;
        if (checked && !autoExcerptPrefixApplied && !String(currentValue || "").startsWith(autoExcerptPrefix)) {
          autoExcerptPrefixApplied = true;
          return `${autoExcerptPrefix}${String(currentValue || "")}`;
        }
        if (!checked && autoExcerptPrefixApplied && String(currentValue || "").startsWith(autoExcerptPrefix)) {
          autoExcerptPrefixApplied = false;
          return String(currentValue || "").slice(autoExcerptPrefix.length);
        }
        return currentValue;
      },
      confirmText: "合并",
      returnFocusTarget: event?.currentTarget || null,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async (value, options) => {
        if (options?.checked && canMergeToExcerpt) {
          await runCommand("mergeCommentsToExcerpt", {
            noteId: snapshot.noteId,
            selection: contentSelection,
            text: value,
            markdown: true,
          }, { message: "已合并到文本摘录" });
          return;
        }
        if (!selectedCanMergeText) {
          notifyStatus("当前选区只能使用“合并到摘录”");
          return;
        }
        await runCommand("mergeContentSelection", {
          noteId: snapshot.noteId,
          selection: contentSelection,
          text: value,
          markdown: true,
          mode: "text",
        }, { message: "评论已合并" });
      },
    });
  };

  const openInlineMergeDialog = (event) => {
    if (selectedContentCount < 2) {
      notifyStatus("至少选择 2 项内容才能合并");
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
      body: excerptSelected
        ? "原生文本摘录会先转为普通评论，再与连续选择的卡片链接整理成一条 Markdown 评论。"
        : "把连续选择的文本和卡片链接整理成一条 Markdown 评论，原评论会被移除。",
      materials: [
        ...(excerptSelected ? [buildExcerptInlineMergeMaterial(excerpt)] : []),
        ...selectedComments.map((comment, order) => buildInlineMergeMaterial(comment, order + (excerptSelected ? 1 : 0))),
      ],
      selection: contentSelection,
      confirmText: "合并",
      pendingText: "合并中…",
      returnFocusTarget: event?.currentTarget || null,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async (value) => {
        const text = String(value || "").trim();
        if (!text) {
          notifyStatus("请先填写合并后的内容");
          return;
        }
        await runCommand("mergeContentSelection", {
          noteId: snapshot.noteId,
          selection: contentSelection,
          text,
          markdown: true,
          mode: "inline",
        }, { message: "行内链接已合并" });
      },
    });
  };

  const openEditDialog = (event) => {
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
    const returnFocusTarget = event?.currentTarget && typeof event.currentTarget.focus === "function"
      ? event.currentTarget
      : null;
    const returnFocusFallback = document.getElementById(`comment-${index}`);
    setDialog({
      kind: "editCommentText",
      title: `编辑评论 #${index}`,
      body: "只修改这条评论的文本内容；如需维护卡片链接，请使用链接相关操作。",
      inputLabel: "评论内容",
      inputValue: commentText(current),
      confirmText: "保存",
      pendingText: "保存中…",
      closeOnConfirmSuccess: true,
      returnFocusTarget,
      returnFocusFallback: returnFocusFallback && typeof returnFocusFallback.focus === "function"
        ? returnFocusFallback
        : null,
      onConfirm: async (value) => {
        await runCommand("editCommentText", {
          noteId: snapshot.noteId,
          index,
          text: value,
          markdown: !!current?.capabilities?.isMarkdown,
        }, { message: "评论已更新" });
      },
    });
  };

  const openMarkdownLinkEditDialog = (comment, link, linkIndex, returnFocusTarget = null) => {
    if (!comment || !link) return;
    setDialog({
      kind: "editMarkdownLink",
      title: `编辑 #${comment.index} 的行内链接`,
      body: "只替换这一个 Markdown 行内链接，评论里的其他内容保持不变。",
      commentIndex: comment.index,
      linkIndex,
      displayText: link.displayText || "",
      url: link.url || "",
      confirmText: "保存链接",
      pendingText: "保存中…",
      returnFocusTarget: returnFocusTarget && typeof returnFocusTarget.focus === "function"
        ? returnFocusTarget
        : null,
      onConfirm: async ({ displayText, url }) => {
        await runCommand("editMarkdownLink", {
          noteId: snapshot.noteId,
          commentIndex: comment.index,
          linkIndex,
          displayText,
          url,
        }, { message: "行内链接已更新" });
      },
    });
  };

  const openConvertHtmlToMarkdownDialog = (event) => {
    if (!selectedHasHtmlComments) {
      notifyStatus("先选择 HTML 评论");
      return;
    }
    const skipped = selectedComments.length - selectedHtmlComments.length;
    setDialog({
      focusManaged: true,
      closeBeforeConfirm: true,
      title: "转为 Markdown",
      body: [
        `将转换当前卡片中选中的 ${selectedHtmlComments.length} 条 HTML 评论。`,
        skipped > 0 ? `另外 ${skipped} 条非 HTML 评论会跳过。` : "",
        excerptSelected ? "所选原生摘录保持不变，卡片不会转为非摘录版。" : "",
        "可保留的标题、强调、链接、图片、列表和代码会转为 Markdown；含不支持的样式或结构时保留原 HTML。",
      ].filter(Boolean).join("\n"),
      confirmText: "确认转换",
      returnFocusTarget: event?.currentTarget || null,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async () => {
        await runCommand("convertHtmlCommentsToMarkdown", {
          noteId: snapshot.noteId,
          indices: selectedIndices,
        }, { message: excerptSelected ? "HTML 评论已转为 Markdown；原生摘录保持不变" : "HTML 评论已转为 Markdown" });
      },
    });
  };

  const locateMarkdownLink = async (link, mode = "mindmap") => {
    const noteId = extractMarginNoteUrlNoteId(link?.url);
    if (!noteId) {
      notifyStatus("这个行内链接不是 MarginNote 卡片链接");
      return;
    }
    await locateLinkedNote(noteId, mode);
  };

  const updateLinkCommentFromClipboard = async (comment) => {
    if (!comment || !canComment(comment, "canUpdateLink")) return;
    await runCommand("updateLinkCommentFromClipboard", {
      noteId: snapshot.noteId,
      commentIndex: comment.index,
    }, { message: "链接已更新", keepSelection: true });
  };

  const openExtractDialog = (event) => {
    if (!requireSelection()) return;
    setDialog({
      focusManaged: true,
      closeBeforeConfirm: true,
      title: "提取为子卡片",
      body: excerptSelected
        ? "将创建一个子卡片；所选原生摘录会成为子卡片的第一条普通评论，其余内容按当前顺序保留。"
        : "将创建一个子卡片，只保留所选评论。图片、手写、音频等内容会尽量保留。",
      inputLabel: "新卡片标题",
      inputValue: "",
      clearInputText: "清空标题",
      checkboxLabel: "同时删除原卡片中的所选内容",
      checkboxDescription: excerptSelected
        ? "源卡片会先转为非摘录版，再删除完整映射选区。"
        : "只删除当前卡片里的这些评论，不清理目标卡片中的反向链接。",
      checkboxDefault: false,
      confirmText: "创建子卡片",
      returnFocusTarget: event?.currentTarget || null,
      returnFocusFallback: document.getElementById("selection-summary"),
      onConfirm: async (value, options = {}) => {
        await runCommand("extractContentSelectionToChildNote", {
          noteId: snapshot.noteId,
          selection: contentSelection,
          title: value,
          removeOriginal: options.checked === true,
        }, { message: options.checked ? "子卡片已创建，原评论已删除" : "子卡片已创建" });
      },
    });
  };

  const copySelectedText = async () => {
    if (!requireSelection()) return;
    if (!selectedCanCopyText) {
      notifyStatus("所选内容没有可复制的文本");
      return;
    }
    await runCommand("copyContentText", {
      noteId: snapshot.noteId,
      selection: contentSelection,
    }, { message: "文本已复制", keepSelection: true });
  };

  const copySelectedImage = async () => {
    if (!hasOneSelection) {
      notifyStatus("复制图片时只能选择 1 项图片内容");
      return;
    }
    if (!selectedCanCopyImage) {
      notifyStatus("所选内容没有可复制的图片");
      return;
    }
    await runCommand("copyContentImage", {
      noteId: snapshot.noteId,
      selection: contentSelection,
    }, { message: "图片已复制", keepSelection: true });
  };

  const moveActions = [
    { key: "top", label: "移到最上方", visible: canMoveSelectionToTop, onClick: (event) => moveSelection(moveState.topBoundary, "已移到最上方", event.currentTarget) },
    { key: "up", label: "上移", visible: canMoveSelectionUp, onClick: (event) => moveByStep("up", event.currentTarget) },
    { key: "down", label: "下移", visible: canMoveSelectionDown, onClick: (event) => moveByStep("down", event.currentTarget) },
    { key: "bottom", label: "移到最下方", visible: canMoveSelectionToBottom, onClick: (event) => moveSelection(moveState.totalCount, "已移到最下方", event.currentTarget) },
  ].filter((action) => action.visible);
  const hasMoveActions = moveActions.length > 0 || canPickInsertPosition;
  const processActions = [
    { key: "copy-text", label: "复制文本", visible: selectedCanCopyText, onClick: copySelectedText },
    { key: "copy-image", label: "复制图片", visible: selectedCanCopyImage, onClick: copySelectedImage },
    { key: "edit-text", label: "编辑文本", visible: selectedCanEditText, onClick: openEditDialog },
    { key: "html-to-markdown", label: "转为 Markdown", visible: selectedHasHtmlComments, onClick: openConvertHtmlToMarkdownDialog },
    { key: "merge-text", label: "合并文本", visible: selectedCanMergeAction, onClick: openMergeDialog },
    { key: "inline-merge", label: "生成行内链接", visible: selectedCanInlineMerge, onClick: openInlineMergeDialog },
    { key: "extract", label: "提取为子卡片", visible: hasSelection, onClick: openExtractDialog },
  ].filter((action) => action.visible);

  const scrollToComment = (index) => scrollElementIntoView(document.getElementById(`comment-${index}`));

  const scrollToTop = () => {
    if (excerptPresent) return scrollElementIntoView(document.getElementById("native-excerpt"));
    return scrollToComment(visibleComments[0]?.index);
  };

  const rangeHint = rangePicking
    ? (rangeAnchor === null
      ? "先点范围的第一项内容"
      : (rangeAnchor === 0 && excerptPresent ? "起点为原生摘录，再点范围终点" : "已选择范围起点，再点范围终点"))
    : "";
  const selectionModeTitle = rangePicking
    ? (rangeAnchor === null ? "选择范围起点" : "选择范围终点")
    : "选择插入位置";
  const rangeAnchorLabel = rangeAnchor === 0 && excerptPresent
    ? "原生摘录"
    : `评论 #${rangeAnchor - (excerptPresent ? 1 : 0)}`;
  const selectionModeDescription = rangePicking
    ? (rangeAnchor === null
      ? "点选卡片或复选框，设置范围起点。"
      : `${rangeAnchorLabel} 为起点，点选终点完成。`)
    : `已选 ${selectedContentCount} 项，点击评论间的插入线确定位置。`;

  const openActionButtonSettings = async (event) => {
    const returnFocusTarget = event?.currentTarget || null;
    if (overlayOpeningRef.current) return;
    const openingToken = "settings";
    overlayOpeningRef.current = openingToken;
    setOpeningOverlay(openingToken);
    notifyStatus("正在打开评论管理设置…");
    const sessionId = actionButtonSettingsSessionRef.current + 1;
    actionButtonSettingsSessionRef.current = sessionId;
    try {
      const settings = await MNBridge.send("getActionButtonSettings");
      if (!appMountedRef.current || actionButtonSettingsSessionRef.current !== sessionId) return;
      setShowImageExcerptText(settings?.showImageExcerptText === true);
      setActionButtonSettings({ values: settings, returnFocusTarget, sessionId });
    } catch (error) {
      if (appMountedRef.current && actionButtonSettingsSessionRef.current === sessionId) notifyStatus(normalizeError(error));
    } finally {
      if (overlayOpeningRef.current === openingToken) {
        overlayOpeningRef.current = "";
        if (appMountedRef.current) setOpeningOverlay("");
      }
    }
  };

  const updateActionButtonSettings = async (changes, sessionId) => {
    const settings = await MNBridge.send("updateActionButtonSettings", changes);
    if (appMountedRef.current) setShowImageExcerptText(settings?.showImageExcerptText === true);
    setActionButtonSettings((current) => applyActionButtonSettingsForSession(current, sessionId, settings));
    return settings;
  };

  const reloadActionButtonSettings = async (sessionId) => {
    const settings = await MNBridge.send("getActionButtonSettings");
    if (appMountedRef.current) setShowImageExcerptText(settings?.showImageExcerptText === true);
    setActionButtonSettings((current) => applyActionButtonSettingsForSession(current, sessionId, settings));
    return settings;
  };

  const closeActionButtonSettings = () => {
    actionButtonSettingsSessionRef.current += 1;
    setActionButtonSettings(null);
  };

  const openWorkflowManager = async (event) => {
    const returnFocusTarget = event?.currentTarget || null;
    if (overlayOpeningRef.current) return;
    const openingToken = "workflow";
    overlayOpeningRef.current = openingToken;
    setOpeningOverlay(openingToken);
    notifyStatus("正在打开工作流管理器…");
    try {
      const [catalog, workflows] = await Promise.all([
        MNBridge.send("getWorkflowActionCatalog"),
        MNBridge.send("listWorkflows"),
      ]);
      if (!appMountedRef.current) return;
      setWorkflowManager({
        catalog: Array.isArray(catalog) ? catalog : [],
        workflows: Array.isArray(workflows) ? workflows : [],
        returnFocusTarget,
      });
    } catch (error) {
      if (appMountedRef.current) notifyStatus(normalizeError(error));
    } finally {
      if (overlayOpeningRef.current === openingToken) {
        overlayOpeningRef.current = "";
        if (appMountedRef.current) setOpeningOverlay("");
      }
    }
  };

  const closePanel = async () => {
    if (panelCloseRef.current) return;
    panelCloseRef.current = true;
    setClosingPanel(true);
    notifyStatus("正在关闭评论管理器…");
    try {
      await MNBridge.send("closePanel");
    } catch (error) {
      if (appMountedRef.current) notifyStatus(normalizeError(error));
    } finally {
      panelCloseRef.current = false;
      if (appMountedRef.current) setClosingPanel(false);
    }
  };

  const closeBatchEditor = async () => {
    // Clear the overlay immediately, then ask the native controller to close
    // and invalidate the batch token. This keeps WebView and native lifecycle
    // state aligned even when the bridge response is delayed.
    setBatchEditor(null);
    try {
      await MNBridge.send("closePanel", { reason: "batch-editor-close" });
    } catch (error) {
      if (appMountedRef.current) notifyStatus(normalizeError(error));
    }
  };

  return (
    <div className="comment-manager" onKeyDownCapture={handleSelectionModeKeyDown}>
      {batchEditor ? (
        <BatchCommentEditor key={batchEditor.token || "batch"} state={batchEditor} onClose={closeBatchEditor} onStatus={notifyStatus} />
      ) : null}
      <header className="topbar">
        <div className="topbar-title">
          <h1>评论管理器</h1>
          <p title={snapshot.noteTitle}>{snapshot.noteTitle || "当前没有选中的卡片"}</p>
        </div>
        <div className="topbar-actions">
          <Button
            className="secondary"
            disabled={!excerptPresent && visibleComments.length === 0}
            onClick={() => setContentSelection(makeContentSelection(excerptPresent, visibleComments.map((comment) => comment.index)))}
          >
            全选
          </Button>
          <Button
            className="secondary"
            disabled={!excerptPresent && visibleComments.length === 0}
            onClick={() => setContentSelection(makeContentSelection(
              excerptPresent && !excerptSelected,
              visibleComments.map((comment) => comment.index).filter((index) => !selected.has(index)),
            ))}
          >
            反选
          </Button>
          <Button className="secondary" disabled={!hasSelection} onClick={() => setContentSelection(makeContentSelection(false, []))}>清空</Button>
          <Button className={rangePicking ? "active" : "secondary"} aria-pressed={rangePicking ? "true" : "false"} disabled={loading || (!excerptPresent && comments.length === 0)} onClick={startRangeSelection} title={rangePicking ? "退出范围选择（Esc）" : "选择连续范围"}>选范围</Button>
          <Button className="secondary" onClick={loadCurrentNote} disabled={loading || !!openingOverlay || closingPanel}>刷新</Button>
          <Button className="secondary" disabled={loading || !!openingOverlay || closingPanel} onClick={openWorkflowManager} title="管理已保存工作流">{openingOverlay === "workflow" ? "打开中…" : "工作流"}</Button>
          <Button className="secondary" disabled={loading || !!openingOverlay || closingPanel} onClick={openActionButtonSettings} title="评论管理设置">{openingOverlay === "settings" ? "打开中…" : "设置"}</Button>
          <Button className="secondary" disabled={loading || !!openingOverlay || closingPanel} onClick={closePanel}>{closingPanel ? "关闭中…" : "关闭"}</Button>
        </div>
      </header>

      <div className="statusbar" aria-live="polite">
        <span>{excerptPresent ? "原生摘录 1 项" : "无原生摘录"}</span>
        <span>评论 {comments.length} 条</span>
        <span>已选 {excerptSelected ? "摘录 + " : ""}{selectedIndices.length} 条评论</span>
        <span>当前显示 {visibleComments.length} 条评论</span>
        <span key={`${statusKey}-${rangeHint}`} className="status-message updated">{rangeHint || status}</span>
      </div>

      <nav className="quick-nav" aria-label="快速定位">
        <span className="quick-nav-label">快速定位</span>
        <div className="quick-nav-track">
          <Button
            className="quick-nav-item"
            disabled={!excerptPresent && visibleComments.length === 0}
            onClick={scrollToTop}
          >
            顶部
          </Button>
          {fieldGroups.map((field) => (
            <Button
              key={field.id}
              className="quick-nav-item"
              onClick={() => scrollToComment(field.anchorIndex)}
            >
              <span>{field.name}</span>
              <b>{field.comments.length}</b>
            </Button>
          ))}
          <Button className="quick-nav-item" disabled={!excerptPresent && visibleComments.length === 0} onClick={() => excerptPresent && visibleComments.length === 0 ? scrollToTop() : scrollToComment(visibleComments[visibleComments.length - 1]?.index)}>底部</Button>
        </div>
      </nav>

      <main className="workspace">
        <aside className="left-pane">
          <section className="pane-section">
            <h2>查找</h2>
            <div className="search-box" role="search" aria-label="查找评论">
              <label htmlFor="comment-search">搜索评论</label>
              <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                id="comment-search"
                type="search"
                aria-label="搜索评论"
                aria-controls="comment-list"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                  if (event.key === "Escape" && search) {
                    event.preventDefault();
                    event.stopPropagation();
                    clearSearch();
                  }
                }}
                placeholder="搜索评论…"
                title="搜索文本、类型或目标卡片；Esc 清空搜索"
              />
              {search ? (
                <Button className="search-clear ghost" aria-label="清空搜索" title="清空搜索（Esc）" onClick={clearSearch}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
                  </svg>
                </Button>
              ) : null}
            </div>
            <div className="segmented">
              {visibleFilters.map((item) => (
                <Button
                  key={item.key}
                  className={filter === item.key ? "active" : ""}
                  aria-pressed={filter === item.key ? "true" : "false"}
                  onClick={() => setFilter(item.key)}
                >
                  <span>{item.label}</span>
                  <b>{filterCounts[item.key] || 0}</b>
                </Button>
              ))}
            </div>
            {filter === "link" ? (
              <Button className="secondary wide" disabled={loading || !snapshot.noteId} onClick={openInvalidLinkCleanup}>
                清除失效链接
              </Button>
            ) : null}
          </section>
        </aside>

        <div className="comment-pane">
          {hasActiveFilter || rangePicking || insertMode ? (
            <div className="list-context" role="group" aria-label={rangePicking || insertMode ? "选择操作" : "筛选结果"}>
              {rangePicking || insertMode ? (
                <div className="selection-mode-banner">
                  <span className="selection-mode-step" aria-hidden="true">{rangePicking ? (rangeAnchor === null ? "1" : "2") : "↕"}</span>
                  <div className="selection-mode-copy" role="status" aria-live="polite" aria-atomic="true">
                    <strong>{selectionModeTitle}</strong>
                    <p id="selection-mode-description">{selectionModeDescription}</p>
                    {rangePicking && hasActiveFilter ? <p className="selection-mode-note">包含中间被筛选隐藏的评论。</p> : null}
                  </div>
                  <Button className="secondary selection-mode-exit" disabled={loading} aria-label={rangePicking ? "退出范围选择" : "退出插入位置选择"} title="退出当前选择模式（Esc），保留选区" onClick={cancelSelectionMode}>退出</Button>
                </div>
              ) : null}
              {hasActiveFilter ? <div className="list-context-main">
                <div className="list-context-summary" role="status" aria-live="polite" aria-atomic="true">
                  <strong>{visibleComments.length}<span> / {comments.length} 条评论</span></strong>
                  <p title={filterDescription}>{filterDescription}</p>
                </div>
                <Button className="secondary filter-reset" onClick={clearSearchAndFilter}>重置筛选</Button>
              </div> : null}
              {hiddenSelectedCount > 0 ? (
                <p className="hidden-selection-notice" role="status">
                  {hiddenSelectedCount} 条已选评论被筛选隐藏，仍会参与操作。
                </p>
              ) : null}
            </div>
          ) : null}
        <section
          id="comment-list"
          className="comment-list"
          aria-label="原生摘录与评论列表"
          aria-busy={noteViewState.phase === "loading" || loading ? "true" : undefined}
          tabIndex={-1}
        >
          {excerptPresent ? (
            <article
              id="native-excerpt"
              className={`comment-card excerpt-card ${excerptSelected ? "selected" : ""} ${rangeAnchor === 0 ? "range-anchor" : ""}`}
              onClick={(event) => {
                if (!hasSelectedTextWithin(event.currentTarget)) handleContentClick("excerpt");
              }}
              role="button"
              aria-label={excerptSelected ? "取消选择原生摘录" : "选择原生摘录"}
              aria-pressed={excerptSelected ? "true" : "false"}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleContentClick("excerpt");
                }
              }}
            >
              <div className="comment-head">
                <SelectionCheckbox
                  checked={excerptSelected}
                  label={excerptSelected ? "取消选择原生摘录" : "选择原生摘录"}
                  descriptionId={rangePicking ? "selection-mode-description" : undefined}
                  onToggle={() => handleContentClick("excerpt")}
                />
                <span className="excerpt-identity">摘录</span>
                <span className={`type-pill type-${excerpt.type === "image" ? "image" : (excerpt.type === "text" ? "text" : "other")}`}>
                  {getExcerptTypeLabel(excerpt)}
                </span>
                {rangePicking && rangeAnchor === 0 ? <span className="range-anchor-label">起点</span> : null}
                <span className="excerpt-lock" title="卡片自身内容，转换为普通评论后才能移动" aria-label="原生摘录固定在评论列表上方">锁定</span>
              </div>
              <div className="comment-body excerpt-body">
                {normalizeImageSource(excerpt) ? <img src={normalizeImageSource(excerpt)} alt="当前卡片的原生摘录" /> : null}
                {excerpt.type === "image" && !showImageExcerptText ? null : excerpt.text && excerpt.textMarkdown ? (
                  <MarkdownCommentBody source={excerpt.text} />
                ) : excerpt.text ? (
                  <PlainTextPreview
                    text={excerpt.text}
                    contentId="excerpt-text-preview"
                    label="原生摘录全文"
                    maxLength={720}
                    expanded={expandedPreviews.has("excerpt")}
                    onToggle={() => togglePreviewExpansion("excerpt")}
                  />
                ) : excerpt.type === "image" ? (
                  <p className="no-text">图片摘录</p>
                ) : (
                  <p className="no-text">当前摘录没有可显示的文本预览</p>
                )}
              </div>
            </article>
          ) : null}
          {visibleComments.length === 0 ? (
            noteViewState.phase === "loading" ? (
              <EmptyState title="正在读取当前卡片" body="正在等待 MarginNote 返回摘录和评论…" />
            ) : noteViewState.phase === "unselected" ? (
              <EmptyState title="尚未选择卡片" body="请先在 MarginNote 中选中一张卡片，再重新读取。" actionText="重新读取" onAction={loadCurrentNote} />
            ) : noteViewState.phase === "error" ? (
              <EmptyState tone="error" title="无法读取当前卡片" body={noteViewState.error || "请检查 MarginNote 状态后重试。"} actionText="重试读取" onAction={loadCurrentNote} />
            ) : comments.length === 0 ? (
              <EmptyState title={excerptPresent ? "当前卡片还没有评论" : "当前卡片没有摘录或评论"} body={excerptPresent ? "原生摘录仍可在上方选择和处理。" : "可先在 MarginNote 中添加摘录或评论。"} />
            ) : (
              <EmptyState title="没有匹配的评论" body="当前类型或搜索条件没有结果。" actionText="清除筛选" onAction={clearSearchAndFilter} />
            )
          ) : visibleComments.map((comment, visiblePosition) => {
            const meta = getTypeMeta(comment);
            const selectedNow = selected.has(comment.index);
            const mediaSources = getCommentMediaSources(comment);
            const linkedDisplay = getLinkedNoteDisplay(comment);
            const markdownLinks = getMarkdownLinks(comment);
            const commentPosition = getCommentPosition(comment.index);
            const isFirstComment = commentPosition === 0;
            const isLastComment = commentPosition >= comments.length - 1;
            const insertVirtualTarget = getVirtualPositionForComment(comment.index, excerptPresent);
            const insertTargetIsNoop = moveState.continuous && insertVirtualTarget === moveState.positions[moveState.positions.length - 1] + 1;
            return (
              <div className="comment-row" key={comment.index}>
                {insertMode && !selectedNow && !insertTargetIsNoop ? (
                  <Button
                    className="insert-target"
                    disabled={loading || !hasSelection}
                    onClick={(event) => moveSelection(insertVirtualTarget, `已移动到评论 #${comment.index} 前`, event.currentTarget)}
                  >
                    移动到 #{comment.index} 前
                  </Button>
                ) : null}
                <article
                  id={`comment-${comment.index}`}
                  className={`comment-card comment-kind-${meta.filter} ${selectedNow ? "selected" : ""} ${rangeAnchor === getVirtualPositionForComment(comment.index, excerptPresent) ? "range-anchor" : ""}`}
                  onClick={(event) => {
                    if (!hasSelectedTextWithin(event.currentTarget)) handleCommentClick(comment.index);
                  }}
                  role="button"
                  aria-label={selectedNow ? `取消选择评论 #${comment.index}` : `选择评论 #${comment.index}`}
                  aria-pressed={selectedNow ? "true" : "false"}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCommentClick(comment.index);
                    }
                  }}
                >
                  <div className="comment-head">
                    <SelectionCheckbox
                      checked={selectedNow}
                      label={selectedNow ? `取消选择评论 #${comment.index}` : `选择评论 #${comment.index}`}
                      descriptionId={rangePicking ? "selection-mode-description" : undefined}
                      onToggle={() => handleCommentClick(comment.index)}
                    />
                    <span className="comment-index">#{comment.index}</span>
                    <span className={`type-pill type-${meta.filter}`}>{meta.label}</span>
                    {rangePicking && rangeAnchor === getVirtualPositionForComment(comment.index, excerptPresent) ? <span className="range-anchor-label">起点</span> : null}
                    {comment.linkDirection ? (
                      <span className={`direction-pill direction-${comment.linkDirection}`}>
                        {LINK_DIRECTION_LABELS[comment.linkDirection] || comment.linkDirection}
                      </span>
                    ) : null}
                    <span className="comment-position">{visiblePosition + 1}/{visibleComments.length}</span>
                    <div className="comment-inline-actions" aria-label={`评论 #${comment.index} 快捷操作`}>
                      {linkedDisplay ? (
                        <>
                          <Button
                            className={inlineLinkPressing === comment.index ? "quick-action-btn locate-action pressing" : "quick-action-btn locate-action"}
                            title="点按定位，按住在浮窗定位"
                            onPointerDown={(event) => startInlineLinkFocusPress(event, comment)}
                            onPointerUp={(event) => finishInlineLinkFocusPress(event, comment)}
                            onPointerLeave={(event) => cancelInlineLinkFocusPress(event, comment.index)}
                            onPointerCancel={(event) => cancelInlineLinkFocusPress(event, comment.index)}
                            onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => locateLinkedNote(comment.linkedNoteId, "mindmap")))}
                            onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => locateLinkedNote(comment.linkedNoteId, "mindmap")))}
                            onClick={(event) => event.stopPropagation()}
                            onContextMenu={(event) => event.preventDefault()}
                            onDragStart={(event) => event.preventDefault()}
                            onSelectStart={(event) => event.preventDefault()}
                            disabled={loading}
                            aria-label={`定位链接卡片：${linkedDisplay.title}`}
                          >
                            ⌖
                          </Button>
                          <Button
                            className="quick-action-btn update-link-action"
                            title="用剪贴板中的卡片链接更新"
                            disabled={loading || !canComment(comment, "canUpdateLink")}
                            onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => updateLinkCommentFromClipboard(comment)))}
                            onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => updateLinkCommentFromClipboard(comment)))}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateLinkCommentFromClipboard(comment);
                            }}
                            aria-label={`更新链接：${linkedDisplay.title}`}
                          >
                            ↻
                          </Button>
                        </>
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
                        onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "up", false)))}
                        onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "up", false)))}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                        onSelectStart={(event) => event.preventDefault()}
                        aria-label={`上移评论 #${comment.index}`}
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
                        onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "down", false)))}
                        onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "down", false)))}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                        onSelectStart={(event) => event.preventDefault()}
                        aria-label={`下移评论 #${comment.index}`}
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
                        onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => deleteSingleComment(comment.index)))}
                        onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => deleteSingleComment(comment.index)))}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                        onSelectStart={(event) => event.preventDefault()}
                        aria-label={`删除评论 #${comment.index}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="comment-body">
                    {mediaSources.length > 0 ? (
                      <div className={`comment-media-previews media-count-${mediaSources.length}`}>
                        {mediaSources.map((media) => (
                          <img key={media.key} src={media.src} alt={media.alt} loading="lazy" />
                        ))}
                      </div>
                    ) : null}
                    {comment.drawingPreviewPending === true ? (
                      <p className="media-converting" role="status">手写内容正在转换，完成后将自动刷新</p>
                    ) : comment.drawingPreviewError && mediaSources.length === 0 ? (
                      <p className="media-error">手写内容加载失败：{comment.drawingPreviewError}</p>
                    ) : null}
                    {linkedDisplay ? (
                      <div className="link-summary">
                        <p className="link-summary-title">{linkedDisplay.title}</p>
                        {linkedDisplay.url ? <p className="link-summary-url">{linkedDisplay.url}</p> : null}
                      </div>
                    ) : commentText(comment) && comment.capabilities?.isMarkdown ? (
                      <MarkdownCommentBody
                        source={commentText(comment)}
                        onLocateLink={(url) => locateMarkdownLink({ url }, "mindmap")}
                      />
                    ) : commentText(comment) ? (
                      <PlainTextPreview
                        text={commentText(comment)}
                        contentId={`comment-${comment.index}-text-preview`}
                        label={`评论 #${comment.index} 全文`}
                        maxLength={360}
                        expanded={expandedPreviews.has(`comment:${comment.index}`)}
                        onToggle={() => togglePreviewExpansion(`comment:${comment.index}`)}
                      />
                    ) : comment.capabilities?.hasImage && mediaSources.length === 0 && !comment.drawingPreviewPending && !comment.drawingPreviewError ? (
                      <p className="no-text">图片/手写评论</p>
                    ) : mediaSources.length > 0 ? null : comment.capabilities?.hasAudio ? (
                      <p className="no-text">音频评论</p>
                    ) : (
                      <p className="no-text">无文本内容</p>
                    )}
                    {markdownLinks.length > 0 ? (
                      <MarkdownLinkList
                        comment={comment}
                        links={markdownLinks}
                        loading={loading}
                        pressingKey={inlineLinkPressing}
                        onLocateStart={startMarkdownLinkFocusPress}
                        onLocateFinish={finishMarkdownLinkFocusPress}
                        onLocateCancel={cancelMarkdownLinkFocusPress}
                        onLocate={(link) => execute(() => locateMarkdownLink(link, "mindmap"))}
                        onEdit={openMarkdownLinkEditDialog}
                      />
                    ) : null}
                  </div>
                </article>
              </div>
            );
          })}
          {insertMode && canPickInsertPosition && canInsertAtEnd && visibleComments.length > 0 ? (
            <Button className="insert-end" disabled={loading || !hasSelection} onClick={(event) => moveSelection(moveState.totalCount, "已移动到最后", event.currentTarget)}>移动到最后</Button>
          ) : null}
        </section>

        </div>

        <aside className="right-pane">
          <section id="selection-summary" className="pane-section selection-summary" tabIndex={-1}>
            <h2>当前选择</h2>
            <p>{hasSelection
              ? [excerptSelected ? "原生摘录" : "", selectedIndices.length ? `${getSelectionHint(selectedComments)}：${selectedIndices.map((index) => `#${index}`).join(" ")}` : ""].filter(Boolean).join(" / ")
              : "尚未选择"}</p>
          </section>

          {hasMoveActions ? (
            <section className="pane-section move-section">
              <h2>移动</h2>
              {moveActions.length > 0 ? (
                <div className="button-grid move-controls">
                  {moveActions.map((action) => (
                    <Button key={action.key} onClick={action.onClick} disabled={loading}>{action.label}</Button>
                  ))}
                </div>
              ) : null}
              {canPickInsertPosition ? (
                <Button className={insertMode ? "active wide" : "secondary wide"} aria-pressed={insertMode ? "true" : "false"} disabled={loading} onClick={toggleInsertMode} title={insertMode ? "退出插入位置选择（Esc）" : "在评论间选择移动位置"}>选择插入位置</Button>
              ) : null}
            </section>
          ) : null}

          {processActions.length > 0 ? (
            <section className="pane-section process-section">
              <h2>处理</h2>
              <div className="stack">
                {processActions.map((action) => (
                  <Button key={action.key} className="secondary" disabled={loading} onClick={action.onClick}>{action.label}</Button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="pane-section danger-zone delete-section">
            <h2>删除</h2>
            <button
              type="button"
              className={deletePressing ? "danger wide pressing" : "danger wide"}
              onPointerDown={startDeletePress}
              onPointerUp={endDeletePress}
              onPointerLeave={cancelDeletePress}
              onPointerCancel={cancelDeletePress}
              onKeyDown={handleMainDeleteKeyboardEvent}
              onKeyUp={handleMainDeleteKeyboardEvent}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              onSelectStart={(event) => event.preventDefault()}
              disabled={loading || !hasSelection}
              title="点按删除所选内容；按住仅对纯卡片链接执行双向删除"
            >
              删除
            </button>
            <p>点按删除当前卡片中的所选内容。按住只处理纯卡片链接；包含原生摘录时不会进入双向删除。</p>
          </section>
        </aside>
      </main>

      {dialog ? (
        <Dialog dialog={dialog} loading={loading} onClose={() => setDialog(null)} />
      ) : null}
      {actionButtonSettings ? (
        <ActionButtonSettingsDialog
          settings={actionButtonSettings.values}
          loading={loading}
          onChange={(changes) => updateActionButtonSettings(changes, actionButtonSettings.sessionId)}
          onReload={() => reloadActionButtonSettings(actionButtonSettings.sessionId)}
          onStatus={notifyStatus}
          returnFocusTarget={actionButtonSettings.returnFocusTarget}
          onClose={closeActionButtonSettings}
        />
      ) : null}
      {workflowManager ? (
        <WorkflowManagerDialog
          initialCatalog={workflowManager.catalog}
          initialWorkflows={workflowManager.workflows}
          returnFocusTarget={workflowManager.returnFocusTarget}
          onClose={() => setWorkflowManager(null)}
          onStatus={notifyStatus}
        />
      ) : null}
      {invalidLinkCleanup ? (
        <InvalidLinkCleanupDialog
          state={invalidLinkCleanup}
          loading={loading}
          onChoose={(mode) => previewInvalidLinkCleanup(mode, invalidLinkCleanup.sessionId, invalidLinkCleanup.noteId)}
          onConfirm={confirmInvalidLinkCleanup}
          returnFocusTarget={invalidLinkCleanup.returnFocusTarget}
          returnFocusFallback={invalidLinkCleanup.returnFocusFallback}
          onClose={closeInvalidLinkCleanup}
        />
      ) : null}
    </div>
  );
}

function BatchCommentEditor({ state, onClose, onStatus }) {
  const [selectorTypes, setSelectorTypes] = useState([]);
  const [order, setOrder] = useState("forward");
  const [positionMode, setPositionMode] = useState("all");
  const [positionIndex, setPositionIndex] = useState("0");
  const [positionStart, setPositionStart] = useState("0");
  const [positionEnd, setPositionEnd] = useState("-1");
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [mergeableOnly, setMergeableOnly] = useState(false);
  const [action, setAction] = useState("convertSelectedHtmlToMarkdown");
  const [destination, setDestination] = useState("comment");
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchOperationKind, setBatchOperationKind] = useState("");
  const [savingRecording, setSavingRecording] = useState(false);
  const [recordingSaveFeedback, setRecordingSaveFeedback] = useState(null);
  const [savedRecordingSignature, setSavedRecordingSignature] = useState(() => batchRecordingDraftSignature("", []));
  const [closeConfirmation, setCloseConfirmation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [executionFailure, setExecutionFailure] = useState(null);
  const [editorMessage, setEditorMessage] = useState(state.error || "");
  const [editorMessageKind, setEditorMessageKind] = useState(state.error ? "error" : "status");
  const recordingSaveRef = useRef(false);
  const batchOperationRef = useRef(null);
  const previewRevisionRef = useRef(0);
  const closeConfirmationRef = useRef(null);
  const closeRequestedRef = useRef(false);
  const batchEditorRef = useRef(null);
  const closeDialogRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const dialogElement = batchEditorRef.current;
    const recordingToggle = dialogElement?.querySelector?.("[data-batch-recording-toggle]") || null;
    focusInitialDialogControl(dialogElement, recordingToggle);
  }, []);

  useEffect(() => {
    if (!closeConfirmation) return;
    if (closeConfirmation.kind === "saving" && !savingRecording) {
      cancelEditorClose();
      return;
    }
    const dialogElement = closeDialogRef.current;
    const cancelButton = dialogElement?.querySelector?.("[data-batch-close-cancel]") || null;
    focusInitialDialogControl(dialogElement, cancelButton);
  }, [closeConfirmation, savingRecording]);

  const selectorBase = {
    subject: "comments",
    types: selectorTypes,
    capabilities: mergeableOnly ? ["canMergeText"] : [],
    includeExcerpt,
    order,
  };
  const selector = selectorWithPosition(selectorBase, positionMode, {
    index: positionIndex,
    start: positionStart,
    end: positionEnd,
  });
  const selectorError = selectorPositionError(selector.position);
  const actionTitle = (id) => (state.catalog || []).find((item) => item.id === id)?.title || id;
  const selectorTitle = (item) => {
    const selectedTypes = item?.selector?.types || [];
    const typeLabel = selectedTypes.length ? selectedTypes.join("、") : "全部";
    const suffix = [
      item?.selector?.capabilities?.includes("canMergeText") ? "可合并" : "",
      item?.selector?.includeExcerpt === true ? "含摘录" : "",
      item?.selector?.order === "reverse" ? "倒序" : "",
      item?.selector?.position ? selectorPositionLabel(item.selector.position) : "",
    ].filter(Boolean);
    return `选择：${typeLabel}${suffix.length ? `（${suffix.join(" · ")}）` : ""}`;
  };
  const workflowStepTitle = (step) => String(step?.kind || "action").toLowerCase() === "select"
    ? selectorTitle(step)
    : actionTitle(step?.actionId);
  const cardTitle = (noteId) => (state.cards || []).find((card) => String(card.noteId || "") === String(noteId || ""))?.title || "";
  const report = (message, kind = "status") => {
    const normalized = String(message || "");
    if (mountedRef.current) {
      setEditorMessage(normalized);
      setEditorMessageKind(kind);
    }
    onStatus(normalized);
  };

  const invalidateBatchPreview = () => {
    previewRevisionRef.current += 1;
    if (mountedRef.current) setPreview(null);
  };

  const beginBatchOperation = (kind) => {
    if (batchOperationRef.current) {
      report("请等待当前批量操作完成");
      return null;
    }
    const operation = { kind };
    batchOperationRef.current = operation;
    setBusy(true);
    setBatchOperationKind(kind);
    return operation;
  };

  const finishBatchOperation = (operation) => {
    if (batchOperationRef.current !== operation) return;
    batchOperationRef.current = null;
    if (!mountedRef.current) return;
    setBusy(false);
    setBatchOperationKind("");
  };

  const closeEditorOnce = () => {
    if (closeRequestedRef.current) return undefined;
    closeRequestedRef.current = true;
    return onClose();
  };

  const requestEditorClose = (eventOrTarget) => {
    if (batchOperationRef.current || busy || closeConfirmationRef.current) return;
    const returnFocusTarget = eventOrTarget?.currentTarget || eventOrTarget || null;
    const confirmation = buildBatchRecordingCloseConfirmation({
      saving: recordingSaveRef.current || savingRecording,
      name,
      steps,
      savedSignature: savedRecordingSignature,
      feedback: recordingSaveFeedback,
    });
    if (!confirmation) return closeEditorOnce();
    const nextConfirmation = { ...confirmation, returnFocusTarget };
    closeConfirmationRef.current = nextConfirmation;
    setCloseConfirmation(nextConfirmation);
  };

  const cancelEditorClose = () => {
    const current = closeConfirmationRef.current;
    if (!current) return;
    closeConfirmationRef.current = null;
    setCloseConfirmation(null);
    restoreFocusAfterDialogClose(current.returnFocusTarget, batchEditorRef.current);
  };

  const confirmEditorClose = () => {
    if (!closeConfirmationRef.current) return;
    closeConfirmationRef.current = null;
    setCloseConfirmation(null);
    return closeEditorOnce();
  };

  const appendRecorded = (nextSteps) => {
    if (!recording || recordingSaveRef.current) return;
    setRecordingSaveFeedback(null);
    setSteps((current) => {
      // Only fold a repeated selector at the end of the draft. Selectors
      // belonging to earlier actions must remain in the recorded sequence.
      const compact = current.slice();
      if (compact.length > 0 && compact[compact.length - 1].kind === "select") compact.pop();
      return [...compact, ...nextSteps];
    });
  };

  const toggleRecording = () => {
    if (recordingSaveRef.current) return;
    setRecordingSaveFeedback(null);
    setRecording((value) => !value);
  };

  const execute = async () => {
    if (selectorError) return report(selectorError, "error");
    const operation = beginBatchOperation("execute");
    if (!operation) return;
    invalidateBatchPreview();
    if (mountedRef.current) setExecutionFailure(null);
    try {
      const workflow = {
        id: `draft-${Date.now()}`,
        name: "多卡临时操作",
        scope: "batch",
        steps: [
          { kind: "select", selector },
          { kind: "action", actionId: action, options: action === "mergeSelectedComments" ? { destination, markdown: true, separator: "\n\n" } : {} },
        ],
      };
      const result = await MNBridge.send("runBatchWorkflow", { token: state.token, workflow });
      if (!mountedRef.current || batchOperationRef.current !== operation) return;
      // Failed or cancelled executions are deliberately not recorded. A
      // partial result may have mutated some cards, but it is not a confirmed
      // workflow step from the user's perspective.
      if (result?.completed === true) {
        appendRecorded(workflow.steps);
        report(result.statusMessage || "批量操作已完成");
      } else if (result?.cancelled) {
        report("已取消执行，未写入录制草稿");
      } else if (result?.completed === false) {
        if (mountedRef.current) setExecutionFailure(buildBatchExecutionFailure(result, workflow, workflowStepTitle));
        report(result.statusMessage || "批量操作未完成");
      }
    } catch (error) {
      if (mountedRef.current && batchOperationRef.current === operation) report(normalizeError(error), "error");
    } finally {
      finishBatchOperation(operation);
    }
  };

  const previewSelection = async () => {
    if (selectorError) return report(selectorError, "error");
    const operation = beginBatchOperation("preview");
    if (!operation) return;
    const previewRevision = previewRevisionRef.current + 1;
    previewRevisionRef.current = previewRevision;
    if (mountedRef.current) setPreview(null);
    try {
      const workflow = {
        name: "多卡临时预览",
        scope: "batch",
        steps: [{ kind: "select", selector }],
      };
      const result = await MNBridge.send("previewBatchWorkflow", { token: state.token, workflow });
      if (!mountedRef.current || batchOperationRef.current !== operation || previewRevisionRef.current !== previewRevision) return;
      setPreview(result);
      report(`预览：共匹配 ${result?.steps?.[0]?.totalMatched || 0} 条评论`);
    } catch (error) {
      if (mountedRef.current && batchOperationRef.current === operation && previewRevisionRef.current === previewRevision) {
        report(normalizeError(error), "error");
      }
    } finally {
      finishBatchOperation(operation);
    }
  };

  const saveRecording = async () => {
    const trimmed = name.trim();
    if (batchOperationRef.current || busy) return report("请等待当前批量操作完成后再保存工作流", "error");
    if (!trimmed || steps.length === 0) return report("请先录制至少一个动作并填写名称", "error");

    if (recordingSaveRef.current) return;
    recordingSaveRef.current = true;
    setSavingRecording(true);
    setRecordingSaveFeedback({
      kind: "saving",
      message: `正在保存工作流「${trimmed}」…录制草稿已锁定；关闭编辑器不会撤回已发出的保存请求。`,
    });

    const submittedSteps = steps.slice();
    try {
      const saved = await MNBridge.send("saveWorkflow", {
        name: trimmed,
        scope: "batch",
        steps: submittedSteps,
      });
      const savedWorkflow = Array.isArray(saved) ? (saved.length === 1 ? saved[0] : null) : saved;
      // A transport response alone does not confirm that the recording was saved.
      if (!savedWorkflow || typeof savedWorkflow.id !== "string" || !savedWorkflow.id.trim()
        || savedWorkflow.name !== trimmed.slice(0, 120) || savedWorkflow.scope !== "batch"
        || !Array.isArray(savedWorkflow.steps) || savedWorkflow.steps.length !== submittedSteps.length
        || !savedWorkflow.steps.every((step) => step && (
          step.kind === "select"
            ? step.selector && typeof step.selector === "object" && !Array.isArray(step.selector)
            : step.kind === "action" && typeof step.actionId === "string" && step.actionId.trim()
              && step.options && typeof step.options === "object" && !Array.isArray(step.options)
        ))) {
        const receiptError = new Error("保存结果未确认：收到的工作流回执不完整或不匹配，请先核对实际保存状态，再决定是否重试");
        receiptError.saveUnconfirmed = true;
        throw receiptError;
      }
      const message = `已保存工作流「${savedWorkflow.name}」`;
      onStatus(message);
      if (!mountedRef.current) return;
      setEditorMessage(message);
      setEditorMessageKind("success");
      setRecordingSaveFeedback({ kind: "success", message });
      setSavedRecordingSignature(batchRecordingDraftSignature("", submittedSteps));
      setRecording(false);
      setName("");
    } catch (error) {
      const message = normalizeError(error);
      onStatus(message);
      if (!mountedRef.current) return;
      setEditorMessage(message);
      setEditorMessageKind("error");
      setRecordingSaveFeedback({
        kind: "error",
        message: error?.saveUnconfirmed
          ? `${message}。录制名称和步骤仍保留。`
          : `保存失败：${message}。录制名称和步骤仍保留，请检查后手动重试。`,
      });
    } finally {
      recordingSaveRef.current = false;
      if (mountedRef.current) setSavingRecording(false);
    }
  };

  return (
    <div className="dialog-backdrop batch-editor-backdrop" role="presentation">
      <section
        ref={batchEditorRef}
        className="dialog batch-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-editor-title"
        aria-busy={busy || savingRecording ? "true" : undefined}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (isComposingKeyEvent(event)) return;
          if (closeConfirmationRef.current) return;
          keepFocusWithinDialog(event, batchEditorRef.current);
        }}
      >
        <header className="batch-editor-header">
          <div><h2 id="batch-editor-title">多卡评论编辑器</h2><p>{(state.noteIds || []).length} 张卡片 · 每张卡片分别处理</p></div>
          <Button data-batch-recording-toggle className={recording ? "danger" : "secondary"} aria-pressed={recording ? "true" : "false"} disabled={busy || savingRecording} onClick={toggleRecording}>{recording ? "停止录制" : "开始录制"}</Button>
        </header>
        {editorMessage ? <p className={`batch-editor-status ${editorMessageKind}`} role={editorMessageKind === "error" ? "alert" : "status"}>{editorMessage}</p> : null}
        <div className="batch-editor-grid">
          <section><h3>卡片概览</h3>{(state.cards || []).map((card) => <div className="batch-card-summary" key={card.noteId}><strong>{card.title}</strong><small>{card.commentCount ?? card.commentCounts?.all ?? 0} 条评论 · 摘录：{card.excerptType}</small><span>文本 {card.commentCounts?.text || 0} · Markdown {card.commentCounts?.markdown || 0} · HTML {card.commentCounts?.html || 0}</span></div>)}</section>
          <section>
            <h3>选择器</h3>
            <CommentTypeSelector types={selectorTypes} disabled={busy} onChange={(types) => { setSelectorTypes(types); invalidateBatchPreview(); }} />
            <label>
              位置
              <select disabled={busy} value={positionMode} onChange={(event) => { setPositionMode(event.target.value); invalidateBatchPreview(); }}>
                {WORKFLOW_POSITION_MODES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            {positionMode === "single" ? (
              <label>
                评论索引
                <input disabled={busy} inputMode="numeric" value={positionIndex} onChange={(event) => { setPositionIndex(event.target.value); invalidateBatchPreview(); }} placeholder="例如 0 或 -1" />
              </label>
            ) : null}
            {positionMode === "range" ? (
              <div className="workflow-position-range">
                <label>范围起点<input disabled={busy} inputMode="numeric" value={positionStart} onChange={(event) => { setPositionStart(event.target.value); invalidateBatchPreview(); }} /></label>
                <label>范围终点<input disabled={busy} inputMode="numeric" value={positionEnd} onChange={(event) => { setPositionEnd(event.target.value); invalidateBatchPreview(); }} /></label>
              </div>
            ) : null}
            <small className={selectorError ? "workflow-input-error" : "workflow-options-hint"}>{selectorError || "0 = 第一条，-1 = 最后一条；范围端点含首尾"}</small>
            <label>
              排列顺序
              <select disabled={busy} value={order} onChange={(event) => { setOrder(event.target.value); invalidateBatchPreview(); }}>
                <option value="forward">正序</option>
                <option value="reverse">倒序</option>
              </select>
            </label>
            <label className="dialog-check"><input type="checkbox" disabled={busy} checked={mergeableOnly} onChange={(event) => { setMergeableOnly(event.target.checked); invalidateBatchPreview(); }} /><span>仅可合并文本</span></label>
            <label className="dialog-check"><input type="checkbox" disabled={busy} checked={includeExcerpt} onChange={(event) => { setIncludeExcerpt(event.target.checked); invalidateBatchPreview(); }} /><span>包含原生摘录</span></label>
            {preview?.steps?.[0]?.perCard ? <div className="batch-preview-list">{preview.steps[0].perCard.map((item, index) => <span key={index}>卡片 {index + 1}：{item.positionOutOfRange ? "位置不存在，跳过" : `匹配 ${item.matched} 条`}</span>)}</div> : null}
            <Button className="secondary wide" disabled={busy || !!selectorError} onClick={previewSelection}>{batchOperationKind === "preview" ? "预览中…" : "预览匹配"}</Button>
          </section>
          <section>
            <h3>动作</h3>
            <select disabled={busy || savingRecording} value={action} onChange={(event) => { setAction(event.target.value); invalidateBatchPreview(); }}>
              {(state.catalog || []).filter((item) => item.compatible !== false).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            {action === "mergeSelectedComments" ? (
              <label>
                目标
                <select disabled={busy || savingRecording} value={destination} onChange={(event) => { setDestination(event.target.value); invalidateBatchPreview(); }}>
                  <option value="comment">合并为评论</option>
                  <option value="excerpt">合并到摘录</option>
                </select>
              </label>
            ) : null}
            <Button className="primary wide" disabled={busy || savingRecording || !!selectorError} onClick={execute}>{batchOperationKind === "execute" ? "执行中…" : "执行当前操作"}</Button>
          </section>
        </div>
        {executionFailure ? (
          <section className="batch-execution-result" role="alert" aria-labelledby="batch-execution-result-title">
            <header className="batch-execution-result-header">
              <div>
                <h3 id="batch-execution-result-title">上次批量操作未完成</h3>
                <p>{executionFailure.statusMessage}</p>
              </div>
              <strong className="batch-execution-progress">已完成 {executionFailure.completedSteps}/{executionFailure.totalSteps} 步</strong>
            </header>
            <ol className="batch-execution-steps" aria-label="本次工作流步骤状态">
              {executionFailure.steps.map((step) => (
                <li className={`batch-execution-step ${step.status}`} key={step.number}>
                  <span className="batch-execution-step-number" aria-hidden="true">{step.number}</span>
                  <span>{step.title}</span>
                  <strong>{step.status === "completed" ? "已完成" : step.status === "failed" ? "失败" : "未执行"}</strong>
                </li>
              ))}
            </ol>
            {executionFailure.counts.length ? (
              <dl className="batch-execution-counts">
                {executionFailure.counts.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>
            ) : null}
            <div className="batch-execution-error">
              <strong>停止位置：第 {executionFailure.failedStepNumber} 步 · {executionFailure.failedStepTitle}</strong>
              {executionFailure.directError ? <p>{executionFailure.directError}</p> : null}
              {executionFailure.errors.length ? (
                <ul>
                  {executionFailure.errors.map((item, index) => {
                    const title = cardTitle(item.noteId);
                    return <li key={`${item.noteId}:${index}`}>{title ? <strong>{title}：</strong> : null}{item.message}</li>;
                  })}
                </ul>
              ) : null}
              {executionFailure.remainingErrorCount > 0 ? <p>另有 {executionFailure.remainingErrorCount} 条错误未展开。</p> : null}
            </div>
            <p className="batch-execution-note">在停止前完成的步骤，以及失败动作中已成功处理的卡片，可能已经发生修改；本次执行未写入录制草稿。请先检查卡片内容，再决定是否重试。</p>
          </section>
        ) : null}
        {recording || steps.length > 0 || name.trim() || recordingSaveFeedback ? (
          <section className="batch-recording" aria-busy={savingRecording ? "true" : undefined}>
            <h3>录制草稿{recording ? "（录制中）" : "（已停止）"}</h3>
            <p>仅记录本面板内点击“执行当前操作”后成功完成的动作；执行会实际修改所选卡片。预览和面板外操作不会被记录。停止录制后仍可保存草稿；也可在工作流管理器中直接编排步骤。</p>
            <p>{steps.length ? steps.map((step, index) => <span key={index}>{index + 1}. {step.kind === "select" ? selectorTitle(step) : actionTitle(step.actionId)}</span>) : "尚未录制操作"}</p>
            <div className="batch-recording-save">
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!recordingSaveRef.current) setRecordingSaveFeedback(null);
                }}
                placeholder="工作流名称"
                aria-label="工作流名称"
                readOnly={savingRecording}
              />
              <Button
                className="secondary"
                disabled={savingRecording || busy}
                onClick={saveRecording}
              >
                {savingRecording ? "保存中…" : "保存工作流"}
              </Button>
            </div>
            {recordingSaveFeedback ? (
              <p
                className={`batch-recording-save-feedback ${recordingSaveFeedback.kind}`}
                role={recordingSaveFeedback.kind === "error" ? "alert" : "status"}
              >
                {recordingSaveFeedback.message}
              </p>
            ) : null}
          </section>
        ) : null}
        <div className="dialog-actions"><Button data-batch-editor-close className="secondary" disabled={busy} onClick={requestEditorClose}>关闭</Button></div>
        {closeConfirmation ? (
          <div className="dialog-backdrop batch-recording-close-backdrop" role="presentation" onClick={cancelEditorClose}>
            <section
              ref={closeDialogRef}
              className="dialog batch-recording-close-dialog"
              data-close-kind={closeConfirmation.kind}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="batch-recording-close-title"
              aria-describedby="batch-recording-close-description batch-recording-close-note"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (isComposingKeyEvent(event)) return;
                if (keepFocusWithinDialog(event, closeDialogRef.current)) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelEditorClose();
                }
              }}
            >
              <h2 id="batch-recording-close-title">{closeConfirmation.title}</h2>
              <p id="batch-recording-close-description">{closeConfirmation.description}</p>
              <p id="batch-recording-close-note" className="batch-recording-close-note">{closeConfirmation.note}</p>
              <div className="dialog-actions">
                <Button data-batch-close-cancel className="secondary" onClick={cancelEditorClose}>{closeConfirmation.cancelText}</Button>
                <Button className="danger" onClick={confirmEditorClose}>{closeConfirmation.confirmText}</Button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ActionButtonSettingsDialog({
  settings,
  loading,
  onChange,
  onReload,
  onStatus,
  returnFocusTarget,
  onClose,
}) {
  const dialogRef = useRef(null);
  const firstCheckboxRef = useRef(null);
  const mountedRef = useRef(false);
  const closeRequestedRef = useRef(false);
  const savingRef = useRef("");
  const [savingKey, setSavingKey] = useState("");
  const [feedback, setFeedback] = useState(null);
  const busy = loading || !!savingKey;

  useEffect(() => {
    mountedRef.current = true;
    const dialogElement = dialogRef.current;
    const preferredTarget = firstCheckboxRef.current?.disabled ? null : firstCheckboxRef.current;
    focusInitialDialogControl(dialogElement, preferredTarget);
    return () => { mountedRef.current = false; };
  }, []);

  const requestClose = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onClose();
    restoreFocusAfterDialogClose(returnFocusTarget);
  };

  const saveSetting = async (key, nextValue, label) => {
    if (loading || savingRef.current) return;
    savingRef.current = key;
    setSavingKey(key);
    setFeedback({
      kind: "saving",
      message: `正在保存“${label}”；关闭窗口不会取消本次保存。`,
    });

    let result;
    try {
      result = await persistActionButtonSetting(onChange, onReload, key, nextValue, label);
    } catch (error) {
      result = { kind: "error", message: `保存失败：${normalizeError(error)}` };
    }

    savingRef.current = "";
    if (result.kind === "warning" || result.kind === "error") onStatus?.(result.message);
    if (!mountedRef.current) return;
    setSavingKey("");
    setFeedback(result);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={requestClose}>
      <section
        ref={dialogRef}
        className="dialog action-button-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-button-settings-title"
        aria-describedby="action-button-settings-description"
        aria-busy={busy ? "true" : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (isComposingKeyEvent(event)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
            return;
          }
          keepFocusWithinDialog(event, dialogRef.current);
        }}
      >
        <h2 id="action-button-settings-title">评论管理设置</h2>
        <p id="action-button-settings-description">这些设置会立即保存，并在下次打开笔记本时继续生效。</p>
        {feedback ? (
          <p
            id="action-button-settings-status"
            className={`action-button-settings-status ${feedback.kind}`}
            role={feedback.kind === "error" || feedback.kind === "warning" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
        <label className={savingKey === "showBatchButton" ? "dialog-check saving" : "dialog-check"}>
          <input
            ref={firstCheckboxRef}
            type="checkbox"
            checked={settings?.showBatchButton === true}
            disabled={busy}
            onChange={(event) => saveSetting("showBatchButton", event.target.checked, "多选时显示评论按钮")}
          />
          <span>
            <strong>多选时显示评论按钮</strong>
            <small>默认开启。关闭后，多选卡片不再显示“评论”批处理入口。</small>
          </span>
        </label>
        <label className={savingKey === "enableDynamicSingleCardButton" ? "dialog-check saving" : "dialog-check"}>
          <input
            type="checkbox"
            checked={settings?.enableDynamicSingleCardButton === true}
            disabled={busy}
            onChange={(event) => saveSetting("enableDynamicSingleCardButton", event.target.checked, "单卡时显示“评”按钮")}
          />
          <span>
            <strong>单卡时显示“评”按钮</strong>
            <small>点按打开评论管理器；长按打开单选处理菜单。</small>
          </span>
        </label>
        <label className={savingKey === "showImageExcerptText" ? "dialog-check saving" : "dialog-check"}>
          <input
            type="checkbox"
            checked={settings?.showImageExcerptText === true}
            disabled={busy}
            onChange={(event) => saveSetting("showImageExcerptText", event.target.checked, "显示图片摘录文本")}
          />
          <span>
            <strong>显示图片摘录文本</strong>
            <small>默认关闭。开启后，在图片摘录下方显示其文本内容；关闭只隐藏显示，原文仍会保留。</small>
          </span>
        </label>
        <div className="dialog-actions">
          <Button className="primary" onClick={requestClose}>完成</Button>
        </div>
      </section>
    </div>
  );
}

const WORKFLOW_POSITION_MODES = [
  { value: "all", label: "全部位置" },
  { value: "single", label: "单个位置" },
  { value: "range", label: "位置范围" },
];

function workflowIntegerError(value, label) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? "" : `${label}必须是整数`;
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return `${label}必须是整数`;
  return Number.isSafeInteger(Number(value.trim())) ? "" : `${label}超出可用范围`;
}

function selectorPositionError(position) {
  if (!position) return "";
  if (position.mode === "single") return workflowIntegerError(position.index, "评论索引");
  if (position.mode === "range") {
    return workflowIntegerError(position.start, "范围起点") || workflowIntegerError(position.end, "范围终点");
  }
  return "评论位置模式无效";
}

function selectorPositionLabel(position) {
  if (!position || position.mode === "all") return "全部位置";
  if (position.mode === "single") return `位置 #${position.index}`;
  return `位置 #${position.start} ～ ${position.end}`;
}

function selectorWithPosition(value, mode, fields) {
  const next = { ...(value || {}) };
  if (mode === "all") {
    delete next.position;
  } else if (mode === "single") {
    next.position = { mode, index: fields?.index ?? "0" };
  } else {
    next.position = { mode: "range", start: fields?.start ?? "0", end: fields?.end ?? "-1" };
  }
  return next;
}

function SelectorEditor({ selector, onChange, disabled = false }) {
  const value = selector && typeof selector === "object" ? selector : {};
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  const position = value.position && typeof value.position === "object" ? value.position : null;
  const positionMode = position?.mode === "single" || position?.mode === "range" ? position.mode : "all";
  const positionError = selectorPositionError(positionMode === "all" ? null : position);
  return (
    <div className="workflow-visual-options">
      <CommentTypeSelector types={value.types} disabled={disabled} onChange={(types) => onChange({ ...value, types })} />
      <label><span>处理顺序</span><select value={value.order === "reverse" ? "reverse" : "forward"} disabled={disabled} onChange={(event) => onChange({ ...value, order: event.target.value })}>
        <option value="forward">正序</option><option value="reverse">倒序</option>
      </select></label>
      <label><span>位置</span><select value={positionMode} disabled={disabled} onChange={(event) => onChange(selectorWithPosition(value, event.target.value, position))}>
        {WORKFLOW_POSITION_MODES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
      </select></label>
      {positionMode === "single" ? <label><span>评论索引</span><input disabled={disabled} inputMode="numeric" value={position?.index ?? "0"} placeholder="例如 0 或 -1" onChange={(event) => onChange(selectorWithPosition(value, "single", { index: event.target.value }))} /></label> : null}
      {positionMode === "range" ? <div className="workflow-position-range"><label><span>范围起点</span><input disabled={disabled} inputMode="numeric" value={position?.start ?? "0"} onChange={(event) => onChange(selectorWithPosition(value, "range", { start: event.target.value, end: position?.end ?? "-1" }))} /></label><label><span>范围终点</span><input disabled={disabled} inputMode="numeric" value={position?.end ?? "-1"} onChange={(event) => onChange(selectorWithPosition(value, "range", { start: position?.start ?? "0", end: event.target.value }))} /></label></div> : null}
      <small className={positionError ? "workflow-input-error" : "workflow-options-hint"}>{positionError || "0 = 第一条，-1 = 最后一条；范围端点含首尾"}</small>
      <label className="workflow-inline-check"><input type="checkbox" disabled={disabled} checked={capabilities.includes("canMergeText")} onChange={(event) => onChange({ ...value, capabilities: event.target.checked ? Array.from(new Set([...capabilities, "canMergeText"])) : capabilities.filter((item) => item !== "canMergeText") })} /><span>仅选择可合并文本</span></label>
      <label className="workflow-inline-check"><input type="checkbox" disabled={disabled} checked={value.includeExcerpt === true} onChange={(event) => onChange({ ...value, includeExcerpt: event.target.checked })} /><span>包含原生摘录</span></label>
    </div>
  );
}

function ActionOptionsEditor({ actionId, descriptor, options, onChange, disabled = false }) {
  if (Array.isArray(descriptor?.parameterSchema)) {
    return <WorkflowParameters schema={descriptor.parameterSchema} options={options} onChange={onChange} disabled={disabled} />;
  }
  if (["convertSelectedHtmlToMarkdown", "deleteSelectedComments", "reverseSelectedComments", "convertSelectedCardsToNoExcerpt", "keepFirstContent", "convertHtmlCommentsToMarkdown", "convertNotesToNoExcerpt", "removeAllLinkComments", "clearAllComments", "clearAllTitles"].includes(actionId)) {
    return <small className="workflow-options-hint">此动作没有需要配置的参数。</small>;
  }
  return <small className="workflow-options-hint">此扩展动作没有可视化参数；已有配置会原样保留。</small>;
}

function WorkflowManagerDialog({ initialCatalog, initialWorkflows, returnFocusTarget, onClose, onStatus }) {
  const catalog = Array.isArray(initialCatalog) ? initialCatalog : [];
  const initialWorkflow = initialWorkflows?.[0] || null;
  const [workflows, setWorkflows] = useState(() => (Array.isArray(initialWorkflows) ? initialWorkflows : []));
  const [selectedId, setSelectedId] = useState(() => initialWorkflow?.id || "");
  const [draft, setDraft] = useState(() => cloneWorkflowDraft(initialWorkflow));
  const [savedDraftSignature, setSavedDraftSignature] = useState(() => workflowDraftSignature(initialWorkflow));
  const [busy, setBusy] = useState(false);
  const [workflowMutationKind, setWorkflowMutationKind] = useState("");
  const [workflowFeedback, setWorkflowFeedback] = useState(null);
  const [newActionId, setNewActionId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingDraftTransition, setPendingDraftTransition] = useState(null);
  const [pendingMutationClose, setPendingMutationClose] = useState(null);
  const pendingDraftTransitionRef = useRef(null);
  const pendingMutationCloseRef = useRef(null);
  const workflowManagerRef = useRef(null);
  const pendingStepFocusRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const deleteReturnFocusTargetRef = useRef(null);
  const discardDialogRef = useRef(null);
  const mutationCloseDialogRef = useRef(null);
  const workflowMutationRef = useRef(null);
  const workflowMountedRef = useRef(true);
  const hasUnsavedChanges = workflowDraftSignature(draft) !== savedDraftSignature;

  useEffect(() => {
    workflowMountedRef.current = true;
    return () => { workflowMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (hasUnsavedChanges && workflowFeedback?.kind === "success") setWorkflowFeedback(null);
  }, [hasUnsavedChanges, workflowFeedback?.kind]);

  const focusWorkflowManagerStart = () => {
    const dialogElement = workflowManagerRef.current;
    const preferredTarget = dialogElement?.querySelector?.('[data-workflow-selected="true"]')
      || dialogElement?.querySelector?.("[data-workflow-create]")
      || dialogElement?.querySelector?.("[data-workflow-close]")
      || null;
    focusInitialDialogControl(dialogElement, preferredTarget);
  };

  const scheduleWorkflowManagerStartFocus = () => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusWorkflowManagerStart);
    else setTimeout(focusWorkflowManagerStart, 0);
  };

  const closeWorkflowManager = () => {
    onClose();
    restoreFocusAfterDialogClose(returnFocusTarget);
  };

  const loadWorkflowDraft = (workflow) => {
    const next = cloneWorkflowDraft(workflow);
    setSelectedId(next.id || "");
    setDraft(next);
    setSavedDraftSignature(workflowDraftSignature(next));
    setConfirmDelete(false);
    setWorkflowFeedback(null);
  };

  const applyWorkflowDraftTransition = (transition) => {
    if (!transition) return;
    if (transition.kind === "close") {
      closeWorkflowManager();
      return;
    }
    if (transition.kind === "create") {
      loadWorkflowDraft(createEmptyWorkflowDraft());
      restoreFocusAfterDialogClose(transition.returnFocusTarget, workflowManagerRef.current);
      return;
    }
    if (transition.kind === "select") {
      loadWorkflowDraft(transition.workflow);
      restoreFocusAfterDialogClose(transition.returnFocusTarget, workflowManagerRef.current);
    }
  };

  const requestWorkflowDraftTransition = (transition) => {
    if (workflowMutationRef.current || busy || confirmDelete || pendingMutationCloseRef.current || pendingDraftTransitionRef.current || !transition) return;
    if (transition.kind === "select" && transition.workflow?.id === selectedId) return;
    routeWorkflowDraftTransition(
      hasUnsavedChanges,
      transition,
      (nextTransition) => {
        pendingDraftTransitionRef.current = nextTransition;
        setPendingDraftTransition(nextTransition);
      },
      applyWorkflowDraftTransition,
    );
  };

  const selectWorkflow = (workflow, event) => {
    requestWorkflowDraftTransition({
      kind: "select",
      workflow,
      returnFocusTarget: event?.currentTarget || null,
    });
  };

  const createWorkflow = (event) => {
    requestWorkflowDraftTransition({
      kind: "create",
      returnFocusTarget: event?.currentTarget || null,
    });
  };

  const requestWorkflowManagerClose = (eventOrTarget) => {
    const returnFocusTarget = eventOrTarget?.currentTarget || eventOrTarget || null;
    const operation = workflowMutationRef.current;
    if (operation) {
      if (pendingMutationCloseRef.current) return;
      const confirmation = {
        ...buildWorkflowMutationCloseConfirmation(operation.kind, draft.name),
        returnFocusTarget,
      };
      pendingMutationCloseRef.current = confirmation;
      setPendingMutationClose(confirmation);
      return;
    }
    requestWorkflowDraftTransition({
      kind: "close",
      returnFocusTarget,
    });
  };

  const cancelPendingMutationClose = () => {
    const confirmation = pendingMutationCloseRef.current;
    if (!confirmation) return;
    pendingMutationCloseRef.current = null;
    setPendingMutationClose(null);
    restoreFocusAfterDialogClose(confirmation.returnFocusTarget, workflowManagerRef.current);
  };

  const confirmPendingMutationClose = () => {
    if (!pendingMutationCloseRef.current) return;
    pendingMutationCloseRef.current = null;
    setPendingMutationClose(null);
    closeWorkflowManager();
  };

  const cancelPendingDraftTransition = () => {
    const transition = pendingDraftTransitionRef.current;
    if (!transition) return;
    pendingDraftTransitionRef.current = null;
    setPendingDraftTransition(null);
    restoreFocusAfterDialogClose(transition.returnFocusTarget, workflowManagerRef.current);
  };

  const confirmPendingDraftTransition = () => {
    const transition = pendingDraftTransitionRef.current;
    if (!transition || busy) return;
    pendingDraftTransitionRef.current = null;
    setPendingDraftTransition(null);
    applyWorkflowDraftTransition(transition);
  };

  useEffect(() => {
    if (!pendingDraftTransition) return;
    const dialogElement = discardDialogRef.current;
    const continueButton = dialogElement?.querySelector?.("[data-workflow-unsaved-cancel]") || null;
    focusInitialDialogControl(dialogElement, continueButton);
  }, [pendingDraftTransition]);

  useEffect(() => {
    if (!pendingMutationClose) return;
    if (!busy) {
      cancelPendingMutationClose();
      return;
    }
    const dialogElement = mutationCloseDialogRef.current;
    const continueButton = dialogElement?.querySelector?.("[data-workflow-mutation-close-cancel]") || null;
    focusInitialDialogControl(dialogElement, continueButton);
  }, [pendingMutationClose, busy]);

  useEffect(() => {
    focusWorkflowManagerStart();
  }, []);

  useEffect(() => {
    const index = pendingStepFocusRef.current;
    if (index === null) return;
    pendingStepFocusRef.current = null;
    const steps = workflowManagerRef.current?.querySelectorAll(".workflow-step");
    const step = steps?.[Math.min(index, steps.length - 1)];
    if (step) focusInitialDialogControl(step);
    else workflowManagerRef.current?.querySelector("[data-workflow-add-selector]")?.focus();
  }, [draft.steps]);

  useEffect(() => {
    if (!confirmDelete) return;
    const dialogElement = deleteDialogRef.current;
    const cancelButton = dialogElement?.querySelector?.("[data-workflow-delete-cancel]") || null;
    focusInitialDialogControl(dialogElement, cancelButton);
  }, [confirmDelete]);

  const addStep = () => {
    const action = catalog.find((item) => item.id === newActionId);
    if (!action || action.compatible === false) return;
    pendingStepFocusRef.current = (draft.steps || []).length;
    setDraft((current) => ({
      ...current,
      steps: [...(current.steps || []), { actionId: action.id, options: {} }],
    }));
    setNewActionId("");
  };

  const removeStep = (index) => {
    pendingStepFocusRef.current = index;
    setDraft((current) => ({
      ...current,
      steps: (current.steps || []).filter((_, stepIndex) => stepIndex !== index),
    }));
  };

  const moveStep = (index, offset) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= (draft.steps || []).length) return;
    pendingStepFocusRef.current = targetIndex;
    setDraft((current) => {
      const steps = [...(current.steps || [])];
      const target = index + offset;
      if (target < 0 || target >= steps.length) return current;
      const [step] = steps.splice(index, 1);
      steps.splice(target, 0, step);
      return { ...current, steps };
    });
  };

  const updateStep = (index, patch) => {
    setDraft((current) => ({
      ...current,
      steps: (current.steps || []).map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step),
    }));
  };

  const save = async () => {
    if (workflowMutationRef.current) return;
    if (!String(draft.name || "").trim()) {
      onStatus?.("请填写工作流名称");
      setWorkflowFeedback({ kind: "error", message: "请填写工作流名称" });
      return;
    }
    if (!Array.isArray(draft.steps) || draft.steps.length === 0) {
      onStatus?.("至少添加一个工作流动作");
      setWorkflowFeedback({ kind: "error", message: "至少添加一个工作流动作" });
      return;
    }
    const invalidSelector = (draft.steps || []).map(invalidSelectorMessage).find(Boolean);
    if (invalidSelector) {
      onStatus?.(invalidSelector);
      setWorkflowFeedback({ kind: "error", message: invalidSelector });
      return;
    }
    const incompatibleAction = (draft.steps || []).map((step) => {
      if (!step || step.kind === "select") return "";
      const descriptor = actionDescriptor(step.actionId);
      if (!descriptor || descriptor.compatible !== false) {
        const actionScope = descriptor?.scope;
        const workflowScope = draft.scope === "single" || draft.scope === "batch" ? draft.scope : "both";
        if (actionScope === "batch" && workflowScope === "single") return `${descriptor.title} 仅支持多卡`;
        if (actionScope === "single" && workflowScope === "batch") return `${descriptor.title} 仅支持单卡`;
      }
      return "";
    }).find(Boolean);
    if (incompatibleAction) {
      const message = `支持范围不兼容：${incompatibleAction}`;
      onStatus?.(message);
      setWorkflowFeedback({ kind: "error", message });
      return;
    }
    const normalizedSteps = [];
    for (let index = 0; index < draft.steps.length; index += 1) {
      const step = draft.steps[index];
      normalizedSteps.push(draft.steps[index].kind === "select"
        ? { kind: "select", selector: step.selector || {} }
        : { kind: "action", actionId: step.actionId, options: step.options || {} });
    }

    const operation = { kind: "save" };
    workflowMutationRef.current = operation;
    setBusy(true);
    setWorkflowMutationKind("save");
    setWorkflowFeedback({ kind: "saving", message: `正在保存工作流「${String(draft.name || "").trim()}」…` });
    try {
      const saved = await MNBridge.send("saveWorkflow", {
        id: draft.id || undefined,
        name: String(draft.name || "").trim(),
        scope: draft.scope === "single" || draft.scope === "both" ? draft.scope : "batch",
        steps: normalizedSteps,
      });
      const next = Array.isArray(saved) ? saved : saved ? [saved] : [];
      const savedWorkflow = next.length === 1 ? next[0] : null;
      // Native returns a complete normalized workflow; incomplete receipts must
      // never replace the editable draft or be announced as a successful save.
      if (!savedWorkflow || typeof savedWorkflow.id !== "string" || !savedWorkflow.id.trim()
        || (draft.id && savedWorkflow.id !== draft.id)
        || typeof savedWorkflow.name !== "string" || !savedWorkflow.name.trim()
        || !["single", "batch", "both"].includes(savedWorkflow.scope)
        || !Array.isArray(savedWorkflow.steps) || savedWorkflow.steps.length !== normalizedSteps.length
        || !savedWorkflow.steps.every((step) => step && (
          step.kind === "select"
            ? step.selector && typeof step.selector === "object" && !Array.isArray(step.selector)
            : step.kind === "action" && typeof step.actionId === "string" && step.actionId.trim()
              && step.options && typeof step.options === "object" && !Array.isArray(step.options)
        ))) {
        const receiptError = new Error("保存结果未确认：收到的工作流回执不完整或不匹配，请先核对实际保存状态，再决定是否重试");
        receiptError.saveUnconfirmed = true;
        throw receiptError;
      }
      if (workflowMountedRef.current && savedWorkflow?.id) {
        const nextDraft = cloneWorkflowDraft(savedWorkflow);
        setWorkflows((current) => {
          const exists = current.some((workflow) => workflow.id === savedWorkflow.id);
          return exists
            ? current.map((workflow) => workflow.id === savedWorkflow.id ? savedWorkflow : workflow)
            : [...current, savedWorkflow];
        });
        setSelectedId(nextDraft.id);
        setDraft(nextDraft);
        setSavedDraftSignature(workflowDraftSignature(nextDraft));
      }
      const message = `工作流「${savedWorkflow?.name || draft.name}」已保存`;
      onStatus?.(message);
      if (workflowMountedRef.current) setWorkflowFeedback({ kind: "success", message });
    } catch (error) {
      const message = normalizeError(error);
      onStatus?.(message);
      if (workflowMountedRef.current) setWorkflowFeedback({
        kind: "error",
        message: error?.saveUnconfirmed
          ? `${message}。当前草稿已保留。`
          : `保存失败：${message}。草稿仍保留，请检查后手动重试。`,
      });
    } finally {
      if (workflowMutationRef.current === operation) {
        workflowMutationRef.current = null;
        if (workflowMountedRef.current) {
          setBusy(false);
          setWorkflowMutationKind("");
        }
      }
    }
  };

  const removeConfirmed = async () => {
    if (!draft.id || workflowMutationRef.current) return;
    const operation = { kind: "delete" };
    workflowMutationRef.current = operation;
    const deleteReturnFocusTarget = deleteReturnFocusTargetRef.current;
    deleteReturnFocusTargetRef.current = null;
    setConfirmDelete(false);
    setBusy(true);
    setWorkflowMutationKind("delete");
    setWorkflowFeedback({ kind: "saving", message: `正在删除工作流「${draft.name}」…` });
    restoreFocusAfterDialogClose(null, workflowManagerRef.current);
    let deleted = false;
    try {
      const result = await MNBridge.send("deleteWorkflow", { id: draft.id });
      // Require both the deletion acknowledgement and the resulting list.
      // Filtering our old list would disguise an absent or contradictory reply.
      if (result?.deleted !== true || !Array.isArray(result.workflows)
        || !result.workflows.every((workflow) => workflow
          && typeof workflow.id === "string" && workflow.id.trim() && workflow.id !== draft.id
          && typeof workflow.name === "string" && workflow.name.trim()
          && ["single", "batch", "both"].includes(workflow.scope)
          && Array.isArray(workflow.steps) && workflow.steps.length > 0
          && workflow.steps.every((step) => step && (
            step.kind === "select"
              ? step.selector && typeof step.selector === "object" && !Array.isArray(step.selector)
              : step.kind === "action" && typeof step.actionId === "string" && step.actionId.trim()
                && step.options && typeof step.options === "object" && !Array.isArray(step.options)
          )))
        || new Set(result.workflows.map((workflow) => workflow.id)).size !== result.workflows.length) {
        throw new Error("删除回执不完整或与返回列表不一致");
      }
      const next = result.workflows;
      const nextDraft = cloneWorkflowDraft(next[0] || null);
      if (workflowMountedRef.current) {
        setWorkflows(next);
        setSelectedId(nextDraft.id || "");
        setDraft(nextDraft);
        setSavedDraftSignature(workflowDraftSignature(nextDraft));
        setWorkflowFeedback({ kind: "success", message: "工作流已删除" });
      }
      deleted = true;
      onStatus?.("工作流已删除");
    } catch (error) {
      const message = normalizeError(error);
      onStatus?.(message);
      if (workflowMountedRef.current) setWorkflowFeedback({ kind: "error", message: `删除结果未确认：${message}。当前列表和草稿已保留，请先核对实际状态，再决定是否重试。` });
    } finally {
      if (workflowMutationRef.current === operation) {
        workflowMutationRef.current = null;
        if (workflowMountedRef.current) {
          setBusy(false);
          setWorkflowMutationKind("");
          if (deleted) scheduleWorkflowManagerStartFocus();
          else restoreFocusAfterDialogClose(deleteReturnFocusTarget, workflowManagerRef.current);
        }
      }
    }
  };

  const remove = (event) => {
    if (!draft.id || workflowMutationRef.current || busy) return;
    deleteReturnFocusTargetRef.current = event?.currentTarget || null;
    setConfirmDelete(true);
  };

  const cancelDeleteConfirmation = () => {
    if (workflowMutationRef.current || busy) return;
    const returnFocusTarget = deleteReturnFocusTargetRef.current;
    deleteReturnFocusTargetRef.current = null;
    setConfirmDelete(false);
    restoreFocusAfterDialogClose(returnFocusTarget, workflowManagerRef.current);
  };

  const actionTitle = (actionId) => catalog.find((item) => item.id === actionId)?.title || actionId;
  const actionDescriptor = (actionId) => catalog.find((item) => item.id === actionId) || null;
  const invalidSelectorMessage = (step) => {
    if (!step || step.kind !== "select") return "";
    if (step.selectorError) return String(step.selectorError);
    if (!step.selector || typeof step.selector !== "object" || Array.isArray(step.selector)) return "选择器必须是对象";
    return selectorPositionError(step.selector.position);
  };
  const hasInvalidSelector = (draft.steps || []).some((step) => !!invalidSelectorMessage(step));
  const pendingTransitionDescription = pendingDraftTransition?.kind === "select"
    ? `切换到「${pendingDraftTransition.workflow?.name || "其他工作流"}」会放弃当前草稿。`
    : pendingDraftTransition?.kind === "create"
      ? "新建工作流会放弃当前草稿。"
      : "关闭工作流管理器会放弃当前草稿。";
  const pendingTransitionConfirmText = pendingDraftTransition?.kind === "select"
    ? "放弃并切换"
    : pendingDraftTransition?.kind === "create"
      ? "放弃并新建"
      : "放弃并关闭";
  const draftStatusText = hasUnsavedChanges
    ? (draft.id ? "有未保存更改" : "新工作流尚未保存")
    : (draft.id ? "已保存" : "新工作流");

  return (
    <div className="dialog-backdrop" role="presentation" onClick={() => requestWorkflowManagerClose()}>
      <section
        ref={workflowManagerRef}
        className="dialog workflow-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-manager-title"
        aria-busy={busy ? "true" : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (isComposingKeyEvent(event)) return;
          if (confirmDelete || pendingDraftTransition || pendingMutationClose) return;
          if (keepFocusWithinDialog(event, workflowManagerRef.current)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            requestWorkflowManagerClose(event.target);
          }
        }}
      >
        <div className="workflow-manager-header">
          <div>
            <h2 id="workflow-manager-title">工作流</h2>
            <p>把多个评论批处理动作组合成一个菜单项。工作流会保存在 MarginNote 原生配置中。</p>
          </div>
          <Button data-workflow-close className="ghost compact" onClick={requestWorkflowManagerClose} aria-label="关闭工作流管理器">×</Button>
        </div>
        <div className="workflow-manager-body">
          <aside className="workflow-list" aria-label="已保存工作流">
            <Button data-workflow-create className="primary wide" disabled={busy} onClick={createWorkflow}>＋ 新建工作流</Button>
            {workflows.length === 0 ? <p className="workflow-empty">暂无工作流</p> : null}
            {workflows.map((workflow) => (
              <button
                type="button"
                key={workflow.id}
                className={selectedId === workflow.id ? "workflow-list-item active" : "workflow-list-item"}
                data-workflow-selected={selectedId === workflow.id ? "true" : undefined}
                disabled={busy}
                onClick={(event) => selectWorkflow(workflow, event)}
              >
                <strong>{workflow.name}</strong>
                <small>{workflow.steps?.length || 0} 步 · {workflow.scope === "single" ? "仅单卡" : workflow.scope === "both" ? "单卡/多卡" : "仅多卡"} · 使用 {workflow.usageCount || 0} 次{workflow.missingActions?.length ? " · 有缺失动作" : workflow.invalidSelectors?.length ? " · 选择器无效" : ""}</small>
              </button>
            ))}
          </aside>
          <div className="workflow-editor">
            <label className="workflow-name-field">
              <span>名称</span>
              <input value={draft.name || ""} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="workflow-name-field">
              <span>支持范围</span>
              <select value={draft.scope === "single" || draft.scope === "both" ? draft.scope : "batch"} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))}>
                <option value="both">单卡和多卡</option>
                <option value="single">仅单卡</option>
                <option value="batch">仅多卡</option>
              </select>
              <small className="workflow-options-hint">单卡菜单和多选菜单会按此范围显示工作流。</small>
            </label>
            <div className="workflow-step-header">
              <h3>步骤</h3>
              <span>{draft.steps?.length || 0} 步</span>
            </div>
            <div className="workflow-steps">
              {(draft.steps || []).map((step, index) => (
                <div className="workflow-step" role="group" aria-label={`第 ${index + 1} 步`} tabIndex={-1} key={`${step.kind || "action"}-${step.actionId || "select"}-${index}`}>
                  <span className="workflow-step-index">{index + 1}</span>
                  <div className="workflow-step-main">
                    <span className="workflow-step-title">{step.kind === "select" ? `选择：${(step.selector?.types || []).join("、") || "全部评论"} · ${selectorPositionLabel(step.selector?.position)}` : actionTitle(step.actionId)}</span>
                    {actionDescriptor(step.actionId) ? (
                      <small className="workflow-step-meta">
                        范围：{actionDescriptor(step.actionId).scope === "both" ? "单卡/多卡" : actionDescriptor(step.actionId).scope === "single" ? "单卡" : "多卡"}
                        {actionDescriptor(step.actionId).input === "selection" ? " · 按选择器" : " · 整张卡片"}
                        {actionDescriptor(step.actionId).dangerous ? " · 危险操作" : " · 只读/安全"}
                      </small>
                    ) : null}
                    {step.kind === "select" ? (
                      <SelectorEditor selector={step.selector || {}} disabled={busy} onChange={(selector) => updateStep(index, { selector, selectorError: undefined })} />
                    ) : (
                      <ActionOptionsEditor actionId={step.actionId} descriptor={actionDescriptor(step.actionId)} options={step.options || {}} disabled={busy} onChange={(options) => updateStep(index, { options })} />
                    )}
                  </div>
                  {step.kind === "select" || catalog.some((item) => item.id === step.actionId) ? null : <small className="workflow-missing">缺失动作</small>}
                  <div className="workflow-step-actions">
                    <Button className="ghost compact" disabled={busy || index === 0} onClick={() => moveStep(index, -1)} title="上移" aria-label={`上移第 ${index + 1} 步`}>↑</Button>
                    <Button className="ghost compact" disabled={busy || index === (draft.steps || []).length - 1} onClick={() => moveStep(index, 1)} title="下移" aria-label={`下移第 ${index + 1} 步`}>↓</Button>
                    <Button className="ghost compact" disabled={busy} onClick={() => removeStep(index)} title="删除" aria-label={`删除第 ${index + 1} 步`}>×</Button>
                  </div>
                </div>
              ))}
              {(draft.steps || []).length === 0 ? <p className="workflow-empty">从下方选择动作开始搭建</p> : null}
            </div>
            <div className="workflow-add-step">
              <Button data-workflow-add-selector className="secondary" disabled={busy} onClick={() => {
                pendingStepFocusRef.current = (draft.steps || []).length;
                setDraft((current) => ({ ...current, steps: [...(current.steps || []), { kind: "select", selector: { subject: "comments", types: [], includeExcerpt: false, order: "forward" } }] }));
              }}>添加选择器</Button>
              <select aria-label="添加工作流动作" value={newActionId} disabled={busy || catalog.length === 0} onChange={(event) => setNewActionId(event.target.value)}>
                <option value="">选择一个动作…</option>
                {catalog.filter((item) => item.compatible !== false).map((action) => (
                  <option value={action.id} key={action.id}>
                    {action.title} · {action.scope === "both" ? "单卡/多卡" : action.scope === "single" ? "单卡" : "多卡"}{action.dangerous ? " · 危险" : " · 安全"}
                  </option>
                ))}
              </select>
              <Button className="secondary" disabled={busy || !newActionId} onClick={addStep}>添加步骤</Button>
            </div>
            {draft.missingActions?.length ? <p className="workflow-warning">缺失动作：{draft.missingActions.join(", ")}。安装对应 Patch 后才能运行。</p> : null}
            {draft.invalidSelectors?.length && hasInvalidSelector ? <p className="workflow-warning">选择器无效：请修正位置索引后再保存或运行。</p> : null}
          </div>
        </div>
        {workflowFeedback ? (
          <p className={`workflow-feedback ${workflowFeedback.kind}`} role={workflowFeedback.kind === "error" ? "alert" : "status"}>
            {workflowFeedback.message}
          </p>
        ) : null}
        <div className="dialog-actions workflow-actions">
          {draft.id ? <Button data-workflow-delete className="danger" disabled={busy} onClick={remove}>删除</Button> : null}
          <span className={hasUnsavedChanges ? "workflow-save-state unsaved" : "workflow-save-state"} aria-live="polite">{draftStatusText}</span>
          <Button className="secondary" onClick={requestWorkflowManagerClose}>关闭</Button>
          <Button className="primary" disabled={busy || hasInvalidSelector || !draft.name?.trim() || !(draft.steps || []).length} onClick={save}>{workflowMutationKind === "save" ? "保存中…" : "保存"}</Button>
        </div>
        {confirmDelete ? (
          <div className="dialog-backdrop workflow-confirm-backdrop" role="presentation" onClick={cancelDeleteConfirmation}>
            <section
              ref={deleteDialogRef}
              className="dialog workflow-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="workflow-delete-title"
              aria-describedby="workflow-delete-description"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (isComposingKeyEvent(event)) return;
                if (keepFocusWithinDialog(event, deleteDialogRef.current)) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelDeleteConfirmation();
                }
              }}
            >
              <h2 id="workflow-delete-title">删除工作流？</h2>
              <p id="workflow-delete-description">确定删除「{draft.name}」吗？删除后无法从工作流菜单中恢复。</p>
              {hasUnsavedChanges ? <p className="workflow-unsaved-note">当前尚未保存的修改也会一并丢失。</p> : null}
              <div className="dialog-actions">
                <Button data-workflow-delete-cancel className="secondary" disabled={busy} onClick={cancelDeleteConfirmation}>取消</Button>
                <Button className="danger" disabled={busy} onClick={removeConfirmed}>{workflowMutationKind === "delete" ? "删除中…" : "确认删除"}</Button>
              </div>
            </section>
          </div>
        ) : null}
        {pendingMutationClose ? (
          <div className="dialog-backdrop workflow-confirm-backdrop" role="presentation" onClick={cancelPendingMutationClose}>
            <section
              ref={mutationCloseDialogRef}
              className="dialog workflow-confirm-dialog workflow-mutation-close-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="workflow-mutation-close-title"
              aria-describedby="workflow-mutation-close-description workflow-mutation-close-note"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (isComposingKeyEvent(event)) return;
                if (keepFocusWithinDialog(event, mutationCloseDialogRef.current)) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelPendingMutationClose();
                }
              }}
            >
              <h2 id="workflow-mutation-close-title">{pendingMutationClose.title}</h2>
              <p id="workflow-mutation-close-description">{pendingMutationClose.description}</p>
              <p id="workflow-mutation-close-note" className="workflow-unsaved-note">{pendingMutationClose.note}</p>
              <div className="dialog-actions">
                <Button data-workflow-mutation-close-cancel className="secondary" onClick={cancelPendingMutationClose}>{pendingMutationClose.cancelText}</Button>
                <Button className="danger" onClick={confirmPendingMutationClose}>{pendingMutationClose.confirmText}</Button>
              </div>
            </section>
          </div>
        ) : null}
        {pendingDraftTransition ? (
          <div className="dialog-backdrop workflow-confirm-backdrop" role="presentation" onClick={cancelPendingDraftTransition}>
            <section
              ref={discardDialogRef}
              className="dialog workflow-confirm-dialog workflow-unsaved-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="workflow-unsaved-title"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (isComposingKeyEvent(event)) return;
                if (keepFocusWithinDialog(event, discardDialogRef.current)) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelPendingDraftTransition();
                }
              }}
            >
              <h2 id="workflow-unsaved-title">放弃未保存的更改？</h2>
              <p>{pendingTransitionDescription}</p>
              <p className="workflow-unsaved-note">名称、支持范围、步骤和动作参数中的未保存修改都将丢失，且无法恢复。</p>
              <div className="dialog-actions">
                <Button data-workflow-unsaved-cancel className="secondary" onClick={cancelPendingDraftTransition}>继续编辑</Button>
                <Button className="danger" onClick={confirmPendingDraftTransition}>{pendingTransitionConfirmText}</Button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Dialog({ dialog, loading, onClose }) {
  if (dialog.kind === "inlineMerge") {
    return <InlineMergeDialog dialog={dialog} loading={loading} onClose={onClose} />;
  }
  if (dialog.kind === "editMarkdownLink") {
    return <MarkdownLinkEditDialog dialog={dialog} loading={loading} onClose={onClose} />;
  }
  return <TextDialog dialog={dialog} loading={loading} onClose={onClose} />;
}

function InvalidLinkCleanupDialog({ state, loading, onChoose, onConfirm, returnFocusTarget, returnFocusFallback, onClose }) {
  const dialogRef = useRef(null);
  const closeRequestedRef = useRef(false);
  const phase = state?.phase || (state?.preview ? "preview" : "select");
  const preview = state?.preview;
  const summary = summarizeInvalidLinkCleanupPreview(preview);
  const modeLabel = INVALID_LINK_CLEANUP_MODE_LABELS[state?.mode] || "所选范围";
  const previewing = phase === "previewing";
  const busy = loading || previewing;
  const previewErrors = summary.errors.slice(0, 3);
  const remainingErrorCount = Math.max(0, summary.failed - previewErrors.length);

  useEffect(() => {
    const dialogElement = dialogRef.current;
    const preferredTarget = dialogElement?.querySelector?.(`[data-invalid-link-focus="${phase}"]`) || null;
    focusInitialDialogControl(dialogElement, preferredTarget?.disabled ? null : preferredTarget);
  }, [phase]);

  const requestClose = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onClose();
    restoreFocusAfterDialogClose(returnFocusTarget, returnFocusFallback);
  };

  const previewDescription = summary.removable > 0
    ? `扫描到 ${summary.affectedCards} 张卡片的失效链接：卡片链接 ${summary.removableCardLinks} 条，Markdown 行内链接 ${summary.removableMarkdownLinks} 条。`
    : summary.failed > 0
      ? `未发现可安全清理的失效链接，但有 ${summary.failed} 条链接因查询失败无法确认。`
      : "当前卡片没有失效链接。";

  return (
    <div className="dialog-backdrop" role="presentation" onClick={requestClose}>
      <section
        ref={dialogRef}
        className="dialog invalid-link-cleanup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invalid-link-cleanup-title"
        aria-describedby="invalid-link-cleanup-description"
        aria-busy={busy ? "true" : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (isComposingKeyEvent(event)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
            return;
          }
          keepFocusWithinDialog(event, dialogRef.current);
        }}
      >
        <h2 id="invalid-link-cleanup-title">清除失效链接</h2>
        {phase === "select" ? (
          <>
            <p id="invalid-link-cleanup-description">请选择要扫描的链接范围。扫描只会读取当前卡片，不会修改内容。</p>
            <div className="stack">
              <Button data-invalid-link-focus="select" className="secondary" disabled={busy} onClick={() => onChoose("card")}>纯卡片链接</Button>
              <Button className="secondary" disabled={busy} onClick={() => onChoose("markdown")}>Markdown 行内链接</Button>
              <Button className="secondary" disabled={busy} onClick={() => onChoose("all")}>全部失效链接</Button>
            </div>
            <div className="dialog-actions">
              <Button className="secondary" onClick={requestClose}>取消</Button>
            </div>
          </>
        ) : null}
        {phase === "previewing" ? (
          <>
            <p
              id="invalid-link-cleanup-description"
              className="invalid-link-cleanup-status loading"
              role="status"
              aria-live="polite"
            >
              正在扫描“{modeLabel}”…关闭弹窗不会取消已发出的只读扫描，但迟到结果不会再写入界面。
            </p>
            <div className="dialog-actions">
              <Button data-invalid-link-focus="previewing" className="secondary" onClick={requestClose}>关闭</Button>
            </div>
          </>
        ) : null}
        {phase === "error" ? (
          <>
            <p
              id="invalid-link-cleanup-description"
              className="invalid-link-cleanup-status error"
              role="alert"
            >
              扫描“{modeLabel}”失败：{state?.error || "操作失败，请重试"}
            </p>
            <div className="dialog-actions">
              <Button className="secondary" disabled={loading} onClick={() => onChoose("")}>返回选择</Button>
              <Button className="secondary" onClick={requestClose}>取消</Button>
              <Button data-invalid-link-focus="error" className="primary" disabled={loading} onClick={() => onChoose(state?.mode)}>重试扫描</Button>
            </div>
          </>
        ) : null}
        {phase === "preview" ? (
          <>
            <p id="invalid-link-cleanup-description">{previewDescription}</p>
            {summary.failed > 0 ? (
              <section
                className="invalid-link-cleanup-status warning"
                role={summary.removable > 0 ? "status" : "alert"}
                aria-label="未能确认的链接"
              >
                <strong>有 {summary.failed} 条链接无法确认</strong>
                <span>这些链接不会被清理。请检查数据库状态或稍后重新扫描。</span>
                {previewErrors.length > 0 ? (
                  <ul className="invalid-link-cleanup-errors">
                    {previewErrors.map((item, index) => (
                      <li key={`${item.index ?? "unknown"}-${index}`}>
                        {item.index !== null ? `评论 #${item.index}：` : ""}{item.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {remainingErrorCount > 0 ? <span>另有 {remainingErrorCount} 条错误未展开。</span> : null}
              </section>
            ) : null}
            <div className="dialog-actions">
              <Button data-invalid-link-focus="preview" className="secondary" disabled={loading} onClick={() => onChoose("")}>返回选择</Button>
              <Button className="secondary" disabled={loading} onClick={requestClose}>取消</Button>
              <Button className="danger" disabled={loading || summary.removable <= 0 || !preview?.signature} onClick={onConfirm}>确认清除</Button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function MarkdownLinkList({ comment, links, loading, pressingKey, onLocateStart, onLocateFinish, onLocateCancel, onLocate, onEdit }) {
  return (
    <div className="markdown-link-list" aria-label={`评论 #${comment.index} 的行内链接`}>
      {links.map((link, linkIndex) => {
        const noteId = extractMarginNoteUrlNoteId(link.url);
        const pressKey = getMarkdownLinkPressKey(comment, link, linkIndex);
        return (
          <div className="markdown-link-item" key={`${comment.index}-${linkIndex}-${link.startIndex}`}>
            <div className="markdown-link-text">
              <span>{link.displayText || "未命名链接"}</span>
              <small>{link.url}</small>
            </div>
            <div className="markdown-link-actions">
              <Button
                className={pressingKey === pressKey ? "quick-action-btn locate-action pressing" : "quick-action-btn locate-action"}
                disabled={loading || !noteId}
                title={noteId ? "点按定位这条行内链接的卡片，按住在浮窗定位" : "非 MarginNote 卡片链接不能定位"}
                aria-label={`定位行内链接：${link.displayText || link.url}`}
                onPointerDown={(event) => onLocateStart(event, comment, link, linkIndex)}
                onPointerUp={(event) => onLocateFinish(event, comment, link, linkIndex)}
                onPointerLeave={(event) => onLocateCancel(event, comment, link, linkIndex)}
                onPointerCancel={(event) => onLocateCancel(event, comment, link, linkIndex)}
                onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => onLocate(link))}
                onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => onLocate(link))}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                onSelectStart={(event) => event.preventDefault()}
              >
                ⌖
              </Button>
              <Button
                className="quick-action-btn"
                disabled={loading}
                title="编辑这条行内链接"
                aria-label={`编辑行内链接：${link.displayText || link.url}`}
                onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => onEdit(comment, link, linkIndex, event.currentTarget))}
                onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => onEdit(comment, link, linkIndex, event.currentTarget))}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(comment, link, linkIndex, event.currentTarget);
                }}
              >
                ✎
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MarkdownCommentBody = memo(function MarkdownCommentBody({ source, onLocateLink }) {
  const html = useMemo(() => renderMarkdownToHtml(source), [source]);

  const preventEmbeddedNavigation = (event) => {
    const anchor = event.target.closest?.("a");
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    const href = anchor.getAttribute("href") || "";
    if (extractMarginNoteUrlNoteId(href)) onLocateLink?.(href);
  };

  return (
    <div
      className="markdown-content"
      onClick={preventEmbeddedNavigation}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function TextDialog({ dialog, loading, onClose }) {
  const [value, setValue] = useState(dialog.inputValue || "");
  const [checked, setChecked] = useState(dialog.checkboxDefault === true);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const closeRequestedRef = useRef(false);
  const closeOnConfirmSuccess = dialog.closeOnConfirmSuccess === true;
  const closeBeforeConfirm = dialog.closeBeforeConfirm === true;
  const focusManaged = dialog.kind === "editCommentText" || dialog.focusManaged === true;
  const busy = loading || submitting;

  const closeDialog = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onClose();
    restoreFocusAfterDialogClose(dialog.returnFocusTarget, dialog.returnFocusFallback);
  };
  const requestClose = focusManaged ? closeDialog : onClose;

  const handleCheckboxChange = (nextChecked) => {
    setChecked(nextChecked);
    if (typeof dialog.onCheckChange === "function") {
      const nextValue = dialog.onCheckChange(nextChecked, value);
      if (typeof nextValue === "string") setValue(nextValue);
    }
  };

  const handleConfirm = () => {
    if (busy) return undefined;
    if (!closeOnConfirmSuccess) {
      if (closeBeforeConfirm) {
        return runCloseBeforeDialogConfirmation(requestClose, dialog.onConfirm, [value, { checked }]);
      }
      return dialog.onConfirm(value, { checked });
    }
    if (submittingRef.current) return undefined;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError("");
    return runRecoverableDialogSubmission(
      dialog.onConfirm,
      [value, { checked }],
      () => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        requestClose();
      },
      (message) => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        setSubmissionError(message);
      },
    );
  };

  useEffect(() => {
    if (focusManaged) focusInitialDialogControl(dialogRef.current, initialFocusRef.current);
  }, [focusManaged]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (isComposingKeyEvent(event)) return;
      if (focusManaged && event.key === "Tab") {
        keepFocusWithinDialog(event, dialogRef.current);
        return;
      }
      if (event.key === "Escape") requestClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        Promise.resolve(handleConfirm()).catch(() => {});
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, checked, closeBeforeConfirm, closeOnConfirmSuccess, dialog, focusManaged, requestClose, value]);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={requestClose}>
      <section
        ref={focusManaged ? dialogRef : undefined}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-busy={closeOnConfirmSuccess && busy ? "true" : undefined}
        tabIndex={focusManaged ? -1 : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>
        {dialog.inputLabel ? (
          <label>
            <span className="dialog-input-header">
              <span>{dialog.inputLabel}</span>
              {dialog.clearInputText ? (
                <Button className="ghost compact" disabled={busy || value.length === 0} onClick={() => setValue("")}>
                  {dialog.clearInputText}
                </Button>
              ) : null}
            </span>
            <textarea
              ref={focusManaged ? initialFocusRef : undefined}
              value={value}
              readOnly={closeOnConfirmSuccess && busy}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </label>
        ) : null}
        {dialog.checkboxLabel ? (
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy || dialog.checkboxDisabled === true}
              onChange={(event) => handleCheckboxChange(event.target.checked)}
            />
            <span>
              <strong>{dialog.checkboxLabel}</strong>
              {dialog.checkboxDescription ? <small>{dialog.checkboxDescription}</small> : null}
            </span>
          </label>
        ) : null}
        {submissionError ? (
          <p className="dialog-error" role="alert">保存失败：{submissionError}</p>
        ) : null}
        <div className="dialog-actions">
          <Button className="secondary" disabled={busy} onClick={requestClose}>取消</Button>
          <Button
            className={dialog.danger ? "danger" : "primary"}
            disabled={busy}
            onClick={handleConfirm}
          >
            {closeOnConfirmSuccess && busy ? (dialog.pendingText || "处理中…") : (dialog.confirmText || "确认")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function MarkdownLinkEditDialog({ dialog, loading, onClose }) {
  const [displayText, setDisplayText] = useState(dialog.displayText || "");
  const [url, setUrl] = useState(dialog.url || "");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const closeRequestedRef = useRef(false);
  const trimmedDisplayText = displayText.trim();
  const trimmedUrl = url.trim();
  const hasChanges = trimmedDisplayText !== String(dialog.displayText || "") ||
    trimmedUrl !== String(dialog.url || "");
  const busy = loading || submitting;
  const canConfirm = trimmedDisplayText.length > 0 && trimmedUrl.length > 0 && hasChanges && !busy;
  const preview = `[${trimmedDisplayText || "..."}](${trimmedUrl || "..."})`;

  const closeDialog = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onClose();
    restoreFocusAfterDialogClose(dialog.returnFocusTarget);
  };

  const handleConfirm = () => {
    if (!canConfirm || submittingRef.current) return undefined;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError("");
    return runRecoverableDialogSubmission(
      dialog.onConfirm,
      [{ displayText: trimmedDisplayText, url: trimmedUrl }],
      () => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        closeDialog();
      },
      (message) => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        setSubmissionError(message);
      },
    );
  };

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (isComposingKeyEvent(event)) return;
      if (event.key === "Tab") {
        keepFocusWithinDialog(event, dialogRef.current);
        return;
      }
      if (event.key === "Escape") closeDialog();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        Promise.resolve(handleConfirm()).catch(() => {});
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, canConfirm, dialog, onClose, trimmedDisplayText, trimmedUrl]);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={closeDialog}>
      <section
        ref={dialogRef}
        className="dialog markdown-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-busy={busy ? "true" : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>
        <div className="markdown-link-edit-grid">
          <label>
            <span>链接文本</span>
            <input
              ref={initialFocusRef}
              value={displayText}
              readOnly={busy}
              onChange={(event) => setDisplayText(event.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span>链接地址</span>
            <input
              value={url}
              readOnly={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
        </div>
        <div className="markdown-link-preview" aria-label="Markdown 预览">{preview}</div>
        {submissionError ? (
          <p className="dialog-error" role="alert">保存失败：{submissionError}</p>
        ) : null}
        <div className="dialog-actions">
          <Button className="secondary" disabled={busy} onClick={closeDialog}>取消</Button>
          <Button
            className="primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {busy ? (dialog.pendingText || "保存中…") : (dialog.confirmText || "保存")}
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
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const dialogRef = useRef(null);
  const cookingRef = useRef(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const closeRequestedRef = useRef(false);
  const materials = Array.isArray(dialog.materials) ? dialog.materials : [];
  const busy = loading || submitting;
  const canConfirm = cookingText.trim().length > 0 && materials.length >= 2 && !busy;

  const closeDialog = () => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    onClose();
    restoreFocusAfterDialogClose(dialog.returnFocusTarget, dialog.returnFocusFallback);
  };

  const handleConfirm = () => {
    if (!canConfirm || submittingRef.current) return undefined;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError("");
    return runRecoverableDialogSubmission(
      dialog.onConfirm,
      [cookingText],
      () => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        closeDialog();
      },
      (message) => {
        submittingRef.current = false;
        if (!mountedRef.current) return;
        setSubmitting(false);
        setSubmissionError(message);
      },
    );
  };

  useEffect(() => {
    focusInitialDialogControl(dialogRef.current, cookingRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (isComposingKeyEvent(event)) return;
      if (event.key === "Tab") {
        keepFocusWithinDialog(event, dialogRef.current);
        return;
      }
      if (event.key === "Escape") closeDialog();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        Promise.resolve(handleConfirm()).catch(() => {});
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, canConfirm, cookingText, dialog, onClose]);

  const focusCooking = () => {
    if (cookingRef.current) cookingRef.current.focus();
  };

  const insertAtCursor = (text) => {
    const textarea = cookingRef.current;
    const insertText = String(text || "");
    if (!textarea || !insertText || busy) return;
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
    if (!textarea || busy) return false;
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
    if (!material || busy) return;
    if (material.kind === "link") {
      if (wrapCookingSelection(material.linkUrl)) return;
      setBuilderLink(material.linkUrl || "");
      return;
    }
    setBuilderText(material.text || "");
  };

  const appendMaterial = (material) => {
    if (!material || busy) return;
    insertAtCursor(material.defaultText || material.text || material.linkUrl || "");
  };

  const insertBuilderText = () => {
    if (!builderText.trim() || busy) return;
    insertAtCursor(builderText);
  };

  const insertBuilderLink = () => {
    const text = builderText.trim();
    const link = builderLink.trim();
    if (!text || !link || busy) return;
    insertAtCursor(makeMarkdownInlineLink(text, link));
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={closeDialog}>
      <section
        ref={dialogRef}
        className="dialog inline-merge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-busy={busy ? "true" : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
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
                disabled={busy}
                title="点按填入下方输入框，双击直接加入最终内容"
                onClick={() => applyMaterial(material)}
                onDoubleClick={() => appendMaterial(material)}
              >
                <span className="merge-material-meta">#{material.index} · {material.label}</span>
                {material.title ? <span className="merge-material-title">{material.title}</span> : null}
                {material.content && material.content !== material.title ? (
                  <span className="merge-material-content">{material.content}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className="merge-section">
          <h3>组合链接</h3>
          <div className="merge-builder-row">
            <input aria-label="显示文本" readOnly={busy} value={builderText} onChange={(event) => setBuilderText(event.target.value)} placeholder="显示文本" />
            <input aria-label="链接地址" readOnly={busy} value={builderLink} onChange={(event) => setBuilderLink(event.target.value)} placeholder="链接地址" />
          </div>
          <div className="merge-actions">
            <Button className="secondary" disabled={busy || !builderText.trim()} onClick={insertBuilderText}>插入文本</Button>
            <Button className="secondary" disabled={busy || !builderText.trim() || !builderLink.trim()} onClick={insertBuilderLink}>插入行内链接</Button>
            <Button className="secondary" disabled={busy || (!builderText && !builderLink)} onClick={() => {
              setBuilderText("");
              setBuilderLink("");
            }}>清空输入</Button>
          </div>
        </section>

        <section className="merge-section">
          <h3>最终内容</h3>
          <textarea
            ref={cookingRef}
            aria-label="最终内容"
            value={cookingText}
            readOnly={busy}
            onChange={(event) => setCookingText(event.target.value)}
            autoFocus
            spellCheck={false}
          />
          <div className="merge-actions">
            <Button className="secondary" disabled={busy || !cookingText} onClick={() => {
              setCookingText("");
              focusCooking();
            }}>清空内容</Button>
          </div>
        </section>

        {submissionError ? (
          <p className="dialog-error" role="alert">合并失败：{submissionError}</p>
        ) : null}
        <div className="dialog-actions">
          <Button className="secondary" disabled={busy} onClick={closeDialog}>取消</Button>
          <Button className="primary" disabled={!canConfirm} onClick={handleConfirm}>
            {busy ? (dialog.pendingText || "合并中…") : (dialog.confirmText || "合并")}
          </Button>
        </div>
      </section>
    </div>
  );
}

export default App;
