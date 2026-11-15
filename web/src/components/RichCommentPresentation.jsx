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
        color: style.textColor || undefined,
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
