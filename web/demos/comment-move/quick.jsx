import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import './quick.css';
import graph from './assets/video-comment.png';
import { initialComments, moveToIndex } from './model.mjs';
import { createMoveGesture } from './moveGesture.mjs';

// Source icon assets: the existing comment-module demo.
const paths = { up:'M5 12l5-5 5 5', down:'M5 8l5 5 5-5', close:'M5 5l10 10M15 5L5 15', check:'M4 10l4 4 8-8', undo:'M7 4L3 8l4 4M3 8h8a5 5 0 010 10', move:'M3 10h14M6 6l-4 4 4 4M14 6l4 4-4 4', reset:'M4 8a6 6 0 111 7M4 3v5h5' };
function Icon({name}) { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>; }
function Action({name,label,...props}) { return <button type="button" className="q-icon" aria-label={label} title={label} {...props}><Icon name={name}/></button>; }
const shortCard = [
  {id:'distribution',title:'正态总体',body:'设样本独立同分布于正态总体。',formula:'X₁, …, Xₙ ∼ N(μ, σ²)',type:'文本'},
  {id:'graph',title:'分布示意图',body:'标准正态分布与中间区域。',image:graph,type:'图片'},
  {id:'known',title:'总体方差已知',body:'使用标准正态统计量构造区间。',formula:'Z = (X̄ − μ) / (σ / √n)',type:'Markdown'},
  {id:'unknown',title:'总体方差未知',body:'使用样本标准差与 t 统计量。',formula:'T = (X̄ − μ) / (S / √n)',type:'Markdown'},
  {id:'interval',title:'置信区间的形式',body:'点估计加减相应的误差限。',formula:'X̄ ± z₁₋α/₂ · σ / √n',type:'Markdown'},
  {id:'meaning',title:'置信水平的解释',body:'重复抽样得到的区间，有相应比例覆盖固定的总体参数。',type:'文本'},
  {id:'pitfall',title:'常见误解',body:'置信水平不表示固定参数在某个已给定区间中的概率。',type:'文本'},
];
function App() {
  const [comments, setComments] = useState(shortCard);
  const [long, setLong] = useState(false), [width, setWidth] = useState(390);
  const [active, setActive] = useState(true), [sourceId, setSource] = useState('graph');
  const [picking, setPicking] = useState(false), [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null), [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]), [lastMoved, setLastMoved] = useState(null), [gesture, setGesture] = useState(null);
  const root = useRef(null), anchor = useRef(null), input = useRef(null), pointerSession = useRef(null), handlers = useRef({}), controller = useRef(null);
  if (!controller.current) controller.current = createMoveGesture({
    onPreview: frame => {
      setGesture(frame ? { ...frame, localY: frame.thumbY - (pointerSession.current?.top || 0) } : null);
      if (frame) { setPreview(null); setPicking(false); }
    },
    onCommit: frame => handlers.current.commit(frame),
    onTap: frame => handlers.current.tap(frame),
  });
  const index = comments.findIndex(comment => comment.id === sourceId), source = comments[index];
  const shown = gesture && !gesture.cancelled ? moveToIndex(gesture.comments, sourceId, gesture.targetIndex) : comments;
  const shownIndex = shown.findIndex(comment => comment.id === sourceId);
  const above = shown[shownIndex - 1], below = shown[shownIndex + 1];
  const previewTarget = preview === -1 ? above : preview === 1 ? below : null;
  const rows = comments.filter(comment => `${comment.title} ${comment.body}`.includes(query.trim()));

  useEffect(() => { if (picking) input.current?.focus(); }, [picking]);
  useEffect(() => {
    if (!active || !sourceId) return;
    const keepVisible = () => root.current?.querySelector(`[data-card-id="${sourceId}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    const frame = requestAnimationFrame(keepVisible);
    window.addEventListener('resize', keepVisible);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', keepVisible); };
  }, [sourceId, comments, active, width, gesture?.targetIndex, gesture?.cancelled]);
  useEffect(() => {
    const cancel = () => cancelGesture();
    const key = event => { if (event.key === 'Escape') cancelGesture(); };
    const hidden = () => { if (document.hidden) cancelGesture(); };
    window.addEventListener('blur', cancel); window.addEventListener('resize', cancel); window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden); controller.current.dispose();
    };
  }, []);

  function cancelGesture() {
    const prior = pointerSession.current;
    pointerSession.current = null; controller.current.cancel(); setPreview(null);
    if (prior?.element.hasPointerCapture(prior.pointerId)) prior.element.releasePointerCapture(prior.pointerId);
    if (prior) setNotice('已取消移动，顺序保持不变。');
  }
  function choose(id) {
    cancelGesture(); setSource(id); setActive(true); setPicking(false); setQuery(''); setPreview(null); setNotice(''); setLastMoved(null);
  }
  function commit(targetIndex, base = comments, id = sourceId) {
    if (base !== comments || id !== sourceId) return;
    const next = moveToIndex(base, id, targetIndex);
    if (next === base) return;
    const at = next.findIndex(comment => comment.id === id), before = next[at - 1], after = next[at + 1];
    setHistory(previous => [...previous, { comments: base, sourceId: id }]);
    setComments(next); setPreview(null); setLastMoved(id);
    setNotice(before ? `已放在「${before.title}」之后` : `已放在「${after.title}」之前`);
  }
  function move(direction) { if (index >= 0) commit(index + direction); }
  function togglePicker() { setPicking(value => !value); setQuery(''); setPreview(null); }
  handlers.current = {
    commit: frame => commit(frame.targetIndex, frame.comments, frame.sourceId),
    tap: frame => { if (frame.comments !== comments || frame.sourceId !== sourceId) return; if (frame.kind === 'hold') move(frame.direction); else togglePicker(); },
  };
  function begin(event, kind, direction) {
    if (!event.isPrimary || event.button !== 0 || !source || pointerSession.current) return;
    const bounds = anchor.current.getBoundingClientRect();
    pointerSession.current = { element: event.currentTarget, pointerId: event.pointerId, top: bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.current.begin({ kind, direction, pointerId: event.pointerId, sourceId, comments, startIndex: index, x: event.clientX, y: event.clientY, top: bounds.top + 22, bottom: bounds.bottom - 22 });
    if (kind === 'hold') setPreview(direction);
  }
  function update(event) { controller.current.update({ pointerId: event.pointerId, x: event.clientX, y: event.clientY }); }
  function end(event, cancelled = false) {
    const prior = pointerSession.current;
    if (!prior || prior.pointerId !== event.pointerId) return;
    pointerSession.current = null;
    const outcome = controller.current.end({ pointerId: event.pointerId, cancelled }); setPreview(null);
    if (prior.element.hasPointerCapture(prior.pointerId)) prior.element.releasePointerCapture(prior.pointerId);
    if (outcome === 'cancelled') setNotice('已取消移动，顺序保持不变。');
  }
  function undo() {
    cancelGesture(); const prior = history.at(-1);
    if (!prior) return;
    setComments(prior.comments); setSource(prior.sourceId); setActive(true);
    setHistory(history.slice(0, -1)); setPreview(null); setLastMoved(prior.sourceId); setNotice('已撤销移动');
  }
  function close() { cancelGesture(); setActive(false); setPicking(false); setQuery(''); setPreview(null); }
  function reset(useLong = long) {
    cancelGesture(); setComments(useLong ? initialComments : shortCard); setLong(useLong); setSource(useLong ? initialComments[2].id : 'graph');
    setActive(true); setPicking(false); setQuery(''); setPreview(null); setNotice(''); setHistory([]); setLastMoved(null);
  }
  function arrow(direction, neighbor) {
    const label = neighbor ? `${direction < 0 ? '上移' : '下移'}，放在「${neighbor.title}」${direction < 0 ? '之前' : '之后'}` : direction < 0 ? '已到卡片开头' : '已到卡片末尾';
    return <Action name={direction < 0 ? 'up' : 'down'} label={label} disabled={!source || !neighbor}
      title={`${label}；长按连续预览，松手移动`} aria-describedby={gesture ? 'q-scrub-preview' : preview === direction && neighbor ? 'q-target-peek' : undefined}
      onPointerEnter={() => { if (!pointerSession.current) setPreview(direction); }} onPointerLeave={() => { if (!pointerSession.current) setPreview(null); }}
      onPointerDown={event => begin(event, 'hold', direction)} onPointerMove={update} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}
      onContextMenu={event => event.preventDefault()} onFocus={() => setPreview(direction)} onBlur={() => setPreview(null)}
      onClick={event => { if (event.detail === 0) move(direction); }} />;
  }
  function keyboardJump(event) {
    const changes = { ArrowUp: index - 1, ArrowDown: index + 1, PageUp: index - 5, PageDown: index + 5, Home: 0, End: comments.length - 1 };
    if (!(event.key in changes)) return;
    event.preventDefault(); cancelGesture(); commit(changes[event.key]);
  }
  return <main className="quick-prototype" ref={root} style={{ width: `min(100%, ${width}px)` }}>
    <div className="q-review"><span>卡片侧边移动 <small>原型</small></span><div>
      <select aria-label="预览尺寸" value={width} onChange={event => { cancelGesture(); setWidth(Number(event.target.value)); }}>
        <option value={320}>小屏 · 320</option><option value={375}>iPhone · 375</option><option value={390}>iPhone · 390</option><option value={414}>iPhone · 414</option><option value={768}>iPad · 768</option>
      </select><Action name="reset" label="重置演示" onClick={() => reset()} />
    </div></div>
    <section className="q-stage" aria-label="脑图卡片旁快速移动演示">
      <div className="q-scene-header"><span>脑图中的选中卡片</span><button className="q-text" onClick={() => reset(!long)}>{long ? '短卡片' : '长卡片'}</button></div>
      <div className="q-card-area"><div className="q-card-anchor" ref={anchor} style={{ '--q-thumb-y': `${gesture?.localY || 0}px` }}>
        <article className="q-note" aria-label="当前卡片的评论内容">
          <header><span>{long ? '线性映射与秩' : '正态总体的区间估计'}</span>
            <Action name={active ? 'close' : 'move'} label={active ? '结束移动' : '快速移动评论'} onClick={() => active ? close() : setActive(true)} />
          </header>
          <div className="q-note-scroll">
          {shown.map(comment => {
            const selected = active && comment.id === sourceId;
            const neighbor = active && comment.id === above?.id ? -1 : active && comment.id === below?.id ? 1 : null;
            return <div key={comment.id} data-card-id={comment.id} role="button" tabIndex={0}
              aria-label={`选取：${comment.title}`} aria-pressed={selected}
              onClick={() => choose(comment.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(comment.id); } }}
              className={`q-comment ${selected ? 'q-selected' : ''} ${selected && gesture && !gesture.cancelled ? 'q-ghost' : ''} ${neighbor ? 'q-neighbor' : ''} ${neighbor && neighbor === preview ? 'q-target-preview' : ''}`}>
              {neighbor === -1 && <div className="q-target-label"><Icon name="up" /><span>上移后，放在此条之前</span></div>}
              <div className="q-comment-meta"><span>{comment.type}</span>{selected && <span className="q-selected-badge">{gesture ? gesture.cancelled ? '松手取消' : '预览 · 松手移动' : comment.id === lastMoved ? '已移动' : '正在移动'}</span>}</div>
              <strong>{comment.title}</strong>
              {comment.image ? <img src={comment.image} alt="正态分布图片评论" /> : <p>{comment.body}</p>}
              {comment.formula && <div className="q-formula">{comment.formula}</div>}
              {neighbor === 1 && <div className="q-target-label q-target-bottom"><Icon name="down" /><span>下移后，放在此条之后</span></div>}
            </div>;
          })}
          </div>
        </article>
        {active && <div className={`q-rail ${gesture?.kind === 'drag' ? 'q-scrubbing' : ''}`} role="toolbar" aria-label="评论移动控件" aria-orientation="vertical">
          {arrow(-1, comments[index - 1])}
          <button className={`q-rail-source ${picking ? 'q-picker-active' : ''}`} aria-label="选择评论，拖动可跨多条移动" title="点按选择评论；上下拖动快速定位" aria-expanded={picking} aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home End"
            onPointerDown={event => begin(event, 'drag')} onPointerMove={update} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}
            onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()} onKeyDown={keyboardJump}
            onClick={event => { if (event.detail === 0) togglePicker(); }}>
            {source?.image ? <img src={source.image} draggable={false} alt="当前选中的图片评论" /> : <Icon name="move" />}
          </button>
          {arrow(1, comments[index + 1])}
        </div>}
        {active && gesture && <div id="q-scrub-preview" role="tooltip" className={`q-scrub-preview ${gesture.cancelled ? 'q-cancelled' : ''}`}>
          <header>{gesture.cancelled ? '松手取消' : '松手移动'}<small>{gesture.cancelled ? '顺序保持不变' : '向左移开可取消'}</small></header>
          {[{ comment: above, label: '前一条', edge: '卡片开头' }, { comment: below, label: '后一条', edge: '卡片末尾' }].map((item, i) => <React.Fragment key={item.label}>
            {i === 1 && <div className="q-landing-line"><span /><Icon name="move" /><span /></div>}
            <div className="q-scrub-context">{item.comment?.image && <img src={item.comment.image} alt="目标相邻评论缩略图" />}<div><span>{item.label}</span><strong>{item.comment?.title || item.edge}</strong>{item.comment && <small>{item.comment.body}</small>}</div></div>
          </React.Fragment>)}
        </div>}
        {active && previewTarget && !picking && !gesture && <div id="q-target-peek" role="tooltip" className={`q-target-peek ${preview === 1 ? 'q-peek-below' : ''}`}>
          {previewTarget.image && <img src={previewTarget.image} alt="目标评论缩略图" />}
          <div><span>{preview === -1 ? '放在此条之前' : '放在此条之后'}</span><strong>{previewTarget.title}</strong><small>{previewTarget.body}</small></div>
        </div>}
        {picking && active && <section className="q-picker" role="dialog" aria-modal="false" aria-label="选择待移动评论">
          <header><input ref={input} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setPicking(false); }} aria-label="搜索评论内容" placeholder="搜索评论内容" /><Action name="close" label="关闭评论选择" onClick={() => setPicking(false)} /></header>
          <div className="q-picker-list">{rows.map(comment => <button className="q-pick-row" key={comment.id} aria-label={`切换到：${comment.title}`} onClick={() => choose(comment.id)}>
            {comment.image && <img src={comment.image} alt="图片评论缩略图" />}<span><strong>{comment.title}</strong><small>{comment.body}</small></span>{comment.id === sourceId && <Icon name="check" />}
          </button>)}{!rows.length && <p className="q-empty">没有匹配内容</p>}</div>
        </section>}
      </div></div>
      <div className={`q-feedback ${notice ? 'q-has-notice' : ''}`}>
        <span role="status">{gesture ? gesture.cancelled ? '松手取消移动' : '正在预览，松手后一次移动。' : notice || (active ? '点按箭头微调，拖动中间控件快速定位。' : '点按卡片中的评论，开始移动。')}</span>
        {history.length > 0 && <Action name="undo" label="撤销移动" onClick={undo} />}
      </div>
    </section>
    <p className="q-prototype-note">独立于评论主面板，仅操作演示数据。</p>
  </main>;
}
// Reuse the mount during hot updates; remount the demo to cancel any in-flight gesture.
const appRoot = import.meta.hot?.data.appRoot || createRoot(document.getElementById('root'));
const revision = (import.meta.hot?.data.revision || 0) + 1;
appRoot.render(<App key={revision}/>);
if (import.meta.hot) import.meta.hot.dispose(data => { data.appRoot = appRoot; data.revision = revision; });
