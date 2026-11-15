import ActionIcon from './ActionIcon';
export function FormatBrushIcon() {
  return <ActionIcon name="paintbrush" />;
}
export function RichActionIcon({ name }) {
  const paths = {
    copy: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    paste: (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5V2h6v3M9 12h6M9 16h4" />
      </>
    ),
    undo: <path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-rich-action={name}
    >
      {paths[name]}
    </svg>
  );
}
function autoContrastColor(backgroundColor) {
  if (typeof backgroundColor !== 'string' || !/^#[\da-f]{6}$/i.test(backgroundColor)) {
    return undefined;
  }
  const r = parseInt(backgroundColor.slice(1, 3), 16);
  const g = parseInt(backgroundColor.slice(3, 5), 16);
  const b = parseInt(backgroundColor.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b >= 150 ? '#1d1d1f' : '#f5f5f7';
}
export function formatStyleSummary(style) {
  if (!style) return '';
  const fontLabel =
    style.fontName === 'PingFangSC-Semibold'
      ? '苹方半粗'
      : style.fontName === 'PingFangSC-Regular'
        ? '苹方常规'
        : String(style.fontName || '默认字体').replace(/^PingFangSC-/i, '苹方 ');
  const parts = [fontLabel];
  if (Number.isFinite(Number(style.fontSize))) parts.push(`${style.fontSize}px`);
  return parts.join(' · ');
}
export function richTextStyle(style) {
  return style
    ? {
        fontFamily: style.fontName?.startsWith('PingFangSC-')
          ? '"PingFang SC", sans-serif'
          : style.fontName,
        fontWeight: /Semibold/i.test(style.fontName)
          ? 600
          : /Bold/i.test(style.fontName)
            ? 700
            : 400,
        fontSize: style.fontSize,
        color: style.textColor || autoContrastColor(style.backgroundColor),
        backgroundColor: style.backgroundColor || 'transparent',
      }
    : undefined;
}
export function RichSample({ text, style }) {
  return (
    <span className="rich-comment-sample" style={richTextStyle(style)}>
      {text}
    </span>
  );
}
