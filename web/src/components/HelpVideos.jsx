import { useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";
import "./HelpVideos.css";

export default function HelpVideos() {
  const detailsRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const close = (event) => {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (!details.contains(event.target)) details.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
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
      onKeyDown={(event) => {
        if (event.isComposing) return;
        if (event.key === "Escape") {
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
      <summary title="帮助与视频" aria-label="帮助与视频">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16v1" />
        </svg>
      </summary>
      <div className="help-videos-resources" aria-label="帮助视频">
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
