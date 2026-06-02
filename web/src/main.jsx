import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function renderStartupError(error) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = error && error.message ? error.message : String(error);
  root.innerHTML = `<div class="startup-error"><h1>评论管理器启动失败</h1><p>${message}</p></div>`;
}

window.addEventListener("error", (event) => {
  renderStartupError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderStartupError(event.reason);
});

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  renderStartupError(error);
}
