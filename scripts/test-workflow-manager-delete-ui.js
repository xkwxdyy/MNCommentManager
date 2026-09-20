const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "web", "src", "App.jsx"), "utf8");
assert.ok(source.includes("const [confirmDelete, setConfirmDelete]"), "workflow manager must own a native confirmation state");
assert.ok(source.includes("removeConfirmed"), "workflow manager must keep deletion behind confirmation");
assert.ok(!source.includes("window.confirm(`确定删除工作流"), "workflow deletion must not depend on browser confirm");

console.log("workflow manager delete UI regression passed");
