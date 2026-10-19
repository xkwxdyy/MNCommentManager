import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import './overview.css';
import graph from './assets/video-comment.png';
import { initialComments, moveToIndex } from './model.mjs';
import { createMoveGesture } from './moveGesture.mjs';

// Reuse the icons from the existing side-control prototype.
const paths = { up: 'M5 12l5-5 5 5', down: 'M5 8l5 5 5-5', undo: 'M7 4L3 8l4 4M3 8h8a5 5 0 010 10', move: 'M7 3v14M13 3v14M4 6l3-3 3 3M10 14l3 3 3-3', reset: 'M4 8a6 6 0 111 7M4 3v5h5', check: 'M4 10l4 4 8-8', text: 'M4 5h12M4 10h12M4 15h8' };
function Icon({ name }) { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
function Action({ name, label, ...props }) { return <button type="button" className="ov-action" aria-label={label} title={label} {...props}><Icon name={name} /></button>; }
function Thumb({ comment }) { return comment.image ? <img src={comment.image} alt="图片评论缩略图" draggable={false} /> : <Icon name="text" />; }

const examples = [
  ['抽样分布', '统计量的分布由总体分布和抽样方式共同决定。'],
  ['样本均值', '样本均值用于估计总体均值；重复抽样会得到不同的估计结果。'],
  ['分布示意图', '标准正态分布中，阴影区域表示相应的概率。'],
  ['总体方差已知', '使用标准正态统计量构造均值的置信区间。'],
  ['总体方差未知', '以样本标准差代替总体标准差，使用 t 分布确定分位数。'],
  ['置信区间的形式', '点估计加减误差限。区间宽度取决于变异程度、样本量和置信水平。'],
  ['置信水平的解释', '重复抽样得到的区间，有相应比例覆盖固定的总体参数。'],
  ['常见误解', '置信水平不表示固定参数在某个已给定区间内的概率。'],
  ['样本量的影响', '在其他条件相同时，增加样本量通常可以缩小误差限。'],
  ['分位数的选择', '双侧区间需要在分布两端分别保留相应的尾部概率。'],
  ['单侧置信限', '根据研究问题，构造参数的上置信限或下置信限。'],
  ['图片批注：区间位置', '比较不同抽样结果对应的区间及其覆盖情况。'],
  ['使用条件', '构造区间前，需要核对独立性、总体分布及样本量等条件。'],
  ['结论与复习', '区分总体参数、统计量、抽样分布与区间估计。'],
].map(([title, body], i) => ({ id: `mixed-${i}`, title, body, type: i === 2 || i === 11 ? '图片' : '文本', ...(i === 2 || i === 11 ? { image: graph } : {}) }));
const samples = {
  five: { name: '混合评论 · 5 条', title: '区间估计', comments: examples.slice(0, 5) },
  mixed: { name: '混合评论 · 14 条', title: '区间估计与抽样分布', comments: examples },
  long: { name: '长列表 · 36 条', title: '线性映射与秩', comments: initialComments.map((c, i) => i % 9 === 2 ? { ...c, image: graph, type: '图片', body: `${c.body}（演示图片批注）` } : c) },
};

function App() {
  const [sample, setSample] = useState('mixed');
  const [comments, setComments] = useState(samples.mixed.comments);
  const [sourceId, setSourceId] = useState(examples[5].id);
  const [gesture, setGesture] = useState(null), [history, setHistory] = useState([]), [notice, setNotice] = useState('');
  const track = useRef(null), scroll = useRef(null), gap = useRef(null), note = useRef(null);
  const session = useRef(null), handlers = useRef({}), controller = useRef(null);
  if (!controller.current) controller.current = createMoveGesture({
    onPreview: setGesture,
    onCommit: frame => handlers.current.commit(frame.targetIndex, frame.comments, frame.sourceId),
    onTap: frame => { if (frame.kind === 'hold') handlers.current.commit(frame.startIndex + frame.direction, frame.comments, frame.sourceId); },
  });
  const sourceIndex = comments.findIndex(c => c.id === sourceId), source = comments[sourceIndex];
  const target = gesture?.targetIndex ?? sourceIndex;
  const rest = comments.filter(c => c.id !== sourceId);
  const thumbRatio = gesture?.kind === 'drag' && session.current ? (gesture.thumbY - session.current.top) / (session.current.bottom - session.current.top) : target / (comments.length - 1);

  function cancel() {
    const prior = session.current;
    session.current = null;
    controller.current.cancel();
    if (prior?.element.hasPointerCapture(prior.pointerId)) prior.element.releasePointerCapture(prior.pointerId);
  }
  function commit(index, base = comments, id = sourceId) {
    if (base !== comments || id !== sourceId) return;
    const next = moveToIndex(base, id, index);
    if (next === base) return;
    setHistory(previous => [...previous, { comments: base, sourceId: id }]);
    setComments(next);
    const at = next.findIndex(c => c.id === id);
    setNotice(`已移动至第 ${at + 1} 条，可撤回。`);
  }
  handlers.current.commit = commit;
  function begin(event, kind, direction) {
    if (!event.isPrimary || event.button !== 0 || session.current) return;
    const rect = track.current.getBoundingClientRect();
    session.current = { pointerId: event.pointerId, element: event.currentTarget, top: rect.top + 22, bottom: rect.bottom - 22 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setNotice('');
    controller.current.begin({ kind, direction, pointerId: event.pointerId, sourceId, comments, startIndex: sourceIndex, x: event.clientX, y: event.clientY, top: rect.top + 22, bottom: rect.bottom - 22 });
  }
  function update(event) { controller.current.update({ pointerId: event.pointerId, x: event.clientX, y: event.clientY }); }
  function end(event, cancelled = false) {
    const prior = session.current;
    if (!prior || prior.pointerId !== event.pointerId) return;
    // Keep the geometry until the preview is cleared by the gesture callback.
    const outcome = controller.current.end({ pointerId: event.pointerId, cancelled });
    session.current = null;
    if (prior.element.hasPointerCapture(prior.pointerId)) prior.element.releasePointerCapture(prior.pointerId);
    if (outcome === 'cancelled') setNotice('已取消，评论顺序保持不变。');
  }
  function choose(id) { cancel(); setSourceId(id); setNotice(''); }
  function reset(nextSample = sample) {
    cancel(); setSample(nextSample); setComments(samples[nextSample].comments);
    setSourceId(samples[nextSample].comments[nextSample === 'five' ? 0 : 5].id);
    setHistory([]); setNotice('');
  }
  function undo() {
    cancel(); const prior = history.at(-1);
    if (!prior) return;
    setComments(prior.comments); setSourceId(prior.sourceId); setHistory(history.slice(0, -1)); setNotice('已撤回，原顺序已恢复。');
  }
  function keyMove(event) {
    const targets = { ArrowUp: sourceIndex - 1, ArrowDown: sourceIndex + 1, PageUp: sourceIndex - 5, PageDown: sourceIndex + 5, Home: 0, End: comments.length - 1 };
    if (event.key in targets) { event.preventDefault(); cancel(); commit(targets[event.key]); }
  }
  useLayoutEffect(() => {
    const viewport = scroll.current, marker = gap.current;
    if (!viewport || !marker) return;
    const box = viewport.getBoundingClientRect(), landing = marker.getBoundingClientRect();
    const offset = gesture?.kind === 'drag' ? gesture.thumbY - box.top : viewport.clientHeight / 2;
    viewport.scrollTop += landing.top + landing.height / 2 - box.top - offset;
  }, [target, sourceId, sample, gesture?.thumbY]);
  useEffect(() => {
    note.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sourceId, comments]);
  useEffect(() => {
    const interrupt = () => cancel();
    const key = event => { if (event.key === 'Escape') { cancel(); setNotice('已取消，评论顺序保持不变。'); } };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', interrupt); window.addEventListener('resize', interrupt); window.addEventListener('keydown', key); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', interrupt); window.removeEventListener('resize', interrupt); window.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', hidden); controller.current.dispose(); };
  }, []);
  function arrow(direction) {
    return <Action name={direction < 0 ? 'up' : 'down'} label={direction < 0 ? '上移评论，长按连续移动' : '下移评论，长按连续移动'} disabled={direction < 0 ? sourceIndex === 0 : sourceIndex === comments.length - 1}
      onPointerDown={e => begin(e, 'hold', direction)} onPointerMove={update} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)} onContextMenu={e => e.preventDefault()}
      onClick={e => { if (e.detail === 0) commit(sourceIndex + direction); }} />;
  }
  const landing = <div key="landing" className={`ov-landing ${gesture?.cancelled ? 'is-cancelled' : ''}`} ref={gap} data-target={target}>
    <div className="ov-insert-rule"><span /><small>{gesture?.cancelled ? '松手取消' : gesture ? '松手放在此处' : '当前评论'}</small><span /></div>
    <div className="ov-moving"><Thumb comment={source} /><strong>{source.title}</strong><Icon name={notice ? 'check' : 'move'} /></div>
  </div>;
  return <main className="ov-shell">
    <header className="ov-page-header"><div><span className="ov-eyebrow">快速移动评论 · 交互原型</span><h1>按内容选择移动位置</h1></div><div className="ov-demo-controls"><label className="ov-sr" htmlFor="ov-sample">演示样例</label><select id="ov-sample" value={sample} onChange={e => reset(e.target.value)}>{Object.entries(samples).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select><Action name="reset" label="重置演示" onClick={() => reset()} /></div></header>
    <div className="ov-workspace">
      <section className="ov-original"><div className="ov-section-label"><span>卡片内容</span><small>点按评论可更换移动对象</small></div>
        <article className="ov-note"><header>{samples[sample].title}</header><div className="ov-note-scroll" ref={note}>
          {comments.map((c, i) => <button type="button" key={c.id} className={`ov-comment ${c.id === sourceId ? 'is-selected' : ''}`} aria-label={`选择评论：${c.title}`} aria-pressed={c.id === sourceId} onClick={() => choose(c.id)} data-comment-id={c.id}>
            <span className="ov-comment-meta"><span>{String(i + 1).padStart(2, '0')} · {c.type}</span>{c.id === sourceId && <span>正在移动</span>}</span><strong>{c.title}</strong><p>{c.body}</p>{c.image && <img src={c.image} alt="演示中的图片评论" />}
          </button>)}
        </div></article>
      </section>
      <section className={`ov-preview ${gesture?.cancelled ? 'is-cancelled' : ''}`} aria-label="评论移动预览">
        <div className="ov-section-label"><span>移动位置</span><small>{target + 1} / {comments.length}</small></div>
        <div className="ov-sidebar">
          <div className="ov-overview"><header><span>评论顺序</span><span className="ov-live-dot">{gesture ? gesture.cancelled ? '即将取消' : '正在预览' : '压缩预览'}</span></header>
            <div className="ov-overview-scroll" ref={scroll} aria-label="压缩评论列表" tabIndex={0}>
              <div className="ov-overview-list">
                {rest.map((c, i) => <React.Fragment key={c.id}>
                  {i === target && landing}
                  <div className={`ov-row ${i === target - 1 || i === target ? 'is-neighbor' : 'is-distant'}`} data-preview-id={c.id}>
                    <span className="ov-row-thumb"><Thumb comment={c} /></span><div className="ov-row-content">{(i === target - 1 || i === target) && <small>{i === target - 1 ? '上方' : '下方'}</small>}<strong>{c.title}</strong>{(i === target - 1 || i === target) && <p>{c.body}</p>}</div>
                  </div>
                </React.Fragment>)}
                {target === rest.length && landing}
              </div>
            </div>
            <footer>{gesture?.cancelled ? '返回手柄附近可继续预览' : '其他评论保留摘要，图片统一缩小'}</footer>
          </div>
          <div className="ov-controls" role="toolbar" aria-label="移动评论" aria-orientation="vertical">
            {arrow(-1)}
            <div className="ov-track" ref={track} style={{ '--ov-ratio': thumbRatio }}><div className="ov-track-line" />
              <button type="button" className={`ov-grip ${gesture ? 'is-dragging' : ''}`} role="slider" aria-label="拖动评论选择目标位置" title="上下拖动定位；横向移开取消" aria-valuemin={1} aria-valuemax={comments.length} aria-valuenow={target + 1} aria-valuetext={`第 ${target + 1} 条，上方：${rest[target - 1]?.title || '卡片开头'}；下方：${rest[target]?.title || '卡片末尾'}`} aria-orientation="vertical"
                onPointerDown={e => begin(e, 'drag')} onPointerMove={update} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)} onContextMenu={e => e.preventDefault()} onKeyDown={keyMove} onDragStart={e => e.preventDefault()}><Icon name="move" /></button>
            </div>
            {arrow(1)}<Action name="undo" label="撤回移动" onClick={undo} disabled={!history.length} />
          </div>
        </div>
        <div className="ov-status" role="status">{gesture ? gesture.cancelled ? '松手取消，评论顺序保持不变。' : '松手后移动，横向移开可取消。' : notice || '上下拖动右侧手柄，预览目标位置。'}</div>
      </section>
    </div>
    <footer className="ov-page-footer"><span><i />灰色摘要保留上下文</span><span><i />相邻评论展开显示</span><small>仅操作演示数据</small></footer>
  </main>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
const revision = (import.meta.hot?.data.revision || 0) + 1;
root.render(<App key={revision} />);
if (import.meta.hot) import.meta.hot.dispose(data => { data.root = root; data.revision = revision; });
