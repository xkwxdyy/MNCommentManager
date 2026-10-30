import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { alignedDragCenter, clampDrag } from '../lib/commentDragGeometry.mjs';
import './CommentDragOverview.css';

export function CommentDragIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" /></svg>;
}

export default function CommentDragOverview({ frame, describe }) {
  const viewport = useRef(null), strip = useRef(null), landing = useRef(null), rail = useRef(null), thumb = useRef(null);
  useLayoutEffect(() => {
    if (!frame || !landing.current) return;
    const r = viewport.current.getBoundingClientRect(), t = rail.current.getBoundingClientRect();
    const height = landing.current.offsetHeight;
    const y = frame.keyboard ? frame.top + frame.target / Math.max(1, frame.snapshot.comments.length - 1) * (frame.bottom - frame.top)
      : clampDrag(frame.currentY ?? frame.y, frame.top, frame.bottom);
    const center = alignedDragCenter(y, r.top, r.bottom, height);
    strip.current.style.transform = `translateY(${center - r.top - landing.current.offsetTop - height / 2}px)`;
    thumb.current.style.top = `${center - t.top - rail.current.clientTop}px`;
  }, [frame]);
  if (!frame) return null;
  const comments = frame.snapshot.comments, source = comments[frame.from];
  const rest = comments.filter((_, i) => i !== frame.from);
  // Render only the nearby window; the track still addresses every comment.
  const radius = Math.max(8, Math.ceil(frame.rect.height / 30));
  const start = Math.max(0, frame.target - radius), end = Math.min(rest.length, frame.target + radius);
  const rows = [];
  for (let i = start; i <= end; i++) {
    if (i === frame.target) {
      const info = describe(source);
      rows.push(<div className="cm-drag-landing" ref={landing} key="landing" data-target-position={frame.target}>
        <div><span>正在移动 · 原第 {frame.from + 1} 条</span><span>{frame.target === frame.from ? '原位置' : frame.keyboard ? '回车确认' : '松手放在此处'}</span></div>
        <strong>{info.text || info.label}</strong>
      </div>);
    }
    if (i === end) break;
    const c = rest[i], info = describe(c), neighbor = i === frame.target - 1 || i === frame.target;
    rows.push(<div className={`cm-drag-summary${neighbor ? ' neighbor' : ''}`} key={c.index}>
      <span className="cm-drag-ordinal">{i < frame.from ? i + 1 : i + 2}</span>
      {info.image ? <img src={info.image} alt={`${info.label}缩略图`} draggable={false} /> : <span className="cm-drag-type">{info.label}</span>}
      <span className="cm-drag-copy">{info.text || info.label}</span>
      {neighbor ? <small>{i < frame.target ? '上方' : '下方'}</small> : null}
    </div>);
  }
  return createPortal(<section className={`cm-drag-overview${frame.cancelled ? ' cancelled' : ''}`} aria-label="评论移动总览"
    style={{ top: frame.rect.top, left: frame.rect.left, width: frame.rect.width, height: frame.rect.height }}>
    <header><div><strong>{frame.cancelled ? '松手取消移动' : '拖动总览'}</strong><small>全部 {comments.length} 条评论 · 包含筛选与折叠隐藏内容</small></div><span aria-live="polite">{frame.target + 1} / {comments.length}</span></header>
    <div className="cm-drag-viewport" ref={viewport}><div className="cm-drag-strip" ref={strip}>{rows}</div></div>
    <div className="cm-drag-rail" ref={rail}><small className="first">首条</small><small className="last">末条</small><div className="cm-drag-thumb" ref={thumb}><CommentDragIcon /></div></div>
    <footer><span>{frame.keyboard ? '方向键定位 · 回车确认' : '松手完成移动'}</span><span>{frame.keyboard ? 'Esc 取消' : '横向移开取消 · Esc'}</span></footer>
  </section>, document.body);
}
