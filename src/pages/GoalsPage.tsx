/* ============================================================
   目标页
   ------------------------------------------------------------
   月度工资目标 + 每日工时目标 + 一点成就感
   ============================================================ */

import { useMemo } from 'react';
import type { AppState } from '../lib/types';
import { summarizeMonth, computeDayPay, currentStreak } from '../lib/pay';
import { formatHours, formatMoney, monthKeys, monthLabel, toKey } from '../lib/date';
import { CheckIcon, TrendIcon } from '../components/Icon';
import { Target } from 'lucide';
import { AnimatedCircularProgressBar, BlurFade, LAZY_CARD, NumberTicker, ProgressBar } from '../components/magic';
import { Empty } from '../components/ui';

export function GoalsPage({
  state,
  onGoSettings,
}: {
  state: AppState;
  onGoSettings: () => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const { settings } = state;

  const summary = useMemo(() => summarizeMonth(year, month0, state), [year, month0, state]);
  const streak = useMemo(() => currentStreak(state, now), [state, now]);

  const goal = settings.monthlyGoalIncome;
  const pct = goal > 0 ? Math.min(100, (summary.net / goal) * 100) : 0;
  const remaining = Math.max(0, goal - summary.net);

  // 本月剩余天数
  const daysInMonth = monthKeys(year, month0).length;
  const daysLeft = Math.max(0, daysInMonth - now.getDate());
  const perDayNeeded = daysLeft > 0 ? remaining / daysLeft : remaining;

  // 每日工时目标达成情况（近 14 天）
  const recent = useMemo(() => {
    const out: { key: string; hours: number; hit: boolean; future: boolean }[] = [];
    const todayKeyStr = toKey(now);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = toKey(d);
      const entry = state.entries[key];
      const hours = entry ? computeDayPay(entry, settings).totalHours : 0;
      out.push({
        key,
        hours,
        hit: hours >= (settings.dailyGoalHours || 8),
        future: key > todayKeyStr,
      });
    }
    return out;
  }, [state, settings.dailyGoalHours, now]);

  const hitDays = recent.filter((r) => r.hit).length;

  const bestDay = useMemo(() => {
    let best: { key: string; net: number } | null = null;
    for (const key of monthKeys(year, month0)) {
      const entry = state.entries[key];
      if (!entry) continue;
      const net = computeDayPay(entry, settings).net;
      if (!best || net > best.net) best = { key, net };
    }
    return best;
  }, [year, month0, state, settings]);

  if (goal <= 0 && !settings.dailyGoalHours) {
    return (
      <div className="page page-enter">
        <header className="topbar">
          <div>
            <h1 className="topbar-title">目标</h1>
            <p className="topbar-sub">{monthLabel(year, month0)}</p>
          </div>
        </header>
        <section className="card">
          <Empty
            icon={Target}
            title="还没有设定目标"
            text="定个小目标，App 会帮你算每天需要赚多少、还差几天达成。"
            action={
              <button type="button" className="btn btn-soft btn-sm" onClick={onGoSettings}>
                去设置目标
              </button>
            }
          />
        </section>
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <header className="topbar">
        <div>
          <h1 className="topbar-title">目标</h1>
          <p className="topbar-sub">{monthLabel(year, month0)}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onGoSettings}>
          调整
        </button>
      </header>

      {/* 月度工资目标 */}
      {goal > 0 ? (
        <BlurFade style={LAZY_CARD}>
          <section className="card">
            <div className="card-title">
              <span>本月工资目标</span>
              <span className="muted">
                {settings.currency}
                {formatMoney(goal, 0)}
              </span>
            </div>
            <div className="ring-wrap">
              <AnimatedCircularProgressBar
                value={pct}
                size={140}
                label={pct >= 100 ? '已达成' : '进行中'}
              />
              <div className="ring-info">
                <div className="ring-stat">
                  <span className="k">已赚</span>
                  <span className="v" style={{ color: 'var(--money)' }}>
                    {settings.currency}
                    <NumberTicker value={summary.net} format={(n) => formatMoney(n, 0)} />
                  </span>
                </div>
                <div className="ring-stat">
                  <span className="k">{pct >= 100 ? '超额完成' : '还差'}</span>
                  <span className="v">
                    {settings.currency}
                    {formatMoney(pct >= 100 ? summary.net - goal : remaining, 0)}
                  </span>
                </div>
                {pct < 100 && daysLeft > 0 ? (
                  <div className="ring-stat">
                    <span className="k">剩 {daysLeft} 天，每天需赚</span>
                    <span className="v" style={{ color: 'var(--brand)' }}>
                      {settings.currency}
                      {formatMoney(perDayNeeded, 0)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </BlurFade>
      ) : null}

      {/* 每日工时目标 */}
      {settings.dailyGoalHours > 0 ? (
        <BlurFade delay={40} style={LAZY_CARD}>
          <section className="card">
            <div className="card-title">
              <span>每日工时目标</span>
              <span className="muted">近 14 天达成 {hitDays} 天</span>
            </div>
            <ProgressBar pct={(hitDays / 14) * 100} tone="money" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(14, 1fr)',
                gap: 4,
                marginTop: 14,
              }}
              role="img"
              aria-label="近 14 天每日工时目标达成情况"
            >
              {recent.map((r) => (
                <div
                  key={r.key}
                  title={`${r.key} ${formatHours(r.hours)}小时`}
                  style={{
                    height: 34,
                    borderRadius: 8,
                    border: r.future ? '1.5px dashed var(--line-strong)' : 'none',
                    background: r.hit
                      ? 'linear-gradient(140deg, var(--money), #34d399)'
                      : r.hours > 0
                        ? 'var(--brand-soft)'
                        : 'var(--surface-sunken)',
                  }}
                />
              ))}
            </div>
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="tiny muted">14 天前</span>
              <span className="tiny muted">今天</span>
            </div>
          </section>
        </BlurFade>
      ) : null}

      {/* 成就感 */}
      <BlurFade delay={60} style={LAZY_CARD}>
        <section className="card">
          <div className="card-title">
            <span>这个月</span>
          </div>
          <div className="stat-grid">
            <div className="stat-tile">
              <span className="stat-k">
                <CheckIcon size={12} /> 连续记录
              </span>
              <span className="stat-v">
                {streak}
                <small>天</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">
                <TrendIcon size={12} /> 出勤
              </span>
              <span className="stat-v">
                {summary.days}
                <small>天</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">总工时</span>
              <span className="stat-v">
                {formatHours(summary.totalHours)}
                <small>h</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">最好的一天</span>
              <span className="stat-v is-money" style={{ fontSize: 20 }}>
                {bestDay ? formatMoney(bestDay.net, 0) : '—'}
              </span>
            </div>
          </div>
          {bestDay ? (
            <p className="tiny muted" style={{ marginTop: 12 }}>
              最高收入那天是 {bestDay.key.slice(5).replace('-', '月')}日，赚了{' '}
              {settings.currency}
              {formatMoney(bestDay.net)}。
            </p>
          ) : null}
        </section>
      </BlurFade>
    </div>
  );
}
