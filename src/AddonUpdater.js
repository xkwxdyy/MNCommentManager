var __MN_UPDATER_MNCommentManagerAddon = (function () {
  const ADDON_ID = "marginnote.extension.mncommentmanager";
  const BASES = ["https://api.xkwxdyy.cn/update/", "https://xkwxdyy.cn/update/"];
  const KEY = "mncommentmanager_updater_v1";
  let mainPath = "", currentVersion = "", result = null, checkPromise = null, installPromise = null;
  let phase = "idle", message = "", installedVersion = "", autoStarted = false;

  function readJSON(path) {
    const data = NSData.dataWithContentsOfFile(path);
    if (!data) throw new Error("文件读取失败：" + path);
    return JSON.parse(String(NSString.stringWithContentsOfData(data)).replace(/^\uFEFF/, ""));
  }

  function preferences() {
    try {
      const value = JSON.parse(String(NSUserDefaults.standardUserDefaults().objectForKey(KEY) || "{}"));
      return { autoCheck: value.autoCheck !== false, lastCheckedAt: Number(value.lastCheckedAt) || 0 };
    } catch (_) { return { autoCheck: true, lastCheckedAt: 0 }; }
  }

  function savePreferences(patch) {
    const next = Object.assign(preferences(), patch);
    NSUserDefaults.standardUserDefaults().setObjectForKey(JSON.stringify(next), KEY);
    const saved = preferences();
    if (saved.autoCheck !== next.autoCheck || saved.lastCheckedAt !== next.lastCheckedAt) throw new Error("更新设置保存失败");
    return saved;
  }

  function init(path) {
    const normalized = String(path || "").replace(/\/+$/, "");
    if (!normalized.endsWith("/" + ADDON_ID)) throw new Error("插件安装目录无效");
    if (mainPath && mainPath !== normalized) throw new Error("插件安装目录已改变，请重启 MarginNote");
    if (!mainPath) {
      const meta = readJSON(normalized + "/mnaddon.json");
      if (meta.addonid !== ADDON_ID || !meta.version) throw new Error("当前插件信息无效");
      mainPath = normalized;
      currentVersion = String(meta.version);
    }
  }

  function versionParts(version) {
    const match = String(version || "").replace(/^v/i, "").replace(/[αΑ]/g, "alpha")
      .match(/^(\d+(?:\.\d+)*)(?:[.-](alpha|beta|rc)(\d*))?$/i);
    if (!match) throw new Error("版本号无效：" + version);
    return { numbers: match[1].split(".").map(Number), rank: match[2] ? ["alpha", "beta", "rc"].indexOf(match[2].toLowerCase()) : 3, suffix: Number(match[3]) || 0 };
  }

  function compareVersions(a, b) {
    const left = versionParts(a), right = versionParts(b);
    for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i += 1) {
      const difference = (left.numbers[i] || 0) - (right.numbers[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return Math.sign(left.rank - right.rank || left.suffix - right.suffix);
  }

  function validateEntry(manifest) {
    const items = Array.isArray(manifest) ? manifest : manifest && (manifest.items || manifest.addons);
    const entry = Array.isArray(items) ? items.find(item => item && item.addonid === ADDON_ID) : manifest;
    if (!entry || entry.addonid !== ADDON_ID || (entry.id && entry.id !== "mncommentmanager")) throw new Error("更新清单中的插件标识不符");
    const version = String(entry.version || "");
    if (!/^\d+\.\d+\.\d+$/.test(version) || (entry.channel && entry.channel !== "stable")) throw new Error("正式版更新清单的版本无效");
    const filename = "mn-comment-manager-v" + version + ".mnaddon";
    if (entry.filename && entry.filename !== filename) throw new Error("安装包文件名与版本不符");
    const urls = [entry.url, entry.downloadUrl, entry.backUpUrl].concat(Array.isArray(entry.urls) ? entry.urls : []);
    const candidates = urls.filter(url => typeof url === "string" && /^https:\/\/[^\s/]+\//.test(url));
    if (!candidates.length) throw new Error("更新清单没有有效的 HTTPS 下载地址");
    return { version, filename, candidates: Array.from(new Set(candidates)) };
  }

  async function request(url, binary) {
    if (typeof MNConnection === "undefined") throw new Error("MN Utils 网络模块尚未就绪");
    const method = typeof MNConnection.fetchDev === "function" ? MNConnection.fetchDev : MNConnection.fetch;
    if (typeof method !== "function") throw new Error("MN Utils 网络模块不可用");
    const response = await method.call(MNConnection, url, {
      method: "GET", timeout: binary ? 180 : 15,
      headers: { "Cache-Control": "no-cache", "Accept-Encoding": "identity" },
    });
    const status = Number(response && (response.status || response.statusCode)) || 0;
    if (!response || response.ok === false || response.error || status >= 400) throw new Error("网络请求失败" + (status ? "（HTTP " + status + "）" : ""));
    const data = response.body !== undefined ? response.body : response.data !== undefined ? response.data : response;
    if (binary) {
      if (!data || typeof data.writeToFileAtomically !== "function") throw new Error("下载内容不是安装包");
      return data;
    }
    if (typeof response.text === "function") return JSON.parse(String(await response.text()).replace(/^\uFEFF/, ""));
    if (data && typeof data === "object" && typeof data.writeToFileAtomically !== "function") return data;
    return JSON.parse(String(typeof data === "string" ? data : NSString.stringWithContentsOfData(data)).replace(/^\uFEFF/, ""));
  }

  async function fromSources(filename, validate) {
    let failure;
    for (const base of BASES) {
      try {
        const data = await request(base + filename + "?t=" + Date.now(), false);
        return { data: validate(data), source: base + filename, offline: false };
      } catch (error) { failure = error; }
    }
    try {
      return { data: validate(readJSON(mainPath + "/update-fallback/" + filename)), source: "包内离线资料", offline: true, error: String(failure && failure.message || failure) };
    } catch (_) { throw failure || new Error("更新资料不可用"); }
  }

  function getState() {
    return Object.assign(preferences(), { currentVersion, phase, message, installedVersion, result });
  }

  function setAutoCheck(payload) {
    if (!payload || typeof payload.autoCheck !== "boolean") throw new Error("自动检查设置无效");
    savePreferences({ autoCheck: payload.autoCheck });
    return getState();
  }

  function check() {
    if (installPromise || installedVersion) return Promise.resolve(getState());
    if (checkPromise) return checkPromise;
    phase = "checking";
    message = "正在检查更新…";
    checkPromise = (async function () {
      try {
        const found = await fromSources("mncommentmanager.json", validateEntry);
        result = { latestVersion: found.data.version, filename: found.data.filename, candidates: found.data.candidates,
          source: found.source, offline: found.offline,
          updateAvailable: !found.offline && compareVersions(found.data.version, currentVersion) > 0 };
        savePreferences({ lastCheckedAt: Date.now() });
        phase = found.offline ? "offline" : "ready";
        message = found.offline ? "在线检查失败，当前显示包内离线资料：" + found.error
          : result.updateAvailable ? "发现新版本，可下载并安装" : "在线检查完成，当前没有更高版本";
      } catch (error) {
        result = null;
        phase = "error";
        message = "检查更新失败：" + String(error.message || error);
      }
      return getState();
    })().finally(function () { checkPromise = null; });
    return checkPromise;
  }

  async function changelog() {
    const found = await fromSources("mncommentmanager_changelog.json", function (data) {
      if (!data || data.id !== "mncommentmanager" || !Array.isArray(data.entries)) throw new Error("更新说明格式无效");
      return data;
    });
    return { offline: found.offline, entries: found.data.entries, source: found.source };
  }

  function ensureFolder(path) {
    const fm = NSFileManager.defaultManager();
    if (!fm.fileExistsAtPath(path) && !fm.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null)) throw new Error("无法创建更新目录");
  }

  function move(from, to) {
    const fm = NSFileManager.defaultManager();
    if (fm.fileExistsAtPath(to) || !fm.moveItemAtPathToPath(from, to) || !fm.fileExistsAtPath(to) || fm.fileExistsAtPath(from)) throw new Error("更新文件移动失败");
  }

  function validateDirectory(path, version) {
    const meta = readJSON(path + "/mnaddon.json");
    if (meta.addonid !== ADDON_ID || meta.version !== version) throw new Error("安装包的插件标识或版本与更新清单不符");
    for (const name of ["main.js", "MNCommentManagerAddon.js", "web-dist/index.html", "web-dist/assets/app.js", "web-dist/assets/app.css"]) {
      const data = NSData.dataWithContentsOfFile(path + "/" + name);
      if (!data || Number(data.length()) <= 0) throw new Error("安装包缺少必要资源：" + name);
    }
  }

  function installDirectory(stage, version, work) {
    validateDirectory(stage, version);
    const app = Application.sharedInstance();
    const backupRoot = String(app.documentPath).replace(/\/+$/, "") + "/" + ADDON_ID + "/update-backups";
    ensureFolder(backupRoot);
    const backup = backupRoot + "/" + Date.now() + "-" + Math.random().toString(16).slice(2);
    // Keep backups outside the extension root so MarginNote cannot load a second addon copy.
    move(mainPath, backup);
    try {
      move(stage, mainPath);
      validateDirectory(mainPath, version);
    } catch (error) {
      try {
        if (NSFileManager.defaultManager().fileExistsAtPath(mainPath)) move(mainPath, work + "/invalid-install");
        move(backup, mainPath);
      } catch (restoreError) {
        throw new Error("安装失败，自动恢复失败；旧版备份位于 " + backup + "：" + restoreError.message);
      }
      throw new Error("安装失败，旧版已恢复：" + error.message);
    }
    return backup;
  }

  function install(payload) {
    if (installPromise) return installPromise;
    if (installedVersion) return Promise.resolve(getState());
    if (checkPromise || !result || result.offline || !result.updateAvailable || !payload || payload.version !== result.latestVersion) return Promise.reject(new Error("请先检查更新，再安装已确认的新版本"));
    const selected = result;
    phase = "installing";
    message = "正在下载并校验安装包，请勿退出 MarginNote…";
    installPromise = (async function () {
      try {
        if (typeof ZipArchive === "undefined" || typeof ZipArchive.unzipFileAtPathToDestination !== "function") throw new Error("原生解压接口不可用");
        const app = Application.sharedInstance();
        if (!app.tempPath || !app.documentPath) throw new Error("MarginNote 更新目录不可用");
        const work = String(app.tempPath).replace(/\/+$/, "") + "/" + ADDON_ID + "/update-" + Date.now() + "-" + Math.random().toString(16).slice(2);
        ensureFolder(work);
        let lastError, stage = "";
        for (let i = 0; i < selected.candidates.length; i += 1) {
          try {
            const data = await request(selected.candidates[i], true);
            const archive = work + "/" + i + "-" + selected.filename;
            if (!data.writeToFileAtomically(archive, true)) throw new Error("安装包保存失败");
            stage = work + "/stage-" + i;
            ensureFolder(stage);
            if (!ZipArchive.unzipFileAtPathToDestination(archive, stage)) throw new Error("安装包解压失败");
            validateDirectory(stage, selected.latestVersion);
            break;
          } catch (error) { lastError = error; stage = ""; }
        }
        if (!stage) throw lastError || new Error("安装包下载失败");
        const backup = installDirectory(stage, selected.latestVersion, work);
        installedVersion = selected.latestVersion;
        phase = "installed";
        message = "新版已安装，请重启 MarginNote 后使用。旧版备份：" + backup;
      } catch (error) {
        phase = "error";
        message = String(error.message || error);
      }
      return getState();
    })().finally(function () { installPromise = null; });
    return installPromise;
  }

  function start(addon) {
    init(addon.mainPath);
    if (autoStarted || !preferences().autoCheck) return;
    autoStarted = true;
    let retries = 12;
    function attempt() {
      if (!preferences().autoCheck) { autoStarted = false; return; }
      if (typeof MNConnection === "undefined" || (typeof MNConnection.fetchDev !== "function" && typeof MNConnection.fetch !== "function")) {
        if (retries-- > 0) NSTimer.scheduledTimerWithTimeInterval(1, false, attempt);
        else autoStarted = false;
        return;
      }
      check().then(function (state) {
        if (state.result && state.result.updateAvailable) {
          try { Application.sharedInstance().showHUD("MN Comment Manager 有新版本 v" + state.result.latestVersion + "，可在设置中的插件更新区域安装", addon.window, 5); } catch (_) {}
        }
      }).catch(function (error) { console.log("[MN Comment Manager] auto update check failed: " + error); });
    }
    NSTimer.scheduledTimerWithTimeInterval(1, false, attempt);
  }

  return { init, start, getState, setAutoCheck, check, changelog, install };
})();
