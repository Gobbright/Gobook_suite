import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { NOTIFICATION_EVENT, TOAST_DURATION_MS } from '../services/notifications.js';
import './notificationToasts.css';

function Toast({ item, dismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), Math.max(0, item.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [item.id, item.expiresAt, dismiss]);
  const Icon = item.tone === 'error' ? AlertCircle : item.tone === 'success' ? CheckCircle2 : Bell;
  return <article className={`app-toast app-toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
    <span className="app-toast-icon"><Icon size={20} /></span>
    <div className="app-toast-copy"><strong>{item.title || (item.tone === 'error' ? 'Something went wrong' : item.tone === 'success' ? 'Done' : 'Notification')}</strong><p>{item.message}</p>{item.href && <a href={item.href}>View notification</a>}</div>
    <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><X size={17} /></button>
    <span className="app-toast-timer" aria-hidden="true" style={{ animationDuration: `${Math.max(0, item.expiresAt - Date.now())}ms` }} />
  </article>;
}

export function NotificationToasts() {
  const [items, setItems] = useState([]);
  const [target, setTarget] = useState(null);
  const serial = useRef(0);
  const dismiss = useRef((id) => setItems((current) => current.filter((item) => item.id !== id).map((item, index) => index < 3 && !item.expiresAt ? { ...item, expiresAt: Date.now() + TOAST_DURATION_MS } : item))).current;
  useEffect(() => {
    function receive({ detail }) {
      if (!detail?.message) return;
      const item = { ...detail, id: ++serial.current, receivedAt: Date.now() };
      setItems((current) => current.some((existing) => existing.message === item.message && existing.receivedAt > item.receivedAt - 1500) ? current : [...current, { ...item, expiresAt: current.length < 3 ? Date.now() + TOAST_DURATION_MS : null }]);
    }
    const clear = () => setItems([]);
    const move = () => setTarget([...document.querySelectorAll('dialog[open]')].at(-1) || document.body);
    move();
    // Native dialogs live above regular z-index layers. Keep popups inside the active dialog.
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'attributes' && record.target.tagName === 'DIALOG' || [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 && (node.tagName === 'DIALOG' || node.querySelector?.('dialog'))))) move();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener(NOTIFICATION_EVENT, receive);
    window.addEventListener('employee:session-expired', clear);
    window.addEventListener('storage', clear);
    window.addEventListener('gobook:user-session', clear);
    return () => { observer.disconnect(); window.removeEventListener(NOTIFICATION_EVENT, receive); window.removeEventListener('employee:session-expired', clear); window.removeEventListener('storage', clear); window.removeEventListener('gobook:user-session', clear); };
  }, []);
  if (!target || !items.length) return null;
  return createPortal(<section className="app-toast-region" aria-label="Notifications">{items.slice(0, 3).map((item) => <Toast key={item.id} item={item} dismiss={dismiss} />)}{items.length > 3 && <span className="app-toast-queued">{items.length - 3} more notifications</span>}</section>, target);
}
