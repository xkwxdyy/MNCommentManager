import { useRef, useState } from 'react';
import RichCommentDialog from './RichCommentDialog';
import { RichSample, formatStyleSummary, sameRichStyle } from './RichCommentPresentation';
import { renderMarkdownToHtml } from '../lib/markdownRenderer';
import './FormatBrushDialog.css';
export { FormatBrushIcon, richTextStyle } from './RichCommentPresentation';
const KIND_LABELS = { markdown: 'Markdown', text: '普通文本', html: '富文本', media: '媒体' };
function CurrentPreview({ target }) {
  if (target.kind === 'markdown' && target.eligible)
    return (
      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(target.text) }}
      />
    );
  return (
    <RichSample
      text={target.eligible ? target.text : String(target.text || '').slice(0, 400)}
      style={target.style}
    />
  );
}
export default function FormatBrushDialog({ preview, busy, onApply, onClose }) {
  const isPaste = preview.mode === 'paste';
  const source = preview.source;
  const unchanged = (t) => t.eligible && t.kind === 'html' && sameRichStyle(t.style, source.style);
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
    // "Select all" skips comments that already use this format.
    actionable = preview.targets.filter((t) => t.eligible && !unchanged(t)),
    all = actionable.length > 0 && actionable.every((t) => selected.has(t.index)),
    working = busy || pending;
  const sameCard = !isPaste || (source.noteId && source.noteId === preview.noteId);
  const sourceLabel = isPaste
    ? [
        source.noteTitle && !sameCard ? `来自「${source.noteTitle}」` : '',
        sameCard && Number.isSafeInteger(source.index) ? `本卡评论 #${source.index}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : `评论 #${source.index}`;
  function toggle(index) {
    setSelected((old) => {
      const next = new Set(old);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }
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
          <span aria-live="polite">
            {selected.size ? `已选 ${selected.size} 条` : '勾选要套用格式的评论'}
          </span>
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
          <strong>{isPaste ? '已复制的格式' : '源格式'}</strong>
          {sourceLabel ? <span>{sourceLabel}</span> : null}
          <span className="brush-source-summary">{formatStyleSummary(source.style)}</span>
        </div>
        <RichSample text={source.text} style={source.style} />
      </div>
      <div className="brush-target-heading">
        <h3>{isPaste ? '粘贴到' : '套用到'}</h3>
        <button
          className="ghost"
          disabled={working || !actionable.length}
          onClick={() =>
            setSelected(all ? new Set() : new Set(actionable.map((t) => t.index)))
          }
        >
          {all ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="brush-target-list">
        {preview.targets.length === 0 ? (
          <p className="brush-empty">
            {isPaste
              ? '当前卡片没有可粘贴格式的评论，可以先新建一条评论。'
              : '当前卡片没有其他富文本评论可套用这个格式。'}
          </p>
        ) : (
          preview.targets.map((t) => {
            const picked = selected.has(t.index);
            const same = unchanged(t);
            return (
              <article
                key={t.index}
                className={`brush-target ${picked ? 'is-picked' : ''} ${!t.eligible ? 'is-unavailable' : ''} ${same ? 'is-same' : ''}`}
                onClick={(e) => {
                  // The checkbox label toggles natively; the preview area is a larger target.
                  if (!t.eligible || working || e.target.closest('label')) return;
                  toggle(t.index);
                }}
              >
                <label>
                  <input
                    type="checkbox"
                    aria-label={`选择目标评论 #${t.index}`}
                    disabled={working || !t.eligible}
                    checked={picked}
                    onChange={() => toggle(t.index)}
                  />
                  <span>
                    #{t.index} · {KIND_LABELS[t.kind || 'html']}
                    {t.eligible && t.kind && t.kind !== 'html' ? ' → 富文本' : ''}
                  </span>
                  {same ? <span className="brush-target-tag">格式相同</span> : null}
                  {!t.eligible && <small>{t.reason}</small>}
                </label>
                <div className={`brush-target-preview ${t.eligible && picked ? 'is-compare' : ''}`}>
                  {t.eligible && picked ? (
                    <>
                      <div>
                        <span className="brush-preview-label">当前</span>
                        <CurrentPreview target={t} />
                      </div>
                      <div>
                        <span className="brush-preview-label">应用后</span>
                        <RichSample text={t.afterText ?? t.text} style={source.style} />
                      </div>
                    </>
                  ) : (
                    <div>
                      <CurrentPreview target={t} />
                    </div>
                  )}
                </div>
              </article>
            );
          })
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
