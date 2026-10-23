import { translate } from '../../i18n/index.js';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The native modal provides background inertness and screen-reader isolation.
export default function AccessibleDialog({ children, onClose, title, style, className = '', ...props }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) { event.preventDefault(); dialogRef.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  return createPortal(
    <dialog
      {...props}
      ref={dialogRef}
      className="modal-overlay accessible-dialog"
      aria-label={props['aria-labelledby'] ? undefined : translate(title)}
      aria-modal="true"
      tabIndex={-1}
      onCancel={event => { event.preventDefault(); onCloseRef.current?.(); }}
      onKeyDown={handleKeyDown}
      onClick={event => { if (event.target === event.currentTarget) onCloseRef.current?.(); }}
    >
      <div className={`modal-content ${className}`} style={style}>{children}</div>
    </dialog>,
    document.body,
  );
}
