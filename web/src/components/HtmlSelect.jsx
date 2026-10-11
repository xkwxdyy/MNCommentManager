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
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [layout, setLayout] = useState({});
  const selected = options.findIndex(option => option.value === String(value));
  const close = () => setOpen(false);
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
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) close(); };
    const hide = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('touchstart', outside);
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('touchstart', outside);
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [open]);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
  return <span className="html-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
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
      {options.map((option, index) => <button type="button" role="option" id={`${id}-${index}`} key={option.value} data-value={option.value} aria-selected={index === selected} className={index === active ? 'is-active' : ''} disabled={option.disabled} tabIndex={-1} onPointerMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); choose(index); }}>
        <span className="html-select-check" aria-hidden="true">{index === selected ? '✓' : ''}</span><span>{option.children}</span>
      </button>)}
    </span> : null}
  </span>;
}
