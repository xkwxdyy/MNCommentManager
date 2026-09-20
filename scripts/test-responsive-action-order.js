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

function cssOrder(block, marker) {
  const rule = extractBlock(block, marker);
  const match = rule.match(/(?:^|\n)\s*order\s*:\s*(-?\d+)\s*;/);
  assert.ok(match, `${marker} must declare an explicit order`);
  return Number(match[1]);
}

const workspaceStart = app.indexOf('<main className="workspace">');
const workspaceEnd = app.indexOf("</main>", workspaceStart);
assert.ok(workspaceStart >= 0 && workspaceEnd > workspaceStart, "workspace markup must exist");
const workspace = app.slice(workspaceStart, workspaceEnd);
const rightStart = workspace.indexOf('<aside className="right-pane">');
assert.ok(rightStart >= 0, "the action pane must exist");
const rightSource = workspace.slice(rightStart);

const domGroups = ["move-section", "process-section", "delete-section"];
let previous = -1;
for (const group of domGroups) {
  const index = rightSource.indexOf(group);
  assert.ok(index > previous, `${group} must preserve move, process, delete DOM/Tab order`);
  previous = index;
}

const tablet = extractBlock(styles, "@media (max-width: 1180px)");
const tabletPane = extractBlock(tablet, ".right-pane");
assert.ok(tabletPane.includes("display: flex;"), "the 521–1180px action area must remain a flex column");
assert.ok(tabletPane.includes("flex-direction: column;"), "the 521–1180px action area must retain its vertical column layout");
assert.ok(tabletPane.includes("overflow-y: auto;"), "the action column must remain vertically scrollable when its content is tall");

const tabletVisualGroups = [
  { name: "move-section", order: cssOrder(tablet, ".move-section") },
  { name: "process-section", order: cssOrder(tablet, ".process-section") },
  { name: "delete-section", order: cssOrder(tablet, ".delete-section") },
].sort((left, right) => left.order - right.order).map((item) => item.name);

assert.deepStrictEqual(
  tabletVisualGroups,
  domGroups,
  "the 521–1180px visual group order must exactly match DOM/Tab order",
);
assert.ok(
  cssOrder(tablet, ".delete-section") > cssOrder(tablet, ".process-section"),
  "the destructive group must be visually last in the responsive action column",
);

for (const availableGroups of [
  ["move-section", "delete-section"],
  ["process-section", "delete-section"],
  ["delete-section"],
]) {
  const visual = tabletVisualGroups.filter((group) => availableGroups.includes(group));
  const keyboard = domGroups.filter((group) => availableGroups.includes(group));
  assert.deepStrictEqual(
    visual,
    keyboard,
    `conditional groups ${availableGroups.join(", ")} must preserve the same visual and keyboard order`,
  );
}

const phone = extractBlock(styles, "@media (max-width: 520px)");
const phoneVisualGroups = [
  { name: "move-section", order: cssOrder(phone, ".right-pane .move-section") },
  { name: "process-section", order: cssOrder(phone, ".right-pane .process-section") },
  { name: "delete-section", order: cssOrder(phone, ".right-pane .delete-section") },
].sort((left, right) => left.order - right.order).map((item) => item.name);
assert.deepStrictEqual(phoneVisualGroups, domGroups, "the extra-narrow rail must retain the same aligned order");

const tabletButtonRule = extractBlock(tablet, ".right-pane button,");
const phoneButtonRule = extractBlock(phone, ".right-pane button,");
assert.ok(!/(?:^|\n)\s*order\s*:/.test(tabletButtonRule), "individual tablet buttons must not be visually reordered away from DOM order");
assert.ok(!/(?:^|\n)\s*order\s*:/.test(phoneButtonRule), "individual phone buttons must not be visually reordered away from DOM order");
assert.ok(!/tabIndex\s*=\s*\{\s*[1-9]/.test(app), "positive tabIndex must not be used to repair visual order");

console.log("responsive action column visual and keyboard order regression passed");
