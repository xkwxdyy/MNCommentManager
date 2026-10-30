var __MN_COMMENT_ACTION_UI_MNCommentManagerAddon = (function () {
  const BLUE = '#2860d8', INK = '#242830', MUTED = '#687180', LINE = '#e0e4eb', WASH = '#edf3ff', RED = '#b93236';
  const images = Object.create(null);
  function color(hex) { return MNUtil.hexColorAlpha(hex, 1); }
  function palette() {
    const theme = typeof Application !== 'undefined' ? Application.sharedInstance().currentTheme : '';
    return theme === 'Dark' || theme === 'Gray'
      ? { dark: true, surface: '#252b35', section: '#1d232c', ink: '#edf0f5', muted: '#a3adbc', selected: '#253a60', danger: '#ffb4ae', accent: '#a7c5ff', line: '#566276' }
      : { dark: false, surface: '#ffffff', section: '#f5f7fa', ink: INK, muted: MUTED, selected: WASH, danger: RED, accent: BLUE, line: LINE };
  }
  function image(addon, name) {
    const asset = (palette().dark ? 'dark/' : '') + name;
    const key = String(addon && addon.mainPath || '') + '/' + asset;
    if (!Object.prototype.hasOwnProperty.call(images, key)) {
      try { images[key] = MNUtil.getImage(`${addon.mainPath}/action-icons/${asset}.png`, 3) || null; }
      catch (_) { images[key] = null; }
    }
    return images[key];
  }
  function icon(addon, button, name, label, selected) {
    if (!button) return;
    const bitmap = image(addon, name);
    if (bitmap && typeof button.setImageForState === 'function') {
      button.setTitleForState('', 0); button.setImageForState(bitmap, 0);
    }
    button.accessibilityLabel = label;
    button.accessibilityValue = selected === true ? '已开启' : '';
    const p = palette();
    button.backgroundColor = color(selected ? p.selected : p.surface);
    button.layer.borderWidth = 1;
    button.layer.borderColor = color(selected ? p.accent : p.line);
    if (typeof button.setTitleColorForState === 'function') button.setTitleColorForState(color(p.accent), 0);
    button.layer.cornerRadius = 9;
  }
  function describe(item) {
    const selector = String(item.selector || ''), param = item.param || {}, workflow = param.workflow;
    const step = workflow && workflow.steps && workflow.steps.length === 1 && workflow.steps[0];
    const action = step && step.actionId || param.action || selector;
    const builtin = !workflow || String(workflow.id || '').startsWith('builtin.');
    const title = builtin ? String(item.title || '').trim().replace(/^[↩ ]+/, '').replace(/[➡️]+$/, '').trim() : String(item.title || '').trim();
    if (selector === 'noopBatchCommentAction:') return { header: true, title };
    const rules = [
      [/back|返回/i, 'back', '返回'], [/openQuickCommentPanel/, 'organize', '打开面板'],
      [/openCommentManager/, 'manager', '打开面板'], [/openBatchCommentEditor/, 'batch', '打开面板'], [/openSingleQuickInput/, 'add', '打开面板'],
      [/keepFirst|KeepFirst/, 'organize', '内容整理'], [/Html|html/, 'html', '内容整理'],
      [/NoExcerpt|convertFold|^convert$/, 'excerpt', '内容整理'], [/InvalidLink|clearInvalid|RemoveAllLink|removeAllLink|section.*links/, 'unlink', '链接处理'],
      [/^delete$/, 'trash', '所选评论'], [/clearAllComments|ClearAllComments/, 'trash', '清空内容'], [/clearAllTitles|ClearAllTitles/, 'title', '清空内容'],
      [/^copy$/, 'copy', '所选评论'], [/^extract$/, 'extract', '所选评论'], [/^fold$/, 'fold', '所选评论'], [/^expand$/, 'expand', '所选评论'],
      [/^selectAll$/, 'select-all', '选择范围'], [/^clear$|selection/, 'clear', '选择范围'], [/WorkflowManager/, 'settings', '自动处理'], [/Workflow|workflow/, 'workflow', '自动处理']
    ];
    let found = rules.find(([pattern]) => pattern.test(String(action)));
    if (param.section === 'links' || /InvalidLinkMenu/.test(selector)) found = [null, 'unlink', '链接处理'];
    if (param.section === 'extension') found = [null, 'extension', '自动处理'];
    const group = found ? found[2] : '自动处理', danger = group === '清空内容' || action === 'delete';
    // Only unchanged built-in template names are translated; user workflow names remain exact.
    const aliases = { '转换 HTML 为 Markdown': 'HTML 评论转为 Markdown…', '转为非摘录版': '主摘录转为评论…', '去掉所有链接': '去掉所有卡片链接…', '清空所有评论': '清空评论…', '清空所有标题': '清空标题…', '评论快捷操作': '评论整理', '打开工作流管理器': '工作流管理器', '返回单选处理': '返回整卡操作', '返回评论批处理': '返回所选卡片操作' };
    return { title: builtin && aliases[title] || title, icon: found ? found[1] : 'workflow', group, danger, submenu: /^open.*Workflow|InvalidLinkMenu/.test(selector) };
  }
  function array(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    const size = typeof value.count === 'function' ? Number(value.count()) : Number(value.length || value.count || 0);
    return Array.from({ length: size }, (_, i) => typeof value.objectAtIndex === 'function' ? value.objectAtIndex(i) : value[i]);
  }
  function geometry(addon, host, sender, count, width, position) {
    const bounds = host.bounds;
    const safe = typeof __MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon !== 'undefined'
      ? __MN_PANEL_CONTENT_BOUNDS_MNCommentManagerAddon.available({ addon }, host, bounds) : bounds;
    const rect = sender.convertRectToView(sender.bounds, host);
    const above = Math.max(0, rect.y - Number(safe.y || 0) - 16);
    const below = Math.max(0, Number(safe.y || 0) + safe.height - rect.y - rect.height - 16);
    if ((position === 0 || position === 4) && Math.min(above, below) < 140) position = above > below ? 2 : 3;
    if (position === 2 && above < 88 && below > above) position = 3;
    else if ((position === 1 || position === 3) && below < 88 && above > below) position = 2;
    const verticalRoom = position === 2 ? above : position === 1 || position === 3 ? below : Math.min(above, below) * 2;
    return { rect, position, width: Math.max(160, Math.min(Number(width || 300), Number(bounds.width) - 16)),
      height: Math.min(count * 44, Math.max(88, Math.min(Number(safe.height) - 24, verticalRoom))) };
  }
  function present(addon, sender, items, width, position, options) {
    if (typeof MenuController === 'undefined' || !addon) return MNUtil.getPopoverAndPresent(sender, items, width, position);
    let popover;
    try {
      const opts = options || {}, metadata = [], rows = [];
      function header(title) { rows.push({ title: '── ' + title + ' ──', object: addon, selector: 'noopBatchCommentAction:', param: '', checked: false }); metadata.push({ header: true, title }); }
      header((opts.title || '评论操作') + (opts.subtitle ? ' · ' + opts.subtitle : ''));
      let previous = '';
      items.forEach(item => {
        const info = describe(item);
        if (info.header) return;
        if (info.group !== previous) { header(info.group); previous = info.group; }
        rows.push(Object.assign({}, item, { title: '　' + info.title })); metadata.push(Object.assign({}, info, { checked: item.checked === true }));
      });
      const host = MNUtil.studyView, frame = geometry(addon, host, sender, rows.length, width, position === undefined ? 2 : position);
      const controller = MenuController.new();
      controller.commandTable = rows; controller.rowHeight = 44; controller.fontSize = 14;
      controller.preferredContentSize = { width: frame.width, height: frame.height };
      popover = new UIPopoverController(controller);
      popover.delegate = addon;
      const previousMenu = addon.mncmActionPopover;
      if (previousMenu) { previousMenu.delegate = null; previousMenu.dismissPopoverAnimated(false); }
      addon.mncmActionPopover = popover;
      popover.presentPopoverFromRect(frame.rect, host, frame.position, true);
      function decorate() {
        const table = controller.menuTableView;
        if (!table) return;
        const visible = typeof table.visibleCells === 'function' ? table.visibleCells() : table.visibleCells;
        array(visible).forEach(cell => {
          const index = table.indexPathForCell(cell), info = index && metadata[Number(index.row)];
          const p = palette();
          if (!info || cell.mncmStyledMenu === popover && cell.mncmStyledRow === Number(index.row) && cell.mncmStyledSurface === p.surface) return;
          cell.mncmStyledMenu = popover; cell.mncmStyledRow = Number(index.row);
          cell.mncmStyledSurface = p.surface;
          cell.userInteractionEnabled = !info.header;
          cell.textLabel.text = info.title;
          cell.accessibilityLabel = info.header ? info.title + '，分组标题' : info.title;
          cell.indentationLevel = info.header ? 0 : 1;
          cell.indentationWidth = 20;
          cell.selectionStyle = info.header ? 0 : 1;
          cell.backgroundColor = color(info.header ? p.section : p.surface);
          cell.textLabel.textColor = color(info.header ? p.muted : info.danger ? p.danger : p.ink);
          cell.textLabel.font = UIFont.systemFontOfSize(info.header ? 12 : 14);
          cell.textLabel.numberOfLines = 2;
          cell.imageView.image = info.header ? null : image(addon, info.icon);
          cell.accessoryType = info.submenu ? 1 : info.checked ? 3 : 0;
          if (typeof cell.setNeedsLayout === 'function') cell.setNeedsLayout();
        });
      }
      decorate();
      // Native menu cells are recycled while scrolling; stop repainting as soon as the popup closes.
      if (typeof NSTimer !== 'undefined') {
        let timer;
        timer = NSTimer.scheduledTimerWithTimeInterval(0.2, true, function () {
          if (popover.popoverVisible === false || popover.popoverVisible === 0 || addon.mncmActionPopover !== popover) { if (timer) timer.invalidate(); return; }
          try { decorate(); } catch (error) { if (timer) timer.invalidate(); console.log('[MN Comment Manager] menu cell styling stopped: ' + (error.message || error)); }
        });
      }
      return popover;
    } catch (error) {
      if (popover) { try { popover.delegate = null; popover.dismissPopoverAnimated(false); } catch (_) {} if (addon.mncmActionPopover === popover) addon.mncmActionPopover = null; }
      console.log('[MN Comment Manager] coordinated menu fallback: ' + (error.message || error));
      return MNUtil.getPopoverAndPresent(sender, items, width, position);
    }
  }
  return { icon, image, describe, geometry, present, palette };
})();
