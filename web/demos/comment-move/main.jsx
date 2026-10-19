import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import './prototype.css';
import { initialComments, initialSelection, insertSelection, sections } from './model.mjs';

// Reuse icon assets from the existing comment-module demo.
const paths = { up: 'M5 12l5-5 5 5', down: 'M5 8l5 5 5-5', close: 'M5 5l10 10M15 5L5 15', check: 'M4 10l4 4 8-8', undo: 'M7 4L3 8l4 4M3 8h8a5 5 0 010 10', move: 'M3 10h14M6 6l-4 4 4 4M14 6l4 4-4 4', reset: 'M4 8a6 6 0 111 7M4 3v5h5', more: 'M4 10h1M10 10h1M16 10h1' };
function Icon({ name }) { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
function IconButton({ icon, label, ...props }) { return <button className="icon-button" type="button" aria-label={label} title={label} {...props}><Icon name={icon} /></button>; }
function App() {
  const [comments, setComments] = useState(initialComments), [selected, setSelected] = useState(initialSelection);
  const [moving, setMoving] = useState(true), [anchor, setAnchor] = useState(null), [side, setSide] = useState('after');
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false), [previewWidth, setPreviewWidth] = useState(390);
  const wide = previewWidth >= 700;
  const [history, setHistory] = useState([]), [notice, setNotice] = useState(''), [activeSection, setActiveSection] = useState('概念');
  const scroller = useRef(null), root = useRef(null), search = useRef(null);
  const source = comments.filter(comment => selected.includes(comment.id));
  const target = comments.find(comment => comment.id === anchor);
  const results = comments.filter(comment => (!moving || !selected.includes(comment.id)) && (!query.trim() || `${comment.section}${comment.title}${comment.body}`.includes(query.trim())));
  const proposed = anchor ? insertSelection(comments, selected, anchor, side) : comments;
  const changed = comments.map(comment => comment.id).join() !== proposed.map(comment => comment.id).join();

  function reveal(id, preview = false) { requestAnimationFrame(() => (preview ? root.current.querySelector('.insertion') : root.current.querySelector(`[data-id="${id}"]`))?.scrollIntoView({ block: 'center', behavior: 'instant' })); }
  useEffect(() => { if (searching) search.current?.focus(); }, [searching]);
  function choose(id) { setAnchor(id); setSide('after'); setQuery(''); setSearching(false); setNotice(''); reveal(id, true); }
  function jump(section) { setQuery(''); setSearching(false); setActiveSection(section); reveal(comments.find(comment => comment.section === section && !selected.includes(comment.id))?.id); }
  function begin() { if (!selected.length) return; setMoving(true); setAnchor(null); setNotice(''); setQuery(''); scroller.current.scrollTop = 0; }
  function apply(next, message) {
    setHistory(prior => [...prior, comments]); setComments(next); setMoving(false); setAnchor(null); setQuery(''); setSearching(false); setNotice(message); reveal(source[0]?.id);
  }
  function quick(direction) {
    const ordered = comments.filter(comment => selected.includes(comment.id));
    const first = comments.findIndex(comment => comment.id === ordered[0]?.id), last = comments.findIndex(comment => comment.id === ordered.at(-1)?.id);
    const neighbor = direction < 0 ? comments[first - 1] : comments[last + 1];
    if (neighbor) apply(insertSelection(comments, selected, neighbor.id, direction < 0 ? 'before' : 'after'), direction < 0 ? '评论已上移' : '评论已下移');
  }
  function undo() { if (!history.length) return; setComments(history.at(-1)); setHistory(history.slice(0, -1)); setNotice('已撤销移动'); reveal(source[0]?.id); }
  function reset() { setComments(initialComments); setSelected(initialSelection); setMoving(true); setAnchor(null); setQuery(''); setSearching(false); setHistory([]); setNotice(''); scroller.current.scrollTop = 0; }
  const destination = anchor === 'start' ? '列表开头' : anchor === 'end' ? '列表末尾' : target ? `「${target.title}」${side === 'before' ? '之前' : '之后'}` : '轻点目标评论，预览插入位置';

  function ghost(position) { return <div className="insertion" data-testid="insertion-preview" data-position={position}><div className="insertion-line"><span>将在此处插入</span></div><div className="insert-content"><Icon name="move" /><div><strong>{source.length > 1 ? `${source.length} 条评论` : source[0]?.title}</strong><p>{source.length > 1 ? source.map(comment => comment.title).join('、') : source[0]?.body}</p></div></div></div>; }

  return <div className={`prototype ${wide ? 'wide' : ''}`} ref={root} style={{width:`min(100%, ${previewWidth}px)`}}>
    <div className="review-bar"><span>评论移动 <span className="prototype-tag">交互原型</span></span><div><select className="size-switch" aria-label="预览尺寸" value={previewWidth} onChange={event => setPreviewWidth(Number(event.target.value))}><option value={320}>小屏 · 320</option><option value={375}>iPhone · 375</option><option value={390}>iPhone · 390</option><option value={414}>iPhone · 414</option><option value={768}>iPad · 768</option></select><IconButton icon="reset" label="重置演示" onClick={reset} /></div></div>
    <section className={`comment-app ${moving ? 'is-moving' : ''}`} aria-label="评论移动原型">
      <header className="app-header"><div><span className="eyebrow">秩与零度定理</span><h1>{moving ? '选择移动位置' : '卡片评论'}</h1></div>{moving ? <button className="text-button" onClick={() => { setMoving(false); setQuery(''); setSearching(false); setAnchor(null); }}>取消</button> : <button className="text-button" onClick={() => { setSearching(!searching); setQuery(''); }}>搜索</button>}</header>
      <div className="app-content">
      {moving && <aside className="moving-source"><div className="source-heading"><span className="source-kicker">待移动{source.length > 1 ? ` · ${source.length} 条` : ''}</span><span className="type-label">{source.length === 1 ? source[0]?.type : '保持原顺序'}</span></div><strong>{source.length > 1 ? source.map(comment => comment.title).join('、') : source[0]?.title}</strong><p>{source[0]?.body}</p><div className="source-actions"><button onClick={() => choose('start')}>移到开头</button><button onClick={() => choose('end')}>移到末尾</button></div></aside>}
      <div className="destination-pane">
        <div className="navigation"><div className="nav-label"><span>{searching ? '查找目标评论' : moving ? '按内容选择落点' : '浏览评论'}</span><button className="text-button" onClick={() => { setSearching(!searching); setQuery(''); }}>{searching ? '收起搜索' : '搜索'}</button></div>{searching ? <input ref={search} className="search-input" aria-label="搜索评论内容" value={query} placeholder="搜索标题或评论内容" onChange={event => setQuery(event.target.value)} /> : <nav aria-label="章节跳转">{sections.map(section => <button key={section} aria-pressed={activeSection === section} onClick={() => jump(section)}>{section}</button>)}</nav>}</div>
        <div className="comment-scroller" ref={scroller} tabIndex={0} aria-label={moving ? '目标评论列表' : '评论列表'}>
          {moving && <p className="list-hint">轻点评论，在完整上下文中预览位置</p>}
          {moving && anchor === 'start' && ghost('start')}
          {!results.length && <div className="empty">没有匹配的评论<p>尝试搜索其他标题或内容。</p></div>}
          {results.map((comment, index) => {
            const isSource = selected.includes(comment.id), isTarget = moving && anchor === comment.id;
            const showSection = index === 0 || results[index - 1].section !== comment.section;
            return <React.Fragment key={comment.id}>
              {showSection && <h2 className="section-label">{comment.section}<span /></h2>}
              {isTarget && side === 'before' && ghost(comment.id)}
              <div className={`comment-row ${isSource && !moving ? 'selected' : ''} ${isTarget ? 'target' : ''}`} data-id={comment.id}>
                <button className="comment-hit" aria-label={moving ? `选择目标：${comment.title}` : `选择评论：${comment.title}`} aria-pressed={moving ? isTarget : isSource} onClick={() => moving ? choose(comment.id) : setSelected(prior => prior.includes(comment.id) ? prior.filter(id => id !== comment.id) : [...prior, comment.id])}>
                  {!moving && <span className="selection-circle">{isSource && <Icon name="check" />}</span>}
                  <span className="row-content"><span className="row-meta"><span>{query ? `${comment.section} · ` : ''}{comment.type}</span>{isTarget && <span className="target-badge">目标评论</span>}</span><strong>{comment.title}</strong><span className="row-body">{comment.body}</span></span>
                </button>
                {isTarget && <div className="placement-side" aria-label="插入到目标评论之前或之后"><span>插入位置</span><div><button aria-pressed={side === 'before'} onClick={() => { setSide('before'); reveal(anchor, true); }}>之前</button><button aria-pressed={side === 'after'} onClick={() => { setSide('after'); reveal(anchor, true); }}>之后</button></div></div>}
              </div>
              {isTarget && side === 'after' && ghost(comment.id)}
            </React.Fragment>;
          })}
          {moving && anchor === 'end' && ghost('end')}
          <div className="list-end">评论列表结束</div>
        </div>
      </div></div>
      {notice && <div className="toast" role="status"><span><Icon name="check" />{notice}</span>{history.length > 0 && <button onClick={undo}>撤销</button>}</div>}
      <footer className="app-footer">{moving ? <><div className="destination-summary"><span>目标位置</span><strong>{destination}</strong></div><button className="commit" disabled={!changed} onClick={() => apply(proposed, '评论已移动到目标位置')}>移动到此处<Icon name="check" /></button></> : <><div className="selection-summary"><strong>{selected.length ? `已选择 ${selected.length} 条评论` : '轻点评论以选择'}</strong><span>相邻位置直接移动，远处按内容定位</span></div><div className="quick-actions"><IconButton icon="up" label="上移一条" disabled={!selected.length || selected.includes(comments[0]?.id)} onClick={() => quick(-1)} /><IconButton icon="down" label="下移一条" disabled={!selected.length || selected.includes(comments.at(-1)?.id)} onClick={() => quick(1)} /><button className="commit" disabled={!selected.length} onClick={begin}><Icon name="move" />移动到…</button></div></>}</footer>
    </section>
    <p className="demo-note">仅使用演示评论，不连接 MarginNote 数据。</p>
    </div>;
}
createRoot(document.getElementById('root')).render(<App />);
