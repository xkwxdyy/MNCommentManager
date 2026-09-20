const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const panelSource = fs.readFileSync(path.join(rootDir, "src/WebPanelController.js"), "utf8");
const bridgeSource = fs
  .readFileSync(path.join(rootDir, "web/src/lib/mnBridge.js"), "utf8")
  .replace(/export default MNBridge;\s*$/, "globalThis.__MNBridgeForTest = MNBridge;");

function parseBridgeResponseScript(script) {
  let rawResponse = null;
  vm.runInNewContext(script, {
    window: {
      __MNBridgeReceive_MNCommentManagerAddon(raw) {
        rawResponse = raw;
      },
    },
  });
  assert.notStrictEqual(rawResponse, null, "native response must invoke the web bridge receiver");
  return JSON.parse(rawResponse);
}

function createNativeHarness(commands) {
  let controllerMembers = null;
  const logs = [];
  const context = vm.createContext({
    console: {
      log(message) {
        logs.push(String(message));
      },
    },
    Promise,
    __MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon: { commands },
    JSB: {
      defineClass(_declaration, instanceMembers) {
        controllerMembers = instanceMembers;
        return {
          new() {
            return {};
          },
        };
      },
    },
  });

  vm.runInContext(panelSource, context, { filename: "WebPanelController.js" });
  assert(controllerMembers, "WebPanelController must register its native class");

  const controller = { addon: { id: "addon" } };
  context.self = controller;

  function makeRequestFromURL(url) {
    return {
      URL() {
        return url;
      },
    };
  }

  function makeBridgeURL(message) {
    return {
      scheme: "mnaddon",
      absoluteString() {
        return `mnaddon://bridge?payload=${encodeURIComponent(JSON.stringify(message))}`;
      },
    };
  }

  function dispatchURL(webView, url) {
    return controllerMembers.webViewShouldStartLoadWithRequestNavigationType(
      webView,
      makeRequestFromURL(url),
      0,
    );
  }

  function dispatchMessage(webView, message) {
    return dispatchURL(webView, makeBridgeURL(message));
  }

  return {
    context,
    controllerMembers,
    logs,
    dispatchURL,
    dispatchMessage,
  };
}

function createIntegratedHarness(commands) {
  const native = createNativeHarness(commands);
  const scheduledTimers = [];
  const appendedFrames = [];
  const webWindow = {};
  let webContext = null;

  const webView = {
    evaluateJavaScript(script, callback) {
      vm.runInContext(script, webContext, { filename: "native-bridge-response.js" });
      if (typeof callback === "function") callback();
    },
  };

  const document = {
    createElement(tagName) {
      assert.strictEqual(tagName, "iframe");
      return {
        style: {},
        src: "",
        removed: false,
        remove() {
          this.removed = true;
        },
      };
    },
    body: {
      appendChild(frame) {
        appendedFrames.push(frame);
        const absolute = String(frame.src);
        const scheme = absolute.slice(0, absolute.indexOf(":"));
        native.dispatchURL(webView, {
          scheme,
          absoluteString() {
            return absolute;
          },
        });
      },
    },
  };

  webContext = vm.createContext({
    window: webWindow,
    document,
    setTimeout(callback, delay) {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    },
    clearTimeout() {},
    Date,
    Math,
    JSON,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
  });
  webContext.globalThis = webContext;
  vm.runInContext(bridgeSource, webContext, { filename: "mnBridge.js" });

  return {
    bridge: webContext.__MNBridgeForTest,
    window: webWindow,
    native,
    appendedFrames,
    scheduledTimers,
    webContext,
  };
}

function pendingIds(harness) {
  return Object.keys(harness.window.__MNBridgePending || {});
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected promise rejection");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

(async function run() {
  const firstDeferred = deferred();
  const secondDeferred = deferred();
  const lateDeferred = deferred();
  const commands = {
    syncSuccess(_context, payload) {
      return { ok: true, echo: payload };
    },
    syncFailure() {
      throw new Error("sync failure");
    },
    asyncSuccess() {
      return Promise.resolve({ ok: true, mode: "async" });
    },
    asyncFailure() {
      return Promise.reject(new Error("async failure"));
    },
    firstConcurrent() {
      return firstDeferred.promise;
    },
    secondConcurrent() {
      return secondDeferred.promise;
    },
    lateSuccess() {
      return lateDeferred.promise;
    },
  };
  const harness = createIntegratedHarness(commands);

  const syncResult = await harness.bridge.send("syncSuccess", { value: 7 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(syncResult)), {
    ok: true,
    echo: { value: 7 },
  });
  assert.deepStrictEqual(pendingIds(harness), []);

  const syncError = await rejectionOf(harness.bridge.send("syncFailure"));
  assert.strictEqual(syncError.message, "sync failure");
  assert.strictEqual(syncError.command, "syncFailure");
  assert.deepStrictEqual(pendingIds(harness), [], "sync failures must settle their originating request");

  const unknownError = await rejectionOf(harness.bridge.send("missingCommand"));
  assert.match(unknownError.message, /Unknown bridge command: missingCommand/);
  assert.strictEqual(unknownError.command, "missingCommand");
  assert.deepStrictEqual(pendingIds(harness), [], "unknown commands with valid envelopes must remain correlated");

  const asyncResult = await harness.bridge.send("asyncSuccess");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(asyncResult)), { ok: true, mode: "async" });
  const asyncError = await rejectionOf(harness.bridge.send("asyncFailure"));
  assert.strictEqual(asyncError.message, "async failure");
  assert.strictEqual(asyncError.command, "asyncFailure");
  assert.deepStrictEqual(pendingIds(harness), []);

  const firstPromise = harness.bridge.send("firstConcurrent");
  const secondPromise = harness.bridge.send("secondConcurrent");
  assert.strictEqual(pendingIds(harness).length, 2, "concurrent requests must have distinct pending entries");
  secondDeferred.resolve({ order: 2 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await secondPromise)), { order: 2 });
  assert.strictEqual(pendingIds(harness).length, 1);
  firstDeferred.resolve({ order: 1 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await firstPromise)), { order: 1 });
  assert.deepStrictEqual(pendingIds(harness), []);

  const latePromise = harness.bridge.send("lateSuccess");
  const lateFrame = harness.appendedFrames[harness.appendedFrames.length - 1];
  const cleanup = harness.scheduledTimers[harness.scheduledTimers.length - 1];
  assert.strictEqual(cleanup.delay, 600, "G-01 must not alter the existing iframe cleanup delay");
  cleanup.callback();
  assert.strictEqual(lateFrame.removed, true, "cleanup must still remove only the transport iframe");
  assert.strictEqual(pendingIds(harness).length, 1, "iframe cleanup must not become a request timeout");
  const lateRequestId = pendingIds(harness)[0];
  lateDeferred.resolve({ accepted: "late" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await latePromise)), { accepted: "late" });
  assert.deepStrictEqual(pendingIds(harness), []);

  const duplicateScript = `window.__MNBridgeReceive_MNCommentManagerAddon(${JSON.stringify(JSON.stringify({
    requestId: lateRequestId,
    payload: { duplicate: true },
    error: null,
  }))})`;
  assert.doesNotThrow(() => vm.runInContext(duplicateScript, harness.webContext));
  assert.deepStrictEqual(pendingIds(harness), [], "duplicate responses must stay ignored after settlement");

  const undecodableResponses = [];
  const captureWebView = {
    evaluateJavaScript(script, callback) {
      undecodableResponses.push(parseBridgeResponseScript(script));
      if (typeof callback === "function") callback();
    },
  };
  const invalidResult = harness.native.dispatchURL(captureWebView, {
    scheme: "mnaddon",
    absoluteString() {
      return "mnaddon://bridge?payload=%7Bnot-json";
    },
  });
  assert.strictEqual(invalidResult, false);
  assert.strictEqual(undecodableResponses.length, 1);
  assert.strictEqual(undecodableResponses[0].requestId, "unknown");
  assert.strictEqual(undecodableResponses[0].error.command, "unknown");
  assert.match(undecodableResponses[0].error.message, /JSON|Unexpected token|property name/i);

  console.log("bridge error correlation regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
