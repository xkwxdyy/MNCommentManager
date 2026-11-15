import { useState, useRef } from 'react';
import RichCommentDialog from './RichCommentDialog';
import ActionIcon from './ActionIcon';
import HtmlSelect from './HtmlSelect';
import { richTextStyle } from './RichCommentPresentation';
import { renderMarkdownToHtml } from '../lib/markdownRenderer';
const clone = (v) => JSON.parse(JSON.stringify(v));
const validColor = (value) => value === null || /^#[\da-f]{6}$/i.test(value || '');
const MODE_OPTIONS = [
  { key: 'text', label: '普通文本' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'rich', label: '富文本' },
];
function RichSample({ text, style }) {
  const sizeNum = Number(style?.fontSize);
  const safe = {
    ...style,
    fontSize: Number.isFinite(sizeNum) && sizeNum >= 8 && sizeNum <= 96 ? sizeNum : 16,
    textColor: validColor(style?.textColor) ? style.textColor : null,
    backgroundColor: validColor(style?.backgroundColor) ? style.backgroundColor : null,
  };
  return (
    <pre className="rich-editor-sample" style={richTextStyle(safe)}>
      {text || '正文预览'}
    </pre>
  );
}
function ColorField({ name, label, value, onChange, busy }) {
  const fallback = name === 'textColor' ? '#175D62' : '#E3F2FD';
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
          className="rich-editor-icon"
          title={name === 'textColor' ? '使用默认文字颜色' : '移除背景色'}
          aria-label={name === 'textColor' ? '使用默认文字颜色' : '移除背景色'}
          disabled={busy || value === null}
          onClick={() => onChange(null)}
        >
          <ActionIcon name="close" />
        </button>
      </div>
    </div>
  );
}
export default function RichCommentEditor({ plan, onClose, onSave }) {
  const initialMode = plan.mode || 'rich';
  const [mode, setMode] = useState(initialMode),
    [text, setText] = useState(plan.text),
    [style, setStyle] = useState(clone(plan.style)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const saving = useRef(false);
  const isDirty =
    text !== plan.text ||
    mode !== initialMode ||
    (mode === 'rich' && JSON.stringify(style) !== JSON.stringify(plan.style));
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
  const dialogTitle =
    plan.index === null
      ? '新建评论'
      : mode === 'rich'
        ? '编辑富文本评论'
        : mode === 'markdown'
          ? '编辑 Markdown 评论'
          : '编辑普通文本评论';
  return (
    <RichCommentDialog
      title={dialogTitle}
      className="rich-editor-dialog"
      busy={busy}
      onClose={onClose}
      onConfirmShortcut={save}
      preventBackdropClose={isDirty}
      trigger={plan.trigger}
      footer={
        <>
          <span className="rich-editor-footer-status" aria-live="polite">
            {busy ? '正在保存…' : '⌘/Ctrl + Enter 提交'}
          </span>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy || !text.trim()} onClick={save}>
              {busy ? '正在保存…' : plan.index === null ? '添加' : '保存'}
            </button>
          </div>
        </>
      }
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
      <label className="rich-editor-label" htmlFor="rich-editor-text">
        正文
      </label>
      <textarea
        id="rich-editor-text"
        aria-label="评论正文"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        rows="5"
        maxLength={50000}
      />
      {mode === 'rich' ? (
        <>
          <div className="rich-editor-type-fields">
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
                  setStyle({
                    ...style,
                    fontSize: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              字体
              <HtmlSelect
                aria-label="字体"
                value={style.fontName}
                disabled={busy}
                onChange={(e) => setStyle({ ...style, fontName: e.target.value })}
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
        </>
      ) : null}
      <h3>预览</h3>
      <div className="rich-editor-preview" role="region" aria-label="格式预览" tabIndex="0">
        {mode === 'rich' ? (
          <RichSample text={text} style={style} />
        ) : mode === 'markdown' ? (
          <div
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(text || '正文预览') }}
          />
        ) : (
          <pre className="rich-editor-sample">{text || '正文预览'}</pre>
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
