/* ============================================================
   工时记 · 日期与格式化工具
   全部基于本地时区，避免 UTC 造成的「差一天」
   ============================================================ */

export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** Date -> 'YYYY-MM-DD'（本地时区） */
export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' -> Date（本地 00:00） */
export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

/** 该月的天数 */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * 生成日历网格（补齐前后空位，凑满整周）。
 * 返回 'YYYY-MM-DD' 或 null（占位空格）。
 */
export function monthMatrix(
  year: number,
  month0: number,
  weekStartsMonday: boolean,
): (string | null)[] {
  const first = new Date(year, month0, 1);
  const lead = weekStartsMonday
    ? (first.getDay() + 6) % 7
    : first.getDay();
  const total = daysInMonth(year, month0);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push(toKey(new Date(year, month0, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 按设置排序的星期表头 */
export function weekdayHeaders(weekStartsMonday: boolean): { label: string; idx: number }[] {
  const order = weekStartsMonday ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  return order.map((idx) => ({ label: WEEKDAY_CN[idx], idx }));
}

export function isWeekendKey(key: string): boolean {
  const w = fromKey(key).getDay();
  return w === 0 || w === 6;
}

/** 月份标题：2026年8月 */
export function monthLabel(year: number, month0: number): string {
  return `${year}年${month0 + 1}月`;
}

/** 日期标题：8月14日 周五 */
export function dateLabel(key: string): string {
  const d = fromKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_CN[d.getDay()]}`;
}

export function shortDateLabel(key: string): string {
  const d = fromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 相对今天的人话描述 */
export function relativeLabel(key: string): string {
  const t = new Date();
  const today = toKey(t);
  if (key === today) return '今天';
  const yest = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (key === toKey(yest)) return '昨天';
  const tom = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  if (key === toKey(tom)) return '明天';
  return '';
}

/** 在月份上加减（自动处理跨年） */
export function shiftMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const d = new Date(year, month0 + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/** 该月所有日期键 */
export function monthKeys(year: number, month0: number): string[] {
  const total = daysInMonth(year, month0);
  const out: string[] = [];
  for (let d = 1; d <= total; d++) out.push(toKey(new Date(year, month0, d)));
  return out;
}

/** 该月第一天的键 */
export function monthStartKey(year: number, month0: number): string {
  return toKey(new Date(year, month0, 1));
}

/** 该月最后一天的键 */
export function monthEndKey(year: number, month0: number): string {
  return toKey(new Date(year, month0, daysInMonth(year, month0)));
}

/** 某年的所有月份标签 */
export function yearMonths(year: number): { year: number; month0: number }[] {
  return Array.from({ length: 12 }, (_, m) => ({ year, month0: m }));
}

/** 时间戳 -> 'HH:mm' */
export function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 1 -> 1，1.5 -> 1.5，2.25 -> 2.25（去掉多余的 0） */
export function trimNum(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return s.replace(/\.?0+$/, '') || '0';
}

/** 金钱格式化：1234.5 -> 1,234.5 */
export function formatMoney(n: number, digits = 2): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(digits);
  const [int, dec] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decTrim = dec ? dec.replace(/0+$/, '') : '';
  const body = decTrim ? `${withSep}.${decTrim}` : withSep;
  return neg ? `-${body}` : body;
}

/** 整钱显示：小于 1 万显示原值，超过显示 1.2万 */
export function formatMoneyShort(n: number): string {
  if (Math.abs(n) >= 10000) return `${trimNum(n / 10000, 1)}万`;
  return formatMoney(n, Math.abs(n % 1) < 0.005 ? 0 : 2);
}

/** 工时时长：7.5 -> 7.5小时 */
export function formatHours(n: number): string {
  return trimNum(n, 2);
}

/** 判断日期键是否合法 */
export function isValidKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(fromKey(key).getTime());
}
