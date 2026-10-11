import HtmlSelect from "./HtmlSelect";
import { useEffect, useMemo, useRef, useState } from 'react';
import { moduleIds, selectionState, toggleIds, moduleMovePlan, bodyMovePlan, effectiveSettings, validateSettings } from '../lib/commentModules.mjs';
import './CommentModules.css';

function IconButton({ label, children, ...props }) {
  return <button type="button" className="module-icon" title={label} aria-label={label} {...props}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg></button>;
}
function ModuleCheckbox({ label, checked, partial, ...props }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} {...props} />;
}
function Modal({ title, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input,select,button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="dialog-backdrop" onClick={() => !busy && onClose()}><section className="dialog module-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); }
    if (e.key === 'Tab') {
      const controls = [...ref.current.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(n => !n.disabled && n.tabIndex >= 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); ref.current.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}><h2>{title}</h2>{children}</section></div>;
}

export function ModuleSettingsDialog({ settings, noteId, readError, onSave, onClose }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)));
  const current = effectiveSettings(draft, noteId);
  const [scope, setScope] = useState(current.overridden ? 'card' : 'global');
  const [profileId, setProfileId] = useState(current.profile.id);
  const [includeTitle, setIncludeTitle] = useState(current.includeTitle);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const profile = draft.profiles.find(p => p.id === profileId);
  const updateProfile = patch => setDraft(value => ({ ...value, profiles: value.profiles.map(p => p.id === profileId ? { ...p, ...patch } : p) }));
  const changeScope = value => {
    setScope(value);
    const target = value === 'global' ? { profileId: draft.defaultProfileId, includeTitle: draft.includeTitle } : draft.cardOverrides[noteId] || { profileId: draft.defaultProfileId, includeTitle: draft.includeTitle };
    setProfileId(target.profileId); setIncludeTitle(target.includeTitle);
  };
  const save = async reset => {
    setBusy(true); setError('');
    try {
      const next = JSON.parse(JSON.stringify(draft));
      if (reset) delete next.cardOverrides[noteId];
      else if (scope === 'global') { next.defaultProfileId = profileId; next.includeTitle = includeTitle; }
      else next.cardOverrides[noteId] = { profileId, includeTitle };
      await onSave(validateSettings(next), settings.revision); onClose();
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };
  return <Modal title="模块划分" busy={busy} onClose={onClose}>
    <p>单卡片设置优先于全局默认。修改方案规则会影响采用该方案的其他卡片。</p>
    {readError ? <p role="alert">{readError}</p> : null}
    <label>设置范围<HtmlSelect value={scope} disabled={busy} onChange={e => changeScope(e.target.value)}><option value="global">全局默认</option><option value="card">当前卡片</option></HtmlSelect></label>
    <label>划分方案<HtmlSelect value={profileId} disabled={busy} onChange={e => setProfileId(e.target.value)}>{draft.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</HtmlSelect></label>
    <fieldset disabled={busy}><legend>方案规则</legend>
      {['html','nested','text'].includes(profile.mode) ? <><label>匹配方式<HtmlSelect value={profile.match} onChange={e => updateProfile({ match: e.target.value })}><option value="all">全部匹配</option><option value="exact">精确匹配</option><option value="prefix">前缀匹配</option><option value="contains">包含匹配</option></HtmlSelect></label>
      {profile.match !== 'all' ? <label>匹配文本<input value={profile.value} maxLength={2000} onChange={e => updateProfile({ value: e.target.value })} /></label> : null}</> : null}
      {['markdown','nested'].includes(profile.mode) ? <div className="module-levels">标题级别{[1,2,3,4,5,6].map(level => <label key={level}><input type="checkbox" checked={profile.levels.includes(level)} onChange={e => updateProfile({ levels: e.target.checked ? [...profile.levels, level].sort() : profile.levels.filter(n => n !== level) })} />H{level}</label>)}<p>兼容 HtmlMD 的 method 和 level 标记。</p></div> : null}
    </fieldset>
    <label className="module-inline-label"><input type="checkbox" checked={includeTitle} disabled={busy} onChange={e => setIncludeTitle(e.target.checked)} />整组选择包含结构标题</label>
    {scope === 'global' && draft.cardOverrides[noteId] ? <p>当前卡片已有覆盖设置，全局默认更改不会替换该覆盖。</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <div className="dialog-actions"><button disabled={busy} onClick={onClose}>取消</button>{draft.cardOverrides[noteId] ? <button disabled={busy || !!readError} onClick={() => save(true)}>恢复全局默认</button> : null}<button disabled={busy || !!readError} onClick={() => save(false)}>{busy ? '保存中…' : '保存'}</button></div>
  </Modal>;
}

export function ModuleCommentList({ tree, comments, visibleComments, matchingComments, selected, includeTitle, hidden, onHide, onSelect, loading, foldSupported, onFold, onAction, onModalOpen, children }) {
  const rows = new Map(visibleComments.map((c,i) => [c.index, children[i]]));
  const matching = useMemo(() => new Set(matchingComments.map(c => c.index)), [matchingComments]);
  // Selection changes only affect checkboxes. Structural move/fold plans and
  // comment lookups are reused until the comments or module layout changes.
  const plans = useMemo(() => {
    const byIndex = new Map(comments.map(c => [c.index, c]));
    const positions = new Map(comments.map((c, position) => [c.index, position]));
    return new Map((tree?.flat || []).map(node => {
      const ids = moduleIds(node, comments, tree.titleIds, includeTitle);
      const canMove = direction => { try { moduleMovePlan(tree, comments, node.id, direction); return true; } catch { return false; } };
      const contents = [...node.items.map(c => ({ start: positions.get(c.index), index: c.index })), ...node.children.map(child => ({ start: child.start, child }))];
      if (node.titleId !== null) contents.push({ start: node.start, index: node.titleId });
      return [node.id, {
        ids, hiddenCount: ids.filter(i => !matching.has(i)).length,
        folded: ids.length > 0 && ids.every(i => byIndex.get(i)?.collapsed === true),
        enabledFold: foldSupported && ids.length <= 200 && ids.every(i => byIndex.get(i)?.capabilities?.canSetCollapsed),
        canMoveUp: canMove('up'), canMoveDown: canMove('down'),
        hasBody: moduleIds(node, comments, tree.titleIds, false).length > 0,
        hasMatch: comments.slice(node.start, node.end).some(c => matching.has(c.index)),
        contents: contents.sort((a, b) => a.start - b.start),
      }];
    }));
  }, [tree, comments, includeTitle, matching, foldSupported]);
  const [action, setAction] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [target, setTarget] = useState(''), [title, setTitle] = useState(''), [remove, setRemove] = useState(false);
  const open = (kind,node) => { onModalOpen?.(); setAction({ kind,node }); setTitle(node.title); setRemove(false); setError(''); setTarget(''); };
  const bodyIndices = action ? moduleIds(action.node, comments, tree.titleIds, false) : [];
  const targets = action ? tree.flat.filter(node => { try { bodyMovePlan(tree,comments,bodyIndices,node.id); return true; } catch { return false; } }) : [];
  const submit = async () => {
    setBusy(true); setError('');
    try { await onAction(action.kind, { moduleId: action.node.id, indices: bodyIndices, targetId: target || targets[0]?.id, title, removeOriginal: remove }); setAction(null); }
    catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };
  const renderNode = node => {
    const { ids, hiddenCount, folded, enabledFold, canMoveUp, canMoveDown, contents, hasBody, hasMatch } = plans.get(node.id);
    const state = selectionState(ids, selected);
    const closed = hidden.has(node.id);
    return <section className="comment-module" id={node.id} key={node.id}>
      <header className="comment-module-head">
        <IconButton label={`${closed ? '显示' : '隐藏'}模块内容：${node.title}`} aria-expanded={!closed} aria-controls={`${node.id}-content`} onClick={() => onHide(node.id)}>{closed ? <path d="M3 7h7l2 2h9v11H3V7ZM3 7V4h7l2 3M8 14h8m-4-4v8" /> : <path d="M3 7V4h7l2 3h8v4M3 7h7l2 3h9l-3 10H3V7Z" />}</IconButton>
        {state.checked ? <button type="button" className="comment-fold-button module-comment-fold" aria-expanded={!folded} aria-label={`${folded ? '展开' : '折叠'}模块评论：${node.title}`} title={enabledFold ? `${folded ? '展开' : '折叠'}模块内所选评论（包含筛选隐藏成员）` : '宿主未支持折叠，或超过 200 条评论'} disabled={loading || !enabledFold} onClick={() => onFold(ids,!folded)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button> : null}
        <ModuleCheckbox label={`选择模块：${node.title}${includeTitle ? '（含标题）' : '（仅正文）'}`} checked={state.checked} partial={state.partial} disabled={loading || !ids.length} onChange={() => onSelect(toggleIds(selected,ids),hiddenCount)} />
        <strong className="comment-module-title" title={node.title}>{node.title}</strong><span className="module-count" title={`模块共 ${node.end-node.start} 条评论`}>{node.end-node.start}</span>
        {hiddenCount ? <span className="module-hidden-count" title="整组选择包含筛选隐藏成员">隐藏 {hiddenCount}</span> : null}
        <IconButton label={`上移模块：${node.title}`} disabled={loading || !canMoveUp} onClick={() => onAction('reorder',{moduleId:node.id,direction:'up'}).catch(() => {})}><path d="m7 14 5-5 5 5" /></IconButton>
        <IconButton label={`下移模块：${node.title}`} disabled={loading || !canMoveDown} onClick={() => onAction('reorder',{moduleId:node.id,direction:'down'}).catch(() => {})}><path d="m7 10 5 5 5-5" /></IconButton>
        <details className="module-menu"><summary aria-label={`模块操作：${node.title}`} title="模块操作">⋯</summary><div><button disabled={loading || !hasBody} onClick={e => { e.currentTarget.closest('details').open=false; open('body',node); }}>移动正文</button><button disabled={loading || !ids.length} onClick={e => { e.currentTarget.closest('details').open=false; open('extract',node); }}>提取为子卡片</button></div></details>
      </header>
      <div id={`${node.id}-content`} hidden={closed}>
        {closed ? null : contents.map((item,i) => item.child ? renderNode(item.child) : <div key={`row-${i}`}>{rows.get(item.index)}</div>)}
        {node.items.length === 0 && node.children.length === 0 ? <p className="module-empty">模块正文为空</p> : !hasMatch ? <p className="module-empty">当前筛选隐藏模块内容</p> : null}
      </div>
      {closed ? <p className="module-empty">模块内容已隐藏 · {node.end-node.start} 条评论</p> : null}
    </section>;
  };
  if (!tree) return <>{children}</>;
  return <>{tree.roots.map(renderNode)}{action ? <Modal title={action.kind === 'body' ? '移动模块正文' : '提取模块为子卡片'} busy={busy} onClose={() => setAction(null)}>
    {action.kind === 'body' ? <><p>移动完整正文到目标模块末尾；当前模块与子模块的结构标题保留。</p><label>目标模块<HtmlSelect value={target || targets[0]?.id || ''} disabled={busy} onChange={e => setTarget(e.target.value)}>{targets.map(n => <option key={n.id} value={n.id}>{`${'　'.repeat(n.depth)}${n.title}（#${n.start}）`}</option>)}</HtmlSelect></label>{!targets.length ? <p>没有可接收正文的其他模块。</p> : null}</> : <><label>子卡片标题<input value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label><label className="module-inline-label"><input type="checkbox" checked={remove} disabled={busy} onChange={e => setRemove(e.target.checked)} />提取后删除原内容</label><p>提取范围遵循当前标题选择设置，包含筛选隐藏成员。</p></>}
    {error ? <p role="alert">{error}</p> : null}<div className="dialog-actions"><button disabled={busy} onClick={() => setAction(null)}>取消</button><button disabled={busy || loading || (action.kind==='body' && !targets.length)} onClick={submit}>{busy ? '处理中…' : '确认'}</button></div>
  </Modal> : null}</>;
}
