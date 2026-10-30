var __MN_HANDWRITING_DECODER_MNCommentManagerAddon = (function () {
  "use strict";
  // Standalone, bounded PencilKit subset. Keep each addon's runtime independent.
  // Format handling is informed by the reviewed Ink To Card 1.0.6 implementation;
  // this is an approximate renderer, not Apple's PencilKit rasterizer.
  var MAX_BYTES = 6 * 1024 * 1024;
  var MAX_POINTS = 500000;
  var MAX_STROKES = 10000;
  var MAX_SVG = 20 * 1024 * 1024;
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }
  function need(ok, code, message) { if (!ok) fail(code, message); }
  function diagnostic(code, message) { return { code: code, message: message }; }
  function base64Bytes(value) {
    var text = String(value || "").replace(/^data:[^,]+,/, "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    need(text.length > 0 && text.length <= MAX_BYTES * 4 / 3, "drawing-size-invalid", "手写数据为空或过大");
    need(/^[A-Za-z0-9+/]*={0,2}$/.test(text) && text.length % 4 !== 1 && (text.indexOf("=") < 0 || text.length % 4 === 0), "invalid-base64", "手写数据 Base64 格式无效");
    var plain = text.replace(/=+$/, "");
    var last = ALPHABET.indexOf(plain.charAt(plain.length - 1));
    need((plain.length % 4 !== 2 || (last & 15) === 0) && (plain.length % 4 !== 3 || (last & 3) === 0), "invalid-base64", "手写数据 Base64 尾部无效");
    var bytes = new Uint8Array(Math.floor(plain.length * 3 / 4)), bits = 0, accumulator = 0, at = 0;
    for (var i = 0; i < plain.length; i += 1) {
      accumulator = (accumulator << 6) | ALPHABET.indexOf(plain[i]); bits += 6;
      if (bits >= 8) { bits -= 8; bytes[at++] = (accumulator >> bits) & 255; }
    }
    return bytes;
  }
  function ascii(bytes) { var result = ""; for (var i = 0; i < bytes.length; i += 1) result += String.fromCharCode(bytes[i]); return result; }
  function header(bytes, text) { return bytes.length >= text.length && ascii(bytes.subarray(0, text.length)) === text; }
  function fields(bytes) {
    var at = 0, result = Object.create(null), total = 0;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function available(count) { need(Number.isSafeInteger(count) && count >= 0 && at + count <= bytes.length, "truncated-drawing", "手写数据字段不完整"); }
    function integer() {
      var value = 0, multiplier = 1;
      for (var index = 0; index < 8; index += 1) {
        available(1); var byte = bytes[at++]; value += (byte & 127) * multiplier;
        need(Number.isSafeInteger(value), "invalid-varint", "手写数据整数超出范围");
        if (!(byte & 128)) return value;
        multiplier *= 128;
      }
      fail("invalid-varint", "手写数据整数过长");
    }
    while (at < bytes.length) {
      need(++total <= 200000, "too-many-fields", "手写数据字段数量过多");
      var tag = integer(), number = Math.floor(tag / 8), wire = tag % 8, value;
      need(number > 0 && number <= 536870911, "invalid-field-number", "手写数据字段编号无效");
      if (wire === 0) value = integer();
      else if (wire === 2) { var count = integer(); available(count); value = bytes.subarray(at, at + count); at += count; }
      else if (wire === 5) { available(4); value = view.getFloat32(at, true); at += 4; }
      else if (wire === 1) { available(8); value = bytes.subarray(at, at + 8); at += 8; }
      else fail("unsupported-wire-type", "手写数据包含不支持的字段类型");
      if (!result[number]) result[number] = [];
      result[number].push({ wire: wire, value: value });
    }
    return result;
  }
  function schema(records, allowed) {
    Object.keys(records).forEach(function (number) {
      need(Object.prototype.hasOwnProperty.call(allowed, number) && records[number].every(function (item) { return item.wire === allowed[number]; }), "unsupported-drawing-field", "绘图含未支持的字段或字段类型：" + number);
    });
  }
  function one(records, number, optional) {
    var items = records[number] || [];
    if (!items.length && optional) return null;
    need(items.length === 1, "invalid-drawing-field", "绘图字段缺失或重复：" + number);
    return items[0].value;
  }
  function floatTuple(bytes, count) {
    var records = fields(bytes), allowed = {}, result = [];
    for (var i = 1; i <= count; i += 1) allowed[i] = 5;
    schema(records, allowed);
    for (var i = 1; i <= count; i += 1) { var value = one(records, i); need(Number.isFinite(value), "invalid-drawing-float", "绘图数值无效"); result.push(value); }
    return result;
  }
  function layout(flags, stride, commonLength) {
    need(Number.isSafeInteger(flags) && flags <= 255 && (flags & 1) && !(flags & ~231), "unsupported-point-layout", "笔画通道包含未支持的标志");
    var channels = [[1, 8], [2, 4], [4, 4], [32, 2], [64, 2], [128, 2]], pointBytes = 0, commonBytes = 0, widthOffset = 0;
    channels.forEach(function (channel) {
      if (channel[0] === 4) widthOffset = flags & 4 ? pointBytes : commonBytes;
      if (flags & channel[0]) pointBytes += channel[1]; else commonBytes += channel[1];
    });
    var standard = commonLength === commonBytes + 12;
    var legacy = !!(flags & 4) && commonLength === commonBytes + 10;
    var extension = flags === 39 && commonLength === 20;
    need(stride === pointBytes && (standard || legacy || extension), "unsupported-point-layout", "笔画通道与数据长度不一致");
    return { widthOffset: widthOffset, perPointWidth: !!(flags & 4) };
  }
  function readInk(bytes, compatibility) {
    var records = fields(bytes); schema(records, { 1: 2, 2: 2, 3: 0, 8: 1 });
    var rgba = floatTuple(one(records, 1), 4), brush = ascii(one(records, 2));
    need(brush === "com.apple.ink.pen" || (compatibility && brush === "com.apple.ink.fountainpen"), "unsupported-brush", "当前绘图笔刷尚未验证：" + brush.slice(0, 80));
    need(one(records, 3, true) === 3 && rgba.every(function (value) { return value >= 0 && value <= 1; }), "unsupported-ink-color", "绘图颜色模型或颜色值无效");
    var color = "#" + rgba.slice(0, 3).map(function (value) { return ("0" + Math.round(value * 255).toString(16)).slice(-2); }).join("");
    return { color: color, opacity: rgba[3] };
  }
  function readDrawing(bytes, compatibility) {
    need(header(bytes, "wrd"), "invalid-magic-header", "无法识别当前手写数据格式");
    var root = fields(bytes.subarray(3));
    var rootSchema = { 1: 0, 2: 2, 3: 2, 4: 2, 5: 2, 7: 2, 8: 2, 30: 0 };
    if (compatibility) rootSchema[46] = 0;
    schema(root, rootSchema);
    [1, 30].concat(compatibility ? [46] : []).forEach(function (number) {
      var version = one(root, number, true); need(version === null || version === 0, "unsupported-drawing-version", "绘图版本尚未支持");
    });
    var inks = root[4] || [], strokeFields = root[5] || [], totalPoints = 0, diagnostics = [], markers = [];
    need(inks.length > 0 && inks.length <= 64 && strokeFields.length > 0 && strokeFields.length <= MAX_STROKES, "invalid-stroke-count", "绘图笔色或笔画数量无效");
    inks = inks.map(function (record) { return readInk(record.value, compatibility); });
    var strokes = strokeFields.map(function (record) {
      var stroke = fields(record.value), strokeSchema = { 1: 2, 2: 2, 3: 2, 4: 0, 5: 2, 6: 2, 7: 2, 8: 0, 13: 2, 14: 0 };
      if (compatibility) strokeSchema[15] = 2;
      schema(stroke, strokeSchema);
      var ink = inks[one(stroke, 4)], transform = floatTuple(one(stroke, 7), 6);
      need(!!ink, "invalid-ink-reference", "笔画引用的笔色不存在");
      var determinant = transform[0] * transform[3] - transform[1] * transform[2];
      var first = transform[0] * transform[0] + transform[1] * transform[1], second = transform[2] * transform[2] + transform[3] * transform[3];
      need(Number.isFinite(determinant) && Math.abs(determinant) > 0 && first > 0 && second > 0, "invalid-transform", "笔画坐标变换无效");
      if (Math.abs(first - second) > first * 0.0001 || Math.abs(transform[0] * transform[2] + transform[1] * transform[3]) > first * 0.0001) diagnostics.push(diagnostic("nonuniform-transform", "笔画含非等比变换，仅供近似预览"));
      var widthScale = Math.sqrt(Math.abs(determinant));
      var path = fields(one(stroke, 5)); schema(path, { 1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: 2, 7: 2, 9: 0 });
      var count = one(path, 3), flags = one(path, 4), common = one(path, 6), raw = one(path, 7), marker = one(path, 9, true);
      need(count > 0 && count <= 100000 && (totalPoints += count) <= MAX_POINTS && raw.length % count === 0, "invalid-point-count", "笔画点数或数据长度无效");
      var channel = layout(flags, raw.length / count, common.length), stride = raw.length / count;
      var view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), commonView = new DataView(common.buffer, common.byteOffset, common.byteLength);
      if (marker !== null && marker !== 0) diagnostics.push(diagnostic("unverified-path-marker", "笔画含未验证的路径标记，仅供近似预览"));
      var shape = one(stroke, 13, true), shapeKind = one(stroke, 14, true);
      if (shape !== null || shapeKind !== null) {
        need(shape && shape.length === 16 && shapeKind === 6, "unsupported-shape-marker", "笔画图形标记尚未支持");
        diagnostics.push(diagnostic("unverified-shape-marker", "笔画含图形标记，仅供近似预览"));
      }
      markers.push({ path: marker, shape: shape ? Array.prototype.join.call(shape, ",") : null, kind: shapeKind });
      var extra = compatibility ? one(stroke, 15, true) : null;
      if (extra) need(floatTuple(extra, 6).join(",") === "1,0,0,0.25,0,0", "unsupported-archive-transform", "归档的附加变换尚未支持");
      var points = [];
      for (var i = 0; i < count; i += 1) {
        var at = i * stride, x = view.getFloat32(at, true), y = view.getFloat32(at + 4, true);
        var width = (channel.perPointWidth ? view.getFloat32(at + channel.widthOffset, true) : commonView.getFloat32(channel.widthOffset, true)) * widthScale;
        var px = transform[0] * x + transform[2] * y + transform[4], py = transform[1] * x + transform[3] * y + transform[5];
        need(Number.isFinite(px) && Number.isFinite(py) && Math.abs(px) <= 10000000 && Math.abs(py) <= 10000000 && Number.isFinite(width) && width > 0 && width <= 1000, "invalid-point", "笔画坐标或笔宽无效");
        points.push({ x: px, y: py, width: width });
      }
      return { color: ink.color, opacity: ink.opacity, points: points };
    });
    // Deduplicate diagnostics without hiding the fact that the result is restricted.
    diagnostics = diagnostics.filter(function (entry, index, all) { return all.findIndex(function (other) { return other.code === entry.code; }) === index; });
    return { strokes: strokes, pointCount: totalPoints, markers: markers, approximate: true, previewOnly: diagnostics.length > 0, diagnostics: diagnostics, format: "PencilKit wrd" };
  }

  function propertyList(bytes) {
    need(header(bytes, "bplist00") && bytes.length >= 40, "unsupported-archive", "绘图归档头部无效或版本尚未支持");
    var trailer = bytes.length - 32;
    function uint(at, size, end) {
      need(Number.isSafeInteger(at) && size >= 1 && size <= 8 && at >= 0 && at + size <= end, "invalid-archive-offset", "绘图归档引用越界");
      var result = 0;
      for (var i = 0; i < size; i += 1) result = result * 256 + bytes[at + i];
      need(Number.isSafeInteger(result), "invalid-archive-integer", "绘图归档整数超出范围"); return result;
    }
    var offsetSize = bytes[trailer + 6], refSize = bytes[trailer + 7], count = uint(trailer + 8, 8, bytes.length), top = uint(trailer + 16, 8, bytes.length), table = uint(trailer + 24, 8, bytes.length);
    need(count > 0 && count <= 32768 && top < count && table >= 8 && table < trailer && offsetSize >= 1 && offsetSize <= 8 && refSize >= 1 && refSize <= 8 && table + count * offsetSize === trailer, "invalid-archive-table", "绘图归档偏移表无效");
    var offsets = [], ends = Object.create(null), cache = [], active = [], references = 0;
    for (var i = 0; i < count; i += 1) { var at = uint(table + i * offsetSize, offsetSize, trailer); need(at >= 8 && at < table, "invalid-archive-offset", "绘图归档对象越界"); offsets.push(at); }
    offsets.slice().sort(function (a, b) { return a - b; }).forEach(function (at, index, sorted) {
      need(index === 0 || at !== sorted[index - 1], "invalid-archive-offset", "绘图归档对象偏移重复"); ends[at] = sorted[index + 1] || table;
    });
    function object(index, depth) {
      need(index < count && depth <= 64 && !active[index], "invalid-archive-reference", "绘图归档引用无效或存在循环");
      if (cache[index] !== undefined) return cache[index];
      active[index] = true;
      var at = offsets[index], end = ends[at], marker = bytes[at++], kind = marker >> 4, size = marker & 15, result;
      function length() {
        if (size < 15) return size;
        need(at < end && bytes[at] >> 4 === 1, "invalid-archive-length", "绘图归档长度无效");
        var width = Math.pow(2, bytes[at++] & 15), value = uint(at, width, end); at += width; return value;
      }
      if (kind === 0 && (marker === 0 || marker === 8 || marker === 9)) result = marker === 0 ? null : marker === 9;
      else if (kind === 1) result = uint(at, Math.pow(2, size), end);
      else if (kind === 8) result = { uid: uint(at, size + 1, end) };
      else if (kind === 4 || kind === 5 || kind === 6) {
        var len = length(), width = kind === 6 ? 2 : 1;
        need(len <= MAX_BYTES && at + len * width <= end, "truncated-archive", "绘图归档数据不完整");
        if (kind === 4) result = bytes.subarray(at, at + len);
        else { need(len <= 4096, "archive-string-too-long", "绘图归档字符串过长"); result = ""; for (var j = 0; j < len; j += 1) result += String.fromCharCode(uint(at + j * width, width, end)); }
      } else if (kind === 10 || kind === 13) {
        var len = length(), slots = len * (kind === 13 ? 2 : 1); references += slots;
        need(slots <= 65536 && references <= 131072 && at + slots * refSize <= end, "invalid-archive-container", "绘图归档容器过大或不完整");
        result = kind === 10 ? [] : Object.create(null);
        for (var j = 0; j < len; j += 1) {
          var item = object(uint(at + j * refSize, refSize, end), depth + 1);
          if (kind === 10) result.push(item);
          else { need(typeof item === "string" && !Object.prototype.hasOwnProperty.call(result, item), "invalid-archive-key", "绘图归档字典键无效或重复"); result[item] = object(uint(at + (len + j) * refSize, refSize, end), depth + 1); }
        }
      } else fail("unsupported-archive-object", "绘图归档包含未支持的对象类型");
      active[index] = false; cache[index] = result; return result;
    }
    return object(top, 0);
  }
  function dictionary(value, allowed) {
    need(value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array) && Object.keys(value).every(function (key) { return allowed.indexOf(key) >= 0; }), "unsupported-archive-dictionary", "绘图归档字典结构尚未支持");
  }
  function archiveDrawings(bytes) {
    var root = propertyList(bytes);
    if (root && root.$archiver !== undefined) {
      dictionary(root, ["$archiver", "$version", "$objects", "$top"]);
      need(root.$archiver === "NSKeyedArchiver" && root.$version === 100000 && Array.isArray(root.$objects) && root.$objects[0] === "$null", "unsupported-keyed-archive", "绘图归档类型或版本尚未支持");
      dictionary(root.$top, ["root"]);
      function resolve(value) {
        need(value && Object.keys(value).length === 1 && Number.isInteger(value.uid) && value.uid > 0 && value.uid < root.$objects.length, "invalid-keyed-reference", "绘图归档对象引用无效"); return root.$objects[value.uid];
      }
      var container = resolve(root.$top.root); dictionary(container, ["NS.keys", "NS.objects", "$class"]);
      var definition = resolve(container.$class); dictionary(definition, ["$classname", "$classes"]);
      need(definition.$classname === "NSDictionary" && Array.isArray(definition.$classes) && definition.$classes.join(",") === "NSDictionary,NSObject", "unsupported-keyed-class", "绘图归档根对象尚未支持");
      var keys = container["NS.keys"], values = container["NS.objects"], extracted = Object.create(null);
      need(Array.isArray(keys) && Array.isArray(values) && keys.length === values.length && keys.length >= 1 && keys.length <= 2, "invalid-archive-variants", "绘图归档版本列表无效");
      keys.forEach(function (reference, index) { var key = resolve(reference); need(typeof key === "string" && !Object.prototype.hasOwnProperty.call(extracted, key), "invalid-archive-key", "绘图归档字典键无效或重复"); extracted[key] = resolve(values[index]); });
      root = extracted;
    }
    dictionary(root, ["drawing1", "drawing2"]);
    need(Object.keys(root).length > 0, "empty-drawing-archive", "归档没有绘图数据");
    Object.keys(root).forEach(function (key) { need(root[key] instanceof Uint8Array && header(root[key], "wrd"), "invalid-archive-drawing", "归档中的绘图数据格式无效"); });
    return root;
  }
  function decode(bytes) {
    need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= MAX_BYTES, "drawing-size-invalid", "手写数据为空或过大");
    if (!header(bytes, "bplist")) return readDrawing(bytes, false);
    var variants = archiveDrawings(bytes), selected = variants.drawing1 ? "drawing1" : "drawing2", drawing = readDrawing(variants[selected], false);
    drawing.archive = { selected: selected, verifiedAlternative: "" };
    if (variants.drawing1 && variants.drawing2) {
      var other = readDrawing(variants.drawing2, true);
      need(JSON.stringify(drawing.strokes) === JSON.stringify(other.strokes) && JSON.stringify(drawing.diagnostics) === JSON.stringify(other.diagnostics) && JSON.stringify(drawing.markers) === JSON.stringify(other.markers), "archive-variants-mismatch", "归档内绘图版本内容不一致，已停止处理");
      drawing.archive.verifiedAlternative = "drawing2";
    }
    return drawing;
  }
  function render(drawing, purpose) {
    purpose = purpose || "preview";
    need(purpose === "preview" || purpose === "ocr" || purpose === "export", "invalid-render-purpose", "手写绘图输出用途无效");
    var ocr = purpose === "ocr", minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (purpose !== "preview" && drawing.previewOnly) fail("drawing-preview-only", "该绘图仅供近似预览，不能用于文字识别或导出：" + drawing.diagnostics.map(function (entry) { return entry.message; }).join("；"));
    var visible = drawing.strokes.filter(function (stroke) { return stroke.opacity > 0; });
    visible.forEach(function (stroke) { stroke.points.forEach(function (point) { var radius = point.width / 2; minX = Math.min(minX, point.x - radius); minY = Math.min(minY, point.y - radius); maxX = Math.max(maxX, point.x + radius); maxY = Math.max(maxY, point.y + radius); }); });
    need(Number.isFinite(minX), "no-visible-strokes", "绘图没有可见笔画");
    var margin = 30, width = maxX - minX + margin * 2, height = maxY - minY + margin * 2;
    minX -= margin; minY -= margin;
    var scale = Math.min(1, (ocr ? 2048 : 1024) / Math.max(width, height));
    function number(value) { return Number(value).toFixed(2); }
    var parts = [], size = 0;
    function push(text) { size += text.length; need(size <= MAX_SVG, "svg-too-large", "手写 SVG 过大"); parts.push(text); }
    push('<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.max(1, Math.round(width * scale)) + '" height="' + Math.max(1, Math.round(height * scale)) + '" viewBox="' + [minX, minY, width, height].map(number).join(" ") + '">');
    push('<rect x="' + number(minX) + '" y="' + number(minY) + '" width="' + number(width) + '" height="' + number(height) + '" fill="white"/>');
    visible.forEach(function (stroke) {
      var color = ocr ? "#1d1d1f" : stroke.color, points = stroke.points, opacity = String(stroke.opacity);
      push('<g opacity="' + opacity + '">');
      var common = points.every(function (point) { return Math.abs(point.width - points[0].width) < 0.001; });
      if (points.length === 1) push('<circle cx="' + number(points[0].x) + '" cy="' + number(points[0].y) + '" r="' + number(points[0].width / 2) + '" fill="' + color + '"/>');
      else if (common) {
        var path = points.map(function (point, index) { return (index ? "L " : "M ") + number(point.x) + " " + number(point.y); }).join(" ");
        push('<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="' + number(points[0].width) + '" stroke-linecap="round" stroke-linejoin="round"/>');
      } else {
        // Piecewise widths approximate pressure changes without claiming native brush fidelity.
        points.forEach(function (point, index) {
          push('<circle cx="' + number(point.x) + '" cy="' + number(point.y) + '" r="' + number(point.width / 2) + '" fill="' + color + '"/>');
          if (!index) return;
          var previous = points[index - 1];
          push('<path d="M ' + number(previous.x) + ' ' + number(previous.y) + ' L ' + number(point.x) + ' ' + number(point.y) + '" fill="none" stroke="' + color + '" stroke-width="' + number((previous.width + point.width) / 2) + '" stroke-linecap="round"/>');
        });
      }
      push('</g>');
    });
    push('</svg>');
    return { svg: parts.join("\n"), width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), bounds: { x: minX, y: minY, width: width, height: height }, strokeCount: drawing.strokes.length, pointCount: drawing.pointCount, approximate: true, previewOnly: drawing.previewOnly, diagnostics: drawing.diagnostics, archive: drawing.archive || null, format: drawing.format };
  }
  function renderBase64(base64, purpose) { return render(decode(base64Bytes(base64)), purpose); }
  return { decodeBase64: base64Bytes, decode: decode, render: render, renderBase64: renderBase64 };
})();
