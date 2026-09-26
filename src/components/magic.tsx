/* ============================================================
   Magic UI 风格组件（本地实现，无外部依赖）
   NumberTicker / MagicCard / ShineBorder / BlurFade /
   AnimatedCircularProgressBar / Marquee 分隔线
   ============================================================ */

import {
  useEffect,
  useId,
  useLayoutEffect,
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

/**
 * 长页面里给卡片用的「视口外先不算」样式。
 *
 * content-visibility:auto 让不在视口内的卡片**完全跳过**样式计算、
 * 布局与绘制；手机上一屏只有 ~850px，而统计/目标/设置页都接近 2500px，
 * 也就是 2/3 的卡片本来就在屏幕外，却要陪着一起算一遍。
 *
 * contain-intrinsic-size 用的是 `auto <占位高度>`：
 * 第一次渲染前按占位高度估算卷动高度，渲染过一次之后就记住真实高度，
 * 所以只有「首次滚过」那一下可能有一次尺寸修正。
 * 占位值取的是各页卡片的中位高度（量过）。
 */
export const LAZY_CARD: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 220px',
};

/* ------------------------------------------------------------
   NumberTicker：数字滚动
   打断时从「当前显示值」继续，而不是从头开始（避免跳变）

   性能：滚动过程只写 DOM 文本，不逐帧 setState。
   900ms 的滚动原本要 50+ 次 render/commit；在统计页/记录抽屉里
   这些 commit 会和柱状图、抽屉弹簧抢同一帧。
   文本节点始终只有一个，React 在 render 边界照常接管，
   所以和原来的呈现完全一致。
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
  const elRef = useRef<HTMLSpanElement | null>(null);
  /** 当前真正显示在屏幕上的值（打断时从这里接续） */
  const shownRef = useRef(value);
  const rafRef = useRef(0);
  /** 动画帧里要用最新的 format，但不能让它进 effect 依赖（否则每次父级重渲都重启动画） */
  const fmtRef = useRef(format);
  fmtRef.current = format;

  useLayoutEffect(() => {
    const el = elRef.current;
    const from = shownRef.current;
    const to = value;

    if (!el) {
      shownRef.current = to;
      return;
    }

    if (prefersReducedMotion() || from === to || !Number.isFinite(to)) {
      shownRef.current = to;
      el.textContent = fmtRef.current(to);
      return;
    }

    // 先接回「打断点」再起跑：React 刚把文本刷成新 value，
    // 这里在 paint 前纠正，避免闪一帧跳变
    el.textContent = fmtRef.current(from);

    const started = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      // ease-out cubic：立刻起步，结尾柔和
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      shownRef.current = next;
      const node = elRef.current;
      if (node) node.textContent = fmtRef.current(p < 1 ? next : to);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else shownRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span ref={elRef} className={className}>
      {format(value)}
    </span>
  );
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

   性能：进场只切一次 class，不走 setState。
   原来 setTimeout(16) → setShown(true) 会把整个卡片子树再 render 一遍；
   统计页 6 张卡就是 6 次白付的全量子树 reconcile。
   class 加上去的时机与原来完全一致，呈现不变。

   另可选 contentVisibility：长页面里不在视口内的卡片
   完全不参与样式计算与布局（见各页面调用处的说明）。
   ------------------------------------------------------------ */
export function BlurFade({
  children,
  delay = 0,
  className = '',
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.classList.add('is-in');
      return;
    }
    const t = window.setTimeout(() => el.classList.add('is-in'), 16);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      ref={ref}
      className={`blur-fade ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
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
