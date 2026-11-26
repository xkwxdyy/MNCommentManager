import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from './ActionIcon';
import './RichCommentDialog.css';
export default function RichCommentDialog({
  title,
  busy,
  onClose,
  onEscape,
  onConfirmShortcut,
  preventBackdropClose = false,
  trigger,
  children,
  footer,
  wide = false,
  className = '',
  mode,
}) {
  const ref = useRef(null),
    busyRef = useRef(busy),
    closeRef = useRef(onClose),
    escapeRef = useRef(onEscape),
    confirmRef = useRef(onConfirmShortcut);
  busyRef.current = busy;
  closeRef.current = onClose;
  escapeRef.current = onEscape;
  confirmRef.current = onConfirmShortcut;
  useEffect(() => {
    const previous = trigger || document.activeElement,
      previousRow = previous?.closest('[data-comment-index]')?.id;
    const dialog = ref.current;
    (dialog.querySelector('textarea:not(:disabled)') || dialog.querySelector('button,input'))?.focus();
    const key = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && confirmRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busyRef.current) confirmRef.current();
        return;
      }
      if (e.key === 'Escape') {
        if (ref.current.querySelector('[role="listbox"]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busyRef.current) (escapeRef.current || closeRef.current)();
      }
      if (e.key === 'Tab') {
        const all = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = all[0],
          last = all[all.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (!ref.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      const next =
        previous?.isConnected && previous.getClientRects().length > 0
          ? previous
          : document.getElementById(previousRow) || document.querySelector('.rich-add-comment');
      next?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="rich-comment-backdrop"
      onMouseDown={(e) => {
        if (!busy && !preventBackdropClose && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`rich-comment-dialog ${wide ? 'is-wide' : ''} ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rich-comment-dialog-title"
        aria-busy={busy}
        data-format-mode={mode}
      >
        <header>
          <h2 id="rich-comment-dialog-title">{title}</h2>
          <button
            type="button"
            className="rich-comment-icon"
            title="关闭（Esc）"
            aria-label="关闭对话框"
            disabled={busy}
            onClick={onClose}
          >
            <ActionIcon name="close" />
          </button>
        </header>
        <div className="rich-comment-dialog-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>,
    document.body,
  );
}
