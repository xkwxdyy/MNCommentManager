const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = process.env.MNCM_APP_PATH || path.join(__dirname, "..", "web", "src", "App.jsx");
const stylesPath = process.env.MNCM_STYLES_PATH || path.join(__dirname, "..", "web", "src", "styles.css");
const source = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let templateExpressionDepth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "`" && char === "$" && next === "{") {
        templateExpressionDepth += 1;
        depth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && char === "}" && templateExpressionDepth > 0) {
        templateExpressionDepth -= 1;
        depth -= 1;
        continue;
      }
      if (char === quote && templateExpressionDepth === 0) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`No matching brace for index ${openIndex}`);
}

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const signatureEnd = text.indexOf(") {", start);
  assert.notStrictEqual(signatureEnd, -1, `${name} must have a function body`);
  const open = signatureEnd + 2;
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function makeEvent({ key, type = "keydown", repeat = false }) {
  return {
    key,
    type,
    repeat,
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1;
    },
    stopPropagation() {
      this.stopped += 1;
    },
  };
}

const helperSource = extractFunction(source, "handleQuickActionKeyboardEvent");
const context = vm.createContext({});
vm.runInContext(`${helperSource}\nthis.handle = handleQuickActionKeyboardEvent;`, context, {
  filename: "App-markdown-link-quick-action-keyboard.js",
});
const handle = context.handle;

{
  let calls = 0;
  const event = makeEvent({ key: "Enter" });
  handle(event, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 1, "Enter must activate one inline-link short action");
  assert.strictEqual(event.prevented, 1, "Enter must suppress the synthetic click");
  assert.strictEqual(event.stopped, 1, "Enter must not toggle the parent comment selection");
}

for (const key of [" ", "Spacebar"]) {
  let calls = 0;
  const down = makeEvent({ key });
  const up = makeEvent({ key, type: "keyup" });
  handle(down, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 0, `${JSON.stringify(key)} must wait until keyup`);
  handle(up, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 1, `${JSON.stringify(key)} keyup must activate exactly once`);
  assert.strictEqual(down.prevented, 1, "Space keydown must suppress scrolling and the parent card");
  assert.strictEqual(down.stopped, 1);
  assert.strictEqual(up.prevented, 1);
  assert.strictEqual(up.stopped, 1);
}

{
  let calls = 0;
  const event = makeEvent({ key: "Enter", repeat: true });
  handle(event, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 0, "holding Enter must not repeatedly locate or reopen the edit dialog");
  assert.strictEqual(event.prevented, 1);
  assert.strictEqual(event.stopped, 1);
}

{
  let calls = 0;
  const event = makeEvent({ key: "Tab" });
  handle(event, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 0);
  assert.strictEqual(event.prevented, 0, "Tab must remain available for focus navigation");
  assert.strictEqual(event.stopped, 0, "unrelated keys must not be intercepted");
}

const listStart = source.indexOf("function MarkdownLinkList(");
const listEnd = source.indexOf("const MarkdownCommentBody", listStart);
assert.notStrictEqual(listStart, -1, "MarkdownLinkList must exist");
assert.notStrictEqual(listEnd, -1, "MarkdownLinkList source boundary must exist");
const listSource = source.slice(listStart, listEnd);

const locateMarker = 'title={noteId ? "点按定位这条行内链接的卡片，按住在浮窗定位" : "非 MarginNote 卡片链接不能定位"}';
const editMarker = 'title="编辑这条行内链接"';
const locateTitleStart = listSource.indexOf(locateMarker);
const editTitleStart = listSource.indexOf(editMarker, locateTitleStart);
assert.notStrictEqual(locateTitleStart, -1, "inline Markdown locate button must exist");
assert.notStrictEqual(editTitleStart, -1, "inline Markdown edit button must exist");
const locateStart = listSource.lastIndexOf("<Button", locateTitleStart);
const editStart = listSource.lastIndexOf("<Button", editTitleStart);
assert.notStrictEqual(locateStart, -1, "inline Markdown locate button opening tag must exist");
assert.notStrictEqual(editStart, -1, "inline Markdown edit button opening tag must exist");
const locateSource = listSource.slice(locateStart, editStart);
const editSource = listSource.slice(editStart, listSource.indexOf("</Button>", editStart) + "</Button>".length);

assert.ok(
  source.includes('onLocate={(link) => execute(() => locateMarkdownLink(link, "mindmap"))}'),
  "App must expose the existing mind-map short action to MarkdownLinkList",
);
assert.ok(
  listSource.startsWith("function MarkdownLinkList({ comment, links, loading, pressingKey, onLocateStart, onLocateFinish, onLocateCancel, onLocate, onEdit })"),
  "MarkdownLinkList must receive an explicit keyboard short-action callback without changing bridge APIs",
);

const locateKeyboardAction = "handleQuickActionKeyboardEvent(event, () => onLocate(link))";
const editKeyboardAction = "handleQuickActionKeyboardEvent(event, () => onEdit(comment, link, linkIndex, event.currentTarget))";
assert.ok(locateSource.includes(`onKeyDown={(event) => ${locateKeyboardAction}}`), "Enter on inline locate must use the existing short locate path");
assert.ok(locateSource.includes(`onKeyUp={(event) => ${locateKeyboardAction}}`), "Space on inline locate must use the existing short locate path");
assert.ok(editSource.includes(`onKeyDown={(event) => ${editKeyboardAction}}`), "Enter on inline edit must open the existing editor");
assert.ok(editSource.includes(`onKeyUp={(event) => ${editKeyboardAction}}`), "Space on inline edit must open the existing editor");
assert.strictEqual((listSource.match(/onKeyDown=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 2, "the two inline Markdown actions must each have one keydown handler");
assert.strictEqual((listSource.match(/onKeyUp=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 2, "the two inline Markdown actions must each have one keyup handler");

assert.ok(locateSource.includes("disabled={loading || !noteId}"), "non-MarginNote links must remain non-locatable");
assert.ok(locateSource.includes("onPointerDown={(event) => onLocateStart(event, comment, link, linkIndex)}"), "pointer long-press start must remain unchanged");
assert.ok(locateSource.includes("onPointerUp={(event) => onLocateFinish(event, comment, link, linkIndex)}"), "pointer short-press finish must remain unchanged");
assert.ok(locateSource.includes("onPointerLeave={(event) => onLocateCancel(event, comment, link, linkIndex)}"), "pointer-leave cancellation must remain unchanged");
assert.ok(locateSource.includes("onPointerCancel={(event) => onLocateCancel(event, comment, link, linkIndex)}"), "pointer-cancel cleanup must remain unchanged");
assert.ok(locateSource.includes('onClick={(event) => event.stopPropagation()}'), "pointer-generated locate click must remain isolated");
assert.ok(locateSource.includes('aria-label={`定位行内链接：${link.displayText || link.url}`}'), "locate button must keep its descriptive accessible name");
assert.ok(!locateSource.includes('"float"'), "keyboard locate wiring must not invoke the long-press floating-window path");

assert.ok(editSource.includes("disabled={loading}"), "edit must keep the existing loading gate");
assert.ok(editSource.includes('aria-label={`编辑行内链接：${link.displayText || link.url}`}'), "edit button must keep its descriptive accessible name");
assert.ok(editSource.includes("event.stopPropagation();\n                  onEdit(comment, link, linkIndex, event.currentTarget);"), "pointer click must keep the existing edit path and event isolation while retaining its focus-return target");
assert.strictEqual((editSource.match(/event\.currentTarget/g) || []).length, 3, "keyboard and pointer activation must all retain the invoking edit button");
assert.ok(!editSource.includes("runCommand("), "keyboard wiring must not bypass the existing dialog and call Native directly");

assert.ok(source.includes('execute(() => locateMarkdownLink(link, "float"));'), "pointer long press must still use floating-window mode");
assert.ok(source.includes("getLongPressDelay(event, LINK_FOCUS_LONG_PRESS_MS)"), "the existing inline-link long-press timer must remain and preserve Apple Pencil timing");
assert.ok(source.includes("const LINK_FOCUS_LONG_PRESS_MS = 520;"), "the existing 520ms threshold must remain");
assert.ok(source.includes('await runCommand("focusLinkedNote", { noteId, mode }, {'), "link navigation command and payload must remain unchanged");
assert.ok(source.includes('kind: "editMarkdownLink"'), "the existing inline-link edit dialog must remain");
assert.ok(source.includes('await runCommand("editMarkdownLink", {\n          noteId: snapshot.noteId,\n          commentIndex: comment.index,\n          linkIndex,\n          displayText,\n          url,\n        }, { message: "行内链接已更新" });'), "inline-link edit command, payload, and success message must remain unchanged");
assert.ok(source.includes('if (event.key === "Enter" || event.key === " ")'), "the comment card must keep its own keyboard selection behavior when it has focus");
assert.ok(styles.includes(".quick-action-btn:focus-visible"), "existing visible keyboard focus treatment must remain");
assert.ok(styles.includes("touch-action: none"), "existing pointer gesture isolation must remain");

console.log("markdown inline-link quick-action keyboard regression passed");
