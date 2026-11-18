import { useEffect, useRef, useState } from "react";

// Narrow panels fold low-frequency panel tools into one menu so the card title keeps its row.
export default function TopbarMoreMenu({ className = "", items }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(undefined);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return undefined;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) {
      const width = 200;
      const viewportWidth = window.innerWidth || 360;
      const left = Math.min(Math.max(8, Math.round(rect.right - width)), Math.max(8, viewportWidth - width - 8));
      setMenuStyle({ top: `${Math.round(rect.bottom + 4)}px`, left: `${left}px`, width: `${width}px` });
    }
    triggerRef.current?.parentElement?.querySelector(".topbar-more-menu button:not(:disabled)")?.focus({ preventScroll: true });
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !rootRef.current?.contains(document.activeElement)) return;
      const buttons = [...rootRef.current.querySelectorAll(".topbar-more-menu button:not(:disabled)")];
      if (buttons.length === 0) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % buttons.length
            : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className={`topbar-more ${className}`.trim()}
      ref={rootRef}
      onBlur={(event) => {
        if (open && event.relatedTarget && !rootRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="secondary topbar-more-trigger"
        aria-label="更多面板操作"
        title="模块划分、工作流与设置"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
      </button>
      {open ? (
        <div className="topbar-more-menu" role="menu" aria-label="更多面板操作" style={menuStyle}>
          {visibleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect(triggerRef.current);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
