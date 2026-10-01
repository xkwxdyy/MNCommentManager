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
  const asyncMarker = `async function ${name}(`;
  const marker = `function ${name}(`;
  const asyncStart = text.indexOf(asyncMarker);
  const start = asyncStart !== -1 ? asyncStart : text.indexOf(marker);
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

const helperSource = [
  extractFunction(source, "normalizeError"),
  extractFunction(source, "applyActionButtonSettingsForSession"),
  extractFunction(source, "persistActionButtonSetting"),
].join("\n");
const context = vm.createContext({ JSON, String });
vm.runInContext(`${helperSource}\nthis.helpers = { persistActionButtonSetting, applyActionButtonSettingsForSession };`, context, {
  filename: "App-action-button-settings-helper.js",
});
const { persistActionButtonSetting: persist, applyActionButtonSettingsForSession: applySession } = context.helpers;

(async () => {
  {
    const current = { sessionId: 4, values: { showBatchButton: true }, returnFocusTarget: { id: "settings" } };
    const next = applySession(current, 4, { showBatchButton: false });
    assert.notStrictEqual(next, current);
    assert.strictEqual(next.sessionId, 4);
    assert.strictEqual(next.returnFocusTarget.id, "settings");
    assert.strictEqual(next.values.showBatchButton, false);
    assert.strictEqual(applySession(current, 5, { showBatchButton: false }), current, "a stale response must not mutate a newer dialog session");
    assert.strictEqual(applySession(null, 4, { showBatchButton: false }), null, "a closed dialog must remain closed after a late response");
  }

  {
    const calls = [];
    const result = await persist(
      async (changes) => {
        calls.push(["change", JSON.parse(JSON.stringify(changes))]);
        return { showBatchButton: false, enableDynamicSingleCardButton: true };
      },
      async () => {
        calls.push(["reload"]);
        return null;
      },
      "showBatchButton",
      false,
      "多选时显示评论按钮",
    );
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
      kind: "success",
      message: "“多选时显示评论按钮”已保存",
      settings: { showBatchButton: false, enableDynamicSingleCardButton: true },
    });
    assert.deepStrictEqual(calls, [["change", { showBatchButton: false }]], "a confirmed save must not issue an unnecessary readback");
  }

  {
    let changeCount = 0;
    let reloadCount = 0;
    const result = await persist(
      async () => {
        changeCount += 1;
        return { showBatchButton: true };
      },
      async () => {
        reloadCount += 1;
        return { showBatchButton: false };
      },
      "showBatchButton",
      false,
      "多选时显示评论按钮",
    );
    assert.strictEqual(result.kind, "success");
    assert.ok(result.message.includes("完成核对"));
    assert.strictEqual(changeCount, 1);
    assert.strictEqual(reloadCount, 1, "a mismatched write response must be reconciled with one safe read");
  }

  {
    let changeCount = 0;
    let reloadCount = 0;
    const result = await persist(
      async () => {
        changeCount += 1;
        throw new Error("native response lost");
      },
      async () => {
        reloadCount += 1;
        return { enableDynamicSingleCardButton: false };
      },
      "enableDynamicSingleCardButton",
      false,
      "单卡时显示“评”按钮",
    );
    assert.strictEqual(result.kind, "warning");
    assert.ok(result.message.includes("已生效"));
    assert.ok(result.message.includes("native response lost"));
    assert.strictEqual(changeCount, 1, "a failed write response must never trigger a write retry");
    assert.strictEqual(reloadCount, 1);
  }

  {
    let changeCount = 0;
    const result = await persist(
      async () => {
        changeCount += 1;
        throw "write failed";
      },
      async () => ({ showBatchButton: true }),
      "showBatchButton",
      false,
      "多选时显示评论按钮",
    );
    assert.strictEqual(result.kind, "error");
    assert.ok(result.message.includes("write failed"));
    assert.ok(result.message.includes("已重新读取当前设置"));
    assert.strictEqual(result.settings.showBatchButton, true);
    assert.strictEqual(changeCount, 1, "the recovery path may read but must not automatically replay the mutation");
  }

  {
    const result = await persist(
      async () => { throw new Error("write failed"); },
      async () => { throw new Error("read failed"); },
      "showBatchButton",
      false,
      "多选时显示评论按钮",
    );
    assert.strictEqual(result.kind, "error");
    assert.ok(result.message.includes("write failed"));
    assert.ok(result.message.includes("read failed"));
    assert.ok(result.message.includes("重新打开核对"));
  }

  const appStart = source.indexOf("function App()");
  const appEnd = source.indexOf("\nfunction BatchCommentEditor", appStart);
  assert.notStrictEqual(appStart, -1, "App must exist");
  assert.notStrictEqual(appEnd, -1, "App boundary must exist");
  const app = source.slice(appStart, appEnd);

  const openSource = extractConstArrow(app, "openActionButtonSettings");
  assert.ok(openSource.startsWith("const openActionButtonSettings = async (event) =>"));
  assert.ok(openSource.includes("const returnFocusTarget = event?.currentTarget || null"));
  assert.ok(openSource.includes("const sessionId = actionButtonSettingsSessionRef.current + 1"));
  assert.ok(openSource.includes("actionButtonSettingsSessionRef.current = sessionId"));
  assert.ok(openSource.indexOf("returnFocusTarget") < openSource.indexOf('await MNBridge.send("getActionButtonSettings")'), "the opener must be retained before the async read");
  assert.ok(openSource.includes("if (!appMountedRef.current || actionButtonSettingsSessionRef.current !== sessionId) return"), "a stale or post-unmount open response must not replace a newer dialog session");
  assert.ok(openSource.includes("setActionButtonSettings({ values: settings, returnFocusTarget, sessionId })"));

  const updateSource = extractConstArrow(app, "updateActionButtonSettings");
  assert.strictEqual((updateSource.match(/MNBridge\.send\("updateActionButtonSettings"/g) || []).length, 1);
  assert.ok(updateSource.includes('MNBridge.send("updateActionButtonSettings", changes)'), "the existing command and payload must remain unchanged");
  assert.ok(updateSource.includes("applyActionButtonSettingsForSession(current, sessionId, settings)"), "a late response must not reopen or overwrite a newer settings dialog session");
  assert.ok(updateSource.includes("return settings"), "the dialog must receive the Native readback for verification");

  const reloadSource = extractConstArrow(app, "reloadActionButtonSettings");
  assert.strictEqual((reloadSource.match(/MNBridge\.send\("getActionButtonSettings"/g) || []).length, 1);
  assert.ok(reloadSource.includes("applyActionButtonSettingsForSession(current, sessionId, settings)"));
  assert.ok(reloadSource.includes("return settings"));

  const closeSource = extractConstArrow(app, "closeActionButtonSettings");
  assert.ok(closeSource.indexOf("actionButtonSettingsSessionRef.current += 1") < closeSource.indexOf("setActionButtonSettings(null)"), "closing must invalidate in-flight responses before unmounting the dialog");

  assert.ok(app.includes("settings={actionButtonSettings.values}"));
  assert.ok(app.includes("onChange={(changes) => updateActionButtonSettings(changes, actionButtonSettings.sessionId)}"));
  assert.ok(app.includes("onReload={() => reloadActionButtonSettings(actionButtonSettings.sessionId)}"));
  assert.ok(app.includes("onStatus={notifyStatus}"));
  assert.ok(app.includes("returnFocusTarget={actionButtonSettings.returnFocusTarget}"));
  assert.ok(app.includes("onClose={closeActionButtonSettings}"));
  assert.ok(app.includes('onClick={openActionButtonSettings} title="评论管理设置"'), "the top-level settings button must retain its opener");
  assert.ok(app.includes('{openingOverlay === "settings" ? "打开中…" : "设置"}'), "the settings button must expose its opening state");
  assert.ok(app.includes('disabled={loading || !!openingOverlay || closingPanel}'), "overlay openers must share the same duplicate-open gate");

  const dialogStart = source.indexOf("function ActionButtonSettingsDialog(");
  const dialogEnd = source.indexOf("\nconst WORKFLOW_POSITION_MODES =", dialogStart);
  assert.notStrictEqual(dialogStart, -1, "ActionButtonSettingsDialog must exist");
  assert.notStrictEqual(dialogEnd, -1, "ActionButtonSettingsDialog boundary must exist");
  const dialog = source.slice(dialogStart, dialogEnd);

  assert.ok(dialog.includes("const dialogRef = useRef(null)"));
  assert.ok(dialog.includes("const firstCheckboxRef = useRef(null)"));
  assert.ok(dialog.includes('const savingRef = useRef("")'));
  assert.ok(dialog.includes('const [savingKey, setSavingKey] = useState("")'));
  assert.ok(dialog.includes("const busy = loading || !!savingKey"));
  assert.ok(dialog.includes("focusInitialDialogControl(dialogElement, preferredTarget)"));
  assert.ok(dialog.includes("keepFocusWithinDialog(event, dialogRef.current)"));
  assert.ok(dialog.includes('if (event.key === "Escape")'));
  assert.ok(dialog.includes("restoreFocusAfterDialogClose(returnFocusTarget)"));
  assert.ok(dialog.includes('aria-busy={busy ? "true" : undefined}'));
  assert.ok(dialog.includes("tabIndex={-1}"));
  assert.ok(dialog.includes('role={feedback.kind === "error" || feedback.kind === "warning" ? "alert" : "status"}'));
  assert.ok(dialog.includes("关闭窗口不会取消本次保存"), "the pending state must not imply that closing cancels a Native mutation");
  assert.ok(dialog.includes('onChange={(event) => saveSetting("showBatchButton", event.target.checked, "多选时显示评论按钮")}'));
  assert.ok(dialog.includes('onChange={(event) => saveSetting("enableDynamicSingleCardButton", event.target.checked, "单卡时显示“评”按钮")}'));
  assert.strictEqual((dialog.match(/persistActionButtonSetting\(/g) || []).length, 1, "each user change must pass through one guarded save lifecycle");
  assert.ok(dialog.includes("if (loading || savingRef.current) return"), "same-tick duplicate settings mutations must be blocked synchronously");
  assert.ok(dialog.includes("disabled={busy}"), "both settings must be locked while one write/readback sequence is pending");
  assert.ok(dialog.includes('<Button className="primary" onClick={requestClose}>完成</Button>'));
  assert.ok(!dialog.includes("window.confirm"));
  assert.ok(!dialog.includes("AbortController"), "the UI must not claim it can cancel an already-started Native save");

  assert.ok(styles.includes(".dialog .action-button-settings-status"));
  assert.ok(styles.includes(".dialog .action-button-settings-status.success"));
  assert.ok(styles.includes(".dialog .action-button-settings-status.warning"));
  assert.ok(styles.includes(".dialog .action-button-settings-status.error"));
  assert.ok(styles.includes(".dialog-check.saving"));
  assert.ok(styles.includes("var(--accent-green)"));
  assert.ok(styles.includes("var(--accent-orange)"));
  assert.ok(styles.includes("var(--accent-red)"));

  console.log("action button settings dialog regression passed");
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
