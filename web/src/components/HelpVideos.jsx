import { useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";
import "./HelpVideos.css";

export default function HelpVideos() {
  const detailsRef = useRef(null);
  const [pending, setPending] = useState(false);
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
    }
  };

  return (
    <details className="help-videos" ref={detailsRef} onKeyDown={(event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        detailsRef.current.open = false;
        detailsRef.current.querySelector("summary").focus();
      }
    }}>
      <summary title="帮助与视频" aria-label="帮助与视频">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16v1" />
        </svg>
      </summary>
      <div className="help-videos-resources" aria-label="帮助视频">
        <strong>帮助与视频</strong>
        <button type="button" className="secondary" disabled={pending} onClick={() => openVideo("promo")}>AI 宣传视频（约 1 分钟）</button>
        <button type="button" className="secondary" disabled={pending} onClick={() => openVideo("gettingStarted")}>入门讲解</button>
        <p>视频优先在 MNBrowser 中打开；未启用 MNBrowser 时使用内置研究浏览器，缺少可用学习集时使用系统浏览器。</p>
        {pending ? <p role="status">正在打开视频…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
