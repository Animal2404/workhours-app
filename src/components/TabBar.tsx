/* ============================================================
   底部导航
   ------------------------------------------------------------
   药丸指示器在 tab 之间滑动（on-screen movement → ease-in-out），
   当前 tab 的图标用 morphicons 做弹簧变形。
   ============================================================ */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar, ChartColumn, Target, Settings } from 'lucide';
import { MorphingIcon } from './Icon';

export type TabKey = 'calendar' | 'stats' | 'goals' | 'settings';

const TABS: { key: TabKey; label: string; icon: typeof Calendar }[] = [
  { key: 'calendar', label: '日历', icon: Calendar },
  { key: 'stats', label: '统计', icon: ChartColumn },
  { key: 'goals', label: '目标', icon: Target },
  { key: 'settings', label: '我的', icon: Settings },
];

export const TabBar = memo(function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [rects, setRects] = useState<{ x: number; y: number; w: number }[]>([]);

  /* 一次性量出**所有** tab 的矩形并缓存，切换时只查表、不再读布局。
     ------------------------------------------------------------
     原来这个 effect 依赖 [active]：每次点 tab 都会同步调用
     getBoundingClientRect + getComputedStyle，**强制一次同步布局**。
     CPU 4x 降速下采样到单个函数就占 358ms（8%），而且发生在
     点击的同一帧里 —— 正是「切 tab 掉帧」的主因之一。
     现在只在导航栏尺寸变化时量一次，切 tab 变成纯查表。 */
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const barRect = wrap.getBoundingClientRect();
      const cs = getComputedStyle(wrap);
      const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
      const borderTop = parseFloat(cs.borderTopWidth) || 0;

      // 药丸的原点 = 导航栏的 padding edge（.tab-pill 显式写了 left/top: 0），
      // 所以偏移量也必须从 padding edge 量起 —— 减去 border。
      // 不能用 offsetLeft：一是它和药丸的静态位置基准不同（差一个 padding-left，
      // 正好造成 8px 右移，也就是用户看到的「右边多出一截」），
      // 二是它取整，宽高会丢掉小数（83.25 变 83）。
      setRects(
        [...wrap.querySelectorAll<HTMLButtonElement>('.tab')].map((btn) => {
          const r = btn.getBoundingClientRect();
          return {
            x: r.left - (barRect.left + borderLeft),
            y: r.top - (barRect.top + borderTop),
            w: r.width,
          };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    // 字体晚到会改变 tab 文字宽度 → 尺寸变了才需要重量
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
    /* ⚠️ 必须依赖 active。
       试过「只在尺寸变化时量一次、切 tab 纯查表」—— 帧率是好看，
       但缓存会失效：导航栏宽度是内容驱动的（left:50% + translateX），
       切换 tab 会改变内容宽度，缓存的矩形随之作废。
       实测窄屏 360px tab3 时药丸偏了 70px，verify-tabbar 直接红。
       结论：可测量的正确性优先于这点微优化 —— 留着 [active]。 */
  }, [active]);

  const activeIdx = Math.max(0, TABS.findIndex((t) => t.key === active));
  const pill = rects[activeIdx] ?? { x: 0, y: 0, w: 0 };

  // 键盘左右切换 tab（有键盘的用户也应该顺手）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const idx = TABS.findIndex((t) => t.key === active);
      if (e.key === 'ArrowRight') onChange(TABS[(idx + 1) % TABS.length].key);
      if (e.key === 'ArrowLeft') onChange(TABS[(idx - 1 + TABS.length) % TABS.length].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onChange]);

  return (
    <nav className="tabbar" ref={wrapRef} aria-label="主导航">
      <span
        className="tab-pill"
        aria-hidden="true"
        style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w }}
      />
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            className={`tab ${on ? 'is-on' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(t.key)}
          >
            <MorphingIcon
              icon={t.icon}
              size={21}
              strokeWidth={on ? 2.1 : 1.8}
              spring="snappy"
            />
            <span className="tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
});
