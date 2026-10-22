var __MN_NATIVE_CARD_MENU_MNCommentManagerAddon = (function () {
  const commands = [{ id: 'nativeCommentManager', title: '评论管理' }, { id: 'nativeAddComment', title: '添加评论' }];
  const prefix = 'addon.marginnote.extension.mncommentmanager.';
  function record(type, details) {
    console.log('[MNCM NativeCardMenu] ' + type + ': ' + String(details && details.message || ''));
  }
  function stateFor(addon) {
    return addon.mncmNativeCardMenuState || (addon.mncmNativeCardMenuState = { generation: 0, noteId: '', bindings: [], timers: [] });
  }
  function active(addon) { return addon && addon.mnCommentManagerSceneActive !== false && addon.window === MNUtil.currentWindow; }
  function schedule(seconds, callback) {
    const timer = NSTimer.scheduledTimerWithTimeInterval(seconds, false, callback);
    try { if (typeof NSRunLoop !== 'undefined') NSRunLoop.mainRunLoop().addTimerForMode(timer, 'kCFRunLoopCommonModes'); }
    catch (error) { record('timer-mode-error', { message: String(error) }); }
    return timer;
  }
  function query(noteid) {
    try { return !noteid || Database.sharedInstance().getNoteById(String(noteid)) ? commands.map(item => Object.assign({}, item)) : []; }
    catch (error) { record('query-error', { message: String(error) }); return []; }
  }
  function unbind(state) {
    state.bindings.forEach(binding => binding.gestures.forEach(gesture => {
      try { binding.button.removeGestureRecognizer(gesture); } catch (error) { record('detach-error', { message: String(error) }); }
    })); state.bindings = [];
    if (state.holdActive) { state.holdActive = false; state.suppressUntil = Date.now() + 600; }
  }
  function detach(state) {
    state.timers.forEach(timer => { if (timer && timer.invalidate) timer.invalidate(); }); state.timers = [];
    unbind(state); state.generation += 1; state.noteId = ''; state.watchTimer = null; state.rootProof = null; state.rootInvalid = true;
  }
  function dispose(addon) {
    const state = stateFor(addon); detach(state); state.noteId = ''; state.suppressUntil = 0; state.suppressedNoteId = '';
    state.actionOrigin = null;
    if (state.anchor) state.anchor.removeFromSuperview(); state.anchor = null;
  }
  function templateValue() {
    let value = MNUtil.immersiveTemplateForAddon;
    if (typeof value === 'string') value = JSON.parse(value);
    return value && typeof value === 'object' ? value : null;
  }
  function actionScope() {
    try {
      const notebookId = String(MNUtil.currentNotebookId || '').trim(), immersive = MNUtil.immersiveMode;
      if (!notebookId || typeof immersive !== 'boolean') return '';
      const value = immersive ? templateValue() : null;
      if (immersive && (!value || typeof value.templateId !== 'string' || !value.templateId)) return '';
      return JSON.stringify([notebookId, immersive, immersive ? value.templateId : '']);
    } catch (_) { return ''; }
  }
  function invalidateActionOrigin(addon, state) {
    const origin = state.actionOrigin; state.actionOrigin = null; detach(state);
    const context = addon.dynamicCommentContext;
    if (origin && context && context.noteId === origin.noteId && !addon.quickCommentController &&
      !addon.dynamicMoveRailView && !addon.dynamicCommentMenuPopoverController && !addon.mncmWorkflowPanelOwnsEntries) {
      __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(addon, 'native-menu.context-changed');
    }
  }
  function actionContextMatches(addon, state, noteId) {
    try {
      const origin = state.actionOrigin, scope = actionScope();
      // MN Utils exposes currentNotebookId and getFocusNotes(); the latter
      // returns the current map selection, including floating map selections.
      const selected = typeof MNNote !== 'undefined' && typeof MNNote.getFocusNotes === 'function' ? MNNote.getFocusNotes() : null;
      const selectedIds = [];
      if (!Array.isArray(selected) || !selected.length) throw new Error('当前选择不可用');
      for (const note of selected) {
        const id = note && (note.noteId || note.noteid);
        if (typeof id !== 'string' || !id.trim()) throw new Error('当前选择不可用');
        if (selectedIds.indexOf(id) < 0) selectedIds.push(id);
      }
      if (origin && scope && origin.scope === scope && origin.noteId === noteId &&
        selectedIds.length === 1 && selectedIds[0] === noteId) return true;
    } catch (_) {}
    invalidateActionOrigin(addon, state); return false;
  }
  // ponytail: Host menu structure is private; fail closed on ambiguous or incomplete lookup and recheck after host upgrades.
  function findButton(menu, title) {
    const matches = [], queue = [{ view: menu, depth: 0 }]; let visited = 0;
    while (queue.length && visited++ < 128) {
      const item = queue.shift(), view = item.view;
      if (typeof view.titleForState === 'function' && String(view.titleForState(0) || '') === title) matches.push(view);
      const children = view.subviews || [];
      if (item.depth >= 6 && children.length) return null;
      children.forEach(child => queue.push({ view: child, depth: item.depth + 1 }));
    }
    return !queue.length && matches.length === 1 ? matches[0] : null;
  }
  function attach(addon, state) {
    try {
      if (!active(addon) || !state.noteId) return;
      if (!actionContextMatches(addon, state, state.noteId)) return;
      if (state.holdActive || addon.quickCommentController || addon.mncmWorkflowPanelOwnsEntries || addon.dynamicMoveRailView || addon.dynamicCommentMenuPopoverController) return;
      const menu = PopupMenu.currentMenu();
      if (!menu || !menu.visible) { unbind(state); return; }
      primaryCommands(addon, state, menu);
      const command = commands[0];
      if (!(menu.items || []).some(item => String(item.actionString || '') === prefix + command.id + ':' && String(item.title || '') === command.title)) { unbind(state); return; }
      const button = findButton(menu, command.title);
      if (!button) { unbind(state); return; }
      if (state.bindings.some(binding => binding.menu === menu && binding.button === button)) return;
      unbind(state);
      const binding = { menu, button, noteId: state.noteId, gestures: [], holding: false, doubleUntil: 0 };
      state.bindings.push(binding);
      try {
        const double = new UITapGestureRecognizer(addon, 'mncmNativeCardMenuGesture:');
        double.numberOfTapsRequired = 2; double.delaysTouchesBegan = true; double.delaysTouchesEnded = true; double.cancelsTouchesInView = true;
        button.addGestureRecognizer(double); binding.double = double; binding.gestures.push(double);
      } catch (error) { record('double-bind-error', { message: String(error) }); }
      try {
        const hold = new UILongPressGestureRecognizer(addon, 'mncmNativeCardMenuGesture:');
        hold.minimumPressDuration = 0.5; hold.cancelsTouchesInView = true;
        button.addGestureRecognizer(hold); binding.hold = hold; binding.gestures.push(hold);
      } catch (error) { record('hold-bind-error', { message: String(error) }); }
      button.accessibilityHint = ['单击打开快捷面板', binding.double ? '双击打开完整面板' : '', binding.hold ? '长按打开整卡操作' : ''].filter(Boolean).join('，');

    } catch (error) { record('attach-error', { message: String(error) }); }
  }
  function coverage(addon, context) {
    const result = { quick: false, manager: false, menu: false, quickInput: false };
    try {
      const state = stateFor(addon), menu = PopupMenu.currentMenu();
      if (!active(addon) || addon.mnCommentManagerInitialized === false || !context || !state.noteId || state.noteId !== context.noteId || !Database.sharedInstance().getNoteById(state.noteId) || !menu || !menu.visible) return result;
      if (!actionContextMatches(addon, state, context.noteId)) return result;
      const primary = primaryCommands(addon, state, menu);
      if (!primary) return result;
      const visible = command => primary.indexOf(prefix + command.id + ':') >= 0 &&
        (menu.items || []).filter(item => String(item.actionString || '') === prefix + command.id + ':' && String(item.title || '') === command.title).length === 1 &&
        reachableButton(menu, command.title, addon.window);
      result.quick = !!visible(commands[0]); result.quickInput = !!visible(commands[1]);
      // Host exports cannot prove keyboard/VoiceOver access to extra gestures. Keep direct manager/menu controls.
      return result;
    } catch (error) { return result; }
  }
  function tree(menu) {
    const views = [], queue = [{ view: menu, depth: 0 }];
    while (queue.length) {
      const entry = queue.shift();
      if (!entry.view || views.indexOf(entry.view) >= 0 || views.length >= 128 || entry.depth > 16) return null;
      views.push(entry.view);
      const children = entry.view.subviews;
      if (!children || typeof children.forEach !== 'function') return null;
      children.forEach(view => queue.push({ view, depth: entry.depth + 1 }));
    }
    return views;
  }
  function sameTree(first, second) { return first && second && first.length === second.length && first.every((view, index) => view === second[index]); }
  function itemSignature(menu) { return JSON.stringify((menu.items || []).map(item => [String(item.title || ''), String(item.actionString || '')])); }
  function sceneToken() {
    const value = templateValue();
    if (MNUtil.immersiveMode !== true || !value || typeof value.templateId !== 'string' || !value.templateId) return '';
    return value.templateId;
  }
  function reachableButton(menu, title, window) {
    const button = __MN_NATIVE_MENU_VISIBILITY_MNCommentManagerAddon.find(menu, title, window);
    if (!button || typeof window.hitTestWithEvent !== 'function') return null;
    const rect = button.convertRectToView(button.bounds, window);
    let hit = window.hitTestWithEvent({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, null);
    for (let depth = 0; hit && depth < 32; depth++, hit = hit.superview) if (hit === button) return button;
    return null;
  }
  function primaryLayout(scene, menu) {
    // The host editor can retain both edit-card aliases but renders one item.
    // Addon commands still follow in order before one blank More item.
    // No exported hierarchy flag exists. Other template layouts stay unknown;
    // a deadline or a newly built tree alone cannot establish a main strip.
    const declared = scene.commands, items = menu.items || [];
    if (declared.some((action, index) => declared.indexOf(action) !== index)) return false;
    let editCount = 0;
    while (editCount < declared.length && ['commentNote', 'noteHighlight:'].indexOf(declared[editCount]) >= 0) editCount += 1;
    if (!editCount || editCount > 2) return false;
    const configured = ['commentNote'].concat(declared.slice(editCount));
    if (items.length !== configured.length + 1) return false;
    if (String(items[0].title || '') !== '' || String(items[0].actionString || '') !== 'noteHighlight:') return false;
    const last = items[items.length - 1];
    if (String(last.title || '') !== '' || String(last.actionString || '') !== '') return false;
    return configured.slice(1).every((action, index) => {
      const command = commands.find(item => prefix + item.id + ':' === action), item = items[index + 1];
      return !!command && String(item.actionString || '') === action && String(item.title || '') === command.title;
    });
  }
  // ponytail: Root evidence follows PopupMenuOnNote + a newly built view tree; any rebuild stays unknown until another note popup.
  function primaryCommands(addon, state, menu) {
    try {
      if (state.rootInvalid || typeof MNUtil.isMacOS !== 'function' || !MNUtil.isMacOS()) return null;
      const scene = __MN_NATIVE_SCENE_ENTRIES_MNCommentManagerAddon.read();
      const token = sceneToken(), views = tree(menu), signature = itemSignature(menu);
      if (!scene || scene.scene !== token || !token || !views || menu.window !== addon.window) {

        state.rootInvalid = true; state.rootProof = null; return null;
      }
      const configured = JSON.stringify(scene.commands);
      const proof = state.rootProof;
      if (!primaryLayout(scene, menu)) {
        state.rootInvalid = true; state.rootProof = null; return null;
      }
      if (proof) {
        if (proof.menu !== menu || proof.scene !== token || proof.configured !== configured || proof.signature !== signature || !sameTree(proof.views, views)) {
          state.rootInvalid = true; state.rootProof = null; return null;
        }
        return proof.commands;
      }
      const baseline = state.rootBaseline;
      if (!baseline || baseline.menu === menu && baseline.visible && sameTree(baseline.views, views)) return null;
      // Late first observations may already be a secondary menu; defer replacement to the next popup.
      if (Date.now() - state.openedAt > 250) { state.rootInvalid = true; return null; }
      const available = commands.filter(command => scene.commands.indexOf(prefix + command.id + ':') >= 0 &&
        (menu.items || []).filter(item => String(item.actionString || '') === prefix + command.id + ':' && String(item.title || '') === command.title).length === 1 && reachableButton(menu, command.title, addon.window));
      state.rootProof = { menu, views, signature, configured, scene: token, commands: available.map(command => prefix + command.id + ':') };

      return state.rootProof.commands;
    } catch (_) { state.rootInvalid = true; state.rootProof = null; return null; }
  }
  function refresh(addon) {
    const state = stateFor(addon); if (!state.noteId) return;
    attach(addon, state);
  }
  function watch(addon, generation) {
    const state = stateFor(addon);
    if (state.watchTimer) return;
    let timer;
    timer = schedule(0.25, function () {
      state.timers = state.timers.filter(item => item !== timer);
      if (state.watchTimer === timer) state.watchTimer = null;
      if (state.generation !== generation) return;
      try {
        if (!active(addon)) { detach(state); return; }
        if (state.holdActive) return;
        if (addon.quickCommentController || addon.mncmWorkflowPanelOwnsEntries || addon.dynamicMoveRailView || addon.dynamicCommentMenuPopoverController) { detach(state); return; }
        const menu = PopupMenu.currentMenu();
        if (!menu || !menu.visible) { detach(state); return; }
        attach(addon, state);
        if (state.generation !== generation || !state.noteId) return;
        __MN_DYNAMIC_COMMENT_ACTIONS__.relayout(addon);
        watch(addon, generation);
      } catch (error) {
        detach(state); record('watch-error', { message: String(error) });
        try { __MN_DYNAMIC_COMMENT_ACTIONS__.relayout(addon); } catch (_) {}
      }
    });
    state.watchTimer = timer;
    state.timers.push(timer);
  }
  function opened(addon, sender) {
    if (!active(addon)) return;
    const info = sender && sender.userInfo || {}, note = info.note;
    const id = String(info.noteid || info.noteId || note && (note.noteId || note.noteid) || '');
    const state = stateFor(addon); detach(state); state.noteId = id; state.suppressUntil = 0; state.suppressedNoteId = ''; state.closePending = false;
    const scope = actionScope(); state.actionOrigin = scope && id ? { noteId: id, scope } : null;
    state.openedAt = Date.now();
    try { const previous = PopupMenu.currentMenu(); const views = previous ? tree(previous) : []; state.rootBaseline = { menu: previous, visible: !!(previous && previous.visible), views }; state.rootInvalid = !!(previous && previous.visible && !views); }
    catch (_) { state.rootBaseline = null; state.rootInvalid = true; }
    state.rect = info.winRect || null;
    const generation = state.generation;

    [0.02, 0.08, 0.2, 0.5].forEach(seconds => state.timers.push(schedule(seconds, function () {
      if (state.generation === generation) attach(addon, state);
    })));
    watch(addon, generation);
  }
  function closed(addon, sender) {
    const state = stateFor(addon), info = sender && sender.userInfo || {};
    const id = String(info.noteid || info.noteId || info.note && (info.note.noteId || info.note.noteid) || '');
    if (id && state.noteId !== id) return;
    const generation = state.generation;
    state.timers.push(schedule(0.1, function () {
      if (state.generation === generation) { if (state.holdActive) state.closePending = true; else detach(state); }
    }));
  }
  function contextFor(addon, noteId, action) {
    if (!active(addon) || addon.mncmWorkflowManagerModalOpen || addon.mncmWorkflowPanelOwnsEntries) throw new Error('当前窗口暂不能打开卡片菜单');
    const state = stateFor(addon);
    if (!actionContextMatches(addon, state, noteId)) throw new Error('目标卡片、场景或学习集已变化，请重新打开菜单');
    if (state.noteId && state.noteId !== noteId) throw new Error('目标卡片已变化，请重新打开菜单');
    const input = addon.quickCommentController;
    if (action === 'add' && input && !input._quickClosePending && Number(input._quickExiting || 0) !== 1 && __MN_QUICK_COMMENT_MNCommentManagerAddon.getState(input).noteId !== noteId) throw new Error('请先关闭当前输入框，再为另一张卡片添加评论');
    const note = __MN_COMMENT_DATA__.getWrappedNoteById(noteId);
    if (!note || !note.noteId) throw new Error('目标卡片不存在或已被删除');
    __MN_DYNAMIC_COMMENT_ACTIONS__.hideButton(addon, 'native-menu.handoff');
    __MN_BATCH_COMMENT_ACTIONS__.hideButton(addon, 'native-menu.handoff');
    let rect = state.rect;
    if (typeof rect === 'string') rect = MNUtil.parseWinRect(rect);
    if (!rect) { const menu = PopupMenu.currentMenu(); rect = menu && menu.targetWinRect; }
    const context = { note, noteId, token: 'native_' + Date.now() + '_' + Math.random(), anchorRect: rect, hostView: MNUtil.studyView };
    addon.dynamicCommentContext = context;
    return context;
  }
  function menu(addon, context) {
    const state = stateFor(addon), host = MNUtil.studyView;
    if (state.anchor) state.anchor.removeFromSuperview();
    const bounds = host.bounds, binding = state.bindings[0];
    const raw = binding && PopupMenu.currentMenu() === binding.menu && typeof binding.button.convertRectToView === 'function'
      ? binding.button.convertRectToView(binding.button.bounds, host) : context.anchorRect;
    const rect = raw && Number(raw.width) > 0 && Number(raw.height) > 0 ? raw : { x: bounds.width / 2, y: bounds.height / 2, width: 1, height: 1 };
    state.anchor = new UIView(rect); state.anchor.userInteractionEnabled = false; host.addSubview(state.anchor);
    addon.dynamicCommentMenuAnchor = state.anchor;
    const icons = { quick: 'openQuickCommentPanel', full: 'openCommentManager', add: 'openSingleQuickInput' };
    const entries = [['快捷面板', 'quick'], ['完整面板', 'full'], ['添加评论', 'add']].map(([title, action]) => ({ title, object: addon, selector: 'mncmNativeCardMenuAction:', param: { nativeAction: action, action: icons[action], noteId: context.noteId, token: context.token }, checked: false }));
    const items = entries.concat(__MN_COMMENT_WORKFLOW_MENU__.buildItems(addon, context, 'single', 'root'));
    const popover = __MN_COMMENT_ACTION_UI_MNCommentManagerAddon.present(addon, state.anchor, items, 300, 3, { title: '整卡操作', subtitle: '当前卡片' });
    if (!popover) return false;
    popover.delegate = addon; addon.dynamicCommentMenuPopoverController = popover; addon.dynamicCommentMenuItems = items;
    return true;
  }
  function execute(addon, action, noteId) {
    const context = contextFor(addon, noteId, action);

    if (action === 'add') { __MN_QUICK_COMMENT_MNCommentManagerAddon.open(addon, context); return true; }
    if (action === 'menu') return menu(addon, context);
    if (action === 'quick') {
      const snapshot = __MN_COMMENT_DATA__.getNoteSnapshot(context.note);
      if (!snapshot || snapshot.error) throw new Error(snapshot && snapshot.error || '读取评论失败');
      if (snapshot.comments.length || snapshot.excerpt && snapshot.excerpt.present) return __MN_COMMENT_MOVE_MNCommentManagerAddon.open(addon, { noteId, token: context.token });
    }
    return __MN_DYNAMIC_COMMENT_ACTIONS__.openExplicitAction(addon, { noteId, token: context.token }, 'manager');
  }
  function failed(error) { record('error', { message: String(error) }); MNUtil.showHUD(error.message || String(error)); return false; }
  function run(addon, command, noteid) {
    try {
      if (!commands.some(item => item.id === command) || !noteid) return false;
      const state = stateFor(addon), noteId = String(noteid);
      if (command === commands[0].id && (state.noteId === noteId || state.suppressedNoteId === noteId) && (state.holdActive || Date.now() < Number(state.suppressUntil || 0))) return false;
      return execute(addon, command === commands[1].id ? 'add' : 'quick', noteId);
    } catch (error) { return failed(error); }
  }
  function pressed(addon, gesture) {
    try {
      const state = stateFor(addon), binding = state.bindings.find(item => item.gestures.indexOf(gesture) >= 0);
      if (!binding) return false;
      if (gesture === binding.hold && [3, 4, 5].indexOf(Number(gesture.state)) >= 0) {
        if (binding.holding) { binding.holding = false; state.holdActive = false; state.suppressUntil = Date.now() + 600; }
        const menu = PopupMenu.currentMenu();
        if (state.closePending || !active(addon) || menu !== binding.menu || !menu.visible || addon.quickCommentController || addon.mncmWorkflowPanelOwnsEntries || addon.dynamicMoveRailView || addon.dynamicCommentMenuPopoverController) { state.closePending = false; detach(state); }
        else watch(addon, state.generation);
        return false;
      }
      if (!active(addon) || state.noteId !== binding.noteId || PopupMenu.currentMenu() !== binding.menu || !binding.menu.visible || findButton(binding.menu, commands[0].title) !== binding.button || !(binding.menu.items || []).some(item => String(item.actionString || '') === prefix + commands[0].id + ':' && String(item.title || '') === commands[0].title)) return false;
      const action = gesture === binding.double && Number(gesture.state) === 3 ? 'full' : gesture === binding.hold && Number(gesture.state) === 1 ? 'menu' : '';
      if (!action) return false;
      if (action === 'full') {
        if (binding.holding || Date.now() < binding.doubleUntil) return false;
        binding.doubleUntil = Date.now() + 600;
      } else {
        if (binding.holding) return false;
        binding.holding = true; state.holdActive = true;
      }
      state.suppressedNoteId = binding.noteId; state.suppressUntil = Date.now() + 600;
      return execute(addon, action, binding.noteId);
    } catch (error) { return failed(error); }
  }
  function fromMenu(addon, sender) {
    try {
      const input = sender && sender.param !== undefined ? sender.param : sender || {}, context = addon.dynamicCommentContext;
      if (!context || input.noteId !== context.noteId || input.token !== context.token || ['quick', 'full', 'add'].indexOf(input.nativeAction) < 0) throw new Error('菜单目标已变化，请重新打开菜单');
      return execute(addon, input.nativeAction, input.noteId);
    } catch (error) { return failed(error); }
  }
  return { query, run, opened, closed, pressed, fromMenu, dispose, coverage, refresh };
})();
