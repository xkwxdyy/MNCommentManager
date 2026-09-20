const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "web-build.js"), "utf8");
const manifestTest = fs.readFileSync(path.join(root, "scripts", "test-update-manifest.js"), "utf8");
const css = fs.readFileSync(path.join(root, "web", "src", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "web", "src", "App.jsx"), "utf8");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "src", "mnaddon.json"), "utf8"));

assert.ok(/<html\s+lang="zh-CN">/.test(html), "the development entry must declare the UI language");
assert.ok(html.includes("<title>评论管理器</title>"));
assert.ok(html.includes('<script type="module" src="./src/main.jsx"></script>'));
assert.ok(build.includes('<html lang="zh-CN">'), "the generated release entry must preserve the same language");
assert.ok(build.includes("<title>评论管理器</title>"));
assert.ok(build.includes('<link rel="stylesheet" href="./assets/app.css" />'));
assert.ok(build.includes('<script src="./assets/app.js"></script>'));
assert.ok(build.includes("assertLegacyWebViewCompatibility(distJsPath)"), "release build must keep the existing legacy WebView gate");

assert.ok(manifestTest.includes('const addonMetadataPath = path.join(rootDir, "src", "mnaddon.json")'));
assert.ok(manifestTest.includes("expectedFilename(currentVersion)"), "the valid fixture filename must follow the current manifest version");
assert.ok(!manifestTest.includes("mn-comment-manager-v0.1.19.mnaddon"), "the regression must not freeze a stale package version");
assert.ok(manifestTest.includes("mn-comment-manager-v0.0.0.mnaddon"), "the URL mismatch scenario must remain invalid independently of the current version");
assert.strictEqual(typeof metadata.version, "string");
assert.ok(metadata.version.trim());

const definitions = new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]));
const uses = new Set(Array.from(css.matchAll(/var\(\s*(--[\w-]+)/g), (match) => match[1]));
const undefinedVariables = [...uses].filter((name) => !definitions.has(name)).sort();
assert.deepStrictEqual(undefinedVariables, [], `every CSS custom property must be defined: ${undefinedVariables.join(", ")}`);
assert.ok(!css.includes("var(--text-muted)"));
assert.ok(!css.includes("var(--line"));
assert.ok(!css.includes("var(--muted"));
assert.ok(!css.includes("var(--surface"));

assert.ok(css.includes("@media (pointer: coarse)"));
assert.ok(/button:not\(\.quick-action-btn\)\s*\{[^}]*min-height:\s*44px;/s.test(css));
assert.ok(/input:not\(\[type="checkbox"\]\),\s*select\s*\{[^}]*min-height:\s*44px;/s.test(css));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
assert.ok(app.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'));

const builtIndex = path.join(root, "src", "web-dist", "index.html");
const builtCss = path.join(root, "src", "web-dist", "assets", "app.css");
const builtJs = path.join(root, "src", "web-dist", "assets", "app.js");
[builtIndex, builtCss, builtJs].forEach((file) => assert.ok(fs.existsSync(file), `existing packaged resource must remain present: ${file}`));

console.log("web entry, manifest test, and release-style hygiene regression passed");
