var __MN_COMMENT_ACTION_SETTINGS__ = (function () {
  const BATCH_BUTTON_VISIBLE_KEY = "mncommentmanager_show_batch_button";
  const DYNAMIC_BUTTON_ENABLED_KEY = "mncommentmanager_enable_dynamic_single_card_button";
  const MERGE_TO_EXCERPT_DEFAULT_KEY = "mncommentmanager_merge_to_excerpt_default";
  const SHOW_IMAGE_EXCERPT_TEXT_KEY = "mncommentmanager_show_image_excerpt_text";

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
      mergeToExcerptDefault: readBoolean(MERGE_TO_EXCERPT_DEFAULT_KEY, false),
      showImageExcerptText: readBoolean(SHOW_IMAGE_EXCERPT_TEXT_KEY, false),
    };
  }

  function updateSettings(raw) {
    const current = getSettings();
    const next = raw && typeof raw === "object" ? raw : {};
    if (typeof next.showBatchButton === "boolean") writeBoolean(BATCH_BUTTON_VISIBLE_KEY, next.showBatchButton);
    if (typeof next.enableDynamicSingleCardButton === "boolean") writeBoolean(DYNAMIC_BUTTON_ENABLED_KEY, next.enableDynamicSingleCardButton);
    if (typeof next.mergeToExcerptDefault === "boolean") writeBoolean(MERGE_TO_EXCERPT_DEFAULT_KEY, next.mergeToExcerptDefault);
    if (typeof next.showImageExcerptText === "boolean") writeBoolean(SHOW_IMAGE_EXCERPT_TEXT_KEY, next.showImageExcerptText);
    return getSettings();
  }

  return {
    getSettings,
    updateSettings,
  };
})();
