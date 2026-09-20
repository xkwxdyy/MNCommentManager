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
  filename: "App-quick-action-keyboard.js",
});
const handle = context.handle;

{
  let actions = 0;
  const event = makeEvent({ key: "Enter" });
  handle(event, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 1, "Enter keydown must perform one short action");
  assert.strictEqual(event.prevented, 1, "Enter must suppress the native synthetic click");
  assert.strictEqual(event.stopped, 1, "Enter must not reach the parent comment card");
}

for (const key of [" ", "Spacebar"]) {
  let actions = 0;
  const keyDown = makeEvent({ key });
  handle(keyDown, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 0, `${JSON.stringify(key)} must wait for keyup like a native button`);
  assert.strictEqual(keyDown.prevented, 1, `${JSON.stringify(key)} keydown must suppress scrolling and the native click`);
  assert.strictEqual(keyDown.stopped, 1, `${JSON.stringify(key)} keydown must not reach the parent comment card`);

  const keyUp = makeEvent({ key, type: "keyup" });
  handle(keyUp, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 1, `${JSON.stringify(key)} keyup must perform one short action`);
  assert.strictEqual(keyUp.prevented, 1);
  assert.strictEqual(keyUp.stopped, 1);
}

{
  let actions = 0;
  const event = makeEvent({ key: "Enter", repeat: true });
  handle(event, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 0, "holding Enter must not repeat a destructive or move action");
  assert.strictEqual(event.prevented, 1);
  assert.strictEqual(event.stopped, 1);
}

{
  let actions = 0;
  const event = makeEvent({ key: "Enter", type: "keyup" });
  handle(event, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 0, "Enter keyup must not perform a second action");
  assert.strictEqual(event.prevented, 1);
  assert.strictEqual(event.stopped, 1);
}

{
  let actions = 0;
  const event = makeEvent({ key: "Tab" });
  handle(event, () => {
    actions += 1;
  });
  assert.strictEqual(actions, 0, "non-activation keys must keep their native behavior");
  assert.strictEqual(event.prevented, 0, "Tab must remain available for focus navigation");
  assert.strictEqual(event.stopped, 0, "unrelated keys must not be intercepted");
}

const upMarker = 'title="点按上移，按住移到最上方"';
const downMarker = 'title="点按下移，按住移到最下方"';
const deleteMarker = 'title="点按删除这条评论；按住可同时清理反向链接"';
const upStart = source.indexOf(upMarker);
const downStart = source.indexOf(downMarker);
const deleteStart = source.indexOf(deleteMarker);
assert.notStrictEqual(upStart, -1, "up quick action must exist");
assert.notStrictEqual(downStart, -1, "down quick action must exist");
assert.notStrictEqual(deleteStart, -1, "delete quick action must exist");
const upSource = source.slice(upStart, downStart);
const downSource = source.slice(downStart, deleteStart);
const deleteSource = source.slice(deleteStart, source.indexOf("</button>", deleteStart) + "</button>".length);

assert.ok(upSource.includes('onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "up", false)))}'), "Enter/Space on up must use the existing one-step move path");
assert.ok(downSource.includes('onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "down", false)))}'), "Enter/Space on down must use the existing one-step move path");
assert.ok(deleteSource.includes('onKeyDown={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => deleteSingleComment(comment.index)))}'), "Enter/Space on delete must use the existing single-delete path");

for (const [label, section] of [["up", upSource], ["down", downSource], ["delete", deleteSource]]) {
  assert.ok(section.includes('onClick={(event) => event.stopPropagation()}'), `${label} click must remain isolated from card selection`);
  assert.ok(section.includes("onContextMenu={(event) => event.preventDefault()}"), `${label} long-press context menu protection must remain`);
  assert.ok(section.includes("onDragStart={(event) => event.preventDefault()}"), `${label} drag suppression must remain`);
  assert.ok(section.includes("onSelectStart={(event) => event.preventDefault()}"), `${label} text-selection suppression must remain`);
}

assert.ok(upSource.includes('onPointerDown={(event) => startQuickMovePress(event, comment.index, "up")}'));
assert.ok(upSource.includes('onPointerUp={(event) => finishQuickMovePress(event, comment.index, "up")}'));
assert.ok(upSource.includes('onPointerLeave={(event) => cancelQuickMovePress(event, comment.index)}'));
assert.ok(upSource.includes('onPointerCancel={(event) => cancelQuickMovePress(event, comment.index)}'));
assert.ok(downSource.includes('onPointerDown={(event) => startQuickMovePress(event, comment.index, "down")}'));
assert.ok(downSource.includes('onPointerUp={(event) => finishQuickMovePress(event, comment.index, "down")}'));
assert.ok(deleteSource.includes('onPointerDown={(event) => startSingleDeletePress(event, comment.index)}'));
assert.ok(deleteSource.includes('onPointerUp={(event) => endSingleDeletePress(event, comment.index)}'));
assert.ok(deleteSource.includes("onPointerLeave={cancelSingleDeletePress}"));
assert.ok(deleteSource.includes("onPointerCancel={cancelSingleDeletePress}"));
assert.ok(upSource.includes('onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "up", false)))}'), "Space on up must use the existing one-step move path on keyup");
assert.ok(downSource.includes('onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => moveSingleComment(comment.index, "down", false)))}'), "Space on down must use the existing one-step move path on keyup");
assert.ok(deleteSource.includes('onKeyUp={(event) => handleQuickActionKeyboardEvent(event, () => execute(() => deleteSingleComment(comment.index)))}'), "Space on delete must use the existing single-delete path on keyup");

assert.ok(upSource.includes('aria-label={`上移评论 #${comment.index}`}'), "up must have a descriptive accessible name");
assert.ok(downSource.includes('aria-label={`下移评论 #${comment.index}`}'), "down must have a descriptive accessible name");
assert.ok(deleteSource.includes('aria-label={`删除评论 #${comment.index}`}'), "delete must have a descriptive accessible name");
assert.ok(!upSource.includes('moveSingleComment(comment.index, "up", true)'), "keyboard must not invoke the long-press move-to-edge action");
assert.ok(!downSource.includes('moveSingleComment(comment.index, "down", true)'), "keyboard must not invoke the long-press move-to-edge action");
assert.ok(!deleteSource.includes("confirmSingleBidirectionalDelete"), "keyboard delete must not silently invoke the long-press bidirectional delete");

const originalQuickActionSections = `${upSource}
${downSource}
${deleteSource}`;
assert.strictEqual((originalQuickActionSections.match(/onKeyDown=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 3, "the original three row actions must each keep one keydown handler");
assert.strictEqual((originalQuickActionSections.match(/onKeyUp=\{\(event\) => handleQuickActionKeyboardEvent/g) || []).length, 3, "the original three row actions must each keep one keyup handler");
assert.ok(source.includes('if (event.key === "Enter" || event.key === " ")'), "the comment card's own keyboard selection behavior must remain available when the card itself is focused");
assert.ok(source.includes("}, 520);"), "quick move long-press threshold must remain 520ms");
assert.ok(source.includes("}, 560);"), "single delete long-press threshold must remain 560ms");
assert.ok(styles.includes(".quick-action-btn:focus-visible"), "existing visible keyboard focus treatment must remain");
assert.ok(styles.includes("touch-action: none"), "existing pointer gesture isolation must remain");

console.log("comment quick-action keyboard regression passed");
