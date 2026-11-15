import { useEffect, useRef, useState } from 'react';
import './FormatBrushDialog.css';
export function FormatBrushIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 3 7 7-9 9-7-7zM10 7l7 7M5 12l-2 2 7 7 2-2M3 17l-1 5 5-1" /></svg>;
}
export function richTextStyle(style) {
  return style ? { fontFamily: style.fontName, fontSize: style.fontSize, color: style.textColor || undefined, backgroundColor: style.backgroundColor || 'transparent' } : undefined;
}
function Sample({ comment, style = comment.style }) { return <span className="brush-rich-text" style={richTextStyle(style)}>{comment.text}</span>; }
export default function FormatBrushDialog({ preview, busy, onApply, onClose }) {
  const [selected, setSelected] = useState(new Set()), [error, setError] = useState('');
  const ref = useRef(null), closeRef = useRef(onClose); closeRef.current = onClose;
  const { source, targets } = preview, eligible = targets.filter(c => c.eligible), all = eligible.length > 0 && selected.size === eligible.length;
  useEffect(() => {
    const previous = preview.returnFocus || document.activeElement;
    ref.current.querySelector('button').focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const key = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) closeRef.current(); }
      if (event.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (!ref.current.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true);
  }, [busy]);
  function toggle(index) { setSelected(prev => { const next = new Set(prev); next.has(index) ? next.delete(index) : next.add(index); return next; }); }
  async function apply() {
    if (busy || !selected.size) return;
    setError('');
    try { await onApply([...selected]); }
    catch (e) { setError(e?.message || String(e)); }
  }
  return <div className="brush-backdrop" onMouseDown={e => { if (!busy && e.target === e.currentTarget) onClose(); }}>
    <section className="brush-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="brush-title" aria-busy={busy}>
      <header className="brush-dialog-head"><h2 id="brush-title"><FormatBrushIcon />格式刷</h2><button type="button" className="ghost brush-tool" aria-label="关闭格式刷" title="关闭（Esc）" disabled={busy} onClick={onClose}>×</button></header>
      <div className="brush-source"><span className="brush-eyebrow">源评论 · #{source.index}</span><div className="brush-source-line"><Sample comment={source} /><div className="brush-source-properties"><span>{source.style.fontName} · {source.style.fontSize}</span>{[source.style.textColor, source.style.backgroundColor].map((color, index) => <span key={index} className="brush-swatch" style={{ background: color || 'transparent' }} title={`${index ? '背景' : '文字'} ${color || '默认'}`} />)}</div></div></div>
      <div className="brush-target-heading"><h3>选择目标评论</h3><button type="button" className="ghost" disabled={busy || !eligible.length} onClick={() => setSelected(all ? new Set() : new Set(eligible.map(c => c.index)))}>{all ? '取消全选' : '全选'}</button></div>
      <div className="brush-target-list">{!targets.length && <p className="brush-empty">当前卡片没有其他 HTML 评论</p>}{targets.map(c => <label key={c.index} className={`brush-target ${selected.has(c.index) ? 'is-picked' : ''} ${!c.eligible ? 'is-unavailable' : ''}`}>
        <input type="checkbox" aria-label={`选择目标评论 #${c.index}`} disabled={busy || !c.eligible} checked={selected.has(c.index)} onChange={() => toggle(c.index)} />
        <div className="brush-target-content"><div className="brush-target-meta"><span>#{c.index}</span>{!c.eligible && <span>{c.reason}</span>}</div><div className="brush-target-preview"><Sample comment={c} />{selected.has(c.index) && <><span aria-hidden="true" className="brush-arrow">→</span><Sample comment={c} style={source.style} /></>}</div></div>
      </label>)}</div>
      {error && <p role="alert" className="brush-error">{error}</p>}
      <footer className="brush-dialog-footer"><span aria-live="polite">{selected.size ? `已选 ${selected.size} 条` : '勾选后预览样式'}</span><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button type="button" className="primary" disabled={busy || !selected.size} onClick={apply}>{busy ? '正在应用…' : selected.size ? `应用到 ${selected.size} 条评论` : '应用格式'}</button></div></footer>
    </section>
  </div>;
}
