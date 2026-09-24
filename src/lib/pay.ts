/* ============================================================
   工时记 · 工资引擎
   ------------------------------------------------------------
   规则（默认）：
     当天工资 = 正常工时 × 时薪  +  加班工时 × 时薪 × 加班倍率
                + 补贴  −  扣款

   举例：10 小时 × 20 元/小时 = 200 元。
   加班倍率默认 1（不加成），设为 1.5 就是 1.5 倍。

   关键细节：所有金额「按天」四舍五入到分，再累加。
   这样用户看到的每天金额加起来，正好等于月度总额——
   不会出现「明细之和 ≠ 合计」这种让人不信任的情况。
   ============================================================ */

import type { AppState, DayEntry, DayPay, RangeSummary, Settings } from './types';
import { monthKeys } from './date';

/** 四舍五入到分（两位小数），消除浮点误差 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // 按绝对值算再补回符号：正负两侧同一个规则（远离零），
  // 否则 +0.005 与 −0.005 会都朝 +∞ 进位，钱上就是系统性偏差。
  const sign = n < 0 ? -1 : 1;
  const scaled = Math.abs(n) * 100;
  // 补偿二进制浮点误差：1.005 × 100 实际是 100.49999999999999，
  // 不补这一点就会被舍成 100，分位上的钱会算错。
  const nudged = scaled + Math.abs(scaled) * Number.EPSILON * 4;
  const out = (sign * Math.round(nudged)) / 100;
  return out === 0 ? 0 : out; // 把 −0 归一成 0
}

/** 清洗输入：非数字/负数/NaN 一律归零 */
export function safeNum(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return v;
}

export function emptyEntry(date: string, now = Date.now()): DayEntry {
  return {
    date,
    hours: 0,
    overtimeHours: 0,
    allowance: 0,
    deduction: 0,
    updatedAt: now,
  };
}

/** 这一天是否有任何可记录的内容（用来决定要不要存进 entries） */
export function hasContent(e: DayEntry): boolean {
  return (
    e.hours > 0 ||
    e.overtimeHours > 0 ||
    e.allowance > 0 ||
    e.deduction > 0 ||
    (e.note?.trim().length ?? 0) > 0 ||
    typeof e.rate === 'number'
  );
}

/** 计算某一天的工资明细 */
export function computeDayPay(entry: DayEntry, settings: Settings): DayPay {
  const normalHours = safeNum(entry.hours);
  const overtimeHours = safeNum(entry.overtimeHours);
  const allowance = round2(safeNum(entry.allowance));
  const deduction = round2(safeNum(entry.deduction));
  const rate = safeNum(entry.rate ?? settings.hourlyRate);
  const multiplier = safeNum(settings.overtimeMultiplier, 1) || 1;

  const basePay = round2(normalHours * rate);
  const overtimePay = round2(overtimeHours * rate * multiplier);
  const gross = round2(basePay + overtimePay + allowance);
  const net = round2(gross - deduction);

  return {
    date: entry.date,
    normalHours,
    overtimeHours,
    totalHours: round2(normalHours + overtimeHours),
    rate,
    basePay,
    overtimePay,
    allowance,
    deduction,
    gross,
    net,
  };
}

/** 计算一组日期的汇总（缺失的日期按 0 计） */
export function summarize(keys: string[], state: AppState): RangeSummary {
  const keysSet = new Set(keys);
  let normalHours = 0;
  let overtimeHours = 0;
  let basePay = 0;
  let overtimePay = 0;
  let allowance = 0;
  let deduction = 0;
  let daysWithWork = 0;

  for (const key of keysSet) {
    const entry = state.entries[key];
    if (!entry) continue;
    const pay = computeDayPay(entry, state.settings);
    if (pay.totalHours <= 0 && pay.allowance <= 0 && pay.deduction <= 0) continue;
    normalHours += pay.normalHours;
    overtimeHours += pay.overtimeHours;
    basePay += pay.basePay;
    overtimePay += pay.overtimePay;
    allowance += pay.allowance;
    deduction += pay.deduction;
    if (pay.totalHours > 0) daysWithWork++;
  }

  const totalHours = round2(normalHours + overtimeHours);
  const gross = round2(basePay + overtimePay + allowance);
  const net = round2(gross - deduction);

  return {
    days: daysWithWork,
    normalHours: round2(normalHours),
    overtimeHours: round2(overtimeHours),
    totalHours,
    basePay: round2(basePay),
    overtimePay: round2(overtimePay),
    allowance: round2(allowance),
    deduction: round2(deduction),
    gross,
    net,
    avgHoursPerDay: daysWithWork > 0 ? round2(totalHours / daysWithWork) : 0,
    avgPayPerHour: totalHours > 0 ? round2(net / totalHours) : 0,
  };
}

/** 某月汇总 */
export function summarizeMonth(
  year: number,
  month0: number,
  state: AppState,
): RangeSummary {
  return summarize(monthKeys(year, month0), state);
}

/** 某年汇总 */
export function summarizeYear(year: number, state: AppState): RangeSummary {
  const keys: string[] = [];
  for (let m = 0; m < 12; m++) keys.push(...monthKeys(year, m));
  return summarize(keys, state);
}

/** 逐月汇总（用于年度趋势图） */
export function monthlyTotals(
  year: number,
  state: AppState,
): { month0: number; hours: number; net: number }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const s = summarizeMonth(year, m, state);
    return { month0: m, hours: s.totalHours, net: s.net };
  });
}

/** 找出一段范围内的最佳一天（实得最高） */
export function bestDay(keys: string[], state: AppState): { key: string; net: number } | null {
  let best: { key: string; net: number } | null = null;
  for (const key of keys) {
    const entry = state.entries[key];
    if (!entry) continue;
    const net = computeDayPay(entry, state.settings).net;
    if (!best || net > best.net) best = { key, net };
  }
  return best;
}

/**
 * 本月工资预测：按「已记录工作日的平均日薪」外推到整月的工作日数。
 * 只在已有至少 2 天记录时给出，否则没有意义。
 */
export function projectMonthIncome(
  year: number,
  month0: number,
  state: AppState,
  now = new Date(),
): { projected: number; perDay: number; basedOnDays: number } | null {
  const keys = monthKeys(year, month0).filter((k) => k <= keyOf(now));
  const s = summarize(keys, state);
  if (s.days < 2) return null;

  const perDay = s.net / s.days;
  const total = monthKeys(year, month0).length;
  // 用「本月同比例」外推：已过天数中的记录密度 × 整月
  const elapsed = keys.length || 1;
  const density = s.days / elapsed;
  const projectedDays = Math.max(s.days, Math.round(total * density));
  return {
    projected: round2(perDay * projectedDays),
    perDay: round2(perDay),
    basedOnDays: s.days,
  };
}

function keyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 连续记录天数（从今天或昨天往前数） */
export function currentStreak(state: AppState, now = new Date()): number {
  const has = (d: Date) => {
    const e = state.entries[keyOf(d)];
    return !!e && (e.hours > 0 || e.overtimeHours > 0);
  };

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 今天还没记不算断签，从昨天开始数
  if (!has(start)) {
    start.setDate(start.getDate() - 1);
    if (!has(start)) return 0;
  }

  let streak = 0;
  const cursor = new Date(start);
  while (has(cursor) && streak < 1000) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 本月已记录的工作日数量 */
export function workedDaysInMonth(year: number, month0: number, state: AppState): number {
  return monthKeys(year, month0).filter((k) => {
    const e = state.entries[k];
    return !!e && (e.hours > 0 || e.overtimeHours > 0);
  }).length;
}

/** 已过去的工作日还剩多少天（用于目标倒计时） */
export function daysLeftInMonth(year: number, month0: number, now = new Date()): number {
  const total = monthKeys(year, month0).length;
  const isCurrentMonth =
    now.getFullYear() === year && now.getMonth() === month0;
  if (!isCurrentMonth) return 0;
  return Math.max(0, total - now.getDate());
}

/** 达成月度目标还差多少钱、每天需要赚多少 */
export function goalProgress(
  summary: RangeSummary,
  goal: number,
  year: number,
  month0: number,
  now = new Date(),
): {
  goal: number;
  earned: number;
  remaining: number;
  pct: number;
  perDayNeeded: number;
  daysLeft: number;
} {
  const g = safeNum(goal);
  const earned = summary.net;
  const remaining = round2(Math.max(0, g - earned));
  const pct = g > 0 ? Math.min(100, round2((earned / g) * 100)) : 0;
  const daysLeft = daysLeftInMonth(year, month0, now);
  return {
    goal: g,
    earned,
    remaining,
    pct,
    perDayNeeded: daysLeft > 0 && g > 0 ? round2(remaining / daysLeft) : 0,
    daysLeft,
  };
}

/** 校验并规范化一条记录 */
export function normalizeEntry(input: Partial<DayEntry> & { date: string }, now = Date.now()): DayEntry {
  const out: DayEntry = {
    date: input.date,
    hours: round2(Math.min(safeNum(input.hours), 24)),
    overtimeHours: round2(Math.min(safeNum(input.overtimeHours), 24)),
    allowance: round2(Math.min(safeNum(input.allowance), 1_000_000)),
    deduction: round2(Math.min(safeNum(input.deduction), 1_000_000)),
    updatedAt: input.updatedAt ?? now,
  };
  if (typeof input.rate === 'number' && Number.isFinite(input.rate) && input.rate >= 0) {
    out.rate = round2(input.rate);
  }
  const note = input.note?.trim();
  if (note) out.note = note.slice(0, 500);
  return out;
}
