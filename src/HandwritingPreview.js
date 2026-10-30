var __MN_HANDWRITING_PREVIEW_MNCommentManagerAddon = (function () {
  "use strict";
  const PREVIEW_CACHE_LIMIT = 24;
  const PREVIEW_CACHE_MAX_CHARACTERS = 24 * 1024 * 1024;
  const previewCache = new Map();
  function createError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function encodeBase64(value) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", output = "";
    for (var i = 0; i < value.length; i += 3) {
      var second = i + 1 < value.length, third = i + 2 < value.length;
      var bits = (value.charCodeAt(i) << 16) | ((second ? value.charCodeAt(i + 1) : 0) << 8) | (third ? value.charCodeAt(i + 2) : 0);
      output += alphabet[(bits >> 18) & 63] + alphabet[(bits >> 12) & 63] + (second ? alphabet[(bits >> 6) & 63] : "=") + (third ? alphabet[bits & 63] : "=");
    }
    return output;
  }

  function renderDrawingDataURI(base64, options) {
    var rendered = __MN_HANDWRITING_DECODER_MNCommentManagerAddon.renderBase64(base64, options && options.purpose || "preview");
    rendered.dataURI = "data:image/svg+xml;base64," + encodeBase64(rendered.svg);
    delete rendered.svg;
    return rendered;
  }

  function getMediaBase64(mediaId) {
    let data = null;
    try {
      data = MNUtil && typeof MNUtil.getMediaByHash === "function"
        ? MNUtil.getMediaByHash(mediaId)
        : null;
    } catch (_) {
      data = null;
    }
    if (!data) throw createError("drawing-media-missing", "找不到手写媒体数据");
    let base64 = "";
    try {
      base64 = typeof data.base64Encoding === "function" ? data.base64Encoding() : data.base64Encoding;
    } catch (_) {
      base64 = "";
    }
    if (!base64) throw createError("drawing-base64-missing", "无法读取手写媒体数据");
    return String(base64);
  }

  function setCachedPreview(mediaId, rendered) {
    const key = String(mediaId || "");
    if (!key || !rendered || !rendered.dataURI) return;
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, rendered);
    let totalCharacters = 0;
    previewCache.forEach((value) => {
      totalCharacters += value && value.dataURI ? value.dataURI.length : 0;
    });
    while (previewCache.size > PREVIEW_CACHE_LIMIT || totalCharacters > PREVIEW_CACHE_MAX_CHARACTERS) {
      const oldestKey = previewCache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = previewCache.get(oldestKey);
      totalCharacters -= oldest && oldest.dataURI ? oldest.dataURI.length : 0;
      previewCache.delete(oldestKey);
    }
  }

  function renderMediaDataURI(mediaId) {
    const key = String(mediaId || "").trim();
    if (!key) throw createError("drawing-media-id-missing", "手写媒体哈希为空");
    if (previewCache.has(key)) {
      const cached = previewCache.get(key);
      previewCache.delete(key);
      previewCache.set(key, cached);
      return cached;
    }
    const rendered = renderDrawingDataURI(getMediaBase64(key));
    setCachedPreview(key, rendered);
    return rendered;
  }

  return {
    renderDrawingDataURI,
    renderMediaDataURI,
  };
})();
