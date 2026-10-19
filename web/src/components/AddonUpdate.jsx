import { useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";

export default function AddonUpdate() {
  const [state, setState] = useState(null);
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const active = useRef(false);
  const pendingRef = useRef(false);
  const notesRef = useRef(null);
  useEffect(() => {
    if (notes) notesRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [notes]);
  useEffect(() => {
    active.current = true;
    MNBridge.send("getAddonUpdateState").then(value => { if (active.current) setState(value); })
      .catch(failure => { if (active.current) setError(failure.message || String(failure)); });
    return () => { active.current = false; };
  }, []);

  const run = async (command, payload) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(command);
    setError("");
    try {
      const value = await MNBridge.send(command, payload);
      if (active.current) {
        if (command === "getAddonChangelog") setNotes(value);
        else setState(value);
      }
    } catch (failure) {
      if (active.current) setError(failure.message || String(failure));
    } finally {
      pendingRef.current = false;
      if (active.current) setPending("");
    }
  };

  // Reopening settings during a Native operation must show its eventual result.
  useEffect(() => {
    if (pending || !["checking", "installing"].includes(state?.phase)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      MNBridge.send("getAddonUpdateState").then(value => { if (!cancelled) setState(value); })
        .catch(failure => { if (!cancelled) setError(failure.message || String(failure)); });
    }, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state, pending]);

  const busy = !!pending || ["checking", "installing"].includes(state?.phase);
  const latest = state?.result?.latestVersion;
  const noteVersion = latest || state?.currentVersion;
  const entry = notes?.entries?.find(item => item?.version === noteVersion);
  const canInstall = !busy && state?.result?.updateAvailable && !state?.result?.offline && !state?.installedVersion;
  return (
    <section className="settings-section addon-update" aria-label="插件更新" aria-busy={busy}>
      <div className="settings-section-header"><h3>插件更新</h3><span>正式版更新与版本说明</span></div>
      <dl className="addon-update-versions">
        <div><dt>当前运行版本</dt><dd>{state?.currentVersion ? `v${state.currentVersion}` : "尚未读取"}</dd></div>
        <div><dt>{state?.result?.offline ? "离线资料版本" : "最新版本"}</dt><dd>{latest ? `v${latest}` : "尚未检查"}</dd></div>
        <div><dt>最近检查</dt><dd>{state?.lastCheckedAt ? new Date(state.lastCheckedAt).toLocaleString() : "尚未检查"}</dd></div>
      </dl>
      <label className="dialog-check">
        <input type="checkbox" checked={state?.autoCheck !== false} disabled={!state || busy}
          onChange={event => run("setAddonUpdateAutoCheck", { autoCheck: event.target.checked })} />
        <span><strong>启动时自动检查更新</strong><small>检查失败时保留正常编辑，仅在发现新版本时提醒；安装由手动操作触发。</small></span>
      </label>
      <div className="addon-update-actions">
        <button type="button" className="secondary" title="检查更新" aria-label="检查更新" disabled={!state || busy || !!state.installedVersion} onClick={() => run("checkAddonUpdate")}>
          <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 8a6 6 0 1 0 0 4M16 3v5h-5" /></svg>
        </button>
        <button type="button" className="secondary" disabled={!state || busy} onClick={() => run("getAddonChangelog")}>更新说明</button>
        <button type="button" className="primary" disabled={!canInstall} onClick={() => run("installAddonUpdate", { version: latest })}>下载并安装</button>
      </div>
      <p role={state?.phase === "error" && !pending ? "alert" : "status"}>{pending === "installAddonUpdate" ? "正在下载并校验安装包，请勿退出 MarginNote…" : pending === "checkAddonUpdate" ? "正在检查更新…" : pending === "getAddonChangelog" ? "正在读取更新说明…" : state?.message || "可手动检查正式版更新。"}</p>
      {state?.installedVersion ? <p className="addon-update-restart">v{state.installedVersion} 已安装。请正常退出并重新打开 MarginNote，新版本将在重启后生效。</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {notes ? <div className="addon-update-notes" ref={notesRef}>
        <h4>{noteVersion ? `v${noteVersion} 更新说明` : "更新说明"}{notes.offline ? "（包内离线资料）" : ""}</h4>
        {entry ? <ul>{(Array.isArray(entry.items) ? entry.items : []).map((item, index) => <li key={index}>{typeof item === "string" ? item : String(item?.zh || item?.en || "")}</li>)}</ul> : <p>当前资料没有该版本的更新说明。</p>}
      </div> : null}
    </section>
  );
}
