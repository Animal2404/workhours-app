/* ============================================================
   目标页
   ------------------------------------------------------------
   月度工资目标 + 每日工时目标 + 一点成就感
   ============================================================ */

import { useMemo, useState } from 'react';
import type { AppState, SavingsGoal } from '../lib/types';
import {
  currentStreak,
  computeDayPay,
  savingsProgress,
  summarizeMonth,
} from '../lib/pay';
import {
  formatHours,
  formatMoney,
  monthKeys,
  monthLabel,
  relativeLabel,
  shortDateLabel,
  toKey,
} from '../lib/date';
import { CheckIcon, PencilIcon, PlusIcon, TrendIcon } from '../components/Icon';
import { PiggyBank, Target } from 'lucide';
import { AnimatedCircularProgressBar, BlurFade, LAZY_CARD, NumberTicker, ProgressBar } from '../components/magic';
import { Empty } from '../components/ui';
import { GoalSheet } from '../components/GoalSheet';

export function GoalsPage({
  state,
  onGoSettings,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
}: {
  state: AppState;
  onGoSettings: () => void;
  onAddGoal: (goal: SavingsGoal) => void;
  onUpdateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  onRemoveGoal: (id: string) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const { settings } = state;
  const savingsGoals = settings.savingsGoals;

  // 存款目标抽屉
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (g: SavingsGoal) => {
    setEditing(g);
    setSheetOpen(true);
  };

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

  // 三样都没有才显示「空」页；有存款目标就不再是空页（那才是这个页面现在的重点）
  if (goal <= 0 && !settings.dailyGoalHours && savingsGoals.length === 0) {
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
            text="想买点什么？设个金额，App 帮你算还差多少、还要上几天班。"
            action={
              <div className="goal-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
                  <PlusIcon size={13} /> 添加存款目标
                </button>
                <button type="button" className="btn btn-soft btn-sm" onClick={onGoSettings}>
                  月度目标
                </button>
              </div>
            }
          />
        </section>

        <GoalSheet
          open={sheetOpen}
          goal={editing}
          state={state}
          onSave={(g) => (editing ? onUpdateGoal(editing.id, g) : onAddGoal(g))}
          onDelete={onRemoveGoal}
          onClose={() => setSheetOpen(false)}
        />
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

      {/* ---------------- 存款目标 ---------------- */}
      <BlurFade style={LAZY_CARD}>
        <section className="card">
          <div className="card-title">
            <span>存款目标</span>
            {savingsGoals.length > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={openNew}>
                <PlusIcon size={13} /> 添加
              </button>
            ) : null}
          </div>

          {savingsGoals.length === 0 ? (
            <Empty
              icon={PiggyBank}
              title="还没有存款目标"
              text="比如「买 iPhone 18」，设个金额，App 会告诉你还差多少、还要上几天班。"
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
                  添加目标
                </button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {savingsGoals.map((g) => {
                const prog = savingsProgress(g, state, now);
                const rel = relativeLabel(g.startDate);
                return (
                  <div key={g.id} className="goal-card">
                    <div className="goal-head">
                      <div style={{ minWidth: 0 }}>
                        <div className="goal-name">{g.name}</div>
                        <div className="goal-sub">
                          目标 {settings.currency}
                          {formatMoney(g.target, 0)}
                          {rel ? ` · 从${rel}起算` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn is-small"
                        aria-label={`编辑目标 ${g.name}`}
                        onClick={() => openEdit(g)}
                      >
                        <PencilIcon size={14} />
                      </button>
                    </div>

                    <div className="goal-body">
                      <AnimatedCircularProgressBar
                        value={prog.pct}
                        size={96}
                        strokeWidth={9}
                        label={prog.achieved ? '已达成' : '进度'}
                      />
                      <div className="goal-facts">
                        <div className="goal-fact">
                          <span className="goal-fact-k">已攒</span>
                          <span className="goal-fact-v is-money">
                            {settings.currency}
                            {formatMoney(prog.saved, 0)}
                          </span>
                        </div>
                        <div className="goal-fact">
                          <span className="goal-fact-k">{prog.achieved ? '超出' : '还差'}</span>
                          <span className="goal-fact-v">
                            {settings.currency}
                            {formatMoney(
                              prog.achieved ? prog.saved - prog.target : prog.remaining,
                              0,
                            )}
                          </span>
                        </div>
                        <div className="goal-fact">
                          <span className="goal-fact-k">还要上班</span>
                          <span className="goal-fact-v is-brand">
                            {prog.workDaysNeeded === null
                              ? '记账后可知'
                              : prog.workDaysNeeded === 0
                                ? '不用了 🎉'
                                : `${prog.workDaysNeeded} 天`}
                          </span>
                        </div>
                        <div className="goal-fact">
                          <span className="goal-fact-k">预计达成</span>
                          <span className="goal-fact-v">
                            {prog.etaKey ? shortDateLabel(prog.etaKey) : '数据还不够'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="tiny muted">
                      {prog.workedDays > 0
                        ? `起算至今出勤 ${prog.workedDays} 天，平均每个出勤日 ${settings.currency}${formatMoney(prog.avgPerWorkedDay, 0)}。`
                        : '这段时间还没有收入记录，先记几天就能估出速度。'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </BlurFade>

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
                      ? 'linear-gradient(140deg, var(--money), var(--money-2))'
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

      <GoalSheet
        open={sheetOpen}
        goal={editing}
        state={state}
        onSave={(g) => (editing ? onUpdateGoal(editing.id, g) : onAddGoal(g))}
        onDelete={onRemoveGoal}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
