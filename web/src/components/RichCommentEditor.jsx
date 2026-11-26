import { useEffect, useRef, useState } from 'react';
import RichCommentDialog from './RichCommentDialog';
import HtmlSelect from './HtmlSelect';
import { richTextStyle, sameRichStyle } from './RichCommentPresentation';
import { renderMarkdownToHtml } from '../lib/markdownRenderer';
const clone = (v) => JSON.parse(JSON.stringify(v));
const validColor = (value) => value === null || /^#[\da-f]{6}$/i.test(value || '');
const MODE_OPTIONS = [
  { key: 'text', label: '普通文本' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'rich', label: '富文本' },
];
const PREVIEW_PLACEHOLDER = '输入正文后在这里预览';
// What happens to the existing comment when it is saved under another type.
const CONVERSION_NOTES = {
  'rich>text': '保存后将移除字号、字体和颜色，只保留正文。',
  'rich>markdown': '保存后将移除字号、字体和颜色，正文按 Markdown 显示。',
  'markdown>rich': 'Markdown 标记已转为显示文字，富文本不保留标题、加粗等语法。',
  'markdown>text': '保存后将直接显示 Markdown 原文，不再渲染。',
  'text>markdown': '保存后正文将按 Markdown 渲染。',
  'text>rich': '保存后将转为富文本评论，可设置字号、字体和颜色。',
};
const STYLE_SOURCE_NOTES = {
  clipboard: '已套用复制的格式',
  recent: '沿用上次使用的格式',
};
function RichSample({ text, style }) {
  const sizeNum = Number(style?.fontSize);
  const safe = {
    ...style,
    fontSize: Number.isFinite(sizeNum) && sizeNum >= 8 && sizeNum <= 96 ? sizeNum : 16,
    textColor: validColor(style?.textColor) ? style.textColor : null,
    backgroundColor: validColor(style?.backgroundColor) ? style.backgroundColor : null,
  };
  return (
    <pre
      className={`rich-editor-sample ${text ? '' : 'is-placeholder'}`}
      style={richTextStyle(safe)}
    >
      {text || PREVIEW_PLACEHOLDER}
    </pre>
  );
}
function ColorField({ name, label, value, onChange, busy }) {
  const fallback = name === 'textColor' ? '#175D62' : '#E3F2FD';
  const resetLabel = name === 'textColor' ? '使用默认文字颜色' : '移除背景色';
  return (
    <div className="rich-editor-color-field">
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
          className="ghost rich-editor-reset"
          title={resetLabel}
          aria-label={resetLabel}
          disabled={busy || value === null}
          onClick={() => onChange(null)}
        >
          {name === 'textColor' ? '默认' : '透明'}
        </button>
      </div>
    </div>
  );
}
export default function RichCommentEditor({ plan, clipboard, onClose, onSave }) {
  const initialMode = plan.mode || 'rich';
  const [mode, setMode] = useState(initialMode),
    [text, setText] = useState(plan.text),
    [style, setStyle] = useState(clone(plan.style)),
    [styleNote, setStyleNote] = useState(STYLE_SOURCE_NOTES[plan.styleSource] || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmDiscard, setConfirmDiscard] = useState(false);
  const saving = useRef(false),
    keepEditingRef = useRef(null),
    textRef = useRef(null),
    discardShown = useRef(false);
  const isNew = plan.index === null;
  const isDirty =
    text !== plan.text ||
    mode !== initialMode ||
    (mode === 'rich' && JSON.stringify(style) !== JSON.stringify(plan.style));
  const conversionNote =
    plan.originalKind && plan.originalKind !== mode
      ? CONVERSION_NOTES[`${plan.originalKind}>${mode}`] || ''
      : '';
  const canApplyClipboard =
    mode === 'rich' && !!clipboard?.style && !sameRichStyle(style, clipboard.style);
  useEffect(() => {
    // The dialog focuses the body first; continue typing after the existing text.
    const el = textRef.current;
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    if (confirmDiscard) {
      discardShown.current = true;
      keepEditingRef.current?.focus();
    } else if (discardShown.current) {
      discardShown.current = false;
      textRef.current?.focus();
    }
  }, [confirmDiscard]);
  function requestClose() {
    if (busy) return;
    if (isDirty) setConfirmDiscard(true);
    else onClose();
  }
  function handleEscape() {
    // A second Escape answers the discard prompt with the safe choice.
    if (confirmDiscard) setConfirmDiscard(false);
    else requestClose();
  }
  function updateStyle(patch) {
    setStyle((old) => ({ ...old, ...patch }));
    setStyleNote('');
  }
  function handleModeChange(nextMode) {
    if (busy || nextMode === mode) return;
    if (
      plan.originalKind === 'markdown' &&
      plan.rawText &&
      plan.plainText &&
      nextMode === 'rich' &&
      text === plan.rawText
    ) {
      setText(plan.plainText);
    } else if (
      plan.originalKind === 'markdown' &&
      plan.rawText &&
      plan.plainText &&
      nextMode === 'markdown' &&
      text === plan.plainText
    ) {
      setText(plan.rawText);
    }
    setMode(nextMode);
    setError('');
  }
  async function save() {
    if (saving.current || !text.trim()) return;
    if (mode === 'rich') {
      const sizeNum = Number(style.fontSize);
      if (style.fontSize === '' || !Number.isFinite(sizeNum) || sizeNum < 8 || sizeNum > 96) {
        setError('字号应为 8 至 96');
        return;
      }
      if (!validColor(style.textColor) || !validColor(style.backgroundColor)) {
        setError('颜色应为 #RRGGBB 格式，例如 #E3F2FD');
        return;
      }
    }
    saving.current = true;
    setError('');
    setConfirmDiscard(false);
    setBusy(true);
    try {
      await onSave(text, style, mode);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const submitLabel = isNew ? '添加' : '保存';
  const footer = confirmDiscard ? (
    <>
      <span className="rich-editor-footer-status is-warning" role="alert">
        修改尚未保存，确定放弃吗？
      </span>
      <div>
        <button className="secondary" ref={keepEditingRef} onClick={() => setConfirmDiscard(false)}>
          继续编辑
        </button>
        <button className="danger rich-editor-discard" onClick={onClose}>
          放弃修改
        </button>
      </div>
    </>
  ) : (
    <>
      <span className="rich-editor-footer-status" aria-live="polite">
        {busy
          ? '正在保存…'
          : !text.trim()
            ? '请输入正文'
            : `⌘/Ctrl + Enter ${submitLabel}`}
      </span>
      <div>
        <button className="secondary" disabled={busy} onClick={requestClose}>
          取消
        </button>
        <button className="primary" disabled={busy || !text.trim()} onClick={save}>
          {busy ? '正在保存…' : submitLabel}
        </button>
      </div>
    </>
  );
  return (
    <RichCommentDialog
      title={isNew ? '新建评论' : `编辑评论 #${plan.index}`}
      className="rich-editor-dialog"
      busy={busy}
      onClose={requestClose}
      onEscape={handleEscape}
      onConfirmShortcut={save}
      trigger={plan.trigger}
      footer={footer}
    >
      <div className="rich-editor-mode-tabs" role="group" aria-label="评论类型">
        {MODE_OPTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={mode === item.key ? 'active' : ''}
            aria-pressed={mode === item.key}
            disabled={busy}
            onClick={() => handleModeChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {conversionNote ? (
        <p className="rich-editor-note" role="status">
          {conversionNote}
        </p>
      ) : null}
      <label className="rich-editor-label" htmlFor="rich-editor-text">
        正文
      </label>
      <textarea
        id="rich-editor-text"
        ref={textRef}
        aria-label="评论正文"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        rows="4"
        maxLength={50000}
        placeholder={mode === 'markdown' ? '支持 Markdown 语法' : '输入评论正文'}
      />
      {mode === 'rich' ? (
        <section className="rich-editor-format" aria-label="文字格式">
          <div className="rich-editor-section-head">
            <h3>格式</h3>
            {styleNote ? <span className="rich-editor-style-note">{styleNote}</span> : null}
            {canApplyClipboard ? (
              <button
                type="button"
                className="ghost rich-editor-use-clipboard"
                title={`套用从「${clipboard.noteTitle || '评论'}」复制的格式`}
                disabled={busy}
                onClick={() => {
                  setStyle(clone(clipboard.style));
                  setStyleNote(STYLE_SOURCE_NOTES.clipboard);
                }}
              >
                套用复制的格式
              </button>
            ) : null}
          </div>
          <div className="rich-editor-type-fields">
            <label>
              <span>字号</span>
              <input
                type="number"
                aria-label="字号"
                min="8"
                max="96"
                value={style.fontSize}
                disabled={busy}
                onChange={(e) =>
                  updateStyle({ fontSize: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>字体</span>
              <HtmlSelect
                aria-label="字体"
                value={style.fontName}
                disabled={busy}
                onChange={(e) => updateStyle({ fontName: e.target.value })}
              >
                {!['PingFangSC-Regular', 'PingFangSC-Semibold'].includes(style.fontName) && (
                  <option value={style.fontName}>{style.fontName}</option>
                )}
                <option value="PingFangSC-Regular">苹方 · 常规</option>
                <option value="PingFangSC-Semibold">苹方 · 半粗体</option>
              </HtmlSelect>
            </label>
          </div>
          <div className="rich-editor-colors">
            <ColorField
              name="textColor"
              label="文字颜色"
              value={style.textColor}
              busy={busy}
              onChange={(value) => updateStyle({ textColor: value })}
            />
            <ColorField
              name="backgroundColor"
              label="背景颜色"
              value={style.backgroundColor}
              busy={busy}
              onChange={(value) => updateStyle({ backgroundColor: value })}
            />
          </div>
        </section>
      ) : null}
      <h3>预览</h3>
      <div className="rich-editor-preview" role="region" aria-label="格式预览" tabIndex="0">
        {mode === 'rich' ? (
          <RichSample text={text} style={style} />
        ) : mode === 'markdown' && text ? (
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(text) }}
          />
        ) : (
          <pre className={`rich-editor-sample ${text ? '' : 'is-placeholder'}`}>
            {text || PREVIEW_PLACEHOLDER}
          </pre>
        )}
      </div>
      {error && (
        <p className="rich-editor-error" role="alert">
          {error}
        </p>
      )}
    </RichCommentDialog>
  );
}
