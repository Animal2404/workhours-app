/* ============================================================
   工资引擎自检
   ------------------------------------------------------------
   把真实的 src/lib/pay.ts 用 esbuild 编译后直接跑断言，
   测的是真代码，不是复制一份逻辑来测。

   运行：npm run check
   ============================================================ */

import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, '.tmp');
const outFile = join(outDir, 'pay.mjs');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(root, 'src/lib/pay.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'node18',
  outfile: outFile,
  logLevel: 'warning',
});

const pay = await import(`file://${outFile.replace(/\\/g, '/')}`);

/* ---------------- 迷你测试框架 ---------------- */
let pass = 0;
const fails = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push({ name, actual: a, expected: e });
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

const settings = {
  hourlyRate: 20,
  overtimeMultiplier: 1,
  currency: '¥',
  monthlyGoalIncome: 0,
  dailyGoalHours: 8,
  weekStartsMonday: true,
  reminderEnabled: false,
  reminderTime: '20:00',
  theme: 'system',
  templates: [],
  recurring: [],
};

const day = (over = {}) => ({
  date: '2026-08-14',
  hours: 0,
  overtimeHours: 0,
  allowance: 0,
  deduction: 0,
  updatedAt: 0,
  ...over,
});

const state = (entries, s = {}) => ({
  version: 1,
  settings: { ...settings, ...s },
  entries,
});

/* ---------------- 1. 用户给的例子 ---------------- */
console.log('\n[1] 核心例子：10 小时 × 20 元');
{
  const p = pay.computeDayPay(day({ hours: 10 }), settings);
  check('这天工资 = 200', p.net, 200);
  check('正常工资 = 200', p.basePay, 200);
  check('总工时 = 10', p.totalHours, 10);
}

/* ---------------- 2. 常规计薪 ---------------- */
console.log('\n[2] 常规组合');
{
  const p = pay.computeDayPay(day({ hours: 8 }), settings);
  check('8 小时 = 160', p.net, 160);
}
{
  const p = pay.computeDayPay(day({ hours: 7.5 }), settings);
  check('7.5 小时 = 150', p.net, 150);
}
{
  const p = pay.computeDayPay(day({ hours: 0 }), settings);
  check('没上班 = 0', p.net, 0);
}

/* ---------------- 3. 加班倍率 ---------------- */
console.log('\n[3] 加班倍率');
{
  const s = { ...settings, overtimeMultiplier: 1.5 };
  const p = pay.computeDayPay(day({ hours: 8, overtimeHours: 2 }), s);
  // 8×20 + 2×20×1.5 = 160 + 60 = 220
  check('8h + 2h加班×1.5 = 220', p.net, 220);
  check('加班工资 = 60', p.overtimePay, 60);
}
{
  const s = { ...settings, overtimeMultiplier: 2 };
  const p = pay.computeDayPay(day({ hours: 0, overtimeHours: 3 }), s);
  check('3h加班×2倍 = 120', p.net, 120);
}

/* ---------------- 4. 单天时薪覆盖 ---------------- */
console.log('\n[4] 单天时薪覆盖');
{
  const p = pay.computeDayPay(day({ hours: 10, rate: 25 }), settings);
  check('10h × 25 = 250', p.net, 250);
  check('生效时薪 = 25', p.rate, 25);
}
{
  // rate = 0 是合法值（比如实习当天不算钱），不能被当成「没设置」
  const p = pay.computeDayPay(day({ hours: 5, rate: 0 }), settings);
  check('显式 rate=0 → 0 元', p.net, 0);
}

/* ---------------- 5. 补贴与扣款 ---------------- */
console.log('\n[5] 补贴 / 扣款');
{
  const p = pay.computeDayPay(day({ hours: 8, allowance: 30 }), settings);
  check('160 + 补贴30 = 190', p.net, 190);
}
{
  const p = pay.computeDayPay(day({ hours: 8, deduction: 50 }), settings);
  check('160 − 扣款50 = 110', p.net, 110);
}
{
  const p = pay.computeDayPay(day({ hours: 8, allowance: 30, deduction: 50 }), settings);
  check('160 + 30 − 50 = 140', p.net, 140);
}
{
  const p = pay.computeDayPay(day({ hours: 0, deduction: 100 }), settings);
  check('只扣款 → 负数（欠款）', p.net, -100);
}

/* ---------------- 6. 浮点精度 ---------------- */
console.log('\n[6] 浮点精度（不能出现 199.99999999999997）');
{
  const p = pay.computeDayPay(day({ hours: 0.1 * 3 }), settings);
  check('0.30000000000000004h → 干净数字', Number.isFinite(p.net), true);
}
{
  const s = { ...settings, hourlyRate: 33.33 };
  const p = pay.computeDayPay(day({ hours: 7.5 }), s);
  check('7.5 × 33.33 = 249.98', p.net, 249.98);
}
{
  const s = { ...settings, hourlyRate: 0.1 };
  const p = pay.computeDayPay(day({ hours: 3 }), s);
  check('3 × 0.1 = 0.3', p.net, 0.3);
}
{
  const s = { ...settings, hourlyRate: 19.99, overtimeMultiplier: 1.5 };
  const p = pay.computeDayPay(day({ hours: 8, overtimeHours: 1.5 }), s);
  // 8×19.99 = 159.92 ; 1.5×19.99×1.5 = 44.9775 → 44.98 ; 合计 204.9
  check('复杂小数不乱码', p.net, 204.9);
}

/* ---------------- 7. 明细之和 == 合计（关键不变量） ---------------- */
console.log('\n[7] 不变量：每天金额之和 = 区间合计');
{
  const entries = {};
  // 造一堆会产生小数的天数，检查求和是否与汇总一致
  const mk = (d, hours, rate, ot = 0, al = 0, de = 0) => {
    entries[`2026-08-${String(d).padStart(2, '0')}`] = day({
      date: `2026-08-${String(d).padStart(2, '0')}`,
      hours,
      rate,
      overtimeHours: ot,
      allowance: al,
      deduction: de,
    });
  };
  mk(1, 7.5, 33.33);
  mk(2, 3.25, 19.99, 1.5);
  mk(3, 8, 17.77, 0, 12.5, 0);
  mk(4, 6.75, 23.33, 0, 0, 7.77);
  mk(5, 0.5, 41.11);

  const st = state(entries, { overtimeMultiplier: 1.5 });
  const keys = Object.keys(entries);
  const sum = pay.summarize(keys, st);

  const manual = keys.reduce(
    (acc, k) => acc + pay.computeDayPay(entries[k], st.settings).net,
    0,
  );
  check('逐天相加 == summarize().net', pay.round2(manual), sum.net);
}

/* ---------------- 8. summarize 只统计指定区间 ---------------- */
console.log('\n[8] 区间统计');
{
  const entries = {
    '2026-07-31': day({ date: '2026-07-31', hours: 10 }),
    '2026-08-01': day({ date: '2026-08-01', hours: 8 }),
    '2026-08-02': day({ date: '2026-08-02', hours: 6 }),
  };
  const st = state(entries);
  const s = pay.summarize(['2026-08-01', '2026-08-02'], st);
  check('只算 8 月两天 = 280', s.net, 280);
  check('出勤 2 天', s.days, 2);
  check('总工时 14', s.totalHours, 14);
  check('日均 = 7', s.avgHoursPerDay, 7);
  check('等效时薪 = 20', s.avgPayPerHour, 20);
}
{
  const st = state({});
  const s = pay.summarize(['2026-08-01'], st);
  check('空数据不炸（div by zero）', [s.net, s.avgHoursPerDay, s.avgPayPerHour], [0, 0, 0]);
}

/* ---------------- 9. normalizeEntry 清洗脏输入 ---------------- */
console.log('\n[9] 脏输入清洗');
{
  const e = pay.normalizeEntry({ date: '2026-08-14', hours: -5, overtimeHours: NaN });
  check('负数/NaN → 0', [e.hours, e.overtimeHours], [0, 0]);
}
{
  const e = pay.normalizeEntry({ date: '2026-08-14', hours: 999 });
  check('超过 24 小时被夹住', e.hours, 24);
}
{
  const e = pay.normalizeEntry({ date: '2026-08-14', note: '   ' });
  check('纯空格备注被丢掉', e.note, undefined);
}
{
  const e = pay.normalizeEntry({ date: '2026-08-14', note: 'x'.repeat(999) });
  check('超长备注被截断到 500', e.note.length, 500);
}
{
  const e = pay.normalizeEntry({ date: '2026-08-14', allowance: Infinity });
  check('Infinity → 0', e.allowance, 0);
}

/* ---------------- 10. 内容判定（决定日历上显不显示） ---------------- */
console.log('\n[10] hasContent');
{
  check('全空 = 无内容', pay.hasContent(day()), false);
  check('只有工时 = 有内容', pay.hasContent(day({ hours: 1 })), true);
  check('只有备注 = 有内容', pay.hasContent(day({ note: '请假' })), true);
  check('只有扣款 = 有内容', pay.hasContent(day({ deduction: 10 })), true);
  check('空白备注 = 无内容', pay.hasContent(day({ note: '   ' })), false);
  check('rate=0 也算有内容', pay.hasContent(day({ rate: 0 })), true);
}

/* ---------------- 11. 目标进度 ---------------- */
console.log('\n[11] 目标进度');
{
  const s = {
    days: 10,
    normalHours: 80,
    overtimeHours: 0,
    totalHours: 80,
    basePay: 1600,
    overtimePay: 0,
    allowance: 0,
    deduction: 0,
    gross: 1600,
    net: 1600,
    avgHoursPerDay: 8,
    avgPayPerHour: 20,
  };
  const g = pay.goalProgress(s, 3000, 2026, 7, new Date(2026, 7, 20));
  check('已达成 53.33%', g.pct, 53.33);
  check('还差 1400', g.remaining, 1400);
  check('剩 11 天（8月31天 - 20日）', g.daysLeft, 11);
  check('每天需赚 127.27', g.perDayNeeded, 127.27);
}
{
  const s = { ...state({}).settings, net: 5000 };
  const g = pay.goalProgress(
    { days: 1, normalHours: 1, overtimeHours: 0, totalHours: 1, basePay: 0, overtimePay: 0, allowance: 0, deduction: 0, gross: 0, net: 5000, avgHoursPerDay: 1, avgPayPerHour: 5000 },
    3000,
    2026,
    7,
    new Date(2026, 7, 10),
  );
  check('超额时 pct 封顶 100', g.pct, 100);
  check('超额时 remaining = 0', g.remaining, 0);
}
{
  const g = pay.goalProgress(
    { days: 0, normalHours: 0, overtimeHours: 0, totalHours: 0, basePay: 0, overtimePay: 0, allowance: 0, deduction: 0, gross: 0, net: 0, avgHoursPerDay: 0, avgPayPerHour: 0 },
    0,
    2026,
    7,
  );
  check('目标为 0 时不除零', g.pct, 0);
}

/* ---------------- 12. 连续记录 ---------------- */
console.log('\n[12] 连续记录天数');
{
  const now = new Date(2026, 7, 14);
  const mk = (d) => `2026-08-${String(d).padStart(2, '0')}`;
  const entries = {
    [mk(14)]: day({ date: mk(14), hours: 8 }),
    [mk(13)]: day({ date: mk(13), hours: 8 }),
    [mk(12)]: day({ date: mk(12), hours: 8 }),
  };
  check('连记 3 天', pay.currentStreak(state(entries), now), 3);
}
{
  const now = new Date(2026, 7, 14);
  const entries = {
    [mkDay(13)]: day({ date: mkDay(13), hours: 8 }),
    [mkDay(12)]: day({ date: mkDay(12), hours: 8 }),
  };
  // 今天还没记 → 从昨天数，不该算断
  check('今天没记也算连击 2 天', pay.currentStreak(state(entries), now), 2);
}
{
  const now = new Date(2026, 7, 14);
  const entries = { '2026-08-10': day({ date: '2026-08-10', hours: 8 }) };
  check('中断 → 0', pay.currentStreak(state(entries), now), 0);
}

function mkDay(d) {
  return `2026-08-${String(d).padStart(2, '0')}`;
}

/* ---------------- 13. round2 行为 ---------------- */
console.log('\n[13] round2');
{
  check('0.005 → 0.01', pay.round2(0.005), 0.01);
  check('1.005 → 1.01', pay.round2(1.005), 1.01);
  check('NaN → 0', pay.round2(NaN), 0);
  check('Infinity → 0', pay.round2(Infinity), 0);
  check('-1.005 → -1.01', pay.round2(-1.005), -1.01);
}

/* ---------------- 结果 ---------------- */
console.log(`\n${'─'.repeat(52)}`);
if (fails.length === 0) {
  console.log(`✅ 工资引擎自检全部通过：${pass} 项断言`);
  console.log('─'.repeat(52));
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f.name}: 期望 ${f.expected}，实际 ${f.actual}`);
  console.log('─'.repeat(52));
  process.exit(1);
}
