import { useEffect, useRef } from "react";

export default function SelectionActionsPanel({ open, onClose, children }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);
  return (
    <>
      {open ? <div className="selection-actions-backdrop" aria-hidden="true" onPointerDown={onClose} /> : null}
      <div id="selection-actions-panel" className="selection-actions-panel" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined} aria-label="更多选区操作" hidden={!open}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Tab") {
            const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}>
        <div className="selection-actions-heading"><strong>更多选区操作</strong><button ref={closeRef} type="button" className="selection-actions-close ghost" aria-label="关闭选区操作" title="关闭（Esc）" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        {children}
      </div>
    </>
  );
}
