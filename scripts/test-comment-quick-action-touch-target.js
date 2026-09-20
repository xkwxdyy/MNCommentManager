const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cssPath = process.env.MNCM_STYLES_PATH || path.join(root, "web", "src", "styles.css");
const appPath = process.env.MNCM_APP_PATH || path.join(root, "web", "src", "App.jsx");
const styles = fs.readFileSync(cssPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let comment = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (comment) {
      if (char === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`No matching brace for ${openIndex}`);
}

function extractBlock(text, marker, fromIndex = 0) {
  const start = text.indexOf(marker, fromIndex);
  assert.notStrictEqual(start, -1, `${marker} must exist`);
  const markerBrace = marker.indexOf("{");
  const open = markerBrace >= 0 ? start + markerBrace : text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${marker} must have a block`);
  return text.slice(open + 1, matchingBrace(text, open));
}

const tokens = extractBlock(styles, ":root");
assert.ok(tokens.includes("--quick-action-hit-size: 44px;"), "quick actions need a 44px actual hit box");
assert.ok(tokens.includes("--quick-action-visual-size: 29px;"), "the compact 29px visual circle must remain separate from the hit box");

const quickAction = extractBlock(styles, "\n.quick-action-btn {\n");
for (const property of ["width", "height", "min-width", "min-height"]) {
  assert.ok(
    quickAction.includes(`${property}: var(--quick-action-hit-size);`),
    `${property} must use the full touch target token`,
  );
}
assert.ok(quickAction.includes("font-size: 14px;"), "the base icon size must remain 14px");
assert.ok(quickAction.includes("touch-action: none;"), "the existing pointer/long-press gesture boundary must remain");
assert.ok(quickAction.includes("background: transparent;"), "the enlarged hit box must not become a visually oversized circle");
assert.ok(quickAction.includes("box-shadow: none;"), "the enlarged hit box must remain visually transparent");

const visual = extractBlock(styles, "\n.quick-action-btn::before {\n");
assert.ok(visual.includes("width: var(--quick-action-visual-size);"), "the visual circle width must remain compact");
assert.ok(visual.includes("height: var(--quick-action-visual-size);"), "the visual circle height must remain compact");
assert.ok(visual.includes("pointer-events: none;"), "the visual circle must not split pointer events from the real button");
assert.ok(visual.includes("background: var(--bg-panel-soft);"), "the existing neutral visual surface must remain");
assert.ok(visual.includes("box-shadow: inset 0 0 0 1px var(--border-light);"), "the existing visual border must remain");

const hover = extractBlock(styles, "\n.quick-action-btn:hover:not(:disabled),\n");
assert.ok(hover.includes("background: transparent;"), "hover must not paint the whole 44px hit box");
assert.ok(hover.includes("transform: none;"), "hover must not scale the actual event box");
const hoverVisual = extractBlock(styles, "\n.quick-action-btn:hover:not(:disabled)::before,\n");
assert.ok(hoverVisual.includes("background: var(--accent-blue-soft);"), "hover feedback must remain on the compact visual circle");

const danger = extractBlock(styles, "\n.quick-action-btn.danger::before {\n");
assert.ok(danger.includes("background: rgba(255, 59, 48, 0.1);"), "danger affordance must remain on the compact visual circle");
const dangerActive = extractBlock(styles, "\n.quick-action-btn.danger:hover:not(:disabled)::before,\n");
assert.ok(dangerActive.includes("background: var(--accent-red);"), "danger hover/press feedback must remain red");

assert.ok(extractBlock(styles, "\n.locate-action {\n").includes("font-size: 15px;"), "locate icon size must stay 15px");
assert.ok(extractBlock(styles, "\n.update-link-action {\n").includes("font-size: 17px;"), "update icon size must stay 17px");

const phone = extractBlock(styles, "@media (max-width: 520px)");
const phoneGaps = extractBlock(phone, ".comment-inline-actions,");
assert.ok(phoneGaps.includes("gap: 2px;"), "extra-narrow action groups need a compact non-overlapping gap");
assert.ok(!/\.quick-action-btn\s*\{[^}]*\b(?:width|height|min-width|min-height)\s*:\s*(?:2\d|3\d)px/s.test(phone), "extra-narrow CSS must not shrink the actual touch target");

const maxCommentActions = 5;
const phoneActionWidth = maxCommentActions * 44 + (maxCommentActions - 1) * 2;
const phoneCardInnerWidth = 320 - 20 - 24;
assert.ok(phoneActionWidth <= phoneCardInnerWidth, "five comment actions must still fit inside a 320px card row");

const expectedButtonLabels = [
  "定位链接卡片：",
  "更新链接：",
  "上移评论 #",
  "下移评论 #",
  "删除评论 #",
  "定位行内链接：",
  "编辑行内链接：",
];
for (const label of expectedButtonLabels) {
  assert.ok(app.includes(label), `${label} quick action must remain present`);
}

for (const eventName of ["onPointerDown", "onPointerUp", "onPointerLeave", "onPointerCancel", "onKeyDown", "onKeyUp"]) {
  assert.ok(app.includes(eventName), `${eventName} behavior must remain wired`);
}
assert.ok(app.includes("LINK_FOCUS_LONG_PRESS_MS = 520"), "link long-press threshold must remain unchanged");
assert.ok(/startQuickMovePress[\s\S]*?setTimeout\([\s\S]*?\}, 520\);/.test(app), "move long-press threshold must remain 520ms");
assert.ok(/startSingleDeletePress[\s\S]*?setTimeout\([\s\S]*?\}, 560\);/.test(app), "delete long-press threshold must remain 560ms");
assert.ok(!/tabIndex\s*=\s*\{\s*[1-9]/.test(app), "positive tabIndex must not be introduced for quick actions");

console.log("comment quick-action touch target regression passed");
