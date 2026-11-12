import { motion, AnimatePresence } from 'motion/react';
import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, useEffect } from 'react';
import { X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) { return parts.filter(Boolean).join(' '); }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sun';
export function Button({ variant = 'primary', size = 'md', full, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; full?: boolean }) {
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-accent-ink shadow-[0_8px_20px_-10px_var(--accent)] hover:brightness-110',
    secondary: 'bg-card-2 text-ink hover:brightness-105',
    ghost: 'bg-transparent text-ink-2 hover:bg-card-2',
    danger: 'bg-danger/12 text-danger hover:bg-danger/20',
    sun: 'bg-sun text-[#1b1200] hover:brightness-105',
  };
  const s = { sm: 'h-9 px-3.5 text-[14px] rounded-xl gap-1.5', md: 'h-12 px-5 text-[16px] rounded-2xl gap-2', lg: 'h-14 px-6 text-[17px] rounded-2xl gap-2' }[size];
  return (
    <button className={cx('pressable inline-flex items-center justify-center font-semibold select-none disabled:opacity-45 disabled:pointer-events-none', v[variant], s, full && 'w-full', className)} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ className, children, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} className={cx('pressable grid h-10 w-10 place-items-center rounded-full bg-card-2 text-ink-2 hover:text-ink disabled:opacity-40', className)} {...rest}>{children}</button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('rounded-2xl bg-card shadow-card ring-1 ring-line', onClick && 'pressable cursor-pointer', className)}>{children}</div>;
}

export function Badge({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tracking-wide', className)}
      style={color ? { background: `color-mix(in oklab, ${color} 16%, transparent)`, color } : undefined}>
      {children}
    </span>
  );
}

export function Input({ className, label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>}
      <input className={cx('h-12 w-full rounded-2xl bg-card-2 px-4 text-[16px] outline-none ring-1 ring-transparent placeholder:text-ink-3 focus:ring-accent/60', className)} {...rest} />
      {hint && <span className="mt-1.5 block text-[12.5px] leading-snug text-ink-3">{hint}</span>}
    </label>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('w-full rounded-2xl bg-card-2 p-4 text-[16px] leading-relaxed outline-none ring-1 ring-transparent placeholder:text-ink-3 focus:ring-accent/60', className)} {...rest} />;
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 py-3 text-left">
      <span>
        <span className="block text-[16px] font-medium">{label}</span>
        {description && <span className="block text-[13px] text-ink-3">{description}</span>}
      </span>
      <span className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-ink-3/40')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 35 }} className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow', checked ? 'left-[22px]' : 'left-[2px]')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-2xl bg-card-2 p-1">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('relative flex-1 rounded-xl px-3 py-2 text-[14px] font-semibold', value === o.value ? 'text-ink' : 'text-ink-3')}>
          {value === o.value && <motion.span layoutId="seg" className="absolute inset-0 rounded-xl bg-card shadow-card ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx('shimmer rounded-xl', className)} />; }

export function Sheet({ open, onClose, children, title, full }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; full?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={cx('fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[640px] flex-col rounded-t-[28px] bg-bg-elev shadow-float', full ? 'top-[max(env(safe-area-inset-top),12px)]' : 'max-h-[88dvh]')}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 42 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
          >
            <div className="flex items-center justify-between px-5 pt-3 pb-1">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-ink-3/40" />
            </div>
            {(title || true) && (
              <div className="flex items-center justify-between px-5 pb-2">
                <h2 className="font-display text-[20px] font-bold tracking-tight">{title}</h2>
                <IconButton label="Close" onClick={onClose} className="h-9 w-9"><X size={18} /></IconButton>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),20px)]">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toast({ toast }: { toast: { id: number; text: string; kind: 'ok' | 'err' } | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
          className={cx('pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] mx-auto w-fit max-w-[90%] rounded-full px-4 py-2.5 text-[14px] font-semibold shadow-float',
            toast.kind === 'ok' ? 'bg-ink text-bg' : 'bg-danger text-white')}>
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-end justify-between px-1">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
