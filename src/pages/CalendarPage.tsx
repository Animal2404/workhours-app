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
  monthOverMonth,
  projectMonthIncome,
  summarizeAll,
  summarizeMonth,
  workedDaysInMonth,
} from '../lib/pay';
import {
  addDaysKey,
  dateLabel,
  formatHours,
  formatMoney,
  fromKey,
  monthEndKey,
  monthLabel,
  monthMatrix,
  relativeLabel,
  shiftMonth,
  shortDateLabel,
  todayKey,
  weekdayHeaders,
} from '../lib/date';
import { getHoliday, holidayCoverageNote } from '../lib/holidays';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlameIcon,
  ListChecksIcon,
  MorphingIcon,
  Plus,
  X,
} from '../components/Icon';
import { BlurFade, MagicCard, NumberTicker, ProgressBar } from '../components/magic';
import { EntrySheet } from '../components/EntrySheet';
import { BatchSheet } from '../components/BatchSheet';

interface CalendarPageProps {
  state: AppState;
  onSave: (entry: DayEntry) => void;
  /** 批量写入：一次 dispatch 落盘多天 */
  onSaveMany: (entries: DayEntry[]) => void;
  /** 批量清空 */
  onDeleteMany: (dates: string[]) => void;
  onDelete: (date: string) => void;
  onToast: (text: string, tone?: 'info' | 'ok') => void;
  /** 跳去统计页看逐月明细 */
  onGoStats: () => void;
}

export function CalendarPage({
  state,
  onSave,
  onSaveMany,
  onDeleteMany,
  onDelete,
  onToast,
  onGoStats,
}: CalendarPageProps) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const [selected, setSelected] = useState<string>(todayKey());
  const [sheetOpen, setSheetOpen] = useState(false);

  // ---------- 批量记账 ----------
  const [batchMode, setBatchMode] = useState(false);
  const [batchDates, setBatchDates] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  const { settings } = state;
  const today = todayKey();

  const allTime = useMemo(() => summarizeAll(state), [state]);
  const mom = useMemo(
    () => monthOverMonth(view.year, view.month0, state),
    [view, state],
  );

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

  // 该年节假日数据到什么程度（官方年份返回 null，不显示任何提示）
  const coverageNote = useMemo(() => holidayCoverageNote(view.year), [view.year]);

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
    // 批量模式下，点格子 = 勾选/取消，不打开单天抽屉
    if (batchMode) {
      setBatchDates((prev) =>
        prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key].sort(),
      );
      return;
    }
    setSelected(key);
    setSheetOpen(true);
  };

  const exitBatch = () => {
    setBatchMode(false);
    setBatchDates([]);
  };

  /** 批量：选中一个连续区间（含首尾），上限 62 天防误操作 */
  const selectRange = (from: string, to: string) => {
    const out: string[] = [];
    let k = from;
    for (let i = 0; i < 62 && k <= to; i++) {
      out.push(k);
      k = addDaysKey(k, 1);
    }
    setBatchDates(out);
  };

  const handleBatchSave = (entries: DayEntry[]) => {
    onSaveMany(entries);
    const total = entries.reduce(
      (sum, e) => sum + computeDayPay(e, settings).net,
      0,
    );
    onToast(
      `已记 ${entries.length} 天 · 共 ${settings.currency}${formatMoney(Math.round(total * 100) / 100)}`,
      'ok',
    );
    // 记完就退出批量模式：留着一条禁用的「记这 0 天」只会让人困惑，
    // 而且此时点格子是「勾选」不是「打开」，容易误操作
    exitBatch();
  };

  const handleSave = (entry: DayEntry) => {
    onSave(entry);
    const pay = computeDayPay(entry, settings);
    onToast(`已记 ${formatHours(pay.totalHours)} 小时 · ${settings.currency}${formatMoney(pay.net)}`, 'ok');
  };

  const isCurrentMonth = view.year === now.getFullYear() && view.month0 === now.getMonth();

  return (
    <div className="page page-enter">
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

          {/* 累计 + 环比：解决「上个月的工资这个月看不到」 */}
          <button
            type="button"
            className="hero-total"
            onClick={onGoStats}
            title="查看逐月明细"
          >
            <span className="hero-total-main">
              累计 {settings.currency}
              {formatMoney(allTime.net, allTime.net % 1 < 0.005 ? 0 : 2)}
              <span className="hero-total-days">· {allTime.days} 天</span>
            </span>
            {mom.prevNet > 0 ? (
              <span className={`hero-mom ${mom.diff >= 0 ? 'is-up' : 'is-down'}`}>
                上月 {settings.currency}
                {formatMoney(mom.prevNet, 0)}
                {mom.pct !== null
                  ? ` ${mom.diff >= 0 ? '↑' : '↓'}${Math.abs(mom.pct).toFixed(0)}%`
                  : ''}
              </span>
            ) : null}
          </button>

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
              {/* 数据覆盖说明：2027–2030 只有节日日期、没有官方放假安排，
                  2031 起更没有数据。不说明的话，用户会把节日当天误当成放假日。 */}
              {coverageNote ? (
                <em className="cal-note" title="国务院尚未公布该年放假安排">
                  {coverageNote}
                </em>
              ) : null}
            </div>
            <div className="cal-nav">
              <button
                type="button"
                className={`icon-btn ${batchMode ? 'is-on' : ''}`}
                aria-label={batchMode ? '退出批量记账' : '批量记账'}
                aria-pressed={batchMode}
                onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
              >
                <ListChecksIcon size={18} />
              </button>
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

          {/* key 只挂在日历网格上：换月时让网格做一次轻量淡入。
              以前 key 挂在整个 .page 上，换月会把整页（含顶部工资卡、
              NumberTicker、所有 BlurFade）全部卸载重挂 —— 整页动画重放、
              数字重播，滚动位置也丢。现在只有这 42 个格子重挂。 */}
          <div className="cal-grid" role="grid" key={`${view.year}-${view.month0}`}>
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

              // 节假日标注：所有放假日都显示名字，调休上班日显示「班」。
              // getHoliday 对未知年份/非法输入返回 null，这里不会出现
              // undefined / null / 空标签；数据缺失时该日就按普通日期显示。
              const holiday = getHoliday(key);
              const isMakeup = holiday?.kind === 'workday';
              const holidayLabel = holiday && holiday.name ? (isMakeup ? '班' : holiday.name) : null;

              const picked = batchMode && batchDates.includes(key);

              const classes = [
                'day',
                hasHours ? 'has-hours' : '',
                isFull ? 'is-full' : '',
                key === today ? 'is-today' : '',
                key === selected ? 'is-selected' : '',
                holidayLabel ? 'has-holiday' : '',
                isMakeup ? 'is-makeup' : '',
                batchMode ? 'is-batch' : '',
                picked ? 'is-picked' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  data-date={key}
                  onClick={() => openDay(key)}
                  aria-pressed={batchMode ? picked : undefined}
                  aria-label={`${dateLabel(key)}${
                    holidayLabel ? `，${isMakeup ? '调休上班' : holiday!.name}` : ''
                  }${hasHours ? `，${formatHours(pay!.totalHours)}小时，${formatMoney(pay!.net)}元` : '，无记录'}${
                    batchMode ? (picked ? '，已选中' : '，未选中') : ''
                  }`}
                  aria-current={key === today ? 'date' : undefined}
                >
                  <span className="day-num">{dayNum}</span>
                  {holidayLabel ? <span className="day-holiday">{holidayLabel}</span> : null}
                  {hasHours ? (
                    <span className="day-money">
                      {Math.round(pay!.net) >= 1000
                        ? `${(pay!.net / 1000).toFixed(1)}k`
                        : Math.round(pay!.net)}
                    </span>
                  ) : null}
                  {hasExtra ? <span className="day-dot" /> : null}
                  {/* 批量模式下右上角显示勾选态 */}
                  {batchMode ? (
                    <span className="day-tick" aria-hidden="true">
                      {picked ? <CheckIcon size={11} /> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* ---------------- 批量操作区 ---------------- */}
          {batchMode ? (
            <div className="batch-bar">
              <div className="batch-quick">
                <span className="hint">快速选中</span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    const first = `${view.year}-${String(view.month0 + 1).padStart(2, '0')}-01`;
                    selectRange(first, monthEndKey(view.year, view.month0));
                  }}
                >
                  整月
                </button>
                {isCurrentMonth ? (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => selectRange(`${view.year}-${String(view.month0 + 1).padStart(2, '0')}-01`, today)}
                  >
                    本月已过
                  </button>
                ) : null}
                <button type="button" className="chip" onClick={() => setBatchDates([])}>
                  清空选择
                </button>
              </div>
              <div className="batch-actions">
                <span className="batch-count">
                  已选 <strong>{batchDates.length}</strong> 天
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={batchDates.length === 0}
                  onClick={() => setBatchOpen(true)}
                >
                  记这 {batchDates.length} 天
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={exitBatch}>
                  退出
                </button>
              </div>
            </div>
          ) : null}

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

      <BatchSheet
        open={batchOpen}
        dates={batchDates}
        state={state}
        onSave={handleBatchSave}
        onDelete={(ds) => {
          onDeleteMany(ds);
          onToast(`已清空 ${ds.length} 天的记录`);
          setBatchDates([]);
        }}
        onClose={() => setBatchOpen(false)}
      />
    </div>
  );
}
