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
  let templateDepth = 0;

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
        templateDepth += 1;
        depth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        depth -= 1;
        continue;
      }
      if (char === quote && templateDepth === 0) quote = "";
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
  throw new Error(`No matching brace at ${openIndex}`);
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
  assert.notStrictEqual(open, -1, `${name} must have a block body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 2);
}

function makeFocusable(name, ownerDocument, log) {
  return {
    name,
    disabled: false,
    hidden: false,
    tabIndex: 0,
    isConnected: true,
    getAttribute(attribute) {
      if (attribute === "aria-hidden") return null;
      if (attribute === "type") return "button";
      return null;
    },
    focus() {
      ownerDocument.activeElement = this;
      log.push(name);
    },
  };
}

const selectorStart = source.indexOf("const DIALOG_FOCUSABLE_SELECTOR =");
const selectorEnd = source.indexOf(";\n\nfunction getDialogFocusableElements", selectorStart);
assert.notStrictEqual(selectorStart, -1, "dialog focus selector must exist");
assert.notStrictEqual(selectorEnd, -1, "dialog focus selector boundary must exist");
const selectorSource = source.slice(selectorStart, selectorEnd + 1);
const helperSource = [
  selectorSource,
  extractFunction(source, "getDialogFocusableElements"),
  extractFunction(source, "keepFocusWithinDialog"),
  extractFunction(source, "focusInitialDialogControl"),
  extractFunction(source, "restoreFocusAfterDialogClose"),
].join("\n");

const animationFrames = [];
const helperContext = vm.createContext({
  Array,
  String,
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
  },
  setTimeout(callback) {
    animationFrames.push(callback);
  },
});
vm.runInContext(
  `${helperSource}\nthis.helpers = { keepFocusWithinDialog, focusInitialDialogControl, restoreFocusAfterDialogClose };`,
  helperContext,
  { filename: "App-workflow-manager-focus-helpers.js" },
);
const { keepFocusWithinDialog, focusInitialDialogControl, restoreFocusAfterDialogClose } = helperContext.helpers;

{
  const log = [];
  const ownerDocument = { activeElement: null };
  const cancel = makeFocusable("cancel", ownerDocument, log);
  const confirm = makeFocusable("confirm", ownerDocument, log);
  const dialog = {
    tabIndex: -1,
    ownerDocument,
    querySelectorAll() {
      return [cancel, confirm];
    },
    contains(element) {
      return element === cancel || element === confirm;
    },
    focus() {
      ownerDocument.activeElement = this;
      log.push("dialog");
    },
  };

  assert.strictEqual(focusInitialDialogControl(dialog, cancel), true);
  assert.deepStrictEqual(log, ["cancel"], "destructive workflow confirmation must initially focus Cancel");

  log.length = 0;
  ownerDocument.activeElement = confirm;
  const forward = { key: "Tab", shiftKey: false, preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  assert.strictEqual(keepFocusWithinDialog(forward, dialog), true);
  assert.strictEqual(forward.preventDefaultCalled, true);
  assert.deepStrictEqual(log, ["cancel"], "forward Tab from the last control must wrap to the first control");

  log.length = 0;
  ownerDocument.activeElement = cancel;
  const backward = { key: "Tab", shiftKey: true, preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  assert.strictEqual(keepFocusWithinDialog(backward, dialog), true);
  assert.deepStrictEqual(log, ["confirm"], "Shift+Tab from the first control must wrap to the last control");
}

{
  const log = [];
  const ownerDocument = { activeElement: null };
  const trigger = makeFocusable("trigger", ownerDocument, log);
  const fallback = makeFocusable("manager", ownerDocument, log);
  restoreFocusAfterDialogClose(trigger, fallback);
  assert.strictEqual(animationFrames.length, 1, "focus restoration must be deferred until React commits the close");
  animationFrames.shift()();
  assert.deepStrictEqual(log, ["trigger"]);

  log.length = 0;
  trigger.disabled = true;
  restoreFocusAfterDialogClose(trigger, fallback);
  animationFrames.shift()();
  assert.deepStrictEqual(log, ["manager"], "a disabled delete trigger must fall back to the workflow manager");
}

const appStart = source.indexOf("function App()");
const appEnd = source.indexOf("\nfunction BatchCommentEditor", appStart);
assert.notStrictEqual(appStart, -1, "App must exist");
assert.notStrictEqual(appEnd, -1, "App boundary must exist");
const app = source.slice(appStart, appEnd);
const openWorkflowManagerSource = extractConstArrow(app, "openWorkflowManager");
assert.ok(openWorkflowManagerSource.startsWith("const openWorkflowManager = async (event) =>"), "the outer workflow button event must be captured before the async reads");
assert.ok(openWorkflowManagerSource.includes("const returnFocusTarget = event?.currentTarget || null"));
assert.ok(openWorkflowManagerSource.indexOf("const returnFocusTarget") < openWorkflowManagerSource.indexOf("await Promise.all"), "the React currentTarget must be retained before awaiting the bridge");
assert.ok(openWorkflowManagerSource.includes("returnFocusTarget,"), "the opener must travel with the in-memory manager state");
assert.ok(app.includes("returnFocusTarget={workflowManager.returnFocusTarget}"), "the manager must receive its outer opener");
assert.ok(app.includes('onClick={openWorkflowManager} title="管理已保存工作流"'), "the workflow button must retain the real opener");
assert.ok(app.includes('{openingOverlay === "workflow" ? "打开中…" : "工作流"}'), "the workflow opener must expose its pending state");

const managerStart = source.indexOf("function WorkflowManagerDialog(");
const managerEnd = source.indexOf("\nfunction Dialog(", managerStart);
assert.notStrictEqual(managerStart, -1, "WorkflowManagerDialog must exist");
assert.notStrictEqual(managerEnd, -1, "WorkflowManagerDialog boundary must exist");
const manager = source.slice(managerStart, managerEnd);
assert.ok(manager.startsWith("function WorkflowManagerDialog({ initialCatalog, initialWorkflows, returnFocusTarget, onClose, onStatus })"));
assert.ok(manager.includes("const workflowManagerRef = useRef(null)"));
assert.ok(manager.includes("const deleteDialogRef = useRef(null)"));
assert.ok(manager.includes("const deleteReturnFocusTargetRef = useRef(null)"));

const closeManagerSource = extractConstArrow(manager, "closeWorkflowManager");
assert.ok(closeManagerSource.indexOf("onClose()") < closeManagerSource.indexOf("restoreFocusAfterDialogClose(returnFocusTarget)"), "outer focus must restore only after requesting the React close");
assert.ok(manager.includes('if (transition.kind === "close") {\n      closeWorkflowManager();'), "clean and confirmed-dirty closes must share the outer restoration path");

const focusStartSource = extractConstArrow(manager, "focusWorkflowManagerStart");
assert.ok(focusStartSource.includes('[data-workflow-selected="true"]'), "an existing selected workflow must be the preferred initial target");
assert.ok(focusStartSource.includes("[data-workflow-create]"), "an empty manager must prefer New workflow");
assert.ok(focusStartSource.includes("[data-workflow-close]"), "the header close button must remain a final safe fallback");
assert.ok(manager.includes("focusWorkflowManagerStart();\n  }, []);"), "the manager must receive deterministic initial focus on mount");
assert.ok(manager.includes("data-workflow-create"));
assert.ok(manager.includes('data-workflow-selected={selectedId === workflow.id ? "true" : undefined}'));
assert.ok(manager.includes("data-workflow-close"));

assert.ok(manager.includes('if (confirmDelete || pendingDraftTransition || pendingMutationClose) return'), "the main focus trap must not fight a nested alertdialog");
assert.ok(manager.includes("keepFocusWithinDialog(event, workflowManagerRef.current)"), "the main dialog must trap forward and reverse Tab navigation");
assert.ok(manager.includes('if (event.key === "Escape")'));
assert.ok(manager.includes("requestWorkflowManagerClose(event.target)"), "dirty Escape cancellation must restore the exact active manager control");
assert.ok(manager.includes('tabIndex={-1}'));

const requestCloseSource = extractConstArrow(manager, "requestWorkflowManagerClose");
assert.ok(requestCloseSource.includes("eventOrTarget?.currentTarget || eventOrTarget || null"), "click and keyboard close paths must preserve the correct internal return target for the U-13 guard");

const removeSource = extractConstArrow(manager, "remove");
assert.ok(removeSource.startsWith("const remove = (event) =>"));
assert.ok(removeSource.indexOf("deleteReturnFocusTargetRef.current = event?.currentTarget || null") < removeSource.indexOf("setConfirmDelete(true)"), "the delete button must be retained before opening the nested dialog");

const cancelDeleteSource = extractConstArrow(manager, "cancelDeleteConfirmation");
assert.ok(cancelDeleteSource.includes("setConfirmDelete(false)"));
assert.ok(cancelDeleteSource.includes("restoreFocusAfterDialogClose(returnFocusTarget, workflowManagerRef.current)"), "cancel, Escape, and backdrop dismissal must return to the delete trigger");
assert.ok(manager.includes("data-workflow-delete-cancel"));
assert.ok(manager.includes("focusInitialDialogControl(dialogElement, cancelButton)"), "the delete alertdialog must initially focus Cancel");
assert.ok(manager.includes("keepFocusWithinDialog(event, deleteDialogRef.current)"), "the delete alertdialog must trap Tab navigation independently");
assert.ok(manager.includes("onClick={cancelDeleteConfirmation}"), "backdrop and Cancel must use the same restoration path");
assert.ok(manager.includes('aria-describedby="workflow-delete-description"'));
assert.ok(manager.includes('id="workflow-delete-description"'));
assert.ok(manager.includes("ref={deleteDialogRef}"));
assert.ok(manager.includes("data-workflow-delete"));
assert.ok(!manager.includes("onClick={() => !busy && setConfirmDelete(false)}"), "no delete dismissal path may bypass focus restoration");

const removeConfirmedSource = extractConstArrow(manager, "removeConfirmed");
assert.ok(removeConfirmedSource.includes('MNBridge.send("deleteWorkflow", { id: draft.id })'), "the Native command and payload must remain unchanged");
assert.ok(removeConfirmedSource.indexOf("setConfirmDelete(false)") < removeConfirmedSource.indexOf("setBusy(true)"));
assert.ok(removeConfirmedSource.indexOf("setBusy(true)") < removeConfirmedSource.indexOf('MNBridge.send("deleteWorkflow"'), "confirm-delete must preserve the existing close-then-busy-then-bridge order");
assert.ok(removeConfirmedSource.includes("restoreFocusAfterDialogClose(null, workflowManagerRef.current)"), "a long deletion must keep focus inside the still-open manager");
assert.ok(removeConfirmedSource.includes("if (deleted) scheduleWorkflowManagerStartFocus()"), "successful deletion must focus the newly selected workflow or New workflow control");
assert.ok(removeConfirmedSource.includes("else restoreFocusAfterDialogClose(deleteReturnFocusTarget, workflowManagerRef.current)"), "failed deletion must return to the original delete button when possible");
assert.strictEqual((removeConfirmedSource.match(/MNBridge\.send\("deleteWorkflow"/g) || []).length, 1, "focus handling must not add a delete retry");

assert.ok(manager.includes("keepFocusWithinDialog(event, discardDialogRef.current)"), "the U-13 unsaved confirmation focus boundary must remain intact");
assert.ok(manager.includes("restoreFocusAfterDialogClose(transition.returnFocusTarget, workflowManagerRef.current)"), "cancelling the U-13 prompt must still return to its exact trigger");
assert.ok(!manager.includes("window.confirm"));

assert.ok(styles.includes(".workflow-manager:focus-visible"), "the manager fallback focus target must have a visible ring");
assert.ok(styles.includes(".workflow-confirm-dialog:focus-visible"), "a fully disabled nested confirmation must have a visible fallback ring");

console.log("workflow manager focus regression passed");
