import { useRef, useState } from 'react';
import RichCommentDialog from './RichCommentDialog';
import { RichSample } from './RichCommentPresentation';
import { renderMarkdownToHtml } from '../lib/markdownRenderer';
import './FormatBrushDialog.css';
export { FormatBrushIcon, richTextStyle } from './RichCommentPresentation';
export default function FormatBrushDialog({ preview, busy, onApply, onClose }) {
  const isPaste = preview.mode === 'paste';
  const [selected, setSelected] = useState(
      new Set(
        (preview.selectedIndices || []).filter((index) =>
          preview.targets.some((t) => t.index === index && t.eligible),
        ),
      ),
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const applying = useRef(false),
    available = preview.targets.filter((t) => t.eligible),
    all = available.length > 0 && selected.size === available.length,
    working = busy || pending;
  async function apply() {
    if (applying.current || working || !selected.size) return;
    applying.current = true;
    setPending(true);
    setError('');
    try {
      await onApply([...selected]);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      applying.current = false;
      setPending(false);
    }
  }
  return (
    <RichCommentDialog
      title={isPaste ? '粘贴格式' : '格式刷'}
      className="brush-dialog"
      mode={isPaste ? 'paste' : 'brush'}
      busy={working}
      onClose={onClose}
      onConfirmShortcut={apply}
      trigger={preview.returnFocus}
      wide
      footer={
        <>
          <span aria-live="polite">已选 {selected.size} 条</span>
          <div>
            <button className="secondary" disabled={working} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={working || !selected.size} onClick={apply}>
              {working
                ? '正在应用…'
                : selected.size
                  ? `应用到 ${selected.size} 条评论`
                  : '应用格式'}
            </button>
          </div>
        </>
      }
    >
      <div className="brush-source">
        <div>
          <strong>{isPaste ? '已复制的格式' : '使用这条评论的格式'}</strong>
          <span>{preview.source.noteTitle || `评论 #${preview.source.index}`}</span>
        </div>
        <RichSample text={preview.source.text} style={preview.source.style} />
      </div>
      <div className="brush-target-heading">
        <h3>{isPaste ? '选择目标评论' : '选择要应用格式的评论'}</h3>
        <button
          className="ghost"
          disabled={working || !available.length}
          onClick={() => setSelected(all ? new Set() : new Set(available.map((t) => t.index)))}
        >
          {all ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="brush-target-list">
        {preview.targets.length === 0 ? (
          <p className="brush-empty">
            {isPaste ? '当前卡片没有可粘贴格式的评论，可先新建评论。' : '当前卡片没有其他可应用格式的评论。'}
          </p>
        ) : (
          preview.targets.map((t) => (
            <article
              key={t.index}
              className={`brush-target ${selected.has(t.index) ? 'is-picked' : ''} ${!t.eligible ? 'is-unavailable' : ''}`}
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`选择目标评论 #${t.index}`}
                  disabled={working || !t.eligible}
                  checked={selected.has(t.index)}
                  onChange={() =>
                    setSelected((old) => {
                      const next = new Set(old);
                      next.has(t.index) ? next.delete(t.index) : next.add(t.index);
                      return next;
                    })
                  }
                />
                <span>
                  #{t.index} ·{' '}
                  {
                    { markdown: 'Markdown', text: '文本', html: '富文本', media: '媒体' }[
                      t.kind || 'html'
                    ]
                  }
                  {t.eligible && t.kind && t.kind !== 'html' ? ' → 富文本' : ''}
                </span>
                {!t.eligible && <small>{t.reason}</small>}
              </label>
              <div className="brush-target-preview">
                <div>
                  <span className="brush-preview-label">当前</span>
                  {t.kind === 'markdown' && t.eligible ? (
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(t.text) }}
                    />
                  ) : (
                    <RichSample
                      text={t.eligible ? t.text : String(t.text || '').slice(0, 400)}
                      style={t.style}
                    />
                  )}
                </div>
                {t.eligible && selected.has(t.index) && (
                  <div>
                    <span className="brush-preview-label">应用后</span>
                    <RichSample text={t.afterText ?? t.text} style={preview.source.style} />
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {error && (
        <p className="brush-error" role="alert">
          {error}
        </p>
      )}
    </RichCommentDialog>
  );
}
