import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { EllipsisVertical, FileText, ReceiptText, SquarePen, Trash2, UserRound } from 'lucide-react';

export function CustomerRowActions({ customer, onEdit, onAction, financeReady, partyKind = 'customer' }) {
  const vendor = partyKind === 'vendor';
  const [position, setPosition] = useState(null);
  const trigger = useRef(null); const menu = useRef(null);
  useEffect(() => {
    if (!position) return undefined;
    function outside(event) { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setPosition(null); }
    function escape(event) { if (event.key === 'Escape') { setPosition(null); trigger.current?.focus(); } }
    function scroll(event) { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) setPosition(null); }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    menu.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [position]);
  function toggle() {
    if (position) { setPosition(null); return; }
    const rect = trigger.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom >= 200;
    setPosition({ left: Math.max(8, Math.min(rect.right - 196, window.innerWidth - 204)), ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) });
  }
  function action(value) { setPosition(null); onAction(value); }
  function navigateMenu(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return <div className="acu-row-actions" onClick={(event) => event.stopPropagation()}>
    <button className="acu-row-edit" title={`Edit ${customer.name}`} aria-label={`Edit ${customer.name}`} onClick={onEdit}><SquarePen size={17} strokeWidth={1.8} /><span>Edit</span></button>
    <button ref={trigger} className="acu-row-more" title={`More ${partyKind} actions`} aria-label={`More actions for ${customer.name}`} aria-expanded={Boolean(position)} aria-haspopup="menu" onClick={toggle}><EllipsisVertical size={18} /></button>
    {position && createPortal(<div ref={menu} className="acu-row-menu" style={position} role="menu" onKeyDown={navigateMenu} aria-label={`Actions for ${customer.name}`}>
      <button role="menuitem" onClick={() => action('profile')}><UserRound size={16} />View Profile</button>
      <button role="menuitem" onClick={() => { setPosition(null); onEdit(); }}><SquarePen size={16} />Edit</button>
      <button role="menuitem" disabled={!financeReady} onClick={() => action('statement')}><FileText size={16} />{vendor ? 'View Ledger' : 'View Statement'}</button>
      <Link role="menuitem" to={vendor ? `/billing/purchase-order/new?vendor=${encodeURIComponent(customer._id)}` : `/billing/invoice/new?customer=${encodeURIComponent(customer._id)}`} onClick={() => setPosition(null)}><ReceiptText size={16} />{vendor ? 'Create Purchase Order' : 'Create Invoice'}</Link>
      <button role="menuitem" className="acu-row-delete" onClick={() => action('delete')}><Trash2 size={16} />Delete</button>
    </div>, document.body)}
  </div>;
}
