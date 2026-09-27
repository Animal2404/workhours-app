/* ============================================================
   从香港天文台《公曆與農曆日期對照表》推导节日日期
   ------------------------------------------------------------
   为什么要它：
   国务院每年 11 月才发次年的放假安排，所以「2027 年放假几天、
   哪天调休」现在谁都不知道。但「春节是正月初一」「中秋是八月十五」
   是农历本身的属性，天文台早已公布 —— 手机日历显示的正是这个。

   推导规则（与手机日历一致：只标节日当天，不猜放假区间）：
     春节 = 正月初一
     端午 = 五月初一 + 4
     中秋 = 八月初一 + 14
     清明 = 表格里標着「清明」那一天
     元旦 / 劳动节 / 国庆节 = 固定 1/1、5/1、10/1

   先用 2024–2026 官方数据验证方法，再往外推。
   ============================================================ */

const Y = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

/** 官方已知的节日日期，用来验证推导方法
 *
 *  ⚠️ 清明的口径要小心：本脚本推导的是**節氣当天**，
 *  而「官方放假区间起始日」不一定等于節氣当天。
 *  2024/2025 恰好都是 04-04；2026 節氣在 04-05、官方假期自 04-04 起。
 *  所以这里的期望值填**節氣当天**，别填区间起始日，否则会稳定误报。 */
const EXPECTED = {
  2024: { 春节: '2024-02-10', 端午节: '2024-06-10', 中秋节: '2024-09-17', 清明节: '2024-04-04' },
  2025: { 春节: '2025-01-29', 端午节: '2025-05-31', 中秋节: '2025-10-06', 清明节: '2025-04-04' },
  2026: { 春节: '2026-02-17', 端午节: '2026-06-19', 中秋节: '2026-09-25', 清明节: '2026-04-05' },
};

const pad = (n) => String(n).padStart(2, '0');
const addDays = (key, d) => {
  const [y, m, dd] = key.split('-').map(Number);
  const t = Date.UTC(y, m - 1, dd) + d * 86400000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

async function fetchYear(y) {
  const url = `https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T${y}c.txt`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`T${y}c.txt HTTP ${res.status}`);
  return res.text();
}

const results = {};
let mismatch = 0;
for (const y of Y) {
  let text;
  try {
    text = await fetchYear(y);
  } catch (e) {
    console.log(`  ${y}: 拿不到（${e.message}）`);
    continue;
  }

  const found = { 元旦: `${y}-01-01`, 劳动节: `${y}-05-01`, 国庆节: `${y}-10-01` };
  for (const raw of text.split(/\r?\n/)) {
    // 形如：2027年2月6日          正月        星期六
    const m = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s+星期/);
    if (!m) continue;
    const [, yy, mm, dd, lunar] = m;
    if (Number(yy) !== y) continue;
    const key = `${yy}-${pad(mm)}-${pad(dd)}`;
    // 只认非闰月的月首（闰月会写成「閏五月」，不会被这几个等值匹配到）
    if (lunar === '正月') found.春节 = key;
    if (lunar === '五月') found.端午节 = addDays(key, 4);
    if (lunar === '八月') found.中秋节 = addDays(key, 14);
    if (raw.includes('清明')) found.清明节 = key;
  }

  const order = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'];
  results[y] = order.filter((k) => found[k]).map((k) => `${k}=${found[k]}`);

  // 有官方数据的年份做验证
  const exp = EXPECTED[y];
  if (exp) {
    const bad = Object.entries(exp).filter(([name, date]) => found[name] !== date);
    if (bad.length) mismatch++;
    console.log(
      `  ${y}  ${bad.length === 0 ? '✓ 推导与官方数据完全一致' : '✗ 不一致: ' + bad.map(([n, d]) => `${n} 期望${d} 实得${found[n]}`).join('; ')}`,
    );
  }
}

console.log('\n推导结果：');
for (const [y, list] of Object.entries(results)) {
  console.log(`  ${y}: ${list.join('  ')}`);
}

// 输出成 TS 片段
console.log('\n--- TypeScript 片段 ---');
console.log('const FESTIVALS: Record<number, Record<string, string>> = {');
for (const [y, list] of Object.entries(results)) {
  const pairs = list.map((s) => { const [n, d] = s.split('='); return `'${n}': '${d}'`; });
  console.log(`  ${y}: { ${pairs.join(', ')} },`);
}
console.log('};');

// 有对不上就必须让调用方知道 —— 之前这里恒 exit 0，
// 结果 2026 清明那条误报一直没人管（独立复核 verify2 指出）。
if (mismatch > 0) {
  console.log(`\n❌ 有 ${mismatch} 个年份与官方数据对不上，请先查清再改 FESTIVALS`);
  process.exit(1);
}
console.log('\n✅ 推导方法与官方数据完全吻合（春节/端午/中秋 三年九处）');
