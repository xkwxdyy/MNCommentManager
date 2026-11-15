import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import App from '../../src/App';
import MNBridge from '../../src/lib/mnBridge';
import { FormatBrushIcon, richTextStyle } from '../../src/components/FormatBrushDialog';
import { renderMarkdownToHtml } from '../../src/lib/markdownRenderer';
import { createStore, targetState } from './model.mjs';
import 'katex/dist/katex.min.css';
import '../../src/styles.css';
import '../../src/components/PanelControls.css';
import './prototype.css';
const store = createStore(),
  clone = (v) => JSON.parse(JSON.stringify(v));
const delay = () => new Promise((resolve) => setTimeout(resolve, 160));
let activeModalKey = null;
document.addEventListener('keydown', (event) => activeModalKey?.(event), true);
function Icon({ name }) {
  const p = {
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />
      </>
    ),
    paste: (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5V2h6v3M9 12h6M9 16h4" />
      </>
    ),
    add: <path d="M12 4v16M4 12h16" />,
    undo: <path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12" />,
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 2 9M3 4v6h6" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p[name]}
    </svg>
  );
}
function Modal({ title, busy, onClose, trigger, children, footer, wide = false }) {
  const ref = useRef(null),
    busyRef = useRef(busy),
    closeRef = useRef(onClose);
  busyRef.current = busy;
  closeRef.current = onClose;
  useEffect(() => {
    const previous = trigger || document.activeElement,
      previousRow = previous?.closest('[data-comment-index]')?.id;
    ref.current.querySelector('textarea,button,input')?.focus();
    const key = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (e.key === 'Tab') {
        const all = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = all[0],
          last = all[all.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (!ref.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    activeModalKey = key;
    return () => {
      if (activeModalKey === key) activeModalKey = null;
      const next = previous?.isConnected
        ? previous
        : document.getElementById(previousRow) || document.querySelector('.rich-demo-add');
      next?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="rich-demo-backdrop"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`rich-demo-dialog ${wide ? 'is-wide' : ''}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rich-demo-dialog-title"
        aria-busy={busy}
      >
        <header>
          <h2 id="rich-demo-dialog-title">{title}</h2>
          <button
            type="button"
            className="rich-demo-icon"
            title="关闭（Esc）"
            aria-label="关闭对话框"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="rich-demo-dialog-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>,
    document.body,
  );
}
const validColor = (value) => value === null || /^#[\da-f]{6}$/i.test(value || '');
function RichSample({ text, style }) {
  const safe = {
    ...style,
    textColor: validColor(style?.textColor) ? style.textColor : null,
    backgroundColor: validColor(style?.backgroundColor) ? style.backgroundColor : null,
  };
  return (
    <pre
      className="rich-demo-sample"
      style={{
        ...richTextStyle(safe),
        fontFamily: 'var(--font-ui)',
        fontWeight: style?.fontName?.includes('Semibold') ? 600 : 400,
      }}
    >
      {text || '正文预览'}
    </pre>
  );
}
function ColorField({ name, label, value, onChange, busy }) {
  const fallback = name === 'textColor' ? '#175D62' : '#E3F2FD';
  return (
    <div className="rich-demo-color-field">
      <label htmlFor={`rich-${name}`}>{label}</label>
      <div>
        <input
          type="color"
          aria-label={`${label}取色`}
          value={value && validColor(value) ? value : fallback}
          disabled={busy}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input
          id={`rich-${name}`}
          aria-label={label}
          value={value || ''}
          placeholder={name === 'textColor' ? '默认' : '透明'}
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          aria-invalid={!validColor(value)}
        />
        <button
          type="button"
          className="rich-demo-icon"
          title={name === 'textColor' ? '恢复默认文字色' : '取消背景色'}
          aria-label={name === 'textColor' ? '恢复默认文字色' : '取消背景色'}
          disabled={busy || value === null}
          onClick={() => onChange(null)}
        >
          <Icon name="reset" />
        </button>
      </div>
    </div>
  );
}
function Editor({ plan, onClose, notice }) {
  const [text, setText] = useState(plan.text),
    [style, setStyle] = useState(clone(plan.style)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await delay();
      const changed = store.save(plan, text, style);
      notice(changed ? '富文本已保存' : '内容与样式没有变化');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={plan.index === null ? '新增原生富文本' : '编辑原生富文本'}
      busy={busy}
      onClose={onClose}
      trigger={plan.trigger}
      footer={
        <>
          <span className="rich-demo-footer-status" aria-live="polite">
            {busy ? '正在保存…' : ''}
          </span>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy || !text.trim()} onClick={save}>
              {busy ? '正在保存…' : '保存'}
            </button>
          </div>
        </>
      }
    >
      <label className="rich-demo-label" htmlFor="rich-demo-text">
        正文
      </label>
      <textarea
        id="rich-demo-text"
        aria-label="富文本正文"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        rows="5"
      />
      <div className="rich-demo-type-fields">
        <label>
          字号
          <input
            type="number"
            aria-label="字号"
            min="8"
            max="96"
            value={style.fontSize}
            disabled={busy}
            onChange={(e) =>
              setStyle({ ...style, fontSize: e.target.value === '' ? '' : Number(e.target.value) })
            }
          />
        </label>
        <label>
          字重
          <select
            aria-label="字重"
            value={style.fontName}
            disabled={busy}
            onChange={(e) => setStyle({ ...style, fontName: e.target.value })}
          >
            <option value="PingFangSC-Regular">常规</option>
            <option value="PingFangSC-Semibold">半粗体</option>
          </select>
        </label>
      </div>
      <div className="rich-demo-colors">
        <ColorField
          name="textColor"
          label="文字颜色"
          value={style.textColor}
          busy={busy}
          onChange={(value) => setStyle({ ...style, textColor: value })}
        />
        <ColorField
          name="backgroundColor"
          label="背景颜色"
          value={style.backgroundColor}
          busy={busy}
          onChange={(value) => setStyle({ ...style, backgroundColor: value })}
        />
      </div>
      <h3>预览</h3>
      <div className="rich-demo-preview" role="region" aria-label="富文本预览" tabIndex="0">
        <RichSample text={text} style={style} />
      </div>
      {error && (
        <p className="rich-demo-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
function Paste({ initial, onClose, notice }) {
  const { plan, indices, trigger } = initial;
  const [selected, setSelected] = useState(
      new Set(indices.filter((i) => plan.targets[i]?.eligible)),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const available = plan.targets.filter((t) => t.eligible),
    all = available.length > 0 && selected.size === available.length;
  async function apply() {
    if (busy || !selected.size) return;
    setBusy(true);
    setError('');
    try {
      await delay();
      const changed = store.paste(plan, [...selected]);
      notice(changed ? '格式已粘贴，评论已刷新' : '所选评论已具有相同格式');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="粘贴格式"
      busy={busy}
      onClose={onClose}
      trigger={trigger}
      wide
      footer={
        <>
          <span aria-live="polite">已选 {selected.size} 条</span>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy || !selected.size} onClick={apply}>
              {busy ? '正在应用…' : `应用到 ${selected.size} 条评论`}
            </button>
          </div>
        </>
      }
    >
      <div className="rich-demo-source">
        <div>
          <strong>已复制的格式</strong>
          <span>{plan.source.sourceCard}</span>
        </div>
        <RichSample text={plan.source.sourceText} style={plan.source.style} />
      </div>
      <div className="rich-demo-target-heading">
        <h3>目标评论</h3>
        <button
          className="ghost"
          disabled={busy || !available.length}
          onClick={() => setSelected(all ? new Set() : new Set(available.map((t) => t.index)))}
        >
          {all ? '取消全选' : '全选可用评论'}
        </button>
      </div>
      <div className="rich-demo-targets">
        {plan.targets.length === 0 ? (
          <p className="muted">当前卡片没有评论，可先新增富文本。</p>
        ) : (
          plan.targets.map((t) => (
            <article
              key={t.key}
              className={`rich-demo-target ${selected.has(t.index) ? 'is-selected' : ''} ${!t.eligible ? 'is-disabled' : ''}`}
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`粘贴到评论 #${t.index}`}
                  disabled={busy || !t.eligible}
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
                  {{ html: 'HTML', markdown: 'Markdown', text: '文字' }[t.kind] || '媒体'}
                  {t.converted && t.eligible ? ' → 原生 HTML' : ''}
                </span>
                {!t.eligible && <small>{t.reason}</small>}
              </label>
              <div className="rich-demo-compare">
                <div>
                  <span className="rich-demo-compare-label">当前</span>
                  {t.kind === 'markdown' && t.eligible ? (
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(t.text) }}
                    />
                  ) : (
                    <RichSample text={t.text} style={t.style} />
                  )}
                </div>
                {t.eligible && selected.has(t.index) && (
                  <div>
                    <span className="rich-demo-compare-label">应用后</span>
                    <RichSample text={t.afterText} style={plan.source.style} />
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {error && (
        <p className="rich-demo-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
MNBridge.send = async (command, payload = {}) => {
  if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return store.snapshot();
  if (command === 'getActionButtonSettings') return {};
  if (command === 'listWorkflows') return [];
  if (command === 'getAddonUpdateState') return { status: 'idle', version: '交互原型' };
  if (command === 'deleteContentSelection' || command === 'deleteComments') {
    store.remove(payload.indices || payload.selection?.commentIndices || []);
    return { snapshot: store.snapshot() };
  }
  if (command === 'moveContentSelection' || command === 'moveComments') {
    store.move(
      payload.indices || payload.selection?.commentIndices || [],
      payload.targetIndex ?? payload.insertIndex ?? 0,
    );
    return { snapshot: store.snapshot() };
  }
  if (command === 'editCommentText') {
    store.editText(payload.index, payload.text);
    return { snapshot: store.snapshot() };
  }
  throw Error('该操作未包含在本次富文本原型中');
};
function Prototype() {
  const [version, setVersion] = useState(0),
    [mounts, setMounts] = useState([]),
    [editor, setEditor] = useState(null),
    [paste, setPaste] = useState(null),
    [message, setMessage] = useState('');
  const modalRef = useRef(false);
  modalRef.current = !!editor || !!paste;
  const notice = (text) => setMessage(text);
  function edit(index, trigger) {
    try {
      setEditor({ ...store.draft(index), trigger });
    } catch (e) {
      notice(e.message);
    }
  }
  function openPaste(indices = [], trigger = document.activeElement) {
    try {
      setPaste({ plan: store.pastePlan(), indices, trigger });
    } catch (e) {
      notice(e.message);
    }
  }
  useEffect(
    () =>
      store.subscribe(({ changed }) => {
        setVersion((v) => v + 1);
        if (changed)
          window.__MNCommentManagerNativeSync?.({
            snapshot: store.snapshot(),
            reason: 'prototype-rich-text',
          });
      }),
    [],
  );
  useEffect(() => {
    let frame;
    const update = () => {
      const next = [];
      document.querySelectorAll('.comment-card[data-comment-index]').forEach((row) => {
        const index = Number(row.dataset.commentIndex),
          head = row.querySelector('.comment-head');
        if (!head) return;
        const brush = head.querySelector('.format-brush-button');
        if (row.classList.contains('comment-kind-html'))
          row.querySelector('.comment-body')?.setAttribute('title', '双击编辑原生富文本');
        if (brush) {
          if (!brush.disabled) brush.title = '复制格式';
          brush.setAttribute('aria-label', `复制评论 #${index} 的格式`);
        }
        let target = head.querySelector('[data-rich-demo-actions]');
        if (!target) {
          target = document.createElement('span');
          target.dataset.richDemoActions = 'true';
          target.className = 'rich-demo-row-actions';
          const after = brush || head.querySelector('.type-pill');
          if (after) after.insertAdjacentElement('afterend', target);
          else head.append(target);
        }
        next.push({ index, node: target });
      });
      setMounts((old) =>
        old.length === next.length &&
        old.every((m, i) => m.index === next[i].index && m.node === next[i].node)
          ? old
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector('.rich-demo-panel'), {
      childList: true,
      subtree: true,
    });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const click = (e) => {
      if (modalRef.current) return;
      const brush = e.target.closest('.format-brush-button');
      if (brush) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
          const index = Number(brush.closest('[data-comment-index]').dataset.commentIndex);
          store.copy(index);
          notice('格式已复制，可切换卡片后粘贴');
        } catch (error) {
          notice(error.message);
        }
        return;
      }
      const action = e.target.closest('.selection-actions-panel button');
      if (action?.textContent === '格式刷') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const selected = [
          ...document.querySelectorAll('.comment-card.selected[data-comment-index]'),
        ];
        if (selected.length === 1) {
          try {
            store.copy(Number(selected[0].dataset.commentIndex));
            const trigger = document.getElementById('selection-actions-toggle');
            document.querySelector('.selection-actions-close')?.click();
            openPaste([], trigger);
          } catch (error) {
            notice(error.message);
          }
        }
      }
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, []);
  useEffect(() => {
    const dblclick = (e) => {
      if (modalRef.current || e.target.closest('button,input,select,textarea')) return;
      const row = e.target.closest('.comment-card[data-comment-index]');
      if (!row) return;
      const index = Number(row.dataset.commentIndex),
        comment = store.card.comments[index];
      if (comment?.kind === 'html' && targetState(comment).supported) {
        e.preventDefault();
        e.stopImmediatePropagation();
        edit(index, row);
      }
    };
    document.addEventListener('dblclick', dblclick, true);
    return () => document.removeEventListener('dblclick', dblclick, true);
  }, []);
  const card = store.card,
    clipboard = store.clipboard,
    blocked = !!editor || !!paste;
  return (
    <div className="rich-demo-shell" data-revision={version}>
      <section className="rich-demo-toolbar" aria-label="原型导航">
        <div className="rich-demo-toolbar-title">
          <strong>原生富文本 · 交互原型</strong>
          <span>示例数据 · 刷新页面后重置</span>
        </div>
        <div className="rich-demo-tabs" role="tablist" aria-label="示例卡片">
          {store.cards.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === card.id}
              disabled={blocked}
              onClick={() => {
                store.switchCard(c.id);
                notice('');
              }}
            >
              {c.tab}
            </button>
          ))}
        </div>
        <div className="rich-demo-global-actions">
          <button
            type="button"
            className="rich-demo-add"
            disabled={blocked}
            title="新增原生富文本"
            onClick={(e) => edit(null, e.currentTarget)}
          >
            <Icon name="add" />
            新增
          </button>
          <button
            type="button"
            className="rich-demo-icon"
            disabled={blocked || !store.undoLabel}
            aria-label="撤销最近操作"
            title={store.undoLabel || '没有可撤销操作'}
            onClick={() => {
              store.undo();
              notice('已恢复原类型、正文与格式');
            }}
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="rich-demo-icon"
            disabled={blocked}
            title="重置全部示例"
            aria-label="重置全部示例"
            onClick={() => location.reload()}
          >
            <Icon name="reset" />
          </button>
        </div>
      </section>
      <section
        className={`rich-demo-clipboard ${clipboard ? 'has-format' : ''}`}
        aria-label="格式剪贴板"
      >
        <div>
          {clipboard ? (
            <>
              <FormatBrushIcon />
              <span>
                已复制「
                {clipboard.sourceText.length > 12
                  ? clipboard.sourceText.slice(0, 12) + '…'
                  : clipboard.sourceText}
                」格式
              </span>
              <span
                className="rich-demo-color-dot"
                style={{ background: clipboard.style.textColor || 'transparent' }}
                title={`文字 ${clipboard.style.textColor || '默认'}`}
              />
              <span
                className="rich-demo-color-dot"
                style={{ background: clipboard.style.backgroundColor || 'transparent' }}
                title={`背景 ${clipboard.style.backgroundColor || '透明'}`}
              />
            </>
          ) : (
            <span>点击 HTML 旁的格式刷图标复制格式</span>
          )}
        </div>
        {clipboard && (
          <div>
            <button
              className="ghost"
              disabled={blocked || !card.comments.length}
              onClick={(e) => openPaste([], e.currentTarget)}
            >
              <Icon name="paste" />
              批量粘贴
            </button>
            <button
              className="rich-demo-icon"
              disabled={blocked}
              aria-label="清除已复制格式"
              title="清除已复制格式"
              onClick={() => store.clearClipboard()}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
      </section>
      <div className="rich-demo-panel">
        <App />
      </div>
      <p className="rich-demo-notice" aria-live="polite">
        {message || '原型不连接 MarginNote，也不修改真实评论。'}
      </p>
      {mounts.map(({ index, node }) => {
        const c = card.comments[index];
        if (!c) return null;
        const state = targetState(c);
        return createPortal(
          <>
            {c.kind === 'html' && (
              <button
                type="button"
                className="quick-action-btn rich-demo-edit"
                disabled={!state.supported}
                aria-label={`编辑富文本评论 #${index}`}
                title={state.supported ? '编辑正文与颜色' : state.reason}
                onClick={(e) => {
                  e.stopPropagation();
                  edit(index, e.currentTarget);
                }}
              >
                <Icon name="edit" />
              </button>
            )}
            {clipboard && (
              <button
                type="button"
                className="quick-action-btn rich-demo-paste"
                disabled={!state.supported}
                aria-label={`粘贴格式到评论 #${index}`}
                title={
                  state.supported
                    ? c.kind === 'html'
                      ? '粘贴格式'
                      : '粘贴格式并转为原生 HTML'
                    : state.reason
                }
                onClick={(e) => {
                  e.stopPropagation();
                  openPaste([index], e.currentTarget);
                }}
              >
                <Icon name="paste" />
              </button>
            )}
          </>,
          node,
        );
      })}
      {editor && <Editor plan={editor} onClose={() => setEditor(null)} notice={notice} />}
      {paste && <Paste initial={paste} onClose={() => setPaste(null)} notice={notice} />}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Prototype />);
