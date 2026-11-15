import { useState, useRef } from 'react';
import RichCommentDialog from './RichCommentDialog';
import ActionIcon from './ActionIcon';
import HtmlSelect from './HtmlSelect';
import { richTextStyle } from './RichCommentPresentation';
const clone = (v) => JSON.parse(JSON.stringify(v));
const validColor = (value) => value === null || /^#[\da-f]{6}$/i.test(value || '');
function RichSample({ text, style }) {
  const safe = {
    ...style,
    textColor: validColor(style?.textColor) ? style.textColor : null,
    backgroundColor: validColor(style?.backgroundColor) ? style.backgroundColor : null,
  };
  return (
    <pre
      className="rich-editor-sample"
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
  const [text, setText] = useState(plan.text),
    [style, setStyle] = useState(clone(plan.style)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const saving = useRef(false);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setError('');
    setBusy(true);
    try {
      await onSave(text, style);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <RichCommentDialog
      title={plan.index === null ? '添加 HTML 评论' : '编辑 HTML 评论'}
      className="rich-editor-dialog"
      busy={busy}
      onClose={onClose}
      trigger={plan.trigger}
      footer={
        <>
          <span className="rich-editor-footer-status" aria-live="polite">
            {busy ? '正在保存…' : ''}
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
              setStyle({ ...style, fontSize: e.target.value === '' ? '' : Number(e.target.value) })
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
      <h3>预览</h3>
      <div className="rich-editor-preview" role="region" aria-label="格式预览" tabIndex="0">
        <RichSample text={text} style={style} />
      </div>
      {error && (
        <p className="rich-editor-error" role="alert">
          {error}
        </p>
      )}
    </RichCommentDialog>
  );
}
