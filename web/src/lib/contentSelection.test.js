import { describe, expect, it } from "vitest";
import {
  getMoveState,
  getVirtualSelectionPositions,
  makeContentSelection,
  selectionFromVirtualRange,
} from "./contentSelection";

describe("native excerpt selection", () => {
  it("keeps the excerpt identity separate from comment indices", () => {
    const selection = makeContentSelection(true, [2, 0, 2]);
    expect(selection).toEqual({ excerptSelected: true, commentIndices: [0, 2] });
    expect(getVirtualSelectionPositions(selection, true)).toEqual([0, 1, 3]);
  });

  it("uses virtual positions for ranges that begin at the excerpt", () => {
    expect(selectionFromVirtualRange(0, 2, true, 4)).toEqual({
      excerptSelected: true,
      commentIndices: [0, 1],
    });
  });

  it("keeps comment-only movement below the fixed excerpt", () => {
    const firstComment = getMoveState(makeContentSelection(false, [0]), true, 3);
    expect(firstComment.topBoundary).toBe(1);
    expect(firstComment.canMoveToTop).toBe(false);
    expect(firstComment.canMoveUp).toBe(false);
    expect(firstComment.canMoveDown).toBe(true);
  });

  it("allows a contiguous excerpt selection to move down after conversion", () => {
    const mixed = getMoveState(makeContentSelection(true, [0]), true, 3);
    expect(mixed.positions).toEqual([0, 1]);
    expect(mixed.continuous).toBe(true);
    expect(mixed.canMoveUp).toBe(false);
    expect(mixed.canMoveDown).toBe(true);
    expect(mixed.canMoveToBottom).toBe(true);
  });
});
