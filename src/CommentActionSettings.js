var __MN_COMMENT_ACTION_SETTINGS__ = (function () {
  const BATCH_BUTTON_VISIBLE_KEY = "mncommentmanager_show_batch_button";
  const DYNAMIC_BUTTON_ENABLED_KEY = "mncommentmanager_enable_dynamic_single_card_button";
  const MERGE_TO_EXCERPT_DEFAULT_KEY = "mncommentmanager_merge_to_excerpt_default";
  const SHOW_IMAGE_EXCERPT_TEXT_KEY = "mncommentmanager_show_image_excerpt_text";
  const QUICK_COMMENT_MARKDOWN_KEY = "mncommentmanager_quick_comment_markdown";
  const ACTION_DEFAULTS = { managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu" };
  const ACTIONS = ["manager", "quickInput", "menu", "none"];

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
    const result = {
      showBatchButton: readBoolean(BATCH_BUTTON_VISIBLE_KEY, true),
      enableDynamicSingleCardButton: readBoolean(DYNAMIC_BUTTON_ENABLED_KEY, true),
      mergeToExcerptDefault: readBoolean(MERGE_TO_EXCERPT_DEFAULT_KEY, false),
      showImageExcerptText: readBoolean(SHOW_IMAGE_EXCERPT_TEXT_KEY, false),
      showQuickCommentButton: readBoolean("mncommentmanager_show_quick_comment_button", true),
    };
    Object.keys(ACTION_DEFAULTS).forEach((key) => {
      result[key] = ACTION_DEFAULTS[key];
      try {
        const value = String(defaults().objectForKey(`mncommentmanager_${key}`) || "");
        if (ACTIONS.indexOf(value) >= 0) result[key] = value;
      } catch (error) { console.log(`[MN Comment Manager] read dynamic action failed: ${error.message || error}`); }
    });
    return result;
  }

  function updateSettings(raw) {
    const next = raw && typeof raw === "object" ? raw : {};
    Object.keys(ACTION_DEFAULTS).forEach((key) => {
      if (next[key] !== undefined && ACTIONS.indexOf(next[key]) < 0) throw new Error("浮动按钮动作无效");
    });
    if (typeof next.showBatchButton === "boolean") writeBoolean(BATCH_BUTTON_VISIBLE_KEY, next.showBatchButton);
    if (typeof next.enableDynamicSingleCardButton === "boolean") writeBoolean(DYNAMIC_BUTTON_ENABLED_KEY, next.enableDynamicSingleCardButton);
    if (typeof next.mergeToExcerptDefault === "boolean") writeBoolean(MERGE_TO_EXCERPT_DEFAULT_KEY, next.mergeToExcerptDefault);
    if (typeof next.showImageExcerptText === "boolean") writeBoolean(SHOW_IMAGE_EXCERPT_TEXT_KEY, next.showImageExcerptText);
    if (typeof next.showQuickCommentButton === "boolean") writeBoolean("mncommentmanager_show_quick_comment_button", next.showQuickCommentButton);
    Object.keys(ACTION_DEFAULTS).forEach((key) => {
      if (next[key] === undefined) return;
      defaults().setObjectForKey(next[key], `mncommentmanager_${key}`);
    });
    return getSettings();
  }

  function getQuickCommentMarkdown() {
    return readBoolean(QUICK_COMMENT_MARKDOWN_KEY, false);
  }

  function setQuickCommentMarkdown(value) {
    if (typeof value !== "boolean") throw new Error("Markdown 偏好参数无效");
    if (!writeBoolean(QUICK_COMMENT_MARKDOWN_KEY, value) || getQuickCommentMarkdown() !== value) throw new Error("Markdown 偏好未保存，请重试");
  }

  return {
    getQuickCommentMarkdown,
    setQuickCommentMarkdown,
    getSettings,
    updateSettings,
  };
})();
