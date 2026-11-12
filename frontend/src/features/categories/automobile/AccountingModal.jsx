import { useEffect, useId, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import './accountingModal.css';

export function AccountingModal({ title, children, onClose, busy = false, wide = false }) {
  const titleId = useId();
  const close = () => { if (!busy) onClose(); };
  const closeRef = useRef(close);
  closeRef.current = close;
  const ref = useFocusTrap({ onClose: () => closeRef.current() });
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <div className="accounting-modal-overlay" onPointerDown={(event) => {
    if (event.target === event.currentTarget) close();
  }}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
    className={`accounting-modal${wide ? ' accounting-modal-wide' : ''}`}>
    <header className="accounting-modal-heading"><h2 id={titleId}>{title}</h2>
      <button type="button" disabled={busy} aria-label={`Close ${title}`} onClick={close}><X size={20} /></button>
    </header>
    <div className="accounting-modal-content">{children}</div>
  </section></div>;
}

export function AccountingReportOptions({ title, children, error }) {
  const [open, setOpen] = useState(false);
  return <div className="accounting-report-options">
    <button type="button" onClick={() => setOpen(true)}><Settings2 size={16} />Report Options</button>
    {open && <AccountingModal title={title} onClose={() => setOpen(false)}>
      {typeof children === 'function' ? children(() => setOpen(false)) : children}
      {error && <p className="autop-error" role="alert">{error}</p>}
      {typeof children !== 'function' && <footer className="accounting-modal-actions"><button type="button" className="autop-primary" onClick={() => setOpen(false)}>Done</button></footer>}
    </AccountingModal>}
  </div>;
}
