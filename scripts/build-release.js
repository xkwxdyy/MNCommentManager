const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const CleanCSS = require("clean-css");

function getAllFiles(dir, files = []) {
  fs.readdirSync(dir).forEach((file) => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllFiles(name, files);
    } else {
      files.push(name);
    }
  });
  return files;
}

function getLocalBin(rootDir, name) {
  const binDir = path.join(rootDir, "node_modules", ".bin");
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(binDir, `${name}${ext}`);
}

function runLocalBin(rootDir, name, args) {
  const binPath = getLocalBin(rootDir, name);
  execFileSync(binPath, args, { stdio: "ignore" });
}

function minifyCssFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const result = new CleanCSS().minify(source);

  if (result.errors.length > 0) {
    throw new Error(`CSS minify failed for ${filePath}: ${result.errors.join("; ")}`);
  }

  fs.writeFileSync(filePath, result.styles);
}

function minifyFiles(distDir) {
  const rootDir = path.join(__dirname, "..");
  const jsFiles = getAllFiles(distDir).filter((f) => f.endsWith(".js"));
  jsFiles.forEach((file) => {
    runLocalBin(rootDir, "terser", [
      file,
      "-o",
      file,
      "--compress",
      "--mangle",
    ]);
  });

  const htmlFiles = getAllFiles(distDir).filter((f) => f.endsWith(".html"));
  htmlFiles.forEach((file) => {
    runLocalBin(rootDir, "html-minifier-terser", [
      file,
      "-o",
      file,
      "--collapse-whitespace",
      "--remove-comments",
      "--minify-js",
      "true",
      "--minify-css",
      "true",
    ]);
  });

  const cssFiles = getAllFiles(distDir).filter((f) => f.endsWith(".css"));
  cssFiles.forEach((file) => {
    minifyCssFile(file);
  });
}

function buildWebAssets(rootDir, output) {
  const webBuildScript = path.join(rootDir, "scripts", "web-build.js");
  execFileSync(process.execPath, [webBuildScript], {
    cwd: rootDir,
    env: { ...process.env, ADDON_WEB_OUTPUT_DIR: output },
    stdio: "inherit",
  });

  const webIndexPath = path.join(output, "index.html");
  if (!fs.existsSync(webIndexPath)) {
    throw new Error(`Web dist entry missing: ${webIndexPath}`);
  }
}

function assertNoVendoredMNUtils(rootDir) {
  const forbiddenPaths = [
    path.join(rootDir, "src", "vendor", "mnutils.js"),
    path.join(rootDir, "src", "vendor", "mnnote.js"),
  ];
  forbiddenPaths.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      throw new Error(`Vendored MN Utils runtime is forbidden: ${filePath}`);
    }
  });

  const mainSource = fs.readFileSync(path.join(rootDir, "src", "main.js"), "utf8");
  if (/vendor\/(?:mnutils|mnnote)/.test(mainSource)) {
    throw new Error("src/main.js must depend on MN Utils instead of loading a vendored runtime");
  }
}

function build() {
  const rootDir = path.join(__dirname, "..");
  const pkg = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  if (typeof pkg.name !== "string" || !pkg.name.trim()) {
    throw new Error("package.json缺少有效name，无法生成发布文件名");
  }
  const addonName = pkg.name.trim().replace(/^@/, "").replace(/\//g, "-");
  const srcDir = path.join(rootDir, "src");
  const outputName = `${addonName}-v${pkg.version}.mnaddon`;
  const outputPath = path.join(rootDir, outputName);
  const stagedOutput = `${outputPath}.${process.pid}.new`;

  assertNoVendoredMNUtils(rootDir);
  // CI verifies an independent copy of the exact minified archive input.
  // Ordinary builds keep all generated payload files in the temporary tree.
  let exportedPayload = null;
  if (process.argv.includes("--export-payload")) {
    const exportRoot = path.join(rootDir, ".ci-output");
    try {
      if (fs.lstatSync(exportRoot).isSymbolicLink()) {
        throw new Error("Payload export parent must not be a symbolic link");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    fs.mkdirSync(exportRoot, { recursive: true });
    exportedPayload = path.join(exportRoot, "release-payload");
    // mkdir without recursive rejects existing directories, files and symlinks.
    fs.mkdirSync(exportedPayload);
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mn-addon-build-"));
  const distDir = path.join(temporary, "payload");
  try {
    fs.cpSync(srcDir, distDir, { recursive: true,
      filter: source => source !== path.join(srcDir, "web-dist"),
    });
    buildWebAssets(rootDir, path.join(distDir, "web-dist"));
    minifyFiles(distDir);
    if (exportedPayload) fs.cpSync(distDir, exportedPayload, { recursive: true });
    const archive = path.join(temporary, "package.zip");
    execFileSync("zip", ["-r", "-q", archive, "."], { cwd: distDir });
    fs.copyFileSync(archive, stagedOutput);
    fs.renameSync(stagedOutput, outputPath);
    console.log(`Build successful: ${outputName}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(stagedOutput, { force: true });
  }
}

build();
