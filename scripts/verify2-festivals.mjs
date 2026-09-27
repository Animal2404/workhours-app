/* ============================================================
   verify2 · 独立复核 A：农历推导 vs src/lib/holidays.ts FESTIVALS
   ------------------------------------------------------------
   本脚本由 verifier2 独立编写，**不引用** scripts/derive-festivals.mjs。
   数据源：香港天文台《公曆與農曆日期對照表》T{year}c.txt
           （已由 pwsh 下载到 verification/verify2-hko/，本脚本只读本地副本，
             同时记录 URL 与文件 sha256 以便溯源）

   表格格式（实测）：
     2027年2月6日          正月        星期六
     2027年1月5日          廿八        星期二      小寒
   即：農曆月名只出现在「初一」那一行；節氣名在第 4 列。

   推导规则（holidays.ts 头注释所声明的那套）：
     春节 = 正月初一 ／ 端午 = 五月初一 + 4 ／ 中秋 = 八月初一 + 14
     清明 = 表中標「清明」那天 ／ 元旦·劳动节·国庆节 = 固定 1/1、5/1、10/1

   两步走：
     [1] 反向验证：2024–2026 官方数据 → 检查这套推导是否逐日吻合
     [2] 正向比对：2027–2030 推导结果 → 与 FESTIVALS 表逐条比对
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const HKO_DIR = join(ROOT, 'verification', 'verify2-hko');

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031];

/* ---------- 0. 从源码里解析出实际发货的 FESTIVALS 表 ---------- */

function parseFestivalsFromSource() {
  const src = readFileSync(join(ROOT, 'src', 'lib', 'holidays.ts'), 'utf8');
  const block = /const FESTIVALS[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error('没能在 holidays.ts 里定位 FESTIVALS 表');
  const out = {};
  for (const ym of block[1].matchAll(/(\d{4}):\s*\{([^}]*)\}/g)) {
    const year = Number(ym[1]);
    out[year] = {};
    // 键可能是 '元旦' 也可能是不带引号的裸标识符 元旦（TS 里两者都合法）
    for (const p of ym[2].matchAll(/(?:'([^']+)'|([^\s'{}:,]+))\s*:\s*'([^']+)'/g)) {
      out[year][p[1] ?? p[2]] = p[3];
    }
  }
  return out;
}

/* ---------- 1. 解析天文台对照表 ---------- */

const LUNAR_MONTH_RE = /^(閏)?(正|二|三|四|五|六|七|八|九|十|十一|十二)月$/;
const LINE_RE = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s+星期(.)(?:\s+(\S+))?\s*$/;

const pad = (n) => String(n).padStart(2, '0');
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

function parseHko(year) {
  const file = join(HKO_DIR, `T${year}c.txt`);
  if (!existsSync(file)) return { year, error: `缺少 ${file}` };
  const buf = readFileSync(file);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const text = buf.toString('utf8');

  const rows = [];
  let bad = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) {
      // 表头 / 空行不算异常；只统计「看起来像数据行但解析失败」的
      if (/^\d{4}年/.test(line)) bad++;
      continue;
    }
    const [, y, mo, d, lunar, weekday, term] = m;
    rows.push({
      key: `${y}-${pad(mo)}-${pad(d)}`,
      y: Number(y),
      lunar,
      weekday,
      term: term ?? '',
    });
  }

  // 一致性：天数 / 星期与公历是否自洽
  const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  let weekdayMismatch = 0;
  for (const r of rows) {
    const [yy, mm, dd] = r.key.split('-').map(Number);
    if (WD[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()] !== r.weekday) weekdayMismatch++;
  }

  // 列出所有「月首」行 → 可看出闰月（閏X月）
  const monthHeads = rows
    .filter((r) => LUNAR_MONTH_RE.test(r.lunar))
    .map((r) => ({ key: r.key, lunar: r.lunar }));

  const first = (name) => monthHeads.find((h) => h.lunar === name);

  const derived = { 元旦: `${year}-01-01`, 劳动节: `${year}-05-01`, 国庆节: `${year}-10-01` };
  const trace = {};
  const zheng = first('正月');
  if (zheng) { derived.春节 = zheng.key; trace.春节 = `正月初一 = ${zheng.key}`; }
  const wu = first('五月');
  if (wu) { derived.端午节 = addDays(wu.key, 4); trace.端午节 = `五月初一 ${wu.key} +4`; }
  const ba = first('八月');
  if (ba) { derived.中秋节 = addDays(ba.key, 14); trace.中秋节 = `八月初一 ${ba.key} +14`; }
  const qm = rows.find((r) => r.term.includes('清明'));
  if (qm) { derived.清明节 = qm.key; trace.清明节 = `節氣「清明」行 = ${qm.key}`; }

  const leapHeads = monthHeads.filter((h) => h.lunar.startsWith('閏'));

  return {
    year,
    file: `verification/verify2-hko/T${year}c.txt`,
    url: `https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T${year}c.txt`,
    sha256,
    bytes: buf.length,
    rowCount: rows.length,
    daysInYear,
    headerOk: rows.length === daysInYear,
    unparsedDataLines: bad,
    weekdayMismatch,
    monthHeads,
    leapHeads,
    solarTerms: rows.filter((r) => r.term).map((r) => `${r.key}:${r.term}`),
    derived,
    trace,
  };
}

/* ---------- 2. 官方已公布年份的反向验证基准 ----------
   来源：国务院办公厅通知（holidays.ts 头部已逐条列出文号）。
   注意：这里放的是「节日当天」，不是「放假区间起始日」。
   清明特别标注：官方假期起点 ≠ 节气当天（2026 年就是），
   所以清明的基准是**节气当天**，另行打印官方区间起点做对照。 */

const OFFICIAL_FESTIVAL_DAY = {
  2024: { 春节: '2024-02-10', 端午节: '2024-06-10', 中秋节: '2024-09-17' },
  2025: { 春节: '2025-01-29', 端午节: '2025-05-31', 中秋节: '2025-10-06' },
  2026: { 春节: '2026-02-17', 端午节: '2026-06-19', 中秋节: '2026-09-25' },
};
/* 官方放假区间（仅用于清明对照，来自 holidays.ts YEAR_PLANS） */
const OFFICIAL_QINGMING_RANGE_START = { 2024: '2024-04-04', 2025: '2025-04-04', 2026: '2026-04-04' };

/* ---------- 3. 跑 ---------- */

const parsed = {};
for (const y of YEARS) parsed[y] = parseHko(y);

const lines = [];
const P = (s = '') => { lines.push(s); console.log(s); };

P('='.repeat(78));
P('verify2 · A 节：香港天文台历表 → 节日推导 → 与 FESTIVALS 逐条比对');
P('='.repeat(78));
P('');
P('【0】数据源完整性（本地副本 + sha256 溯源）');
P('-'.repeat(78));
for (const y of YEARS) {
  const r = parsed[y];
  if (r.error) { P(`  ${y}  ✗ ${r.error}`); continue; }
  P(
    `  ${y}  ${r.rowCount} 行 (应为 ${r.daysInYear})  ${r.headerOk ? '✓天数齐' : '✗天数不齐'}` +
      `  解析失败行=${r.unparsedDataLines}  星期自洽=${r.weekdayMismatch === 0 ? '✓' : `✗${r.weekdayMismatch}处不符`}` +
      `  sha256=${r.sha256.slice(0, 16)}…`,
  );
}
P('');
P('【0b】农历月首清单（用于确认「五月/八月」取的是非闰月）');
P('-'.repeat(78));
for (const y of YEARS) {
  const r = parsed[y];
  if (r.error) continue;
  const heads = r.monthHeads.map((h) => `${h.lunar}@${h.key.slice(5)}`).join(' ');
  const leap = r.leapHeads.length ? `  ★闰月: ${r.leapHeads.map((h) => `${h.lunar}@${h.key}`).join(', ')}` : '  （本年无闰月）';
  P(`  ${y}: ${heads}`);
  P(`        ${leap}`);
}
P('');

P('【1】反向验证：2024–2026 官方数据能否被这套推导方法复现');
P('-'.repeat(78));
let reverseFail = 0;
for (const y of [2024, 2025, 2026]) {
  const r = parsed[y];
  const exp = OFFICIAL_FESTIVAL_DAY[y];
  for (const [name, want] of Object.entries(exp)) {
    const got = r.derived[name];
    const ok = got === want;
    if (!ok) reverseFail++;
    P(`  ${y} ${name.padEnd(4)} 官方当天=${want}  推导=${got}  ${ok ? '✓' : '✗ 不一致'}`);
  }
  // 清明：节气当天 vs 官方区间起点
  const termDay = r.derived.清明节;
  const rangeStart = OFFICIAL_QINGMING_RANGE_START[y];
  P(
    `  ${y} 清明   節氣当天=${termDay}  官方放假区间起点=${rangeStart}  ` +
      `${termDay === rangeStart ? '（该年恰好同一天）' : '（★不同天——这是正常现象，不是错）'}`,
  );
}
P('');
P(`  反向验证小结：${reverseFail === 0 ? '✓ 春节/端午/中秋 三年九处全部逐日吻合，推导方法成立' : `✗ ${reverseFail} 处不吻合`}`);
P('');

P('【2】正向比对：2027–2030 推导结果 vs src/lib/holidays.ts FESTIVALS');
P('-'.repeat(78));
const FESTIVALS = parseFestivalsFromSource();
const ORDER = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'];

let fwdFail = 0;
let fwdTotal = 0;
for (const y of [2027, 2028, 2029, 2030]) {
  const r = parsed[y];
  const table = FESTIVALS[y];
  if (!table) { P(`  ${y}  ✗ FESTIVALS 表里没有 ${y}`); fwdFail++; continue; }
  P(`  ${y}:`);
  for (const name of ORDER) {
    const got = r.derived[name];
    const want = table[name];
    fwdTotal++;
    const ok = got === want;
    if (!ok) fwdFail++;
    P(
      `    ${name.padEnd(4)} 源码='${want ?? '(缺)'}'  独立推导='${got ?? '(缺)'}'  ` +
        `${ok ? '✓' : '✗★不一致'}   ${r.trace[name] ?? ''}`,
    );
  }
  // 源码里有没有多余/未知的键
  const extra = Object.keys(table).filter((k) => !ORDER.includes(k));
  if (extra.length) { fwdFail++; P(`    ✗ FESTIVALS[${y}] 含未知节日键: ${extra.join(',')}`); }
  const missing = ORDER.filter((k) => !(k in table));
  if (missing.length) { fwdFail++; P(`    ✗ FESTIVALS[${y}] 缺少: ${missing.join(',')}`); }
}
P('');
P(`  正向比对小结：${fwdFail === 0 ? `✓ ${fwdTotal}/${fwdTotal} 条全部一致` : `✗ ${fwdFail}/${fwdTotal} 条不一致`}`);
P('');

P('【3】2031 及以后：源码里不应有任何猜测');
P('-'.repeat(78));
const festYears = Object.keys(FESTIVALS).map(Number).sort((a, b) => a - b);
P(`  FESTIVALS 覆盖年份 = [${festYears.join(', ')}]`);
P(`  是否存在 ≥2031 的条目：${festYears.some((y) => y >= 2031) ? '✗ 有（不应有）' : '✓ 无'}`);
if (parsed[2031] && !parsed[2031].error) {
  P(`  （T2031c.txt 已下载可作旁证：2031 春节 = ${parsed[2031].derived.春节}，源码故意不收录 ✓）`);
}
P('');

/* ---------- 输出机器可读结果 ---------- */
const outPath = join(ROOT, 'verification', 'verify2-hko', 'derived.json');
writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), reverseFail, fwdFail, fwdTotal, parsed, FESTIVALS }, null, 2),
  'utf8',
);

const verdict = reverseFail === 0 && fwdFail === 0;
P('='.repeat(78));
P(`A 节总结论：${verdict ? '✓ PASS — 数据源权威、推导方法经官方数据反向验证、2027–2030 逐条一致' : '✗ FAIL — 见上方 ✗ 行'}`);
P(`明细 JSON: verification/verify2-hko/derived.json`);
P('='.repeat(78));

writeFileSync(join(ROOT, 'verification', 'verify2-A-festivals.txt'), lines.join('\n'), 'utf8');
process.exit(verdict ? 0 : 1);
