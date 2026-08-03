var __MN_HANDWRITING_PREVIEW_MNCommentManagerAddon = (function () {
  "use strict";

  const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const MAX_DRAWING_BASE64_LENGTH = 8 * 1024 * 1024;
  const MAX_FIELDS_PER_MESSAGE = 200000;
  const MAX_STROKES = 10000;
  const MAX_POINTS_PER_STROKE = 100000;
  const MAX_TOTAL_POINTS = 500000;
  const MAX_SVG_LENGTH = 20 * 1024 * 1024;
  const PREVIEW_CACHE_LIMIT = 24;
  const PREVIEW_CACHE_MAX_CHARACTERS = 24 * 1024 * 1024;
  const previewCache = new Map();

  function createError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function normalizeBase64(value) {
    const input = String(value || "")
      .replace(/^data:[^,]+,/, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/\s/g, "");
    if (!input || input.length > MAX_DRAWING_BASE64_LENGTH) {
      throw createError("drawing-size-invalid", "手写数据为空或过大");
    }
    if (input.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) {
      throw createError("invalid-base64", "手写数据 Base64 格式无效");
    }
    return input;
  }

  function decodeBase64(value) {
    const input = normalizeBase64(value);
    const padding = input.endsWith("==") ? 2 : (input.endsWith("=") ? 1 : 0);
    const output = new Uint8Array(Math.max(0, Math.floor(input.length * 3 / 4) - padding));
    let outputIndex = 0;
    let buffer = 0;
    let bits = 0;
    for (let index = 0; index < input.length; index += 1) {
      const character = input.charAt(index);
      if (character === "=") break;
      const valueIndex = BASE64_CHARS.indexOf(character);
      if (valueIndex < 0) throw createError("invalid-base64-character", "手写数据包含无效字符");
      buffer = (buffer << 6) | valueIndex;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        if (outputIndex < output.length) output[outputIndex] = (buffer >> bits) & 255;
        outputIndex += 1;
      }
    }
    return outputIndex === output.length ? output : output.slice(0, outputIndex);
  }

  function encodeBase64(value) {
    const input = String(value || "");
    let output = "";
    for (let index = 0; index < input.length; index += 3) {
      const first = input.charCodeAt(index) & 255;
      const hasSecond = index + 1 < input.length;
      const hasThird = index + 2 < input.length;
      const second = hasSecond ? input.charCodeAt(index + 1) & 255 : 0;
      const third = hasThird ? input.charCodeAt(index + 2) & 255 : 0;
      const combined = (first << 16) | (second << 8) | third;
      output += BASE64_CHARS.charAt((combined >> 18) & 63);
      output += BASE64_CHARS.charAt((combined >> 12) & 63);
      output += hasSecond ? BASE64_CHARS.charAt((combined >> 6) & 63) : "=";
      output += hasThird ? BASE64_CHARS.charAt(combined & 63) : "=";
    }
    return output;
  }

  function readVarint(data, start) {
    let result = 0;
    let shift = 0;
    let position = start;
    while (position < data.length) {
      const byte = data[position++];
      result += (byte & 127) * Math.pow(2, shift);
      if ((byte & 128) === 0) return { value: result, position };
      shift += 7;
      if (shift > 49) throw createError("varint-too-long", "手写数据字段过长");
    }
    throw createError("truncated-varint", "手写数据字段不完整");
  }

  function ensureAvailable(position, length, end, stage) {
    if (!Number.isFinite(length) || length < 0 || position + length > end) {
      throw createError(`truncated-${stage}`, `手写数据在 ${stage} 阶段不完整`);
    }
  }

  function parseFields(data) {
    const fields = [];
    let position = 0;
    const end = data.length;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (position < end) {
      if (fields.length >= MAX_FIELDS_PER_MESSAGE) {
        throw createError("too-many-fields", "手写数据字段数量过多");
      }
      const tagResult = readVarint(data, position);
      position = tagResult.position;
      const fieldNumber = Math.floor(tagResult.value / 8);
      const wireType = tagResult.value & 7;
      if (!fieldNumber) throw createError("invalid-field-number", "手写数据字段编号无效");
      const field = { field: fieldNumber, wireType };
      if (wireType === 0) {
        const varint = readVarint(data, position);
        field.value = varint.value;
        position = varint.position;
      } else if (wireType === 1) {
        ensureAvailable(position, 8, end, "fixed64");
        field.double = view.getFloat64(position, true);
        position += 8;
      } else if (wireType === 2) {
        const lengthResult = readVarint(data, position);
        position = lengthResult.position;
        ensureAvailable(position, lengthResult.value, end, "bytes");
        field.raw = data.slice(position, position + lengthResult.value);
        position += lengthResult.value;
      } else if (wireType === 5) {
        ensureAvailable(position, 4, end, "fixed32");
        field.float = view.getFloat32(position, true);
        position += 4;
      } else {
        throw createError("unsupported-wire-type", `手写数据包含不支持的字段类型 ${wireType}`);
      }
      fields.push(field);
    }
    return fields;
  }

  function groupFields(fields) {
    const grouped = {};
    fields.forEach((field) => {
      if (!grouped[field.field]) grouped[field.field] = [];
      grouped[field.field].push(field);
    });
    return grouped;
  }

  function firstField(grouped, number) {
    return grouped[number] && grouped[number][0] ? grouped[number][0] : null;
  }

  function decodePoints(raw, declaredPointCount) {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const points = [];
    const pointCount = Number(declaredPointCount) > 0
      ? Math.floor(Number(declaredPointCount))
      : Math.floor(raw.length / 12);
    if (pointCount > MAX_POINTS_PER_STROKE) {
      throw createError("too-many-points-in-stroke", "单笔手写点数过多");
    }
    const pointStride = pointCount > 0 ? Math.floor(raw.length / pointCount) : 12;
    if (pointStride < 12) throw createError("invalid-point-stride", "手写点记录长度无效");
    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * pointStride;
      if (offset + 12 > raw.length) break;
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const time = view.getFloat32(offset + 8, true);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y, t: Number.isFinite(time) ? time : 0 });
    }
    return points;
  }

  function floatValue(grouped, number, defaultValue) {
    const field = firstField(grouped, number);
    return field && Number.isFinite(field.float) ? field.float : defaultValue;
  }

  function decodeStroke(raw, index) {
    const grouped = groupFields(parseFields(raw));
    const stroke = { index, points: [], transformedPoints: [] };
    const strokeDataField = firstField(grouped, 5);
    if (strokeDataField && strokeDataField.raw) {
      const strokeData = groupFields(parseFields(strokeDataField.raw));
      const pointCountField = firstField(strokeData, 3);
      const pointsField = firstField(strokeData, 7);
      if (pointsField && pointsField.raw) {
        stroke.points = decodePoints(pointsField.raw, pointCountField ? pointCountField.value : 0);
      }
    }

    const transformField = firstField(grouped, 7);
    let transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    if (transformField && transformField.raw) {
      const transformFields = groupFields(parseFields(transformField.raw));
      transform = {
        a: floatValue(transformFields, 1, 1),
        b: floatValue(transformFields, 2, 0),
        c: floatValue(transformFields, 3, 0),
        d: floatValue(transformFields, 4, 1),
        tx: floatValue(transformFields, 5, 0),
        ty: floatValue(transformFields, 6, 0),
      };
    }
    stroke.transformedPoints = stroke.points.map((point) => ({
      x: transform.a * point.x + transform.c * point.y + transform.tx,
      y: transform.b * point.x + transform.d * point.y + transform.ty,
      t: point.t,
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return stroke;
  }

  function decodeInkData(data) {
    if (data.length < 6) throw createError("truncated-header", "手写数据头不完整");
    if (data[0] !== 119 || data[1] !== 114 || data[2] !== 100) {
      throw createError("invalid-magic-header", "无法识别当前手写数据格式");
    }
    const grouped = groupFields(parseFields(data.slice(6)));
    const strokeFields = grouped[5] || [];
    if (strokeFields.length > MAX_STROKES) throw createError("too-many-strokes", "手写笔画数量过多");
    const strokes = [];
    let totalPoints = 0;
    strokeFields.forEach((strokeField, index) => {
      if (!strokeField.raw) return;
      const stroke = decodeStroke(strokeField.raw, index);
      if (stroke.transformedPoints.length === 0) return;
      totalPoints += stroke.transformedPoints.length;
      if (totalPoints > MAX_TOTAL_POINTS) throw createError("too-many-points", "手写总点数过多");
      strokes.push(stroke);
    });
    if (strokes.length === 0) throw createError("no-valid-strokes", "没有解析到有效手写笔画");

    let penSize = 3;
    const metadataField = firstField(grouped, 4);
    if (metadataField && metadataField.raw) {
      const metadata = groupFields(parseFields(metadataField.raw));
      const penField = firstField(metadata, 8);
      if (penField && Number.isFinite(penField.double) && penField.double > 0) {
        penSize = Math.max(1, Math.min(12, Math.abs(penField.double)));
      }
    }
    return { strokes, penSize };
  }

  function computeBounds(strokes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    strokes.forEach((stroke) => {
      stroke.transformedPoints.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    if (!Number.isFinite(minX)) throw createError("no-valid-bounds", "无法计算手写边界");
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function formatNumber(value) {
    return Number(value).toFixed(2);
  }

  function renderSvg(strokes, bounds, penSize) {
    const margin = Math.max(30, penSize * 6);
    const width = Math.max(1, bounds.width + margin * 2);
    const height = Math.max(1, bounds.height + margin * 2);
    const minX = bounds.x - margin;
    const minY = bounds.y - margin;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${height.toFixed(1)}" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}">`,
      `<rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="white"/>`,
    ];
    strokes.forEach((stroke) => {
      const points = stroke.transformedPoints;
      if (points.length === 1) {
        parts.push(`<circle cx="${formatNumber(points[0].x)}" cy="${formatNumber(points[0].y)}" r="${penSize / 2}" fill="#1d1d1f"/>`);
        return;
      }
      let path = `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`;
      for (let index = 1; index < points.length; index += 1) {
        path += ` L ${formatNumber(points[index].x)} ${formatNumber(points[index].y)}`;
      }
      parts.push(`<path d="${path}" fill="none" stroke="#1d1d1f" stroke-width="${penSize}" stroke-linecap="round" stroke-linejoin="round"/>`);
    });
    parts.push("</svg>");
    const svg = parts.join("\n");
    if (svg.length > MAX_SVG_LENGTH) throw createError("svg-too-large", "手写 SVG 过大");
    return { svg, width, height };
  }

  function renderDrawingDataURI(base64) {
    const decoded = decodeInkData(decodeBase64(base64));
    const bounds = computeBounds(decoded.strokes);
    const rendered = renderSvg(decoded.strokes, bounds, decoded.penSize);
    return {
      dataURI: `data:image/svg+xml;base64,${encodeBase64(rendered.svg)}`,
      strokeCount: decoded.strokes.length,
      pointCount: decoded.strokes.reduce((count, stroke) => count + stroke.transformedPoints.length, 0),
      bounds,
      width: rendered.width,
      height: rendered.height,
    };
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
