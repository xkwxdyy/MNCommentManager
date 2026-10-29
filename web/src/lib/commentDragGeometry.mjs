export const clampDrag = (value, min, max) => Math.max(min, Math.min(max, value));

export function dragTarget(from, count, y, originY, top, bottom) {
  if (count < 2 || bottom - top < 3) return from;
  const anchor = clampDrag(originY, top + 1, bottom - 1);
  const position = clampDrag(y, top, bottom);
  return clampDrag(position <= anchor
    ? Math.round(from * (position - top) / (anchor - top))
    : from + Math.round((count - 1 - from) * (position - anchor) / (bottom - anchor)), 0, count - 1);
}

export function alignedDragCenter(y, top, bottom, height) {
  const inset = height / 2 + 8;
  return bottom - top < inset * 2 ? (top + bottom) / 2 : clampDrag(y, top + inset, bottom - inset);
}

export const dragInsertionIndex = (from, to) => to > from ? to + 1 : to;
