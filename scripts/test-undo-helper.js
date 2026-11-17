const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const runtime = path.resolve(process.argv[2] || path.join(__dirname, "../src"));

function loadHelper(swallowNativeException = false) {
  const groups = [];
  const noRefreshGroups = [];
  const refreshes = [];
  const context = {
    console,
    MNUtil: {
      currentNotebookId: "current-topic",
      undoGroupingNotRefresh(block, notebookId, trigger) {
        noRefreshGroups.push({ notebookId, trigger: JSON.parse(JSON.stringify(trigger)) });
        try { block(); } catch (error) { if (!swallowNativeException) throw error; }
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
            try { block(); } catch (error) { if (!swallowNativeException) throw error; }
          },
        };
      },
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(runtime, "UndoGroupingHelper.js"), "utf8");
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

{
  const { helper } = loadHelper(true);
  assert.throws(() => helper.run('native-callback-error', {notebookId:'topic-a'}, () => {
    throw new Error('native callback failed');
  }), /native callback failed/, 'native callback exceptions must reach the mutation caller');
}
