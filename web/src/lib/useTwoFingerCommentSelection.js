import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { attachTwoFingerSelection } from './twoFingerSelection.mjs';
import { createCommentHitTester } from './commentSelectionGeometry.mjs';

export default function useTwoFingerCommentSelection({ paneRef, selected, visibleIndices, projectionKey, visibilityKey, disabled, onSelection, onClaim, onStatus }) {
  const latest = useRef(null), api = useRef(null);
  latest.current = { selected, visibleIndices, disabled, onSelection, onClaim, onStatus };
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const geometry = createCommentHitTester(pane, () => latest.current.visibleIndices);
    const gesture = attachTwoFingerSelection(pane, {
      getSelection: () => latest.current.selected,
      getVisibleIds: () => latest.current.visibleIndices,
      setSelection: next => { latest.current.selected = next; latest.current.onSelection(next); },
      disabled: () => latest.current.disabled || !!pane.ownerDocument.querySelector('[role="dialog"]'),
      onClaim: () => latest.current.onClaim(),
      onStatus: message => latest.current.onStatus(message),
      hitTest: geometry.hitTest,
      onFinish: geometry.invalidate,
    });
    api.current = gesture;
    return () => { gesture.destroy(); geometry.destroy(); if (api.current === gesture) api.current = null; };
  }, [paneRef]);
  // Snapshot replacement already decides the new card's selection. Never apply
  // a previous card's baseline indices to that replacement.
  useLayoutEffect(() => { api.current?.cancel(undefined, { restore: false }); }, [projectionKey]);
  useLayoutEffect(() => { api.current?.cancel(); }, [visibilityKey, disabled]);
  return useMemo(() => ({ cancel: (...args) => api.current?.cancel(...args), isActive: () => !!api.current?.active }), []);
}
