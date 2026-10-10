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
  const open = text.indexOf("{", start);
  assert.notStrictEqual(open, -1, `${marker} must have a block`);
  return text.slice(open + 1, matchingBrace(text, open));
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


const panel = extractBlock(styles, ".selection-actions-panel");
assert.ok(panel.includes("overflow-y: auto;"), "long selection menus must remain vertically reachable");
assert.ok(!panel.includes("display: flex;"), "action sections must follow normal DOM and Tab order");
for (const group of domGroups) {
  const reordered = new RegExp("\\." + group + "[^{}]*\\{[^}]*\\border\\s*:");
  assert.ok(!reordered.test(styles), `${group} must not be visually reordered away from keyboard order`);
}
assert.ok(!/tabIndex\s*=\s*\{\s*[1-9]/.test(app), "positive tabIndex must not repair visual order");
assert.ok(rightSource.indexOf("<SelectionActionsPanel") < rightSource.indexOf("move-section"), "existing actions must remain inside the accessible selection panel");
assert.ok(rightSource.indexOf("<CommentFoldToolbar") < rightSource.indexOf("<SelectionActionsPanel"), "primary fold actions must remain directly reachable outside the menu");
console.log("selection action menu visual and keyboard order regression passed");
