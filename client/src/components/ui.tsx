import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type { ToastMessage } from '../types';
import { PALETTE, paletteFor } from '../lib/colors';

/* ------------------------------- Logo ------------------------------- */

export function Logo({ size = 46, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.33, fontSize: size * 0.43 }}>
        R&amp;
      </div>
      {!compact && (
        <div>
          <div className="brand-name">RG&amp;SA PLANTÃO</div>
          <div className="brand-sub">Escala integrada</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Avatar ------------------------------- */

export function Avatar({
  name,
  color,
  char,
  size = 'md',
  title,
}: {
  name: string;
  color?: string | null;
  char?: string | null;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const palette = paletteFor(color);
  const label = char || name.slice(0, 1).toUpperCase();
  const className = `avatar${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}`;
  return (
    <span
      className={className}
      style={{ background: `linear-gradient(140deg, ${palette.from}, ${palette.to})` }}
      title={title || name}
      aria-label={name}
    >
      {label}
    </span>
  );
}

/* ------------------------------- Fields ------------------------------- */

export function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="row wrap gap-8" role="radiogroup" aria-label="Cor do plantonista">
      {PALETTE.map((p) => (
        <button
          key={p.token}
          type="button"
          role="radio"
          aria-checked={value === p.token}
          aria-label={p.label}
          title={p.label}
          onClick={() => onChange(p.token)}
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            border: value === p.token ? '2px solid var(--ink)' : '2px solid transparent',
            background: `linear-gradient(140deg, ${p.from}, ${p.to})`,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            boxShadow: value === p.token ? '0 0 0 3px var(--brand-soft)' : 'none',
          }}
        >
          {value === p.token && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- Empty ------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h4>{title}</h4>
      {description && <p className="small" style={{ maxWidth: 320 }}>{description}</p>}
      {action}
    </div>
  );
}

/* ------------------------------- Toasts ------------------------------- */

interface ToastContextValue {
  toast: (tone: ToastMessage['tone'], title: string, description?: string) => void;
}
const ToastContext = createContext<ToastContextValue | null>(null);

const toastIcons = {
  success: <CheckCircle2 />,
  error: <XCircle />,
  warning: <AlertTriangle />,
  info: <Info />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (tone: ToastMessage['tone'], title: string, description?: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => remove(id), 5600);
    },
    [remove],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                className={`toast ${item.tone}`}
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                layout
              >
                <div className="toast-icon">{toastIcons[item.tone]}</div>
                <div className="grow">
                  <div className="toast-title">{item.title}</div>
                  {item.description && <div className="toast-desc">{item.description}</div>}
                </div>
                <button className="toast-close" onClick={() => remove(item.id)} aria-label="Fechar aviso">
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------- Confirm ------------------------------- */

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  details?: string[];
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ ...options, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  useEffect(() => {
    if (!state) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(false)}
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
          >
            <motion.div
              className="modal"
              style={{ maxWidth: 460 }}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div
                  className="empty-icon"
                  style={{
                    background: state.tone === 'danger' ? 'var(--danger-soft)' : 'var(--brand-soft)',
                    color: state.tone === 'danger' ? 'var(--danger)' : 'var(--brand)',
                  }}
                >
                  {state.tone === 'danger' ? <ShieldAlert size={20} /> : <Info size={20} />}
                </div>
                <div className="grow">
                  <div className="modal-title">{state.title}</div>
                  <div className="modal-sub">{state.message}</div>
                </div>
              </div>
              {state.details && state.details.length > 0 && (
                <div className="alert warning" style={{ marginBottom: 8 }}>
                  <AlertTriangle />
                  <div>
                    <div className="strong" style={{ marginBottom: 4 }}>Regras de escala</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {state.details.map((detail) => (
                        <li key={detail} style={{ marginBottom: 4 }}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                  {state.cancelLabel || 'Cancelar'}
                </button>
                <button
                  type="button"
                  className={`btn ${state.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {state.confirmLabel || 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/* ------------------------------- Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  wide,
  closeLabel = 'Fechar',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className={`modal${wide ? ' wide' : ''}`}
            initial={{ opacity: 0, y: 22, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              {icon && <div className="empty-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>{icon}</div>}
              <div className="grow">
                <div className="modal-title">{title}</div>
                {subtitle && <div className="modal-sub">{subtitle}</div>}
              </div>
              <button className="icon-btn sm" onClick={onClose} aria-label={closeLabel}>
                <X />
              </button>
            </div>
            {children}
            {footer && <div className="modal-actions">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------- Drawer ------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="drawer-head">
              <div className="grow">
                <div className="drawer-handle" />
                <div className="row gap-12">
                  {icon}
                  <div className="grow">
                    <div className="drawer-title">{title}</div>
                    {subtitle && <div className="drawer-sub">{subtitle}</div>}
                  </div>
                  <button className="icon-btn sm" onClick={onClose} aria-label="Fechar painel">
                    <X />
                  </button>
                </div>
              </div>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
