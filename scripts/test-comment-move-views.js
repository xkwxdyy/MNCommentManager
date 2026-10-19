const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.env.MNCM_RUNTIME_DIR || path.join(__dirname, '..', 'src');

function setup(options = {}) {
  const loads = [], base64Calls = [], allocated = [];
  class View {
    constructor(frame = {}) { allocated.push(this); this.frame = frame; this.layer = {}; this.subviews = []; this.events = []; this.titleLabel = {}; this.gestures = []; }
    addSubview(view) { view.removeFromSuperview(); this.subviews.push(view); view.superview = this; }
    removeFromSuperview() { if (this.superview) this.superview.subviews = this.superview.subviews.filter(view => view !== this); this.superview = null; }
    setTitleForState(title) { this.title = title; }
    setTitleColorForState() {}
    addTargetActionForControlEvents(target, selector, mask) { this.events.push({ target, selector, mask }); }
    addGestureRecognizer(value) { this.gestures.push(value); }
    bringSubviewToFront() {}
    resignFirstResponder() { this.resigned = true; }
  }
  const context = {
    UIView: View, UILabel: View, UITextField: View, UIImageView: View, UIScrollView: View,
    UIButton: { buttonWithType() { return new View(); } },
    UIPanGestureRecognizer: class { constructor(target, selector) { this.target = target; this.selector = selector; } },
    UIImage: { imageWithData(data) { return { data }; } },
    UIFont: { boldSystemFontOfSize: size => size, systemFontOfSize: size => size },
    MNUtil: {
      hexColorAlpha: value => value,
      getMediaByHash(hash) { loads.push(hash); if (hash === 'missing') throw new Error('not available'); return hash + '-data'; },
      imageFromBase64(base64, type) { base64Calls.push({ base64, type }); if (base64.includes('invalid')) throw new Error('invalid image'); return { base64, type }; },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(runtime, 'CommentMoveViews.js'), 'utf8'), context);
  const helper = context.__MN_COMMENT_MOVE_VIEWS_MNCommentManagerAddon;
  const state = {
    panelToken: 'session-one', host: new View({ x: 0, y: 0, width: 600, height: 600 }),
    geometry: {
      rail: { x: 300, y: 100, width: 44, height: options.compactControls ? 176 : 220 },
      expanded: { x: 300, y: 50, width: 44, height: 450 },
      sidebar: { x: options.expandLeft && !options.compact ? 100 : 300, y: 50, width: options.compact ? 44 : 244, height: 450 },
      holdSidebar: { x: options.expandLeft && !options.compact ? 100 : 300, y: 100, width: options.compact ? 44 : 244, height: options.compactControls ? 176 : 220 },
      compactControls: !!options.compactControls,
      preview: { x: options.expandLeft && !options.compact ? 100 : 300, y: 50, width: options.compact ? 44 : 244, height: 450 },
      card: { x: options.expandLeft ? 360 : 20, y: 50, width: options.expandLeft ? 220 : 260, height: 450 },
      picker: { x: 30, y: 100, width: 260, height: 380 },
    },
    comments: [
      { text: 'Alpha first', index: 0 },
      { text: 'Beta source', index: 1, imageHash: 'source-image' },
      { text: 'Gamma last', index: 2, drawingHash: 'missing' },
    ],
    sourceIndex: 1, targetIndex: 1, history: [],
  };
  const addon = {};
  helper.create(addon, state);
  return { helper, state, addon, loads, base64Calls, context, allocated };
}
function allText(view) { return [view.text || '', ...view.subviews.map(allText)].join('\n'); }
let cases = 0;
function test(name, body) { body(); cases++; console.log('PASS ' + name); }

test('rail uses only its narrow frame and binds both arrow completion paths', () => {
  const { state } = setup(), views = state.views;
  assert.equal(state.host.subviews.length, 1);
  assert.equal(views.rail.frame.width, 44);
  assert.equal(views.rail.frame.height, 220);
  assert.equal(views.rail.clipsToBounds, true);
  assert.equal(views.up.frame.height, 44);
  for (const [name, y] of [['up', 0], ['knob', 44], ['down', 88], ['undo', 132], ['close', 176]]) {
    assert.equal(views[name].frame.width, 44);
    assert.equal(views[name].frame.height, 44);
    assert.equal(views[name].frame.y, y);
  }
  assert.equal(views.undo.enabled, false);
  assert.equal(views.undo.superview, views.rail);
  for (const arrow of [views.up, views.down]) {
    assert.deepEqual(arrow.events.map(event => [event.selector, event.mask]), [
      ['dynamicMoveStepBegan:', 1], ['dynamicMoveStepEnded:', 64], ['dynamicMoveStepCancelled:', 384],
    ]);
  }
  assert.equal(views.pan.cancelsTouchesInView, true);
  assert.equal(views.pan.selector, 'dynamicMoveRailPanned:');
  assert.ok(views.knob.events.some(event => event.selector === 'dynamicMoveSourceTouchDown:' && event.mask === 1));
  assert.equal(views.rail.state, undefined);
});

test('render refreshes event tokens, boundary availability, source thumbnail and accessibility text', () => {
  const { helper, state, loads } = setup();
  assert.equal(loads.length, 1);
  helper.render(state);
  assert.equal(loads.length, 1);
  state.panelToken = 'session-two'; state.sourceIndex = 0; helper.render(state);
  assert.equal(state.views.up.enabled, false);
  assert.equal(state.views.down.enabled, true);
  assert.equal(state.views.knob.param.panelToken, 'session-two');
  assert.equal(state.views.undo.param.panelToken, 'session-two');
  assert.equal(state.views.status.superview, state.views.knob);
  assert.match(state.views.status.text, /1\s*\/\s*3/);
  assert.match(state.views.knob.accessibilityLabel, /Alpha first/);
  state.sourceIndex = 2; helper.render(state);
  assert.equal(state.views.down.enabled, false);
  assert.equal(state.views.sourceThumb.text, '✎');
  state.sourceIndex = -1; helper.render(state);
  assert.equal(state.views.up.enabled, false);
  assert.equal(state.views.down.enabled, false);
  assert.equal(state.views.sourceThumb.text, '↕');
  assert.equal(state.views.knob.accessibilityLabel, '选择要移动的评论');
});

test('Base64-only images use the existing helper with PNG or JPEG MIME and cache successful decoding', () => {
  const { helper, state, base64Calls } = setup();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nJ8AAAAASUVORK5CYII=';
  state.comments[0] = { imageBase64: png, imageMimeType: 'image/png' };
  state.sourceIndex = 0; helper.render(state); helper.render(state);
  assert.deepEqual(base64Calls, [{ base64: png, type: 'png' }]);
  assert.equal(state.views.sourceThumb.image.base64, png);
  state.comments[0] = { imageBase64: 'jpeg-payload', imageMimeType: 'image/jpeg' }; helper.render(state);
  assert.deepEqual(base64Calls[1], { base64: 'jpeg-payload', type: 'jpeg' });
  assert.match(state.views.knob.accessibilityLabel, /图片评论/);
});

test('unavailable hashes fall back to Base64 and invalid Base64 retains the image glyph', () => {
  const { helper, state, base64Calls } = setup();
  state.comments[0] = { imageHash: 'missing', imageBase64: 'fallback-png', imageMimeType: 'image/png' };
  state.sourceIndex = 0; helper.render(state);
  assert.equal(state.views.sourceThumb.image.base64, 'fallback-png');
  state.comments[0] = { imageBase64: 'invalid-base64', imageMimeType: 'image/jpeg' }; helper.render(state); helper.render(state);
  assert.equal(state.views.sourceThumb.text, '▧');
  assert.equal(base64Calls.filter(call => call.base64 === 'invalid-base64').length, 1);
});

test('handwriting binaries and SVG previews keep a distinct fallback while raster previews use the helper', () => {
  const { helper, state, loads, base64Calls } = setup();
  state.comments[0] = { drawingHash: 'drawing-binary', drawingPreviewDataURI: 'data:image/svg+xml;base64,PHN2Zy8+' };
  state.sourceIndex = 0; helper.render(state);
  assert.equal(loads.includes('drawing-binary'), false);
  assert.equal(base64Calls.length, 0);
  assert.equal(state.views.sourceThumb.text, '✎');
  assert.match(state.views.knob.accessibilityLabel, /手写评论/);
  state.comments[0].drawingPreviewDataURI = 'data:image/png;base64,raster-preview'; helper.render(state);
  assert.deepEqual(base64Calls[0], { base64: 'data:image/png;base64,raster-preview', type: 'png' });
  state.comments[0].drawingPreviewDataURI = 'data:image/png;base64,invalid-preview'; helper.render(state);
  assert.equal(state.views.sourceThumb.text, '✎');
});

test('drag previews actual neighbors after removal without mutating comments or creating a host overlay', () => {
  const { helper, state } = setup(), original = JSON.stringify(state.comments);
  helper.preview(state, { kind: 'drag', targetIndex: 2, thumbY: 490, cancelled: false });
  assert.equal(state.views.rail.frame.height, 450);
  assert.equal(state.views.knob.frame.y, 406);
  assert.equal(state.views.up.hidden, true);
  assert.equal(state.views.preview.userInteractionEnabled, false);
  assert.equal(state.views.preview.superview, state.views.rail);
  assert.match(allText(state.views.rail), /Gamma last/);
  assert.match(allText(state.views.rail), /评论末尾/);
  assert.equal(state.host.subviews.length, 1);
  assert.equal(JSON.stringify(state.comments), original);
  helper.preview(state, { kind: 'drag', targetIndex: 0, thumbY: 0, cancelled: true });
  assert.match(allText(state.views.rail), /评论开头/);
  assert.match(allText(state.views.rail), /Alpha first/);
  assert.match(allText(state.views.rail), /取消/);
  assert.equal(state.views.knob.frame.y, 0);
  helper.clearPreview(state);
  assert.equal(state.host.subviews.length, 1);
  assert.equal(state.views.rail.frame.height, 220);
  assert.equal(state.views.knob.frame.y, 44);
  assert.equal(state.views.close.hidden, false);
});

test('sidebar expansion preserves the knob global x-coordinate on either side of the card', () => {
  for (const expandLeft of [false, true]) {
    const { helper, state } = setup({ expandLeft });
    const globalX = state.views.rail.frame.x + state.views.knob.frame.x;
    helper.preview(state, { kind: 'drag', targetIndex: 2, thumbY: 275, cancelled: false });
    assert.equal(state.views.rail.frame.x + state.views.knob.frame.x, globalX);
    assert.equal(state.views.rail.frame.x, state.geometry.sidebar.x);
    assert.equal(state.views.rail.frame.width, state.geometry.sidebar.width);
    assert.equal(state.host.subviews.length, 1);
  }
});

test('compact sidebar preserves both destination neighbors within the rail', () => {
  const { helper, state } = setup({ compact: true });
  helper.preview(state, { kind: 'drag', targetIndex: 1, thumbY: 275, cancelled: false });
  assert.equal(state.views.rail.frame.width, 44);
  assert.match(allText(state.views.rail), /Alpha/);
  assert.match(allText(state.views.rail), /Gamma/);
  assert.equal(state.views.preview.superview, state.views.rail);
  assert.equal(state.host.subviews.length, 1);
});

test('hold previews keep tracking arrows visible and fixed while replacing only the undo and close area', () => {
  for (const options of [{ compact: true }, { expandLeft: true }, {}]) {
    const { helper, state } = setup(options), views = state.views;
    const globalFrame = view => ({ ...view.frame, x: views.rail.frame.x + view.frame.x, y: views.rail.frame.y + view.frame.y });
    const up = globalFrame(views.up), down = globalFrame(views.down);
    helper.preview(state, { kind: 'hold', targetIndex: 2, thumbY: 210, cancelled: false });
    assert.deepEqual(globalFrame(views.up), up);
    assert.deepEqual(globalFrame(views.down), down);
    assert.equal(views.up.hidden, false);
    assert.equal(views.down.hidden, false);
    assert.equal(views.undo.hidden, true);
    assert.equal(views.close.hidden, true);
    assert.match(allText(views.rail), /Gamma/);
    assert.match(allText(views.rail), /末尾/);
    assert.equal(state.host.subviews.length, 1);
    helper.clearPreview(state);
    for (const key of ['up', 'knob', 'down', 'undo', 'close']) assert.equal(views[key].frame.x, 0);
    assert.equal(views.undo.hidden, false);
    assert.equal(views.close.hidden, false);
  }
});

test('short control columns retain the pressed hold arrow and expose closing through the picker', () => {
  const { helper, state, addon } = setup({ compact: true, compactControls: true }), views = state.views;
  assert.equal(views.rail.frame.height, 176);
  assert.equal(views.close.hidden, true);
  assert.equal(views.undo.frame.height, 44);
  for (const [targetIndex, pressed, hidden] of [[2, 'down', 'up'], [0, 'up', 'down']]) {
    const y = views.rail.frame.y + views[pressed].frame.y, x = views.rail.frame.x + views[pressed].frame.x;
    helper.preview(state, { kind: 'hold', startIndex: 1, targetIndex, thumbY: y + 22, cancelled: false });
    assert.equal(views[pressed].hidden, false);
    assert.equal(views[hidden].hidden, true);
    assert.equal(views.rail.frame.y + views[pressed].frame.y, y);
    assert.equal(views.rail.frame.x + views[pressed].frame.x, x);
    assert.match(allText(views.rail), /前：/);
    assert.match(allText(views.rail), /后：/);
    helper.clearPreview(state);
  }
  helper.showPicker(addon, state);
  assert.ok(views.pickerClose.events.some(event => event.selector === 'closeMoveCommentRail:' && event.mask === 64));
  assert.equal(views.pickerClose.frame.width, 44);
  assert.equal(views.pickerClose.frame.height, 44);
});

test('pointer updates reuse the native track and context without rebuilding the sidebar', () => {
  const { helper, state, allocated } = setup();
  helper.preview(state, { kind: 'drag', targetIndex: 1, thumbY: 275, cancelled: false });
  const track = state.views.track, panel = state.views.preview, count = allocated.length;
  for (let pixel = 0; pixel < 100; pixel++) {
    helper.preview(state, { kind: 'drag', targetIndex: 1, thumbY: 275 + pixel / 10, cancelled: false });
    assert.equal(state.views.track, track);
    assert.equal(state.views.preview, panel);
    assert.equal(allocated.length, count, 'no native views may be allocated for pointer-only updates');
    assert(Math.abs(state.views.rail.frame.y + state.views.knob.frame.y + 22 - 275 - pixel / 10) < 0.001);
  }
  helper.preview(state, { kind: 'drag', targetIndex: 2, thumbY: 420, cancelled: false });
  assert.equal(state.views.track, track);
  assert.equal(state.views.preview, panel, 'changing the target also reuses the sidebar');
  assert.equal(allocated.length, count);
});

test('readable context uses full summaries and larger multiline labels', () => {
  const { helper, state } = setup();
  state.comments[0].text = '这段评论应当保留完整上下文而不是截成八个字';
  helper.preview(state, { kind: 'drag', targetIndex: 1, thumbY: 275, cancelled: false });
  assert(state.views.preview.frame.width >= 180);
  assert.match(allText(state.views.preview), /这段评论应当保留完整上下文而不是截成八个字/);
  const context = state.views.overview.rows.filter(row => !row.view.hidden && row.side).map(row => row.text);
  assert(context.length >= 2);
  assert(context.every(view => view.font >= 13 && view.frame.height >= 54));
});

test('five comments with a large third-row image use equal gray rows and actual neighbors', () => {
  const { helper, state, loads } = setup();
  state.comments = Array.from({ length: 5 }, (_, index) => ({ text: 'Comment ' + index, ...(index === 2 ? { imageHash: 'large-image' } : {}) }));
  state.sourceIndex = 0;
  const original = JSON.stringify(state.comments);
  helper.preview(state, { kind: 'drag', targetIndex: 0, thumbY: 72, cancelled: false });
  const overview = state.views.overview;
  const visible = overview.rows.filter(row => !row.view.hidden);
  assert.deepEqual(Array.from(visible, row => row.index), [0, 1, 2, 3]);
  assert(visible.filter(row => !row.side).every(row => row.view.frame.height === 24 && row.view.alpha === 0.45 && row.text.numberOfLines === 1));
  const picture = visible.find(row => row.comment.imageHash);
  assert.equal(picture.view.frame.height, 24);
  assert.equal(picture.bitmap.frame.height, 18);
  assert.equal(picture.bitmap.hidden, false);
  assert.equal(loads.filter(hash => hash === 'large-image').length, 1);
  helper.preview(state, { kind: 'drag', targetIndex: 2, thumbY: 275, cancelled: false });
  assert.equal(state.views.overview, overview);
  assert.match(overview.rows.find(row => !row.view.hidden && row.index === 1).text.text, /^上方：Comment 2/);
  assert.match(overview.rows.find(row => !row.view.hidden && row.index === 2).text.text, /^下方：Comment 3/);
  assert.equal(JSON.stringify(state.comments), original);
});

test('adjacent rows change their above/below label even when their row slot and comment stay the same', () => {
  const { helper, state } = setup();
  state.comments = Array.from({ length: 5 }, (_, index) => ({ text: 'Entry ' + index }));
  state.sourceIndex = 4;
  helper.preview(state, { kind: 'drag', targetIndex: 1, thumbY: 180, cancelled: false });
  const row = state.views.overview.rows.find(row => !row.view.hidden && row.index === 1);
  assert.match(row.text.text, /^下方：Entry 1/);
  helper.preview(state, { kind: 'drag', targetIndex: 2, thumbY: 250, cancelled: false });
  assert.equal(state.views.overview.rows.find(row => !row.view.hidden && row.index === 1), row);
  assert.match(row.text.text, /^上方：Entry 1/);
});

test('large lists follow the target with a bounded view pool and decode only visible images', () => {
  const { helper, state, loads, allocated } = setup();
  state.comments = Array.from({ length: 5000 }, (_, index) => ({ text: 'Entry ' + index, imageHash: 'picture-' + index }));
  state.sourceIndex = 3;
  helper.preview(state, { kind: 'drag', targetIndex: 2500, thumbY: 275, cancelled: false });
  const overview = state.views.overview, totalViews = allocated.length;
  assert(overview.rows.length < 25);
  assert(loads.length < 25);
  const initialOffset = overview.offset;
  for (const targetIndex of [0, 1, 2501, 4998, 4999, 2500]) {
    helper.preview(state, { kind: 'drag', targetIndex, thumbY: 275, cancelled: false });
    assert.equal(state.views.overview, overview);
    assert.equal(allocated.length, totalViews, 'no native view allocation when moving across a large list');
    const active = overview.rows.filter(row => !row.view.hidden), expected = [];
    if (targetIndex > 0) expected.push(targetIndex - 1);
    if (targetIndex < 4999) expected.push(targetIndex);
    assert.deepEqual(Array.from(active.filter(row => row.side), row => row.index), expected);
    assert(overview.offset >= 0 && overview.offset <= Math.max(0, overview.contentHeight - overview.viewport.frame.height));
    assert(overview.marker.frame.y >= 0 && overview.marker.frame.y + 24 <= overview.viewport.frame.height);
    assert(active.every(row => row.view.frame.y < overview.viewport.frame.height && row.view.frame.y + row.view.frame.height > 0));
  }
  assert.equal(overview.offset, initialOffset);
  assert(loads.length < 100, 'offscreen image hashes must remain unloaded');
  helper.clearPreview(state);
  assert.equal(state.views.overview, null);
});

test('taller hold sidebars keep arrows at the original global y-coordinate and reset their normal frames', () => {
  const { helper, state } = setup();
  state.geometry.holdSidebar = { x: 300, y: 20, width: 244, height: 432 };
  helper.preview(state, { kind: 'hold', targetIndex: 2, thumbY: 210, cancelled: false });
  assert.equal(state.views.rail.frame.y + state.views.up.frame.y, 100);
  assert.equal(state.views.rail.frame.y + state.views.down.frame.y, 188);
  helper.clearPreview(state);
  assert.equal(state.views.up.frame.y, 0);
  assert.equal(state.views.down.frame.y, 88);
  assert.equal(state.views.overview, null);
});

test('all targets keep the exact neighbors readable in minimum-height and tall list viewports', () => {
  for (const count of [14, 200]) for (const height of [176, 220, 450]) {
    const { helper, state } = setup();
    state.comments = Array.from({ length: count }, (_, index) => ({ text: 'Comment ' + index }));
    state.sourceIndex = count - 1;
    state.geometry.sidebar.height = state.geometry.expanded.height = height;
    for (let targetIndex = 0; targetIndex < count; targetIndex++) {
      helper.preview(state, { kind: 'drag', targetIndex, thumbY: 72 + targetIndex / (count - 1) * (height - 44), cancelled: false });
      const overview = state.views.overview;
      const adjacent = overview.rows.filter(row => !row.view.hidden && row.side);
      assert.equal(adjacent.length, targetIndex === 0 || targetIndex === count - 1 ? 1 : 2);
      for (const row of adjacent) {
        assert(row.view.frame.y >= -0.001 && row.view.frame.y + 54 <= overview.viewport.frame.height + 0.001, 'a neighbor must not be clipped');
        assert.equal(row.text.text, (row.side < 0 ? '上方：' : '下方：') + 'Comment ' + row.index);
      }
    }
  }
});

test('picker filtering retains the native search field and original comment indices', () => {
  const { helper, state, addon } = setup();
  helper.showPicker(addon, state);
  const search = state.views.search;
  state.panelToken = 'renewed-picker';
  helper.render(state);
  assert.equal(search.param.panelToken, 'renewed-picker');
  assert.equal(state.views.pickerClose.param.panelToken, 'renewed-picker');
  helper.filterPicker(state, 'gamma');
  assert.equal(state.views.search, search);
  assert.equal(state.views.pickerRows.length, 1);
  assert.equal(state.views.pickerRows[0].param.index, 2);
  helper.filterPicker(state, 'not-found');
  assert.match(allText(state.views.scroll), /没有匹配的评论/);
  helper.hidePicker(state);
  assert.equal(search.resigned, true);
  assert.equal(state.host.subviews.length, 1);
});

test('results update the permanent undo and status without creating a feedback overlay', () => {
  const { helper, state, addon } = setup();
  const undo = state.views.undo;
  helper.result(addon, state, '已移动');
  assert.equal(state.views.preview, null);
  assert.equal(state.views.undo.enabled, false);
  assert.equal(state.host.subviews.length, 1);
  state.history.push({});
  helper.result(addon, state, '已移动');
  assert.equal(state.views.undo, undo);
  assert.equal(undo.enabled, true);
  assert.equal(undo.superview, state.views.rail);
  assert.equal(undo.param.panelToken, state.panelToken);
  assert.equal(state.views.preview, null);
  assert.equal(state.host.subviews.length, 1);
  assert.equal(state.views.feedbackUndo, undefined);
  assert.equal(state.views.feedbackClose, undefined);
  helper.showPicker(addon, state);
  assert.equal(state.views.undo, undo);
  helper.dispose(state);
  assert.equal(state.views, null);
  assert.equal(state.host.subviews.length, 0);
});
console.log('CommentMoveViews: ' + cases + ' cases passed');
