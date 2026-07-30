function normalizeIndices(indices) {
  return Array.from(new Set((Array.isArray(indices) ? indices : [])
    .map((index) => Number.parseInt(index, 10))
    .filter((index) => Number.isFinite(index) && index >= 0)))
    .sort((a, b) => a - b);
}

export function makeContentSelection(excerptSelected, commentIndices) {
  return {
    excerptSelected: excerptSelected === true,
    commentIndices: normalizeIndices(commentIndices),
  };
}

export function getVirtualPositionForComment(index, excerptPresent) {
  return Number(index) + (excerptPresent ? 1 : 0);
}

export function getVirtualSelectionPositions(selection, excerptPresent) {
  const normalized = makeContentSelection(selection?.excerptSelected, selection?.commentIndices);
  const positions = normalized.commentIndices.map((index) => getVirtualPositionForComment(index, excerptPresent));
  if (excerptPresent && normalized.excerptSelected) positions.unshift(0);
  return positions;
}

export function selectionFromVirtualRange(start, end, excerptPresent, commentCount) {
  const lower = Math.max(0, Math.min(Number(start), Number(end)));
  const upper = Math.max(Number(start), Number(end));
  const offset = excerptPresent ? 1 : 0;
  const commentIndices = Array.from({ length: Math.max(0, Number(commentCount) || 0) }, (_, index) => index)
    .filter((index) => {
      const position = index + offset;
      return position >= lower && position <= upper;
    });
  return makeContentSelection(excerptPresent && lower === 0, commentIndices);
}

export function getMoveState(selection, excerptPresent, commentCount) {
  const positions = getVirtualSelectionPositions(selection, excerptPresent);
  const selectedCount = positions.length;
  const totalCount = Math.max(0, Number(commentCount) || 0) + (excerptPresent ? 1 : 0);
  const continuous = selectedCount > 0 && positions[positions.length - 1] - positions[0] + 1 === selectedCount;
  const topBoundary = excerptPresent && !selection?.excerptSelected ? 1 : 0;
  const first = positions[0];
  const last = positions[positions.length - 1];
  return {
    positions,
    selectedCount,
    totalCount,
    continuous,
    topBoundary,
    canMoveToTop: selectedCount > 0 && first > topBoundary,
    canMoveUp: continuous && first > topBoundary,
    canMoveDown: continuous && last < totalCount - 1,
    canMoveToBottom: selectedCount > 0 && last < totalCount - 1,
    canPickInsertPosition: selectedCount > 0 && selectedCount < totalCount,
  };
}
