/* ============================================================
   底部导航
   ------------------------------------------------------------
   药丸指示器在 tab 之间滑动（on-screen movement → ease-in-out），
   当前 tab 的图标用 morphicons 做弹簧变形。
   ============================================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar, ChartColumn, Target, Settings } from 'lucide';
import { MorphingIcon } from './Icon';

export type TabKey = 'calendar' | 'stats' | 'goals' | 'settings';

const TABS: { key: TabKey; label: string; icon: typeof Calendar }[] = [
  { key: 'calendar', label: '日历', icon: Calendar },
  { key: 'stats', label: '统计', icon: ChartColumn },
  { key: 'goals', label: '目标', icon: Target },
  { key: 'settings', label: '我的', icon: Settings },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });

  // 先量再画，避免指示器从 0 位置「飞」过去
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const idx = TABS.findIndex((t) => t.key === active);
      const btn = wrap.querySelectorAll<HTMLButtonElement>('.tab')[idx];
      if (!btn) return;
      setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [active]);

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
        style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
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
}
