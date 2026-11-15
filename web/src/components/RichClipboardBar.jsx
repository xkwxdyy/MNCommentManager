import ActionIcon from './ActionIcon';
import { RichActionIcon, formatStyleSummary } from './RichCommentPresentation';
export default function RichClipboardBar({ clipboard, busy, onPaste, onClear }) {
  if (!clipboard) return null;
  const summary = formatStyleSummary(clipboard.style);
  const rawText = String(clipboard.text || '').trim();
  const excerpt = rawText.length > 10 ? rawText.slice(0, 10) + '…' : rawText;
  return (
    <div className="rich-format-clipboard has-format" aria-label="已复制的格式">
      <div>
        <RichActionIcon name="copy" />
        <span
          className="rich-clipboard-text"
          title={`${clipboard.noteTitle || '当前卡片'}${rawText ? ` · ${rawText}` : ''}`}
        >
          已复制格式：{summary}
          {excerpt ? `（源：${excerpt}）` : ''}
        </span>
        {[clipboard.style.textColor, clipboard.style.backgroundColor].map((c, i) => (
          <span
            key={i}
            className="rich-clipboard-swatch"
            style={{ background: c || 'transparent' }}
            title={`${i ? '背景' : '文字'} ${c || '默认'}`}
          />
        ))}
      </div>
      <div>
        <button
          className="ghost"
          aria-label="批量粘贴已复制的格式"
          title="选择目标评论粘贴格式"
          disabled={busy}
          onClick={onPaste}
        >
          <RichActionIcon name="paste" />
          粘贴格式…
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
