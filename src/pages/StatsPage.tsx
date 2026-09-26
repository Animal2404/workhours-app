/* ============================================================
   统计页
   ------------------------------------------------------------
   月度：关键指标 + 每天工时柱状图 + 达标环 + 加班/补扣
   年度：12 个月趋势 + 全年汇总
   ============================================================ */

import { useMemo, useState } from 'react';
import type { AppState } from '../lib/types';
import {
  computeDayPay,
  monthlyTotals,
  summarizeMonth,
  summarizeYear,
} from '../lib/pay';
import {
  formatHours,
  formatMoney,
  monthKeys,
  monthLabel,
  shiftMonth,
} from '../lib/date';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icon';
import {
  AnimatedCircularProgressBar,
  BlurFade,
  LAZY_CARD,
  NumberTicker,
  ProgressBar,
} from '../components/magic';

type Mode = 'month' | 'year';

export function StatsPage({ state }: { state: AppState }) {
  const now = new Date();
  const [mode, setMode] = useState<Mode>('month');
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() });

  const { settings } = state;

  const monthSummary = useMemo(
    () => summarizeMonth(view.year, view.month0, state),
    [view, state],
  );
  const yearSummary = useMemo(() => summarizeYear(view.year, state), [view.year, state]);
  const months = useMemo(() => monthlyTotals(view.year, state), [view.year, state]);

  const monthBars = useMemo(() => {
    const keys = monthKeys(view.year, view.month0);
    return keys.map((key) => {
      const entry = state.entries[key];
      const pay = entry ? computeDayPay(entry, settings) : null;
      return {
        key,
        day: Number(key.slice(-2)),
        hours: pay?.totalHours ?? 0,
        net: pay?.net ?? 0,
        isOvertime: (pay?.overtimeHours ?? 0) > 0,
      };
    });
  }, [view, state, settings]);

  const maxDayHours = Math.max(settings.dailyGoalHours || 8, ...monthBars.map((b) => b.hours), 1);
  const maxMonthNet = Math.max(...months.map((m) => m.net), 1);

  const summary = mode === 'month' ? monthSummary : yearSummary;

  const goalPct =
    settings.monthlyGoalIncome > 0
      ? Math.min(100, (monthSummary.net / settings.monthlyGoalIncome) * 100)
      : 0;

  const targetDaysPct =
    monthBars.length > 0
      ? (monthBars.filter((b) => b.hours >= (settings.dailyGoalHours || 8)).length /
          monthBars.length) *
        100
      : 0;

  const shift = (delta: number) => {
    if (mode === 'month') setView((v) => shiftMonth(v.year, v.month0, delta));
    else setView((v) => ({ ...v, year: v.year + delta }));
  };

  return (
    <div className="page page-enter">
      <header className="topbar">
        <div>
          <h1 className="topbar-title">统计</h1>
          <p className="topbar-sub">
            {mode === 'month' ? monthLabel(view.year, view.month0) : `${view.year}年`}
          </p>
        </div>
        <div className="mini-seg" role="tablist" aria-label="统计范围">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'month'}
            className={mode === 'month' ? 'is-on' : ''}
            onClick={() => setMode('month')}
          >
            月
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'year'}
            className={mode === 'year' ? 'is-on' : ''}
            onClick={() => setMode('year')}
          >
            年
          </button>
        </div>
      </header>

      {/* 时间切换 */}
      <div className="row-between">
        <button type="button" className="icon-btn" aria-label="上一个" onClick={() => shift(-1)}>
          <ChevronLeftIcon size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 620 }}>
          {mode === 'month' ? monthLabel(view.year, view.month0) : `${view.year}年`}
        </span>
        <button type="button" className="icon-btn" aria-label="下一个" onClick={() => shift(1)}>
          <ChevronRightIcon size={18} />
        </button>
      </div>

      {/* 总额 */}
      <BlurFade style={LAZY_CARD}>
        <section className="card">
          <div className="card-title">
            <span>实得合计</span>
            <span className="muted">{summary.days} 天出勤</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              color: 'var(--money)',
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 600 }}>{settings.currency}</span>
            <span
              className="num"
              style={{ fontSize: 40, fontWeight: 720, letterSpacing: '-0.035em' }}
            >
              <NumberTicker value={summary.net} format={(n) => formatMoney(n, 0)} />
            </span>
          </div>
          <div className="stat-grid" style={{ marginTop: 18 }}>
            <div className="stat-tile">
              <span className="stat-k">总工时</span>
              <span className="stat-v">
                {formatHours(summary.totalHours)}
                <small>h</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">日均工时</span>
              <span className="stat-v">
                {formatHours(summary.avgHoursPerDay)}
                <small>h</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">等效时薪</span>
              <span className="stat-v is-money">
                {formatMoney(summary.avgPayPerHour)}
                <small>元/h</small>
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-k">加班时长</span>
              <span className="stat-v" style={{ color: 'var(--warn)' }}>
                {formatHours(summary.overtimeHours)}
                <small>h</small>
              </span>
            </div>
          </div>
        </section>
      </BlurFade>

      {/* 月度：每日柱状图 */}
      {mode === 'month' ? (
        <BlurFade delay={40} style={LAZY_CARD}>
          <section className="card">
            <div className="card-title">
              <span>每天工时</span>
              <span className="muted">目标 {settings.dailyGoalHours}h</span>
            </div>
            <div className="chart" role="img" aria-label="本月每天工时柱状图">
              {monthBars.map((b) => (
                <div
                  key={b.key}
                  className="chart-col"
                  title={`${b.day}日 ${formatHours(b.hours)}小时`}
                >
                  <div className="chart-bar-wrap">
                    <div
                      className={`chart-bar ${b.hours === 0 ? 'is-empty' : ''} ${
                        b.hours > 0 && b.hours < (settings.dailyGoalHours || 8)
                          ? 'is-dim'
                          : ''
                      }`}
                      style={{ height: `${Math.max(2, (b.hours / maxDayHours) * 100)}%` }}
                    />
                  </div>
                  <span className="chart-label">{b.day % 5 === 0 || b.day === 1 ? b.day : ''}</span>
                </div>
              ))}
            </div>
          </section>
        </BlurFade>
      ) : (
        <BlurFade delay={40} style={LAZY_CARD}>
          <section className="card">
            <div className="card-title">
              <span>每月收入</span>
              <span className="muted">{view.year}年</span>
            </div>
            <div className="chart" role="img" aria-label="全年每月收入柱状图">
              {months.map((m) => (
                <div
                  key={m.month0}
                  className="chart-col"
                  title={`${m.month0 + 1}月 ${formatMoney(m.net, 0)}元`}
                >
                  <div className="chart-bar-wrap">
                    <div
                      className={`chart-bar ${m.net === 0 ? 'is-empty' : ''}`}
                      style={{ height: `${Math.max(2, (m.net / maxMonthNet) * 100)}%` }}
                    />
                  </div>
                  <span className="chart-label">{m.month0 + 1}</span>
                </div>
              ))}
            </div>
          </section>
        </BlurFade>
      )}

      {/* 达成率 */}
      {mode === 'month' ? (
        <>
          <BlurFade delay={60} style={LAZY_CARD}>
            <section className="card">
              <div className="card-title">
                <span>工资目标</span>
                {settings.monthlyGoalIncome > 0 ? (
                  <span className="muted">
                    {formatMoney(monthSummary.net, 0)} / {formatMoney(settings.monthlyGoalIncome, 0)}
                  </span>
                ) : (
                  <span className="muted">未设置</span>
                )}
              </div>
              {settings.monthlyGoalIncome > 0 ? (
                <div className="ring-wrap">
                  <AnimatedCircularProgressBar value={goalPct} label="已达成" />
                  <div className="ring-info">
                    <div className="ring-stat">
                      <span className="k">还差</span>
                      <span className="v">
                        {settings.currency}
                        {formatMoney(Math.max(0, settings.monthlyGoalIncome - monthSummary.net), 0)}
                      </span>
                    </div>
                    <div className="ring-stat">
                      <span className="k">本月日薪</span>
                      <span className="v">
                        {settings.currency}
                        {formatMoney(monthSummary.days > 0 ? monthSummary.net / monthSummary.days : 0, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="tiny muted">
                  到「我的」里设置一个月度工资目标，这里会显示达成进度。
                </p>
              )}
            </section>
          </BlurFade>

          <BlurFade delay={80} style={LAZY_CARD}>
            <section className="card">
              <div className="card-title">
                <span>每日达标率</span>
                <span className="muted">
                  {monthBars.filter((b) => b.hours >= (settings.dailyGoalHours || 8)).length}/
                  {monthBars.length} 天
                </span>
              </div>
              <ProgressBar pct={targetDaysPct} tone="money" />
              <div className="row-between" style={{ marginTop: 10 }}>
                <span className="tiny muted">达标 {Math.round(targetDaysPct)}%</span>
                <span className="tiny muted">
                  标准 {settings.dailyGoalHours} 小时/天
                </span>
              </div>
            </section>
          </BlurFade>
        </>
      ) : null}

      {/* 收入构成 */}
      <BlurFade delay={100} style={LAZY_CARD}>
        <section className="card">
          <div className="card-title">
            <span>钱从哪来</span>
          </div>
          <div className="breakdown">
            <div className="breakdown-row">
              <span className="k">正常工时</span>
              <span className="v">{formatMoney(summary.basePay)}</span>
            </div>
            <div className="breakdown-row">
              <span className="k">加班工资</span>
              <span className="v" style={{ color: summary.overtimePay > 0 ? 'var(--warn)' : undefined }}>
                {formatMoney(summary.overtimePay)}
              </span>
            </div>
            <div className="breakdown-row">
              <span className="k">补贴</span>
              <span className="v">+{formatMoney(summary.allowance)}</span>
            </div>
            <div className="breakdown-row">
              <span className="k">扣款</span>
              <span className="v is-minus">−{formatMoney(summary.deduction)}</span>
            </div>
            <div className="breakdown-row is-total">
              <span className="k">实得</span>
              <span className="v">
                {settings.currency}
                {formatMoney(summary.net)}
              </span>
            </div>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}
