var __MN_COMMENT_ACTION_SETTINGS__ = (function () {
  const BATCH_BUTTON_VISIBLE_KEY = "mncommentmanager_show_batch_button";
  const DYNAMIC_BUTTON_ENABLED_KEY = "mncommentmanager_enable_dynamic_single_card_button";

  function defaults() {
    return NSUserDefaults.standardUserDefaults();
  }

  function readBoolean(key, fallback) {
    try {
      const value = defaults().objectForKey(key);
      if (value === undefined || value === null) return fallback;
      if (value === true || value === false) return value;
      if (typeof value.boolValue === "function") return !!value.boolValue();
      return !!value;
    } catch (error) {
      console.log(`[MN Comment Manager] read action-button setting failed: ${error && error.message ? error.message : error}`);
      return fallback;
    }
  }

  function writeBoolean(key, value) {
    try {
      defaults().setBoolForKey(value === true, key);
      return true;
    } catch (error) {
      console.log(`[MN Comment Manager] write action-button setting failed: ${error && error.message ? error.message : error}`);
      return false;
    }
  }

  function getSettings() {
    return {
      showBatchButton: readBoolean(BATCH_BUTTON_VISIBLE_KEY, true),
      enableDynamicSingleCardButton: readBoolean(DYNAMIC_BUTTON_ENABLED_KEY, true),
    };
  }

  function updateSettings(raw) {
    const current = getSettings();
    const next = raw && typeof raw === "object" ? raw : {};
    if (typeof next.showBatchButton === "boolean") writeBoolean(BATCH_BUTTON_VISIBLE_KEY, next.showBatchButton);
    if (typeof next.enableDynamicSingleCardButton === "boolean") writeBoolean(DYNAMIC_BUTTON_ENABLED_KEY, next.enableDynamicSingleCardButton);
    return getSettings();
  }

  return {
    getSettings,
    updateSettings,
  };
})();
