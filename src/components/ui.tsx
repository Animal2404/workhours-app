/* ============================================================
   基础交互组件
   ============================================================ */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, Icon } from './Icon';
import type { IconNode } from 'lucide';

/* ---------------- 开关 ---------------- */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

/* ---------------- 步进器 ---------------- */
export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 24,
  unit,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamped = Math.min(max, Math.max(min, value));

  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  };

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label={`减少${unit ?? ''}`}
        onClick={() => onChange(Math.max(min, Math.round((clamped - step) * 100) / 100))}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 12h14"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <input
        className="stepper-input"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft ?? String(clamped)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (draft !== null) commit(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft !== null) commit(draft);
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      {unit ? <span className="stepper-unit">{unit}</span> : null}
      <button
        type="button"
        className="stepper-btn"
        aria-label={`增加${unit ?? ''}`}
        onClick={() => onChange(Math.min(max, Math.round((clamped + step) * 100) / 100))}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* ---------------- 分段控件（滑动指示块） ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const idx = Math.max(0, options.findIndex((o) => o.value === value));
      const btn = wrap.querySelectorAll<HTMLButtonElement>('.segment-btn')[idx];
      if (!btn) return;
      setThumb({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div className="segment" ref={wrapRef} role="tablist" aria-label={label}>
      <span
        className="segment-thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${thumb.x - 4}px)`, width: thumb.w }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`segment-btn ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- 空状态 ---------------- */
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: IconNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon icon={icon} size={26} />
      </div>
      <p className="empty-title">{title}</p>
      <p className="empty-text">{text}</p>
      {action}
    </div>
  );
}

/* ---------------- 提示条 ---------------- */
export type ToastTone = 'info' | 'ok';
export interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
}

export function ToastHost({
  toasts,
  onExpire,
}: {
  toasts: ToastMsg[];
  onExpire: (id: number) => void;
}) {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onExpire={onExpire} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onExpire }: { toast: ToastMsg; onExpire: (id: number) => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = window.setTimeout(() => {
      setShown(false);
      window.setTimeout(() => onExpire(toast.id), 220);
    }, 2200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [toast.id, onExpire]);

  return (
    <div className={`toast ${shown ? 'is-in' : ''} is-${toast.tone}`} role="status">
      {toast.tone === 'ok' ? <CheckIcon size={16} /> : null}
      <span>{toast.text}</span>
    </div>
  );
}

/** 提示条 + 主题色（供设置页的色块用） */
export function ColorDot({ color }: { color: string }) {
  const id = useId();
  return (
    <span
      key={id}
      style={{
        width: 12,
        height: 12,
        borderRadius: 999,
        background: color,
        display: 'inline-block',
      }}
    />
  );
}
