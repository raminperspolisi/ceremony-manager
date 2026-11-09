import { useCallback, useEffect, useRef, useState } from 'react';
import { ToastContext } from './ToastContext';
import './ToastProvider.css';

const TOAST_DURATION = { error: 6000, success: 4000, warning: 4000, info: 4000 };

const ICONS = {
  success: '✓',
  error: '!',
  warning: '⚠',
  info: 'i',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [closingIds, setClosingIds] = useState(() => new Set());
  const [confirmation, setConfirmation] = useState(null);
  const cancelButton = useRef(null);
  const confirmButton = useRef(null);
  const timers = useRef(new Map());
  const resolver = useRef(null);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    setClosingIds((current) => new Set(current).add(id));
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
      setClosingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 170));
  }, []);

  const toast = useCallback((type, message, options = {}) => {
    const id = crypto.randomUUID();
    const entry = { id, type, message, action: options.action };
    setToasts((current) => [...current.slice(-2), entry]);
    timers.current.set(id, window.setTimeout(
      () => dismiss(id),
      TOAST_DURATION[type] || TOAST_DURATION.info,
    ));
    return id;
  }, [dismiss]);

  const confirm = useCallback((message, options = {}) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setConfirmation({
      message,
      title: options.title || 'تأیید عملیات',
      confirmLabel: options.confirmLabel || 'تأیید',
      danger: options.danger ?? true,
    });
  }), []);

  const resolveConfirmation = useCallback((accepted) => {
    resolver.current?.(accepted);
    resolver.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    resolver.current?.(false);
  }, []);

  useEffect(() => {
    const handlePrintToast = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'azho-toast') return;
      toast(event.data.kind || 'info', event.data.message || '');
    };
    window.addEventListener('message', handlePrintToast);
    return () => window.removeEventListener('message', handlePrintToast);
  }, [toast]);

  useEffect(() => {
    if (!confirmation) return undefined;
    confirmButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') resolveConfirmation(false);
      if (event.key === 'Tab') {
        const first = cancelButton.current;
        const last = confirmButton.current;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmation, resolveConfirmation]);

  const contextValue = { toast, confirm };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-region" dir="rtl" aria-label="اعلان‌ها">
        {toasts.map((entry) => (
          <div
            key={entry.id}
            className={`app-toast app-toast--${entry.type}${closingIds.has(entry.id) ? ' is-exiting' : ''}`}
            role={entry.type === 'error' ? 'alert' : 'status'}
            aria-live={entry.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => {
              if (closingIds.has(entry.id)) return;
              const timer = timers.current.get(entry.id);
              if (timer) window.clearTimeout(timer);
              timers.current.delete(entry.id);
            }}
            onMouseLeave={() => {
              if (!timers.current.has(entry.id) && !closingIds.has(entry.id)) {
                timers.current.set(entry.id, window.setTimeout(
                  () => dismiss(entry.id),
                  TOAST_DURATION[entry.type] || TOAST_DURATION.info,
                ));
              }
            }}
          >
            <span className="app-toast-icon" aria-hidden="true">{ICONS[entry.type] || ICONS.info}</span>
            <span className="app-toast-message">{entry.message}</span>
            {entry.action && (
              <button
                type="button"
                className="app-toast-action"
                onClick={() => {
                  entry.action.onClick();
                  dismiss(entry.id);
                }}
              >
                {entry.action.label}
              </button>
            )}
            <button
              type="button"
              className="app-toast-close"
              aria-label="بستن اعلان"
              onClick={() => dismiss(entry.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <div className="app-confirm-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) resolveConfirmation(false);
        }}>
          <section
            className="app-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-message"
            dir="rtl"
          >
            <h2 id="app-confirm-title">{confirmation.title}</h2>
            <p id="app-confirm-message">{confirmation.message}</p>
            <div className="app-confirm-actions">
              <button ref={cancelButton} type="button" className="app-confirm-cancel" onClick={() => resolveConfirmation(false)}>
                انصراف
              </button>
              <button
                type="button"
                ref={confirmButton}
                className={confirmation.danger ? 'app-confirm-danger' : 'app-confirm-primary'}
                onClick={() => resolveConfirmation(true)}
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ToastContext.Provider>
  );
}
