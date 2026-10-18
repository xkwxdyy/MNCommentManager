import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import './HtmlSelect.css';

// Keep the existing option/value contract, but render every interactive control in HTML.
export default function HtmlSelect({ children, value, onChange, disabled = false, ...props }) {
  const options = [];
  const collect = nodes => Children.forEach(nodes, node => {
    if (!isValidElement(node)) return;
    if (node.type === 'option') options.push({ ...node.props, value: String(node.props.value) });
    else collect(node.props.children);
  });
  collect(children);
  const id = useId(), root = useRef(null), trigger = useRef(null), list = useRef(null);
  const touchGesture = useRef(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [layout, setLayout] = useState({});
  const selected = options.findIndex(option => option.value === String(value));
  const close = () => { touchGesture.current = null; setOpen(false); };
  const show = () => {
    if (disabled || trigger.current.matches(':disabled')) return;
    const rect = trigger.current.getBoundingClientRect();
    const bounds = root.current.closest('[role="dialog"]')?.getBoundingClientRect();
    const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - rect.bottom - 12;
    const top = rect.top - Math.max(0, bounds?.top ?? 0) - 12;
    const above = bottom < 160 && top > bottom;
    setLayout({ [above ? 'bottom' : 'top']: 'calc(100% + 4px)', maxHeight: Math.max(44, Math.min(240, above ? top : bottom)) });
    setActive(selected >= 0 && !options[selected].disabled ? selected : Math.max(0, options.findIndex(option => !option.disabled)));
    setOpen(true);
  };
  const choose = index => {
    const option = options[index];
    if (!option || option.disabled || disabled || trigger.current.matches(':disabled')) return;
    close(); trigger.current.focus();
    onChange?.({ target: { value: option.value } });
  };
  const cancelOptionTouch = () => {
    const gesture = touchGesture.current;
    touchGesture.current = null;
    if (gesture?.blurred) close();
  };
  const beginOptionTouch = (index, event) => {
    const points = event.touches;
    if (!points || points.length !== 1) { cancelOptionTouch(); return; }
    const point = points[0];
    touchGesture.current = { index, identifier: point.identifier, x: point.clientX, y: point.clientY, moved: false };
  };
  const moveOptionTouch = event => {
    const gesture = touchGesture.current;
    if (!gesture) return;
    const points = event.touches, point = points && points.length === 1 ? points[0] : null;
    if (!point || point.identifier !== gesture.identifier || Math.abs(point.clientX - gesture.x) > 8 || Math.abs(point.clientY - gesture.y) > 8) gesture.moved = true;
  };
  const endOptionTouch = (index, event) => {
    const gesture = touchGesture.current;
    touchGesture.current = null;
    const points = event.changedTouches, point = points && points.length === 1 ? points[0] : null;
    if (!gesture || gesture.index !== index || gesture.moved || !point || point.identifier !== gesture.identifier || Math.abs(point.clientX - gesture.x) > 8 || Math.abs(point.clientY - gesture.y) > 8) {
      if (gesture?.blurred) close();
      return;
    }
    // Commit a tap before Catalyst synthesizes a compatibility mouse event with a different target.
    event.preventDefault();
    event.stopPropagation();
    choose(index);
  };
  useEffect(() => {
    if (!open) return;
    const outside = event => {
      // Catalyst may emit an HTML-root pointer sentinel before the actual input.
      // Only the fully observed sentinel is ignored; all other outside input closes.
      if (event.type === 'pointerdown' && event.target === document.documentElement &&
        [event.clientX, event.clientY, event.pageX, event.pageY, event.screenX, event.screenY].every(coordinate => coordinate === -1)) return;
      if (!root.current?.contains(event.target)) close();
    };
    const hide = () => close();
    // A touch-opened menu may not own DOM focus. Dismiss it before the parent
    // dialog handles Escape, while leaving Tab's normal focus movement intact.
    const dismissKey = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.current?.focus();
      } else if (event.key === 'Tab') close();
    };
    document.addEventListener('keydown', dismissKey, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('touchstart', outside);
    if (!window.PointerEvent) document.addEventListener('mousedown', outside);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('keydown', dismissKey, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('touchstart', outside);
      if (!window.PointerEvent) document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', hide);
    };
  }, [open]);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
  return <span className="html-select" ref={root} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    // Catalyst can report a null focus target while an option touch is still active.
    // Resolve that transient blur at touchend/cancel; real outside input still closes.
    if (event.relatedTarget == null && touchGesture.current) {
      touchGesture.current.blurred = true;
      return;
    }
    close();
  }}>
    <button {...props} ref={trigger} type="button" className={`html-select-trigger ${props.className || ''}`} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onKeyUp={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); open ? close() : show(); }} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (!open) { show(); return; }
        const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
        if (!enabled.length) return;
        const position = enabled.indexOf(active);
        setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1] : enabled[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); close();
      } else if ((event.key === 'Enter' || event.key === ' ') && open) {
        event.preventDefault(); event.stopPropagation(); choose(active);
      } else if (event.key === 'Tab') close();
    }}>
      <span className="html-select-value">{options[selected]?.children || options[0]?.children || '暂无选项'}</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open ? <span ref={list} className="html-select-list" role="listbox" id={`${id}-list`} aria-label={props['aria-label'] || '选项'} style={layout}>
      {options.map((option, index) => <button type="button" role="option" id={`${id}-${index}`} key={option.value} data-value={option.value} aria-selected={index === selected} className={index === active ? 'is-active' : ''} disabled={option.disabled} tabIndex={-1} onTouchStart={event => beginOptionTouch(index, event)} onTouchMove={moveOptionTouch} onTouchEnd={event => endOptionTouch(index, event)} onTouchCancel={cancelOptionTouch} onPointerMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); choose(index); }}>
        <span className="html-select-check" aria-hidden="true">{index === selected ? '✓' : ''}</span><span>{option.children}</span>
      </button>)}
    </span> : null}
  </span>;
}
