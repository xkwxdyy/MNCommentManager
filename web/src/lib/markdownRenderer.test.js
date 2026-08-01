// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./markdownRenderer";

describe("renderMarkdownToHtml", () => {
  it("renders common Markdown blocks and inline formatting", () => {
    const html = renderMarkdownToHtml([
      "## 标题",
      "",
      "正文包含 **粗体**、`code`。",
      "",
      "> 引用",
      "",
      "- 第一项",
      "- 第二项",
    ].join("\n"));

    expect(html).toContain("<h2>标题</h2>");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ul>");
  });

  it.each([
    ["single-dollar", "行内 $E=mc^2$ 公式"],
    ["double-dollar", "$$x^2+y^2=z^2$$"],
    ["parentheses", String.raw`行内 \(a+b\) 公式`],
    ["brackets", String.raw`\[\int_0^1 x^2\,dx\]`],
  ])("renders %s math delimiters with KaTeX", (_, source) => {
    const html = renderMarkdownToHtml(source);
    expect(html).toContain("class=\"katex\"");
    expect(html).toContain("katex-html");
    expect(html).toContain("katex-mathml");
  });

  it("preserves KaTeX layout styles through inline-style sanitization", () => {
    const html = renderMarkdownToHtml(String.raw`$\frac{x^2}{1+x}$`);
    const container = document.createElement("div");
    container.innerHTML = html;
    const styledNodes = Array.from(container.querySelectorAll(".katex [style]"));

    expect(styledNodes.length).toBeGreaterThan(0);
    expect(styledNodes.some((node) => node.style.height || node.style.verticalAlign)).toBe(true);
  });

  it("renders generic HTML without application-specific type mapping", () => {
    const html = renderMarkdownToHtml(
      '<span id="check" style="font-weight:600;color:#34A853;background:#E6F7EE;border:2px solid #34A853;border-radius:4px;padding:4px 8px;display:inline-block;box-shadow:0 1px 2px rgba(52,168,83,0.2);margin:0 2px;line-height:1.3;vertical-align:baseline;position:relative" onclick="alert(1)">🔍 CHECK **普通用户内容**</span>',
    );

    const container = document.createElement("div");
    container.innerHTML = html;
    const span = container.querySelector("span");

    expect(span).not.toBeNull();
    expect(span.textContent).toContain("🔍 CHECK 普通用户内容");
    expect(span.querySelector("strong")?.textContent).toBe("普通用户内容");
    expect(span.id).toBe("");
    expect(span.getAttribute("onclick")).toBeNull();
    expect(span.style.fontWeight).toBe("600");
    expect(span.style.color).toBe("rgb(52, 168, 83)");
    expect(span.style.backgroundColor).toBe("rgb(230, 247, 238)");
    expect(span.style.borderTopWidth).toBe("2px");
    expect(span.style.borderRadius).toBe("4px");
    expect(span.style.paddingTop).toBe("4px");
    expect(span.style.paddingRight).toBe("8px");
    expect(span.style.display).toBe("inline-block");
    expect(span.style.position).toBe("relative");
    expect(html).not.toContain("htmlmd-");
  });

  it("sanitizes generic HTML, inline styles, and unsafe URLs", () => {
    const html = renderMarkdownToHtml([
      '<script>alert("x")</script>',
      '<img src="x" onerror="alert(1)">',
      '<form action="https://example.com"><input autofocus><button>提交</button></form>',
      '<span id="unknown" onclick="alert(1)" style="color:red;position:fixed;inset:0;background-image:url(javascript:alert(1))">未知类型</span>',
      '[危险链接](javascript:alert(1))',
    ].join("\n"));

    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("form, input, button")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("#unknown")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    const span = Array.from(container.querySelectorAll("span"))
      .find((element) => element.textContent === "未知类型");
    expect(span).toBeDefined();
    expect(span.style.color).toBe("red");
    expect(span.style.position).toBe("");
    expect(span.style.backgroundImage).toBe("");
  });

  it("preserves MarginNote card URLs for in-panel locating", () => {
    const noteId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    const html = renderMarkdownToHtml(`[目标卡片](marginnote4app://note/${noteId})`);
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("a")?.getAttribute("href"))
      .toBe(`marginnote4app://note/${noteId}`);
  });

  it("falls back to readable output for malformed formulas", () => {
    const source = String.raw`未闭合公式 \(x^2 + 1`;
    expect(() => renderMarkdownToHtml(source)).not.toThrow();
    expect(renderMarkdownToHtml(source)).toContain("未闭合公式");
  });

  it("does not require String.prototype.replaceAll", () => {
    const originalReplaceAll = String.prototype.replaceAll;
    try {
      String.prototype.replaceAll = undefined;
      const html = renderMarkdownToHtml('<unknown data-value="x">正文</unknown>');
      expect(html).toContain("正文");
      expect(html).not.toContain("<unknown");
    } finally {
      String.prototype.replaceAll = originalReplaceAll;
    }
  });
});
