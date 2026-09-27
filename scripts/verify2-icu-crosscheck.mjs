/* ============================================================
   verify2 · A 节交叉印证：用 ICU 的中国农历（Intl）复核天文台历表
   ------------------------------------------------------------
   动机：只靠香港天文台一个来源，万一我解析错了也无从发现。
   这里换一条**完全不同**的实现路径：
     Node 22 自带 full-icu，`Intl.DateTimeFormat('…-u-ca-chinese')`
     走的是 ICU 内建的 Chinese calendar 算法，与 HKO 的表格数据独立。
   两边对 正月初一 / 五月初五 / 八月十五 必须给同一天。
   （清明是节气，ICU 不直接提供，本脚本不覆盖 —— 由 A 节官方数据 + 表内
     「節氣」列两路印证。）
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const derived = JSON.parse(readFileSync(join(ROOT, 'verification', 'verify2-hko', 'derived.json'), 'utf8'));

const pad = (n) => String(n).padStart(2, '0');
const fmt = new Intl.DateTimeFormat('en-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric' });

const lines = [];
const P = (s = '') => { lines.push(s); console.log(s); };

P('='.repeat(78));
P('verify2 · A 节交叉印证：ICU 中国农历(Intl) vs 香港天文台历表');
P('='.repeat(78));
P(`  ICU 解析器: ${fmt.resolvedOptions().locale} / calendar=${fmt.resolvedOptions().calendar}`);
P('');

/* 遍历每一天，取 ICU 的农历 (月, 日) */
function icuScan(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  const hits = []; // {key, month, day, leap}
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86400000) {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const parts = fmt.formatToParts(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)));
    const get = (tp) => parts.find((p) => p.type === tp)?.value ?? '';
    const monthRaw = get('month');
    const leap = /bis|閏|闰/i.test(monthRaw);
    const month = Number(String(monthRaw).replace(/[^\d]/g, ''));
    const day = Number(get('day'));
    hits.push({ key, month, day, leap, monthRaw });
  }
  return hits;
}

const all = icuScan('2024-01-01', '2031-12-31');

function icuFind(month, day) {
  return all.filter((h) => h.month === month && h.day === day && !h.leap).map((h) => h.key);
}

const CASES = [
  { name: '春节', lunar: '正月初一', month: 1, day: 1 },
  { name: '端午节', lunar: '五月初五', month: 5, day: 5 },
  { name: '中秋节', lunar: '八月十五', month: 8, day: 15 },
];

let fail = 0;
let total = 0;

P('【1】ICU 结果 vs 天文台推导（2027–2030，holidays.ts 覆盖段）');
P('-'.repeat(78));
for (const y of [2027, 2028, 2029, 2030]) {
  const hko = derived.parsed[y].derived;
  for (const c of CASES) {
    const inYear = icuFind(c.month, c.day).filter((k) => k.startsWith(String(y)));
    const icuDay = inYear.length === 1 ? inYear[0] : (inYear.length === 0 ? '(ICU未找到)' : `(ICU多个:${inYear.join(',')})`);
    const want = hko[c.name];
    total++;
    const ok = icuDay === want;
    if (!ok) fail++;
    P(`  ${y} ${c.name.padEnd(4)}(${c.lunar})  ICU=${icuDay}  HKO推导=${want}  ${ok ? '✓' : '✗★不一致'}`);
  }
}
P('');
P('【2】ICU 结果 vs 官方已知年份（2024–2026）——三方印证');
P('-'.repeat(78));
const OFFICIAL = {
  2024: { 春节: '2024-02-10', 端午节: '2024-06-10', 中秋节: '2024-09-17' },
  2025: { 春节: '2025-01-29', 端午节: '2025-05-31', 中秋节: '2025-10-06' },
  2026: { 春节: '2026-02-17', 端午节: '2026-06-19', 中秋节: '2026-09-25' },
};
for (const y of [2024, 2025, 2026]) {
  for (const c of CASES) {
    const inYear = icuFind(c.month, c.day).filter((k) => k.startsWith(String(y)));
    const icuDay = inYear.length === 1 ? inYear[0] : `(ICU多个/缺失:${inYear.join(',') || '无'})`;
    const want = OFFICIAL[y][c.name];
    const hko = derived.parsed[y].derived[c.name];
    total++;
    const ok = icuDay === want && hko === want;
    if (!ok) fail++;
    P(`  ${y} ${c.name.padEnd(4)}  官方=${want}  ICU=${icuDay}  HKO推导=${hko}  ${ok ? '✓ 三方一致' : '✗★不一致'}`);
  }
}

P('');
P('【3】越界年份（2031）三方对照 —— 源码这里故意留空');
P('-'.repeat(78));
for (const c of CASES) {
  const inYear = icuFind(c.month, c.day).filter((k) => k.startsWith('2031'));
  P(`  2031 ${c.name.padEnd(4)} ICU=${inYear.join(',') || '(无)'}  HKO=${derived.parsed[2031].derived[c.name] ?? '(无)'}  holidays.ts=(不收录)`);
}

P('');
P('【4】ICU 闰月识别自检（确认上面过滤掉的是真闰月）');
P('-'.repeat(78));
for (const y of [2025, 2028, 2031]) {
  const leaps = all.filter((h) => h.leap && h.key.startsWith(String(y)));
  const uniq = [...new Set(leaps.map((h) => h.monthRaw))];
  P(`  ${y} 闰月标记 = ${uniq.join(', ') || '(无)'}   闰月天数=${leaps.length}`);
  if (leaps.length) P(`        首个闰月日 = ${leaps[0].key}`);
}

P('');
P('='.repeat(78));
P(`A 节交叉印证结论：${fail === 0 ? `✓ PASS — ${total}/${total} 条 ICU / HKO / 官方 三方一致` : `✗ FAIL — ${fail}/${total} 条不一致`}`);
P('='.repeat(78));

writeFileSync(join(ROOT, 'verification', 'verify2-A2-icu-crosscheck.txt'), lines.join('\n'), 'utf8');
process.exit(fail === 0 ? 0 : 1);
