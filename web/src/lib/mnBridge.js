const BRIDGE_SCHEME = "mnaddon://bridge?payload=";

const READ_ONLY_COMMAND_TIMEOUTS = Object.freeze({
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
});

function nextRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function takePending(requestId) {
  if (!Object.prototype.hasOwnProperty.call(window.__MNBridgePending, requestId)) return null;
  const pending = window.__MNBridgePending[requestId];
  if (!pending) {
    return null;
  }
  if (pending.timeoutId !== null) {
    clearTimeout(pending.timeoutId);
    pending.timeoutId = null;
  }
  delete window.__MNBridgePending[requestId];
  return pending;
}

function removeTransportFrame(iframe) {
  if (!iframe) {
    return;
  }
  try {
    iframe.remove();
  } catch (error) {
    // Preserve the request result even if best-effort transport cleanup fails.
  }
}

function ensureBridgeReceiver() {
  if (!window.__MNBridgePending || typeof window.__MNBridgePending !== "object") {
    window.__MNBridgePending = Object.create(null);
  }

  if (typeof window.__MNBridgeReceive_MNCommentManagerAddon === "function") {
    return;
  }

  window.__MNBridgeReceive_MNCommentManagerAddon = (raw) => {
    let response;
    try {
      response = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!response || typeof response !== "object" || Array.isArray(response) || typeof response.requestId !== "string") return;
    const pending = takePending(response.requestId);
    if (!pending) {
      return;
    }

    if (response.error) {
      pending.reject(response.error);
      return;
    }

    pending.resolve(response.payload);
  };
}

function send(command, payload = null) {
  ensureBridgeReceiver();

  const requestId = nextRequestId();
  const message = {
    command,
    requestId,
    payload,
    error: null,
  };

  return new Promise((resolve, reject) => {
    const pending = { resolve, reject, timeoutId: null };
    window.__MNBridgePending[requestId] = pending;

    let iframe = null;
    try {
      if (Object.prototype.hasOwnProperty.call(READ_ONLY_COMMAND_TIMEOUTS, command)) {
        const timeoutMs = READ_ONLY_COMMAND_TIMEOUTS[command];
        pending.timeoutId = setTimeout(() => {
          const activePending = takePending(requestId);
          if (!activePending) {
            return;
          }
          activePending.reject({
            message: `等待 MarginNote 响应超时（${timeoutMs / 1000} 秒），请重试`,
            command,
          });
        }, timeoutMs);
      }

      const encoded = encodeURIComponent(JSON.stringify(message));
      iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = `${BRIDGE_SCHEME}${encoded}`;
      document.body.appendChild(iframe);
    } catch (error) {
      takePending(requestId);
      removeTransportFrame(iframe);
      reject(error);
      return;
    }

    try {
      setTimeout(() => {
        removeTransportFrame(iframe);
      }, 600);
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("[MNCommentManager] Failed to schedule bridge iframe cleanup", error);
      }
    }
  });
}

const MNBridge = {
  send,
};

export default MNBridge;
