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

function extractConstArrow(text, name) {
  const marker = `const ${name} =`;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const arrow = text.indexOf("=>", start);
  assert.notStrictEqual(arrow, -1, `${name} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  assert.notStrictEqual(open, -1, `${name} must have a function body`);
  const close = matchingBrace(text, open);
  const semicolon = text.indexOf(";", close);
  assert.notStrictEqual(semicolon, -1, `${name} must terminate with a semicolon`);
  return text.slice(start, semicolon + 1);
}

function makeEvent({ key, type = "keydown", repeat = false, currentTarget = null }) {
  return {
    key,
    type,
    repeat,
    currentTarget,
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
const mainDeleteKeyboardSource = extractConstArrow(source, "handleMainDeleteKeyboardEvent");

assert.ok(
  mainDeleteKeyboardSource.includes("const returnFocusTarget = event.currentTarget"),
  "the keyboard path must capture the actual delete button before starting async work",
);
assert.ok(
  mainDeleteKeyboardSource.includes("handleQuickActionKeyboardEvent(event"),
  "the main delete button must reuse the reviewed Enter/Space activation semantics",
);
assert.ok(
  mainDeleteKeyboardSource.includes("deleteSelection(returnFocusTarget)"),
  "keyboard activation must map to the existing short-press deletion path",
);
assert.ok(
  !mainDeleteKeyboardSource.includes("confirmBidirectionalDelete"),
  "keyboard activation must never silently invoke long-press bidirectional deletion",
);
assert.ok(
  !mainDeleteKeyboardSource.includes("setTimeout"),
  "keyboard activation must not start the destructive long-press timer",
);

const calls = [];
const context = vm.createContext({
  execute(callback) {
    calls.push("execute");
    return callback();
  },
  deleteSelection(target) {
    calls.push({ operation: "deleteSelection", target });
  },
});
vm.runInContext(
  `${helperSource}\n${mainDeleteKeyboardSource}\nthis.handleMainDelete = handleMainDeleteKeyboardEvent;`,
  context,
  { filename: "App-main-delete-keyboard.js" },
);
const handleMainDelete = context.handleMainDelete;
const button = { id: "main-delete-button" };

{
  calls.length = 0;
  const event = makeEvent({ key: "Enter", currentTarget: button });
  handleMainDelete(event);
  assert.deepStrictEqual(calls, ["execute", { operation: "deleteSelection", target: button }], "Enter must perform exactly one existing short-delete action");
  assert.strictEqual(event.prevented, 1, "Enter must suppress the browser-generated click");
  assert.strictEqual(event.stopped, 1, "Enter must not leak into surrounding keyboard handlers");
}

{
  calls.length = 0;
  const keyDown = makeEvent({ key: " ", currentTarget: button });
  handleMainDelete(keyDown);
  assert.deepStrictEqual(calls, [], "Space keydown must wait until keyup like a native button");
  assert.strictEqual(keyDown.prevented, 1, "Space keydown must prevent page scrolling and a later duplicate click");
  assert.strictEqual(keyDown.stopped, 1);

  const keyUp = makeEvent({ key: " ", type: "keyup", currentTarget: button });
  handleMainDelete(keyUp);
  assert.deepStrictEqual(calls, ["execute", { operation: "deleteSelection", target: button }], "Space keyup must perform exactly one short-delete action");
  assert.strictEqual(keyUp.prevented, 1);
  assert.strictEqual(keyUp.stopped, 1);
}

{
  calls.length = 0;
  const keyDown = makeEvent({ key: "Spacebar", currentTarget: button });
  const keyUp = makeEvent({ key: "Spacebar", type: "keyup", currentTarget: button });
  handleMainDelete(keyDown);
  handleMainDelete(keyUp);
  assert.deepStrictEqual(calls, ["execute", { operation: "deleteSelection", target: button }], "legacy Spacebar must retain one compatible activation");
}

{
  calls.length = 0;
  const event = makeEvent({ key: "Enter", repeat: true, currentTarget: button });
  handleMainDelete(event);
  assert.deepStrictEqual(calls, [], "holding Enter must not repeatedly delete content");
  assert.strictEqual(event.prevented, 1);
  assert.strictEqual(event.stopped, 1);
}

{
  calls.length = 0;
  const event = makeEvent({ key: "Enter", type: "keyup", currentTarget: button });
  handleMainDelete(event);
  assert.deepStrictEqual(calls, [], "Enter keyup must not perform a second deletion");
}

{
  calls.length = 0;
  const event = makeEvent({ key: "Tab", currentTarget: button });
  handleMainDelete(event);
  assert.deepStrictEqual(calls, [], "Tab must remain available for focus navigation");
  assert.strictEqual(event.prevented, 0);
  assert.strictEqual(event.stopped, 0);
}

const titleMarker = 'title="点按删除所选内容；按住仅对纯卡片链接执行双向删除"';
const titleIndex = source.indexOf(titleMarker);
assert.notStrictEqual(titleIndex, -1, "the main delete button must exist");
const buttonStart = source.lastIndexOf("<button", titleIndex);
const buttonEnd = source.indexOf("</button>", titleIndex);
assert.notStrictEqual(buttonStart, -1);
assert.notStrictEqual(buttonEnd, -1);
const buttonSource = source.slice(buttonStart, buttonEnd + "</button>".length);

assert.ok(buttonSource.includes("onPointerDown={startDeletePress}"), "pointer long-press start must remain unchanged");
assert.ok(buttonSource.includes("onPointerUp={endDeletePress}"), "pointer short-press release must remain unchanged");
assert.ok(buttonSource.includes("onPointerLeave={cancelDeletePress}"), "pointer leave cancellation must remain");
assert.ok(buttonSource.includes("onPointerCancel={cancelDeletePress}"), "pointer cancel cleanup must remain");
assert.ok(buttonSource.includes("onKeyDown={handleMainDeleteKeyboardEvent}"), "Enter and Space keydown must be wired to the reviewed keyboard path");
assert.ok(buttonSource.includes("onKeyUp={handleMainDeleteKeyboardEvent}"), "Space keyup must be wired to the reviewed keyboard path");
assert.ok(buttonSource.includes("onContextMenu={(event) => event.preventDefault()}"), "long-press context menu suppression must remain");
assert.ok(buttonSource.includes("onDragStart={(event) => event.preventDefault()}"), "drag suppression must remain");
assert.ok(buttonSource.includes("onSelectStart={(event) => event.preventDefault()}"), "text selection suppression must remain");
assert.ok(buttonSource.includes("disabled={loading || !hasSelection}"), "the existing loading and selection gate must remain");
assert.ok(buttonSource.includes('className={deletePressing ? "danger wide pressing" : "danger wide"}'), "the pointer pressing state must remain visible");
assert.ok(!buttonSource.includes("onClick="), "the raw button must not add a click handler that duplicates pointer release");
assert.strictEqual((buttonSource.match(/onKeyDown=/g) || []).length, 1, "the main delete button must have exactly one keydown path");
assert.strictEqual((buttonSource.match(/onKeyUp=/g) || []).length, 1, "the main delete button must have exactly one keyup path");

const startDeleteSource = extractConstArrow(source, "startDeletePress");
const endDeleteSource = extractConstArrow(source, "endDeletePress");
const cancelDeleteSource = extractConstArrow(source, "cancelDeletePress");
const deleteSelectionSource = extractConstArrow(source, "deleteSelection");

assert.ok(startDeleteSource.includes("deleteTimer.current = setTimeout"), "pointer down must still own the long-press timer");
assert.ok(startDeleteSource.includes("confirmBidirectionalDelete(returnFocusTarget)"), "only pointer long-press may open bidirectional deletion");
assert.ok(startDeleteSource.includes("}, 560);"), "the audited 560ms long-press threshold must remain");
assert.ok(endDeleteSource.includes("deleteSelection(returnFocusTarget)"), "pointer short release must retain the same ordinary deletion path");
assert.ok(endDeleteSource.includes("if (!fired)"), "pointer release must still suppress short deletion after a long press");
assert.ok(cancelDeleteSource.includes("deleteLongPressFired.current = true"), "pointer cancellation must prevent a later short deletion");
assert.ok(deleteSelectionSource.startsWith("const deleteSelection = async (returnFocusTarget = null) =>"), "ordinary deletion must retain its optional focus target");
assert.ok(deleteSelectionSource.includes("await executeDeleteSelection()"), "ordinary non-excerpt deletion behavior must remain");
assert.ok(deleteSelectionSource.includes("returnFocusTarget"), "excerpt conversion confirmation must be able to restore focus to the keyboard trigger");
assert.ok(deleteSelectionSource.includes('document.getElementById("selection-summary")'), "the existing stable focus fallback must remain");

assert.ok(styles.includes("button:focus-visible"), "the main delete button must retain a visible keyboard focus indicator");
assert.ok(styles.includes("outline: 3px solid var(--focus)"), "the existing focus token must remain in use");

console.log("main delete button keyboard regression passed");
