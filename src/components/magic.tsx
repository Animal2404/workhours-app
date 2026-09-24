/* ============================================================
   Magic UI 风格组件（本地实现，无外部依赖）
   NumberTicker / MagicCard / ShineBorder / BlurFade /
   AnimatedCircularProgressBar / Marquee 分隔线
   ============================================================ */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import './magic.css';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------
   NumberTicker：数字滚动
   打断时从「当前显示值」继续，而不是从头开始（避免跳变）
   ------------------------------------------------------------ */
export function NumberTicker({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const shownRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    const to = value;

    if (prefersReducedMotion() || from === to || !Number.isFinite(to)) {
      shownRef.current = to;
      setDisplay(to);
      return;
    }

    const started = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      // ease-out cubic：立刻起步，结尾柔和
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      shownRef.current = next;
      setDisplay(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        shownRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}

/* ------------------------------------------------------------
   MagicCard：跟随手指的高光卡片
   光斑位置写在元素自身（不写父级 CSS 变量，避免全子树重算样式）
   ------------------------------------------------------------ */
export function MagicCard({
  children,
  className = '',
  style,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'button';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const node = ref.current;
      if (!node) return;
      node.style.setProperty('--mx', `${x}px`);
      node.style.setProperty('--my', `${y}px`);
      node.style.setProperty('--glow', '1');
    });
  };

  const onLeave = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--glow', '0');
  };

  return (
    <Tag
      ref={ref as never}
      className={`magic-card ${className}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------
   ShineBorder：绕边跑的光
   ------------------------------------------------------------ */
export function ShineBorder({
  children,
  className = '',
  duration = 8,
  active = true,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
  active?: boolean;
}) {
  return (
    <div className={`shine-wrap ${className}`} data-active={active ? 'true' : 'false'}>
      {active ? (
        <span
          className="shine-ray"
          aria-hidden="true"
          style={{ animationDuration: `${duration}s` }}
        />
      ) : null}
      <div className="shine-content">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------
   BlurFade：入场（模糊 + 上浮）
   ------------------------------------------------------------ */
export function BlurFade({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 16);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`blur-fade ${shown ? 'is-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------
   AnimatedCircularProgressBar：圆环进度
   ------------------------------------------------------------ */
export function AnimatedCircularProgressBar({
  value,
  size = 128,
  strokeWidth = 11,
  children,
  label,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
  label?: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);

  useEffect(() => {
    // 先画空环，再过渡到目标值：进场有「长出来」的感觉
    const id = requestAnimationFrame(() => setOffset(c - (pct / 100) * c));
    return () => cancelAnimationFrame(id);
  }, [pct, c]);

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={`url(#${gradId})`}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">
        {children ?? (
          <>
            <span className="ring-pct num">
              {Math.round(pct)}
              <small>%</small>
            </span>
            {label ? <span className="ring-cap">{label}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   ProgressBar：细长进度条
   ------------------------------------------------------------ */
export function ProgressBar({
  pct,
  tone = 'brand',
  className = '',
}: {
  pct: number;
  tone?: 'brand' | 'money';
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div
      className={`bar-track ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`bar-fill ${tone === 'money' ? 'is-money' : ''}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
