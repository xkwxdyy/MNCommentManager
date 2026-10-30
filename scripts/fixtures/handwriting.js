'use strict';
// Synthetic protocol fixtures, not captured Apple/MarginNote data. Each expected
// geometry is specified in tests rather than computed with the production decoder.
function integer(value) {
  const bytes = [];
  do { let byte = value % 128; value = Math.floor(value / 128); if (value) byte |= 128; bytes.push(byte); } while (value);
  return Buffer.from(bytes);
}
function field(number, wire, payload) {
  const data = wire === 0 ? integer(payload) : wire === 2 ? Buffer.concat([integer(payload.length), payload]) : payload;
  return Buffer.concat([integer(number * 8 + wire), data]);
}
function float(number, value) { const b = Buffer.alloc(4); b.writeFloatLE(value); return field(number, 5, b); }
function tuple(values) { return Buffer.concat(values.map((value, index) => float(index + 1, value))); }
function drawing(options = {}) {
  const flags = options.flags === undefined ? 7 : options.flags;
  const channels = [[1, 8], [2, 4], [4, 4], [32, 2], [64, 2], [128, 2]];
  const pointSize = channels.filter(([bit]) => flags & bit).reduce((sum, [, size]) => sum + size, 0);
  const commonSize = channels.filter(([bit]) => !(flags & bit)).reduce((sum, [, size]) => sum + size, 0);
  const points = options.points || [[1, 2, 3], [3, 4, 3]];
  const raw = Buffer.alloc(pointSize * points.length);
  const common = Buffer.alloc(options.commonLength === undefined ? commonSize + 12 : options.commonLength);
  let pointOffset = 0, commonOffset = 0;
  channels.forEach(([bit, size]) => {
    if (flags & bit) {
      points.forEach((point, index) => {
        const at = index * pointSize + pointOffset;
        if (bit === 1) { raw.writeFloatLE(point[0], at); raw.writeFloatLE(point[1], at + 4); }
        if (bit === 2) raw.writeFloatLE(index * 0.5, at);
        if (bit === 4) raw.writeFloatLE(point[2], at);
      });
      pointOffset += size;
    } else {
      if (bit === 4) common.writeFloatLE(options.commonWidth === undefined ? 3 : options.commonWidth, commonOffset);
      commonOffset += size;
    }
  });
  const rgba = options.rgba || [1, 0, 0, 0.5];
  const ink = Buffer.concat([field(1, 2, tuple(rgba)), field(2, 2, Buffer.from(options.brush || 'com.apple.ink.pen')), field(3, 0, 3)]);
  const path = Buffer.concat([
    field(3, 0, options.declaredPoints === undefined ? points.length : options.declaredPoints),
    field(4, 0, flags), field(6, 2, common), field(7, 2, raw),
    ...(options.marker === undefined ? [] : [field(9, 0, options.marker)]),
    ...(options.pathFields || []),
  ]);
  const stroke = Buffer.concat([
    field(4, 0, options.inkIndex || 0), field(5, 2, path),
    field(7, 2, tuple(options.transform || [1, 0, 0, 1, 10, 20])),
    ...(options.strokeFields || []),
  ]);
  return Buffer.concat([Buffer.from('wrd'), field(30, 0, options.version || 0), field(4, 2, ink), field(5, 2, stroke), ...(options.rootFields || [])]);
}
module.exports = { drawing, field, tuple, integer };
