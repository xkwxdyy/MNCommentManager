const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadHelper() {
  const groups = [];
  const noRefreshGroups = [];
  const refreshes = [];
  const context = {
    console,
    MNUtil: {
      currentNotebookId: "current-topic",
      undoGroupingNotRefresh(block, notebookId, trigger) {
        noRefreshGroups.push({ notebookId, trigger: JSON.parse(JSON.stringify(trigger)) });
        block();
      },
    },
    Application: {
      sharedInstance() {
        return {
          refreshAfterDBChanged(notebookId) {
            refreshes.push(notebookId);
          },
        };
      },
    },
    UndoManager: {
      sharedInstance() {
        return {
          undoGrouping(actionName, notebookId, block) {
            groups.push({ actionName, notebookId });
            block();
          },
        };
      },
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../src/UndoGroupingHelper.js"), "utf8");
  vm.runInContext(source, context, { filename: "UndoGroupingHelper.js" });
  return {
    helper: context.__MN_UNDO_GROUPING_MNCommentManagerAddon,
    groups,
    noRefreshGroups,
    refreshes,
  };
}

{
  const { helper, groups, noRefreshGroups, refreshes } = loadHelper();
  const noteA = { notebookId: "topic-a" };
  const noteB = { notebookId: "topic-b" };
  const events = [];

  helper.run("outer", { note: noteA }, () => {
    events.push("outer");
    helper.run("inner", { note: noteB }, () => {
      events.push("inner");
    });
  });

  assert.deepStrictEqual(events, ["outer", "inner"]);
  assert.deepStrictEqual(groups, []);
  assert.deepStrictEqual(noRefreshGroups, [{
    notebookId: "topic-a",
    trigger: { feature: "mncommentmanager.outer.noGlobalDBRefresh" },
  }]);
  assert.deepStrictEqual(refreshes, []);
}

{
  const { helper, groups, noRefreshGroups, refreshes } = loadHelper();
  assert.throws(() => {
    helper.run("broken", { notes: [{ notebookId: "topic-a" }, { notebookId: "topic-a" }] }, () => {
      throw new Error("boom");
    });
  }, /boom/);

  assert.deepStrictEqual(groups, []);
  assert.deepStrictEqual(noRefreshGroups, [{
    notebookId: "topic-a",
    trigger: { feature: "mncommentmanager.broken.noGlobalDBRefresh" },
  }]);
  assert.deepStrictEqual(refreshes, []);
}

console.log("undo helper tests passed");
