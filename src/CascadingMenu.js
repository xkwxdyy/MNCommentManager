// Plugin-local adapter. Never changes MenuDev or MNUtil's shared prototypes.
var __MN_CASCADING_MENU_MNCommentManagerAddon = (function () {
  const slot = '___MN_CASCADING_MENU_MNCommentManagerAddonHandle';
  function supported() {
    if (typeof MenuDev === 'undefined' || typeof MenuDev.new !== 'function' || !MenuDev.prototype) return false;
    return ['addItems', 'addSubmenuItem', 'show', 'dismiss', '_selectRow', '_columnWidth', '_makeColumn', '_layoutColumns', '_closePanelsDeeperThan'].every(key => typeof MenuDev.prototype[key] === 'function');
  }
  function dispatch(row) {
    const target = row && row.object;
    const selector = row && String(row.selector || '');
    if (!target || !/^[A-Za-z_][A-Za-z0-9_]*:?$/.test(selector)) throw new Error('Invalid menu action: ' + selector);
    // JSB callbacks are native selectors, not JavaScript instance properties.
    // Native invocation establishes the callback's self and preserves the old
    // MenuController path. Never emulate self by changing a shared global.
    if (selector.endsWith(':') && typeof target.performSelectorWithObject === 'function') {
      return target.performSelectorWithObject(selector, row.param);
    }
    if (!selector.endsWith(':') && typeof target.performSelector === 'function') {
      return target.performSelector(selector);
    }
    const fn = target[selector] || target[selector.replace(/:$/, '')];
    if (typeof fn !== 'function') throw new Error('Menu action unavailable: ' + selector);
    return fn.call(target, row.param);
  }
  function dismiss(owner) {
    const handle = owner && owner[slot];
    if (handle) handle.dismissPopoverAnimated(false);
  }
  function present(owner, anchor, rows, options) {
    const opts = options || {};
    if (!owner || !anchor || !Array.isArray(rows) || !rows.length || !supported()) return null;
    let handle, menu;
    const report = error => {
      if (typeof opts.report === 'function') opts.report(error);
      else if (typeof console !== 'undefined') console.log('[__MN_CASCADING_MENU_MNCommentManagerAddon] ' + String(error && error.message || error));
    };
    try {
      const view = MNUtil.studyView;
      const bounds = view && (view.bounds || view.frame);
      const availableWidth = Number(bounds && bounds.width) - 24;
      // Keep the existing single-column UI when two readable columns cannot fit.
      if (!Number.isFinite(availableWidth) || availableWidth < 440) return null;
      const window = MNUtil.currentWindow;
      const notebook = MNUtil.currentNotebookId;
      const valid = () => (window === undefined || MNUtil.currentWindow === window) &&
        (notebook === undefined || MNUtil.currentNotebookId === notebook) &&
        (!opts.valid || opts.valid());
      if (!valid()) return null;
      const maxColumnWidth = Math.min(360, Math.floor((availableWidth - 1) / 2));
      menu = MenuDev.new(anchor, Math.min(Number(opts.width) || 280, maxColumnWidth), opts.position === undefined ? 0 : opts.position);
      if (!menu || !['addItems', 'addSubmenuItem', 'show', 'dismiss', '_selectRow', '_columnWidth', '_makeColumn', '_layoutColumns', '_closePanelsDeeperThan'].every(key => typeof menu[key] === 'function')) return null;
      let active = true;
      let columnRoom = maxColumnWidth;
      const isDisabled = row => !row || (opts.disabled ? opts.disabled(row) : !row.selector || /^(?:noop|none|back.*Menu)/i.test(row.selector));
      const toItems = entries => entries.filter(Boolean).map(row => {
        const children = opts.children && opts.children(row);
        const display = opts.decorate ? opts.decorate(row) : row;
        return { title: display.title, image: display.image, checked: !!row.checked,
          param: { row, children: typeof children === 'function' ? children : null },
          submenu: typeof children === 'function' ? [{ title: '' }] : undefined };
      });
      const originalSelect = menu._selectRow;
      const originalWidth = menu._columnWidth;
      menu._columnWidth = function (items) {
        return Math.min(originalWidth.call(this, items), maxColumnWidth, columnRoom);
      };
      menu._selectRow = function (panel, index) {
        const item = panel.items[index];
        const payload = item && item.param;
        if (!active || !payload) return;
        if (!valid()) { handle.dismissPopoverAnimated(false); return; }
        if (isDisabled(payload.row)) return;
        if (payload.children) {
          try {
            const entries = payload.children();
            if (entries === null) item.submenu = undefined; // Let the original action handle prerequisites.
            else {
              if (!Array.isArray(entries) || !entries.length) return;
              const level = this._panels.indexOf(panel);
              const used = this._panels.slice(0, level + 1).reduce((sum, column) => sum + column.width + 1, 0);
              columnRoom = availableWidth - used;
              // A deeper level that cannot fit uses its unchanged legacy opener.
              item.submenu = columnRoom >= 180 ? toItems(entries) : undefined;
            }
          } catch (error) {
            report(error);
            item.submenu = undefined;
          }
        }
        if (item.submenu && opts.expand) {
          try { opts.expand(payload.row); } catch (error) { report(error); }
        }
        return originalSelect.call(this, panel, index);
      };
      menu.maxHeight = Math.max(70, Number(bounds.height || 700) - 24);
      menu.addItems(toItems(rows));
      handle = {
        menu,
        dismissPopoverAnimated(animate) {
          if (!active) return;
          active = false;
          if (owner[slot] === handle) owner[slot] = null;
          menu.dismiss(animate);
        },
        get popoverVisible() { return active && (!menu.popover || menu.popover.popoverVisible !== false); }
      };
      if (opts.beforeShow) opts.beforeShow();
      dismiss(owner);
      owner[slot] = handle;
      const result = menu.show();
      if (!result || typeof result.then !== 'function') throw new Error('MenuDev.show must return a Promise');
      const release = () => { active = false; if (owner[slot] === handle) owner[slot] = null; };
      result.then(async selection => {
        if (!active || owner[slot] !== handle) return;
        const current = valid();
        release();
        if (!current) return;
        if (!selection || selection.isCanceled) {
          if (opts.cancel) opts.cancel(handle);
          return;
        }
        const row = selection.item && selection.item.param && selection.item.param.row;
        if (row && !isDisabled(row)) await (opts.select || dispatch)(row);
      }).catch(error => {
        const canFallback = active && owner[slot] === handle;
        if (canFallback) { handle.dismissPopoverAnimated(false); if (opts.fallback && valid()) opts.fallback(handle); }
        report(error);
      });
      return handle;
    } catch (error) {
      if (handle) handle.dismissPopoverAnimated(false);
      else if (menu && typeof menu.dismiss === 'function') menu.dismiss(false);
      report(error);
      return null;
    }
  }
  return { supported, present, dismiss, dispatch };
})();

__MN_CASCADING_MENU_MNCommentManagerAddon.open = function (owner, anchor, rows, width, position) {
  const single = rows.some(row => row.param && row.param.noteId);
  const context = single ? owner.dynamicCommentContext : owner.batchCommentContext;
  const token = context && context.token;
  const back = row => /^back(?:SingleWorkflowMenu|WorkflowMenu|SingleInvalidLinkMenu|BatchInvalidLinkMenu):$/.test(row.selector || '');
  return __MN_CASCADING_MENU_MNCommentManagerAddon.present(owner, anchor, rows, {
    width, position,
    decorate: row => {
      if (typeof __MN_COMMENT_ACTION_UI_MNCommentManagerAddon === 'undefined') return row;
      const ui = __MN_COMMENT_ACTION_UI_MNCommentManagerAddon;
      const info = ui.describe(row);
      return { title: info.title || row.title, image: info.header ? undefined : ui.image(owner, info.icon) };
    },
    beforeShow: () => {
      const previous = owner.mncmActionPopover;
      if (previous) { previous.delegate = null; previous.dismissPopoverAnimated(false); }
    },
    valid: () => (single ? owner.dynamicCommentContext : owner.batchCommentContext) === context && (!context || context.token === token),
    children: row => {
      if (/^open(?:Single|Batch)Workflows:$/.test(row.selector || '')) return () => {
        if (!context) return null;
        return __MN_COMMENT_WORKFLOW_MENU__.buildItems(owner, context, single ? 'single' : 'batch', row.param && row.param.section || 'saved').filter(item => !back(item));
      };
      if (/^open(?:Single|Batch)InvalidLinkMenu:$/.test(row.selector || '')) return () => {
        if (!context) return null;
        return [{ title: '  纯卡片链接', mode: 'card' }, { title: '  Markdown 行内链接', mode: 'markdown' }, { title: '  全部失效链接', mode: 'all' }]
          .map(item => ({ title: item.title, object: owner, selector: single ? 'runSingleClearInvalidLinks:' : 'runBatchClearInvalidLinks:',
            param: { token, noteId: context.noteId || '', mode: item.mode } }));
      };
      return null;
    },
    cancel: handle => {
      __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.menuDismissed(owner, handle);
    },
    fallback: failed => {
      const fallback = MNUtil.getPopoverAndPresent(anchor, rows, width, position);
      if (fallback) fallback.delegate = owner;
      if (owner.dynamicCommentMenuPopoverController === failed) owner.dynamicCommentMenuPopoverController = fallback;
      if (owner.batchCommentMenuPopoverController === failed) owner.batchCommentMenuPopoverController = fallback;
      owner.mncmActionPopover = fallback;
    }
  });
};
