const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
const vendoredMNUtilsSource = fs.readFileSync(
  path.join(__dirname, "../src/vendor/mnutils.js"),
  "utf8",
);

assert(
  !/this\.addErrorLog\(res\.text\(\),\s*["']fetchIPInfo\.ipapi["']\)/.test(vendoredMNUtilsSource),
  "vendored IP detection must not surface ipapi anti-bot HTML as a connection error",
);

function loadMain({ provideMNUtil, provideMNNote }) {
  const required = [];
  const initCalls = [];
  const context = {
    console,
    createMNCommentManagerAddon(mainPath) {
      return { mainPath };
    },
  };

  if (provideMNUtil) {
    context.MNUtil = {
      init(mainPath) {
        initCalls.push({ owner: "host", mainPath });
      },
    };
  }
  if (provideMNNote) context.MNNote = { owner: "host" };

  context.JSB = {
    require(moduleName) {
      required.push(moduleName);
      if (moduleName === "vendor/mnutils") {
        context.MNUtil = {
          init(mainPath) {
            initCalls.push({ owner: "vendor", mainPath });
          },
        };
      }
      if (moduleName === "vendor/mnnote") context.MNNote = { owner: "vendor" };
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "main.js" });
  const addon = context.JSB.newAddon("/addons/marginnote.extension.mncommentmanager");
  return { required, initCalls, addon };
}

{
  const result = loadMain({ provideMNUtil: true, provideMNNote: true });
  assert(!result.required.includes("vendor/mnutils"));
  assert(!result.required.includes("vendor/mnnote"));
  assert.deepStrictEqual(result.initCalls, []);
}

{
  const result = loadMain({ provideMNUtil: false, provideMNNote: false });
  assert(result.required.includes("vendor/mnutils"));
  assert(result.required.includes("vendor/mnnote"));
  assert.deepStrictEqual(result.initCalls, [
    { owner: "vendor", mainPath: "/addons/marginnote.extension.mncommentmanager" },
  ]);
}

{
  const result = loadMain({ provideMNUtil: true, provideMNNote: false });
  assert(!result.required.includes("vendor/mnutils"));
  assert(result.required.includes("vendor/mnnote"));
  assert.deepStrictEqual(result.initCalls, []);
}

console.log("runtime dependency isolation tests passed");
