import ActionIcon from "./ActionIcon";
import { useEffect, useRef } from "react";

export default function SelectionActionsPanel({ open, onClose, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      (closeRef.current || panelRef.current)?.focus({ preventScroll: true });
    }
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
        if (!buttons.length) {
          event.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!panel.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  return (
    <>
      {open ? <div className="selection-actions-backdrop" aria-hidden="true" onPointerDown={onClose} onClick={onClose} /> : null}
      <div id="selection-actions-panel" ref={panelRef} className="selection-actions-panel" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined} aria-label="更多选区操作" tabIndex={open ? -1 : undefined} hidden={!open}
        onKeyDown={(event) => event.stopPropagation()}>
        <div className="selection-actions-heading"><strong>更多选区操作</strong><button ref={closeRef} type="button" className="selection-actions-close ghost" aria-label="关闭选区操作" title="关闭（Esc）" onClick={onClose}><ActionIcon name="close" /></button></div>
        {children}
      </div>
    </>
  );
}
