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

  function getRawNote(note) {
    return note && note.note ? note.note : note;
  }

  function getExcerptText(note) {
    const rawNote = getRawNote(note);
    try {
      return toStringValue(
        (note && (note.mainExcerptText || note.excerptText)) ||
        (rawNote && rawNote.excerptText),
      );
    } catch (error) {
      return "";
    }
  }

  function getExcerptType(note) {
    const rawNote = getRawNote(note);
    try {
      const directType = toStringValue(note && note.excerptType).trim().toLowerCase();
      if (directType) return directType;
      const excerpt = note && note.excerpt;
      const aggregateType = toStringValue(excerpt && excerpt.type).trim().toLowerCase();
      if (aggregateType) return aggregateType;
      const excerptPic = note && note.excerptPic || rawNote && rawNote.excerptPic;
      if (excerptPic) {
        if ("video" in Object(excerptPic)) {
          return toStringValue(excerptPic.video_ext).toLowerCase() === "mp3" ? "audio" : "video";
        }
        return !!(note && note.textFirst || rawNote && rawNote.textFirst) ? "text" : "image";
      }
      return getExcerptText(note).trim() ? "text" : "none";
    } catch (error) {
      return "unknown";
    }
  }

  function getExcerptMediaHash(note, type) {
    try {
      const excerpt = note && note.excerpt;
      if (!excerpt) return "";
      if (type === "image") return toStringValue(excerpt.imageHash);
      if (type === "audio") return toStringValue(excerpt.audioHash);
      if (type === "video") return toStringValue(excerpt.videoHash);
    } catch (error) {
      return "";
    }
    return "";
  }

  function getExcerptMediaData(note, type) {
    try {
      if (type === "image" && note && note.excerptPicData) return note.excerptPicData;
      if (type === "audio" && note && note.excerptAudioData) return note.excerptAudioData;
      if (type === "video" && note && note.excerptVideoData) return note.excerptVideoData;
    } catch (error) {
      // Fall back to the aggregate media hash.
    }
    const mediaHash = getExcerptMediaHash(note, type);
    if (!mediaHash) return null;
    try {
      return MNUtil.getMediaByHash(mediaHash) || null;
    } catch (error) {
      return null;
    }
  }

  function getExcerptState(note) {
    if (!note) {
      return {
        present: false,
        type: "none",
        text: "",
        imageBase64: "",
        imageMimeType: "",
        conversion: { eligible: false, reason: "noExcerpt" },
        capabilities: {
          canCopyText: false,
          canCopyImage: false,
          canMergeText: false,
          canExtract: false,
        },
      };
    }

    const rawNote = getRawNote(note);
    const type = getExcerptType(note);
    const text = getExcerptText(note);
    const excerptPic = note && note.excerptPic || rawNote && rawNote.excerptPic;
    const mediaHash = getExcerptMediaHash(note, type);
    const mediaData = getExcerptMediaData(note, type);
    const imageBase64 = type === "image" ? normalizeMediaBase64(mediaData) : "";
    const present = !!(
      text.trim() ||
      excerptPic ||
      mediaHash ||
      mediaData
    );
    let conversionReason = "noExcerpt";
    let conversionEligible = false;
    if (present && !note.parentNote) {
      conversionReason = "noParent";
    } else if (present && (type === "text" || type === "image")) {
      conversionEligible = true;
      conversionReason = type;
    } else if (present) {
      conversionReason = "unsupportedMedia";
    }

    return {
      present,
      type: present ? type : "none",
      text,
      textMarkdown: !!(note && note.excerptTextMarkdown || rawNote && rawNote.excerptTextMarkdown),
      imageBase64,
      imageMimeType: imageBase64 ? "image/jpeg" : "",
      conversion: {
        eligible: conversionEligible,
        reason: conversionReason,
      },
      capabilities: {
        canCopyText: present && type === "text" && !!text.trim(),
        canCopyImage: present && type === "image" && !!(mediaData || excerptPic || mediaHash),
        canMergeText: present && type === "text" && !!text.trim(),
        canExtract: present && (type === "text" || type === "image"),
      },
    };
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

    if (rawType === "HtmlNote") return "HtmlComment";
    if (rawType === "PaintNote") {
      const hasPaint = !!(rawComment && rawComment.paint);
      const hasDrawing = !!(rawComment && rawComment.drawing);
      if (hasDrawing && hasPaint) return "imageCommentWithDrawing";
      if (hasDrawing) return "drawingComment";
      return "imageComment";
    }
    if (rawType === "AudioNote") return "audioComment";
    if (rawType === "LinkNote") {
      if (rawComment && rawComment.q_hblank) return text ? "blankTextComment" : "blankImageComment";
      if (rawComment && rawComment.draft) return "mergedChildMapComment";
      if (rawComment && rawComment.q_hpic) {
        return rawComment.q_hpic.drawing ? "mergedImageCommentWithDrawing" : "mergedImageComment";
      }
      return text ? "mergedTextComment" : "mergedTextComment";
    }
    if (detailedType && !["TextNote", "HtmlNote", "LinkNote", "PaintNote", "AudioNote"].includes(detailedType)) {
      return detailedType;
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

  function extractDrawingHash(rawComment, detailedComment) {
    const candidates = [
      rawComment && rawComment.drawing,
      rawComment && rawComment.q_hpic && rawComment.q_hpic.drawing,
      detailedComment && detailedComment.detail && detailedComment.detail.drawing,
      detailedComment && detailedComment.detail && detailedComment.detail.q_hpic && detailedComment.detail.q_hpic.drawing,
    ].filter(Boolean);
    return candidates.length > 0 ? String(candidates[0]) : "";
  }

  function extractDrawingPreview(rawComment, detailedComment) {
    const drawingHash = extractDrawingHash(rawComment, detailedComment);
    if (!drawingHash) return { drawingHash: "", dataURI: "", error: "", pending: false };
    try {
      const preview = __MN_HANDWRITING_PREVIEW_MNCommentManagerAddon.renderMediaDataURI(drawingHash);
      return {
        drawingHash,
        dataURI: preview && preview.dataURI ? String(preview.dataURI) : "",
        error: "",
        pending: false,
      };
    } catch (error) {
      const message = error && error.message ? String(error.message) : String(error || "unknown");
      const code = error && error.code ? String(error.code) : "";
      const pending = code === "drawing-media-missing" || code === "drawing-base64-missing";
      try {
        console.log(`[MN Comment Manager] handwriting preview failed: ${JSON.stringify({
          drawingHash,
          code,
          message,
          pending,
        })}`);
      } catch (_) {}
      return {
        drawingHash,
        dataURI: "",
        error: pending ? "" : message,
        pending,
      };
    }
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

  function buildCapabilities(type, rawComment, text, imageBase64, imageHash, drawingPreview, audioHash, linked, markdownLinks) {
    const originalType = toStringValue(rawComment && rawComment.type);
    const hasText = !!toStringValue(text).trim();
    const hasImage = !!(imageBase64 || imageHash || drawingPreview);
    const hasAudio = !!audioHash;
    return {
      hasText,
      hasImage,
      hasAudio,
      canEditText: TEXT_EDITABLE_TYPES.indexOf(type) >= 0,
      canMergeText: TEXT_MERGEABLE_TYPES.indexOf(type) >= 0,
      canCopyText: hasText,
      canCopyImage: IMAGE_TYPES.indexOf(type) >= 0 && !!(imageBase64 || imageHash),
      canCopyAudio: false,
      canFocusLink: !!linked && (type === "linkComment" || type === "summaryComment"),
      canUpdateLink: !!linked && (type === "linkComment" || type === "summaryComment"),
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
    const drawingPreview = extractDrawingPreview(rawComment, detailedComment);
    const audioHash = extractAudioHash(rawComment, detailedComment);
    const linked = extractPureMarginNoteLink(text);
    const reverseCount = linked && type === "linkComment" ? countReverseLinks(note && note.noteId, linked.noteId) : 0;
    const capabilities = buildCapabilities(
      type,
      rawComment,
      text,
      imageBase64,
      imageHash,
      drawingPreview.dataURI,
      audioHash,
      linked,
      markdownLinks,
    );

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
      drawingHash: drawingPreview.drawingHash,
      drawingPreviewDataURI: drawingPreview.dataURI,
      drawingPreviewError: drawingPreview.error,
      drawingPreviewPending: drawingPreview.pending === true,
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
        excerpt: getExcerptState(null),
        comments: [],
        error: "没有读取到当前卡片，请先选中一张卡片",
      };
    }

    const rawComments = getRawComments(note);
    const detailedComments = getDetailedComments(note);
    const comments = rawComments.map((comment, index) => (
      serializeComment(note, comment, detailedComments[index] || null, index)
    ));
    const handwritingPendingCount = comments.filter((comment) => comment.drawingPreviewPending === true).length;

    return {
      noteId: toStringValue(note.noteId),
      noteTitle: toStringValue(note.noteTitle || "未命名卡片"),
      excerpt: getExcerptState(note),
      comments,
      handwritingPendingCount,
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
    getExcerptState,
    getExcerptType,
    getExcerptText,
    getExcerptMediaData,
    extractPureMarginNoteLink,
    normalizeNoteId,
  };
})();
