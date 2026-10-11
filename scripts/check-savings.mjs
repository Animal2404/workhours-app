/* ============================================================
   存款目标 / 累计 / 逐月明细 / 老数据迁移 自检
   ------------------------------------------------------------
   测的是真实的 src/lib/*.ts（esbuild 编译后直接跑断言），
   不是复制一份逻辑来测。

   运行：node scripts/check-savings.mjs
   ============================================================ */

import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, '.tmp');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

async function compile(entry, out) {
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'node18',
    outfile: join(outDir, out),
    logLevel: 'warning',
  });
  return import(`file://${join(outDir, out).replace(/\\/g, '/')}`);
}

const pay = await compile('src/lib/pay.ts', 'pay.mjs');
const storage = await compile('src/lib/storage.ts', 'storage.mjs');

/* ---------------- 迷你测试框架 ---------------- */
let pass = 0;
const fails = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fails.push({ name, actual: a, expected: e });
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}
function near(name, actual, expected, tol = 0.005) {
  if (Math.abs(actual - expected) <= tol) pass++;
  else {
    fails.push({ name, actual, expected });
    console.log(`  ✗ ${name}\n      期望 ≈${expected}\n      实际 ${actual}`);
  }
}

/* ---------------- 构造一个可控的 state ---------------- */
const SETTINGS = {
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
  savingsGoals: [],
};

function mkState(entries) {
  return { version: 1, settings: { ...SETTINGS }, entries };
}

/** 一天 8 小时 × 20 元 = 160 元 */
function day(date, hours = 8) {
  return {
    date,
    hours,
    overtimeHours: 0,
    allowance: 0,
    deduction: 0,
    updatedAt: 1,
  };
}

console.log('\n[1] summarizeAll / 累计');
{
  const st = mkState({
    '2026-08-01': day('2026-08-01'),
    '2026-08-02': day('2026-08-02'),
    '2026-09-10': day('2026-09-10'),
    '2026-09-11': day('2026-09-11'),
    '2026-09-12': day('2026-09-12'),
  });
  const all = pay.summarizeAll(st);
  check('累计出勤天数 = 5', all.days, 5);
  near('累计实得 = 5×160 = 800', all.net, 800);
  near('累计总工时 = 40', all.totalHours, 40);

  // 关键：累计必须等于逐月之和（明细之和 ≠ 合计会让人不信任）
  const hist = pay.monthlyHistory(st);
  near('逐月之和 = 累计', hist.reduce((s, m) => s + m.net, 0), all.net);
}

console.log('\n[2] monthlyHistory：从新到旧、含上月');
{
  const st = mkState({
    '2026-07-05': day('2026-07-05'),
    '2026-08-01': day('2026-08-01'),
    '2026-08-02': day('2026-08-02'),
    '2026-09-10': day('2026-09-10', 4),
  });
  const h = pay.monthlyHistory(st);
  check('月份数 = 3', h.length, 3);
  check('排序从新到旧', h.map((m) => `${m.year}-${m.month0}`), ['2026-8', '2026-7', '2026-6']);
  check('标签形如 2026年9月', h[0].label, '2026年9月');
  near('9 月 = 4h×20 = 80', h[0].net, 80);
  near('8 月 = 320', h[1].net, 320);
  near('7 月 = 160', h[2].net, 160);
  check('9 月出勤 1 天', h[0].days, 1);
  near('9 月工时 4h', h[0].hours, 4);

  // 空数据
  check('没有记录时返回空数组', pay.monthlyHistory(mkState({})), []);
  check('空数据累加为 0', pay.summarizeAll(mkState({})).net, 0);
}

console.log('\n[3] savingsProgress：进度 / 还差 / 还要几天');
{
  // 9 月 1 日起，每天 160 元，记了 10 天 = 1600
  const entries = {};
  for (let i = 1; i <= 10; i++) {
    const d = `2026-09-${String(i).padStart(2, '0')}`;
    entries[d] = day(d);
  }
  const st = mkState(entries);
  const goal = {
    id: 'g1',
    name: '买 iPhone 18',
    target: 7999,
    startDate: '2026-09-01',
    initial: 0,
    createdAt: 1,
  };
  const now = new Date(2026, 8, 10); // 2026-09-10
  const p = pay.savingsProgress(goal, st, now);

  near('已攒 1600', p.saved, 1600);
  near('还差 6399', p.remaining, 6399);
  near('进度 ≈ 20%', p.pct, (1600 / 7999) * 100, 0.01);
  check('起算至今出勤 10 天', p.workedDays, 10);
  near('日均 160', p.avgPerWorkedDay, 160);
  check('还要上 40 天班（6399/160 上取整）', p.workDaysNeeded, Math.ceil(6399 / 160));
  check('未达成', p.achieved, false);
  check('有预计达成日', typeof p.etaKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.etaKey), true);
  check('预计达成日晚于今天', p.etaKey > '2026-09-10', true);
}

console.log('\n[4] savingsProgress：起算日之前的不算进来');
{
  const st = mkState({
    '2026-01-01': day('2026-01-01'), // 起算日之前，不该算
    '2026-01-02': day('2026-01-02'),
    '2026-09-05': day('2026-09-05'), // 起算日之后
  });
  const goal = {
    id: 'g2',
    name: '旅游',
    target: 1000,
    startDate: '2026-09-01',
    initial: 0,
    createdAt: 1,
  };
  const p = pay.savingsProgress(goal, st, new Date(2026, 8, 5));
  near('只算起算日之后的 160', p.saved, 160);
  check('出勤也只算 1 天', p.workedDays, 1);
}

console.log('\n[5] savingsProgress：initial 与达成');
{
  const st = mkState({ '2026-09-02': day('2026-09-02') });
  const goal = {
    id: 'g3',
    name: '相机',
    target: 200,
    startDate: '2026-09-01',
    initial: 100,
    createdAt: 1,
  };
  const p = pay.savingsProgress(goal, st, new Date(2026, 8, 2));
  near('已攒 = 100 起存 + 160 = 260', p.saved, 260);
  check('达成', p.achieved, true);
  check('还差 0（不出现负数）', p.remaining, 0);
  check('进度封顶 100', p.pct, 100);
  check('还要上班 0 天', p.workDaysNeeded, 0);
}

console.log('\n[6] savingsProgress：没有收入时不瞎猜');
{
  const st = mkState({});
  const goal = {
    id: 'g4',
    name: '电脑',
    target: 5000,
    startDate: '2026-09-01',
    initial: 0,
    createdAt: 1,
  };
  const p = pay.savingsProgress(goal, st, new Date(2026, 8, 10));
  check('已攒 0', p.saved, 0);
  check('还要上班 = null（不猜）', p.workDaysNeeded, null);
  check('预计达成 = null（不猜）', p.etaKey, null);
  check('进度 0', p.pct, 0);
}

console.log('\n[7] savingsProgress：起算日在未来 / target 为 0');
{
  const st = mkState({ '2026-09-10': day('2026-09-10') });
  const future = {
    id: 'g5',
    name: '未来目标',
    target: 1000,
    startDate: '2026-12-01', // 未来
    initial: 0,
    createdAt: 1,
  };
  const p1 = pay.savingsProgress(future, st, new Date(2026, 8, 10));
  check('起算日在未来 → 已攒 0，不崩', p1.saved, 0);
  check('起算日在未来 → 进度 0', p1.pct, 0);

  const zero = { id: 'g6', name: '零', target: 0, startDate: '2026-09-01', initial: 0, createdAt: 1 };
  const p2 = pay.savingsProgress(zero, st, new Date(2026, 8, 10));
  check('target=0 → 进度 0（不除零）', p2.pct, 0);
  check('target=0 → 不算达成', p2.achieved, false);
  check('target=0 → 不崩、数字有限', Number.isFinite(p2.saved) && Number.isFinite(p2.remaining), true);
}

console.log('\n[8] savingsProgress：坏输入不抛异常');
{
  const st = mkState({ '2026-09-10': day('2026-09-10') });
  const bad = [
    { id: 'b1', name: 'x', target: NaN, startDate: '2026-09-01', initial: 0, createdAt: 1 },
    { id: 'b2', name: 'x', target: -100, startDate: '2026-09-01', initial: 0, createdAt: 1 },
    { id: 'b3', name: 'x', target: 100, startDate: '', initial: NaN, createdAt: 1 },
    { id: 'b4', name: 'x', target: 100, startDate: '乱写', initial: -5, createdAt: 1 },
    { id: 'b5', name: 'x', target: Infinity, startDate: '2026-13-45', initial: 0, createdAt: 1 },
  ];
  let threw = null;
  const outs = [];
  for (const g of bad) {
    try {
      const p = pay.savingsProgress(g, st, new Date(2026, 8, 10));
      outs.push(p);
    } catch (e) {
      threw = `${g.id}: ${e.message}`;
    }
  }
  check('坏目标零抛异常', threw, null);
  check('返回值都是有限数', outs.every((p) => Number.isFinite(p.saved) && Number.isFinite(p.pct)), true);
}

console.log('\n[9] monthOverMonth：环比');
{
  const st = mkState({
    '2026-08-01': day('2026-08-01'), // 8月 160
    '2026-09-01': day('2026-09-01'),
    '2026-09-02': day('2026-09-02'), // 9月 320
  });
  const m = pay.monthOverMonth(2026, 8, st);
  near('上月 = 160', m.prevNet, 160);
  near('差额 = +160', m.diff, 160);
  near('涨幅 = +100%', m.pct, 100, 0.01);

  const noPrev = pay.monthOverMonth(2026, 7, st); // 2026-07 无记录
  check('上月没有记录时 pct = null（不除以 0）', noPrev.pct, null);
  check('上月没有记录时 prevNet = 0', noPrev.prevNet, 0);
}

console.log('\n[10] 老数据迁移：没有 savingsGoals 字段不能炸');
{
  const old = {
    version: 1,
    settings: { hourlyRate: 25, currency: '¥', templates: [], recurring: [] },
    entries: { '2026-09-01': day('2026-09-01') },
  };
  const st = storage.coerceState(old);
  check('老数据补上 savingsGoals=[]', st.settings.savingsGoals, []);
  check('老数据时薪保留', st.settings.hourlyRate, 25);
  check('老数据记录保留', Object.keys(st.entries).length, 1);

  // 坏 savingsGoals 要能修
  const messy = storage.coerceState({
    settings: {
      savingsGoals: [
        { id: 'ok', name: '手机', target: '7999', startDate: '2026-09-01', initial: '100' },
        null,
        'not-an-object',
        { name: '缺 id' },
        { id: 'x' }, // 缺 name
        { id: 'y', name: '日期坏的', target: 100, startDate: '乱写', initial: -5 },
        { id: 'z', name: '超长名字'.repeat(10), target: -1, initial: NaN },
      ],
    },
  });
  const gs = messy.settings.savingsGoals;
  // 合法的只有 3 条：ok / y / z
  //   null、'not-an-object'、{name:'缺 id'}、{id:'x'}（缺 name）都应被丢掉
  check('只留下合法条目（ok/y/z → 3 条）', gs.length, 3);
  check('缺 name 的条目被丢掉', gs.some((g) => g.id === 'x'), false);
  check('字符串数字被转成 number', typeof gs[0].target, 'number');
  near('target "7999" → 7999', gs[0].target, 7999);
  near('initial "100" → 100', gs[0].initial, 100);
  check('坏日期被修成合法 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(gs[1].startDate), true);
  check('负数 initial 被夹到 0', gs[1].initial, 0);
  check('名字截断到 20 字以内', gs[2].name.length <= 20, true);
  check('负 target 被夹到 0', gs[2].target, 0);
  check('NaN initial 被夹成有限数', Number.isFinite(gs[2].initial), true);
}

console.log('\n[11] coerceState 整体健壮性（顺带回归）');
{
  for (const junk of [null, undefined, 0, 'x', [], true, { settings: null }, { settings: 'x' }]) {
    let ok = true;
    try {
      const s = storage.coerceState(junk);
      ok = Array.isArray(s.settings.savingsGoals) && !!s.entries;
    } catch {
      ok = false;
    }
    check(`coerceState(${JSON.stringify(junk) ?? 'undefined'}) 不炸且结构完整`, ok, true);
  }
}

/* ---------------- 汇总 ---------------- */
console.log('\n' + '─'.repeat(64));
if (fails.length === 0) {
  console.log(`✅ 存款目标 / 累计 / 迁移 自检全部通过：${pass} 项断言`);
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  process.exit(1);
}
