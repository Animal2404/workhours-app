/* ============================================================
   verify2 · B 节：浏览器实测（Playwright + 真实 dist 产物）
   ------------------------------------------------------------
   打的不是源码，是 http://127.0.0.1:4173 上正在跑的 dist/。
   同时把 src/lib/holidays.ts 编译出来当「期望值」——
   于是这个脚本顺带证明了一件事：**线上产物与当前源码一致**
   （否则 2557 个格子里必然出现对不上的）。

   覆盖：
     B1  2027-02 显示「春节」@2027-02-06、相邻日不误标
     B2  2027-09 显示「中秋节」@2027-09-15、相邻日不误标
     B3  官方年(2024–2026) 不被节日层覆盖
     B4  2031 起不标（整整 12 个月逐个查）
     B5  全量 96 个月（2024-01 ~ 2031-12）逐格 diff：渲染 == 源码
     B6  空格子（跨月补齐位）语义确认
     B7  其它 6 种节日在 2027–2030 的渲染
     B8  D 节：实证「13 次下个月」断言随运行月份漂移
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUTDIR = join(ROOT, 'verification');
mkdirSync(OUTDIR, { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

/* ---------- 期望值：编译 src/lib/holidays.ts ---------- */
const builtPath = join(ROOT, 'verification', 'verify2-hko', 'holidays.built.mjs');
mkdirSync(join(ROOT, 'verification', 'verify2-hko'), { recursive: true });
writeFileSync(
  builtPath,
  esbuild.transformSync(readFileSync(join(ROOT, 'src', 'lib', 'holidays.ts'), 'utf8'), {
    loader: 'ts', format: 'esm', target: 'node22',
  }).code,
  'utf8',
);
const H = await import(pathToFileURL(builtPath).href);

const lines = [];
const P = (s = '') => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; P(`    ✗ ${msg}`); } return cond; };
const eq = (msg, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), `${msg}: 期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`);

/** 源码期望的显示标签（与 CalendarPage 的取值规则一致） */
function expectedLabel(key) {
  const info = H.getHoliday(key);
  if (!info || !info.name) return null;
  return info.kind === 'workday' ? '班' : info.name;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'zh-CN' });
await ctx.addInitScript(() => { try { localStorage.clear(); } catch {} });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.cal-grid', { timeout: 20000 });
await page.waitForTimeout(500);

/* ---------- 工具 ---------- */
async function monthLabel() {
  return page.evaluate(() => {
    const el = document.querySelector('.cal-month');
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelector('em')?.remove();
    return c.textContent.trim();
  });
}
async function goToMonth(year, month0) {
  for (let i = 0; i < 400; i++) {
    const m = /(\d{4})年(\d{1,2})月/.exec(await monthLabel());
    if (!m) throw new Error('月份标题解析失败');
    const diff = year * 12 + month0 - (Number(m[1]) * 12 + (Number(m[2]) - 1));
    if (diff === 0) { await page.waitForTimeout(260); return; }
    await page.locator(diff > 0 ? '[aria-label="下一个月"]' : '[aria-label="上一个月"]').click();
    await page.waitForTimeout(45);
  }
  throw new Error(`goToMonth(${year},${month0}) 失败`);
}
async function snapshot() {
  return page.evaluate(() => {
    const grid = document.querySelector('.cal-grid');
    const children = [...grid.children];
    const dayEls = [...document.querySelectorAll('.day[data-date]')];
    return {
      label: (() => { const el = document.querySelector('.cal-month'); const c = el.cloneNode(true); c.querySelector('em')?.remove(); return c.textContent.trim(); })(),
      gridChildren: children.length,
      blanks: children.filter((c) => c.classList.contains('is-blank')).length,
      blanksWithDate: children.filter((c) => c.classList.contains('is-blank') && c.hasAttribute('data-date')).length,
      // 既不是日期格、也不是空格子的「第三种格子」——应为 0
      otherCells: children.filter((c) => !c.hasAttribute('data-date') && !c.classList.contains('is-blank')).length,
      multiLabelCells: dayEls.filter((c) => c.querySelectorAll('.day-holiday').length > 1).length,
      days: dayEls.map((c) => {
        const lab = c.querySelector('.day-holiday');
        return {
          key: c.getAttribute('data-date'),
          num: c.querySelector('.day-num')?.textContent ?? null,
          label: lab ? lab.textContent : null,
          blankLabel: lab ? lab.textContent.trim() === '' : false,
          cls: c.className,
          aria: c.getAttribute('aria-label'),
          ariaCurrent: c.getAttribute('aria-current'),
        };
      }),
    };
  });
}
/** 某格子里节日标签的可见性与几何（是否被裁切） */
async function labelGeom(key) {
  return page.evaluate((k) => {
    const cell = document.querySelector(`.day[data-date="${k}"]`);
    if (!cell) return null;
    const lab = cell.querySelector('.day-holiday');
    if (!lab) return { exists: false };
    const cs = getComputedStyle(lab);
    const lr = lab.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const ccs = getComputedStyle(cell);
    const pad = (s) => parseFloat(s) || 0;
    const inner = {
      top: cr.top + pad(ccs.borderTopWidth) + pad(ccs.paddingTop),
      bottom: cr.bottom - pad(ccs.borderBottomWidth) - pad(ccs.paddingBottom),
    };
    return {
      exists: true,
      text: lab.textContent,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      fontSize: cs.fontSize, color: cs.color,
      w: Math.round(lr.width * 10) / 10, h: Math.round(lr.height * 10) / 10,
      insideVertically: lr.top >= inner.top - 1 && lr.bottom <= inner.bottom + 1,
      gapToBottom: Math.round((inner.bottom - lr.bottom) * 10) / 10,
      nonDegenerate: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && lr.width > 0 && lr.height > 0,
    };
  }, key);
}
const monthCells = (s) => s.days.map((d) => `${d.key}=${d.label ?? '·'}`);

/* ============================================================ */
P('='.repeat(78));
P('verify2 · B 节：浏览器实测（真实 dist 产物）');
P('='.repeat(78));
P(`  BASE = ${BASE}`);
P(`  期望值来源 = 现场编译的 src/lib/holidays.ts`);
P(`  初始月份 = ${await monthLabel()}`);
P('');

/* ---------------- B1 / B2：两个点名月份 ---------------- */
P('【B1】2027-02：春节 @ 2027-02-06，相邻日不误标');
P('-'.repeat(78));
await goToMonth(2027, 1);
const feb = await snapshot();
P(`  标题=${feb.label}  日期格=${feb.days.length}  空格=${feb.blanks}`);
const febLabelled = feb.days.filter((d) => d.label);
P(`  有节日标签的格子：${febLabelled.map((d) => `${d.key}(${d.num})→${d.label}`).join('  ') || '(无)'}`);
eq('2027-02 有标签的格子恰好 1 个', febLabelled.length, 1);
eq('该格子 = 2027-02-06', febLabelled[0]?.key, '2027-02-06');
eq('该格子标签 = 春节', febLabelled[0]?.label, '春节');
eq('该格子日号 = 6', febLabelled[0]?.num, '6');
ok(febLabelled[0]?.cls.includes('has-holiday'), `缺少 has-holiday 类: ${febLabelled[0]?.cls}`);
ok(!febLabelled[0]?.cls.includes('is-makeup'), `不应有 is-makeup 类: ${febLabelled[0]?.cls}`);
ok(/春节/.test(febLabelled[0]?.aria ?? ''), `aria-label 未含「春节」: ${febLabelled[0]?.aria}`);
for (const k of ['2027-02-05', '2027-02-07', '2027-02-04', '2027-02-08']) {
  const c = feb.days.find((d) => d.key === k);
  eq(`${k} 不误标`, c?.label ?? null, null);
}
const g1 = await labelGeom('2027-02-06');
P(`  标签几何：${g1.w}x${g1.h}px  font-size=${g1.fontSize}  color=${g1.color}  距格底=${g1.gapToBottom}px`);
ok(g1.nonDegenerate, `标签不可见: ${JSON.stringify(g1)}`);
ok(g1.insideVertically, `标签被裁切: ${JSON.stringify(g1)}`);
await page.locator('.cal-grid').scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUTDIR, 'verify2-2027-02-springfestival.png'), fullPage: false });
P('');

P('【B2】2027-09：中秋节 @ 2027-09-15，相邻日不误标');
P('-'.repeat(78));
await goToMonth(2027, 8);
const sep = await snapshot();
P(`  标题=${sep.label}  日期格=${sep.days.length}  空格=${sep.blanks}`);
const sepLabelled = sep.days.filter((d) => d.label);
P(`  有节日标签的格子：${sepLabelled.map((d) => `${d.key}(${d.num})→${d.label}`).join('  ') || '(无)'}`);
eq('2027-09 有标签的格子恰好 1 个', sepLabelled.length, 1);
eq('该格子 = 2027-09-15', sepLabelled[0]?.key, '2027-09-15');
eq('该格子标签 = 中秋节', sepLabelled[0]?.label, '中秋节');
ok(/中秋节/.test(sepLabelled[0]?.aria ?? ''), `aria-label 未含「中秋节」: ${sepLabelled[0]?.aria}`);
for (const k of ['2027-09-14', '2027-09-16', '2027-09-01']) {
  eq(`${k} 不误标`, sep.days.find((d) => d.key === k)?.label ?? null, null);
}
const g2 = await labelGeom('2027-09-15');
P(`  标签几何：${g2.w}x${g2.h}px  font-size=${g2.fontSize}  color=${g2.color}  距格底=${g2.gapToBottom}px`);
ok(g2.nonDegenerate && g2.insideVertically, `标签可见性/裁切异常: ${JSON.stringify(g2)}`);
await page.screenshot({ path: join(OUTDIR, 'verify2-2027-09-midautumn.png'), fullPage: false });
await page.locator('.cal-grid').screenshot({ path: join(OUTDIR, 'verify2-2027-09-grid.png') });
P('');

/* ---------------- B3：官方年份不被覆盖 ---------------- */
P('【B3】官方年份 2024–2026 不被节日层覆盖（实测 DOM）');
P('-'.repeat(78));
await goToMonth(2026, 8);
const sep26 = await snapshot();
for (const [k, want] of [['2026-09-25', '中秋节'], ['2026-09-26', '中秋节'], ['2026-09-27', '中秋节'], ['2026-09-20', '班']]) {
  const c = sep26.days.find((d) => d.key === k);
  eq(`2026-09 渲染 ${k}`, c?.label ?? null, want);
  if (want === '班') ok(c?.cls.includes('is-makeup'), `${k} 应带 is-makeup 类: ${c?.cls}`);
}
eq('2026-09-24 无标签', sep26.days.find((d) => d.key === '2026-09-24')?.label ?? null, null);
eq('2026-09 标签总数 = 4（3 天中秋 + 1 天调休）', sep26.days.filter((d) => d.label).length, 4);
ok(sep26.days.every((d) => H.getHoliday(d.key)?.kind !== 'festival'), '2026-09 出现 festival 层');
P(`  2026-09 标签：${monthCells(sep26).filter((x) => !x.endsWith('·')).join('  ')}`);

await goToMonth(2026, 9);
const oct26 = await snapshot();
eq('2026-10 国庆节 = 7 天', oct26.days.filter((d) => d.label === '国庆节').length, 7);
eq('2026-10 调休日 = [2026-10-10]', oct26.days.filter((d) => d.label === '班').map((d) => d.key), ['2026-10-10']);
P(`  2026-10 标签：${oct26.days.filter((d) => d.label).map((d) => `${d.key}→${d.label}`).join('  ')}`);
P('');

/* ---------------- B4：2031 整年不标 ---------------- */
P('【B4】2031 整整 12 个月都不标（不瞎猜）');
P('-'.repeat(78));
let labels2031 = 0;
for (let m = 0; m < 12; m++) {
  await goToMonth(2031, m);
  const s = await snapshot();
  const n = s.days.filter((d) => d.label).length;
  labels2031 += n;
  if (m < 3 || n > 0) P(`  ${s.label}: 日期格=${s.days.length} 标签数=${n}`);
}
eq('2031 全年 12 个月标签总数', labels2031, 0);
await goToMonth(2031, 0);
await page.screenshot({ path: join(OUTDIR, 'verify2-2031-01-empty.png'), fullPage: false });
P('');
P('【B4b】2032 / 2035 抽查也不标');
for (const [y, m] of [[2032, 1], [2035, 9]]) {
  await goToMonth(y, m);
  const s = await snapshot();
  eq(`${y}-${m + 1} 标签数`, s.days.filter((d) => d.label).length, 0);
}
P('');

/* ---------------- B5：全量 96 个月逐格 diff ---------------- */
P('【B5】全量逐格 diff：2024-01 ~ 2031-12 共 96 个月，渲染 vs 源码');
P('-'.repeat(78));
await goToMonth(2024, 0);
let cmpDays = 0, cmpBad = 0, blankBad = 0, gridBad = 0, ariaBad = 0;
const badSamples = [];
const monthsChecked = [];
for (let idx = 0; idx < 96; idx++) {
  const s = await snapshot();
  const y = 2024 + Math.floor(idx / 12);
  const m0 = idx % 12;
  const labelWant = `${y}年${m0 + 1}月`;
  if (s.label !== labelWant) { gridBad++; badSamples.push(`月份标题 ${s.label} != ${labelWant}`); }
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  if (s.days.length !== daysInMonth) { gridBad++; badSamples.push(`${labelWant} 日期格 ${s.days.length} != ${daysInMonth}`); }
  if (s.blanks !== s.gridChildren - s.days.length) { blankBad++; badSamples.push(`${labelWant} 空格数异常 ${s.blanks}`); }
  if (s.blanksWithDate !== 0) { blankBad++; badSamples.push(`${labelWant} 空格子带了 data-date`); }
  if (s.multiLabelCells !== 0) { gridBad++; badSamples.push(`${labelWant} 有格子出现多个节日标签`); }
  if (s.otherCells !== 0) { gridBad++; badSamples.push(`${labelWant} 出现「第三种格子」${s.otherCells} 个`); }
  if (s.gridChildren % 7 !== 0) { gridBad++; badSamples.push(`${labelWant} 网格子元素 ${s.gridChildren} 不是 7 的倍数`); }
  for (const d of s.days) {
    cmpDays++;
    const want = expectedLabel(d.key);
    if (d.label !== want) {
      cmpBad++;
      if (badSamples.length < 12) badSamples.push(`${d.key} 渲染=${JSON.stringify(d.label)} 源码期望=${JSON.stringify(want)}`);
    }
    const wantNum = String(Number(d.key.slice(8)));
    if (d.num !== wantNum) { cmpBad++; if (badSamples.length < 12) badSamples.push(`${d.key} 日号=${d.num} != ${wantNum}`); }
    // aria-label：有节日就必须带节日名；无节日就绝不能冒出节日名
    const FEST_RE = /元旦|春节|清明|劳动节|端午|中秋|国庆|调休上班/;
    const ariaOk = want === null
      ? !FEST_RE.test(d.aria ?? '')
      : want === '班' ? /调休上班/.test(d.aria ?? '') : (d.aria ?? '').includes(want);
    if (!ariaOk) { ariaBad++; if (badSamples.length < 12) badSamples.push(`${d.key} aria-label 与期望不符(期望 ${JSON.stringify(want)}): ${d.aria}`); }
  }
  monthsChecked.push(s.label);
  await page.locator('[aria-label="下一个月"]').click();
  await page.waitForTimeout(45);
}
P(`  已逐格比对月份数 = ${monthsChecked.length}（${monthsChecked[0]} → ${monthsChecked[monthsChecked.length - 1]}）`);
P(`  比对日期格总数 = ${cmpDays}（2024-01-01 ~ 2031-12-31，含 2024/2028/2032 三个闰年）`);
eq('渲染标签与源码不符的格子数', cmpBad, 0);
eq('空格子语义异常次数', blankBad, 0);
eq('网格结构异常次数', gridBad, 0);
eq('aria-label 缺节日名次数', ariaBad, 0);
if (badSamples.length) { P('  样例：'); for (const b of badSamples) P(`    · ${b}`); }
P(`  ⇒ 渲染结果与「现场编译的当前源码」${cmpBad === 0 ? '完全一致 —— 线上 dist 与 src/lib/holidays.ts 同步' : '不一致 —— dist 可能过期'}`);
P('');

/* ---------------- B6：空格子语义 ---------------- */
P('【B6】跨月补齐格子（本项目的实际语义）');
P('-'.repeat(78));
await goToMonth(2027, 1);
const feb2 = await snapshot();
await goToMonth(2027, 8);
const sep6 = await snapshot();
for (const [tag, s, days] of [['2027-02', feb2, 28], ['2027-09', sep6, 30]]) {
  P(`  ${tag}：网格子元素 ${s.gridChildren} 个 = 日期格 ${s.days.length} + 空格 ${s.blanks}，行数 ${s.gridChildren / 7}`);
  eq(`${tag} 日期格数 = ${days}`, s.days.length, days);
  eq(`${tag} 网格子元素 = 日期格 + 空格`, s.gridChildren, s.days.length + s.blanks);
  eq(`${tag} 网格子元素是 7 的整数倍`, s.gridChildren % 7, 0);
  eq(`${tag} 空格子带 data-date 的个数`, s.blanksWithDate, 0);
  eq(`${tag} 非日期非空格的「第三种格子」个数`, s.otherCells, 0);
  eq(`${tag} 格子日号连续 1..${days}`, s.days.map((d) => Number(d.num)), Array.from({ length: days }, (_, i) => i + 1));
}
P(`  ⇒ 网格长度随「首日偏移 + 当月天数」浮动（2027-02-01 恰是周一 → 4 行 28 格、零空位；`);
P(`    2027-09 需 5 行 → 35 格、5 个空位）。空位是 .day.is-blank：无 data-date、aria-hidden、无日号。`);
P(`    不存在「把上月末尾日期画进本月网格」的情况 —— 任务书里「跨月补齐格子」那条提醒在本项目不适用。`);
P('');

/* ---------------- B7：其余 6 种节日 ---------------- */
P('【B7】2027–2030 全部 28 个节日在浏览器里的实际渲染');
P('-'.repeat(78));
let festSeen = 0;
let festBad = 0;
for (const y of [2027, 2028, 2029, 2030]) {
  for (let m = 0; m < 12; m++) {
    const s = await (async () => { await goToMonth(y, m); return snapshot(); })();
    for (const d of s.days) {
      const want = expectedLabel(d.key);
      if (want === null) continue;
      festSeen++;
      if (d.label !== want) { festBad++; P(`    ✗ ${d.key} 渲染=${d.label} 期望=${want}`); }
    }
  }
}
eq('2027–2030 渲染出的节日标签总数', festSeen, 28);
eq('其中与源码不符的', festBad, 0);
P(`  ⇒ 4 年 × 7 个节日 = ${festSeen} 个标签，全部正确渲染（每月至多 1 个，无重复无遗漏）`);
P('');

/* ---------------- B8：D 节实证 ---------------- */
P('【B8】D 节实证：verify-calendar.mjs 的「13 次下个月」断言随运行月份漂移');
P('-'.repeat(78));
const clickNext = async (n) => { for (let i = 0; i < n; i++) { await page.locator('[aria-label="下一个月"]').click(); await page.waitForTimeout(50); } await page.waitForTimeout(200); };
await goToMonth(2026, 8); // 今天(2026-09)所在月
const base1 = await monthLabel();
await clickNext(13);
const after1 = await monthLabel();
await goToMonth(2026, 9); // 假如运行日期是 2026-10
const base2 = await monthLabel();
await clickNext(13);
const after2 = await monthLabel();
const nowYm = new Date();
P(`  实测 A：从 ${base1} 连点 13 次「下一个月」 → ${after1}`);
P(`  实测 B：从 ${base2} 连点 13 次「下一个月」 → ${after2}`);
P(`  脚本写死的期望值 = 2027年10月（verify-calendar.mjs:443）`);
P(`  Node 侧今天 = ${nowYm.getFullYear()}-${String(nowYm.getMonth() + 1).padStart(2, '0')}`);
ok(after1 === '2027年10月', `A 分支 ${after1} != 2027年10月`);
ok(after2 !== '2027年10月', `B 分支 ${after2} 竟然也等于写死值，说明该断言与运行月份无关`);
P(`  ⇒ 该断言只在「运行当月 = 2026-09」时通过；运行当月 = 2026-10 时实得 ${after2}，会红。`);
P(`    同理 verify-calendar.mjs:454 的 '2026年10月' 也依赖同一前提。`);
P('');

/* ---------------- 控制台 / 截图 ---------------- */
P('【B9】运行期错误');
P('-'.repeat(78));
const realErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
eq('控制台/页面错误数', realErrors.length, 0);
if (realErrors.length) for (const e of realErrors.slice(0, 5)) P(`    · ${e}`);
P('');

await goToMonth(2027, 8);
const darkCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'zh-CN' });
const dpage = await darkCtx.newPage();
await dpage.goto(BASE, { waitUntil: 'load' });
await dpage.waitForSelector('.cal-grid');
await dpage.waitForTimeout(400);
for (let i = 0; i < 80; i++) {
  const t = await dpage.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
  if (t.includes('2027年9月')) break;
  const mm = /(\d{4})年(\d{1,2})月/.exec(t);
  const diff = 2027 * 12 + 8 - (Number(mm[1]) * 12 + Number(mm[2]) - 1);
  await dpage.locator(diff > 0 ? '[aria-label="下一个月"]' : '[aria-label="上一个月"]').click();
  await dpage.waitForTimeout(60);
}
await dpage.waitForTimeout(300);
const darkLab = await dpage.evaluate(() => document.querySelector('.day[data-date="2027-09-15"] .day-holiday')?.textContent ?? null);
eq('深色模式下 2027-09-15 仍显示「中秋节」', darkLab, '中秋节');
await dpage.screenshot({ path: join(OUTDIR, 'verify2-2027-09-dark.png'), fullPage: false });
await darkCtx.close();
P('【B10】深色模式');
P('-'.repeat(78));
P(`  深色模式 2027-09-15 标签 = ${JSON.stringify(darkLab)}  ✓ 截图 verification/verify2-2027-09-dark.png`);
P('');

P('='.repeat(78));
P(`B 节结论：${fail === 0 ? `✓ PASS — ${pass} 条断言全部通过` : `✗ FAIL — ${fail} 条失败 / 共 ${pass + fail} 条`}`);
P('='.repeat(78));

writeFileSync(join(OUTDIR, 'verify2-B-browser.txt'), lines.join('\n'), 'utf8');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
