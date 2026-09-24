/* ============================================================
   日历页
   ------------------------------------------------------------
   主界面：本月赚了多少 + 月历 + 选中某天的明细
   点任意一天 → 打开记录抽屉
   ============================================================ */

import { useMemo, useState } from 'react';
import type { AppState, DayEntry } from '../lib/types';
import {
  computeDayPay,
  goalProgress,
  projectMonthIncome,
  summarizeMonth,
  workedDaysInMonth,
} from '../lib/pay';
import {
  dateLabel,
  formatHours,
  formatMoney,
  fromKey,
  monthLabel,
  monthMatrix,
  relativeLabel,
  shiftMonth,
  shortDateLabel,
  todayKey,
  weekdayHeaders,
} from '../lib/date';
import { ChevronLeftIcon, ChevronRightIcon, FlameIcon, MorphingIcon, Plus, X } from '../components/Icon';
import { BlurFade, MagicCard, NumberTicker, ProgressBar } from '../components/magic';
import { EntrySheet } from '../components/EntrySheet';

interface CalendarPageProps {
  state: AppState;
  onSave: (entry: DayEntry) => void;
  onDelete: (date: string) => void;
  onToast: (text: string, tone?: 'info' | 'ok') => void;
}

export function CalendarPage({ state, onSave, onDelete, onToast }: CalendarPageProps) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const [selected, setSelected] = useState<string>(todayKey());
  const [sheetOpen, setSheetOpen] = useState(false);

  const { settings } = state;
  const today = todayKey();

  const summary = useMemo(
    () => summarizeMonth(view.year, view.month0, state),
    [view, state],
  );

  const projection = useMemo(
    () => projectMonthIncome(view.year, view.month0, state, now),
    [view, state],
  );

  const workedDays = useMemo(
    () => workedDaysInMonth(view.year, view.month0, state),
    [view, state],
  );

  const cells = useMemo(
    () => monthMatrix(view.year, view.month0, settings.weekStartsMonday),
    [view, settings.weekStartsMonday],
  );

  const headers = useMemo(
    () => weekdayHeaders(settings.weekStartsMonday),
    [settings.weekStartsMonday],
  );

  const goal = useMemo(
    () => goalProgress(summary, settings.monthlyGoalIncome, view.year, view.month0, now),
    [summary, settings.monthlyGoalIncome, view, now],
  );

  const selectedPay = useMemo(() => {
    const entry = state.entries[selected];
    if (!entry) return null;
    return computeDayPay(entry, settings);
  }, [selected, state, settings]);

  const streak = useMemo(() => {
    // 简单连击：本月有记录的天数
    return workedDays;
  }, [workedDays]);

  const goMonth = (delta: number) => {
    setView((v) => shiftMonth(v.year, v.month0, delta));
  };

  const openDay = (key: string) => {
    setSelected(key);
    setSheetOpen(true);
  };

  const handleSave = (entry: DayEntry) => {
    onSave(entry);
    const pay = computeDayPay(entry, settings);
    onToast(`已记 ${formatHours(pay.totalHours)} 小时 · ${settings.currency}${formatMoney(pay.net)}`, 'ok');
  };

  const isCurrentMonth = view.year === now.getFullYear() && view.month0 === now.getMonth();

  return (
    <div className="page page-enter" key={`${view.year}-${view.month0}`}>
      {/* ---------------- 顶部 ---------------- */}
      <header className="topbar">
        <div>
          <h1 className="topbar-title">工时记</h1>
          <p className="topbar-sub">
            {monthLabel(view.year, view.month0)}
            {isCurrentMonth ? ' · 进行中' : ''}
          </p>
        </div>
        <div className="topbar-actions">
          {streak > 0 ? (
            <span
              className="chip is-on"
              style={{ height: 34, pointerEvents: 'none' }}
              title="本月已记录天数"
            >
              <FlameIcon size={14} />
              <span className="num">{streak}天</span>
            </span>
          ) : null}
        </div>
      </header>

      {/* ---------------- 本月工资 ---------------- */}
      <BlurFade>
        <MagicCard className="hero-card" as="section">
          <p className="hero-label">本月已赚</p>
          <div className="hero-value num">
            <span className="cur">{settings.currency}</span>
            <NumberTicker
              value={summary.net}
              format={(n) => formatMoney(n, n % 1 < 0.005 ? 0 : 2)}
            />
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <span className="hero-meta-k">总工时</span>
              <span className="hero-meta-v">{formatHours(summary.totalHours)}h</span>
            </div>
            <div className="hero-meta-item">
              <span className="hero-meta-k">出勤</span>
              <span className="hero-meta-v">{summary.days}天</span>
            </div>
            {summary.overtimeHours > 0 ? (
              <div className="hero-meta-item">
                <span className="hero-meta-k">加班</span>
                <span className="hero-meta-v">{formatHours(summary.overtimeHours)}h</span>
              </div>
            ) : null}
            {projection ? (
              <div className="hero-meta-item">
                <span className="hero-meta-k">预计月底</span>
                <span className="hero-meta-v">
                  {settings.currency}
                  {formatMoney(projection.projected, 0)}
                </span>
              </div>
            ) : null}
          </div>
        </MagicCard>
      </BlurFade>

      {/* ---------------- 目标进度 ---------------- */}
      {goal.goal > 0 ? (
        <BlurFade delay={40}>
          <section className="card">
            <div className="card-title">
              <span>月度目标</span>
              <span className="muted">
                {formatMoney(goal.earned, 0)} / {formatMoney(goal.goal, 0)}
              </span>
            </div>
            <ProgressBar pct={goal.pct} tone={goal.pct >= 100 ? 'money' : 'brand'} />
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="tiny muted">
                {goal.pct >= 100
                  ? '🎉 目标达成，厉害'
                  : `还差 ${settings.currency}${formatMoney(goal.remaining, 0)}`}
              </span>
              <span className="tiny" style={{ color: 'var(--brand)', fontWeight: 650 }}>
                {goal.pct >= 100
                  ? '100%'
                  : goal.daysLeft > 0
                    ? `剩 ${goal.daysLeft} 天 · 日需 ${settings.currency}${formatMoney(goal.perDayNeeded, 0)}`
                    : '本月已结束'}
              </span>
            </div>
          </section>
        </BlurFade>
      ) : null}

      {/* ---------------- 日历 ---------------- */}
      <BlurFade delay={60}>
        <section className="card">
          <div className="cal-head">
            <div className="cal-month">
              {monthLabel(view.year, view.month0)}
              <em>共 {formatHours(summary.totalHours)}h</em>
            </div>
            <div className="cal-nav">
              <button
                type="button"
                className="icon-btn"
                aria-label="上一个月"
                onClick={() => goMonth(-1)}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="下一个月"
                onClick={() => goMonth(1)}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
          </div>

          <div className="cal-weekdays" role="row">
            {headers.map((h) => (
              <div
                key={h.idx}
                className={`cal-weekday ${h.idx === 0 || h.idx === 6 ? 'is-weekend' : ''}`}
              >
                {h.label}
              </div>
            ))}
          </div>

          <div className="cal-grid" role="grid">
            {cells.map((key, i) => {
              if (!key) return <div key={`b${i}`} className="day is-blank" aria-hidden="true" />;
              const entry = state.entries[key];
              const pay = entry ? computeDayPay(entry, settings) : null;
              const dayNum = fromKey(key).getDate();
              const hasHours = !!pay && pay.totalHours > 0;
              const isFull =
                hasHours &&
                settings.dailyGoalHours > 0 &&
                pay!.totalHours >= settings.dailyGoalHours;
              const hasExtra = !!pay && (pay.allowance > 0 || pay.deduction > 0);
              const classes = [
                'day',
                hasHours ? 'has-hours' : '',
                isFull ? 'is-full' : '',
                key === today ? 'is-today' : '',
                key === selected ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  onClick={() => openDay(key)}
                  aria-label={`${dateLabel(key)}${hasHours ? `，${formatHours(pay!.totalHours)}小时，${formatMoney(pay!.net)}元` : '，无记录'}`}
                  aria-current={key === today ? 'date' : undefined}
                >
                  <span className="day-num">{dayNum}</span>
                  {hasHours ? (
                    <span className="day-money">
                      {Math.round(pay!.net) >= 1000
                        ? `${(pay!.net / 1000).toFixed(1)}k`
                        : Math.round(pay!.net)}
                    </span>
                  ) : null}
                  {hasExtra ? <span className="day-dot" /> : null}
                </button>
              );
            })}
          </div>

          <div className="day-legend">
            <span>
              <i className="legend-full" />
              达标 {settings.dailyGoalHours}h
            </span>
            <span>
              <i className="legend-part" />
              有记录
            </span>
            <span>
              <i className="legend-today" />
              今天
            </span>
          </div>
        </section>
      </BlurFade>

      {/* ---------------- 选中日期的明细 ---------------- */}
      <BlurFade delay={80}>
        <section className="card">
          <div className="day-detail-head">
            <div>
              <p className="day-detail-date">
                {dateLabel(selected)}
                {relativeLabel(selected) ? ` · ${relativeLabel(selected)}` : ''}
              </p>
              <p className="day-detail-week">
                {selectedPay && selectedPay.totalHours > 0
                  ? `${formatHours(selectedPay.totalHours)} 小时${
                      selectedPay.overtimeHours > 0
                        ? `（含加班 ${formatHours(selectedPay.overtimeHours)}h）`
                        : ''
                    }`
                  : '这天还没有记录'}
              </p>
            </div>
            {selectedPay ? (
              <div className="day-detail-money">
                {settings.currency}
                {formatMoney(selectedPay.net)}
              </div>
            ) : null}
          </div>

          {selectedPay ? (
            <>
              <div className="breakdown">
                <div className="breakdown-row">
                  <span className="k">
                    正常 {formatHours(selectedPay.normalHours)}h ×{' '}
                    {formatMoney(selectedPay.rate)}
                  </span>
                  <span className="v">{formatMoney(selectedPay.basePay)}</span>
                </div>
                {selectedPay.overtimeHours > 0 ? (
                  <div className="breakdown-row">
                    <span className="k">
                      加班 {formatHours(selectedPay.overtimeHours)}h ×{' '}
                      {settings.overtimeMultiplier}
                    </span>
                    <span className="v">{formatMoney(selectedPay.overtimePay)}</span>
                  </div>
                ) : null}
                {selectedPay.allowance > 0 ? (
                  <div className="breakdown-row">
                    <span className="k">补贴</span>
                    <span className="v">+{formatMoney(selectedPay.allowance)}</span>
                  </div>
                ) : null}
                {selectedPay.deduction > 0 ? (
                  <div className="breakdown-row">
                    <span className="k">扣款</span>
                    <span className="v is-minus">−{formatMoney(selectedPay.deduction)}</span>
                  </div>
                ) : null}
                <div className="breakdown-row is-total">
                  <span className="k">实得</span>
                  <span className="v">
                    {settings.currency}
                    {formatMoney(selectedPay.net)}
                  </span>
                </div>
              </div>

              {state.entries[selected]?.note ? (
                <p className="day-note">{state.entries[selected]!.note}</p>
              ) : null}
            </>
          ) : null}

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSheetOpen(true)}
            >
              <MorphingIcon
                icon={sheetOpen ? X : Plus}
                size={18}
                strokeWidth={2.3}
                reducedMotion="never"
              />
              {selectedPay && selectedPay.totalHours > 0 ? '修改这天' : '记这天的工时'}
            </button>
          </div>
        </section>
      </BlurFade>

      {/* ---------------- 快速入口：回到今天 ---------------- */}
      {view.year !== now.getFullYear() || view.month0 !== now.getMonth() || selected !== today ? (
        <button
          type="button"
          className="chip is-on"
          style={{ alignSelf: 'center', height: 40 }}
          onClick={() => {
            setView({ year: now.getFullYear(), month0: now.getMonth() });
            setSelected(today);
          }}
        >
          回到今天 · {shortDateLabel(today)}
        </button>
      ) : null}

      <EntrySheet
        open={sheetOpen}
        date={selected}
        state={state}
        onSave={handleSave}
        onDelete={(d) => {
          onDelete(d);
          onToast('已删除这天的记录');
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
