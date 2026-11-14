import { useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";
import "./HelpVideos.css";

export default function HelpVideos() {
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");
  const [popoverStyle, setPopoverStyle] = useState(undefined);

  const syncPopoverPosition = () => {
    const details = detailsRef.current;
    const summary = summaryRef.current;
    if (!details?.open || !summary) return;
    const rect = summary.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const viewportWidth = window.innerWidth || 360;
    const viewportHeight = window.innerHeight || 640;
    const margin = 12;
    const width = Math.min(336, Math.max(240, viewportWidth - margin * 2));
    const top = Math.min(Math.max(margin, Math.round(rect.bottom + 6)), Math.max(margin, viewportHeight - 180));
    const preferredLeft = Math.round(rect.right - width + 8);
    const left = Math.min(Math.max(margin, preferredLeft), Math.max(margin, viewportWidth - width - margin));
    const maxHeight = Math.max(160, Math.round(viewportHeight - top - margin));
    setPopoverStyle({
      top: `${top}px`,
      left: `${left}px`,
      right: "auto",
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
    });
  };

  useEffect(() => {
    const close = (event) => {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (!details.contains(event.target)) details.open = false;
    };
    const closeOnEscape = (event) => {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (event.isComposing || event.keyCode === 229 || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      summaryRef.current?.focus({ preventScroll: true });
    };
    const handleViewportChange = () => {
      if (detailsRef.current?.open) syncPopoverPosition();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("touchstart", close, { passive: true });
    document.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, []);

  const openVideo = async (id) => {
    if (pending) return;
    setPending(true);
    setOpeningId(id);
    setError("");
    try {
      await MNBridge.send("openHelpVideo", { id });
      if (!detailsRef.current) return;
      detailsRef.current.open = false;
      detailsRef.current.querySelector("summary").focus();
    } catch (failure) {
      setError(`打开视频失败：${failure?.message || String(failure)}`);
    } finally {
      setPending(false);
      setOpeningId("");
    }
  };

  return (
    <details
      className="help-videos"
      ref={detailsRef}
      onToggle={() => {
        if (detailsRef.current?.open) syncPopoverPosition();
      }}
      onBlur={(event) => {
        if (event.relatedTarget && detailsRef.current?.open && !detailsRef.current.contains(event.relatedTarget)) {
          detailsRef.current.open = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229) return;
        if (event.key === "Escape" && detailsRef.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          detailsRef.current.open = false;
          detailsRef.current.querySelector("summary").focus();
          return;
        }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && detailsRef.current?.open) {
          const buttons = [...detailsRef.current.querySelectorAll(".help-videos-resources button:not(:disabled)")];
          if (!buttons.length) return;
          event.preventDefault();
          const currentIndex = buttons.indexOf(document.activeElement);
          const nextIndex =
            event.key === "ArrowDown"
              ? (currentIndex + 1) % buttons.length
              : (currentIndex - 1 + buttons.length) % buttons.length;
          buttons[nextIndex]?.focus();
        }
      }}
    >
      <summary ref={summaryRef} title="帮助与视频" aria-label="帮助与视频">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16v1" />
        </svg>
      </summary>
      <div className="help-videos-resources" aria-label="帮助视频" style={popoverStyle}>
        <div className="help-videos-header">
          <strong>帮助与视频</strong>
          <span className="help-videos-badge">视频教程</span>
        </div>
        <button
          type="button"
          className={`secondary help-video-button${openingId === "promo" ? " is-opening" : ""}`}
          disabled={pending}
          onClick={() => openVideo("promo")}
        >
          <span className="help-video-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M8.5 7.25 13.25 10 8.5 12.75V7.25Z" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="help-video-copy">
            <span className="help-video-title">AI 宣传视频（约 1 分钟）</span>
            <span className="help-video-subtitle">快速了解评论整理、摘录与工作流亮点</span>
          </span>
          <span className="help-video-trailing" aria-hidden="true">
            {openingId === "promo" ? "打开中…" : "↗"}
          </span>
        </button>
        <button
          type="button"
          className={`secondary help-video-button${openingId === "gettingStarted" ? " is-opening" : ""}`}
          disabled={pending}
          onClick={() => openVideo("gettingStarted")}
        >
          <span className="help-video-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 5.25A1.75 1.75 0 0 1 5.25 3.5h9.5A1.75 1.75 0 0 1 16.5 5.25v9.5a1.75 1.75 0 0 1-1.75 1.75h-9.5A1.75 1.75 0 0 1 3.5 14.75v-9.5Z" />
              <path d="M7 7.5h6M7 10.25h6M7 13h3.5" />
            </svg>
          </span>
          <span className="help-video-copy">
            <span className="help-video-title">入门讲解</span>
            <span className="help-video-subtitle">从基础面板操作到浮动按钮与批处理全流程</span>
          </span>
          <span className="help-video-trailing" aria-hidden="true">
            {openingId === "gettingStarted" ? "打开中…" : "↗"}
          </span>
        </button>
        <p className="help-videos-note">视频优先在 MNBrowser 中打开；未启用 MNBrowser 时使用内置研究浏览器，缺少可用学习集时使用系统浏览器。</p>
        {pending ? <p className="help-videos-status" role="status">正在打开视频…</p> : null}
        {error ? <p className="help-videos-error" role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
