const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const appPath = path.join(root, "web", "src", "App.jsx");
const cssPath = path.join(root, "web", "src", "styles.css");
const source = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(cssPath, "utf8");

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
  throw new Error(`No matching brace for index ${openIndex}`);
}

function extractConstArrow(text, name) {
  const marker = `const ${name} = `;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const arrow = text.indexOf("=>", start + marker.length);
  assert.notStrictEqual(arrow, -1, `${name} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  assert.notStrictEqual(open, -1, `${name} must have a block body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 2);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

(async () => {
  const batchStart = source.indexOf("function BatchCommentEditor");
  const batchEnd = source.indexOf("\nfunction ActionButtonSettingsDialog", batchStart);
  assert.notStrictEqual(batchStart, -1, "BatchCommentEditor must exist");
  assert.notStrictEqual(batchEnd, -1, "BatchCommentEditor boundary must exist");
  const batchSource = source.slice(batchStart, batchEnd);
  const saveSource = extractConstArrow(batchSource, "saveRecording");

  function makeSaveHarness(overrides = {}) {
    const events = [];
    const context = vm.createContext({
      name: overrides.name ?? "  Recorded batch  ",
      steps: overrides.steps ?? [{ kind: "action", actionId: "copyText", options: {} }],
      busy: overrides.busy ?? false,
      batchOperationRef: { current: overrides.batchOperation ?? null },
      report: (message) => events.push(["report", message]),
      recordingSaveRef: { current: false },
      setSavingRecording: (value) => events.push(["saving", value]),
      setRecordingSaveFeedback: (value) => events.push(["feedback", value]),
      MNBridge: {
        send: overrides.send || (async (command, payload) => {
          events.push(["bridge", command, payload]);
          return { name: "Recorded batch" };
        }),
      },
      onStatus: (message) => events.push(["status", message]),
      mountedRef: overrides.mountedRef || { current: true },
      setEditorMessage: (message) => events.push(["editorMessage", message]),
      setEditorMessageKind: (value) => events.push(["editorMessageKind", value]),
      setSavedRecordingSignature: (value) => events.push(["savedSignature", value]),
      batchRecordingDraftSignature: (name, steps) => JSON.stringify({
        name: String(name || "").trim(),
        steps: JSON.parse(JSON.stringify(Array.isArray(steps) ? steps : [])),
      }),
      setRecording: (value) => events.push(["recording", value]),
      setName: (value) => events.push(["name", value]),
      normalizeError: (error) => error?.message || String(error),
    });
    vm.runInContext(`${saveSource}\nthis.saveRecording = saveRecording;`, context, {
      filename: "App-batch-save-recording.js",
    });
    return { context, events, saveRecording: context.saveRecording };
  }

  {
    const deferred = createDeferred();
    let calls = 0;
    const harness = makeSaveHarness({
      send: async (command, payload) => {
        calls += 1;
        assert.strictEqual(command, "saveWorkflow");
        assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), {
          name: "Recorded batch",
          scope: "batch",
          steps: [{ kind: "action", actionId: "copyText", options: {} }],
        });
        return deferred.promise;
      },
    });

    const first = harness.saveRecording();
    const second = harness.saveRecording();
    await Promise.resolve();
    assert.strictEqual(calls, 1, "same-tick double activation must create only one save request");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(harness.events.slice(0, 2))), [
      ["saving", true],
      ["feedback", {
        kind: "saving",
        message: "正在保存工作流「Recorded batch」…录制草稿已锁定；关闭编辑器不会撤回已发出的保存请求。",
      }],
    ], "the independent pending state must become visible before awaiting Native");
    assert.strictEqual(await second, undefined, "the duplicate attempt must return without a second mutation");

    deferred.reject(new Error("native save failed"));
    await first;
    assert.strictEqual(calls, 1, "failure recovery must not retry the mutation");
    assert.ok(harness.events.some((item) => item[0] === "feedback" && item[1]?.kind === "error" && item[1].message.includes("录制名称和步骤仍保留")), "failure must be explained inside the recording section");
    assert.ok(!harness.events.some((item) => item[0] === "recording"), "failure must not stop recording or discard the visible draft");
    assert.ok(!harness.events.some((item) => item[0] === "name"), "failure must not clear the workflow name");
    assert.deepStrictEqual(harness.events[harness.events.length - 1], ["saving", false], "the independent pending state must always be released after an explicit failure");
  }

  {
    const harness = makeSaveHarness();
    await harness.saveRecording();
    assert.ok(harness.events.some((item) => item[0] === "status" && item[1] === "已保存工作流「Recorded batch」"));
    assert.ok(harness.events.some((item) => item[0] === "savedSignature"), "success must mark the post-save local draft as clean without clearing the retained steps");
    assert.ok(harness.events.some((item) => item[0] === "recording" && item[1] === false), "success must preserve the existing stop-recording behavior");
    assert.ok(harness.events.some((item) => item[0] === "name" && item[1] === ""), "success must preserve the existing name reset");
    assert.deepStrictEqual(harness.events[harness.events.length - 1], ["saving", false]);
  }

  {
    let calls = 0;
    const harness = makeSaveHarness({ busy: true, send: async () => { calls += 1; } });
    await harness.saveRecording();
    assert.strictEqual(calls, 0, "recording must not be saved while a batch mutation or preview is already active");
    assert.deepStrictEqual(harness.events, [["report", "请等待当前批量操作完成后再保存工作流"]]);
  }

  {
    let calls = 0;
    const harness = makeSaveHarness({ name: "   ", send: async () => { calls += 1; } });
    await harness.saveRecording();
    assert.strictEqual(calls, 0);
    assert.deepStrictEqual(harness.events, [["report", "请先录制至少一个动作并填写名称"]]);
  }

  {
    const deferred = createDeferred();
    const mountedRef = { current: true };
    const harness = makeSaveHarness({ mountedRef, send: async () => deferred.promise });
    const pending = harness.saveRecording();
    await Promise.resolve();
    mountedRef.current = false;
    deferred.resolve({ name: "Recorded batch" });
    await pending;
    assert.ok(harness.events.some((item) => item[0] === "status"), "a completed save may still publish its result to the parent status area");
    assert.ok(!harness.events.some((item) => item[0] === "recording"), "a late response must not write local state after the editor closes");
    assert.ok(!harness.events.some((item) => item[0] === "name"), "a late response must not clear unmounted local state");
    assert.ok(!harness.events.some((item) => item[0] === "saving" && item[1] === false), "an unmounted editor must not receive a final local pending update");
  }

  assert.ok(batchSource.includes("const [savingRecording, setSavingRecording] = useState(false)"), "workflow saving needs a pending state independent from batch execution");
  assert.ok(batchSource.includes("const [recordingSaveFeedback, setRecordingSaveFeedback] = useState(null)"), "the recording section needs local result feedback");
  assert.ok(batchSource.includes("const recordingSaveRef = useRef(false)"), "same-tick duplicate saves need a synchronous guard");
  assert.ok(batchSource.includes("const mountedRef = useRef(true)"), "late save responses must not update a closed editor");
  assert.ok(batchSource.includes("mountedRef.current = true"), "StrictMode setup must restore the mounted flag");
  assert.ok(batchSource.includes("if (!recording || recordingSaveRef.current) return;"), "late batch completions must not append steps while the draft is being saved");
  assert.ok(batchSource.includes('disabled={busy || savingRecording} onClick={toggleRecording}'), "recording mode must not be changed during either a batch operation or a recording save");
  assert.ok(batchSource.includes("disabled={busy || savingRecording || !!selectorError}"), "new recorded actions must be blocked while saving the current draft");
  assert.ok(batchSource.includes('readOnly={savingRecording}'), "the submitted workflow name must remain visible but immutable while pending");
  assert.ok(batchSource.includes('aria-label="工作流名称"'), "the workflow name needs an explicit accessible name");
  assert.ok(batchSource.includes("disabled={savingRecording || busy}"), "save must not overlap with itself or an active batch operation");
  assert.ok(batchSource.includes('{savingRecording ? "保存中…" : "保存工作流"}'), "the primary save action must expose its pending state");
  assert.ok(batchSource.includes('aria-busy={savingRecording ? "true" : undefined}'), "pending recording save must be exposed to assistive technology");
  assert.ok(batchSource.includes('role={recordingSaveFeedback.kind === "error" ? "alert" : "status"}'), "failure must be announced as an alert without turning pending into an error");
  assert.ok(batchSource.includes("if (!mountedRef.current) return;"), "late success and failure must stop before local state writes");
  assert.strictEqual((saveSource.match(/MNBridge\.send\("saveWorkflow"/g) || []).length, 1, "saveRecording must issue at most one workflow mutation per attempt");
  assert.ok(!saveSource.includes("setBusy("), "workflow saving must not overload the batch execution busy state");
  assert.ok(!saveSource.includes("setSteps("), "U-18 must preserve the existing saved-draft step lifecycle rather than silently changing it");

  const previewButton = batchSource.match(/<Button className="secondary wide" disabled=\{([^}]*)\} onClick=\{previewSelection\}>\{batchOperationKind === "preview" \? "预览中…" : "预览匹配"\}<\/Button>/);
  assert.ok(previewButton, "the preview button must remain discoverable and expose its pending label");
  assert.ok(!previewButton[1].includes("savingRecording"), "read-only preview remains independent from the recording save pending state");
  assert.ok(batchSource.includes('<Button data-batch-editor-close className="secondary" disabled={busy} onClick={requestEditorClose}>关闭</Button>'), "the editor must remain closable while saving through the explicit close guard");

  assert.ok(styles.includes(".batch-recording { margin-top: 16px; background: var(--bg-panel-soft); }"), "the recording panel must remain legible in dark mode");
  assert.ok(styles.includes("background: var(--bg-panel); color: var(--text-primary);"), "batch controls must not fall back to white-on-white colors in dark mode");
  assert.ok(styles.includes(".batch-recording p.batch-recording-save-feedback"), "the recording result needs a local status surface");
  assert.ok(styles.includes(".batch-recording p.batch-recording-save-feedback.error"), "save failure needs a non-color-only bordered state");

  console.log("batch recording save regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
