const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const bridgeSource = fs
  .readFileSync(path.join(rootDir, "web/src/lib/mnBridge.js"), "utf8")
  .replace(/export default MNBridge;\s*$/, "globalThis.__MNBridgeForTest = MNBridge;");
const commandSource = fs.readFileSync(path.join(rootDir, "src/WebBridgeCommands.js"), "utf8");

function createHarness(options = {}) {
  const timers = [];
  const frames = [];
  const webWindow = {};
  let nextTimerId = 1;
  let createElementCalls = 0;
  let appendCalls = 0;

  function setTimeoutForTest(callback, delay) {
    const timer = {
      id: nextTimerId,
      callback,
      delay,
      cleared: false,
      ran: false,
    };
    nextTimerId += 1;
    timers.push(timer);
    return timer.id;
  }

  function clearTimeoutForTest(timerId) {
    const timer = timers.find((candidate) => candidate.id === timerId);
    if (timer) {
      timer.cleared = true;
    }
  }

  const document = {
    createElement(tagName) {
      createElementCalls += 1;
      assert.strictEqual(tagName, "iframe");
      if (options.createElementError) {
        throw options.createElementError;
      }
      const frame = {
        style: {},
        src: "",
        removed: false,
        removeCalls: 0,
        remove() {
          this.removeCalls += 1;
          if (options.removeError) {
            throw options.removeError;
          }
          this.removed = true;
        },
      };
      frames.push(frame);
      return frame;
    },
    body: {
      appendChild(frame) {
        appendCalls += 1;
        if (options.appendError) {
          throw options.appendError;
        }
        if (typeof options.onAppend === "function") {
          options.onAppend(frame);
        }
        return frame;
      },
    },
  };

  const context = vm.createContext({
    window: webWindow,
    document,
    setTimeout: setTimeoutForTest,
    clearTimeout: clearTimeoutForTest,
    Date,
    Math,
    JSON,
    Promise,
    encodeURIComponent,
  });
  context.globalThis = context;
  vm.runInContext(bridgeSource, context, { filename: "mnBridge.js" });

  function activeTimers(delay = null) {
    return timers.filter((timer) => (
      !timer.cleared
      && !timer.ran
      && (delay === null || timer.delay === delay)
    ));
  }

  function runTimer(timer) {
    assert(timer, "timer must exist");
    assert.strictEqual(timer.cleared, false, `timer ${timer.id} must still be active`);
    assert.strictEqual(timer.ran, false, `timer ${timer.id} must not run twice`);
    timer.ran = true;
    timer.callback();
  }

  function runActiveTimers() {
    const snapshot = activeTimers().slice().sort((left, right) => left.delay - right.delay);
    snapshot.forEach(runTimer);
  }

  function pendingIds() {
    return Object.keys(webWindow.__MNBridgePending || {});
  }

  function decodeFrame(frame) {
    const prefix = "mnaddon://bridge?payload=";
    assert(String(frame.src).startsWith(prefix), "frame must contain a bridge URL");
    return JSON.parse(decodeURIComponent(String(frame.src).slice(prefix.length)));
  }

  function respond(requestId, payload = null, error = null) {
    webWindow.__MNBridgeReceive_MNCommentManagerAddon(JSON.stringify({
      requestId,
      payload,
      error,
    }));
  }

  return {
    bridge: context.__MNBridgeForTest,
    window: webWindow,
    timers,
    frames,
    activeTimers,
    runTimer,
    runActiveTimers,
    pendingIds,
    decodeFrame,
    respond,
    stats() {
      return { createElementCalls, appendCalls };
    },
  };
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected promise rejection");
}

function assertSinglePending(harness) {
  const ids = harness.pendingIds();
  assert.strictEqual(ids.length, 1, "expected exactly one pending bridge request");
  return ids[0];
}

(async function run() {
  {
    const harness = createHarness();
    harness.window.__MNBridgePending = {}; // Existing receiver state can still use an ordinary object.
    const promise = harness.bridge.send("ping");
    const requestId = assertSinglePending(harness);
    for (const raw of ["not-json", "null", "[]", "{}", '{"requestId":"__proto__"}', '{"requestId":"constructor"}']) {
      assert.doesNotThrow(() => harness.window.__MNBridgeReceive_MNCommentManagerAddon(raw));
      assert.deepStrictEqual(harness.pendingIds(), [requestId]);
    }
    harness.respond(requestId, { ok: true });
    assert.strictEqual((await promise).ok, true);
  }
  {
    const readTimeouts = {
      ping: 30000,
      echo: 30000,
      getCurrentNoteComments: 30000,
      refreshCurrentNote: 30000,
      countReverseLinks: 30000,
      previewInvalidLinkCleanup: 30000,
      getActionButtonSettings: 30000,
      getWorkflowActionCatalog: 30000,
      listWorkflows: 30000,
      getBatchCommentEditorState: 30000,
      previewBatchWorkflow: 60000,
    };
    const commandsWithoutHardTimeout = [
      "closePanel",
      "moveComments",
      "moveContentSelection",
      "deleteComments",
      "deleteContentSelection",
      "deleteBidirectionalLinks",
      "mergeTextComments",
      "mergeContentSelection",
      "mergeCommentsToExcerpt",
      "editCommentText",
      "editMarkdownLink",
      "convertHtmlCommentsToMarkdown",
      "extractCommentsToChildNote",
      "extractContentSelectionToChildNote",
      "copyText",
      "copyContentText",
      "copyCommentImage",
      "copyContentImage",
      "focusLinkedNote",
      "updateLinkCommentFromClipboard",
      "clearInvalidLinks",
      "updateActionButtonSettings",
      "runBatchWorkflow",
      "saveWorkflow",
      "deleteWorkflow",
    ];

    const commandBlockMatch = commandSource.match(/const commands = \{([\s\S]*?)\n  \};/);
    assert(commandBlockMatch, "native bridge command registry must be discoverable");
    const registeredCommands = Array.from(
      commandBlockMatch[1].matchAll(/^\s*([A-Za-z_$][\w$]*),\s*$/gm),
      (match) => match[1],
    ).sort();
    const classifiedCommands = [
      ...Object.keys(readTimeouts),
      ...commandsWithoutHardTimeout,
    ].sort();
    assert.deepStrictEqual(
      classifiedCommands,
      registeredCommands,
      "every native bridge command must remain explicitly classified for timeout behavior",
    );

    for (const [command, expectedTimeout] of Object.entries(readTimeouts)) {
      const harness = createHarness();
      const promise = harness.bridge.send(command);
      const requestId = assertSinglePending(harness);
      assert.strictEqual(
        harness.activeTimers(expectedTimeout).length,
        1,
        `${command} must use its reviewed read-only deadline`,
      );
      const otherTimeout = expectedTimeout === 30000 ? 60000 : 30000;
      assert.strictEqual(harness.activeTimers(otherTimeout).length, 0);
      harness.respond(requestId, { command });
      await promise;
    }

    for (const command of commandsWithoutHardTimeout) {
      const harness = createHarness();
      const promise = harness.bridge.send(command);
      const requestId = assertSinglePending(harness);
      assert.strictEqual(harness.activeTimers(30000).length, 0, `${command} must not use a 30-second deadline`);
      assert.strictEqual(harness.activeTimers(60000).length, 0, `${command} must not use a 60-second deadline`);
      harness.respond(requestId, { command });
      await promise;
    }
  }
  {
    let harness = null;
    harness = createHarness({
      onAppend(frame) {
        const request = harness.decodeFrame(frame);
        harness.respond(request.requestId, { synchronous: true });
      },
    });
    const result = await harness.bridge.send("ping");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { synchronous: true });
    assert.deepStrictEqual(harness.pendingIds(), []);
    const requestTimers = harness.timers.filter((timer) => timer.delay === 30000);
    assert.strictEqual(requestTimers.length, 1);
    assert.strictEqual(requestTimers[0].cleared, true, "synchronous native reads must clear their deadline");
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("ping");
    const requestId = assertSinglePending(harness);
    const requestTimers = harness.activeTimers(30000);
    assert.strictEqual(requestTimers.length, 1, "ordinary read commands must use a 30-second deadline");
    assert.strictEqual(harness.activeTimers(600).length, 1, "transport cleanup must remain 600ms");

    harness.respond(requestId, { ok: true });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await promise)), { ok: true });
    assert.deepStrictEqual(harness.pendingIds(), []);
    assert.strictEqual(requestTimers[0].cleared, true, "normal responses must clear the request deadline");
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("countReverseLinks");
    const requestId = assertSinglePending(harness);
    const requestTimer = harness.activeTimers(30000)[0];
    harness.respond(requestId, null, { message: "native read failure", command: "countReverseLinks" });
    const error = await rejectionOf(promise);
    assert.strictEqual(error.message, "native read failure");
    assert.strictEqual(error.command, "countReverseLinks");
    assert.strictEqual(requestTimer.cleared, true, "native error responses must clear the request deadline");
    assert.deepStrictEqual(harness.pendingIds(), []);
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("previewBatchWorkflow", { workflowId: "wf-1" });
    const requestId = assertSinglePending(harness);
    const requestTimers = harness.activeTimers(60000);
    assert.strictEqual(requestTimers.length, 1, "batch preview must use a 60-second deadline");
    assert.strictEqual(harness.activeTimers(30000).length, 0);
    harness.respond(requestId, { preview: true });
    await promise;
    assert.strictEqual(requestTimers[0].cleared, true);
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("getCurrentNoteComments");
    const requestId = assertSinglePending(harness);
    const deadline = harness.activeTimers(30000)[0];
    harness.runTimer(deadline);

    const timeoutError = await rejectionOf(promise);
    assert.strictEqual(timeoutError.command, "getCurrentNoteComments");
    assert.match(timeoutError.message, /MarginNote.*30.*秒.*重试/);
    assert.deepStrictEqual(Object.keys(timeoutError).sort(), ["command", "message"]);
    assert.deepStrictEqual(harness.pendingIds(), [], "timed-out reads must release their pending entry");
    assert.strictEqual(deadline.cleared, true, "the elapsed request timer must be cleared during settlement");

    assert.doesNotThrow(() => harness.respond(requestId, { stale: true }));
    assert.deepStrictEqual(harness.pendingIds(), [], "late read responses must remain ignored after timeout");
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("editCommentText", { index: 1, text: "updated" });
    const requestId = assertSinglePending(harness);
    assert.strictEqual(harness.activeTimers(30000).length, 0, "mutations must not gain a hard deadline");
    assert.strictEqual(harness.activeTimers(60000).length, 0);

    harness.runActiveTimers();
    assert.deepStrictEqual(harness.pendingIds(), [requestId], "iframe cleanup must not settle mutations");
    assert.strictEqual(harness.frames[0].removed, true);
    harness.respond(requestId, { saved: true });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await promise)), { saved: true });
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("runBatchWorkflow", { workflowId: "wf-1" });
    const requestId = assertSinglePending(harness);
    assert.strictEqual(harness.activeTimers(30000).length, 0);
    assert.strictEqual(harness.activeTimers(60000).length, 0, "long-running mutation must not use preview timeout");

    harness.runActiveTimers();
    assert.deepStrictEqual(harness.pendingIds(), [requestId], "native confirmation may remain open without timing out");
    harness.respond(requestId, { completed: true });
    await promise;
  }

  {
    const harness = createHarness();
    const readPromise = harness.bridge.send("listWorkflows");
    const mutationPromise = harness.bridge.send("saveWorkflow", { workflow: { name: "A" } });
    const [readId, mutationId] = harness.pendingIds();
    assert.notStrictEqual(readId, mutationId);

    const readDeadline = harness.activeTimers(30000)[0];
    harness.runTimer(readDeadline);
    const readError = await rejectionOf(readPromise);
    assert.strictEqual(readError.command, "listWorkflows");
    assert.deepStrictEqual(harness.pendingIds(), [mutationId], "read timeout must not remove concurrent mutation state");

    harness.respond(mutationId, { workflow: { id: "wf-2" } });
    await mutationPromise;
    assert.deepStrictEqual(harness.pendingIds(), []);
  }

  {
    const harness = createHarness();
    const circular = {};
    circular.self = circular;
    const error = await rejectionOf(harness.bridge.send("ping", circular));
    assert.match(String(error && error.message), /circular|cyclic/i);
    assert.deepStrictEqual(harness.pendingIds(), [], "serialization failure must not leak pending state");
    assert.strictEqual(harness.stats().createElementCalls, 0);
    assert.strictEqual(harness.activeTimers(30000).length, 0, "serialization failure must clear its deadline");
  }

  {
    const createError = new Error("createElement failed");
    const harness = createHarness({ createElementError: createError });
    const error = await rejectionOf(harness.bridge.send("getActionButtonSettings"));
    assert.strictEqual(error, createError);
    assert.deepStrictEqual(harness.pendingIds(), [], "iframe creation failure must not leak pending state");
    assert.strictEqual(harness.stats().appendCalls, 0);
    assert.strictEqual(harness.activeTimers(30000).length, 0);
  }

  {
    const appendError = new Error("append failed");
    const harness = createHarness({ appendError });
    const error = await rejectionOf(harness.bridge.send("getWorkflowActionCatalog"));
    assert.strictEqual(error, appendError);
    assert.deepStrictEqual(harness.pendingIds(), [], "iframe insertion failure must not leak pending state");
    assert.strictEqual(harness.frames.length, 1);
    assert.strictEqual(harness.frames[0].removed, true, "created iframe must be removed after append failure");
    assert.strictEqual(harness.activeTimers(30000).length, 0);
    assert.strictEqual(harness.activeTimers(600).length, 0, "failed append must not leave a transport timer");
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("refreshCurrentNote");
    const requestId = assertSinglePending(harness);
    const cleanup = harness.activeTimers(600)[0];
    harness.runTimer(cleanup);
    assert.strictEqual(harness.frames[0].removed, true);
    assert.deepStrictEqual(harness.pendingIds(), [requestId], "600ms cleanup must still remove only the iframe");
    assert.strictEqual(harness.activeTimers(30000).length, 1);

    harness.respond(requestId, { refreshed: true });
    await promise;
    assert.deepStrictEqual(harness.pendingIds(), []);
  }

  {
    const harness = createHarness();
    const promise = harness.bridge.send("futureCommand", { value: 1 });
    const requestId = assertSinglePending(harness);
    assert.strictEqual(harness.activeTimers(30000).length, 0, "unreviewed commands must fail closed to no hard timeout");
    assert.strictEqual(harness.activeTimers(60000).length, 0);
    harness.respond(requestId, { accepted: true });
    await promise;
  }

  console.log("bridge request lifecycle regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
