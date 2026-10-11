var __MN_COMMENT_MODULE_STORE__ = (function () {
  const rules = __MN_COMMENT_MODULE_RULES__;
  function paths() {
    const base = String(Application.sharedInstance().documentPath || '').trim().replace(/\/+$/, '');
    if (!base || base.charAt(0) !== '/') throw new Error('MarginNote 文稿目录不可用');
    const root = base + '/marginnote.extension.mncommentmanager';
    return { root, file: root + '/comment-modules.json' };
  }
  function read() {
    const p = paths();
    if (!NSFileManager.defaultManager().fileExistsAtPath(p.file)) return rules.defaultSettings();
    try {
      const data = NSData.dataWithContentsOfFile(p.file);
      if (!data) throw new Error('无法读取模块配置');
      return rules.validateSettings(NSJSONSerialization.JSONObjectWithDataOptions(data, 0));
    } catch (error) {
      throw new Error('模块配置无法读取或版本不受支持，原文件已保留：' + (error.message || String(error)));
    }
  }
  function snapshot() {
    try { return { moduleSettings: read(), moduleSettingsError: '' }; }
    catch (error) { return { moduleSettings: rules.defaultSettings(), moduleSettingsError: error.message || String(error) }; }
  }
  function save(value, expectedRevision) {
    const current = read(); // Never overwrite an unreadable or newer-format file.
    if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new Error('模块配置已变化，请刷新后重新设置');
    const normalized = rules.validateSettings(value);
    if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('模块配置版本已达到上限');
    normalized.revision = current.revision + 1;
    const p = paths(), manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(p.root)) manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(p.root, true, null);
    if (!manager.fileExistsAtPath(p.root)) throw new Error('无法创建模块配置目录');
    const data = NSJSONSerialization.dataWithJSONObjectOptions(normalized, 0);
    if (!data || !data.writeToFileAtomically(p.file, true)) throw new Error('模块配置保存失败，设置草稿已保留');
    const verified = read();
    if (JSON.stringify(verified) !== JSON.stringify(normalized)) throw new Error('模块配置回读不一致，请刷新后核对');
    return verified;
  }
  return { read, snapshot, save };
})();
