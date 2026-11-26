import ActionIcon from './ActionIcon';
import { RichActionIcon, formatStyleSummary, richTextStyle } from './RichCommentPresentation';
export default function RichClipboardBar({ clipboard, busy, selectedCount = 0, onPaste, onClear }) {
  if (!clipboard) return null;
  const summary = formatStyleSummary(clipboard.style);
  const rawText = String(clipboard.text || '').trim();
  const excerpt = rawText.length > 12 ? rawText.slice(0, 12) + '…' : rawText;
  const origin = [
    clipboard.noteTitle ? `来自「${clipboard.noteTitle}」` : '',
    Number.isSafeInteger(clipboard.index) ? `评论 #${clipboard.index}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const pasteLabel = selectedCount > 0 ? `粘贴到所选 ${selectedCount} 条…` : '粘贴到…';
  return (
    <div className="rich-format-clipboard has-format" role="region" aria-label="已复制的格式">
      <div title={`${origin}${rawText ? `：${rawText}` : ''}`}>
        <RichActionIcon name="copy" />
        <span className="rich-clipboard-label">已复制格式</span>
        <span
          className="rich-clipboard-chip"
          style={{ ...richTextStyle(clipboard.style), fontSize: undefined }}
        >
          {excerpt || 'Aa'}
        </span>
        <span className="rich-clipboard-text">{summary}</span>
      </div>
      <div>
        <button
          className="ghost"
          aria-label="批量粘贴已复制的格式"
          title={selectedCount > 0 ? '预览并粘贴到所选评论' : '选择要粘贴格式的评论'}
          disabled={busy}
          onClick={onPaste}
        >
          <RichActionIcon name="paste" />
          <span className="rich-clipboard-paste-label">{pasteLabel}</span>
        </button>
        <button
          className="rich-comment-icon"
          aria-label="清除已复制格式"
          title="清除已复制格式"
          disabled={busy}
          onClick={onClear}
        >
          <ActionIcon name="close" />
        </button>
      </div>
    </div>
  );
}
