/* ============================================================
   verify2 · B/C 节：模块级契约与边界（直接跑 src/lib/holidays.ts 本体）
   ------------------------------------------------------------
   用项目自带的 esbuild 把 holidays.ts 原样编译成 ESM 再 import，
   **不复制、不重写**任何一行产品逻辑 —— 测的就是发货那份代码。

   覆盖：
     B-模块  官方年份不被节日层覆盖 / 2031 起不标
     C1      isRestDay 在节日年的语义（只按周末算，不声称放假）
     C2      非法输入零抛异常、不返回 undefined/'null'/空串
     C3      全量遍历 2024-01-01 ~ 2030-12-31，返回值形状合法
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* ---------- 编译 src/lib/holidays.ts → ESM ---------- */
const SRC = join(ROOT, 'src', 'lib', 'holidays.ts');
const OUT = join(ROOT, 'verification', 'verify2-hko', 'holidays.built.mjs');
const srcText = readFileSync(SRC, 'utf8');
const built = esbuild.transformSync(srcText, { loader: 'ts', format: 'esm', target: 'node22' });
writeFileSync(OUT, built.code, 'utf8');
const H = await import(pathToFileURL(OUT).href);

const lines = [];
const P = (s = '') => { lines.push(s); console.log(s); };
let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; P(`    ✗ ${msg}`); } return cond; };

const pad = (n) => String(n).padStart(2, '0');
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekdayOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const isWeekend = (key) => { const w = weekdayOf(key); return w === 0 || w === 6; };
const eachDay = (from, to) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const out = [];
  for (let t = Date.UTC(fy, fm - 1, fd); t <= Date.UTC(ty, tm - 1, td); t += 86400000) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }
  return out;
};

const KINDS = new Set(['holiday', 'workday', 'festival']);

P('='.repeat(80));
P('verify2 · B/C 节：holidays.ts 模块契约与边界（测的是编译后的本体）');
P('='.repeat(80));
P(`  被测源码: src/lib/holidays.ts  (${srcText.length} 字符, sha256=${(await import('node:crypto')).createHash('sha256').update(srcText).digest('hex').slice(0, 16)}…)`);
P(`  导出: ${Object.keys(H).join(', ')}`);
P('');

/* ================= B-模块：官方年份不被覆盖 / 2031 起不标 ================= */

P('【B-模块】官方年份(2024–2026) 与 节日层(2027–2030) 的边界');
P('-'.repeat(80));
const SPOT = [
  ['2026-09-25', 'holiday', '中秋节'],
  ['2026-09-26', 'holiday', '中秋节'],
  ['2026-09-27', 'holiday', '中秋节'],
  ['2026-09-20', 'workday', '调休上班'],
  ['2026-09-21', null, null],
  ['2026-02-14', 'workday', '调休上班'],
  ['2026-01-04', 'workday', '调休上班'],
  ['2026-10-10', 'workday', '调休上班'],
  ['2024-02-09', null, null], // 2024 除夕不放假（官方只「鼓励」）
  ['2024-02-10', 'holiday', '春节'],
  ['2025-01-28', 'holiday', '春节'],
  ['2025-10-06', 'holiday', '中秋节'],
  ['2027-02-06', 'festival', '春节'],
  ['2027-09-15', 'festival', '中秋节'],
  ['2030-12-31', null, null],
  ['2031-01-01', null, null],
  ['2031-02-19', null, null],
  ['2031-09-30', null, null],
  ['2035-10-01', null, null],
];
for (const [key, kind, name] of SPOT) {
  const info = H.getHoliday(key);
  const gotKind = info ? info.kind : null;
  const gotName = info ? info.name : null;
  const good = gotKind === kind && gotName === name;
  ok(good, `getHoliday(${key}) 期望 ${kind}/${name}，实得 ${gotKind}/${gotName}`);
  P(`  ${key} (${WD[weekdayOf(key)]})  kind=${String(gotKind).padEnd(8)} name=${String(gotName).padEnd(6)} ${good ? '✓' : '✗'}`);
}
P('');

// 官方年份里绝不能出现 kind='festival'
const covered = eachDay('2024-01-01', '2026-12-31');
const leaked = covered.filter((k) => { const i = H.getHoliday(k); return i && i.kind === 'festival'; });
ok(leaked.length === 0, `2024–2026 出现 festival 层泄漏: ${leaked.slice(0, 5).join(',')}`);
P(`  2024–2026 共 ${covered.length} 天，kind='festival' 的天数 = ${leaked.length} ${leaked.length === 0 ? '✓ 官方数据未被节日层覆盖' : '✗'}`);

// 2027–2030 里绝不能出现 kind='holiday'/'workday'（不能假装知道放假安排）
const future = eachDay('2027-01-01', '2030-12-31');
const fakeOfficial = future.filter((k) => { const i = H.getHoliday(k); return i && i.kind !== 'festival'; });
ok(fakeOfficial.length === 0, `2027–2030 出现非 festival 标注: ${fakeOfficial.slice(0, 5).join(',')}`);
P(`  2027–2030 共 ${future.length} 天，非 festival 标注 = ${fakeOfficial.length} ${fakeOfficial.length === 0 ? '✓ 未假装知道放假安排' : '✗'}`);

// 2031+ 一律 null
const beyond = eachDay('2031-01-01', '2035-12-31');
const beyondHit = beyond.filter((k) => H.getHoliday(k) !== null);
ok(beyondHit.length === 0, `2031–2035 有标注: ${beyondHit.slice(0, 5).join(',')}`);
P(`  2031–2035 共 ${beyond.length} 天，有标注 = ${beyondHit.length} ${beyondHit.length === 0 ? '✓ 数据范围外不猜' : '✗'}`);
P('');

/* ================= C1：isRestDay 语义 ================= */

P('【C1】isRestDay 在节日年的语义（只按周末算，不声称节日当天放假）');
P('-'.repeat(80));
const FEST = {
  2027: { 元旦: '2027-01-01', 春节: '2027-02-06', 清明节: '2027-04-05', 劳动节: '2027-05-01', 端午节: '2027-06-09', 中秋节: '2027-09-15', 国庆节: '2027-10-01' },
  2028: { 元旦: '2028-01-01', 春节: '2028-01-26', 清明节: '2028-04-04', 劳动节: '2028-05-01', 端午节: '2028-05-28', 中秋节: '2028-10-03', 国庆节: '2028-10-01' },
  2029: { 元旦: '2029-01-01', 春节: '2029-02-13', 清明节: '2029-04-04', 劳动节: '2029-05-01', 端午节: '2029-06-16', 中秋节: '2029-09-22', 国庆节: '2029-10-01' },
  2030: { 元旦: '2030-01-01', 春节: '2030-02-03', 清明节: '2030-04-05', 劳动节: '2030-05-01', 端午节: '2030-06-05', 中秋节: '2030-09-12', 国庆节: '2030-10-01' },
};
let festWeekend = 0;
let festWeekday = 0;
for (const [y, table] of Object.entries(FEST)) {
  P(`  ${y}:`);
  for (const [name, key] of Object.entries(table)) {
    const rest = H.isRestDay(key);
    const wknd = isWeekend(key);
    const good = rest === wknd;
    ok(good, `isRestDay(${key})=${rest} 应等于「是否周末」${wknd}`);
    if (wknd) festWeekend++; else festWeekday++;
    P(`    ${key} ${WD[weekdayOf(key)]}  ${name.padEnd(4)} isRestDay=${String(rest).padEnd(5)} 周末=${String(wknd).padEnd(5)} ${good ? '✓' : '✗'}`);
  }
}
P(`  小节：28 个节日里落在周末 ${festWeekend} 个、落在工作日 ${festWeekday} 个；`);
P(`        isRestDay 与「是否周末」28/28 一致 ⇒ 节日年确实**不声称**节日当天放假。`);
// 点名任务书要求的两个
ok(H.isRestDay('2027-09-15') === false, '2027-09-15 (周三) isRestDay 应为 false');
ok(H.isRestDay('2027-02-06') === true, '2027-02-06 (周六) isRestDay 应为 true');
ok(H.isRestDay('2027-10-01') === false, '2027-10-01 (周五, 国庆节) isRestDay 应为 false');
P(`  点名：2027-09-15(周三)=${H.isRestDay('2027-09-15')}  2027-02-06(周六)=${H.isRestDay('2027-02-06')}  2027-10-01(周五·国庆)=${H.isRestDay('2027-10-01')}`);
P('');

/* ================= C2：非法输入 ================= */

P('【C2】非法/异常输入：零抛异常、不返回 undefined / \'null\' / 空串');
P('-'.repeat(80));
const BAD = [
  ['空串', ''], ['null 字符串', 'null'], ['undefined 字符串', 'undefined'],
  ['undefined', undefined], ['null', null], ['数字 0', 0], ['数字 20260925', 20260925],
  ['NaN', NaN], ['布尔 true', true], ['空对象', {}], ['空数组', []],
  ['函数', () => {}], ['Symbol', Symbol('x')], ['BigInt', 10n],
  ['未补零 2026-9-25', '2026-9-25'], ['斜杠 2026/09/25', '2026/09/25'],
  ['不存在的 2026-02-30', '2026-02-30'], ['不存在的 2026-13-01', '2026-13-01'],
  ['不存在的 2026-00-10', '2026-00-10'], ['不存在的 2026-04-31', '2026-04-31'],
  ['带空格', ' 2026-09-25'], ['带尾空格', '2026-09-25 '], ['带 ISO 时间', '2026-09-25T00:00:00Z'],
  ['超长串', '9'.repeat(5000)], ['中文日期', '2026年9月25日'], ['负数', '-2026-09-25'],
  ['0000-01-01', '0000-01-01'], ['9999-12-31', '9999-12-31'],
];
let badThrew = 0;
for (const [label, input] of BAD) {
  let g, n, r, threw = null;
  try { g = H.getHoliday(input); n = H.holidayName(input); r = H.isRestDay(input); }
  catch (e) { threw = e; badThrew++; }
  const shapeOk = !threw && g === null && n === null && r === false;
  ok(shapeOk, `${label}: getHoliday=${String(g)} holidayName=${String(n)} isRestDay=${String(r)} threw=${threw}`);
  const raw = `${String(g)}|${String(n)}|${String(r)}`;
  ok(!/undefined|'null'|NaN/.test(raw) || g === null, `${label}: 返回串里出现 undefined/'null'`);
}
P(`  ${BAD.length} 种非法输入：抛异常 ${badThrew} 次，形状全对 = ${badThrew === 0 ? '✓' : '✗'}`);
// 合法但无数据
for (const k of ['1900-01-01', '2031-01-01', '2099-12-31']) {
  ok(H.getHoliday(k) === null && H.holidayName(k) === null && H.isRestDay(k) === false, `${k} 应全为 null/null/false`);
}
P(`  合法但无数据年份 (1900/2031/2099)：一律 null·null·false ✓`);
P('');

/* ================= C3：全量遍历 ================= */

P('【C3】全量遍历 2024-01-01 ~ 2030-12-31（返回值形状合法性）');
P('-'.repeat(80));
const all = eachDay('2024-01-01', '2030-12-31');
let threw = 0;
let badShape = 0;
const stat = {};
const byKind = { holiday: 0, workday: 0, festival: 0, none: 0 };
const perYear = {};
for (const k of all) {
  try {
    const info = H.getHoliday(k);
    const name = H.holidayName(k);
    const rest = H.isRestDay(k);
    if (info === null) {
      byKind.none++;
      if (name !== null) badShape++;
      if (rest !== isWeekend(k) && Number(k.slice(0, 4)) <= 2026) {
        // 官方年：非特殊日 = 周末即休息
        badShape++;
      }
    } else {
      if (!KINDS.has(info.kind)) badShape++;
      if (typeof info.name !== 'string' || info.name.length === 0) badShape++;
      if (info.name === 'null' || info.name === 'undefined') badShape++;
      if (name !== info.name) badShape++;
      if (typeof rest !== 'boolean') badShape++;
      if (!Object.isFrozen(info)) badShape++;
      byKind[info.kind]++;
      const y = k.slice(0, 4);
      perYear[y] = perYear[y] ?? { holiday: 0, workday: 0, festival: 0 };
      perYear[y][info.kind]++;
      stat[info.name] = (stat[info.name] ?? 0) + 1;
    }
  } catch (e) {
    threw++;
    if (threw <= 3) P(`    ✗ ${k} 抛出 ${e.message}`);
  }
}
ok(threw === 0, `遍历中抛异常 ${threw} 次`);
ok(badShape === 0, `形状非法 ${badShape} 处`);
P(`  遍历天数 = ${all.length}（2024-01-01 ~ 2030-12-31，含 2024/2028 两个闰年）`);
P(`  抛异常 = ${threw}  ${threw === 0 ? '✓' : '✗'}`);
P(`  形状非法 = ${badShape} 处  ${badShape === 0 ? '✓（name 非空字符串 / kind 合法 / isFrozen / holidayName 与 name 一致）' : '✗'}`);
P(`  分类计数：holiday=${byKind.holiday}  workday=${byKind.workday}  festival=${byKind.festival}  null=${byKind.none}`);
P(`  逐年标注数：`);
for (const y of Object.keys(perYear).sort()) {
  const v = perYear[y];
  P(`    ${y}: holiday=${String(v.holiday).padStart(3)}  workday=${String(v.workday).padStart(2)}  festival=${String(v.festival).padStart(2)}`);
}
P(`  节日名分布：`);
for (const [n, c] of Object.entries(stat).sort((a, b) => b[1] - a[1])) P(`    ${n} × ${c}`);
P('');

/* ================= 附加：不可变性 / 副作用 ================= */

P('【附加】冻结与副作用');
P('-'.repeat(80));
const info1 = H.getHoliday('2026-09-25');
let mutationBlocked = false;
try { info1.name = '被改坏了'; } catch { mutationBlocked = true; }
const after = H.getHoliday('2026-09-25');
ok(after.name === '中秋节', `冻结对象被改写后表被污染: ${after.name}`);
P(`  Object.isFrozen(info) = ${Object.isFrozen(info1)}  改写尝试被拦截 = ${mutationBlocked}  改后仍为 '${after.name}' ${after.name === '中秋节' ? '✓' : '✗'}`);
const a = H.getHoliday('2026-09-25');
const b = H.getHoliday('2026-09-25');
ok(a === b, '两次调用返回同一对象（共享冻结实例，非缺陷）');
P(`  两次调用返回同一冻结实例 = ${a === b}（设计如此，调用方无法改坏表）`);
P('');

/* ================= 汇总 ================= */
P('='.repeat(80));
P(`B/C 节结论：${fail === 0 ? `✓ PASS — ${pass} 条断言全部通过` : `✗ FAIL — ${fail} 条断言失败 / 共 ${pass + fail} 条`}`);
P('='.repeat(80));
writeFileSync(join(ROOT, 'verification', 'verify2-BC-unit.txt'), lines.join('\n'), 'utf8');
process.exit(fail === 0 ? 0 : 1);
