var __MN_COMMENT_DATA__ = (function () {
  const MARGNOTE_LINK_RE = /^marginnote\d*(?:app)?:\/\/note\/([0-9A-Fa-f-]{36})(?:\/[^\s]*)?$/i;
  const MARKDOWN_LINK_RE = /\[([^\]]+?)\]\(([^)]+?)\)/g;
  const TEXT_EDITABLE_TYPES = [
    "textComment",
    "markdownComment",
    "markdownLinkComment",
    "tagComment",
    "linkComment",
    "summaryComment",
    "blankTextComment",
    "mergedTextComment",
    "mergedImageComment",
  ];
  const TEXT_MERGEABLE_TYPES = [
    "textComment",
    "markdownComment",
    "markdownLinkComment",
    "tagComment",
    "linkComment",
    "summaryComment",
    "HtmlComment",
    "blankTextComment",
    "mergedTextComment",
  ];
  const IMAGE_TYPES = [
    "imageComment",
    "imageCommentWithDrawing",
    "drawingComment",
    "mergedImageComment",
    "mergedImageCommentWithDrawing",
    "blankImageComment",
  ];

  function toStringValue(value) {
    return value == null ? "" : String(value);
  }

  function getWrappedNoteById(noteId) {
    if (!noteId) return null;
    try {
      return MNNote.new(String(noteId), false) || null;
    } catch (error) {
      return null;
    }
  }

  function getCurrentNote() {
    try {
      return MNNote.getFocusNote(true) || null;
    } catch (error) {
      return null;
    }
  }

  function getRawComments(note) {
    if (!note) return [];
    if (Array.isArray(note.comments)) return note.comments;
    if (note.note && Array.isArray(note.note.comments)) return note.note.comments;
    return [];
  }

  function getDetailedComments(note) {
    if (!note) return [];
    if (Array.isArray(note.MNComments)) return note.MNComments;
    return [];
  }

  function getMNCommentType(rawComment) {
    try {
      if (typeof MNComment !== "undefined" && MNComment && typeof MNComment.getCommentType === "function") {
        return MNComment.getCommentType(rawComment);
      }
    } catch (error) {
      // fall back to local classification
    }
    return "";
  }

  function normalizeMediaBase64(media) {
    try {
      if (!media || typeof media.base64Encoding !== "function") return "";
      return String(media.base64Encoding() || "");
    } catch (error) {
      return "";
    }
  }

  function normalizeMarkdownLinks(text) {
    const links = [];
    const source = toStringValue(text);
    let match;
    MARKDOWN_LINK_RE.lastIndex = 0;
    while ((match = MARKDOWN_LINK_RE.exec(source)) !== null) {
      links.push({
        displayText: match[1] || "",
        url: match[2] || "",
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    return links;
  }

  function normalizeNoteId(noteId) {
    return toStringValue(noteId).toUpperCase();
  }

  function extractPureMarginNoteLink(text) {
    const source = toStringValue(text).trim();
    const normalized = source.indexOf("- ") === 0 ? source.slice(2).trim() : source;
    const withoutQuery = normalized.split(/[?#]/)[0];
    const match = withoutQuery.match(MARGNOTE_LINK_RE);
    return match && match[1] ? {
      noteId: normalizeNoteId(match[1]),
      url: normalized,
    } : null;
  }

  function getCommentText(rawComment, detailedComment) {
    const detailedRaw = detailedComment && detailedComment.detail;
    return toStringValue(
      (detailedRaw && detailedRaw.text) ||
      (detailedRaw && detailedRaw.q_htext) ||
      (rawComment && rawComment.text) ||
      (rawComment && rawComment.q_htext),
    );
  }

  function resolveLinkedNoteTitle(text) {
    const link = extractPureMarginNoteLink(text);
    if (!link) return "";
    const linkedNote = getWrappedNoteById(link.noteId);
    return linkedNote && linkedNote.noteTitle ? String(linkedNote.noteTitle) : "";
  }

  function classifyTextComment(text, detailedType) {
    const source = toStringValue(text);
    const trimmed = source.trim();
    if (!trimmed) return "blankTextComment";
    if (/^#\S/.test(trimmed)) return "tagComment";
    if (extractPureMarginNoteLink(source)) {
      return /\/summary(?:\/|$)/i.test(source) ? "summaryComment" : "linkComment";
    }
    if (normalizeMarkdownLinks(source).length > 0) return "markdownComment";
    if (detailedType === "markdownComment" || detailedType === "markdownLinkComment") return detailedType;
    return "textComment";
  }

  function classifyComment(rawComment, detailedComment) {
    const rawType = toStringValue(rawComment && rawComment.type);
    const detailedType = toStringValue((detailedComment && detailedComment.type) || getMNCommentType(rawComment));
    const text = getCommentText(rawComment, detailedComment);

    if (detailedType && !["TextNote", "HtmlNote", "LinkNote", "PaintNote", "AudioNote"].includes(detailedType)) {
      return detailedType;
    }
    if (rawType === "HtmlNote") return "HtmlComment";
    if (rawType === "PaintNote") return detailedType || "imageComment";
    if (rawType === "AudioNote") return "audioComment";
    if (rawType === "LinkNote") {
      if (rawComment && rawComment.q_hblank) return text ? "blankTextComment" : "blankImageComment";
      if (rawComment && rawComment.draft) return "mergedChildMapComment";
      if (rawComment && rawComment.q_hpic) {
        return rawComment.q_hpic.drawing ? "mergedImageCommentWithDrawing" : "mergedImageComment";
      }
      return text ? "mergedTextComment" : "mergedTextComment";
    }
    return classifyTextComment(text, detailedType);
  }

  function extractImageHash(rawComment, detailedComment) {
    const candidates = [
      rawComment && rawComment.paint,
      rawComment && rawComment.q_hpic && rawComment.q_hpic.paint,
      detailedComment && detailedComment.detail && detailedComment.detail.paint,
      detailedComment && detailedComment.detail && detailedComment.detail.q_hpic && detailedComment.detail.q_hpic.paint,
    ].filter(Boolean);
    return candidates.length > 0 ? candidates[0] : "";
  }

  function extractImageData(rawComment, detailedComment) {
    const candidates = [
      extractImageHash(rawComment, detailedComment),
    ].filter(Boolean);

    for (const hash of candidates) {
      const media = MNUtil.getMediaByHash(hash);
      const base64 = normalizeMediaBase64(media);
      if (base64) return base64;
    }
    return "";
  }

  function extractAudioHash(rawComment, detailedComment) {
    if (rawComment && rawComment.audio) return rawComment.audio;
    if (detailedComment && detailedComment.audioId) return detailedComment.audioId;
    if (detailedComment && detailedComment.detail && detailedComment.detail.audio) return detailedComment.detail.audio;
    return "";
  }

  function countReverseLinks(noteId, linkedNoteId) {
    const sourceId = normalizeNoteId(noteId);
    const targetNote = getWrappedNoteById(linkedNoteId);
    if (!sourceId || !targetNote || !Array.isArray(targetNote.comments)) return 0;
    return targetNote.comments.reduce((count, targetComment) => {
      const reverseLink = extractPureMarginNoteLink(targetComment && targetComment.text);
      return reverseLink && reverseLink.noteId === sourceId ? count + 1 : count;
    }, 0);
  }

  function buildCapabilities(type, rawComment, text, imageBase64, imageHash, audioHash, linked, markdownLinks) {
    const originalType = toStringValue(rawComment && rawComment.type);
    const hasText = !!toStringValue(text).trim();
    const hasImage = !!(imageBase64 || imageHash);
    const hasAudio = !!audioHash;
    return {
      hasText,
      hasImage,
      hasAudio,
      canEditText: TEXT_EDITABLE_TYPES.indexOf(type) >= 0,
      canMergeText: TEXT_MERGEABLE_TYPES.indexOf(type) >= 0,
      canCopyText: hasText,
      canCopyImage: IMAGE_TYPES.indexOf(type) >= 0 && hasImage,
      canCopyAudio: false,
      canFocusLink: !!linked && (type === "linkComment" || type === "summaryComment"),
      canBidirectionalDelete: !!linked && type === "linkComment",
      canExtractText: hasText,
      canDelete: true,
      canMove: true,
      isMarkdown: !!(rawComment && rawComment.markdown) || type === "markdownComment" || type === "markdownLinkComment" || type === "summaryComment",
      isHtml: originalType === "HtmlNote" || type === "HtmlComment",
      isMerged: originalType === "LinkNote",
      isMedia: IMAGE_TYPES.indexOf(type) >= 0 || type === "audioComment" || type === "mergedChildMapComment",
      hasMarkdownLinks: markdownLinks.length > 0,
    };
  }

  function buildLifecycleStage(type, rawComment) {
    const originalType = toStringValue(rawComment && rawComment.type);
    if (originalType === "TextNote") return "text";
    if (originalType === "HtmlNote") return "html";
    if (originalType === "LinkNote") {
      if (type.indexOf("Image") >= 0 || type === "blankImageComment") return "merged-image";
      if (type === "mergedChildMapComment") return "merged-child-map";
      return "merged-text";
    }
    if (originalType === "PaintNote") return "paint";
    if (originalType === "AudioNote") return "audio";
    return "unknown";
  }

  function serializeComment(note, rawComment, detailedComment, index) {
    const text = getCommentText(rawComment, detailedComment);
    const type = classifyComment(rawComment, detailedComment);
    const markdownLinks = normalizeMarkdownLinks(text);
    const imageBase64 = extractImageData(rawComment, detailedComment);
    const imageHash = extractImageHash(rawComment, detailedComment);
    const audioHash = extractAudioHash(rawComment, detailedComment);
    const linked = extractPureMarginNoteLink(text);
    const reverseCount = linked && type === "linkComment" ? countReverseLinks(note && note.noteId, linked.noteId) : 0;
    const capabilities = buildCapabilities(type, rawComment, text, imageBase64, imageHash, audioHash, linked, markdownLinks);

    return {
      index,
      originalType: toStringValue(rawComment && rawComment.type),
      type,
      detailedType: type,
      text,
      htmlText: rawComment && rawComment.type === "HtmlNote" ? text : "",
      lifecycleStage: buildLifecycleStage(type, rawComment),
      capabilities,
      imageBase64,
      imageHash,
      imageMimeType: imageBase64 ? "image/jpeg" : "",
      mediaKind: capabilities.hasImage ? "image" : (capabilities.hasAudio ? "audio" : ""),
      audioHash,
      linkedNoteId: linked ? linked.noteId : "",
      linkedNoteTitle: linked ? resolveLinkedNoteTitle(text) : "",
      linkedNoteUrl: linked ? linked.url : "",
      linkDirection: linked && type === "linkComment" ? (reverseCount > 0 ? "both" : "one-way") : "",
      reverseLinkCount: reverseCount,
      markdownLinks,
      hasMarkdownLinks: markdownLinks.length > 0,
    };
  }

  function getNoteSnapshot(note) {
    if (!note) {
      return {
        noteId: "",
        noteTitle: "",
        comments: [],
        error: "没有读取到当前卡片，请先选中一张卡片",
      };
    }

    const rawComments = getRawComments(note);
    const detailedComments = getDetailedComments(note);
    const comments = rawComments.map((comment, index) => (
      serializeComment(note, comment, detailedComments[index] || null, index)
    ));

    return {
      noteId: toStringValue(note.noteId),
      noteTitle: toStringValue(note.noteTitle || "未命名卡片"),
      comments,
      error: "",
    };
  }

  function getCurrentNoteSnapshot() {
    return getNoteSnapshot(getCurrentNote());
  }

  return {
    getCurrentNote,
    getWrappedNoteById,
    getCurrentNoteSnapshot,
    getNoteSnapshot,
    extractPureMarginNoteLink,
    normalizeNoteId,
  };
})();
