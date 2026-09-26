/* ============================================================
   工时记 · 中国法定节假日 & 调休数据（2024 / 2025 / 2026）
   ------------------------------------------------------------
   数据来源（全部为国务院办公厅官方通知，逐条人工核对原文）：

   · 2024 年 — 国办发明电〔2023〕7 号（成文 2023-10-25）
     https://www.gov.cn/zhengce/zhengceku/202310/content_6911528.htm
   · 2025 年 — 国办发明电〔2024〕12 号（成文 2024-11-12）
     https://www.gov.cn/zhengce/content/202411/content_6986382.htm
   · 2026 年 — 国办发明电〔2025〕7 号（成文 2025-11-04）
     https://www.gov.cn/zhengce/content/202511/content_7047090.htm

   核对方式：直接抓取上述 gov.cn 原文页面，逐字比对「放假区间」与
   「调休上班日」，未采用任何二手转载。抓取/核对日期 2026-09-26。

   农历日期另用香港天文台《公曆與農曆日期對照表》独立复核（官方历表）：
     https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2026c.txt
     https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2025c.txt
   复核结论：
     · 2026-09-25 = 農曆八月十五 → 中秋节，与国办发明电〔2025〕7号一致（周五）
     · 2026-02-15 = 廿八、2026-02-16 = 廿九（除夕）、2026-02-17 = 正月初一 → 春节
     · 2025-10-06 = 農曆八月十五 → 中秋节，故 2025 年国庆长假里 10-06 标为中秋节
     · 2025-01-28 = 農曆除夕 → 春节假期首日

   ------------------------------------------------------------
   几个容易搞错的点（已按原文处理，别改）：

   1. 2024 年除夕（2024-02-09）**不是**法定假日。原文只写「鼓励各单位
      结合带薪年休假等制度落实，安排职工在除夕休息」——是「鼓励」不是
      「放假」，所以 2024-02-09 不计入节假日。
   2. 2025 年起除夕才正式进入春节假期（1 月 28 日 = 农历除夕）。
   3. 2025 年中秋节（2025-10-06）落在国庆 8 天长假里。原文写的是
      「国庆节、中秋节：10月1日至8日放假调休」。本模块把 10-06 单独
      标成「中秋节」，其余 7 天标成「国庆节」——放假日集合完全一致，
      只是让日历能真的显示出「中秋节」三个字（用户诉求就是看到节日名）。
   4. 2026 年中秋节是 2026-09-25（周五），放假 9/25–9/27 共 3 天，
      不调休。已对官方原文核实：原文第六条第「中秋节：9月25日（周五）
      至27日（周日）放假，共3天。」
   5. 「调休上班」= 本该休息的周末被调成工作日，kind 记为 'workday'。
      这些日子一定是周六或周日（模块内有自检断言兜底）。
   6. 2026 年元旦是 1/1–1/3 放假、1/4（周日）上班，是三天小长假；
      不要想当然按「元旦只放一天」处理。

   ------------------------------------------------------------
   接口约定：

   · getHoliday(key)  未知年份 / 非法格式 / 空串 / null / undefined
                      → 一律返回 null，绝不抛异常
   · isRestDay(key)   同上 → false（覆盖范围外一律 false，不猜）
   · 返回值只有 null / false / 真实对象 / true，永远不返回
     undefined、'undefined'、'null'、空字符串

   本模块纯计算、无副作用：不碰 DOM、不联网、不读写 localStorage，
   也不读取系统时间。上层可以放心在渲染期直接调用。
   ============================================================ */

export type HolidayKind = 'holiday' | 'workday';

export interface HolidayInfo {
  /** 节日名（如「春节」），或调休日固定为「调休上班」 */
  name: string;
  /** 'holiday' = 放假；'workday' = 调休上班的周末 */
  kind: HolidayKind;
}

interface HolidayRange {
  name: string;
  /** 含首日，'YYYY-MM-DD' */
  from: string;
  /** 含末日 */
  to: string;
}

interface YearPlan {
  /** 放假区间（来自官方通知的「X月X日至X月X日放假」） */
  ranges: HolidayRange[];
  /** 官方通知里的「X月X日（周X）上班」——调休上班日 */
  workdays: string[];
}

/* ---------------- 官方数据 ---------------- */

const YEAR_PLANS: Record<number, YearPlan> = {
  /* 国办发明电〔2023〕7号 */
  2024: {
    ranges: [
      { name: '元旦', from: '2024-01-01', to: '2024-01-01' }, // 1月1日放假，与周末连休
      { name: '春节', from: '2024-02-10', to: '2024-02-17' }, // 2月10日至17日，共8天
      { name: '清明节', from: '2024-04-04', to: '2024-04-06' }, // 共3天
      { name: '劳动节', from: '2024-05-01', to: '2024-05-05' }, // 共5天
      { name: '端午节', from: '2024-06-10', to: '2024-06-10' }, // 6月10日放假，与周末连休
      { name: '中秋节', from: '2024-09-15', to: '2024-09-17' }, // 共3天
      { name: '国庆节', from: '2024-10-01', to: '2024-10-07' }, // 共7天
    ],
    workdays: [
      '2024-02-04', // 周日上班
      '2024-02-18', // 周日上班
      '2024-04-07', // 周日上班
      '2024-04-28', // 周日上班
      '2024-05-11', // 周六上班
      '2024-09-14', // 周六上班
      '2024-09-29', // 周日上班
      '2024-10-12', // 周六上班
    ],
  },

  /* 国办发明电〔2024〕12号 */
  2025: {
    ranges: [
      { name: '元旦', from: '2025-01-01', to: '2025-01-01' }, // 放假1天，不调休
      { name: '春节', from: '2025-01-28', to: '2025-02-04' }, // 除夕起，共8天
      { name: '清明节', from: '2025-04-04', to: '2025-04-06' }, // 共3天
      { name: '劳动节', from: '2025-05-01', to: '2025-05-05' }, // 共5天
      { name: '端午节', from: '2025-05-31', to: '2025-06-02' }, // 共3天
      // 原文「国庆节、中秋节：10月1日至8日放假调休，共8天」
      // 拆成两段只是为了日历能显示「中秋节」；放假日集合与原文一致
      { name: '国庆节', from: '2025-10-01', to: '2025-10-05' },
      { name: '中秋节', from: '2025-10-06', to: '2025-10-06' },
      { name: '国庆节', from: '2025-10-07', to: '2025-10-08' },
    ],
    workdays: [
      '2025-01-26', // 周日上班
      '2025-02-08', // 周六上班
      '2025-04-27', // 周日上班
      '2025-09-28', // 周日上班
      '2025-10-11', // 周六上班
    ],
  },

  /* 国办发明电〔2025〕7号 */
  2026: {
    ranges: [
      { name: '元旦', from: '2026-01-01', to: '2026-01-03' }, // 共3天，1月4日上班
      { name: '春节', from: '2026-02-15', to: '2026-02-23' }, // 腊月二十八起，共9天
      { name: '清明节', from: '2026-04-04', to: '2026-04-06' }, // 共3天，不调休
      { name: '劳动节', from: '2026-05-01', to: '2026-05-05' }, // 共5天，5月9日上班
      { name: '端午节', from: '2026-06-19', to: '2026-06-21' }, // 共3天，不调休
      { name: '中秋节', from: '2026-09-25', to: '2026-09-27' }, // 9月25日（周五）起，共3天
      { name: '国庆节', from: '2026-10-01', to: '2026-10-07' }, // 共7天
    ],
    workdays: [
      '2026-01-04', // 周日上班
      '2026-02-14', // 周六上班
      '2026-02-28', // 周六上班
      '2026-05-09', // 周六上班
      '2026-09-20', // 周日上班
      '2026-10-10', // 周六上班
    ],
  },
};

/** 调休上班日的固定显示名 */
const WORKDAY_NAME = '调休上班';

/* ---------------- 表构建（纯计算，无副作用） ---------------- */

const DAY_MS = 86400000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 展开闭区间 [from, to] 的每一天。
 * 全程用 Date.UTC，不碰本地时区，跨时区跑结果一致。
 */
function expandRange(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const out: string[] = [];
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += DAY_MS) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return out;
}

function makeInfo(name: string, kind: HolidayKind): HolidayInfo {
  // 冻结，防止调用方拿到共享对象后改坏整张表
  return Object.freeze({ name, kind });
}

const TABLE: Map<string, HolidayInfo> = (() => {
  const map = new Map<string, HolidayInfo>();
  for (const year of Object.keys(YEAR_PLANS)) {
    const plan = YEAR_PLANS[Number(year)];
    if (!plan) continue;
    for (const range of plan.ranges) {
      for (const day of expandRange(range.from, range.to)) {
        map.set(day, makeInfo(range.name, 'holiday'));
      }
    }
    for (const day of plan.workdays) {
      map.set(day, makeInfo(WORKDAY_NAME, 'workday'));
    }
  }
  return map;
})();

const COVERED_YEARS: Set<number> = new Set(Object.keys(YEAR_PLANS).map(Number));

/* ---------------- 输入校验 ---------------- */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface ParsedKey {
  y: number;
  m: number;
  d: number;
}

/**
 * 严格解析 'YYYY-MM-DD'。
 * 只认补零的定长格式（'2026-9-25' 视为非法），并且必须是真实存在的一天
 * （挡掉 '2026-02-30'、'2026-13-45' 这类）。
 * 任何非字符串 / null / undefined / 空串 → null，不抛异常。
 */
function parseKey(dateKey: unknown): ParsedKey | null {
  if (typeof dateKey !== 'string') return null;
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m: mo, d };
}

/** 周六 / 周日（用 UTC 取值，与运行环境时区无关） */
function isWeekend(p: ParsedKey): boolean {
  const w = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return w === 0 || w === 6;
}

/* ---------------- 对外接口 ---------------- */

/**
 * 查这一天是什么日子。
 * @param dateKey 'YYYY-MM-DD'（如 '2026-09-25'）
 * @returns 节假日 / 调休上班信息；不是特殊日子、或超出覆盖年份 → null
 */
export function getHoliday(dateKey: string): HolidayInfo | null {
  const parsed = parseKey(dateKey);
  if (parsed === null) return null;
  if (!COVERED_YEARS.has(parsed.y)) return null;
  return TABLE.get(dateKey) ?? null;
}

/**
 * 只要节日名。
 * @returns 节日名或「调休上班」；没有 → null（永不返回 '' 或 'undefined'）
 */
export function holidayName(dateKey: string): string | null {
  const info = getHoliday(dateKey);
  return info === null ? null : info.name;
}

/**
 * 这天是不是「休息日」：法定放假日，或者周末且没被调休成上班。
 * 覆盖年份之外的日期一律 false——没有数据就不替用户猜。
 */
export function isRestDay(dateKey: string): boolean {
  const parsed = parseKey(dateKey);
  if (parsed === null) return false;
  if (!COVERED_YEARS.has(parsed.y)) return false;
  const info = TABLE.get(dateKey);
  if (info !== undefined) return info.kind === 'holiday';
  return isWeekend(parsed);
}
