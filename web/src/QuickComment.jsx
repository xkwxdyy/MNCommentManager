import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MNBridge from './lib/mnBridge';
import './QuickComment.css';

const messageOf = error => String(error?.message || error || '操作未完成');
const ticket = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function animationDestination(state, rect, width, height) {
  const target = state?.targetRect, native = state?.nativeViewport;
  if (!target || !native || native.width <= 0 || native.height <= 0) return null;
  const x = (target.x + target.width / 2) * width / native.width;
  const y = (target.y + target.height / 2) * height / native.height;
  if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > width || y > height) return null;
  return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
}
function Icon({ kind }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'close' ? <path d="m6 6 12 12M18 6 6 18" /> : kind === 'newline' ? <path d="M19 5v8a3 3 0 0 1-3 3H5m4-4-4 4 4 4" /> : kind === 'add' ? <><path d="M20 11V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v11l4-3h5" /><path d="M17 14v8m-4-4h8" /></> : <path d="M12 19V5m-6 6 6-6 6 6" />}
  </svg>;
}
export default function QuickComment() {
  const [state, setState] = useState(null), [text, setText] = useState('');
  const [markdown, setMarkdown] = useState(false), markdownValue = useRef(false);
  const [phase, setPhase] = useState('loading'), [error, setError] = useState('');
  const [ready, setReady] = useState(false), [nativeClosing, setNativeClosing] = useState(false);
  const [presentationRecovery, setPresentationRecovery] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
  const input = useRef(null), panel = useRef(null), composing = useRef(false), locked = useRef(false);
  const current = useRef(null), alive = useRef(true), closing = useRef(false), submission = useRef(null);
  const confirmed = useRef(false), keyboardOwned = useRef(false), keyboardFocusMoved = useRef(false);
  const livePhase = useRef(phase); livePhase.current = phase;
  const closeLatest = useRef(null); closeLatest.current = close;
  const exitVisual = useRef(false), loadGeneration = useRef(0);
  const presentationRequested = useRef(false);
  const textValue = useRef(''), draftRevision = useRef(0), deliveryGeneration = useRef(0);
  const cursor = useRef(null), allowLineBreak = useRef(false);
  const waitTimer = useRef(null), animationTimer = useRef(null), pendingCompositionClose = useRef(null);
  const focus = () => input.current?.focus({ preventScroll: true });

  useLayoutEffect(() => {
    if (phase === 'loading' || phase === 'closing' || phase === 'closed' || confirmed.current || presentationRequested.current) return;
    presentationRequested.current = true;
    MNBridge.send('presentQuickComment', { sessionId: current.current?.sessionId, reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches }).catch(() => {});
  }, [phase, presentationRecovery]);

  function loadState() {
    const generation = ++loadGeneration.current;
    MNBridge.send('getQuickCommentState').then(result => {
      if (!alive.current || closing.current || generation !== loadGeneration.current || confirmed.current) return;
      if (!result?.sessionId || !result.noteId) throw new Error('未读取到目标卡片');
      current.current = result;
      textValue.current = result.draft || ''; draftRevision.current = result.draftRevision || 0;
      markdownValue.current = result.markdown === true; setMarkdown(markdownValue.current);
      setReady(true); setError(''); setState(result); setText(textValue.current); setPhase('editing');
      if (result.submission && result.submission.status !== 'failed') {
        submission.current = submissionSnapshot(result.submission);
        textValue.current = submission.current.text; setText(textValue.current);
        markdownValue.current = submission.current.markdown; setMarkdown(markdownValue.current);
        if (result.submission.status === 'saved') finish(result, submission.current);
        else { locked.current = true; setPhase('uncertain'); setError(result.submission.error || '保存结果待核对'); }
      }
    }).catch(err => { if (alive.current && !closing.current && generation === loadGeneration.current && !confirmed.current) { locked.current = true; setReady(true); setError(messageOf(err)); setPhase('load-error'); } });
  }
  useEffect(() => {
    alive.current = true;
    const updateViewport = () => {
      if (confirmed.current || closing.current) return; // Keep the origin stable during either exit.
      const v = window.visualViewport;
      setViewport({ top: v?.offsetTop || 0, left: v?.offsetLeft || 0, width: v?.width || window.innerWidth, height: v?.height || window.innerHeight });
    };
    const loseWindowFocus = () => { keyboardOwned.current = false; };
    window.addEventListener('blur', loseWindowFocus);
    window.__MNQuickCommentKeyboard = event => {
      if (!alive.current || !current.current || event?.sessionId !== current.current.sessionId || closing.current || confirmed.current) return;
      if (event.type === 'show') {
        keyboardOwned.current = document.activeElement === input.current;
        keyboardFocusMoved.current = false;
      } else if (event.type === 'hide') {
        const owned = keyboardOwned.current;
        keyboardOwned.current = false;
        if (!owned || keyboardFocusMoved.current || !event.eventId || ['loading', 'saving', 'saved', 'closed'].includes(livePhase.current)) return;
        closeLatest.current(false, { reason: 'keyboard', eventId: event.eventId, reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
      }
    };
    window.__MNQuickCommentFocus = focus;
    window.__MNQuickCommentRecoverOpen = () => {
      if (!alive.current || closing.current || confirmed.current) return;
      presentationRequested.current = false;
      if (!current.current) { locked.current = true; setReady(true); setError('输入会话尚未就绪，正在重新读取'); setPhase('load-error'); loadState(); }
      setPresentationRecovery(value => value + 1);
    };
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    updateViewport();
    loadState();
    return () => {
      alive.current = false;
      pendingCompositionClose.current?.();
      clearTimeout(waitTimer.current); clearTimeout(animationTimer.current);
      delete window.__MNQuickCommentKeyboard;
      window.removeEventListener('blur', loseWindowFocus);
      delete window.__MNQuickCommentFocus;
      delete window.__MNQuickCommentRecoverOpen;
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, []);

  useEffect(() => {
    // Focus after React has enabled the textarea, rather than racing its commit.
    if (phase === 'editing' && state && !locked.current) focus();
  }, [phase, state]);

  useLayoutEffect(() => {
    if (cursor.current === null || !input.current) return;
    const next = cursor.current; cursor.current = null;
    focus(); input.current.setSelectionRange(next, next);
  }, [text]);

  useEffect(() => {
    const element = input.current;
    const beforeInput = event => {
      if (!['insertLineBreak', 'insertParagraph'].includes(event.inputType)) return;
      if (event.isComposing || composing.current) return;
      if (allowLineBreak.current) { allowLineBreak.current = false; return; }
      event.preventDefault(); submit();
    };
    element.addEventListener('beforeinput', beforeInput);
    return () => element.removeEventListener('beforeinput', beforeInput);
  }, [text, state, phase]);

  async function close(saved = false, cause = null) {
    if (closing.current || pendingCompositionClose.current || !saved && locked.current && submission.current && livePhase.current !== 'uncertain') return;
    if (!saved && composing.current) {
      try {
        await new Promise((resolve, reject) => {
          const element = input.current;
          const cleanup = () => { clearTimeout(timer); element.removeEventListener('compositionend', ended); };
          const ended = () => { cleanup(); timer = setTimeout(resolve, 0); };
          let timer = setTimeout(() => { cleanup(); reject(new Error('中文组词尚未结束，正文已保留，请完成组词后再次关闭')); }, 500);
          pendingCompositionClose.current = () => { cleanup(); reject(new Error('输入窗口已关闭')); };
          element.addEventListener('compositionend', ended);
          element.blur();
        });
      } catch (err) {
        if (alive.current) { change(input.current?.value ?? textValue.current); composing.current = false; setError(messageOf(err)); }
        return;
      } finally { pendingCompositionClose.current = null; }
      if (alive.current && !confirmed.current) closeLatest.current(false, cause);
      return;
    }
    const previousPhase = saved ? 'saved' : phase, previousLock = locked.current;
    closing.current = true;
    clearTimeout(animationTimer.current);
    locked.current = true; setPhase('closing');
    const payload = { sessionId: current.current?.sessionId, ...(cause || {}) };
    // An unhydrated page has no authoritative text; Native must keep its draft.
    if (current.current && !saved) {
      const value = composing.current ? input.current?.value ?? textValue.current : textValue.current;
      if (value !== textValue.current) { textValue.current = value; draftRevision.current += 1; setText(value); }
      composing.current = false;
      payload.text = value; payload.markdown = markdownValue.current; payload.draftRevision = draftRevision.current;
    }
    try {
      const reply = await MNBridge.send('closeQuickComment', payload);
      if (reply?.closed !== true) throw new Error('未确认窗口关闭，请重试关闭');
      if (alive.current) { setNativeClosing(reply.nativeClosing === true); setPhase('closed'); }
    } catch (err) {
      closing.current = false;
      if (alive.current) {
        exitVisual.current = false; setNativeClosing(false);
        if (saved) MNBridge.send('setQuickCommentExit', { sessionId: current.current?.sessionId, submissionId: submission.current?.submissionId, active: false }).catch(() => {});
        locked.current = previousLock;
        setError(saved ? `评论已保存，窗口关闭失败：${messageOf(err)}` : messageOf(err));
        setPhase(saved ? 'save-close-error' : previousPhase);
        if (!current.current) loadState();
      }
    }
  }
  function submissionSnapshot(record) {
    if (!record || typeof record.submissionId !== 'string' || !record.submissionId || typeof record.text !== 'string') throw new Error('提交记录缺少原正文，请保留正文后重新核对');
    return { submissionId: record.submissionId, text: record.text, markdown: record.markdown === true, draftRevision: record.draftRevision };
  }
  function finish(result, expected) {
    if (!alive.current || closing.current || confirmed.current) return;
    if (result?.submission?.status !== 'saved' || result.submission.submissionId !== expected.submissionId || result.submission.text !== expected.text || (result.submission.markdown === true) !== expected.markdown || result.submission.receipt?.persisted !== true || result.submission.receipt.noteId !== current.current?.noteId || (result.submission.receipt.markdown === true) !== expected.markdown) throw new Error('保存回执未通过校验');
    confirmed.current = true;
    clearTimeout(waitTimer.current);
    locked.current = true; setError('');
    let reduced = false, directed = false;
    try {
      let rect;
      if (panel.current) {
        const surface = panel.current.closest('.quick-overlay'), style = getComputedStyle(panel.current);
        panel.current.style.setProperty('--quick-start-opacity', style.opacity || '1');
        panel.current.style.setProperty('--quick-start-transform', style.transform && style.transform !== 'none' ? style.transform : 'translate(0, 0) scale(1)');
        surface.style.setProperty('--quick-backdrop-start-opacity', getComputedStyle(surface.querySelector('.quick-backdrop')).opacity || '1');
        rect = panel.current.getBoundingClientRect();
        const Matrix = window.DOMMatrix || window.WebKitCSSMatrix;
        if (Matrix && style.transform && style.transform !== 'none') {
          const origin = new Matrix(style.transform);
          rect = { left: rect.left - origin.m41, top: rect.top - origin.m42, width: rect.width, height: rect.height };
        }
      }
      input.current?.blur();
      reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const destination = panel.current && animationDestination(result, rect, window.innerWidth, window.innerHeight);
      if (panel.current && destination && !reduced) {
        directed = true;
        panel.current.closest('.quick-overlay').style.setProperty('--quick-exit-duration', '680ms');
        panel.current.style.setProperty('--quick-dx', `${destination.x}px`);
        panel.current.style.setProperty('--quick-dy', `${destination.y}px`);
        panel.current.classList.add('quick-fly');
      }
    } catch (_) { /* A visual failure never changes the confirmed save. */ }
    exitVisual.current = true; setPhase('saved');
    MNBridge.send('setQuickCommentExit', { sessionId: current.current.sessionId, submissionId: expected.submissionId, active: true, reducedMotion: reduced, directed }).catch(() => {});
    // The end event follows the actual rendered animation; the timer covers missing events.
    animationTimer.current = setTimeout(() => close(true), reduced ? 180 : 900);
  }
  function accept(result, expected) {
    if (!alive.current || confirmed.current || closing.current || submission.current?.submissionId !== expected.submissionId) return;
    if (result?.sessionId !== current.current?.sessionId || result.noteId !== current.current?.noteId) throw new Error('输入会话回执不匹配');
    if (!result.submission) {
      locked.current = true; setPhase('uncertain'); setError('原提交尚未收到，可以重试同次提交；正文将保持原样'); return;
    }
    if (result.submission.submissionId !== expected.submissionId || result.submission.text !== expected.text || (result.submission.markdown === true) !== expected.markdown) throw new Error('提交回执与原正文或评论类型不匹配，请核对原提交');
    if (result.submission.status === 'saved') { finish(result, expected); return; }
    if (result.submission.status === 'failed') {
      locked.current = false; setPhase('editing');
      submission.current = null;
      setError(result.submission.error || '本次提交失败，可以修改正文后重新提交'); focus();
    } else { locked.current = true; setPhase('uncertain'); setError(result.submission.error || '保存结果待核对，请核对后继续'); }
  }
  async function submit() {
    if (locked.current || closing.current || pendingCompositionClose.current || !textValue.current.trim() || composing.current || !state) return;
    const expected = { submissionId: ticket(), text: textValue.current, markdown: markdownValue.current, draftRevision: draftRevision.current };
    submission.current = expected;
    await deliver(expected);
  }
  async function deliver(expected) {
    if (closing.current || confirmed.current) return;
    const generation = ++deliveryGeneration.current;
    locked.current = true; livePhase.current = 'saving'; setPhase('saving'); setError('');
    clearTimeout(waitTimer.current);
    waitTimer.current = setTimeout(() => {
      if (alive.current && !closing.current && !confirmed.current && generation === deliveryGeneration.current) { setPhase('uncertain'); setError('保存回执尚未返回，请核对保存结果'); }
    }, 5000);
    try {
      accept(await MNBridge.send('appendQuickComment', { sessionId: current.current.sessionId, ...expected }), expected);
    } catch (err) { if (alive.current && !closing.current && !confirmed.current && generation === deliveryGeneration.current && submission.current?.submissionId === expected.submissionId) { setPhase('uncertain'); setError(messageOf(err)); } }
    finally { if (generation === deliveryGeneration.current) clearTimeout(waitTimer.current); }
  }
  async function check() {
    const expected = submission.current;
    if (!expected || closing.current) return;
    setError('正在核对保存结果…');
    try { accept(await MNBridge.send('getQuickCommentState', { sessionId: state.sessionId, submissionId: expected.submissionId }), expected); }
    catch (err) { if (alive.current && !closing.current && !confirmed.current && submission.current?.submissionId === expected.submissionId) setError(messageOf(err)); }
  }
  function change(value, mode = markdownValue.current) {
    if (locked.current || closing.current) return;
    textValue.current = value; draftRevision.current += 1;
    markdownValue.current = mode; setMarkdown(mode);
    setText(value);
    if (current.current) MNBridge.send('updateQuickCommentDraft', { sessionId: current.current.sessionId, text: value, markdown: mode, draftRevision: draftRevision.current }).catch(err => {
      if (alive.current && !closing.current && !confirmed.current) setError(`草稿保留失败：${messageOf(err)}`);
    });
  }
  function newline() {
    const element = input.current;
    if (!element || locked.current) return;
    const start = element.selectionStart, end = element.selectionEnd;
    cursor.current = start + 1;
    change(`${text.slice(0, start)}\n${text.slice(end)}`);
  }
  function keyDown(event) {
    allowLineBreak.current = event.key === 'Enter' && event.shiftKey;
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  }
  const busy = phase === 'saving' || phase === 'saved' || phase === 'closing';
  return <main className={`quick-overlay ${ready ? 'quick-ready' : ''} ${exitVisual.current && (phase === 'saved' || phase === 'closing' || nativeClosing) ? 'quick-success' : ''} ${!exitVisual.current && (phase === 'closing' || nativeClosing) ? 'quick-paused' : ''} ${phase === 'closed' ? 'quick-closed' : ''} ${nativeClosing ? 'quick-native-close' : ''}`}
    onPointerDownCapture={event => { keyboardFocusMoved.current = event.target !== input.current; }}
    onPointerDown={event => { if (event.target === event.currentTarget && !busy) { if (!text.trim()) close(); else focus(); } }}>
    <div className="quick-backdrop" aria-hidden="true" />
    <div className="quick-positioner" style={{ top: viewport.top, left: viewport.left, width: viewport.width, height: viewport.height }}>
      <section ref={panel} className="quick-card" role="dialog" aria-modal="true" aria-labelledby="quick-title" aria-busy={phase === 'saving'}
        onAnimationEnd={event => {
          if (event.target === panel.current && confirmed.current && !closing.current && ['quick-flight', 'quick-fade', 'quick-text-out'].includes(event.animationName)) close(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && !busy && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); close(confirmed.current); }
          if (event.key === 'Tab') {
            const controls = [...panel.current.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')];
            const next = (controls.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
            if (controls.length) { event.preventDefault(); controls[next].focus(); }
          }
        }}>
        <header><div className="quick-context"><Icon kind="add" /><div><h1 id="quick-title">添加评论</h1><p title={state?.noteTitle}>{state?.noteTitle || '正在读取卡片…'}</p></div></div>
          <button type="button" className="quick-icon quick-close" aria-label="关闭输入并保留草稿" title="关闭并保留草稿" disabled={busy} onClick={() => close(confirmed.current)}><Icon kind="close" /></button>
        </header>
        <textarea ref={input} value={text} aria-label="评论内容" placeholder="记录此刻的想法…" disabled={!state || locked.current} rows={4}
          onFocus={() => { keyboardFocusMoved.current = false; }}
          onBlur={event => { if (event.relatedTarget) keyboardFocusMoved.current = true; }}
          onChange={event => change(event.target.value)} onKeyDown={keyDown}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => {
            composing.current = false;
            // Composition can finish before the final input event reaches React.
            if (event.currentTarget.value !== textValue.current) change(event.currentTarget.value);
          }}
          onPaste={event => {
            const value = event.clipboardData.getData('text/plain'); event.preventDefault();
            const element = input.current, start = element.selectionStart;
            cursor.current = start + value.length;
            change(`${text.slice(0, start)}${value}${text.slice(element.selectionEnd)}`);
          }} />
        {error && <div className="quick-error" role="alert">{error}{phase === 'uncertain' && <><button onClick={check}>核对保存</button><button onClick={() => deliver(submission.current)}>重试同次提交</button></>}{phase === 'save-close-error' && <button onClick={() => close(true)}>关闭</button>}</div>}
        <footer><span className="quick-hint">回车提交<span> · Shift＋回车换行</span></span><div className="quick-actions">
          <button className="quick-icon quick-markdown" role="switch" aria-label="Markdown 评论" aria-checked={markdown} title={markdown ? 'Markdown 已开启：保存为 Markdown 评论' : 'Markdown 已关闭：保存为原生 Text 评论'} disabled={!state || locked.current}
            onClick={() => {
              if (composing.current) return;
              change(textValue.current, !markdownValue.current);
              focus();
            }}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M5 15V9l3 3 3-3v6m6-6v6m-3-3 3 3 3-3" /></svg></button>
          <button className="quick-icon" aria-label="插入换行" title="插入换行" disabled={!state || locked.current} onClick={newline}><Icon kind="newline" /></button>
          <button className="quick-submit" aria-label="添加评论" title="添加评论" disabled={!state || locked.current || !text.trim()} onClick={submit}>{phase === 'saving' ? <span className="quick-spinner" /> : <Icon kind="send" />}</button>
        </div></footer>
      </section>
    </div>
  </main>;
}
