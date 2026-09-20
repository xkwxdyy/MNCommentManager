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

function extractBlock(text, marker) {
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${marker} must exist`);
  const open = text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${marker} must have a block`);
  return text.slice(open + 1, matchingBrace(text, open));
}

const phone = extractBlock(styles, "@media (max-width: 520px)");
const workspace = extractBlock(phone, ".workspace");
assert.ok(workspace.includes("grid-template-columns: minmax(0, 1fr);"), "extra-narrow workspace must give the comment list the full width");
assert.ok(workspace.includes("grid-template-rows: auto minmax(0, 1fr) auto;"), "filters and actions must remain visible around a scrollable comment body");
assert.ok(/grid-template-areas:\s*"nav"\s*"main"\s*"inspector";/.test(workspace), "extra-narrow workspace must stack filters, comments, then actions");

const leftPane = extractBlock(phone, ".left-pane");
assert.ok(leftPane.includes("overflow-x: auto;"), "the filter rail must remain horizontally reachable");
assert.ok(leftPane.includes("overflow-y: hidden;"), "the filter rail must not consume the comment body's vertical space");
assert.ok(leftPane.includes("border-bottom: 1px solid var(--border-light);"), "the filter rail needs a visible boundary from comments");
assert.ok(extractBlock(phone, ".left-pane::before").includes("display: none;"), "the decorative product label may be removed on extra-narrow screens");

const leftSection = extractBlock(phone, ".left-pane .pane-section");
assert.ok(leftSection.includes("display: flex;"), "filter controls must form one horizontal rail");
assert.ok(leftSection.includes("flex-wrap: nowrap;"), "filter controls must scroll instead of creating a tall sidebar");
assert.ok(!leftSection.includes("display: none;"), "the filter section must remain visible");

const search = extractBlock(phone, ".left-pane .search-box");
assert.ok(search.includes("flex: 0 0 144px;"), "search must retain a usable fixed-width entry in the rail");
const segmented = extractBlock(phone, ".left-pane .segmented");
assert.ok(segmented.includes("display: flex;"), "all existing filter choices must remain visible in the horizontal rail");
assert.ok(segmented.includes("flex-wrap: nowrap;"), "filter choices must preserve their order on one scrollable row");
const filterButton = extractBlock(phone, ".left-pane .segmented button");
assert.ok(filterButton.includes("min-width: 68px;"), "filter targets must retain a readable minimum width");
assert.ok(filterButton.includes("min-height: 36px;"), "filter targets must retain the existing compact touch height");
assert.ok(extractBlock(phone, ".left-pane .wide").includes("width: auto;"), "the invalid-link cleanup command must remain reachable without filling the entire rail");

const commentList = extractBlock(phone, ".comment-list");
assert.ok(commentList.includes("width: 100%;"), "the comment body must use the full single-column width");

const rightPane = extractBlock(phone, ".right-pane");
assert.ok(rightPane.includes("display: flex;"), "the action area must become a horizontal rail");
assert.ok(rightPane.includes("flex-direction: row;"), "action groups must not form a tall narrow column");
assert.ok(rightPane.includes("overflow-x: auto;"), "all action groups must remain horizontally reachable");
assert.ok(rightPane.includes("overflow-y: hidden;"), "the action rail must preserve comment-body height");
assert.ok(rightPane.includes("border-top: 1px solid var(--border-light);"), "the action rail needs a visible boundary from comments");

const rightSection = extractBlock(phone, ".right-pane .pane-section");
assert.ok(rightSection.includes("flex: 0 0 auto;"), "each action group must remain intact while the rail scrolls");
assert.ok(!rightSection.includes("display: none;"), "action groups must not be hidden on extra-narrow screens");
assert.ok(extractBlock(phone, ".right-pane .selection-summary").includes("display: none;"), "the duplicated selection summary must stay hidden on narrow screens");
const rightGroups = extractBlock(phone, ".right-pane .button-grid,");
assert.ok(rightGroups.includes("display: flex;"), "move and process commands must stay on the action rail");
assert.ok(rightGroups.includes("flex-wrap: nowrap;"), "commands must scroll horizontally rather than disappear");
const rightButtons = extractBlock(phone, ".right-pane button,");
assert.ok(rightButtons.includes("min-width: 88px;"), "action buttons must remain readable and independently reachable");
assert.ok(rightButtons.includes("min-height: 36px;"), "action buttons must retain a usable compact height");

const tablet = extractBlock(styles, "@media (max-width: 1180px)");
assert.ok(extractBlock(tablet, ".move-section").includes("order: 10;"), "the responsive action column must start with the DOM-first move group");
assert.ok(extractBlock(tablet, ".process-section").includes("order: 20;"), "the responsive action column must keep processing after movement");
assert.ok(extractBlock(tablet, ".delete-section").includes("order: 30;"), "the destructive group must remain last above the extra-narrow breakpoint");
assert.ok(extractBlock(phone, ".right-pane .move-section").includes("order: 10;"), "the extra-narrow rail must start with the DOM-first move group");
assert.ok(extractBlock(phone, ".right-pane .process-section").includes("order: 20;"), "the extra-narrow rail must keep processing after movement");
assert.ok(extractBlock(phone, ".right-pane .delete-section").includes("order: 30;"), "the destructive group must remain last in the extra-narrow rail");

const workspaceStart = app.indexOf('<main className="workspace">');
const workspaceEnd = app.indexOf("</main>", workspaceStart);
assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart, "workspace markup must exist");
const workspaceSource = app.slice(workspaceStart, workspaceEnd);
const layoutMarkers = [
  '<aside className="left-pane">',
  'id="comment-list"',
  '<aside className="right-pane">',
];
let previous = -1;
for (const marker of layoutMarkers) {
  const index = workspaceSource.indexOf(marker);
  assert.ok(index > previous, `${marker} must remain present and in source order`);
  previous = index;
}

const rightStart = workspaceSource.indexOf('<aside className="right-pane">');
const rightSource = workspaceSource.slice(rightStart);
const actionMarkers = ["move-section", "process-section", "delete-section"];
previous = -1;
for (const marker of actionMarkers) {
  const index = rightSource.indexOf(marker);
  assert.ok(index > previous, `${marker} must remain present and preserve DOM/keyboard order`);
  previous = index;
}

const filterLabels = ["全部", "文本", "图片", "链接", "HTML", "音频", "其他"];
previous = -1;
const filtersStart = app.indexOf("const FILTERS = [");
const filtersEnd = app.indexOf("];", filtersStart);
const filterSource = app.slice(filtersStart, filtersEnd);
for (const label of filterLabels) {
  const index = filterSource.indexOf(`label: "${label}"`);
  assert.ok(index > previous, `filter ${label} must remain present and ordered`);
  previous = index;
}

for (const forbidden of [
  ".left-pane { display: none",
  ".right-pane { display: none",
  ".segmented { display: none",
  ".process-section { display: none",
  ".delete-section { display: none",
]) {
  assert.ok(!phone.replace(/\s+/g, " ").includes(forbidden), `${forbidden} must not hide a core control`);
}

console.log("main workspace extra-narrow layout regression passed");
