/* ============================================================
   工时记 · 本地存储
   数据只存在你自己的设备上（localStorage），不联网、不上传。
   带版本号与容错：坏数据不会让 App 白屏。
   ============================================================ */

import type { AppState, DayEntry, Settings } from './types';
import { normalizeEntry, safeNum, round2 } from './pay';

const STORAGE_KEY = 'workhours.state.v1';
const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  hourlyRate: 20,
  overtimeMultiplier: 1,
  currency: '¥',
  monthlyGoalIncome: 0,
  dailyGoalHours: 8,
  weekStartsMonday: true,
  reminderEnabled: false,
  reminderTime: '20:00',
  theme: 'system',
  templates: [
    { id: 't-std', name: '正常班', hours: 8, overtimeHours: 0 },
    { id: 't-long', name: '长班', hours: 10, overtimeHours: 0 },
    { id: 't-ot', name: '加班', hours: 8, overtimeHours: 2 },
    { id: 't-half', name: '半天', hours: 4, overtimeHours: 0 },
  ],
  recurring: [],
};

export function defaultState(): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    entries: {},
  };
}

/** 把任意（可能损坏的）输入修成可用的 AppState */
export function coerceState(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<AppState>;

  if (obj.settings && typeof obj.settings === 'object') {
    const s = obj.settings as Partial<Settings>;
    base.settings = {
      ...base.settings,
      ...s,
      hourlyRate: safeNum(s.hourlyRate, base.settings.hourlyRate),
      overtimeMultiplier: safeNum(s.overtimeMultiplier, 1) || 1,
      monthlyGoalIncome: safeNum(s.monthlyGoalIncome, 0),
      dailyGoalHours: safeNum(s.dailyGoalHours, base.settings.dailyGoalHours),
      currency: typeof s.currency === 'string' && s.currency ? s.currency.slice(0, 4) : '¥',
      templates: Array.isArray(s.templates) && s.templates.length
        ? s.templates
            .filter((t) => t && typeof t === 'object' && typeof t.id === 'string')
            .map((t) => ({
              id: t.id,
              name: String(t.name ?? '班次').slice(0, 12),
              hours: round2(safeNum(t.hours)),
              overtimeHours: round2(safeNum(t.overtimeHours)),
            }))
        : base.settings.templates,
      recurring: Array.isArray(s.recurring)
        ? s.recurring
            .filter((r) => r && typeof r === 'object' && typeof r.id === 'string')
            .map((r) => ({
              id: r.id,
              weekdays: Array.isArray(r.weekdays)
                ? r.weekdays.filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
                : [],
              hours: round2(safeNum(r.hours)),
              overtimeHours: round2(safeNum(r.overtimeHours)),
              enabled: r.enabled !== false,
            }))
        : [],
    };
  }

  if (obj.entries && typeof obj.entries === 'object') {
    const entries: Record<string, DayEntry> = {};
    for (const [key, value] of Object.entries(obj.entries as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (!value || typeof value !== 'object') continue;
      const e = value as Partial<DayEntry>;
      entries[key] = normalizeEntry({ ...e, date: key }, e.updatedAt ?? Date.now());
    }
    base.entries = entries;
  }

  return base;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return coerceState(JSON.parse(raw));
  } catch {
    // 存储不可用（隐私模式等）或数据损坏 → 用默认值，App 照常能用
    return defaultState();
  }
}

/** 返回是否写入成功（配额满/隐私模式会失败） */
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- 导出 / 导入 / 清空 ---------------- */

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text: string): { state: AppState | null; error?: string } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      return { state: null, error: '文件内容不是有效的备份' };
    }
    return { state: coerceState(parsed) };
  } catch {
    return { state: null, error: '无法解析该文件（不是合法 JSON）' };
  }
}

/** 导出 CSV（Excel 可直接打开）：一行一天 */
export function exportCSV(state: AppState): string {
  const rows: string[] = ['日期,正常工时,加班工时,合计工时,时薪,正常工资,加班工资,补贴,扣款,实得,备注'];
  const keys = Object.keys(state.entries).sort();
  for (const key of keys) {
    const entry = state.entries[key];
    const pay = computeRow(entry, state);
    const note = (entry.note ?? '').replace(/"/g, '""');
    rows.push(
      [
        key,
        pay.normalHours,
        pay.overtimeHours,
        pay.totalHours,
        pay.rate,
        pay.basePay,
        pay.overtimePay,
        pay.allowance,
        pay.deduction,
        pay.net,
        `"${note}"`,
      ].join(','),
    );
  }
  // Excel 中文不乱码：加 UTF-8 BOM
  return '\uFEFF' + rows.join('\n');
}

function computeRow(entry: DayEntry, state: AppState) {
  const rate = safeNum(entry.rate ?? state.settings.hourlyRate);
  const mult = safeNum(state.settings.overtimeMultiplier, 1) || 1;
  const basePay = round2(entry.hours * rate);
  const overtimePay = round2(entry.overtimeHours * rate * mult);
  const gross = round2(basePay + overtimePay + entry.allowance);
  return {
    normalHours: entry.hours,
    overtimeHours: entry.overtimeHours,
    totalHours: round2(entry.hours + entry.overtimeHours),
    rate,
    basePay,
    overtimePay,
    allowance: entry.allowance,
    deduction: entry.deduction,
    net: round2(gross - entry.deduction),
  };
}

/** 触发浏览器下载 */
export function download(filename: string, content: string, mime = 'application/json'): void {
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* 忽略：某些 WebView 不支持下载 */
  }
}
