var __MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon = (function () {
  const ADDON_ID = "marginnote.extension.mncommentmanager";
  let diagnostic = { phase: "idle" };

  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function read() {
    diagnostic = { phase: "host" };
    try {
      if (typeof MNUtil === "undefined" || typeof MNUtil.isMacOS !== "function") return null;
      diagnostic.mac = MNUtil.isMacOS() === true;
      diagnostic.immersive = MNUtil.immersiveMode === true;
      if (!diagnostic.mac || !diagnostic.immersive) return null;
      diagnostic.phase = "template";
      const active = MNUtil.immersiveTemplateForAddon;
      diagnostic.templateRecord = record(active);
      if (!diagnostic.templateRecord) return null;
      diagnostic.templateAllowed = active.allowed === true;
      diagnostic.templateAllowedBoolean = typeof active.allowed === "boolean";
      diagnostic.idType = typeof active.templateId;
      diagnostic.idValid = diagnostic.idType === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(active.templateId);
      if (!diagnostic.templateAllowedBoolean || !diagnostic.idValid) return null;
      const scene = active.templateId;
      diagnostic.phase = "storage";
      if (typeof Application === "undefined" || typeof Application.sharedInstance !== "function") return null;
      const app = Application.sharedInstance();
      const documentPath = app && app.documentPath;
      diagnostic.documentPathValid = typeof documentPath === "string" && documentPath.charAt(0) === "/" && documentPath.indexOf("\0") < 0;
      if (!diagnostic.documentPathValid) return null;
      const root = documentPath.replace(/\/+$/, "");
      diagnostic.storageAvailable = !!root && typeof NSData !== "undefined" && !!NSData &&
        typeof NSData.dataWithContentsOfFile === "function" && typeof NSJSONSerialization !== "undefined" && !!NSJSONSerialization &&
        typeof NSJSONSerialization.JSONObjectWithDataOptions === "function";
      if (!diagnostic.storageAvailable) return null;

      // ponytail: Host ImmersiveTemplates is an internal schema-3 file format,
      // verified on the current Mac test host. Changes, inheritance without an
      // explicit plugins/cards list, and failures preserve dynamic entry points.
      // Timer callbacks lose current-addon identity: the getter's allowed=false
      // is not a pause signal. Require the file's explicit plugin allowlist;
      // actual scene disposal and suspension remain the caller's active guards.
      // NSData + NSJSONSerialization follows CommentWorkflowStore.js:71-88.
      diagnostic.phase = "data";
      const data = NSData.dataWithContentsOfFile(`${root}/ImmersiveTemplates/${scene}.json`);
      diagnostic.dataFound = !!data;
      if (!data) return null;
      diagnostic.dataEmpty = typeof data.length === "function" && data.length() <= 0;
      if (diagnostic.dataEmpty) return null;
      diagnostic.phase = "json";
      const template = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
      diagnostic.templateJSONRecord = record(template);
      if (!diagnostic.templateJSONRecord) return null;
      diagnostic.schemaType = typeof template.schema;
      diagnostic.schemaSupported = template.schema === 3;
      diagnostic.idMatches = template.id === scene;
      if (!diagnostic.schemaSupported || !diagnostic.idMatches) return null;
      diagnostic.phase = "plugins";
      diagnostic.hasOwnPlugins = Object.prototype.hasOwnProperty.call(template, "plugins");
      const plugins = template.plugins;
      diagnostic.pluginsArray = Array.isArray(plugins);
      diagnostic.fileAllowed = false;
      if (!diagnostic.hasOwnPlugins || !diagnostic.pluginsArray || plugins.length > 128) return null;
      const listed = [];
      for (let index = 0; index < plugins.length; index += 1) {
        const entry = plugins[index];
        if (typeof entry !== "string" || !entry.length || entry.length > 256 || listed.indexOf(entry) >= 0) return null;
        listed.push(entry);
      }
      diagnostic.fileAllowed = listed.indexOf(ADDON_ID) >= 0;
      if (!diagnostic.fileAllowed) return null;
      diagnostic.phase = "json";
      diagnostic.selectionMenuRecord = record(template.selectionMenu);
      diagnostic.hasOwnCards = diagnostic.selectionMenuRecord && Object.prototype.hasOwnProperty.call(template.selectionMenu, "cards");
      if (!diagnostic.selectionMenuRecord || !diagnostic.hasOwnCards) return null;
      diagnostic.phase = "cards";
      const cards = template.selectionMenu.cards;
      diagnostic.cardsArray = Array.isArray(cards);
      diagnostic.cardsWithinLimit = diagnostic.cardsArray && cards.length <= 128;
      if (!diagnostic.cardsWithinLimit) return null;
      const commands = [];
      for (let index = 0; index < cards.length; index += 1) {
        const entry = cards[index];
        if (typeof entry !== "string" || !entry.length || entry.length > 256 || commands.indexOf(entry) >= 0) {
          diagnostic.entriesValid = false;
          return null;
        }
        commands.push(entry);
      }
      diagnostic.entriesValid = true;
      diagnostic.phase = "ready";
      return { scene, commands: commands.slice() };
    } catch (error) {
      diagnostic.failedPhase = diagnostic.phase;
      diagnostic.phase = "exception";
      const name = error && error.name;
      diagnostic.exception = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError"].indexOf(name) >= 0 ? name : "Error";
      return null;
    }
  }

  return { read, status: () => Object.assign({}, diagnostic) };
})();
