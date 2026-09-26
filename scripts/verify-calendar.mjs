/* ============================================================
   独立验证 · B：日历里节假日「真的显示出来了」（浏览器实测）
   ------------------------------------------------------------
   立场：验证者。不读代码下结论 —— 全部结论来自 Playwright 真跑
   在 dist/ 上的 iPhone 14 Pro 设备模拟，量 DOM / computed style / 包围盒。

   已知坑（任务书点名，本脚本刻意绕开）：
     .day.is-selected::after 有 inset:-3px 的外环，会让 scrollHeight/
     scrollWidth 比 client 大 3px。所以判溢出**不用** scrollHeight，
     改用「非 absolute 子元素包围盒 vs 父内容盒」，并排除 position:absolute 的 .day-dot。

   运行：node scripts/verify-calendar.mjs
   ============================================================ */

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotDir = join(root, 'verification');
mkdirSync(shotDir, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

/* ---------------- 断言框架 ---------------- */
let pass = 0;
const fails = [];
const warns = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  [' + detail + ']' : ''}`); }
  else { fails.push(`${name} ${detail}`); console.log(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
}
/** 非验收口径、但值得记录的现象：只记不判失败 */
function warn(name, detail) {
  warns.push(`${name} — ${detail}`);
  console.log(`  WARN  ${name}  [${detail}]`);
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name, a === e, a === e ? `=${e}` : `期望 ${e} 实际 ${a}`);
}

/* ---------------- 设备模拟 ---------------- */
const IPHONE = devices['iPhone 14 Pro'] ?? {
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
console.log(`设备模拟：iPhone 14 Pro  viewport=${IPHONE.viewport.width}x${IPHONE.viewport.height} dpr=${IPHONE.deviceScaleFactor} isMobile=${IPHONE.isMobile}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...IPHONE, locale: 'zh-CN' });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.cal-grid', { timeout: 15000 });
await page.waitForTimeout(400);

/* ---------------- 工具 ---------------- */
async function monthLabelNow() {
  // .cal-month 里还嵌了一个 <em>共 Xh</em>，innerText 会把两段粘在一起，
  // 所以只取去掉 <em> 之后的主标题文本。
  return page.evaluate(() => {
    const el = document.querySelector('.cal-month');
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelector('em')?.remove();
    return c.textContent.trim();
  });
}
async function goToMonth(year, month0) {
  for (let i = 0; i < 80; i++) {
    const lbl = await monthLabelNow();
    const m = /(\d{4})年(\d{1,2})月/.exec(lbl);
    if (!m) throw new Error('无法解析月份标题: ' + JSON.stringify(lbl));
    const diff = (year * 12 + month0) - (+m[1] * 12 + (+m[2] - 1));
    if (diff === 0) { await page.waitForTimeout(230); return; }
    await page.locator(diff > 0 ? '[aria-label="下一个月"]' : '[aria-label="上一个月"]').click();
    await page.waitForTimeout(70);
  }
  throw new Error(`goToMonth(${year},${month0}) 失败`);
}
/** 取某天格子的完整信息 */
async function cellInfo(dateKey) {
  return page.evaluate((k) => {
    const cell = document.querySelector(`.day[data-date="${k}"]`);
    if (!cell) return null;
    const hl = cell.querySelector('.day-holiday');
    const r = cell.getBoundingClientRect();
    const cs = getComputedStyle(cell);
    const out = {
      exists: true,
      classes: [...cell.classList],
      dayNum: cell.querySelector('.day-num')?.textContent ?? null,
      ariaLabel: cell.getAttribute('aria-label'),
      rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      cellOverflowX: +(cell.scrollWidth - cell.clientWidth).toFixed(2),
      cellOverflowY: +(cell.scrollHeight - cell.clientHeight).toFixed(2),
    };
    if (!hl) { out.holidayText = null; return out; }
    const hs = getComputedStyle(hl);
    const hr = hl.getBoundingClientRect();
    // 父「内容盒」——排除 border/padding
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    const contentTop = r.top + bt + pt, contentBottom = r.bottom - bb - pb;
    const contentLeft = r.left + bl + pl, contentRight = r.right - br - pr;
    out.holidayText = hl.textContent;
    out.holidayStyle = {
      fontSize: hs.fontSize, color: hs.color, fontWeight: hs.fontWeight,
      lineHeight: hs.lineHeight, letterSpacing: hs.letterSpacing, fontFamily: hs.fontFamily,
      position: hs.position, zIndex: hs.zIndex, display: hs.display, textAlign: hs.textAlign,
      opacity: hs.opacity, visibility: hs.visibility, overflow: hs.overflow,
      whiteSpace: hs.whiteSpace, textOverflow: hs.textOverflow,
    };
    out.holidayGeom = {
      w: +hr.width.toFixed(2), h: +hr.height.toFixed(2),
      // 相对父内容盒：中心偏移，用来判「同位置」
      dxFromContentCenter: +((hr.left + hr.width / 2) - (contentLeft + contentRight) / 2).toFixed(2),
      dyFromContentTop: +(hr.top - contentTop).toFixed(2),
      gapToContentBottom: +(contentBottom - hr.bottom).toFixed(2),
      insideX: hr.left >= contentLeft - 0.51 && hr.right <= contentRight + 0.51,
      insideY: hr.top >= contentTop - 0.51 && hr.bottom <= contentBottom + 0.51,
      clipped: hr.width <= 0.01 || hr.height <= 0.01,
    };
    out.visible = hs.display !== 'none' && hs.visibility !== 'hidden'
      && parseFloat(hs.opacity) > 0 && hr.width > 0.5 && hr.height > 0.5;
    out.isDirectChildOfDay = hl.parentElement === cell;
    return out;
  }, dateKey);
}
/** 整月快照：所有格子（含空格）+ 溢出统计 */
async function gridSnapshot() {
  return page.evaluate(() => {
    const grid = document.querySelector('.cal-grid');
    const cells = [...grid.children];
    const days = cells.filter((c) => c.classList.contains('day') && !c.classList.contains('is-blank'));
    const blanks = cells.filter((c) => c.classList.contains('is-blank'));

    const overflow = [];
    for (const c of days) {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
      const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      const cTop = r.top + bt + pt, cBot = r.bottom - bb - pb;
      const cLeft = r.left + bl + pl, cRight = r.right - br - pr;
      for (const ch of c.children) {
        // 关键：排除 position:absolute（.day-dot）——它本来就不参与常规流
        if (getComputedStyle(ch).position === 'absolute') continue;
        const cr = ch.getBoundingClientRect();
        const ex = Math.max(0, cLeft - cr.left, cr.right - cRight);
        const ey = Math.max(0, cTop - cr.top, cr.bottom - cBot);
        if (ex > 0.51 || ey > 0.51) {
          overflow.push({
            date: c.getAttribute('data-date'), cls: ch.className,
            overX: +ex.toFixed(2), overY: +ey.toFixed(2),
          });
        }
      }
    }

    const empties = days
      .map((c) => {
        const hl = c.querySelector('.day-holiday');
        return hl ? { date: c.getAttribute('data-date'), text: hl.textContent } : null;
      })
      .filter((x) => x && (x.text === '' || /^\s*$/.test(x.text)
        || x.text === 'undefined' || x.text === 'null'));

    return {
      total: cells.length,
      dayCount: days.length,
      blankCount: blanks.length,
      dates: days.map((c) => c.getAttribute('data-date')),
      blankHasHoliday: blanks.filter((b) => b.querySelector('.day-holiday')).length,
      blankHasDate: blanks.filter((b) => b.hasAttribute('data-date')).length,
      holidayCells: days
        .filter((c) => c.classList.contains('has-holiday'))
        .map((c) => [c.getAttribute('data-date'), c.querySelector('.day-holiday')?.textContent]),
      overflow,
      emptyLabels: empties,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      gridRows: new Set(days.map((c) => Math.round(c.getBoundingClientRect().top))).size,
    };
  });
}

/** 把网格滚到视口中间再元素级截图，避免浮动导航栏压住底部两行 */
async function shootGrid(pg, file) {
  await pg.evaluate(() => {
    document.querySelector('.cal-grid')?.scrollIntoView({ block: 'center' });
  });
  await pg.waitForTimeout(320);
  await pg.locator('.cal-grid').screenshot({ path: join(shotDir, file) });
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B0. 初始状态');
console.log('='.repeat(74));
{
  const lbl = await monthLabelNow();
  eq('默认打开的是「今天」所在月份（系统今天 2026-09-26）', lbl, '2026年9月');
  const snap = await gridSnapshot();
  console.log(`  格子总数=${snap.total} 日期格=${snap.dayCount} 空格=${snap.blankCount} 行数=${snap.gridRows}`);
  const ls = await page.evaluate(() => ({ n: Object.keys(JSON.parse(localStorage.getItem('workhours.v1') || '{}').entries || {}).length }));
  console.log(`  localStorage 里已有记录条数 = ${ls.n}（0 表示日历无「有工时」格子，样式比对更干净）`);
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B1. 核心：2026-09-25 的「中秋节」文字真的在 DOM 里且可见');
console.log('='.repeat(74));
{
  const c = await cellInfo('2026-09-25');
  ok('2026-09-25 格子存在', !!c);
  eq('格子 classes', c.classes.filter((x) => x !== 'day').sort(), ['has-holiday']);
  eq('日号文本', c.dayNum, '25');
  eq('.day-holiday 文本内容 === "中秋节"', c.holidayText, '中秋节');
  ok('该标签确实可见（display/visibility/opacity/尺寸全部非退化）', c.visible,
    `display=${c.holidayStyle.display} visibility=${c.holidayStyle.visibility} opacity=${c.holidayStyle.opacity} box=${c.holidayGeom.w}x${c.holidayGeom.h}`);
  eq('它是 .day 的直接子元素', c.isDirectChildOfDay, true);
  ok('标签包围盒完全落在格子内容盒内（未被裁切）', c.holidayGeom.insideX && c.holidayGeom.insideY,
    `insideX=${c.holidayGeom.insideX} insideY=${c.holidayGeom.insideY} 距内容底=${c.holidayGeom.gapToContentBottom}px`);
  console.log(`  aria-label = ${JSON.stringify(c.ariaLabel)}`);
  ok('aria-label 里也带上了「中秋节」（无障碍可读）', /中秋节/.test(c.ariaLabel || ''), c.ariaLabel);
  console.log(`  日格几何: ${c.rect.w}x${c.rect.h} @ (${c.rect.x},${c.rect.y})`);
  console.log(`  标签几何: ${c.holidayGeom.w}x${c.holidayGeom.h}  相对内容盒中心 dx=${c.holidayGeom.dxFromContentCenter}  距顶=${c.holidayGeom.dyFromContentTop}  距底=${c.holidayGeom.gapToContentBottom}`);
  console.log(`  计算样式: font-size=${c.holidayStyle.fontSize} color=${c.holidayStyle.color} weight=${c.holidayStyle.fontWeight} position=${c.holidayStyle.position} z-index=${c.holidayStyle.zIndex}`);
  await page.screenshot({ path: join(shotDir, 'verify-cal-2026-09-after.png'), fullPage: false });
  // 元素级截图：先把网格滚到视口中间，免得被浮动导航栏压住看不见
  await shootGrid(page, 'verify-cal-2026-09-grid-after.png');
  await page.screenshot({ path: join(shotDir, 'verify-cal-2026-09-full-after.png'), fullPage: true });
}

/* ---- before 重构图（把节日标签藏掉 + 还原 1:1 方格 = 修复前的观感） ---- */
{
  await page.addStyleTag({ content: '.day-holiday{display:none !important}.day{aspect-ratio:1/1 !important;max-height:none !important}' });
  await page.waitForTimeout(250);
  await shootGrid(page, 'verify-cal-2026-09-grid-before.png');
  await page.screenshot({ path: join(shotDir, 'verify-cal-2026-09-before.png'), fullPage: false });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.cal-grid'); await page.waitForTimeout(400);
  console.log('  （before 图 = 运行时注入 display:none + 还原 aspect-ratio 1/1 重构，源文件未改）');
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B2. 中秋节 vs 其它节日：同位置 / 同字号 / 同颜色 / 同层级');
console.log('='.repeat(74));
{
  const SAMPLE = [
    [2026, 0, '2026-01-01', '元旦'],
    [2026, 1, '2026-02-15', '春节'],
    [2026, 3, '2026-04-04', '清明节'],
    [2026, 4, '2026-05-01', '劳动节'],
    [2026, 5, '2026-06-19', '端午节'],
    [2026, 8, '2026-09-25', '中秋节'],
    [2026, 9, '2026-10-01', '国庆节'],
  ];
  const rows = [];
  for (const [y, m0, key, name] of SAMPLE) {
    await goToMonth(y, m0);
    const c = await cellInfo(key);
    if (!c || c.holidayText === null) { ok(`${key} ${name} 存在且有标签`, false); continue; }
    eq(`${key} 显示「${name}」`, c.holidayText, name);
    rows.push({ key, name, ...c });
  }
  console.log('\n  key          节日     font-size  color                weight  pos     z-index  dx      距顶    距底    盒尺寸');
  console.log('  ' + '─'.repeat(104));
  for (const r of rows) {
    const s = r.holidayStyle, g = r.holidayGeom;
    console.log(`  ${r.key}  ${r.name.padEnd(4)}  ${s.fontSize.padStart(8)}  ${s.color.padEnd(20)} ${String(s.fontWeight).padStart(5)}  ${s.position.padEnd(6)} ${String(s.zIndex).padStart(6)}  ${String(g.dxFromContentCenter).padStart(7)} ${String(g.dyFromContentTop).padStart(6)} ${String(g.gapToContentBottom).padStart(6)}  ${g.w}x${g.h}`);
  }

  const uniq = (f) => [...new Set(rows.map(f))];
  const keys = ['fontSize', 'color', 'fontWeight', 'lineHeight', 'letterSpacing', 'position', 'zIndex', 'display', 'textAlign', 'fontFamily'];
  for (const k of keys) {
    const u = uniq((r) => r.holidayStyle[k]);
    ok(`所有节日 ${k} 完全一致`, u.length === 1, u.length === 1 ? `=${u[0]}` : `${u.length} 种: ${JSON.stringify(u)}`);
  }
  // 位置一致性用「极差」判定：亚像素布局取整会带来 ~0.01px 抖动，
  // 那是合成取整噪声，不是「位置不同」。这里把真实极差报出来，不藏。
  const dxs = rows.map((r) => r.holidayGeom.dxFromContentCenter);
  const dys = rows.map((r) => r.holidayGeom.dyFromContentTop);
  const spanDx = Math.max(...dxs) - Math.min(...dxs);
  const spanDy = Math.max(...dys) - Math.min(...dys);
  ok('所有节日标签横向位置一致（极差 ≤ 0.05px）', spanDx <= 0.05,
    `极差 ${spanDx.toFixed(3)}px，取值 ${JSON.stringify(dxs)}`);
  ok('所有节日标签纵向位置一致（同位置，极差 ≤ 0.05px）', spanDy <= 0.05,
    `极差 ${spanDy.toFixed(3)}px，取值 ${JSON.stringify(dys)}`);
  const dh = uniq((r) => r.holidayGeom.h);
  ok('所有节日标签盒高一致', dh.length === 1, `h=${JSON.stringify(dh)}px`);
  const maxDx = Math.max(...rows.map((r) => Math.abs(r.holidayGeom.dxFromContentCenter)));
  ok('标签相对格子水平居中（|dx| ≤ 0.5px）', maxDx <= 0.5, `最大 |dx| = ${maxDx}px`);
  ok('所有节日标签都是 .day 直接子元素（同层级）',
    rows.every((r) => r.isDirectChildOfDay), `${rows.length}/${rows.length}`);
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B3. 边界：周末节日 / 调休上班 / 跨月补齐 / 跨年');
console.log('='.repeat(74));
{
  await goToMonth(2026, 8);
  // 周末节日：2026-09-26(周六) / 09-27(周日) 都在中秋假期里
  for (const [k, wd] of [['2026-09-26', '周六'], ['2026-09-27', '周日']]) {
    const c = await cellInfo(k);
    eq(`${k}（${wd}）显示中秋节`, c.holidayText, '中秋节');
    ok(`${k} 标签可见`, c.visible, `box=${c.holidayGeom.w}x${c.holidayGeom.h}`);
  }
  const c26 = await cellInfo('2026-09-26');
  console.log(`  2026-09-26（今天+周六+中秋）classes = ${JSON.stringify(c26.classes)}`);

  // 调休上班日：2026-09-20（周日，官方「9月20日（周日）上班」）
  const mk = await cellInfo('2026-09-20');
  eq('2026-09-20 调休日显示「班」', mk.holidayText, '班');
  ok('2026-09-20 带 is-makeup 类', mk.classes.includes('is-makeup'), JSON.stringify(mk.classes));
  console.log(`  调休日样式: color=${mk.holidayStyle.color} weight=${mk.holidayStyle.fontWeight}（与节日名刻意不同色，见 app.css 注释）`);
  eq('调休日颜色 !== 节日色（有意区分）', mk.holidayStyle.color !== c26.holidayStyle.color, true);

  // 普通日：无标签、无空标签
  const plain = await cellInfo('2026-09-24');
  eq('2026-09-24（无节假日）没有 .day-holiday 元素', plain.holidayText, null);
  ok('2026-09-24 只有日号', plain.dayNum === '24', `dayNum=${plain.dayNum}`);
  const plainCell = await page.evaluate(() => {
    const c = document.querySelector('.day[data-date="2026-09-24"]');
    return { childCount: c.children.length, kids: [...c.children].map((x) => x.className) };
  });
  eq('2026-09-24 只有一个子元素（.day-num）', plainCell.kids, ['day-num']);

  // 跨月补齐格子：空格必须没有 data-date、没有标签
  const snap = await gridSnapshot();
  eq('9 月空格数量（周一起始，2026-09-01 是周二）', snap.blankCount, 5);
  eq('空格里没有 .day-holiday', snap.blankHasHoliday, 0);
  eq('空格里没有 data-date', snap.blankHasDate, 0);
  eq('9 月日期格数量 = 30', snap.dayCount, 30);
  eq('网格是整行（总数 7 的倍数）', snap.total % 7, 0);
  console.log(`  9 月节日格：${JSON.stringify(snap.holidayCells)}`);

  // 跨年：2025-12（无数据年份? 2025 有数据）→ 2026-01
  await goToMonth(2025, 11);
  const dec = await cellInfo('2025-12-31');
  eq('2025-12-31 无节日标签', dec.holidayText, null);
  await goToMonth(2026, 0);
  const jan = await gridSnapshot();
  eq('2026 年 1 月：元旦 3 天都有标签',
    jan.holidayCells.filter(([, t]) => t === '元旦').map(([d]) => d),
    ['2026-01-01', '2026-01-02', '2026-01-03']);
  eq('2026-01 还含 1 个调休日（1/4）', jan.holidayCells.filter(([, t]) => t === '班').map(([d]) => d), ['2026-01-04']);
  eq('2025-12-31 不串到 2026-01 网格', jan.dates.includes('2025-12-31'), false);
  eq('2026-01 日期格数 = 31', jan.dayCount, 31);
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B4. 各月天数 / 闰年 2 月 / 大小月不越界');
console.log('='.repeat(74));
{
  const EXPECT = [
    [2026, 0, 31, '1月'], [2026, 1, 28, '2026 平年 2月'], [2026, 2, 31, '3月'],
    [2026, 3, 30, '4月'], [2026, 4, 31, '5月'], [2026, 5, 30, '6月'],
    [2026, 6, 31, '7月'], [2026, 7, 31, '8月'], [2026, 8, 30, '9月'],
    [2026, 9, 31, '10月'], [2026, 10, 30, '11月'], [2026, 11, 31, '12月'],
    [2028, 1, 29, '2028 闰年 2月'], [2027, 1, 28, '2027 平年 2月'],
  ];
  for (const [y, m0, n, label] of EXPECT) {
    await goToMonth(y, m0);
    const s = await gridSnapshot();
    eq(`${label} 日期格数 = ${n}`, s.dayCount, n);
    const dup = s.dates.length !== new Set(s.dates).size;
    ok(`${label} 无重复日期格`, !dup, dup ? '有重复' : `${s.dates.length} 个唯一`);
    // 日期必须严格递增、属于本月
    const sorted = [...s.dates].sort();
    eq(`${label} 日期集合排序后与渲染顺序一致`, s.dates, sorted);
    const monthTag = `${y}-${String(m0 + 1).padStart(2, '0')}`;
    const foreign = s.dates.filter((d) => !d.startsWith(monthTag));
    eq(`${label} 没有混入其它月份的日期`, foreign, []);
    if (s.overflow.length) console.log(`    !! 溢出: ${JSON.stringify(s.overflow)}`);
    eq(`${label} 无子元素溢出格子内容盒`, s.overflow.length, 0);
    eq(`${label} 无空/undefined/null 标签`, s.emptyLabels.length, 0);
  }
  // 闰年 2 月必须真的有 2 月 29 日
  await goToMonth(2028, 1);
  const leap = await cellInfo('2028-02-29');
  ok('2028-02-29 存在（闰年不越界）', !!leap, leap ? `日号=${leap.dayNum}` : '缺失');
  eq('2028-02-29 日号是 29', leap?.dayNum, '29');
  await page.screenshot({ path: join(shotDir, 'verify-cal-2028-02-leap-after.png') });
  // 2026 平年不能有 2 月 29
  await goToMonth(2026, 1);
  const noLeap = await page.locator('.day[data-date="2026-02-29"]').count();
  eq('2026-02-29 不存在（平年不越界）', noLeap, 0);
  const feb = await gridSnapshot();
  eq('2026-02 最后一个日期格是 02-28', feb.dates[feb.dates.length - 1], '2026-02-28');
  await page.screenshot({ path: join(shotDir, 'verify-cal-2026-02-after.png') });
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B5. 切月 / 切年 / 连续快速切月：不残留、不串月');
console.log('='.repeat(74));
{
  // 回到今天（当前月）
  await goToMonth(2026, 8);
  const t = await page.evaluate(() => {
    const sel = document.querySelectorAll('.day.is-today');
    return { n: sel.length, date: sel[0]?.getAttribute('data-date') ?? null };
  });
  eq('回到当前月后「今天」格恰好 1 个', t.n, 1);
  eq('「今天」格 = 2026-09-26', t.date, '2026-09-26');

  // 连续快速切月：点 13 次「下一个月」，几乎不等动画
  const before = await monthLabelNow();
  for (let i = 0; i < 13; i++) await page.locator('[aria-label="下一个月"]').click();
  await page.waitForTimeout(600);
  const after = await monthLabelNow();
  console.log(`  连点 13 次「下一个月」：${before} → ${after}`);
  eq('13 次点击被完整消费（2026年9月 +13 = 2027年10月）', after, '2027年10月');
  const s = await gridSnapshot();
  const foreign = s.dates.filter((d) => !d.startsWith('2027-10'));
  eq('快速切月后网格里没有别的月份残留', foreign, []);
  eq('快速切月后日期格数 = 31', s.dayCount, 31);
  eq('快速切月后无空标签', s.emptyLabels.length, 0);
  eq('快速切月后无溢出', s.overflow.length, 0);

  // 跨年往回切 12 次
  for (let i = 0; i < 12; i++) await page.locator('[aria-label="上一个月"]').click();
  await page.waitForTimeout(600);
  eq('往回 12 次 = 2026年10月', await monthLabelNow(), '2026年10月');
  const s2 = await gridSnapshot();
  eq('回到 2026-10：国庆 7 天 + 调休 1 天',
    s2.holidayCells.filter(([, x]) => x === '国庆节').length, 7);
  eq('2026-10 调休日 = 2026-10-10',
    s2.holidayCells.filter(([, x]) => x === '班').map(([d]) => d), ['2026-10-10']);
  eq('2026-10 无残留', s2.dates.filter((d) => !d.startsWith('2026-10')), []);
  await page.screenshot({ path: join(shotDir, 'verify-cal-2026-10-after.png') });

  // 往返跳：9月 → 10月 → 9月，标签不能丢
  await goToMonth(2026, 8);
  eq('往返后 2026-09-25 仍是中秋节', (await cellInfo('2026-09-25')).holidayText, '中秋节');
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B6. 溢出（子元素包围盒 vs 内容盒；刻意不用 scrollHeight）');
console.log('='.repeat(74));
{
  await goToMonth(2026, 8);
  const worst = await page.evaluate(() => {
    const out = { worst: 0, worstDate: null, selected: null, dotSkipped: 0 };
    for (const c of document.querySelectorAll('.day[data-date]')) {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
      const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
      const cTop = r.top + bt + pt, cBot = r.bottom - bb - pb;
      const cLeft = r.left + bl + pl, cRight = r.right - br - pr;
      let stack = 0;
      for (const ch of c.children) {
        const ccs = getComputedStyle(ch);
        if (ccs.position === 'absolute') { out.dotSkipped++; continue; }
        const cr = ch.getBoundingClientRect();
        stack += cr.height;
        const e = Math.max(0, cLeft - cr.left, cr.right - cRight, cTop - cr.top, cr.bottom - cBot);
        if (e > out.worst) { out.worst = +e.toFixed(2); out.worstDate = c.getAttribute('data-date'); }
      }
      const contentH = cBot - cTop;
      const over = stack - contentH;
      if (over > out.worst) { out.worst = +over.toFixed(2); out.worstDate = c.getAttribute('data-date'); }
      if (c.classList.contains('is-selected')) {
        out.selected = {
          date: c.getAttribute('data-date'),
          scrollH: c.scrollHeight, clientH: c.clientHeight,
          scrollW: c.scrollWidth, clientW: c.clientWidth,
          diffH: c.scrollHeight - c.clientHeight, diffW: c.scrollWidth - c.clientWidth,
          hasAfter: getComputedStyle(c, '::after').content !== 'none',
        };
      }
    }
    return out;
  });
  console.log(`  跳过 position:absolute 子元素 ${worst.dotSkipped} 个（.day-dot）`);
  console.log(`  选中格 scrollHeight/clientHeight = ${worst.selected?.scrollH}/${worst.selected?.clientH} → 差 ${worst.selected?.diffH}px（这正是任务书说的 ::after 假报警，故不采用）`);
  ok('最大真实溢出 = 0（子元素包围盒法）', worst.worst === 0, `worst=${worst.worst}px @ ${worst.worstDate}`);

  const doc = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    bodySw: document.body.scrollWidth,
  }));
  ok('无横向滚动条', doc.sw <= doc.cw + 1, `scrollWidth=${doc.sw} clientWidth=${doc.cw}`);
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B7. 深色模式 + 报错面');
console.log('='.repeat(74));
{
  const dctx = await browser.newContext({ ...IPHONE, locale: 'zh-CN', colorScheme: 'dark' });
  const dpage = await dctx.newPage();
  const derr = [];
  dpage.on('pageerror', (e) => derr.push(String(e.message)));
  await dpage.goto(BASE, { waitUntil: 'load' });
  await dpage.waitForSelector('.cal-grid'); await dpage.waitForTimeout(500);
  const dh = await dpage.evaluate(() => {
    const c = document.querySelector('.day[data-date="2026-09-25"]');
    const hl = c?.querySelector('.day-holiday');
    const s = hl ? getComputedStyle(hl) : null;
    return { text: hl?.textContent ?? null, color: s?.color, fs: s?.fontSize,
      bodyBg: getComputedStyle(document.body).backgroundColor };
  });
  eq('深色模式下 2026-09-25 仍显示「中秋节」', dh.text, '中秋节');
  console.log(`  深色：body bg=${dh.bodyBg} 标签 color=${dh.color} font-size=${dh.fs}`);
  ok('深色模式无 JS 报错', derr.length === 0, derr.join(' | ') || 'OK');
  await dpage.screenshot({ path: join(shotDir, 'verify-cal-2026-09-dark-after.png') });
  await dctx.close();
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B8. 控制台 / 页面错误');
console.log('='.repeat(74));
{
  const realErrors = consoleErrors.filter((t) => !/favicon|404 \(Not Found\)/i.test(t));
  ok('全程无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'OK');
  ok('全程无 console.error', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'OK');
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B9. 窄屏 320/360：节假日名在 ≤359px 分支下是否仍完整不溢出');
console.log('='.repeat(74));
{
  for (const [w, h, dpr] of [[320, 640, 2], [360, 780, 3]]) {
    const nctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: dpr,
      isMobile: true, hasTouch: true, locale: 'zh-CN',
    });
    const np = await nctx.newPage();
    await np.goto(BASE, { waitUntil: 'load' });
    await np.waitForSelector('.cal-grid'); await np.waitForTimeout(400);
    const r = await np.evaluate(() => {
      const cell = document.querySelector('.day[data-date="2026-09-25"]');
      const hl = cell?.querySelector('.day-holiday');
      if (!hl) return null;
      const hs = getComputedStyle(hl);
      const hr = hl.getBoundingClientRect();
      const cs = getComputedStyle(cell);
      const cr = cell.getBoundingClientRect();
      const cLeft = cr.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
      const cRight = cr.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
      const cTop = cr.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
      const cBot = cr.bottom - (parseFloat(cs.borderBottomWidth) || 0) - (parseFloat(cs.paddingBottom) || 0);
      return {
        text: hl.textContent, fs: hs.fontSize,
        cellW: +cr.width.toFixed(2), labelW: +hr.width.toFixed(2),
        // 是否被 ellipsis 截断：scrollWidth > clientWidth 即文本被裁
        truncated: hl.scrollWidth > hl.clientWidth + 0.5,
        insideX: hr.left >= cLeft - 0.51 && hr.right <= cRight + 0.51,
        insideY: hr.top >= cTop - 0.51 && hr.bottom <= cBot + 0.51,
        dayNumFs: getComputedStyle(cell.querySelector('.day-num')).fontSize,
        overflows: [...cell.children].some((ch) => {
          if (getComputedStyle(ch).position === 'absolute') return false;
          const x = ch.getBoundingClientRect();
          return x.left < cLeft - 0.51 || x.right > cRight + 0.51 || x.top < cTop - 0.51 || x.bottom > cBot + 0.51;
        }),
      };
    });
    ok(`${w}px：2026-09-25 仍显示「中秋节」`, r?.text === '中秋节', JSON.stringify(r?.text));
    ok(`${w}px：文本未被 ellipsis 截断`, r && !r.truncated, `scrollW/clientW 未超；label 宽 ${r?.labelW}px / 格宽 ${r?.cellW}px`);
    ok(`${w}px：标签未溢出格子`, r && r.insideX && r.insideY, `insideX=${r?.insideX} insideY=${r?.insideY}`);
    ok(`${w}px：格子内无子元素溢出`, r && !r.overflows, `overflows=${r?.overflows}`);
    console.log(`  ${w}px: 节日字号=${r?.fs} 日号字号=${r?.dayNumFs} 格宽=${r?.cellW} 标签宽=${r?.labelW}`);
    await np.locator('.cal-grid').screenshot({ path: join(shotDir, `verify-cal-${w}-after.png`) }).catch(() => {});
    await nctx.close();
  }
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B10. 浮动导航栏是否永久遮住可滚动内容（底部留白是否够）');
console.log('='.repeat(74));
{
  const c = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar').getBoundingClientRect();
    const doc = document.documentElement;
    // 滚到底，量最后一个内容块底边与导航栏顶边的间距
    window.scrollTo(0, doc.scrollHeight);
    const cards = [...document.querySelectorAll('.page > *')];
    const last = cards[cards.length - 1]?.getBoundingClientRect();
    return {
      barTop: +bar.top.toFixed(2),
      lastBottom: +(last ? last.bottom : NaN).toFixed(2),
      clearance: +(bar.top - (last ? last.bottom : 0)).toFixed(2),
      scrollH: doc.scrollHeight, clientH: doc.clientHeight,
      scrollable: doc.scrollHeight > doc.clientHeight,
    };
  });
  console.log(`  页面可滚动=${c.scrollable}（scrollHeight=${c.scrollH} clientHeight=${c.clientH}）`);
  console.log(`  滚到底后：最后内容块底边 y=${c.lastBottom}，导航栏顶边 y=${c.barTop} → 净空 ${c.clearance}px`);
  ok('滚到底部时导航栏不遮挡最后一块内容', c.clearance >= 0, `净空 ${c.clearance}px`);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/* ============================================================ */
console.log('\n' + '='.repeat(74));
console.log('B11. 首屏（不滚动）时「中秋节」是否真的看得见 —— 用 elementFromPoint 做命中测试');
console.log('='.repeat(74));
{
  // 两种高度都要量：Playwright 的 iPhone 14 Pro 描述符是 393x660（含 Safari 浏览器 chrome），
  // 而 Capacitor 打包 App 是全屏 WebView，约 393x852。
  for (const [w, h, tag] of [[393, 852, '393x852(Capacitor全屏WebView口径)'], [393, 660, '393x660(Playwright设备描述符口径)']]) {
    const hctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 3,
      isMobile: true, hasTouch: true, locale: 'zh-CN',
    });
    const hp = await hctx.newPage();
    await hp.goto(BASE, { waitUntil: 'load' });
    await hp.waitForSelector('.cal-grid'); await hp.waitForTimeout(450);
    const r = await hp.evaluate(() => {
      const lbl = document.querySelector('.day[data-date="2026-09-25"] .day-holiday');
      const bar = document.querySelector('.tabbar').getBoundingClientRect();
      const lr = lbl.getBoundingClientRect();
      const cx = lr.left + lr.width / 2, cy = lr.top + lr.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const overlapY = Math.max(0, Math.min(lr.bottom, bar.bottom) - Math.max(lr.top, bar.top));
      return {
        labelTop: +lr.top.toFixed(2), labelBottom: +lr.bottom.toFixed(2),
        barTop: +bar.top.toFixed(2), barBottom: +bar.bottom.toFixed(2),
        overlapY: +overlapY.toFixed(2),
        // 命中测试：标签中心点最上层是谁？
        hitTag: hit ? hit.tagName.toLowerCase() : null,
        hitCls: hit ? (hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : String(hit.className)) : null,
        hitIsTabbar: !!(hit && (hit.closest('.tabbar') !== null)),
        scrollY: window.scrollY,
      };
    });
    console.log(`  ${tag}`);
    console.log(`    标签 y=${r.labelTop}~${r.labelBottom}  导航栏 y=${r.barTop}~${r.barBottom}  垂直重叠=${r.overlapY}px`);
    console.log(`    标签中心命中元素 = <${r.hitTag} class="${r.hitCls}">  是否被导航栏压住=${r.hitIsTabbar}`);
    const isTarget = h === 852;
    if (isTarget) {
      // 打包 App / 全屏 WebView 就是 393x852（viewport-fit=cover），这才是验收口径
      ok(`${tag}：首屏「中秋节」未被导航栏遮挡（命中测试）`, !r.hitIsTabbar,
        r.hitIsTabbar ? `被 <${r.hitCls}> 压住，重叠 ${r.overlapY}px` : `命中 ${r.hitTag}.${r.hitCls}`);
    } else if (r.hitIsTabbar) {
      // 带浏览器 chrome 的矮视口：不是验收口径（打包 App 没有这条地址栏），但确实要滚动才看得见
      warn(`${tag}：首屏「中秋节」被浮动导航栏压住`,
        `标签 ${r.labelTop}~${r.labelBottom} 与导航栏 ${r.barTop}~${r.barBottom} 重叠 ${r.overlapY}px，命中 <${r.hitCls}>，需滚动`);
    } else {
      ok(`${tag}：首屏「中秋节」未被遮挡`, true, `命中 ${r.hitTag}.${r.hitCls}`);
    }
    await hp.screenshot({ path: join(shotDir, `verify-cal-firstpaint-${w}x${h}.png`) });
    await hctx.close();
  }
}

await ctx.close();
await browser.close();

console.log('\n' + '─'.repeat(74));
if (warns.length) {
  console.log(`⚠️  ${warns.length} 条「非验收口径但需知会」的记录：`);
  for (const w of warns) console.log('   · ' + w);
  console.log('─'.repeat(74));
}
if (fails.length === 0) {
  console.log(`✅ B 项（日历节假日显示）全部通过：${pass} 项断言，0 失败`);
  console.log('─'.repeat(74));
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log('   · ' + f);
  console.log('─'.repeat(74));
  process.exit(1);
}
