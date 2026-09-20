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
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
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

function extractBlock(text, marker) {
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${marker} must exist`);
  const open = text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${marker} must have a block`);
  return text.slice(open + 1, matchingBrace(text, open));
}

const rootTokens = extractBlock(styles, ":root");
assert.ok(rootTokens.includes("--bg-chrome: rgba(245, 245, 247, 0.88);"), "light chrome token must preserve the translucent toolbar surface");
assert.ok(rootTokens.includes("--bg-control: rgba(0, 0, 0, 0.04);"), "light control token must exist");
assert.ok(rootTokens.includes("--bg-control-strong: rgba(0, 0, 0, 0.06);"), "light strong-control token must exist");

const dark = extractBlock(styles, "@media (prefers-color-scheme: dark)");
assert.ok(dark.includes("--bg-chrome: rgba(21, 21, 23, 0.9);"), "dark chrome must not reuse the light toolbar surface");
assert.ok(dark.includes("--bg-control: rgba(255, 255, 255, 0.07);"), "dark controls need a light translucent fill");
assert.ok(dark.includes("--bg-control-strong: rgba(255, 255, 255, 0.1);"), "dark count badges need a stronger light translucent fill");

for (const selector of [".topbar", ".statusbar", ".quick-nav"]) {
  const block = extractBlock(styles, selector);
  assert.ok(block.includes("background: var(--bg-chrome);"), `${selector} must use the adaptive chrome token`);
}
assert.ok(!styles.includes("background: rgba(245, 245, 247, 0.82);"), "the old hard-coded light toolbar background must be removed");

assert.ok(extractBlock(styles, ".search-box input").includes("background: var(--bg-control);"), "search must use an adaptive control surface");
assert.ok(extractBlock(styles, ".quick-nav-item b").includes("background: var(--bg-control-strong);"), "quick-nav counts must use the adaptive badge surface");
const segmentedCounts = extractBlock(styles, ".segmented b,");
assert.ok(segmentedCounts.includes("background: var(--bg-control-strong);"), "sidebar counts must use the adaptive badge surface");

const narrow = extractBlock(styles, "@media (max-width: 760px)");
const narrowTopbar = extractBlock(narrow, ".topbar");
assert.ok(narrowTopbar.includes("display: grid;"), "narrow topbar must use a deterministic grid rather than flex wrapping");
assert.ok(narrowTopbar.includes("grid-template-columns: minmax(0, 1fr);"), "title and actions must occupy separate full-width rows");
assert.ok(narrowTopbar.includes("padding: 6px 10px 8px;"), "narrow chrome must retain a compact safe inset");

const narrowTitle = extractBlock(narrow, ".topbar-title");
assert.ok(narrowTitle.includes("display: flex;"), "the title and subtitle must share one compact narrow row");
assert.ok(narrowTitle.includes("align-items: baseline;"), "the narrow title row must preserve readable text alignment");
assert.ok(extractBlock(narrow, ".topbar-title p").includes("margin-top: 0;"), "the subtitle must not add a second vertical offset on narrow screens");

const narrowActions = extractBlock(narrow, ".topbar-actions");
assert.ok(narrowActions.includes("display: grid;"), "narrow actions must use a grid");
assert.ok(narrowActions.includes("repeat(auto-fit, minmax(64px, 1fr))"), "medium-width actions must adapt without hiding commands");
assert.ok(narrowActions.includes("width: 100%;"), "narrow actions must use the available row width");
assert.ok(narrowActions.includes("max-width: none;"), "the old viewport-relative cap must not crowd the title");

const narrowActionButton = extractBlock(narrow, ".topbar-actions button");
assert.ok(narrowActionButton.includes("min-height: 34px;"), "narrow action buttons must not shrink below the existing compact control height");
assert.ok(narrowActionButton.includes("min-width: 0;"), "narrow buttons must be allowed to fit their grid tracks");

const narrowStatus = extractBlock(narrow, ".statusbar");
assert.ok(narrowStatus.includes("display: grid;"), "narrow status content must have a stable two-row layout");
assert.ok(narrowStatus.includes("grid-template-columns: max-content max-content minmax(0, 1fr);"), "status counters must preserve space for the selected summary");
assert.ok(narrowStatus.includes("padding: 4px 10px 5px;"), "the two-row status area must remain compact on narrow screens");
const narrowMessage = extractBlock(narrow, ".statusbar .status-message");
assert.ok(narrowMessage.includes("grid-column: 1 / -1;"), "the recoverable status message must receive its own full-width row");

const phone = extractBlock(styles, "@media (max-width: 599px)");
assert.ok(extractBlock(phone, ".topbar-actions").includes("repeat(4, minmax(0, 1fr))"), "phone actions must form two balanced rows of four");

const topbarStart = app.indexOf('<div className="topbar-actions">');
const topbarEnd = app.indexOf("</div>", topbarStart);
assert.notStrictEqual(topbarStart, -1, "topbar actions must exist");
assert.notStrictEqual(topbarEnd, -1, "topbar actions must close");
const topbarSource = app.slice(topbarStart, topbarEnd);
const labels = ["全选", "反选", "清空", "选范围", "刷新", "工作流", "设置", "关闭"];
let previous = -1;
for (const label of labels) {
  const index = topbarSource.indexOf(label);
  assert.ok(index > previous, `topbar command ${label} must remain present and ordered`);
  previous = index;
}

console.log("main shell dark and narrow layout regression passed");
