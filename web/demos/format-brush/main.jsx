// Prototype only: imports the production interface, replaces its bridge with in-memory samples.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import App from '../../src/App';
import MNBridge from '../../src/lib/mnBridge';
import { defaultSettings } from '../../src/lib/commentModules.mjs';
import '../../src/styles.css';
import '../../src/components/PanelControls.css';
import './prototype.css';

const clone = value => JSON.parse(JSON.stringify(value));
const blue = { fontName: 'PingFang SC', fontSize: 16, textColor: '#175D62', backgroundColor: '#E3F2FD' };
const original = [
  { index: 0, text: '相关思考', style: blue },
  { index: 1, text: '一致的字段样式可以帮助辨认卡片结构。正文和评论顺序保持不变。', type: 'textComment' },
  { index: 2, text: '证明', style: { fontName: 'PingFang SC', fontSize: 18, textColor: '#9A3412', backgroundColor: '#FFF0DC' } },
  { index: 3, text: '关键词', style: { fontName: 'PingFang SC', fontSize: 14, textColor: '#6B21A8', backgroundColor: '#F3E8FF' } },
  { index: 4, text: '应用', style: { fontName: 'PingFang SC', fontSize: 16, textColor: '#166534', backgroundColor: '#E7F5EC' } },
  { index: 5, text: '包含重点标记的评论', style: { fontName: 'PingFang SC', fontSize: 16, textColor: '#4338CA', backgroundColor: '#EEF2FF' }, mixed: true },
].map(c => ({ ...c, type: c.type || 'HtmlComment', originalType: c.type ? 'TextNote' : 'HtmlNote', collapsed: false,
  capabilities: { canMove: true, canCopyText: true, isHtml: !c.type, canSetCollapsed: false } }));
const modules = defaultSettings(); modules.defaultProfileId = 'text';
let snapshot = { noteId: 'format-brush-demo', noteTitle: '泛函分析 · 字段样式示例', error: '', moduleSettings: modules,
  commentFold: { supported: false }, excerpt: { present: false }, comments: clone(original) };
const undoHistory = [];
let notify = () => {};
function sync() { window.__MNCommentManagerNativeSync?.({ snapshot: clone(snapshot), reason: 'prototype' }); notify(); }
MNBridge.send = async command => {
  if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return clone(snapshot);
  if (command === 'getActionButtonSettings') return {};
  if (command === 'listWorkflows') return [];
  if (command === 'getAddonUpdateState') return { version: '格式刷原型', status: 'idle' };
  throw new Error('原型仅演示格式刷；该操作未接入。');
};
function Icon({ name = 'brush' }) {
  const paths = { brush: <><path d="m14 3 7 7-9 9-7-7z"/><path d="m10 7 7 7M5 12l-2 2 7 7 2-2M3 17l-1 5 5-1"/></>, undo: <><path d="M9 5 4 10l5 5"/><path d="M4 10h9a6 6 0 0 1 0 12" transform="translate(0 -3)"/></>, reset: <><path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, arrow: <path d="M4 12h16m-5-5 5 5-5 5"/> };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function RichText({ comment, style = comment.style, className = '' }) {
  return <span className={`brush-rich-text ${className}`} style={{ fontFamily: style.fontName, fontSize: style.fontSize, color: style.textColor, background: style.backgroundColor }}>{comment.text}</span>;
}
function Prototype() {
  const [selection, setSelection] = useState([]), [mounts, setMounts] = useState({});
  const [source, setSource] = useState(null), [targets, setTargets] = useState(new Set());
  const [, setRevision] = useState(0), [notice, setNotice] = useState('');
  const dialogRef = useRef(null), openButton = useRef(null);
  useEffect(() => {
    notify = () => setRevision(x => x + 1);
    let raf;
    const update = () => {
      const indices = [...document.querySelectorAll('.comment-card.selected[data-comment-index]')].map(el => Number(el.dataset.commentIndex));
      setSelection(prev => prev.join() === indices.join() ? prev : indices);
      const actions = document.querySelector('.right-pane-quick-actions'), header = document.querySelector('.topbar-actions'), menu = document.querySelector('.selection-actions-panel .process-section .stack');
      setMounts(prev => prev.actions === actions && prev.header === header && prev.menu === menu ? prev : { actions, header, menu });
      snapshot.comments.forEach(c => {
        const pre = document.querySelector(`#comment-${c.index} .plain-text-preview pre`);
        if (pre && c.mixed && pre.dataset.mixed !== 'true') { pre.innerHTML = '包含<strong>重点</strong>标记的评论'; pre.dataset.mixed = 'true'; }
        if (pre && c.style) Object.assign(pre.style, { color: c.style.textColor, backgroundColor: c.style.backgroundColor, fontSize: `${c.style.fontSize}px`, fontFamily: c.style.fontName });
      });
    };
    const observer = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); });
    observer.observe(document.getElementById('root'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); update();
    return () => { observer.disconnect(); cancelAnimationFrame(raf); notify = () => {}; };
  }, []);
  useEffect(() => {
    if (!source) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector('button[aria-label="关闭格式刷"]')?.focus();
    const keydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setSource(null); }
      if (e.key === 'Tab') {
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
        const first = controls[0], last = controls.at(-1);
        if (!dialogRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); (openButton.current || previous)?.focus?.({ preventScroll: true }); };
  }, [source]);
  const currentSource = selection.length === 1 ? snapshot.comments.find(c => c.index === selection[0]) : null;
  const canBrush = currentSource?.style && !currentSource.mixed;
  const candidates = source ? snapshot.comments.filter(c => c.style && c.index !== source.index) : [];
  const eligible = candidates.filter(c => !c.mixed);
  const all = eligible.length > 0 && targets.size === eligible.length;
  function open(fromMenu = false) { if (!canBrush) return; if (fromMenu) document.querySelector('.selection-actions-close')?.click(); setNotice(''); setTargets(new Set()); setSource(clone(currentSource)); }
  function toggle(index) { setTargets(prev => { const next = new Set(prev); next.has(index) ? next.delete(index) : next.add(index); return next; }); }
  function apply() {
    if (!source || !targets.size) return;
    const count = targets.size;
    undoHistory.push(clone(snapshot.comments));
    snapshot = { ...snapshot, comments: snapshot.comments.map(c => targets.has(c.index) ? { ...c, style: clone(source.style) } : c) };
    setSource(null); sync(); setNotice(`已应用到 ${count} 条评论`);
  }
  function undo() { if (!undoHistory.length) return; snapshot = { ...snapshot, comments: undoHistory.pop() }; sync(); setNotice('已撤销格式刷'); }
  function reset() { snapshot = { ...snapshot, comments: clone(original) }; undoHistory.length = 0; setSource(null); sync(); setNotice(''); }
  return <><App />
    {mounts.header && createPortal(<div className="brush-demo-tools"><span title="仅使用示例数据，不会修改 MarginNote 笔记">交互原型</span><button type="button" className="ghost brush-tool" title="撤销格式刷" aria-label="撤销格式刷" disabled={!undoHistory.length} onClick={undo}><Icon name="undo" /></button><button type="button" className="ghost brush-tool" title="重置示例" aria-label="重置示例" onClick={reset}><Icon name="reset" /></button></div>, mounts.header)}
    {mounts.actions && createPortal(<button type="button" ref={openButton} className="secondary quick-batch-btn brush-entry" disabled={!canBrush} title={canBrush ? '格式刷：将该评论的样式应用到其他 HTML 评论' : '请选择一条具有统一样式的 HTML 评论'} aria-label="格式刷" onClick={() => open()}><Icon /></button>, mounts.actions)}
    {mounts.menu && createPortal(<button type="button" className="secondary brush-menu-entry" disabled={!canBrush} onClick={() => open(true)}><Icon />格式刷</button>, mounts.menu)}
    <span className="brush-inline-status" role="status">{notice}</span>
    {source && createPortal(<div className="brush-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSource(null); }}>
      <section className="brush-dialog" role="dialog" aria-modal="true" aria-labelledby="brush-title" ref={dialogRef}>
        <header className="brush-dialog-head"><h2 id="brush-title"><Icon />格式刷</h2><button type="button" className="ghost brush-tool" title="关闭（Esc）" aria-label="关闭格式刷" onClick={() => setSource(null)}><Icon name="close" /></button></header>
        <div className="brush-source"><span className="brush-eyebrow">源评论 · #{source.index}</span><div className="brush-source-line"><RichText comment={source} /><div className="brush-source-properties"><span>{source.style.fontName === 'PingFang SC' ? '苹方' : source.style.fontName} · {source.style.fontSize}</span><span className="brush-swatch" style={{ background: source.style.textColor }} title={`文字 ${source.style.textColor}`} /><span className="brush-swatch" style={{ background: source.style.backgroundColor }} title={`背景 ${source.style.backgroundColor}`} /></div></div></div>
        <div className="brush-target-heading"><h3>选择目标评论</h3><button type="button" className="ghost" onClick={() => setTargets(all ? new Set() : new Set(eligible.map(c => c.index)))}>{all ? '取消全选' : '全选'}</button></div>
        <div className="brush-target-list">{candidates.map(c => {
          const selected = targets.has(c.index);
          return <label key={c.index} className={`brush-target ${selected ? 'is-picked' : ''} ${c.mixed ? 'is-unavailable' : ''}`}>
            <input type="checkbox" checked={selected} disabled={c.mixed} onChange={() => toggle(c.index)} aria-label={`选择目标评论 #${c.index}`} />
            <div className="brush-target-content"><div className="brush-target-meta"><span>#{c.index}</span>{c.mixed && <span>混合格式暂不处理</span>}</div><div className="brush-target-preview"><RichText comment={c} />{selected && <><Icon name="arrow" /><RichText comment={c} style={source.style} className="brush-after" /></>}</div></div>
          </label>;
        })}</div>
        <footer className="brush-dialog-footer"><span aria-live="polite">{targets.size ? `已选 ${targets.size} 条` : '勾选后预览样式'}</span><div><button type="button" className="secondary" onClick={() => setSource(null)}>取消</button><button type="button" className="primary" disabled={!targets.size} onClick={apply}>{targets.size ? `应用到 ${targets.size} 条评论` : '应用格式'}</button></div></footer>
      </section></div>, document.body)}
  </>;
}
createRoot(document.getElementById('root')).render(<Prototype />);
