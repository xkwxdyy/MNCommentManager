const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs'),
  path = require('node:path');
const runtime = path.resolve(process.argv[2] || path.join(__dirname, '../src'));
const blue = {
  fontName: 'PingFangSC-Regular',
  fontSize: 16,
  textColor: '#175D62',
  backgroundColor: '#E3F2FD',
};
const red = { ...blue, fontSize: 12, textColor: '#9A3412', backgroundColor: '#FFF0DC' };
const clone = (v) =>
  JSON.parse(JSON.stringify(v, (k, x) => (k === 'rtf' ? { value: x.value } : x)));
const data = (value) => ({
  value,
  base64Encoding() {
    return Buffer.from(value).toString('base64');
  },
});
function rtf(text, s) {
  return data(
    '{\\rtf1{\\fonttbl\\f0\\fnil ' +
      s.fontName +
      ';}{\\colortbl;' +
      [s.textColor, s.backgroundColor]
        .map((c) =>
          c
            ? [0, 2, 4]
                .map(
                  (i, j) =>
                    '\\' + ['red', 'green', 'blue'][j] + parseInt(c.slice(i + 1, i + 3), 16),
                )
                .join('') + ';'
            : ';',
        )
        .join('') +
      '}\\pard\\f0\\fs' +
      s.fontSize * 2 +
      '\\cf1\\cb2 ' +
      text.replace(/[\\{}]/g, (c) => '\\' + c).replace(/\n/g, '\\line ') +
      '}',
  );
}
function setup() {
  let saves = 0,
    refresh = 0,
    groups = 0,
    failAppend = 0,
    appends = 0;
  const a = {
    noteId: 'A',
    notebookId: 'B',
    noteTitle: '源卡片',
    comments: [
      { type: 'HtmlNote', text: '证明', author: '', rtf: rtf('证明', blue) },
      { type: 'HtmlNote', text: '其他标题', author: '', rtf: rtf('其他标题', red) },
    ],
  };
  const b = {
    noteId: 'C',
    notebookId: 'B',
    noteTitle: '目标卡片',
    comments: [
      {
        type: 'TextNote',
        text: '## 标题\n\n**正文**与 `代码`。',
        markdown: true,
        author: '',
        field: '正文',
        fieldLabel: true,
      },
      { type: 'TextNote', text: '普通文字', author: '' },
      { type: 'HtmlNote', text: '旧正文\n第二行', author: '', rtf: rtf('旧正文\n第二行', red) },
      { type: 'TextNote', text: '![图](image.png)', markdown: true, author: '' },
      { type: 'TextNote', text: '$\nx+y\n$', markdown: true, author: '' },
    ],
  };
  for (const n of [a, b])
    Object.assign(n, {
      refresh() {},
      appendRichTextComment(text, s) {
        if (++appends === failAppend) throw Error('native failed');
        this.comments.push({ type: 'HtmlNote', text, author: '', rtf: rtf(text, s) });
      },
      appendTextComment(text) {
        this.comments.push({ type: 'TextNote', text, author: '' });
      },
      appendMarkdownComment(text) {
        this.comments.push({ type: 'TextNote', text, markdown: true, author: '' });
      },
      removeCommentByIndex(i) {
        this.comments.splice(i, 1);
      },
      setCommentField(i, field, fieldLabel) {
        Object.assign(this.comments[i], { field, fieldLabel });
      },
      sortCommentsByNewIndices(map) {
        const old = this.comments.slice();
        map.forEach((to, from) => (this.comments[to] = old[from]));
      },
    });
  let api;
  const context = vm.createContext({
    console,
    Map,
    Date,
    Math,
    UndoManager: {},
    Database: {
      sharedInstance: () => ({
        savedb() {
          saves++;
        },
      }),
    },
    MNUtil: { dataToString: (x) => x.value },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: {
      run(label, opts, fn) {
        groups++;
        return fn();
      },
    },
    __MN_COMMENT_MUTATIONS__: {
      refreshNotebookAfterCommentMutation() {
        refresh++;
      },
    },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById: (id) => ({ A: a, C: b })[id],
      getNoteSnapshot: (n) => ({
        noteId: n.noteId,
        comments: clone(n.comments),
        richText: api?.state(n.noteId),
      }),
    },
  });
  for (const name of ['CommentRichFormat', 'CommentMarkdown', 'RichCommentLifecycle'])
    vm.runInContext(
      fs.readFileSync(path.join(runtime, name + '.js'), 'utf8'),
      context,
    );
  api = context.__MN_RICH_COMMENTS_MNCommentManagerAddon__;
  return {
    api,
    a,
    b,
    copy: () => clone(b.comments),
    get saves() {
      return saves;
    },
    get refresh() {
      return refresh;
    },
    get groups() {
      return groups;
    },
    failNextAppend(offset = 1) {
      failAppend = appends + offset;
    },
  };
}
{
  const t = setup(),
    before = t.copy();
  t.api.copyFormat({ noteId: 'A', sourceIndex: 0, expectedText: '证明', expectedStyle: blue });
  const captured = clone(t.api.state('C').clipboard);
  const p = t.api.previewFormat({ noteId: 'C' }, 'paste');
  assert.equal(p.targets[0].afterText, '标题\n\n正文与 代码。');
  assert(!p.targets[3].eligible && !p.targets[4].eligible);
  const r = t.api.applyFormat({ noteId: 'C', token: p.token, indices: [0, 1] }, 'paste');
  assert.equal(r.changedCount, 2);
  assert.equal(t.b.comments[0].type, 'HtmlNote');
  assert.equal(t.b.comments[0].text, '标题\n\n正文与 代码。');
  assert.equal(t.b.comments[0].field, '正文');
  assert.equal(t.b.comments[0].fieldLabel, true);
  assert.deepEqual(clone(t.b.comments.slice(2)), before.slice(2));
  assert.equal(t.refresh, 1);
  assert.equal(t.saves, 1);
  t.api.undo({ noteId: 'C', token: r.undoToken });
  assert.deepEqual(t.copy(), before);
  assert.equal(t.refresh, 2);
  assert.deepEqual(clone(t.api.state('C').clipboard), captured);
}
{
  const t = setup(),
    before = t.copy(),
    d = t.api.draft({ noteId: 'C', index: 2, expectedText: '旧正文\n第二行' });
  const color = { ...blue, textColor: '#123ABC', backgroundColor: null };
  const r = t.api.save({ noteId: 'C', token: d.token, text: '编辑正文\n新行 α', style: color });
  assert.equal(t.b.comments[2].text, '编辑正文\n新行 α');
  assert.equal(t.api.state('C').undo.label, '撤销编辑富文本评论');
  t.api.undo({ noteId: 'C', token: r.undoToken });
  assert.deepEqual(t.copy(), before);
  const add = t.api.draft({ noteId: 'C', index: null });
  const added = t.api.save({ noteId: 'C', token: add.token, text: '新增正文', style: blue });
  assert.equal(t.b.comments.length, before.length + 1);
  t.api.undo({ noteId: 'C', token: added.undoToken });
  assert.deepEqual(t.copy(), before);
  const same = t.api.draft({ noteId: 'C', index: 2 });
  assert.equal(
    t.api.save({ noteId: 'C', token: same.token, text: same.text, style: same.style }).changedCount,
    0,
  );
  assert.equal(t.api.state('C').undo, null);
}
{
  const t = setup();
  t.api.copyFormat({ noteId: 'A', sourceIndex: 0 });
  const clip = clone(t.api.state('A').clipboard);
  const p = t.api.previewFormat({ noteId: 'A', sourceIndex: 1 }, 'brush');
  assert.equal(p.targets.length, 1);
  assert.equal(p.targets[0].index, 0);
  const r = t.api.applyFormat({ noteId: 'A', token: p.token, indices: [0] }, 'brush');
  assert.deepEqual(clone(t.api.state('A').clipboard), clip);
  t.api.undo({ noteId: 'A', token: r.undoToken });
  assert.deepEqual(clone(t.api.state('A').clipboard), clip);
}
{
  const t = setup();
  const first = t.api.draft({ noteId: 'C', index: 2 });
  const r1 = t.api.save({ noteId: 'C', token: first.token, text: '先编辑', style: blue });
  const second = t.api.draft({ noteId: 'C', index: null });
  const r2 = t.api.save({ noteId: 'C', token: second.token, text: '后添加', style: red });
  assert.throws(() => t.api.undo({ noteId: 'C', token: r1.undoToken }));
  t.api.undo({ noteId: 'C', token: r2.undoToken });
  assert.equal(t.api.state('C').undo.token, r1.undoToken);
  t.api.undo({ noteId: 'C', token: r1.undoToken });
  assert.equal(t.b.comments[2].text, '旧正文\n第二行');
}
{
  const t = setup(),
    before = t.copy();
  const d = t.api.draft({ noteId: 'C', index: 2 });
  assert.throws(() =>
    t.api.save({ noteId: 'C', token: d.token, text: 'new', style: { ...blue, textColor: '#XYZ' } }),
  );
  assert.deepEqual(t.copy(), before);
  t.b.comments[1].text = '外部新正文';
  assert.throws(() => t.api.save({ noteId: 'C', token: d.token, text: 'new', style: blue }));
  assert.equal(t.b.comments[1].text, '外部新正文');
}
{
  const t = setup(),
    before = t.copy();
  t.api.copyFormat({ noteId: 'A', sourceIndex: 0 });
  const p = t.api.previewFormat({ noteId: 'C' }, 'paste');
  t.failNextAppend(2);
  assert.throws(() => t.api.applyFormat({ noteId: 'C', token: p.token, indices: [0, 2] }, 'paste'));
  assert.deepEqual(
    t.copy(),
    before,
    'partial conversion restores Markdown, field, order and original HTML',
  );
}
{
  const t = setup();
  t.b.comments[2].rtf = rtf('隐藏的不同正文', red);
  const before = t.copy(),
    d = t.api.draft({ noteId: 'C', index: 2 });
  assert.throws(() => t.api.save({ noteId: 'C', token: d.token, text: 'new body', style: blue }));
  assert.deepEqual(t.copy(), before, 'editing must not discard a mismatched RTF body');
  t.b.comments[1].mnCommentId = 'protected';
  assert(!t.api.access(t.b, t.b.comments[1]).supported);
}
console.log(
  'Rich lifecycle: native clipboard, text/Markdown conversion, body/color edit, creation, ordered undo, stale/metadata guards, save/refresh and atomic recovery passed',
);

for (const patch of [
  (c) => {
    c.markdown = false;
  },
  (c) => {
    delete c.author;
  },
  (c) => {
    c.fieldLabel = false;
    c.author = null;
  },
]) {
  const t = setup();
  patch(t.b.comments[1]);
  const edit = t.api.draft({ noteId: 'C', index: 2 });
  const earlier = t.api.save({ noteId: 'C', token: edit.token, text: 'first edit', style: blue });
  t.api.copyFormat({ noteId: 'A', sourceIndex: 0 });
  const plan = t.api.previewFormat({ noteId: 'C' }, 'paste');
  const applied = t.api.applyFormat({ noteId: 'C', token: plan.token, indices: [1] }, 'paste');
  assert.doesNotThrow(() => t.api.undo({ noteId: 'C', token: applied.undoToken }));
  assert.equal(t.b.comments[1].text, '普通文字');
  assert.equal(t.b.comments[1].type, 'TextNote');
  assert.equal(t.b.comments[1].markdown === true, false);
  assert.equal(t.b.comments[1].author || '', '');
  assert.equal(t.api.state('C').undo.token, earlier.undoToken);
  t.api.undo({ noteId: 'C', token: earlier.undoToken });
  assert.equal(t.api.state('C').undo, null);
}
console.log('Default-valued metadata and continuous undo remain valid after native normalization');

// Style preference persistence via NSUserDefaults & neutral fallback
{
  const prefStore = {};
  const t = setup();
  // Without NSUserDefaults or clipboard, draft uses neutral colors (null/null)
  const initialDraft = t.api.draft({ noteId: 'C', index: null });
  assert.deepEqual(clone(initialDraft.style), {
    fontName: 'PingFangSC-Regular',
    fontSize: 16,
    textColor: null,
    backgroundColor: null,
  });

  // With NSUserDefaults available, saving a rich comment persists last-used style
  const ctxDefaults = {
    standardUserDefaults: () => ({
      objectForKey: (k) => prefStore[k] ?? null,
      setObjectForKey: (v, k) => {
        prefStore[k] = v;
      },
    }),
  };
  let apiWithPrefs;
  const ctx = vm.createContext({
    console,
    Map,
    Date,
    Math,
    NSUserDefaults: ctxDefaults,
    UndoManager: {},
    Database: { sharedInstance: () => ({ savedb() {} }) },
    MNUtil: { dataToString: (x) => x.value },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: { run(_l, _o, fn) { return fn(); } },
    __MN_COMMENT_MUTATIONS__: { refreshNotebookAfterCommentMutation() {} },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById: (id) => ({ A: t.a, C: t.b })[id],
      getNoteSnapshot: (n) => ({ noteId: n.noteId, comments: clone(n.comments), richText: apiWithPrefs?.state(n.noteId) }),
    },
  });
  for (const name of ['CommentRichFormat', 'CommentMarkdown', 'RichCommentLifecycle']) {
    vm.runInContext(fs.readFileSync(path.join(runtime, name + '.js'), 'utf8'), ctx);
  }
  apiWithPrefs = ctx.__MN_RICH_COMMENTS_MNCommentManagerAddon__;
  const d1 = apiWithPrefs.draft({ noteId: 'C', index: null });
  apiWithPrefs.save({ noteId: 'C', token: d1.token, text: '记住样式', style: red });
  const d2 = apiWithPrefs.draft({ noteId: 'C', index: null });
  assert.deepEqual(clone(d2.style), red, 'subsequent creation remembers last saved style from NSUserDefaults');

  // Unified composer modes: create Plain Text & Markdown, upgrade TextNote -> Rich, downgrade Rich -> Markdown
  const dText = apiWithPrefs.draft({ noteId: 'C', index: null, initialMode: 'text' });
  assert.equal(dText.mode, 'text');
  const rText = apiWithPrefs.save({ noteId: 'C', token: dText.token, text: '新增纯文本', style: red, mode: 'text' });
  assert.equal(t.b.comments[t.b.comments.length - 1].type, 'TextNote');
  assert.equal(t.b.comments[t.b.comments.length - 1].markdown === true, false);
  apiWithPrefs.undo({ noteId: 'C', token: rText.undoToken });

  const dConvert = apiWithPrefs.draft({ noteId: 'C', index: 2 });
  const rConvert = apiWithPrefs.save({ noteId: 'C', token: dConvert.token, text: '**转为MD**', style: red, mode: 'markdown' });
  assert.equal(t.b.comments[2].type, 'TextNote');
  assert.equal(t.b.comments[2].markdown, true);
  apiWithPrefs.undo({ noteId: 'C', token: rConvert.undoToken });
  assert.equal(t.b.comments[2].type, 'HtmlNote');

  // Brush includeConvertible & selectedIndices preselection
  const pBrush = apiWithPrefs.previewFormat({ noteId: 'C', sourceIndex: 2, includeConvertible: true, selectedIndices: [0, 1, 3] }, 'brush');
  assert(pBrush.targets.some((x) => x.kind === 'markdown' && x.eligible));
  assert.deepEqual(clone(pBrush.selectedIndices), [0, 1]);
}

// Fold metadata (mnCommentId & mnCommentDisplay) compatibility on fold-capable hosts with undoDepth === 0
{
  let undoDepth = 0, rev = 1;
  const card = {
    noteId: 'FOLD-CARD',
    notebookId: 'B',
    noteTitle: '折叠兼容测试',
    comments: [
      { type: 'HtmlNote', text: '已折叠富文本', author: '', rtf: rtf('已折叠富文本', blue), mnCommentId: 'id-0', mnCommentDisplay: { v: 1, collapsed: true } },
      { type: 'HtmlNote', text: '曾折叠已展开', author: '', rtf: rtf('曾折叠已展开', red), mnCommentId: 'id-1', mnCommentDisplay: { v: 1, collapsed: false } },
    ],
    refresh() {},
    appendRichTextComment(text, s) {
      this.comments.push({ type: 'HtmlNote', text, author: '', rtf: rtf(text, s) });
    },
    removeCommentByIndex(i) { this.comments.splice(i, 1); },
    sortCommentsByNewIndices(map) {
      const old = this.comments.slice();
      map.forEach((to, from) => (this.comments[to] = old[from]));
    },
    commentState() {
      return {
        ok: true,
        noteid: 'FOLD-CARD',
        revision: 'r' + rev,
        comments: this.comments.map((c, idx) => ({
          index: idx + 1,
          ownerNoteId: 'FOLD-CARD',
          collapsed: !!(c.mnCommentDisplay && c.mnCommentDisplay.collapsed === true),
        })),
      };
    },
    setCommentsCollapsed(targets, collapsed, expectedRevision) {
      assert.equal(undoDepth, 0, 'setCommentsCollapsed must execute outside plugin Undo groups');
      assert.equal(expectedRevision, 'r' + rev);
      rev++;
      targets.forEach(({ index }) => {
        const row = this.comments[index - 1];
        row.mnCommentId = row.mnCommentId || 'id-restored-' + index;
        row.mnCommentDisplay = { v: 1, collapsed };
      });
      return {
        ok: true,
        persisted: true,
        noteid: 'FOLD-CARD',
        revision: 'r' + rev,
        collapsed,
        requestedCount: targets.length,
        changedCount: targets.length,
        affectedOwnerNoteIds: ['FOLD-CARD'],
        comments: this.comments.map((c, idx) => ({
          index: idx + 1,
          ownerNoteId: 'FOLD-CARD',
          collapsed: !!(c.mnCommentDisplay && c.mnCommentDisplay.collapsed === true),
        })),
      };
    },
  };
  let foldApi;
  const ctx = vm.createContext({
    console,
    Map,
    Set,
    Date,
    Math,
    UndoManager: {},
    Database: { sharedInstance: () => ({ savedb() {} }) },
    MNUtil: { dataToString: (x) => x.value },
    __MN_UNDO_GROUPING_MNCommentManagerAddon: {
      run(_l, _o, fn) {
        undoDepth++;
        try { return fn(); } finally { undoDepth--; }
      },
    },
    __MN_COMMENT_MUTATIONS__: { refreshNotebookAfterCommentMutation() {} },
    __MN_COMMENT_DATA__: {
      getWrappedNoteById: () => card,
      getNoteSnapshot: () => ({ noteId: card.noteId, comments: clone(card.comments), richText: foldApi?.state(card.noteId) }),
    },
  });
  for (const name of ['CommentFoldState', 'CommentRichFormat', 'CommentMarkdown', 'RichCommentLifecycle']) {
    vm.runInContext(fs.readFileSync(path.join(runtime, name + '.js'), 'utf8'), ctx);
  }
  foldApi = ctx.__MN_RICH_COMMENTS_MNCommentManagerAddon__;
  assert.equal(foldApi.access(card, card.comments[0], 0).supported, true);
  assert.equal(foldApi.access(card, card.comments[1], 1).supported, true);

  const editFolded = foldApi.draft({ noteId: 'FOLD-CARD', index: 0 });
  const savedFolded = foldApi.save({ noteId: 'FOLD-CARD', token: editFolded.token, text: '折叠后仍可编辑', style: red });
  assert.equal(card.comments[0].text, '折叠后仍可编辑');
  assert.equal(card.comments[0].mnCommentDisplay.collapsed, true, 'folded state preserved after edit');

  foldApi.undo({ noteId: 'FOLD-CARD', token: savedFolded.undoToken });
  assert.equal(card.comments[0].text, '已折叠富文本');
  assert.equal(card.comments[0].mnCommentDisplay.collapsed, true, 'folded state preserved after undo');
}
console.log('Style persistence, unified modes, and fold-capable host compatibility passed');

{
  const { api, a } = setup();
  const c = a.comments[0];
  c.html = '<html><body><p>证明</p></body></html>';
  c.htmlSize = {};
  assert.equal(api.access(a, c, 0).supported, true, 'native RTF with Cocoa HTML cache remains editable');
  const d = api.draft({noteId:'A', index:0});
  const originalText = c.text;
  const saved = api.save({noteId:'A', token:d.token, text:originalText, style:{...blue,textColor:'#315D92',backgroundColor:'#D7EBFF'}});
  assert.equal(a.comments[0].text, originalText);
  assert.equal(a.comments[1].text, '其他标题');
  api.undo({noteId:'A', token:saved.undoToken});
  assert.equal(a.comments[0].text, originalText);
  assert.deepEqual(JSON.parse(JSON.stringify(api.draft({noteId:'A',index:0}).style)), blue);

}
