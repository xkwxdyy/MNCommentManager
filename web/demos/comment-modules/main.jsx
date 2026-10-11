import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderMarkdownToHtml } from '../../src/lib/markdownRenderer';
import { CommentFoldButton, CollapsedCommentPreview } from '../../src/components/CommentFoldControls';
import 'katex/dist/katex.min.css';
import '../../src/styles.css';
import './demo.css';
import { DemoBridge } from './bridge';
import { buildModules, effectiveSettings, filterComments, moduleIds, selectionState, toggleIds } from './engine.mjs';
import { attachTwoFingerSelection } from './gesture.mjs';
import { createCommentHitTester } from '../../src/lib/commentSelectionGeometry.mjs';

const TYPE_LABELS = { textComment: '文本', markdownComment: 'Markdown', HtmlComment: 'HTML', imageComment: '图片', linkComment: '链接' };
const FILTERS = [['all', '全部'], ['text', '文本'], ['imageComment', '图片'], ['linkComment', '链接'], ['HtmlComment', 'HTML']];
const ICONS = { settings: 'M4 5h12M4 10h12M4 15h12M8 3v4M13 8v4M7 13v4', undo: 'M7 4L3 8l4 4M3 8h8a5 5 0 010 10', reset: 'M4 8a6 6 0 111 7M4 3v5h5', up: 'M5 12l5-5 5 5', down: 'M5 8l5 5 5-5', close: 'M5 5l10 10M15 5L5 15', more: 'M4 10h1M10 10h1M16 10h1', select: 'M4 10l4 4 8-8', extract: 'M4 12v5h12v-5M10 13V3M6 7l4-4 4 4', move: 'M3 10h14M6 6l-4 4 4 4M14 6l4 4-4 4', fold: 'M4 10h12M6 3l4 4 4-4M6 17l4-4 4 4', unfold: 'M4 10h12M6 6l4-4 4 4M6 14l4 4 4-4', help: 'M7 7a3 3 0 116 0c0 2-3 2-3 5M10 16h.01', title: 'M4 5h12M10 5v12M7 17h6' };

const MODULE_ICONS = { shown: 'M2 16V4h6l2 3h7v3M2 16l3-6h13l-3 6H2', hidden: 'M2 16V4h6l2 3h8v9H2M8 11h4M10 9v4' };
function Icon({ name }) { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || MODULE_ICONS[name] || ICONS.more} /></svg>; }
function Action({ name, label, ...props }) { return <button type="button" className="demo-icon" title={label} aria-label={label} {...props}><Icon name={name} /></button>; }
function Check({ checked, partial, label, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!partial; }, [partial]);
  return <input ref={ref} type="checkbox" checked={!!checked} disabled={disabled} aria-label={label} onChange={onChange} onClick={e => e.stopPropagation()} />;
}

// Preserve DOM identity during touch selection. Reassigning innerHTML removes
// the original touch target, so subsequent events cannot bubble to the pane.
const Markdown = memo(function Markdown({ text, className = 'markdown-content' }) {
  const html = useMemo(() => ({ __html: renderMarkdownToHtml(text) }), [text]);
  return <div className={className} dangerouslySetInnerHTML={html} />;
});
const FoldedPreview = memo(function FoldedPreview({ comment }) {
  return <CollapsedCommentPreview comment={{ ...comment, capabilities: { isMarkdown: comment.type === 'markdownComment' } }} text={comment.text} mediaSources={comment.image ? [{ src: comment.image, alt: comment.text }] : []} />;
});

function Dialog({ title, onClose, busy, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    ref.current.querySelector('button,input,select,textarea')?.focus();
    return () => { if (prior?.isConnected) prior.focus(); };
  }, []);
  return <div className="demo-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section ref={ref} className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" onKeyDown={e => {
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const elements = [...ref.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
      if (!elements.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0].focus(); }
    }}>
      <header><h2 id="demo-dialog-title">{title}</h2><Action name="close" label="关闭窗口" onClick={onClose} disabled={busy} /></header>
      {children}
    </section>
  </div>;
}

export function App() {
  const [state, setState] = useState(null), [noteId, setNoteId] = useState('mixed');
  const [selected, setSelected] = useState(new Set()), [collapsed, setCollapsed] = useState(new Set());
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [status, setStatus] = useState('正在读取演示数据…');
  const [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null), [scope, setScope] = useState('card');
  const [draft, setDraft] = useState(null), [draftProfileId, setDraftProfileId] = useState('html');
  const [targetId, setTargetId] = useState(''), [childTitle, setChildTitle] = useState(''), [removeOriginal, setRemoveOriginal] = useState(false);
  const [lastChildId, setLastChildId] = useState(null), [rangeAnchor, setRangeAnchor] = useState(undefined);
  const paneRef = useRef(null), gestureRef = useRef(null), viewRef = useRef(null), requestRef = useRef(false);
  const card = state?.cards.find(c => c.id === noteId) || state?.cards[0];
  const effective = state && card ? effectiveSettings(state.settings, card.id) : null;
  const profileKey = JSON.stringify(effective?.profile);
  const tree = useMemo(() => card ? buildModules(card.comments, effective.profile) : { roots: [], flat: [], titleIds: new Set() }, [card, profileKey]);
  const matching = useMemo(() => card ? filterComments(card.comments, filter, query) : [], [card, filter, query]);
  const matchingIds = new Set(matching.map(c => c.id));
  const hasFilter = filter !== 'all' || !!query.trim();
  const collapsedKey = node => `${card.id}:${node.id}`;
  const renderedIds = new Set(), displayedIds = new Set();
  function countMatches(node) { return card.comments.slice(node.start, node.end).filter(c => matchingIds.has(c.id)).length; }
  function collectRendered(node, hidden = false) {
    if (hidden || (hasFilter && !countMatches(node))) return;
    if (node.titleId) displayedIds.add(node.titleId);
    if (collapsed.has(collapsedKey(node))) return;
    node.items.forEach(c => { if (matchingIds.has(c.id)) { renderedIds.add(c.id); displayedIds.add(c.id); } });
    node.children.forEach(child => collectRendered(child));
  }
  tree.roots.forEach(node => collectRendered(node));
  const renderedList = card?.comments.filter(c => renderedIds.has(c.id)).map(c => c.id) || [];
  const hiddenCount = [...selected].filter(id => !displayedIds.has(id)).length;
  viewRef.current = { card, tree, selected, renderedList, disabled: busy || !!dialog, state };

  function apply(next) {
    setState(next);
    const current = next.cards.find(c => c.id === viewRef.current?.card?.id) || next.cards[0];
    if (current.id !== viewRef.current?.card?.id) setNoteId(current.id);
    const valid = new Set(current.comments.map(c => c.id));
    setSelected(prev => new Set([...prev].filter(id => valid.has(id))));
  }
  async function run(command, payload = {}, message = '操作已保存到模拟存储') {
    if (requestRef.current) return false;
    gestureRef.current?.cancel();
    requestRef.current = true; setBusy(true);
    try {
      const next = await DemoBridge.send(command, { ...payload, expectedRevision: viewRef.current.state?.revision });
      apply(next);
      if (['saveModuleSettings', 'reset', 'undo'].includes(command)) { setSelected(new Set()); setRangeAnchor(undefined); }
      if (command === 'reset') { setCollapsed(new Set()); setLastChildId(null); setQuery(''); setFilter('all'); }
      if (command === 'extract') {
        const child = next.cards.find(c => !viewRef.current.state.cards.some(old => old.id === c.id));
        if (child) setLastChildId(child.id);
      }
      setStatus(message); return true;
    } catch (error) { setStatus(error.message); return false; }
    finally { requestRef.current = false; setBusy(false); }
  }
  useEffect(() => { run('getState', {}, '双指纵向滑动可快速多选；模块复选框选择完整模块。'); }, []);
  useEffect(() => {
    if (!paneRef.current || !state) return;
    const geometry = createCommentHitTester(paneRef.current, () => viewRef.current.renderedList, {
      selector: '[data-comment-id]', getId: node => node.dataset.commentId,
      exclusionSelector: '.demo-module-head',
    });
    const api = attachTwoFingerSelection(paneRef.current, {
      getSelection: () => viewRef.current.selected,
      setSelection: value => { viewRef.current.selected = value; setSelected(value); },
      getVisibleIds: () => viewRef.current.renderedList,
      disabled: () => viewRef.current.disabled || requestRef.current,
      onClaim: () => setRangeAnchor(undefined), onStatus: setStatus,
      hitTest: geometry.hitTest, onFinish: geometry.invalidate,
    });
    gestureRef.current = api;
    return () => { api.destroy(); geometry.destroy(); gestureRef.current = null; };
  }, [!!state]);
  useEffect(() => { gestureRef.current?.cancel(); }, [noteId, query, filter, profileKey, dialog, busy, collapsed]);

  function changeCard(id) {
    gestureRef.current?.cancel(); setNoteId(id); setSelected(new Set()); setQuery(''); setFilter('all'); setRangeAnchor(undefined); setDialog(null);
    if (paneRef.current) paneRef.current.scrollTop = 0;
    setStatus('已切换样例卡片，卡片划分方案已读取');
  }
  function open(value) { gestureRef.current?.cancel(); setRangeAnchor(undefined); setDialog(value); }
  function chooseModule(node, includeTitle = effective.includeTitle) {
    const ids = moduleIds(node, card.comments, tree.titleIds, includeTitle);
    setSelected(prev => toggleIds(prev, ids));
    const hidden = ids.filter(id => !matchingIds.has(id)).length;
    setStatus(ids.length ? `模块选择包含 ${ids.length} 条评论${hidden ? `，其中 ${hidden} 条被筛选隐藏` : ''}${includeTitle ? '，包含标题' : '，排除结构标题'}` : '模块没有可选择的正文');
  }
  function toggleComment(id) {
    if (rangeAnchor !== undefined) {
      if (rangeAnchor === null) { setRangeAnchor(id); setSelected(new Set([id])); setStatus('范围起点已选择，请选择终点'); }
      else {
        const a = card.comments.findIndex(c => c.id === rangeAnchor), b = card.comments.findIndex(c => c.id === id);
        setSelected(new Set(card.comments.slice(Math.min(a, b), Math.max(a, b) + 1).map(c => c.id)));
        setRangeAnchor(undefined); setStatus('连续范围已选择，包含中间被筛选隐藏的评论');
      }
    } else setSelected(prev => toggleIds(prev, [id]));
  }
  function openSettings() {
    setDraft(structuredClone(state.settings)); setDraftProfileId(effective.profile.id); setScope('card'); open({ type: 'settings' });
  }
  function openExtract(ids = [...selected], title = '') { setChildTitle(title || `${card.title} · 子卡片`); setRemoveOriginal(false); open({ type: 'extract', ids }); }
  function toggleModuleVisibility(node) {
    gestureRef.current?.cancel();
    const folded = collapsed.has(collapsedKey(node));
    setCollapsed(prev => { const next = new Set(prev); folded ? next.delete(collapsedKey(node)) : next.add(collapsedKey(node)); return next; });
    setStatus(`模块“${node.title}”的内容已${folded ? '显示' : '隐藏'}；评论折叠状态保持不变`);
  }
  function locate(node) {
    gestureRef.current?.cancel();
    let ancestor = node;
    const next = new Set(collapsed);
    while (ancestor?.parentId) { ancestor = tree.flat.find(n => n.id === ancestor.parentId); if (ancestor) next.delete(collapsedKey(ancestor)); }
    setCollapsed(next);
    requestAnimationFrame(() => document.getElementById(node.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  function renderComment(comment) {
    if (!matchingIds.has(comment.id)) return null;
    const index = card.comments.indexOf(comment), selectedNow = selected.has(comment.id);
    const foldComment = { ...comment, index, capabilities: { canSetCollapsed: true, isMarkdown: comment.type === 'markdownComment' } };
    return <article key={comment.id} className={`comment-card demo-comment ${selectedNow ? 'selected' : ''}`} data-comment-id={comment.id}>
      <div className="comment-head">
        <CommentFoldButton comment={foldComment} selectionCount={selectedNow ? selected.size : 1} disabled={busy} onToggle={(_, value) => run('setCollapsed', { noteId: card.id, ids: selectedNow ? [...selected] : [comment.id], collapsed: value }, value ? '评论已折叠为摘要；模块显示状态保持不变' : '评论已展开为全文；模块显示状态保持不变')} />
        <Check checked={selectedNow} label={`选择评论 #${index}`} onChange={() => toggleComment(comment.id)} disabled={busy} />
        <span className="comment-index">#{index}</span><span className="type-pill">{TYPE_LABELS[comment.type] || comment.type}</span>
        {rangeAnchor === comment.id && <span className="range-anchor-label">起点</span>}
      </div>
      {comment.collapsed ? <FoldedPreview comment={comment} /> : <div className="demo-comment-body" onClick={e => {
        if (!e.target.closest('a,button,input') && !window.getSelection()?.toString()) toggleComment(comment.id);
      }}>
        {comment.image && <img className="demo-image" src={comment.image} alt={comment.text} loading="lazy" />}
        <Markdown text={comment.text} />
        {comment.linkedNoteId && <button className="compact" onClick={() => changeCard(comment.linkedNoteId)}>查看参考卡片</button>}
      </div>}
    </article>;
  }
  function renderModule(node) {
    const visible = countMatches(node);
    if (hasFilter && !visible) return null;
    const ids = moduleIds(node, card.comments, tree.titleIds, effective.includeTitle);
    const selection = selectionState(ids, selected), folded = collapsed.has(collapsedKey(node));
    const foldIds = new Set(ids);
    const foldComments = card.comments.slice(node.start, node.end).filter(c => foldIds.has(c.id));
    const allCommentsCollapsed = foldComments.length > 0 && foldComments.every(c => c.collapsed);
    const commentsMixed = !allCommentsCollapsed && foldComments.some(c => c.collapsed);
    const siblings = tree.flat.filter(n => n.parentId === node.parentId && n.rank === node.rank && n.titleId);
    const position = siblings.indexOf(node);
    const comment = node.titleId && card.comments[node.start];
    const entries = [...node.items.map(c => ({ position: card.comments.indexOf(c), comment: c })), ...node.children.map(n => ({ position: n.start, node: n }))].sort((a, b) => a.position - b.position);
    return <section key={node.id} id={node.id} className={`demo-module depth-${Math.min(node.depth, 4)} ${selection.checked ? 'is-selected' : ''}`} data-module-id={node.id}>
      <header className="demo-module-head">
        <button type="button" className="demo-icon demo-module-visibility" title={`${folded ? '显示' : '隐藏'}模块内容：${node.title}；评论折叠状态保持不变`} aria-label={`${folded ? '显示' : '隐藏'}模块内容：${node.title}`} aria-expanded={!folded} aria-controls={`${node.id}-contents`} disabled={busy} onClick={() => toggleModuleVisibility(node)}><Icon name={folded ? 'hidden' : 'shown'} /></button>
        {selection.checked && <button type="button" className="comment-fold-button demo-module-comment-fold" aria-label={`${allCommentsCollapsed ? '展开' : '折叠'}模块评论：${node.title}`} title={`${allCommentsCollapsed ? '展开' : '折叠'}模块所选 ${ids.length} 条评论，包含隐藏成员${commentsMixed ? '；混合状态统一折叠' : ''}；文件夹显示状态保持不变`} aria-expanded={!allCommentsCollapsed} aria-controls={`${node.id}-contents`} data-fold-state={allCommentsCollapsed ? 'folded' : commentsMixed ? 'mixed' : 'expanded'} disabled={busy} onClick={() => run('setCollapsed', { noteId: card.id, ids, collapsed: !allCommentsCollapsed }, `模块“${node.title}”的所选评论已${allCommentsCollapsed ? '展开为全文' : '折叠为摘要'}；模块显示状态保持不变`)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>}
        <Check {...selection} disabled={busy || !ids.length} label={`选择模块：${node.title}${effective.includeTitle ? '（含标题）' : '（仅正文）'}`} onChange={() => chooseModule(node)} />
        <button className="demo-module-title" title={node.title} onClick={() => locate(node)}>{node.title}</button>
        <span className="demo-module-count" title="匹配评论 / 完整模块评论">{hasFilter ? `${visible}/` : ''}{node.end - node.start}{selection.partial ? ' · 部分' : ''}</span>
        {node.titleId && <div className="demo-module-actions">
          <Action name="up" label={`上移模块：${node.title}`} disabled={busy || position <= 0} onClick={() => run('reorderModule', { noteId: card.id, moduleId: node.id, direction: 'up' }, '模块已整体上移，标题与子模块一并保留')} />
          <Action name="down" label={`下移模块：${node.title}`} disabled={busy || position >= siblings.length - 1} onClick={() => run('reorderModule', { noteId: card.id, moduleId: node.id, direction: 'down' }, '模块已整体下移，标题与子模块一并保留')} />
        </div>}
        <Action name="more" label={`模块操作：${node.title}`} disabled={busy} onClick={() => open({ type: 'module', nodeId: node.id })} />
      </header>
      {folded ? <div id={`${node.id}-contents`} className="demo-module-summary"><span>模块内容已隐藏 · {node.end - node.start - (node.titleId ? 1 : 0)} 条评论{node.children.length ? '（含子模块）' : ''}</span><small>评论的全文或摘要显示状态保持不变</small></div> : <div id={`${node.id}-contents`} className="demo-module-contents">
        {comment && /\n\s*\S/.test(comment.text.trim()) && <Markdown text={comment.text} className="demo-title-content markdown-content" />}
        {entries.map(entry => entry.node ? renderModule(entry.node) : renderComment(entry.comment))}
        {!entries.length && <p className="demo-empty-module">模块正文为空</p>}
      </div>}
    </section>;
  }

  if (!state) return <main className="demo-loading"><h1>评论模块演示</h1><p role="status">{status}</p><button onClick={() => run('getState')}>重新连接演示服务</button></main>;
  const dialogNode = dialog?.nodeId && tree.flat.find(n => n.id === dialog.nodeId);
  const editProfile = draft?.profiles.find(p => p.id === draftProfileId);
  function editProfileValue(change) { setDraft(prev => ({ ...prev, profiles: prev.profiles.map(p => p.id === draftProfileId ? { ...p, ...change } : p) })); }
  return <div className="demo-root">
    <header className="topbar">
      <div className="topbar-title"><h1>评论管理器 <span className="demo-badge">交互演示</span></h1><p>模块化 · 双指滑动多选 · 模拟数据</p></div>
      <select aria-label="样例卡片" className="demo-card-picker" value={card.id} disabled={busy} onChange={e => changeCard(e.target.value)}>{state.cards.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      <div className="topbar-actions">
        <Action name="settings" label="模块划分设置" onClick={openSettings} disabled={busy} />
        <Action name="undo" label={state.undoLabel ? `撤销：${state.undoLabel}` : '没有可撤销的操作'} disabled={busy || !state.undoLabel} onClick={() => run('undo', {}, '模拟操作已撤销')} />
        <Action name="reset" label="重置演示数据" onClick={() => open({ type: 'reset' })} disabled={busy} />
        <Action name="help" label="操作说明与验证边界" onClick={() => open({ type: 'help' })} />
      </div>
    </header>
    <div className="statusbar"><span>{card.comments.length} 条评论</span><span>{tree.flat.length} 个模块</span><span className="status-message" role="status" title={status}>{busy ? '正在保存…' : status}</span></div>
    <nav className="quick-nav" aria-label="模块目录"><span className="quick-nav-label">模块目录</span><div className="quick-nav-track">
      <button className="quick-nav-item" onClick={() => { paneRef.current.scrollTop = 0; }}>顶部</button>
      {tree.flat.filter(n => !hasFilter || countMatches(n)).map(n => <button key={n.id} className="quick-nav-item" title={n.title} onClick={() => locate(n)}><span>{n.depth ? '↳ ' : ''}{n.title}</span><b>{n.end - n.start}</b></button>)}
    </div></nav>
    <main className="demo-workspace">
      <aside className="left-pane demo-sidebar">
        <div className="demo-profile-summary"><span>{effective.profile.name}</span><small>{effective.overridden ? '当前卡片覆盖' : '全局默认'} · {effective.includeTitle ? '选择包含标题' : '仅选择正文'}</small><button className="compact" onClick={openSettings} disabled={busy}>配置划分方案</button></div>
        <label className="demo-search">查找评论<input aria-label="搜索评论" type="search" placeholder="搜索完整内容" value={query} onChange={e => { gestureRef.current?.cancel(); setQuery(e.target.value); setRangeAnchor(undefined); }} /></label>
        <div className="demo-filters" role="group" aria-label="评论类型">{FILTERS.map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => { gestureRef.current?.cancel(); setFilter(id); setRangeAnchor(undefined); }}>{label}</button>)}</div>
        {hasFilter && <button className="compact" onClick={() => { setQuery(''); setFilter('all'); }}>重置筛选</button>}
        <p className="demo-sidebar-note">双指纵向滑动选择可见评论。模块复选框包含筛选隐藏的成员。</p>
      </aside>
      <div ref={paneRef} className="comment-pane demo-pane" aria-label="评论列表" tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') { gestureRef.current?.cancel(); setRangeAnchor(undefined); setStatus('已退出选择手势，当前选区保留'); } }}>
        {hasFilter && <div className="list-context demo-filter-context">当前匹配 {matching.length} / {card.comments.length} 条评论，模块边界保持不变。</div>}
        {rangeAnchor !== undefined && <div className="list-context">{rangeAnchor === null ? '请选择范围起点' : '请选择范围终点'}，该入口包含中间隐藏的评论。<button className="compact" onClick={() => setRangeAnchor(undefined)}>退出范围选择</button></div>}
        <div className="comment-list demo-list">{tree.roots.map(node => renderModule(node))}
          {!card.comments.length && <div className="demo-empty">当前样例卡片没有评论。</div>}
          {hasFilter && !matching.length && <div className="demo-empty">没有匹配的评论。模块结构没有改变。</div>}
        </div>
      </div>
    </main>
    <footer className="demo-footer">
      <div className="demo-selection-summary"><strong>已选 {selected.size}</strong>{hiddenCount > 0 && <span className="demo-hidden-count">隐藏 {hiddenCount}</span>}{lastChildId && state.cards.some(c => c.id === lastChildId) && <button className="compact" onClick={() => changeCard(lastChildId)}>查看子卡片</button>}</div>
      <div className="demo-footer-actions">
        <Action name="select" label="选择当前显示的评论" disabled={busy || !displayedIds.size} onClick={() => setSelected(new Set(displayedIds))} />
        <button className={`compact ${rangeAnchor !== undefined ? 'active' : ''}`} disabled={busy || !card.comments.length} onClick={() => setRangeAnchor(rangeAnchor === undefined ? null : undefined)}>选范围</button>
        <Action name="close" label="清空选区" disabled={busy || !selected.size} onClick={() => setSelected(new Set())} />
        <Action name="fold" label="折叠所选评论" disabled={busy || !selected.size} onClick={() => run('setCollapsed', { noteId: card.id, ids: [...selected], collapsed: true }, '所选评论已折叠为摘要；模块内容的显示或隐藏状态保持不变')} />
        <Action name="unfold" label="展开所选评论" disabled={busy || !selected.size} onClick={() => run('setCollapsed', { noteId: card.id, ids: [...selected], collapsed: false }, '所选评论已展开')} />
        <Action name="move" label="移动所选正文" disabled={busy || !selected.size} onClick={() => { setTargetId(''); open({ type: 'move' }); }} />
        <Action name="extract" label="提取所选内容为子卡片" disabled={busy || !selected.size} onClick={() => openExtract()} />
      </div>
    </footer>
    {dialog && <Dialog busy={busy} onClose={() => setDialog(null)} title={{ settings: '模块划分设置', extract: '提取为模拟子卡片', move: '移动正文', module: dialogNode?.title || '模块操作', reset: '重置演示数据', help: '操作说明与验证边界' }[dialog.type]}>
      {dialog.type === 'settings' && draft && <form onSubmit={async e => {
        e.preventDefault(); const settings = structuredClone(draft);
        const includeTitle = scope === 'global' ? settings.includeTitle : (settings.cardOverrides[card.id]?.includeTitle ?? effective.includeTitle);
        if (scope === 'global') settings.defaultProfileId = draftProfileId;
        else settings.cardOverrides[card.id] = { profileId: draftProfileId, includeTitle };
        if (await run('saveModuleSettings', { settings }, '模块方案已保存；页面刷新后仍可恢复')) setDialog(null);
      }}>
        <label>应用范围<select aria-label="应用范围" value={scope} onChange={e => { setScope(e.target.value); setDraftProfileId(e.target.value === 'global' ? draft.defaultProfileId : (draft.cardOverrides[card.id]?.profileId || draft.defaultProfileId)); }}><option value="card">当前卡片覆盖</option><option value="global">全局默认</option></select></label>
        <label>划分方案<select aria-label="划分方案" value={draftProfileId} onChange={e => setDraftProfileId(e.target.value)}>{draft.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>方案名称<input aria-label="方案名称" value={editProfile.name} maxLength={80} required onChange={e => editProfileValue({ name: e.target.value })} /></label>
        <button type="button" disabled={draft.profiles.length >= 30} onClick={() => {
          const copy = { ...structuredClone(editProfile), id: `profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, name: `${editProfile.name.slice(0, 70)} · 副本` };
          setDraft(prev => ({ ...prev, profiles: [...prev.profiles, copy] })); setDraftProfileId(copy.id);
        }}>复制为新方案</button>
        <p className="demo-note">方案规则为共享配置，修改后会影响使用该方案的卡片。保存前不会改写评论。</p>
        {['html', 'nested', 'text'].includes(editProfile.mode) && <>
          <label>边界匹配<select aria-label="边界匹配" value={editProfile.match} onChange={e => editProfileValue({ match: e.target.value })}><option value="all">全部匹配</option><option value="exact">精确匹配</option><option value="prefix">前缀匹配</option><option value="contains">包含匹配</option></select></label>
          {editProfile.match !== 'all' && <label>匹配文字<input aria-label="匹配文字" value={editProfile.value} maxLength={200} required onChange={e => editProfileValue({ value: e.target.value })} /></label>}
        </>}
        {['markdown', 'nested'].includes(editProfile.mode) && <fieldset><legend>参与划分的标题级别</legend><div className="demo-levels">{[1, 2, 3, 4, 5, 6].map(level => <label key={level}><input type="checkbox" checked={editProfile.levels.includes(level)} onChange={() => editProfileValue({ levels: editProfile.levels.includes(level) ? editProfile.levels.filter(n => n !== level) : [...editProfile.levels, level].sort() })} />H{level}</label>)}</div><p className="demo-note">HtmlMD method 始终作为最高级标题，level1–level5 对应所选级别。</p></fieldset>}
        <label className="demo-check-label"><input type="checkbox" checked={scope === 'global' ? draft.includeTitle : (draft.cardOverrides[card.id]?.includeTitle ?? effective.includeTitle)} onChange={e => setDraft(prev => scope === 'global' ? { ...prev, includeTitle: e.target.checked } : { ...prev, cardOverrides: { ...prev.cardOverrides, [card.id]: { profileId: draftProfileId, includeTitle: e.target.checked } } })} />模块选择包含结构标题</label>
        <div className="demo-dialog-buttons"><button type="button" disabled={busy || !effective.overridden} onClick={async () => { const settings = structuredClone(state.settings); delete settings.cardOverrides[card.id]; if (await run('saveModuleSettings', { settings }, '当前卡片已恢复全局默认')) setDialog(null); }}>恢复全局默认</button><button type="submit" className="primary" disabled={busy}>保存方案</button></div>
      </form>}
      {dialog.type === 'module' && dialogNode && <div className="demo-menu-actions">
        <button onClick={() => { chooseModule(dialogNode, true); setDialog(null); }}>选择完整模块（包含标题）</button>
        <button onClick={() => { chooseModule(dialogNode, false); setDialog(null); }}>仅选择正文（排除各级标题）</button>
        {dialogNode.titleId && <button onClick={() => { setSelected(prev => toggleIds(prev, [dialogNode.titleId])); setDialog(null); }}>仅切换当前标题的选择</button>}
        {dialogNode.titleId && ['up', 'down'].map(direction => {
          const siblings = tree.flat.filter(n => n.parentId === dialogNode.parentId && n.rank === dialogNode.rank && n.titleId);
          const index = siblings.indexOf(dialogNode);
          const disabled = direction === 'up' ? index <= 0 : index >= siblings.length - 1;
          return <button key={direction} disabled={busy || disabled} onClick={async () => { if (await run('reorderModule', { noteId: card.id, moduleId: dialogNode.id, direction }, '模块已整体移动，结构保持完整')) setDialog(null); }}>{direction === 'up' ? '整体上移模块' : '整体下移模块'}</button>;
        })}
        <button disabled={!moduleIds(dialogNode, card.comments, tree.titleIds, effective.includeTitle).length} onClick={() => openExtract(moduleIds(dialogNode, card.comments, tree.titleIds, effective.includeTitle), dialogNode.title)}>提取模块为子卡片</button>
        <p className="demo-note">模块选择包含隐藏成员。标题参与范围由设置控制，整体排序始终保留结构标题。</p>
      </div>}
      {dialog.type === 'move' && <form onSubmit={async e => { e.preventDefault(); if (await run('moveBody', { noteId: card.id, ids: [...selected], targetModuleId: targetId }, '正文已移动到目标模块末尾')) setDialog(null); }}>
        <p>所选正文将移动到目标模块末尾，原有顺序保持不变。</p>
        {[...selected].some(id => tree.titleIds.has(id)) && <p className="demo-warning">当前选区包含结构标题。请先使用模块菜单中的“仅选择正文”。</p>}
        <label>目标模块<select aria-label="目标模块" required value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">选择目标模块</option>{tree.flat.filter(n => !moduleIds(n, card.comments, tree.titleIds).some(id => selected.has(id))).map(n => <option key={n.id} value={n.id}>{'　'.repeat(n.depth)}{n.title} · #{n.start}</option>)}</select></label>
        <button className="primary" disabled={busy || !targetId || [...selected].some(id => tree.titleIds.has(id))}>确认移动正文</button>
      </form>}
      {dialog.type === 'extract' && <form onSubmit={async e => { e.preventDefault(); if (await run('extract', { noteId: card.id, ids: dialog.ids, title: childTitle, removeOriginal }, '模拟子卡片已生成，可在底栏查看或撤销')) setDialog(null); }}>
        <p>将提取 {dialog.ids.length} 条评论，保留正文、图片和标题顺序。</p>
        <label>子卡片标题<input aria-label="子卡片标题" value={childTitle} onChange={e => setChildTitle(e.target.value)} required maxLength={120} /></label>
        <label className="demo-check-label"><input type="checkbox" checked={removeOriginal} onChange={e => setRemoveOriginal(e.target.checked)} />同时移除源卡片中的所选内容</label>
        <p className="demo-note">默认保留源内容。移除结构标题会重新计算源卡片的模块归属；模拟撤销可恢复。</p>
        <button className="primary" disabled={busy}>确认提取</button>
      </form>}
      {dialog.type === 'reset' && <><p>样例卡片、划分方案和卡片覆盖将恢复初始状态。该操作可通过模拟撤销恢复。</p><button className="danger" disabled={busy} onClick={async () => { if (await run('reset', {}, '演示已重置，默认使用 HTML 字段划分')) setDialog(null); }}>确认重置</button></>}
      {dialog.type === 'help' && <div className="demo-help">
        <p>模块复选框选择整组内容，父级包含子级。模块菜单提供仅选择正文和单独选择标题的入口。</p>
        <p>模块头的文件夹按钮隐藏或显示整组内容，评论的全文或摘要状态保持不变。模块全选后，复选框前显示评论折叠箭头，批量切换该模块所选评论的全文与摘要，包含隐藏成员；混合状态先统一折叠。评论左侧的箭头按钮切换全文与摘要；底栏的折叠与展开按钮处理所选评论。</p>
        <p>单指滚动；双指同时落在评论正文上，纵向滑动至少 12 像素开始多选。起点已选时取消选择，反向滑动回缩；抬手保留选区。接近列表边缘 36 像素时自动滚动。</p>
        <p>搜索或筛选时，双指仅处理显示的评论。“选范围”包含起点与终点之间的隐藏评论。捏合或额外触点会取消双指多选。</p>
        <p>双指多选需要接管当前触摸。捏合取消后应抬手再缩放；当前手势不会自动交还系统缩放。</p>
        <p>配置、模拟内容和撤销历史保存在本地服务 JSON 文件中。刷新页面可恢复，模块收起与选区属于临时界面状态。</p>
        <p className="demo-warning">演示未调用真实 MarginNote。实际 iPad 多点触摸、宿主手势、真实保存与撤销仍需分别验收。</p>
        <button disabled={busy} onClick={() => run('getState', {}, '演示数据已重新读取')}>刷新演示数据</button>
      </div>}
      <p className="demo-dialog-status" role="status">{status}</p>
    </Dialog>}
  </div>;
}

const mount = document.getElementById('root');
if (mount) createRoot(mount).render(<App />);
