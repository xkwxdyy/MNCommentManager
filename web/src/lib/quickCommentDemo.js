import MNBridge from './mnBridge';

// Explicit preview mode uses memory-only data and never reaches the native bridge.
export function installQuickCommentDemo() {
  document.body.classList.add('quick-demo');
  const background = document.createElement('div');
  background.className = 'quick-demo-background';
  background.innerHTML = '<div class="quick-demo-label">快速输入演示 · 模拟卡片</div><article class="quick-demo-card"><small>阅读记录</small><h2>学习过程中的想法</h2><p>选中卡片后，直接追加评论。</p><div id="quick-demo-comments"></div><button id="quick-demo-open" aria-label="添加评论">＋</button></article>';
  document.body.prepend(background);
  const style = document.createElement('style');
  style.textContent = '.quick-demo-background{position:fixed;inset:0;background-color:#f4f6fa;background-image:radial-gradient(#c7cfdc 1px,transparent 1px);background-size:24px 24px;padding:24px;color:#263244}.quick-demo-label{font-size:13px;color:#67768b}.quick-demo-card{position:absolute;right:7%;top:10%;width:min(320px,80vw);padding:22px;background:#fff;border:2px solid #739bef;border-radius:22px;box-shadow:0 12px 36px #34425a18}.quick-demo-card h2{font-size:19px}.quick-demo-card p{font-size:14px;line-height:1.6}.quick-demo-card small{color:#7d8795}.quick-demo-card button{width:44px;height:44px;float:right;border:0;border-radius:50%;font-size:24px;color:#2563eb;background:#eaf1fd}.quick-demo-card #quick-demo-comments p{border-top:1px solid #e6eaf0;padding-top:12px;white-space:pre-wrap}@media(prefers-color-scheme:dark){.quick-demo-background{background-color:#161d29;color:#eee}.quick-demo-card{background:#2d3644}}';
  document.head.append(style);
  const data = { sessionId: 'demo-session', noteId: 'demo-card', noteTitle: '学习过程中的想法', draft: '', markdown: false, draftRevision: 0, submission: null };
  let submissions = Object.create(null);
  const snapshot = payload => {
    const rect = background.querySelector('article').getBoundingClientRect();
    return { ...data, submission: payload?.submissionId ? submissions[payload.submissionId] || null : data.submission, targetRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, nativeViewport: { width: innerWidth, height: innerHeight } };
  };
  MNBridge.send = async (command, payload) => {
    if (command === 'getQuickCommentState') return snapshot(payload);
    if (command === 'presentQuickComment') return { started: true };
    if (command === 'updateQuickCommentDraft') {
      if (!data.submission && payload.draftRevision >= data.draftRevision) { data.draft = payload.text; data.markdown = payload.markdown === true; data.draftRevision = payload.draftRevision; }
      return { retained: true };
    }
    if (command === 'appendQuickComment') {
      if (submissions[payload.submissionId]) {
        const previous = submissions[payload.submissionId];
        if (previous.text !== payload.text || previous.markdown !== (payload.markdown === true)) throw new Error('提交标识不能用于不同的正文或评论类型');
        return snapshot(payload);
      }
      if (data.submission) throw new Error('请核对原提交');
      data.markdown = payload.markdown === true;
      data.submission = { submissionId: payload.submissionId, text: payload.text, markdown: data.markdown, draftRevision: payload.draftRevision, status: 'saved', receipt: { persisted: true, noteId: data.noteId, markdown: data.markdown } };
      submissions[payload.submissionId] = data.submission;
      data.draftRevision = payload.draftRevision;
      data.draft = '';
      const comment = document.createElement('p'); comment.textContent = payload.text; comment.dataset.markdown = String(data.markdown);
      document.getElementById('quick-demo-comments').append(comment);
      const result = snapshot(payload);
      await new Promise(resolve => setTimeout(resolve, 160));
      return result;
    }
    if (command === 'closeQuickComment') {
      if (!data.submission && typeof payload.text === 'string' && payload.draftRevision >= data.draftRevision) { data.draft = payload.text; data.markdown = payload.markdown === true; data.draftRevision = payload.draftRevision; }
      return { closed: true };
    }
    if (command === 'setQuickCommentExit') return { started: payload.active === true };
    throw new Error('演示不支持该操作');
  };
  document.getElementById('quick-demo-open').onclick = () => {
    if (data.submission) { data.submission = null; data.sessionId = `demo-${Date.now()}`; data.draftRevision = 0; submissions = Object.create(null); }
    window.dispatchEvent(new Event('quick-demo-open'));
  };
}
