const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "web", "src", "App.jsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "web", "src", "styles.css"), "utf8");

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let templateDepth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote === "`" && char === "$" && next === "{") { templateDepth += 1; depth += 1; index += 1; continue; }
      if (quote === "`" && char === "}" && templateDepth > 0) { templateDepth -= 1; depth -= 1; continue; }
      if (char === quote && templateDepth === 0) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") { depth -= 1; if (depth === 0) return index; }
  }
  throw new Error(`No matching brace at ${openIndex}`);
}

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const open = app.indexOf("{", start);
  const close = matchingBrace(app, open);
  return app.slice(start, close + 1);
}

const context = vm.createContext({ String, RegExp });
vm.runInContext([
  extractFunction("makeEmptySnapshot"),
  extractFunction("snapshotViewState"),
  extractFunction("clampText"),
  extractFunction("isTextPreviewTruncated"),
  "this.snapshotViewState = snapshotViewState; this.clampText = clampText; this.isTextPreviewTruncated = isTextPreviewTruncated;",
].join("\n"), context);

assert.deepStrictEqual(JSON.parse(JSON.stringify(context.snapshotViewState({ noteId: "N", error: "stale warning" }))), { phase: "ready", error: "" }, "usable snapshots must remain visible even if Native also supplies a warning");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.snapshotViewState({ noteId: "", error: "没有读取到当前卡片，请先选中一张卡片" }))), { phase: "unselected", error: "没有读取到当前卡片，请先选中一张卡片" });
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.snapshotViewState({ noteId: "", error: "数据库读取失败" }))), { phase: "error", error: "数据库读取失败" });
assert.strictEqual(context.isTextPreviewTruncated("12345", 4), true);
assert.strictEqual(context.isTextPreviewTruncated("1234", 4), false);
assert.strictEqual(context.clampText("12345", 4), "1234...");

const selectionStart = app.indexOf("function SelectionCheckbox(");
const selectionEnd = app.indexOf("\nfunction PlainTextPreview", selectionStart);
const selectionSource = app.slice(selectionStart, selectionEnd);
assert.ok(selectionSource.includes('className="selection-checkbox"'));
assert.ok(selectionSource.includes('type="checkbox"'));
assert.ok(selectionSource.includes('aria-label={label}'));
assert.ok(selectionSource.includes('onClick={(event) => event.stopPropagation()}'), "checkbox hit-area clicks must not also toggle the card");
assert.ok(selectionSource.includes('onKeyDown={(event) => event.stopPropagation()}'), "checkbox keyboard input must not bubble into the card keyboard shortcut");
assert.strictEqual((app.match(/<SelectionCheckbox/g) || []).length, 2, "excerpt and comment rows must share the same reliable selection control");
assert.ok(app.includes('label={excerptSelected ? "取消选择原生摘录" : "选择原生摘录"}'));
assert.ok(app.includes('label={selectedNow ? `取消选择评论 #${comment.index}` : `选择评论 #${comment.index}`}'));
assert.ok(styles.includes(".selection-checkbox"));
assert.ok(/\.selection-checkbox\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s.test(styles), "the real checkbox hit area must be 44 by 44 pixels");
assert.ok(/\.selection-checkbox input\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s.test(styles), "the familiar visible checkbox may remain compact inside the larger target");

assert.ok(app.includes("if (event.target !== event.currentTarget) return;"), "nested controls must not invoke the card keyboard handler");
assert.ok(app.includes('aria-label={excerptSelected ? "取消选择原生摘录" : "选择原生摘录"}'));
assert.ok(app.includes('aria-label={selectedNow ? `取消选择评论 #${comment.index}` : `选择评论 #${comment.index}`}'));
assert.ok(app.includes('aria-pressed={excerptSelected ? "true" : "false"}'));
assert.ok(app.includes('aria-pressed={selectedNow ? "true" : "false"}'));

assert.ok(app.includes("function EmptyState("));
[
  "正在读取当前卡片",
  "尚未选择卡片",
  "无法读取当前卡片",
  "当前卡片没有摘录或评论",
  "没有匹配的评论",
].forEach((text) => assert.ok(app.includes(text), `main view state ${text} must be explicit`));
assert.ok(app.includes('actionText="清除筛选" onAction={clearSearchAndFilter}'), "filtered empty state must provide a recovery action");
assert.ok(app.includes('aria-busy={noteViewState.phase === "loading" || loading ? "true" : undefined}'));
assert.ok(styles.includes(".empty-state.error"));

assert.ok(app.includes("function PlainTextPreview("));
assert.ok(app.includes('{expanded ? "收起全文" : "展开全文"}'));
assert.ok(app.includes('aria-expanded={expanded ? "true" : "false"}'));
assert.ok(app.includes('expanded={expandedPreviews.has("excerpt")}'));
assert.ok(app.includes('expanded={expandedPreviews.has(`comment:${comment.index}`)}'));
assert.ok(styles.includes(".text-preview-toggle"));

assert.ok(app.includes("const fieldGroups = useMemo(() => buildFieldGroups(visibleComments), [visibleComments])"), "quick navigation must not target comments hidden by the active filter");
assert.ok(app.includes("const commentSearchIndex = useMemo"), "search text should be normalized once per snapshot rather than on every render filter pass");
assert.ok(app.includes('aria-label="搜索评论"'));
assert.ok(app.includes('aria-pressed={filter === item.key ? "true" : "false"}'));
assert.ok(app.includes('aria-pressed={rangePicking ? "true" : "false"}'));
assert.ok(app.includes('aria-pressed={insertMode ? "true" : "false"}'));
assert.ok(app.includes("prefersReducedMotion() ? \"auto\" : \"smooth\""), "programmatic scrolling must respect reduced-motion preference");

console.log("selection target and main view-state regression passed");
