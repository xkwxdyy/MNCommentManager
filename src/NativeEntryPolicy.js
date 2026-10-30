var __MN_NATIVE_ENTRY_POLICY_MNCommentManagerAddon = (function () {
  const ACTIONS = ["manager", "quickInput", "menu", "none"];

  function action(settings, key, fallback) {
    const value = settings[key];
    return ACTIONS.indexOf(value) >= 0 ? value : fallback;
  }

  function filter(ids, settings, coverage) {
    if (!Array.isArray(ids)) return [];
    const options = settings && typeof settings === "object" ? settings : {};
    if (options.autoHideNativeDuplicates === false) return ids.slice();
    const available = coverage && typeof coverage === "object" && !Array.isArray(coverage) ? coverage : {};
    const nativeMenu = available.menu === true;
    const nativeManager = available.manager === true;
    const managementTap = action(options, "managementTapAction", "manager");
    const managementHold = action(options, "managementHoldAction", "menu");
    const addTap = action(options, "addTapAction", "quickInput");
    const addHold = action(options, "addHoldAction", "menu");
    const customManagement = managementTap !== "manager" || managementHold !== "menu";
    const customAdd = addTap !== "quickInput" || addHold !== "menu";
    const keepManagement = customManagement || !nativeManager || !nativeMenu;

    // Only controls already certain to remain can replace the default add hold.
    const retainedDynamicMenu = ids.some((id) =>
      (id === "menu" && !nativeMenu) ||
      (id === "management" && keepManagement && (managementTap === "menu" || managementHold === "menu")) ||
      (id === "add" && customAdd && (addTap === "menu" || addHold === "menu"))
    );
    const keepAdd = customAdd || available.quickInput !== true || (!nativeMenu && !retainedDynamicMenu);

    return ids.filter((id) => {
      if (id === "management") return keepManagement;
      if (id === "menu") return !nativeMenu;
      if (id === "add") return keepAdd;
      if (id === "move") return available.quick !== true;
      return true;
    });
  }

  return { filter };
})();
