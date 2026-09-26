/* ============================================================
   独立验证 · 第 2 步：节假日模块行为核对
   ------------------------------------------------------------
   立场：我是验证者，不是作者。本脚本不 import 作者的
   scripts/check-holidays.mjs，期望值也不是从它抄的 ——
   而是我自己抓取 gov.cn 原文（存 verification/raw/）后逐条手抄，
   农历部分另用香港天文台历表独立推导（见 verify-sources.mjs 输出）。

   编译真实 src/lib/holidays.ts 后跑断言：测的是真代码。

   运行：node scripts/verify-holidays.mjs
   ============================================================ */

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, '.tmp');
const outFile = join(outDir, 'verify-holidays-built.mjs');

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

/* ---------------- 迷你断言框架（自己写，不复用作者的） ---------------- */
let pass = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? '  [' + detail + ']' : ''}`);
  } else {
    fails.push(name);
    console.log(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`);
  }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name, a === e, a === e ? `=${e}` : `期望 ${e} 实际 ${a}`);
}

/* ---------------- 我自己的日期工具（独立实现） ---------------- */
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const ts = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const wdOf = (k) => WD[new Date(ts(k)).getUTCDay()];
const keyOf = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; };
function eachDay(from, to) { const o = []; for (let t = ts(from); t <= ts(to); t += 86400000) o.push(keyOf(t)); return o; }

/* ============================================================
   期望值：我从 verification/raw/gov-YYYY.htm 原文逐条手抄
   原文（2026，国办发明电〔2025〕7号）：
     一、元旦：1月1日（周四）至3日（周六）放假调休，共3天。1月4日（周日）上班。
     二、春节：2月15日（农历腊月二十八、周日）至23日（农历正月初七、周一）放假调休，共9天。
              2月14日（周六）、2月28日（周六）上班。
     三、清明节：4月4日（周六）至6日（周一）放假，共3天。
     四、劳动节：5月1日（周五）至5日（周二）放假调休，共5天。5月9日（周六）上班。
     五、端午节：6月19日（周五）至21日（周日）放假，共3天。
     六、中秋节：9月25日（周五）至27日（周日）放假，共3天。
     七、国庆节：10月1日（周四）至7日（周三）放假调休，共7天。
              9月20日（周日）、10月10日（周六）上班。
   ============================================================ */
const OFFICIAL = {
  2024: {
    ranges: [
      ['元旦', '2024-01-01', '2024-01-01'],
      ['春节', '2024-02-10', '2024-02-17'],
      ['清明节', '2024-04-04', '2024-04-06'],
      ['劳动节', '2024-05-01', '2024-05-05'],
      ['端午节', '2024-06-10', '2024-06-10'],
      ['中秋节', '2024-09-15', '2024-09-17'],
      ['国庆节', '2024-10-01', '2024-10-07'],
    ],
    // 原文点名「上班」的日子 + 原文标注的星期
    workdays: [['2024-02-04', '日'], ['2024-02-18', '日'], ['2024-04-07', '日'],
               ['2024-04-28', '日'], ['2024-05-11', '六'], ['2024-09-14', '六'],
               ['2024-09-29', '日'], ['2024-10-12', '六']],
  },
  2025: {
    ranges: [
      ['元旦', '2025-01-01', '2025-01-01'],
      ['春节', '2025-01-28', '2025-02-04'],
      ['清明节', '2025-04-04', '2025-04-06'],
      ['劳动节', '2025-05-01', '2025-05-05'],
      ['端午节', '2025-05-31', '2025-06-02'],
      // 原文合写「国庆节、中秋节：10月1日（周三）至8日（周三）放假调休，共8天」
      ['国庆节', '2025-10-01', '2025-10-08'],
    ],
    workdays: [['2025-01-26', '日'], ['2025-02-08', '六'], ['2025-04-27', '日'],
               ['2025-09-28', '日'], ['2025-10-11', '六']],
  },
  2026: {
    ranges: [
      ['元旦', '2026-01-01', '2026-01-03'],
      ['春节', '2026-02-15', '2026-02-23'],
      ['清明节', '2026-04-04', '2026-04-06'],
      ['劳动节', '2026-05-01', '2026-05-05'],
      ['端午节', '2026-06-19', '2026-06-21'],
      ['中秋节', '2026-09-25', '2026-09-27'],
      ['国庆节', '2026-10-01', '2026-10-07'],
    ],
    workdays: [['2026-01-04', '日'], ['2026-02-14', '六'], ['2026-02-28', '六'],
               ['2026-05-09', '六'], ['2026-09-20', '日'], ['2026-10-10', '六']],
  },
};

/* 原文里显式标注的「周X」，用来独立校验我自己的日历算术 */
const OFFICIAL_WEEKDAYS = [
  // 2026
  ['2026-01-01', '四'], ['2026-01-03', '六'], ['2026-01-04', '日'],
  ['2026-02-15', '日'], ['2026-02-23', '一'], ['2026-02-14', '六'], ['2026-02-28', '六'],
  ['2026-04-04', '六'], ['2026-04-06', '一'],
  ['2026-05-01', '五'], ['2026-05-05', '二'], ['2026-05-09', '六'],
  ['2026-06-19', '五'], ['2026-06-21', '日'],
  ['2026-09-25', '五'], ['2026-09-27', '日'],
  ['2026-10-01', '四'], ['2026-10-07', '三'], ['2026-09-20', '日'], ['2026-10-10', '六'],
  // 2025
  ['2025-01-01', '三'], ['2025-01-28', '二'], ['2025-02-04', '二'],
  ['2025-01-26', '日'], ['2025-02-08', '六'],
  ['2025-04-04', '五'], ['2025-04-06', '日'], ['2025-04-27', '日'],
  ['2025-05-01', '四'], ['2025-05-05', '一'],
  ['2025-05-31', '六'], ['2025-06-02', '一'],
  ['2025-10-01', '三'], ['2025-10-08', '三'], ['2025-09-28', '日'], ['2025-10-11', '六'],
];

const YEARS = [2024, 2025, 2026];
const H = (name, kind) => ({ name, kind });

/* ============================================================ */
console.log('\n' + '='.repeat(72));
console.log('A1. 核心命题：2026-09-25 是不是中秋节');
console.log('='.repeat(72));
{
  eq('2026-09-25 getHoliday', hol.getHoliday('2026-09-25'), H('中秋节', 'holiday'));
  eq('2026-09-25 holidayName', hol.holidayName('2026-09-25'), '中秋节');
  eq('2026-09-25 isRestDay', hol.isRestDay('2026-09-25'), true);
  eq('2026-09-25 确实是周五（原文标注周五）', wdOf('2026-09-25'), '五');
  // 中秋节放假 9/25–9/27 三天，整段都要是 holiday
  eq('2026-09-24（前一天）不是节日', hol.getHoliday('2026-09-24'), null);
  eq('2026-09-28（后一天）不是节日', hol.getHoliday('2026-09-28'), null);
  eq('假期三天 9/25-9/27 都是 holiday',
    ['2026-09-25', '2026-09-26', '2026-09-27'].map((k) => hol.getHoliday(k)?.name),
    ['中秋节', '中秋节', '中秋节']);
}

console.log('\n' + '='.repeat(72));
console.log('A2. 指定抽查日（用户点名要核的）');
console.log('='.repeat(72));
{
  eq('2025-10-01 国庆节', hol.getHoliday('2025-10-01'), H('国庆节', 'holiday'));
  eq('2025-01-01 元旦', hol.getHoliday('2025-01-01'), H('元旦', 'holiday'));
  eq('2025 春节首日 2025-01-28', hol.getHoliday('2025-01-28'), H('春节', 'holiday'));
  eq('2025 春节末日 2025-02-04', hol.getHoliday('2025-02-04'), H('春节', 'holiday'));
  eq('2025 春节天数', eachDay('2025-01-28', '2025-02-04').length, 8);
  eq('2025 端午首日 2025-05-31', hol.getHoliday('2025-05-31'), H('端午节', 'holiday'));
  eq('2025 端午末日 2025-06-02', hol.getHoliday('2025-06-02'), H('端午节', 'holiday'));
  eq('2025 清明首日 2025-04-04', hol.getHoliday('2025-04-04'), H('清明节', 'holiday'));
  eq('2025 清明末日 2025-04-06', hol.getHoliday('2025-04-06'), H('清明节', 'holiday'));
  eq('2025 劳动节首日 2025-05-01', hol.getHoliday('2025-05-01'), H('劳动节', 'holiday'));
  eq('2025 劳动节末日 2025-05-05', hol.getHoliday('2025-05-05'), H('劳动节', 'holiday'));
  // 香港天文台推导：八月初一 2025-09-22 +14 = 2025-10-06
  eq('2025-10-06 中秋节（HKO 八月初一+14）', hol.getHoliday('2025-10-06'), H('中秋节', 'holiday'));
  eq('2025-10-07 又是国庆节', hol.getHoliday('2025-10-07'), H('国庆节', 'holiday'));
  eq('2025-10-08 国庆节末日', hol.getHoliday('2025-10-08'), H('国庆节', 'holiday'));
  eq('2025 国庆+中秋 8 天假期逐日非空',
    eachDay('2025-10-01', '2025-10-08').filter((k) => hol.getHoliday(k) === null), []);
}

console.log('\n' + '='.repeat(72));
console.log('A3. 官方星期标注 vs 我独立算的星期（查日期串行/抄错）');
console.log('='.repeat(72));
{
  const bad = OFFICIAL_WEEKDAYS.filter(([k, wd]) => wdOf(k) !== wd)
    .map(([k, wd]) => `${k} 原文周${wd} 实算周${wdOf(k)}`);
  eq(`原文 ${OFFICIAL_WEEKDAYS.length} 处星期标注全部自洽`, bad, []);
}

console.log('\n' + '='.repeat(72));
console.log('A4. 官方放假区间逐日核对 + 每年天数合计');
console.log('='.repeat(72));
{
  let grand = 0;
  const perYear = {};
  for (const y of YEARS) {
    let n = 0;
    for (const [name, from, to] of OFFICIAL[y].ranges) {
      const days = eachDay(from, to);
      n += days.length;
      const bad = days.filter((d) => {
        const h = hol.getHoliday(d);
        if (!h) return true;
        if (h.kind !== 'holiday') return true;
        // 2025 国庆中秋合写：10-06 模块显示「中秋节」而非「国庆节」，属既定展示口径，
        // 这里只要求「名称属于该假期块允许的集合」
        const allowedNames = name === '国庆节' && y === 2025 ? ['国庆节', '中秋节'] : [name];
        return !allowedNames.includes(h.name);
      });
      ok(`${y} ${name} ${from}~${to} (${days.length}天) 逐日核对`, bad.length === 0,
        bad.length ? `不符: ${bad.join(',')}` : `${days.length} 天全部 holiday`);
    }
    perYear[y] = n;
    grand += n;
  }
  eq('2024 放假日合计（原文 1+8+3+5+1+3+7）', perYear[2024], 28);
  eq('2025 放假日合计（原文 1+8+3+5+3+8）', perYear[2025], 28);
  eq('2026 放假日合计（原文 3+9+3+5+3+3+7）', perYear[2026], 33);
  eq('三年放假日合计', grand, 89);
}

console.log('\n' + '='.repeat(72));
console.log('A5. 调休上班日 kind === "workday"');
console.log('='.repeat(72));
{
  let n = 0;
  for (const y of YEARS) {
    const list = OFFICIAL[y].workdays;
    n += list.length;
    const bad = list.filter(([d]) => {
      const h = hol.getHoliday(d);
      return !h || h.kind !== 'workday';
    }).map(([d]) => d);
    ok(`${y} 年 ${list.length} 个调休日 kind 全为 workday`, bad.length === 0, bad.join(',') || 'OK');

    const wdBad = list.filter(([d, wd]) => wdOf(d) !== wd).map(([d]) => d);
    eq(`${y} 调休日星期与原文一致`, wdBad, []);

    const notWeekend = list.filter(([d]) => !['六', '日'].includes(wdOf(d))).map(([d]) => d);
    eq(`${y} 调休日全部落在周六/周日`, notWeekend, []);

    const restBad = list.filter(([d]) => hol.isRestDay(d) !== false).map(([d]) => d);
    eq(`${y} 调休日 isRestDay 必须为 false`, restBad, []);
  }
  eq('三年调休日合计（8+5+6）', n, 19);
  eq('调休日显示名固定为「调休上班」', hol.holidayName('2026-09-20'), '调休上班');
}

console.log('\n' + '='.repeat(72));
console.log('A6. 我加的独立不变量（作者脚本没查的）');
console.log('='.repeat(72));
{
  // (a) 任何一天不能被「假期区间」和「调休上班日」同时命中——Map.set 后写会覆盖，
  //     真出这种事会静默吞掉一个假期
  const collisions = [];
  for (const y of YEARS) {
    const inRange = new Set();
    for (const [, from, to] of OFFICIAL[y].ranges) for (const d of eachDay(from, to)) inRange.add(d);
    for (const [d] of OFFICIAL[y].workdays) if (inRange.has(d)) collisions.push(d);
  }
  eq('「假期区间」与「调休上班日」零重叠（无静默覆盖）', collisions, []);

  // (b) 同一年内两个假期区间不能重叠
  const overlaps = [];
  for (const y of YEARS) {
    const rs = OFFICIAL[y].ranges;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = new Set(eachDay(rs[i][1], rs[i][2]));
        for (const d of eachDay(rs[j][1], rs[j][2])) if (a.has(d)) overlaps.push(`${d} ${rs[i][0]}/${rs[j][0]}`);
      }
    }
  }
  eq('同年假期区间互不重叠', overlaps, []);

  // (c) 区间的首尾必须 <= 且是真实存在的日子（闰年/大小月不越界）
  const badRanges = [];
  for (const y of YEARS) for (const [name, from, to] of OFFICIAL[y].ranges) {
    if (!(ts(from) <= ts(to))) badRanges.push(`${y} ${name} 首>尾`);
    if (Number.isNaN(ts(from)) || Number.isNaN(ts(to))) badRanges.push(`${y} ${name} 非法日期`);
  }
  eq('所有区间首 <= 尾且日期真实存在', badRanges, []);

  // (d) 覆盖年份内「有数据的日子」总数 = 89 + 19
  let withData = 0;
  for (const y of YEARS) for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86400000) {
    if (hol.getHoliday(keyOf(t)) !== null) withData++;
  }
  eq('三年内有节假/调休数据的日子总数', withData, 108);

  // (e) isRestDay 与 getHoliday 全量一致（1096 天）
  let mismatch = [];
  for (const y of YEARS) for (let t = Date.UTC(y, 0, 1); t <= Date.UTC(y, 11, 31); t += 86400000) {
    const k = keyOf(t), h = hol.getHoliday(k), r = hol.isRestDay(k);
    const want = h !== null ? h.kind === 'holiday' : ['六', '日'].includes(wdOf(k));
    if (r !== want) mismatch.push(k);
  }
  eq('1096 天 isRestDay 与 getHoliday 零矛盾', mismatch, []);

  // (f) 返回对象不得被外部改坏（冻结）
  const a = hol.getHoliday('2026-09-25');
  try { a.name = 'X'; a.kind = 'workday'; } catch { /* 严格模式抛错也算安全 */ }
  eq('返回值冻结，外部改不动', hol.getHoliday('2026-09-25'), H('中秋节', 'holiday'));
}

console.log('\n' + '='.repeat(72));
console.log('A7. 非法输入：不抛异常、不返回 undefined / "null" 字符串');
console.log('='.repeat(72));
{
  const BAD = [null, undefined, '', ' ', '2026-13-45', '2026-02-30', '2026-9-25',
    '2026/09/25', '2026-09-25 ', '2026-09-25T00:00:00Z', 'null', 'undefined',
    'NaN', '__proto__', 'constructor', '２０２６-０９-２５', 0, 1, NaN, Infinity,
    true, false, {}, [], [2026, 9, 25], '2026', '2026-09', '0000-00-00', '9999-99-99'];
  const YEARS_OUT = ['2023-12-31', '2027-01-01', '2030-06-10', '2100-01-01', '1900-01-01'];

  const threw = [], badGet = [], badName = [], badRest = [];
  for (const v of [...BAD, ...YEARS_OUT]) {
    const lbl = typeof v === 'string' ? JSON.stringify(v) : String(v);
    const isOutYear = typeof v === 'string' && YEARS_OUT.includes(v);
    try {
      const g = hol.getHoliday(v);
      if (isOutYear ? g !== null : g !== null) badGet.push(`${lbl} → ${JSON.stringify(g)}`);
      if (g === undefined) badGet.push(`${lbl} → undefined(未定义!)`);
    } catch (e) { threw.push(`getHoliday(${lbl}): ${e.message}`); }
    try {
      const n = hol.holidayName(v);
      if (n !== null) badName.push(`${lbl} → ${JSON.stringify(n)}`);
    } catch (e) { threw.push(`holidayName(${lbl}): ${e.message}`); }
    try {
      const r = hol.isRestDay(v);
      if (r !== false) badRest.push(`${lbl} → ${JSON.stringify(r)}`);
    } catch (e) { threw.push(`isRestDay(${lbl}): ${e.message}`); }
  }
  ok(`全部 ${BAD.length + YEARS_OUT.length} 个坏输入零抛异常`, threw.length === 0, threw.slice(0, 3).join(' | ') || 'OK');
  eq('坏输入 getHoliday 一律 null', badGet, []);
  eq('坏输入 holidayName 一律 null（非 undefined/空串）', badName, []);
  eq('坏输入 isRestDay 一律 false（非 undefined）', badRest, []);

  // 未知年份但格式合法：必须是 null，不能是 undefined，也不能瞎猜
  for (const y of [2023, 2027, 2030, 2100]) {
    eq(`未知年份 ${y} 返回 null（不猜）`, hol.getHoliday(`${y}-06-15`), null);
  }
  eq('未知年份 isRestDay 返回 false（不猜）', hol.isRestDay('2027-06-15'), false);

  // 返回值类型严格性
  eq('getHoliday 返回 null 而非 undefined', hol.getHoliday('nope') === null, true);
  eq('holidayName 返回 null 而非 "null" 字符串', hol.holidayName('nope') === null, true);
  eq('isRestDay 返回 false 而非 undefined', hol.isRestDay('nope') === false, true);

  // 无参调用
  let noArg = '';
  try { hol.getHoliday(); hol.holidayName(); hol.isRestDay(); } catch (e) { noArg = e.message; }
  eq('无参数调用不抛异常', noArg, '');

  // 会抛异常的 toString 对象：绝不能去碰它
  const evil = { toString() { throw new Error('不该调用我'); } };
  let evilErr = '';
  try { hol.getHoliday(evil); hol.isRestDay(evil); hol.holidayName(evil); }
  catch (e) { evilErr = e.message; }
  eq('恶意 toString 对象不触发 toString', evilErr, '');
}

console.log('\n' + '='.repeat(72));
console.log('A8. 全量遍历 2024-01-01 ~ 2026-12-31（1096 天）');
console.log('='.repeat(72));
{
  const all = eachDay('2024-01-01', '2026-12-31');
  eq('天数', all.length, 1096);
  const thrown = [], shape = [], nameBad = [], restBad = [];
  let hol7 = 0, work = 0;
  for (const k of all) {
    let h;
    try { h = hol.getHoliday(k); } catch (e) { thrown.push(k); continue; }
    if (h === undefined) shape.push(`${k}:undefined`);
    else if (h !== null) {
      if (typeof h.name !== 'string' || h.name === '' || h.name === 'undefined' || h.name === 'null')
        nameBad.push(`${k}:${JSON.stringify(h.name)}`);
      if (h.kind !== 'holiday' && h.kind !== 'workday') shape.push(`${k}:kind=${h.kind}`);
      h.kind === 'holiday' ? hol7++ : work++;
    }
    if (hol.holidayName(k) !== (h === null ? null : h.name)) shape.push(`${k}:holidayName 不一致`);
    if (typeof hol.isRestDay(k) !== 'boolean') restBad.push(k);
  }
  eq('零抛错', thrown, []);
  eq('返回值形状全部合法', shape, []);
  eq('没有空/undefined/null 名字', nameBad, []);
  eq('isRestDay 全返回布尔', restBad, []);
  eq('放假日数', hol7, 89);
  eq('调休日数', work, 19);
}

/* ---------------- 结果 ---------------- */
console.log('\n' + '─'.repeat(72));
if (fails.length === 0) {
  console.log(`✅ 独立节假日核对全部通过：${pass} 项断言，0 失败`);
  console.log('─'.repeat(72));
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log('   · ' + f);
  console.log('─'.repeat(72));
  process.exit(1);
}
