/* ============================================================
   工时记 · 数据模型
   ============================================================ */

/** 一天的工时记录（以日期为主键，一天一条） */
export interface DayEntry {
  /** 日期键：YYYY-MM-DD */
  date: string;
  /** 正常工时（小时） */
  hours: number;
  /** 加班工时（小时），按加班倍率计价 */
  overtimeHours: number;
  /** 当天时薪覆盖值；不设则用全局时薪 */
  rate?: number;
  /** 当天补贴（元） */
  allowance: number;
  /** 当天扣款（元） */
  deduction: number;
  /** 备注：干了什么活 */
  note?: string;
  /** 最近修改时间，用于「最后记录」与冲突判断 */
  updatedAt: number;
}

/** 班次模板：一键填常见时长 */
export interface ShiftTemplate {
  id: string;
  name: string;
  hours: number;
  overtimeHours: number;
}

/** 固定班次规则：周几自动预填 */
export interface RecurringRule {
  id: string;
  /** 0=周日 … 6=周六 */
  weekdays: number[];
  hours: number;
  overtimeHours: number;
  enabled: boolean;
}

/**
 * 存款目标：攒钱买某个东西（如「买 iPhone 18」）。
 *
 * 进度怎么算：**起算日之后的净收入**累加，再加上 initial。
 * 为什么要有起算日 —— 否则「上个月攒的钱」会莫名其妙算进新目标，
 * 用户会觉得数字对不上。想让全部历史都算进来，把起算日设成第一次记账那天即可。
 */
export interface SavingsGoal {
  id: string;
  /** 目标名，如「买 iPhone 18」 */
  name: string;
  /** 目标金额（元） */
  target: number;
  /** 起算日 YYYY-MM-DD：这天的收入开始计入 */
  startDate: string;
  /** 起算时已经攒下的钱（可选，默认 0） */
  initial: number;
  createdAt: number;
  /** 达成时间；有值表示已完成 */
  achievedAt?: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  /** 基础时薪（元/小时） */
  hourlyRate: number;
  /** 加班倍率，例如 1.5 */
  overtimeMultiplier: number;
  /** 货币符号 */
  currency: string;
  /** 月度工资目标（元），0 = 未设置 */
  monthlyGoalIncome: number;
  /** 每日工时目标（小时），0 = 未设置 */
  dailyGoalHours: number;
  /** 每周第一天是否从周一开始 */
  weekStartsMonday: boolean;
  /** 记账提醒 */
  reminderEnabled: boolean;
  /** 提醒时间 HH:mm */
  reminderTime: string;
  theme: ThemeMode;
  templates: ShiftTemplate[];
  recurring: RecurringRule[];
  /** 存款目标列表（买手机、旅游……） */
  savingsGoals: SavingsGoal[];
}

export interface AppState {
  version: number;
  settings: Settings;
  /** 记事本：date -> entry */
  entries: Record<string, DayEntry>;
}

/* ---------------- 工资计算结果 ---------------- */

export interface DayPay {
  date: string;
  normalHours: number;
  overtimeHours: number;
  totalHours: number;
  /** 当天实际生效的时薪 */
  rate: number;
  /** 正常工时工资 */
  basePay: number;
  /** 加班工资 */
  overtimePay: number;
  allowance: number;
  deduction: number;
  /** 税前小计 = 正常 + 加班 + 补贴 */
  gross: number;
  /** 实得 = 小计 - 扣款 */
  net: number;
}

export interface RangeSummary {
  days: number;
  normalHours: number;
  overtimeHours: number;
  totalHours: number;
  basePay: number;
  overtimePay: number;
  allowance: number;
  deduction: number;
  gross: number;
  net: number;
  /** 平均每天工时（按有记录的天数算） */
  avgHoursPerDay: number;
  /** 平均每小时实得 */
  avgPayPerHour: number;
}
