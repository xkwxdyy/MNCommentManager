const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const updateManifest = path.join(__dirname, "update-manifest.js");
const fallbackManifestPath = path.join(rootDir, "src", "update-fallback", "mncommentmanager.json");
const addonMetadataPath = path.join(rootDir, "src", "mnaddon.json");
const currentVersion = String(JSON.parse(fs.readFileSync(addonMetadataPath, "utf8")).version || "").trim();

function expectedFilename(version) {
  return `mn-comment-manager-v${version}.mnaddon`;
}

function assertEntryIdentity(entry, label) {
  assert.strictEqual(
    entry.filename,
    expectedFilename(entry.version),
    `${label} filename must match its version`
  );

  const pathname = decodeURIComponent(new URL(entry.url).pathname);
  const urlFilename = path.basename(pathname);
  if (/\.mnaddon$/i.test(urlFilename)) {
    assert.strictEqual(urlFilename, entry.filename, `${label} URL must identify its filename`);
  }
}

const manifest = JSON.parse(fs.readFileSync(fallbackManifestPath, "utf8"));
assertEntryIdentity(manifest, "current manifest");
(manifest.history || []).forEach((entry, index) => assertEntryIdentity(entry, `history[${index}]`));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mncommentmanager-manifest-"));
try {
  const invalidPackage = path.join(tempDir, "mn-comment-manager-v0.1.18.mnaddon");
  fs.writeFileSync(invalidPackage, "placeholder");
  assert.throws(
    () => childProcess.execFileSync(process.execPath, [
      updateManifest,
      "--mnaddon", invalidPackage,
      "--root-url", "https://example.test/MNCommentManager",
      "--out", path.join(tempDir, "invalid.json"),
    ], { cwd: rootDir, encoding: "utf8", stdio: "pipe" }),
    /does not match src\/mnaddon\.json version/
  );

  const validPackage = path.join(tempDir, expectedFilename(currentVersion));
  fs.writeFileSync(validPackage, "placeholder");
  assert.throws(
    () => childProcess.execFileSync(process.execPath, [
      updateManifest,
      "--mnaddon", validPackage,
      "--download-url", "https://example.test/MNCommentManager/mn-comment-manager-v0.0.0.mnaddon",
      "--out", path.join(tempDir, "url-mismatch.json"),
    ], { cwd: rootDir, encoding: "utf8", stdio: "pipe" }),
    /Download URL filename .* does not match manifest filename/
  );

  const staleOutput = path.join(tempDir, "stale.json");
  fs.writeFileSync(staleOutput, JSON.stringify({
    history: [{
      version: "0.1.10",
      channel: "stable",
      url: "https://example.test/MNCommentManager/mn-comment-manager-v0.1.10.mnaddon",
      filename: "mn-comment-manager-v0.1.9.mnaddon",
    }],
  }));
  childProcess.execFileSync(process.execPath, [
    updateManifest,
    "--mnaddon", validPackage,
    "--root-url", "https://example.test/MNCommentManager",
    "--out", staleOutput,
  ], { cwd: rootDir, encoding: "utf8", stdio: "pipe" });
  const repaired = JSON.parse(fs.readFileSync(staleOutput, "utf8"));
  assertEntryIdentity(repaired.history.find((entry) => entry.version === "0.1.10"), "repaired history[0.1.10]");

  const outputPath = path.join(tempDir, "valid.json");
  childProcess.execFileSync(process.execPath, [
    updateManifest,
    "--mnaddon", validPackage,
    "--root-url", "https://example.test/MNCommentManager",
    "--out", outputPath,
  ], { cwd: rootDir, encoding: "utf8", stdio: "pipe" });
  const generated = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assertEntryIdentity(generated, "generated manifest");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("update-manifest identity regression: ok");
