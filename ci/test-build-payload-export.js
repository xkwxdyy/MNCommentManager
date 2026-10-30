const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mn-payload-export-test-"));

function fixture(name) {
  const directory = path.join(temporary, name);
  fs.mkdirSync(path.join(directory, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(directory, "src"));
  fs.copyFileSync(path.join(root, "scripts/build-release.js"), path.join(directory, "scripts/build-release.js"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "fixture", version: "0.0.0" }));
  fs.writeFileSync(path.join(directory, "src/main.js"), "// Fixture without a vendored runtime.\n");
  fs.symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  return directory;
}

function rejects(directory, pattern) {
  const result = spawnSync(process.execPath, ["scripts/build-release.js", "--export-payload"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, pattern);
}

try {
  // Existing directories, files and even dangling symlinks cannot be replaced.
  for (const type of ["directory", "file", "symlink"]) {
    const directory = fixture(type);
    fs.mkdirSync(path.join(directory, ".ci-output"));
    const destination = path.join(directory, ".ci-output/release-payload");
    if (type === "directory") {
      fs.mkdirSync(destination);
      fs.writeFileSync(path.join(destination, "sentinel"), "keep");
    } else if (type === "file") {
      fs.writeFileSync(destination, "keep");
    } else {
      fs.symlinkSync(path.join(temporary, "missing-payload"), destination, "dir");
    }
    rejects(directory, /EEXIST/);
    if (type === "directory") assert.strictEqual(fs.readFileSync(path.join(destination, "sentinel"), "utf8"), "keep");
    if (type === "file") assert.strictEqual(fs.readFileSync(destination, "utf8"), "keep");
    if (type === "symlink") assert.ok(fs.lstatSync(destination).isSymbolicLink());
  }

  // A linked parent must never redirect exports outside the owned build tree.
  for (const dangling of [false, true]) {
    const directory = fixture(`parent-${dangling}`);
    const external = path.join(temporary, `external-${dangling}`);
    if (!dangling) fs.mkdirSync(external);
    fs.symlinkSync(external, path.join(directory, ".ci-output"), "dir");
    rejects(directory, /Payload export parent must not be a symbolic link/);
    if (dangling) assert.ok(!fs.existsSync(external));
    else assert.deepStrictEqual(fs.readdirSync(external), []);
  }
  console.log("candidate payload export overwrite and symlink guards passed");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
