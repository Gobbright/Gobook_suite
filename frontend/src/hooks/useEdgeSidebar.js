import { useCallback, useEffect, useRef } from 'react';

export function useEdgeSidebar(setOpen) {
  const mode = useRef('closed');
  const closeTimer = useRef(null);
  const cancelClose = useCallback(() => { clearTimeout(closeTimer.current); closeTimer.current = null; }, []);
  const close = useCallback(() => { cancelClose(); mode.current = 'closed'; setOpen(false); }, [cancelClose, setOpen]);
  const toggle = useCallback(() => {
    cancelClose();
    setOpen((open) => { mode.current = open ? 'closed' : 'manual'; return !open; });
  }, [cancelClose, setOpen]);
  useEffect(() => {
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const scheduleClose = () => {
      if (mode.current === 'hover' && !closeTimer.current) closeTimer.current = setTimeout(close, 300);
    };
    const move = (event) => {
      if (event.pointerType !== 'mouse' || !pointer.matches || event.buttons) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (event.clientX <= 8) {
        cancelClose();
        if (mode.current === 'closed') { mode.current = 'hover'; setOpen(true); }
      } else if (mode.current === 'hover') {
        const edge = document.getElementById('app-navigation')?.getBoundingClientRect().right || 240;
        if (event.clientX > edge + 20) scheduleClose();
        else cancelClose();
      }
    };
    const leaveWindow = (event) => { if (!event.relatedTarget) scheduleClose(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leaveWindow, { passive: true });
    return () => { cancelClose(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leaveWindow); };
  }, [setOpen, close, cancelClose]);
  return { close, toggle };
}
