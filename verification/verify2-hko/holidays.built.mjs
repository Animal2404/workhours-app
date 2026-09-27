const YEAR_PLANS = {
  /* 国办发明电〔2023〕7号 */
  2024: {
    ranges: [
      { name: "\u5143\u65E6", from: "2024-01-01", to: "2024-01-01" },
      // 1月1日放假，与周末连休
      { name: "\u6625\u8282", from: "2024-02-10", to: "2024-02-17" },
      // 2月10日至17日，共8天
      { name: "\u6E05\u660E\u8282", from: "2024-04-04", to: "2024-04-06" },
      // 共3天
      { name: "\u52B3\u52A8\u8282", from: "2024-05-01", to: "2024-05-05" },
      // 共5天
      { name: "\u7AEF\u5348\u8282", from: "2024-06-10", to: "2024-06-10" },
      // 6月10日放假，与周末连休
      { name: "\u4E2D\u79CB\u8282", from: "2024-09-15", to: "2024-09-17" },
      // 共3天
      { name: "\u56FD\u5E86\u8282", from: "2024-10-01", to: "2024-10-07" }
      // 共7天
    ],
    workdays: [
      "2024-02-04",
      // 周日上班
      "2024-02-18",
      // 周日上班
      "2024-04-07",
      // 周日上班
      "2024-04-28",
      // 周日上班
      "2024-05-11",
      // 周六上班
      "2024-09-14",
      // 周六上班
      "2024-09-29",
      // 周日上班
      "2024-10-12"
      // 周六上班
    ]
  },
  /* 国办发明电〔2024〕12号 */
  2025: {
    ranges: [
      { name: "\u5143\u65E6", from: "2025-01-01", to: "2025-01-01" },
      // 放假1天，不调休
      { name: "\u6625\u8282", from: "2025-01-28", to: "2025-02-04" },
      // 除夕起，共8天
      { name: "\u6E05\u660E\u8282", from: "2025-04-04", to: "2025-04-06" },
      // 共3天
      { name: "\u52B3\u52A8\u8282", from: "2025-05-01", to: "2025-05-05" },
      // 共5天
      { name: "\u7AEF\u5348\u8282", from: "2025-05-31", to: "2025-06-02" },
      // 共3天
      // 原文「国庆节、中秋节：10月1日至8日放假调休，共8天」
      // 拆成两段只是为了日历能显示「中秋节」；放假日集合与原文一致
      { name: "\u56FD\u5E86\u8282", from: "2025-10-01", to: "2025-10-05" },
      { name: "\u4E2D\u79CB\u8282", from: "2025-10-06", to: "2025-10-06" },
      { name: "\u56FD\u5E86\u8282", from: "2025-10-07", to: "2025-10-08" }
    ],
    workdays: [
      "2025-01-26",
      // 周日上班
      "2025-02-08",
      // 周六上班
      "2025-04-27",
      // 周日上班
      "2025-09-28",
      // 周日上班
      "2025-10-11"
      // 周六上班
    ]
  },
  /* 国办发明电〔2025〕7号 */
  2026: {
    ranges: [
      { name: "\u5143\u65E6", from: "2026-01-01", to: "2026-01-03" },
      // 共3天，1月4日上班
      { name: "\u6625\u8282", from: "2026-02-15", to: "2026-02-23" },
      // 腊月二十八起，共9天
      { name: "\u6E05\u660E\u8282", from: "2026-04-04", to: "2026-04-06" },
      // 共3天，不调休
      { name: "\u52B3\u52A8\u8282", from: "2026-05-01", to: "2026-05-05" },
      // 共5天，5月9日上班
      { name: "\u7AEF\u5348\u8282", from: "2026-06-19", to: "2026-06-21" },
      // 共3天，不调休
      { name: "\u4E2D\u79CB\u8282", from: "2026-09-25", to: "2026-09-27" },
      // 9月25日（周五）起，共3天
      { name: "\u56FD\u5E86\u8282", from: "2026-10-01", to: "2026-10-07" }
      // 共7天
    ],
    workdays: [
      "2026-01-04",
      // 周日上班
      "2026-02-14",
      // 周六上班
      "2026-02-28",
      // 周六上班
      "2026-05-09",
      // 周六上班
      "2026-09-20",
      // 周日上班
      "2026-10-10"
      // 周六上班
    ]
  }
};
const WORKDAY_NAME = "\u8C03\u4F11\u4E0A\u73ED";
const FESTIVALS = {
  2027: {
    \u5143\u65E6: "2027-01-01",
    \u6625\u8282: "2027-02-06",
    \u6E05\u660E\u8282: "2027-04-05",
    \u52B3\u52A8\u8282: "2027-05-01",
    \u7AEF\u5348\u8282: "2027-06-09",
    \u4E2D\u79CB\u8282: "2027-09-15",
    \u56FD\u5E86\u8282: "2027-10-01"
  },
  2028: {
    \u5143\u65E6: "2028-01-01",
    \u6625\u8282: "2028-01-26",
    \u6E05\u660E\u8282: "2028-04-04",
    \u52B3\u52A8\u8282: "2028-05-01",
    \u7AEF\u5348\u8282: "2028-05-28",
    \u4E2D\u79CB\u8282: "2028-10-03",
    \u56FD\u5E86\u8282: "2028-10-01"
  },
  2029: {
    \u5143\u65E6: "2029-01-01",
    \u6625\u8282: "2029-02-13",
    \u6E05\u660E\u8282: "2029-04-04",
    \u52B3\u52A8\u8282: "2029-05-01",
    \u7AEF\u5348\u8282: "2029-06-16",
    \u4E2D\u79CB\u8282: "2029-09-22",
    \u56FD\u5E86\u8282: "2029-10-01"
  },
  2030: {
    \u5143\u65E6: "2030-01-01",
    \u6625\u8282: "2030-02-03",
    \u6E05\u660E\u8282: "2030-04-05",
    \u52B3\u52A8\u8282: "2030-05-01",
    \u7AEF\u5348\u8282: "2030-06-05",
    \u4E2D\u79CB\u8282: "2030-09-12",
    \u56FD\u5E86\u8282: "2030-10-01"
  }
};
const DAY_MS = 864e5;
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function expandRange(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const out = [];
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += DAY_MS) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return out;
}
function makeInfo(name, kind) {
  return Object.freeze({ name, kind });
}
const TABLE = (() => {
  const map = /* @__PURE__ */ new Map();
  for (const year of Object.keys(YEAR_PLANS)) {
    const plan = YEAR_PLANS[Number(year)];
    if (!plan) continue;
    for (const range of plan.ranges) {
      for (const day of expandRange(range.from, range.to)) {
        map.set(day, makeInfo(range.name, "holiday"));
      }
    }
    for (const day of plan.workdays) {
      map.set(day, makeInfo(WORKDAY_NAME, "workday"));
    }
  }
  return map;
})();
const COVERED_YEARS = new Set(Object.keys(YEAR_PLANS).map(Number));
const FESTIVAL_TABLE = new Map(
  Object.values(FESTIVALS).flatMap(
    (year) => Object.entries(year).map(([name, day]) => [day, makeInfo(name, "festival")])
  )
);
const FESTIVAL_YEARS = new Set(Object.keys(FESTIVALS).map(Number));
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseKey(dateKey) {
  if (typeof dateKey !== "string") return null;
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}
function isWeekend(p) {
  const w = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return w === 0 || w === 6;
}
function getHoliday(dateKey) {
  const parsed = parseKey(dateKey);
  if (parsed === null) return null;
  if (COVERED_YEARS.has(parsed.y)) return TABLE.get(dateKey) ?? null;
  if (FESTIVAL_YEARS.has(parsed.y)) return FESTIVAL_TABLE.get(dateKey) ?? null;
  return null;
}
function holidayName(dateKey) {
  const info = getHoliday(dateKey);
  return info === null ? null : info.name;
}
function isRestDay(dateKey) {
  const parsed = parseKey(dateKey);
  if (parsed === null) return false;
  if (COVERED_YEARS.has(parsed.y)) {
    const info = TABLE.get(dateKey);
    if (info !== void 0) return info.kind === "holiday";
    return isWeekend(parsed);
  }
  if (FESTIVAL_YEARS.has(parsed.y)) return isWeekend(parsed);
  return false;
}
export {
  getHoliday,
  holidayName,
  isRestDay
};
