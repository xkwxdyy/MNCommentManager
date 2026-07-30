import DOMPurify from "dompurify";
import katex from "katex";
import { Marked } from "marked";
import markedKatexExtension from "marked-katex-extension";

const KATEX_OPTIONS = {
  nonStandard: true,
  throwOnError: false,
  strict: "ignore",
  trust: false,
};

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true },
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ["id"],
  FORBID_TAGS: [
    "button",
    "embed",
    "form",
    "iframe",
    "input",
    "object",
    "option",
    "select",
    "style",
    "textarea",
  ],
};

const SAFE_INLINE_STYLE_PROPERTIES = [
  "background-color",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-shadow",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "text-align",
  "text-decoration",
  "text-transform",
  "top",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
];

const UNSAFE_STYLE_VALUE_PATTERN = /(?:url\s*\(|image-set\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding)/i;

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeInlineStyle(styleText) {
  const probe = document.createElement("span");
  probe.style.cssText = String(styleText || "");

  return SAFE_INLINE_STYLE_PROPERTIES.reduce((declarations, property) => {
    const value = probe.style.getPropertyValue(property).trim();
    if (!value || UNSAFE_STYLE_VALUE_PATTERN.test(value)) return declarations;
    if (property === "position" && value !== "static" && value !== "relative") return declarations;
    declarations.push(`${property}: ${value}`);
    return declarations;
  }, []).join("; ");
}

function sanitizeRenderedHtml(html) {
  const sanitizeStyle = (_node, data) => {
    if (data.attrName !== "style") return;
    const safeStyle = sanitizeInlineStyle(data.attrValue);
    if (!safeStyle) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = safeStyle;
  };

  DOMPurify.addHook("uponSanitizeAttribute", sanitizeStyle);
  try {
    return DOMPurify.sanitize(String(html || ""), SANITIZE_CONFIG);
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", sanitizeStyle);
  }
}

function createBackslashMathExtension() {
  return {
    name: "backslashKatex",
    level: "inline",
    start(source) {
      const inlineIndex = source.indexOf("\\(");
      const displayIndex = source.indexOf("\\[");
      const indices = [inlineIndex, displayIndex].filter((index) => index >= 0);
      return indices.length > 0 ? Math.min(...indices) : undefined;
    },
    tokenizer(source) {
      const inlineMatch = source.match(/^\\\(([\s\S]*?)\\\)/);
      if (inlineMatch) {
        return {
          type: "backslashKatex",
          raw: inlineMatch[0],
          text: inlineMatch[1].trim(),
          displayMode: false,
        };
      }

      const displayMatch = source.match(/^\\\[([\s\S]*?)\\\]/);
      if (!displayMatch) return undefined;
      return {
        type: "backslashKatex",
        raw: displayMatch[0],
        text: displayMatch[1].trim(),
        displayMode: true,
      };
    },
    renderer(token) {
      return katex.renderToString(token.text, {
        ...KATEX_OPTIONS,
        displayMode: token.displayMode,
      });
    },
  };
}

const renderer = {
  html(tokenOrSource) {
    const source = typeof tokenOrSource === "string" ? tokenOrSource : tokenOrSource?.text;
    return String(source || "");
  },
};

const markdownParser = new Marked(
  {
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false,
    renderer,
  },
  markedKatexExtension(KATEX_OPTIONS),
  {
    extensions: [createBackslashMathExtension()],
  },
);

export function renderMarkdownToHtml(markdown) {
  const source = String(markdown || "");
  try {
    const rendered = markdownParser.parse(source);
    return sanitizeRenderedHtml(rendered);
  } catch (_) {
    return `<pre class="markdown-render-error">${escapeHtml(source)}</pre>`;
  }
}
