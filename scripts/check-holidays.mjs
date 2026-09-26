/* ============================================================
   节假日数据自检
   ------------------------------------------------------------
   把真实的 src/lib/holidays.ts 用 esbuild 编译后直接跑断言，
   测的是真代码，不是复制一份逻辑来测。

   期望值不来自 src/lib/holidays.ts，而是照着国务院办公厅三份
   官方通知原文另外抄了一份（含原文标注的星期几），
   所以能真正查出数据抄错、日期串行、年份张冠李戴。

   · 2024 — 国办发明电〔2023〕7号
     https://www.gov.cn/zhengce/zhengceku/202310/content_6911528.htm
   · 2025 — 国办发明电〔2024〕12号
     https://www.gov.cn/zhengce/content/202411/content_6986382.htm
   · 2026 — 国办发明电〔2025〕7号
     https://www.gov.cn/zhengce/content/202511/content_7047090.htm

   运行：node scripts/check-holidays.mjs
   ============================================================ */

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, '.tmp');
const outFile = join(outDir, 'holidays.mjs');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(root, 'src/lib/holidays.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'node18',
  outfile: outFile,
  logLevel: 'warning',
});

const hol = await import(`file://${outFile.replace(/\\/g, '/')}`);

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

/* ---------------- 测试自己的日期工具（独立实现，不复用业务代码） ---------------- */
const WD = ['日', '一', '二', '三', '四', '五', '六'];

function keyOf(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function ts(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function weekdayOf(key) {
  return WD[new Date(ts(key)).getUTCDay()];
}
function eachDay(from, to) {
  const out = [];
  for (let t = ts(from); t <= ts(to); t += 86400000) out.push(keyOf(t));
  return out;
}

/* ---------------- 官方通知原文（手工转录，作为独立期望值） ----------------
   区间 = { 名称, 起, 止, 官方标明的起始星期, 官方标明的结束星期 }
   调休 = { 日期, 官方标明的星期 }
   ------------------------------------------------------------------- */
const OFFICIAL = {
  2024: {
    doc: '国办发明电〔2023〕7号',
    ranges: [
      { name: '元旦', from: '2024-01-01', to: '2024-01-01', fromWd: null, toWd: null },
      { name: '春节', from: '2024-02-10', to: '2024-02-17', fromWd: null, toWd: null },
      { name: '清明节', from: '2024-04-04', to: '2024-04-06', fromWd: null, toWd: null },
      { name: '劳动节', from: '2024-05-01', to: '2024-05-05', fromWd: null, toWd: null },
      { name: '端午节', from: '2024-06-10', to: '2024-06-10', fromWd: null, toWd: null },
      { name: '中秋节', from: '2024-09-15', to: '2024-09-17', fromWd: null, toWd: null },
      { name: '国庆节', from: '2024-10-01', to: '2024-10-07', fromWd: null, toWd: null },
    ],
    workdays: [
      ['2024-02-04', '日'],
      ['2024-02-18', '日'],
      ['2024-04-07', '日'],
      ['2024-04-28', '日'],
      ['2024-05-11', '六'],
      ['2024-09-14', '六'],
      ['2024-09-29', '日'],
      ['2024-10-12', '六'],
    ],
  },

  2025: {
    doc: '国办发明电〔2024〕12号',
    ranges: [
      { name: '元旦', from: '2025-01-01', to: '2025-01-01', fromWd: '三', toWd: '三' },
      { name: '春节', from: '2025-01-28', to: '2025-02-04', fromWd: '二', toWd: '二' },
      { name: '清明节', from: '2025-04-04', to: '2025-04-06', fromWd: '五', toWd: '日' },
      { name: '劳动节', from: '2025-05-01', to: '2025-05-05', fromWd: '四', toWd: '一' },
      { name: '端午节', from: '2025-05-31', to: '2025-06-02', fromWd: '六', toWd: '一' },
      // 原文合写「国庆节、中秋节：10月1日至8日」；10月6日才是农历八月十五
      { name: '国庆节', from: '2025-10-01', to: '2025-10-05', fromWd: '三', toWd: null },
      { name: '中秋节', from: '2025-10-06', to: '2025-10-06', fromWd: null, toWd: null },
      { name: '国庆节', from: '2025-10-07', to: '2025-10-08', fromWd: null, toWd: '三' },
    ],
    workdays: [
      ['2025-01-26', '日'],
      ['2025-02-08', '六'],
      ['2025-04-27', '日'],
      ['2025-09-28', '日'],
      ['2025-10-11', '六'],
    ],
  },

  2026: {
    doc: '国办发明电〔2025〕7号',
    ranges: [
      { name: '元旦', from: '2026-01-01', to: '2026-01-03', fromWd: '四', toWd: '六' },
      { name: '春节', from: '2026-02-15', to: '2026-02-23', fromWd: '日', toWd: '一' },
      { name: '清明节', from: '2026-04-04', to: '2026-04-06', fromWd: '六', toWd: '一' },
      { name: '劳动节', from: '2026-05-01', to: '2026-05-05', fromWd: '五', toWd: '二' },
      { name: '端午节', from: '2026-06-19', to: '2026-06-21', fromWd: '五', toWd: '日' },
      { name: '中秋节', from: '2026-09-25', to: '2026-09-27', fromWd: '五', toWd: '日' },
      { name: '国庆节', from: '2026-10-01', to: '2026-10-07', fromWd: '四', toWd: '三' },
    ],
    workdays: [
      ['2026-01-04', '日'],
      ['2026-02-14', '六'],
      ['2026-02-28', '六'],
      ['2026-05-09', '六'],
      ['2026-09-20', '日'],
      ['2026-10-10', '六'],
    ],
  },
};

const YEARS = [2024, 2025, 2026];
const isHoliday = (k) => hol.getHoliday(k);
const info = (name, kind) => ({ name, kind });

/* ---------------- 1. 用户直接关心的核心日期 ---------------- */
console.log('\n[1] 核心日期');
{
  // 本次任务重点核实项：2026 年中秋节
  check('2026-09-25 = 中秋节（放假）', isHoliday('2026-09-25'), info('中秋节', 'holiday'));
  check('2026-09-25 holidayName = 中秋节', hol.holidayName('2026-09-25'), '中秋节');
  check('2026-09-25 是休息日', hol.isRestDay('2026-09-25'), true);
  // 官方原文：中秋节 9月25日（周五）至27日（周日）放假，共3天
  check('2026-09-25 是周五', weekdayOf('2026-09-25'), '五');
  check('2026-09-25 的邻居 09-24 不是节日', isHoliday('2026-09-24'), null);
  check('2026-09-25 的邻居 09-28 不是节日', isHoliday('2026-09-28'), null);

  check('2025-10-01 = 国庆节', isHoliday('2025-10-01'), info('国庆节', 'holiday'));
  check('2025-01-01 = 元旦', isHoliday('2025-01-01'), info('元旦', 'holiday'));
  check('2024-01-01 = 元旦', isHoliday('2024-01-01'), info('元旦', 'holiday'));
  check('2026-01-01 = 元旦', isHoliday('2026-01-01'), info('元旦', 'holiday'));
}

/* ---------------- 2. 官方区间逐日核对 ---------------- */
console.log('\n[2] 官方放假区间逐日核对（含原文标注的星期几）');
{
  let totalDays = 0;
  for (const y of YEARS) {
    const plan = OFFICIAL[y];
    for (const r of plan.ranges) {
      const days = eachDay(r.from, r.to);
      totalDays += days.length;

      const bad = days.filter((d) => {
        const h = isHoliday(d);
        return !h || h.name !== r.name || h.kind !== 'holiday';
      });
      check(
        `${y} ${r.name} ${r.from}~${r.to}（${days.length}天）全部为 holiday`,
        bad,
        [],
      );

      // 区间首尾的星期几必须与官方通知原文一致（查串行/抄错）
      if (r.fromWd !== null) {
        check(`${y} ${r.name} 起始日 ${r.from} 官方标注周${r.fromWd}`, weekdayOf(r.from), r.fromWd);
      }
      if (r.toWd !== null) {
        check(`${y} ${r.name} 结束日 ${r.to} 官方标注周${r.toWd}`, weekdayOf(r.to), r.toWd);
      }
    }
  }
  check('三年放假日合计 = 89 天', totalDays, 89);

  // 区间外一天不能误判成节日
  check('2024-02-09（除夕，2024 未放假）不是节日', isHoliday('2024-02-09'), null);
  check('2024-02-18 不是节日（是调休上班）', isHoliday('2024-02-18'), info('调休上班', 'workday'));
  // 2025 春节自除夕 1/28 起 —— 1/27（周一）不在假期内，别想当然往前多算一天
  check('2025-01-27 未放假（2025 春节自除夕 1/28 起）', isHoliday('2025-01-27'), null);
  check('2025-01-27 是工作日', hol.isRestDay('2025-01-27'), false);
  check('2025-01-28（除夕）= 春节', isHoliday('2025-01-28'), info('春节', 'holiday'));
  check('2026-02-16（除夕）= 春节', isHoliday('2026-02-16'), info('春节', 'holiday'));
  check('2026-02-14 不是节日（是调休上班）', isHoliday('2026-02-14'), info('调休上班', 'workday'));
  check('2026-09-27 是中秋节假期最后一天', isHoliday('2026-09-27'), info('中秋节', 'holiday'));
  check('2026-09-28 假期结束 → null', isHoliday('2026-09-28'), null);
}

/* ---------------- 3. 春节区间单独重点验证 ---------------- */
console.log('\n[3] 春节区间（逐年）');
{
  // prev / next = 紧邻春节区间的前后各一天，期望值同样抄自官方原文
  //   2024: 2/9 除夕官方只「鼓励休息」→ 不是假日；2/18（周日）是调休上班日
  //   2025: 1/27（周一）普通工作日；2/5（周三）普通工作日
  //   2026: 2/14（周六）是调休上班日；2/24（周二）普通工作日
  const spring = {
    2024: { from: '2024-02-10', to: '2024-02-17', len: 8, prev: null, next: info('调休上班', 'workday') },
    2025: { from: '2025-01-28', to: '2025-02-04', len: 8, prev: null, next: null },
    2026: { from: '2026-02-15', to: '2026-02-23', len: 9, prev: info('调休上班', 'workday'), next: null },
  };
  for (const y of YEARS) {
    const { from, to, len, prev, next } = spring[y];
    const days = eachDay(from, to);
    check(`${y} 春节共 ${len} 天`, days.length, len);
    check(`${y} 春节首日 ${from}`, isHoliday(from), info('春节', 'holiday'));
    check(`${y} 春节末日 ${to}`, isHoliday(to), info('春节', 'holiday'));
    check(
      `${y} 春节 ${len} 天全是 restDay`,
      days.every((d) => hol.isRestDay(d) === true),
      true,
    );
    // 前后各一天：既不能算成春节，也不能凭空多出假期
    const prevKey = keyOf(ts(from) - 86400000);
    const nextKey = keyOf(ts(to) + 86400000);
    check(`${y} 春节前一天 ${prevKey} = 官方期望`, isHoliday(prevKey), prev);
    check(`${y} 春节后一天 ${nextKey} = 官方期望`, isHoliday(nextKey), next);
    check(
      `${y} 春节前后一天都不是「春节」`,
      [isHoliday(prevKey), isHoliday(nextKey)].filter((h) => h && h.name === '春节'),
      [],
    );
  }
  // 2024 除夕（2/9）官方只是「鼓励休息」，不是法定假日
  check('2024 除夕 2024-02-09 未被算作节假日', isHoliday('2024-02-09'), null);
  check('2024 除夕 2024-02-09 是周五（工作日）', hol.isRestDay('2024-02-09'), false);
}

/* ---------------- 4. 六大节日逐年都在 ---------------- */
console.log('\n[4] 各年节日齐全（元旦/春节/清明/劳动/端午/中秋/国庆）');
{
  const need = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'];
  for (const y of YEARS) {
    const names = new Set();
    for (let m = 0; m < 12; m++) {
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= last; d++) {
        const h = isHoliday(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        if (h && h.kind === 'holiday') names.add(h.name);
      }
    }
    const missing = need.filter((n) => !names.has(n));
    check(`${y} 年七个节日全部出现`, missing, []);
  }
  // 不该出现官方名单之外的节日名
  const allowed = new Set([...need, '调休上班']);
  const strays = [];
  for (const y of YEARS) {
    for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86400000) {
      const h = isHoliday(keyOf(t));
      if (h && !allowed.has(h.name)) strays.push(`${keyOf(t)}:${h.name}`);
    }
  }
  check('没有官方名单之外的节日名', strays, []);
}

/* ---------------- 5. 调休上班 ---------------- */
console.log('\n[5] 调休上班（kind = workday）');
{
  let totalWork = 0;
  for (const y of YEARS) {
    const plan = OFFICIAL[y];
    const list = plan.workdays.map(([d]) => d);
    totalWork += list.length;

    const wrong = list.filter((d) => {
      const h = isHoliday(d);
      return !h || h.name !== '调休上班' || h.kind !== 'workday';
    });
    check(`${y} 年 ${list.length} 个调休上班日全部 kind='workday'`, wrong, []);

    // 官方原文标注的星期几
    const wdBad = plan.workdays.filter(([d, wd]) => weekdayOf(d) !== wd);
    check(`${y} 调休日星期几与官方原文一致`, wdBad, []);

    // 调休日必须落在周末（这是「调休」的定义）
    const notWeekend = list.filter((d) => !['六', '日'].includes(weekdayOf(d)));
    check(`${y} 调休日全部落在周六/周日`, notWeekend, []);

    // 调休日不是休息日
    check(
      `${y} 调休日 isRestDay = false`,
      list.filter((d) => hol.isRestDay(d) !== false),
      [],
    );
  }
  check('三年调休日合计 = 19 天', totalWork, 19);

  // 假期里的周末仍是休息日（调休只针对被点名的那几天）
  check('2025-10-04（假期内周六）是休息日', hol.isRestDay('2025-10-04'), true);
  check('2025-09-28（调休周日）不是休息日', hol.isRestDay('2025-09-28'), false);
  check('2026-10-10（调休周六）不是休息日', hol.isRestDay('2026-10-10'), false);
}

/* ---------------- 6. 周末 / isRestDay 语义 ---------------- */
console.log('\n[6] isRestDay 语义');
{
  check('普通周六 2026-03-07 = 休息日', hol.isRestDay('2026-03-07'), true);
  check('普通周日 2026-03-08 = 休息日', hol.isRestDay('2026-03-08'), true);
  check('普通周一 2026-03-09 = 工作日', hol.isRestDay('2026-03-09'), false);
  check('2026-03-07 确实是周六', weekdayOf('2026-03-07'), '六');

  // isRestDay 与 getHoliday 不能互相矛盾
  let mismatch = 0;
  for (const y of YEARS) {
    for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86400000) {
      const k = keyOf(t);
      const h = isHoliday(k);
      const rest = hol.isRestDay(k);
      if (h !== null) {
        if (rest !== (h.kind === 'holiday')) mismatch++;
      } else if (rest !== ['六', '日'].includes(weekdayOf(k))) {
        mismatch++;
      }
    }
  }
  check('1096 天里 isRestDay 与 getHoliday 零矛盾', mismatch, 0);
}

/* ---------------- 7. 非法输入安全返回 ---------------- */
console.log('\n[7] 非法 / 异常输入');
{
  const BAD = [
    '', ' ', '   ', 'abc', 'ABC', '2026', '2026-09', '2026-9-25', '2026-09-2',
    '2026-09-255', '20269-25', '2026/09/25', '2026.09.25', '2026-09-25 ',
    ' 2026-09-25', '2026-09-25\n', '\t2026-09-25', '2026-09-25T00:00:00Z',
    '+2026-09-25', '2026-13-45', '2026-13-01', '2026-00-10', '2026-01-00',
    '2026-02-30', '2026-02-29', '2026-04-31', '2026-06-31', '0000-00-00',
    '9999-99-99', '２０２６-０９-２５', '__proto__', 'constructor',
    'toString', 'hasOwnProperty', 'NaN', 'undefined', 'null',
    '1900-01-01', '1999-12-31', '2023-12-31', '2027-01-01', '2030-06-10', '2100-01-01',
    null, undefined, 0, 1, -1, NaN, Infinity, true, false, '', {}, [], [2026, 9, 25],
  ];

  let threw = [];
  let badGet = [];
  let badName = [];
  let badRest = [];

  for (const v of BAD) {
    const label = typeof v === 'string' ? JSON.stringify(v) : String(v);
    try {
      const g = hol.getHoliday(v);
      if (g !== null) badGet.push(`${label} → ${JSON.stringify(g)}`);
    } catch (e) {
      threw.push(`getHoliday(${label}): ${e.message}`);
    }
    try {
      const n = hol.holidayName(v);
      if (n !== null || typeof n === 'string') badName.push(`${label} → ${JSON.stringify(n)}`);
    } catch (e) {
      threw.push(`holidayName(${label}): ${e.message}`);
    }
    try {
      const r = hol.isRestDay(v);
      if (r !== false || typeof r !== 'boolean') badRest.push(`${label} → ${JSON.stringify(r)}`);
    } catch (e) {
      threw.push(`isRestDay(${label}): ${e.message}`);
    }
  }

  check(`全部 ${BAD.length} 个非法输入都不抛异常`, threw, []);
  check('非法输入 getHoliday 一律 null', badGet, []);
  check('非法输入 holidayName 一律 null（不是 undefined/空串）', badName, []);
  check('非法输入 isRestDay 一律 false（不是 undefined）', badRest, []);

  // 无参数调用
  let noArgThrew = '';
  try {
    hol.getHoliday();
    hol.holidayName();
    hol.isRestDay();
  } catch (e) {
    noArgThrew = e.message;
  }
  check('无参数调用不抛异常', noArgThrew, '');

  // 会抛异常的 toString，绝不能去碰
  const evil = { toString() { throw new Error('不许调用我'); } };
  let evilThrew = '';
  try {
    if (hol.getHoliday(evil) !== null) evilThrew = 'getHoliday 没返回 null';
    if (hol.isRestDay(evil) !== false) evilThrew = 'isRestDay 没返回 false';
  } catch (e) {
    evilThrew = e.message;
  }
  check('带恶意 toString 的对象不触发其 toString', evilThrew, '');
}

/* ---------------- 8. 全量遍历 1096 天 ---------------- */
console.log('\n[8] 遍历 2024-01-01 ~ 2026-12-31');
{
  const all = eachDay('2024-01-01', '2026-12-31');
  check('天数 = 1096', all.length, 1096);

  let thrown = [];
  let shapeBad = [];
  let nameBad = [];
  let restBad = [];
  let holidayDays = 0;
  let workDays = 0;

  for (const k of all) {
    let h;
    try {
      h = hol.getHoliday(k);
    } catch (e) {
      thrown.push(`${k}: ${e.message}`);
      continue;
    }
    if (h === undefined) {
      shapeBad.push(`${k}: undefined`);
    } else if (h !== null) {
      if (typeof h.name !== 'string' || h.name === '' || h.name === 'undefined' || h.name === 'null') {
        nameBad.push(`${k}: ${JSON.stringify(h.name)}`);
      }
      if (h.kind !== 'holiday' && h.kind !== 'workday') {
        shapeBad.push(`${k}: kind=${JSON.stringify(h.kind)}`);
      }
      if (h.kind === 'holiday') holidayDays++;
      else workDays++;
    }
    if (hol.holidayName(k) !== (h === null ? null : h.name)) shapeBad.push(`${k}: holidayName 不一致`);
    const r = hol.isRestDay(k);
    if (typeof r !== 'boolean') restBad.push(`${k}: ${JSON.stringify(r)}`);
  }

  check('1096 天调用 getHoliday 零抛错', thrown, []);
  check('1096 天返回值形状全部合法', shapeBad, []);
  check('1096 天没有空/undefined 名字', nameBad, []);
  check('1096 天 isRestDay 全部返回布尔', restBad, []);
  check('放假天数 = 89', holidayDays, 89);
  check('调休上班天数 = 19', workDays, 19);
  check('节假日总数 = 108', holidayDays + workDays, 108);
}

/* ---------------- 9. 无副作用 / 稳定性 ---------------- */
console.log('\n[9] 稳定性与无副作用');
{
  const a = hol.getHoliday('2026-09-25');
  const b = hol.getHoliday('2026-09-25');
  check('同一日期重复查询结果稳定', JSON.stringify(a), JSON.stringify(b));
  check('返回值被冻结（改不动共享对象）', Object.isFrozen(a), true);

  const before = JSON.stringify(a);
  try {
    a.name = '被改了';
    a.kind = 'workday';
  } catch {
    /* 严格模式下会抛，也算安全 */
  }
  check('外部改不动内部数据', JSON.stringify(hol.getHoliday('2026-09-25')), before);

  check('模块没有读取 localStorage', typeof globalThis.localStorage, 'undefined');
  check('模块没有依赖 document', typeof globalThis.document, 'undefined');

  // 先查一个靠后的日期，再查靠前的日期，结果不受顺序影响
  hol.getHoliday('2026-12-31');
  check('查询顺序不影响结果', hol.getHoliday('2024-01-01'), info('元旦', 'holiday'));
  check('2026-12-31 是普通工作日', hol.isRestDay('2026-12-31'), false);
}

/* ---------------- 结果 ---------------- */
console.log(`\n${'─'.repeat(56)}`);
if (fails.length === 0) {
  console.log(`✅ 节假日数据自检全部通过：${pass} 项断言`);
  console.log('   覆盖 2024/2025/2026 三年，共 1096 天');
  console.log('─'.repeat(56));
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f.name}: 期望 ${f.expected}，实际 ${f.actual}`);
  console.log('─'.repeat(56));
  process.exit(1);
}
