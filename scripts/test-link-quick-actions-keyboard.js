const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "src", "App.jsx");
const stylesPath = path.join(__dirname, "..", "web", "src", "styles.css");
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
  filename: "App-link-quick-action-keyboard.js",
});
const handle = context.handle;

{
  let calls = 0;
  const event = makeEvent({ key: "Enter" });
  handle(event, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 1, "Enter must perform one short link action");
  assert.strictEqual(event.prevented, 1, "Enter must suppress the native synthetic click");
  assert.strictEqual(event.stopped, 1, "Enter must not toggle the parent comment selection");
}

{
  let calls = 0;
  const down = makeEvent({ key: " " });
  const up = makeEvent({ key: " ", type: "keyup" });
  handle(down, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 0, "Space must wait until keyup");
  handle(up, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 1, "Space keyup must perform one short link action");
  assert.strictEqual(down.stopped, 1);
  assert.strictEqual(up.stopped, 1);
}

{
  let calls = 0;
  const repeated = makeEvent({ key: "Enter", repeat: true });
  handle(repeated, () => {
    calls += 1;
  });
  assert.strictEqual(calls, 0, "holding Enter must not repeat link navigation or clipboard updates");
  assert.strictEqual(repeated.stopped, 1);
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

const locateMarker = 'title="点按定位，按住在浮窗定位"';
const updateMarker = 'title="用剪贴板中的卡片链接更新"';
const nextActionMarker = 'title="点按上移，按住移到最上方"';
const locateStart = source.indexOf(locateMarker);
const updateStart = source.indexOf(updateMarker, locateStart);
const nextActionStart = source.indexOf(nextActionMarker, updateStart);
assert.notStrictEqual(locateStart, -1, "linked-card locate action must exist");
assert.notStrictEqual(updateStart, -1, "linked-card clipboard update action must exist");
assert.notStrictEqual(nextActionStart, -1, "the following row action must exist");

const locateSource = source.slice(locateStart, updateStart);
const updateSource = source.slice(updateStart, nextActionStart);
const approvedLinkActionSections = `${locateSource}\n${updateSource}`;
const locateKeyboardAction = 'handleQuickActionKeyboardEvent(event, () => execute(() => locateLinkedNote(comment.linkedNoteId, "mindmap")))';
const updateKeyboardAction = "handleQuickActionKeyboardEvent(event, () => execute(() => updateLinkCommentFromClipboard(comment)))";

assert.ok(locateSource.includes(`onKeyDown={(event) => ${locateKeyboardAction}}`), "Enter on locate must use the existing short-press mind-map path");
assert.ok(locateSource.includes(`onKeyUp={(event) => ${locateKeyboardAction}}`), "Space on locate must use the existing short-press mind-map path");
assert.ok(updateSource.includes(`onKeyDown={(event) => ${updateKeyboardAction}}`), "Enter on update must use the existing clipboard update path");
assert.ok(updateSource.includes(`onKeyUp={(event) => ${updateKeyboardAction}}`), "Space on update must use the existing clipboard update path");
assert.strictEqual((approvedLinkActionSections.match(/onKeyDown=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 2, "the two approved link actions must each have one keydown handler");
assert.strictEqual((approvedLinkActionSections.match(/onKeyUp=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 2, "the two approved link actions must each have one keyup handler");

assert.ok(locateSource.includes("onPointerDown={(event) => startInlineLinkFocusPress(event, comment)}"), "pointer long-press start must remain unchanged");
assert.ok(locateSource.includes("onPointerUp={(event) => finishInlineLinkFocusPress(event, comment)}"), "pointer short-press finish must remain unchanged");
assert.ok(locateSource.includes("onPointerLeave={(event) => cancelInlineLinkFocusPress(event, comment.index)}"), "pointer-leave cancellation must remain unchanged");
assert.ok(locateSource.includes("onPointerCancel={(event) => cancelInlineLinkFocusPress(event, comment.index)}"), "pointer-cancel cleanup must remain unchanged");
assert.ok(locateSource.includes('onClick={(event) => event.stopPropagation()}'), "the pointer-generated click must remain isolated from card selection");
assert.ok(locateSource.includes('aria-label={`定位链接卡片：${linkedDisplay.title}`}'), "locate must keep its descriptive accessible name");
assert.ok(!locateSource.includes('locateLinkedNote(comment.linkedNoteId, "float")'), "keyboard wiring must not silently invoke the pointer-only floating-window long press");

assert.ok(updateSource.includes('disabled={loading || !canComment(comment, "canUpdateLink")}'), "the existing update capability gate must remain");
assert.ok(updateSource.includes("event.stopPropagation();"), "pointer click on update must remain isolated from card selection");
assert.ok(updateSource.includes("updateLinkCommentFromClipboard(comment);"), "pointer click must keep the existing update path");
assert.ok(updateSource.includes('aria-label={`更新链接：${linkedDisplay.title}`}'), "update must keep its descriptive accessible name");

assert.ok(source.includes('await runCommand("focusLinkedNote", { noteId, mode }, {'), "link navigation bridge command and payload must remain unchanged");
assert.ok(source.includes('await runCommand("updateLinkCommentFromClipboard", {\n      noteId: snapshot.noteId,\n      commentIndex: comment.index,\n    }, { message: "链接已更新", keepSelection: true });'), "clipboard update bridge command, payload, and success message must remain unchanged");
assert.ok(source.includes('execute(() => locateLinkedNote(comment.linkedNoteId, "float"));'), "pointer long press must still use floating-window mode");
assert.ok(source.includes("getLongPressDelay(event, LINK_FOCUS_LONG_PRESS_MS)"), "the existing link long-press timer must remain and preserve Apple Pencil timing");
assert.ok(source.includes("const LINK_FOCUS_LONG_PRESS_MS = 520;"), "the 520ms link long-press threshold must remain unchanged");
assert.ok(source.includes('if (event.key === "Enter" || event.key === " ")'), "the comment card must retain its own activation behavior when the card itself is focused");
assert.ok(styles.includes(".quick-action-btn:focus-visible"), "existing visible keyboard focus treatment must remain");
assert.ok(styles.includes("touch-action: none"), "existing pointer gesture isolation must remain");

console.log("link quick-action keyboard regression passed");
