const fs = require("fs");
const path = require("path");

function usage() {
  console.log(`Usage:
  node scripts/update-manifest.js (--root-url <url> | --download-url <url>) [--mnaddon <path>] [--out <path>] [--fallback-out <path>] [--changelog-url <url>] [--file-id <id>]

Options:
  --root-url       123pan direct-link root URL. The package filename is appended to it.
  --download-url   Complete .mnaddon direct-link URL. Overrides --root-url.
  --mnaddon        Built .mnaddon package. Defaults to latest mn-comment-manager-v*.mnaddon.
  --out            Manifest output path. Defaults to debug/123pan/mncommentmanager.json.
  --fallback-out   Optional bundled fallback manifest path.
  --changelog-url  Structured changelog JSON URL for MNUtils / plugin store integration.
                   Defaults to MNCOMMENTMANAGER_UPDATE_PUBLIC_BASE_URL/mncommentmanager_changelog.json
                   or https://api.xkwxdyy.cn/update/mncommentmanager_changelog.json.
  --file-id        Optional 123pan fileID to include in manifest/history.
`);
}

function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] || "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function latestMnaddon(rootDir) {
  const files = fs.readdirSync(rootDir)
    .filter((name) => /^mn-comment-manager-v.+\.mnaddon$/.test(name))
    .map((name) => path.join(rootDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || "";
}

function normalizeRootUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function makeDownloadUrl(rootUrl, filename) {
  const root = normalizeRootUrl(rootUrl);
  if (!root) return "";
  return `${root}/${encodeURI(filename)}`;
}

function defaultChangelogUrl() {
  const explicit = String(process.env.MNCOMMENTMANAGER_CHANGELOG_URL || "").trim();
  if (explicit) return explicit;
  const base = normalizeRootUrl(process.env.MNCOMMENTMANAGER_UPDATE_PUBLIC_BASE_URL || "https://api.xkwxdyy.cn/update");
  return `${base}/mncommentmanager_changelog.json`;
}

function readPreviousHistory(...paths) {
  for (const filePath of paths) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const data = readJson(filePath);
      if (Array.isArray(data.history)) return data.history;
    } catch (_) {
      // Ignore invalid previous manifests.
    }
  }
  return [];
}

function pushUnique(history, item) {
  if (!item || typeof item !== "object") return;
  const version = String(item.version || "").trim();
  const url = String(item.url || "").trim();
  if (!version) return;
  if (history.versions.has(version)) return;
  const key = `${version}::${url}`;
  if (history.seen.has(key)) return;
  history.seen.add(key);
  history.versions.add(version);
  history.items.push(item);
}

function buildManifest({ rootDir, mnaddonPath, rootUrl, downloadUrl, outPath, fallbackOutPath, changelogUrl, fileID }) {
  const addonMeta = readJson(path.join(rootDir, "src", "mnaddon.json"));
  const filename = path.basename(mnaddonPath);
  const version = String(addonMeta.version || "").trim();
  const addonid = String(addonMeta.addonid || "").trim();
  const id = addonid.startsWith("marginnote.extension.")
    ? addonid.slice("marginnote.extension.".length)
    : "mncommentmanager";
  const title = String(addonMeta.title || "MN Comment Manager").trim();
  const url = String(downloadUrl || "").trim() || makeDownloadUrl(rootUrl, filename);
  const updatedAt = new Date().toISOString();

  if (!version) throw new Error("src/mnaddon.json is missing version");
  if (!addonid) throw new Error("src/mnaddon.json is missing addonid");
  if (!url) throw new Error("Missing --download-url, --root-url, MNCOMMENTMANAGER_DOWNLOAD_URL, or MNCOMMENTMANAGER_DOWNLOAD_ROOT_URL");

  const current = { version, channel: "stable", url, filename, updatedAt };
  if (fileID) current.fileID = Number(fileID);
  const historyState = { items: [], seen: new Set(), versions: new Set() };
  pushUnique(historyState, current);
  readPreviousHistory(outPath, fallbackOutPath).forEach((item) => pushUnique(historyState, item));

  const manifest = {
    id,
    addonid,
    title,
    version,
    channel: "stable",
    url,
    filename,
    updatedAt,
    history: historyState.items.slice(0, 60),
  };
  if (changelogUrl) manifest.changelogUrl = String(changelogUrl).trim();
  if (fileID) manifest.fileID = Number(fileID);

  writeJson(outPath, manifest);
  if (fallbackOutPath) writeJson(fallbackOutPath, manifest);
  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const rootDir = path.join(__dirname, "..");
  const rootUrl = getArgValue(args, "--root-url") || process.env.MNCOMMENTMANAGER_DOWNLOAD_ROOT_URL || "";
  const downloadUrl = getArgValue(args, "--download-url") || process.env.MNCOMMENTMANAGER_DOWNLOAD_URL || "";
  const fileID = getArgValue(args, "--file-id") || process.env.MNCOMMENTMANAGER_FILE_ID || "";
  const mnaddonArg = getArgValue(args, "--mnaddon");
  const mnaddonPath = path.resolve(rootDir, mnaddonArg || latestMnaddon(rootDir));
  const outPath = path.resolve(rootDir, getArgValue(args, "--out") || "debug/123pan/mncommentmanager.json");
  const fallbackOutArg = getArgValue(args, "--fallback-out");
  const fallbackOutPath = fallbackOutArg ? path.resolve(rootDir, fallbackOutArg) : "";
  const changelogUrl = getArgValue(args, "--changelog-url") || defaultChangelogUrl();

  if (!mnaddonPath || !fs.existsSync(mnaddonPath)) {
    throw new Error("Built .mnaddon package not found. Run pnpm build or pass --mnaddon.");
  }

  const manifest = buildManifest({ rootDir, mnaddonPath, rootUrl, downloadUrl, outPath, fallbackOutPath, changelogUrl, fileID });
  console.log(`Manifest written: ${path.relative(rootDir, outPath)}`);
  if (fallbackOutPath) console.log(`Fallback updated: ${path.relative(rootDir, fallbackOutPath)}`);
  console.log(`Download URL: ${manifest.url}`);
}

main();
