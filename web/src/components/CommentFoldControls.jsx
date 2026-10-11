import { memo, useMemo } from "react";
import { renderMarkdownToHtml } from "../lib/markdownRenderer";

function FoldIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h16" />
      {collapsed ? <path d="M8 3l4 4 4-4M12 7V2M8 21l4-4 4 4M12 17v5" /> : <path d="M8 6l4-4 4 4M12 2v6M8 18l4 4 4-4M12 16v6" />}
    </svg>
  );
}

export function CommentFoldButton({ comment, selectionCount = 1, disabled, onToggle }) {
  if (comment.capabilities?.canSetCollapsed !== true) return null;
  const collapsed = comment.collapsed === true;
  const action = collapsed ? "展开" : "折叠";
  const label = selectionCount > 1
    ? `${action}所选 ${selectionCount} 条评论（按评论 #${comment.index} 切换）`
    : `${action}评论 #${comment.index}`;
  return (
    <button
      type="button"
      className="comment-fold-button"
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls={`comment-${comment.index}-body`}
      disabled={disabled}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        const result = onToggle(comment, !collapsed);
        if (result?.catch) result.catch(() => {});
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  );
}

export function CommentFoldStatus({ comment }) {
  if (typeof comment.collapsed !== "boolean") return null;
  return <span className={`comment-fold-status ${comment.collapsed ? "is-collapsed" : ""}`}>{comment.collapsed ? "已折叠" : "已展开"}</span>;
}

export const CollapsedCommentPreview = memo(function CollapsedCommentPreview({ comment, text, mediaSources, linkedDisplay }) {
  const source = linkedDisplay?.title || text;
  const useMarkdown = !!source && !!comment.capabilities?.isMarkdown && !linkedDisplay;
  const html = useMemo(() => useMarkdown ? { __html: renderMarkdownToHtml(source) } : null, [source, useMarkdown]);
  return (
    <div className="comment-fold-preview">
      {mediaSources[0] ? <img className="comment-fold-thumbnail" src={mediaSources[0].src} alt={mediaSources[0].alt} loading="lazy" /> : null}
      {source && comment.capabilities?.isMarkdown && !linkedDisplay ? (
        <div
          className="comment-fold-summary"
          onClick={(event) => {
            if (!event.target.closest?.("a")) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          dangerouslySetInnerHTML={html}
        />
      ) : (
        <p className="comment-fold-summary">{source || (comment.capabilities?.hasAudio ? "音频评论" : comment.drawingPreviewPending ? "手写内容正在转换" : comment.drawingPreviewError || (comment.capabilities?.hasImage ? "图片／手写评论" : "无文本内容"))}</p>
      )}
    </div>
  );
});

export function CommentFoldToolbar({ loading, canFold, capability, onSetCollapsed }) {
  if (!capability) return null;
  if (!capability.supported) {
    const reason = capability.error || "当前宿主未提供批注折叠接口";
    const message = capability.code ? `${reason}（${capability.code}）` : reason;
    return <p className="comment-fold-unavailable" role="status" title={message}>{message}</p>;
  }
  const invoke = (collapsed) => {
    const result = onSetCollapsed(collapsed);
    if (result?.catch) result.catch(() => {});
  };
  return (
    <div className="comment-fold-toolbar" role="group" aria-label="批量折叠操作">
      <button type="button" disabled={loading || !canFold} onClick={() => invoke(true)} title="折叠所选评论（最多 200 条，保留选区）" aria-label="折叠所选"><FoldIcon collapsed /><span className="control-label">折叠所选</span></button>
      <button type="button" disabled={loading || !canFold} onClick={() => invoke(false)} title="展开所选评论（最多 200 条，保留选区）" aria-label="展开所选"><FoldIcon collapsed={false} /><span className="control-label">展开所选</span></button>
    </div>
  );
}
