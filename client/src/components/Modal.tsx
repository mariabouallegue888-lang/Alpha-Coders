import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, dismissible = true, wide = false, drawer = false }: { title: string; onClose: () => void; children: ReactNode; dismissible?: boolean; wide?: boolean; drawer?: boolean }) {
  const titleId = useId(), dialog = useRef<HTMLElement>(null);
  const canDismiss = useRef(dismissible); canDismiss.current = dismissible;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert');
    root?.setAttribute('inert', '');
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]') || []).filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && !el.closest('[hidden]'));
    (dialog.current?.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || dialog.current)?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (canDismiss.current) onClose(); }
      if (event.key === 'Tab') {
        const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
        if (!first) { event.preventDefault(); dialog.current?.focus(); }
        else if (!dialog.current?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handle); document.body.style.overflow = overflow;
      if (!wasInert) root?.removeAttribute('inert');
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return createPortal(<div className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget && dismissible) onClose(); }}><section ref={dialog} className={`modal ${wide ? 'booking-modal' : ''} ${drawer ? 'modal-drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" disabled={!dismissible} onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>{children}</section></div>, document.body);
}
