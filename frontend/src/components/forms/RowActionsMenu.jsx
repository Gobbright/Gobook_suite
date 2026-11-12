import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FilePlus2, FileText, MoreVertical, Pencil, Printer, Share2, Trash2 } from 'lucide-react';
import './rowActionsMenu.css';

const icons = { view: Eye, edit: Pencil, entry: FilePlus2, print: Printer, pdf: Download, share: Share2, delete: Trash2 };

export function RowActionsMenu({ options, onChange, disabled = false, 'aria-label': label = 'Record actions' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  const trigger = useRef(null); const menu = useRef(null); const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const outside = (event) => { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close(); };
    const escape = (event) => { if (event.key === 'Escape') { close(); trigger.current?.focus(); } };
    const scroll = (event) => { if (!menu.current?.contains(event.target)) close(); };
    menu.current?.querySelector('button:not(:disabled)')?.focus();
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    window.addEventListener('resize', close); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true); };
  }, [open]);
  function toggle() {
    if (open) { setOpen(false); return; }
    const rect = trigger.current.getBoundingClientRect();
    const height = Math.min(320, options.length * 36 + 10);
    const above = window.innerHeight - rect.bottom < height && rect.top > window.innerHeight - rect.bottom;
    setPosition({ right: Math.max(8, window.innerWidth - rect.right), ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }), maxHeight: Math.max(80, Math.min(height, (above ? rect.top : window.innerHeight - rect.bottom) - 12)) });
    setOpen(true);
  }
  function keyboard(event) {
    if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
  return <div className="record-row-actions" onClick={(event) => event.stopPropagation()}><button ref={trigger} type="button" className="record-actions-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={toggle}><MoreVertical size={15} /></button>
    {open && createPortal(<div ref={menu} id={id} className="record-actions-menu" style={position} role="menu" aria-label={label} onKeyDown={keyboard}>{options.map(({ value, label: text, disabled: optionDisabled = false, title }) => {
      const Icon = icons[value] || FileText;
      return <button key={value} type="button" role="menuitem" disabled={optionDisabled} title={title} className={value === 'delete' ? 'danger' : ''} onClick={() => { setOpen(false); trigger.current?.focus(); onChange(value); }}><Icon size={13} /><span>{text}</span></button>;
    })}</div>, document.body)}
  </div>;
}
