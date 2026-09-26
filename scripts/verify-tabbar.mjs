/* ============================================================
   独立验证 · C：底部导航「黄色按钮」(.tab-pill) 是否水平居中
   ------------------------------------------------------------
   用户说的「黄色按钮」= .tab-pill（滑动药丸指示器）。
   深色模式下 --brand 是暖金，看起来就是黄色。

   缩放口径（按任务书要求，用真实语义）：
     浏览器缩放 = CSS 视口变小 + DPR 变大
       CSS viewport width = 基础物理宽 / zoom
       deviceScaleFactor  = 基础 DPR × zoom
   **不设 CSS zoom 属性** —— 那是另一套坐标空间，量出来的数会骗人。

   本脚本独立于作者的 scripts/tabbar-center-check.mjs（未修改它），
   口径可交叉对照，但测量点更多（含纵向、含内容盒留白、含重构图 before）。

   运行：node scripts/verify-tabbar.mjs
   ============================================================ */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotDir = join(root, 'verification');
mkdirSync(shotDir, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

let pass = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  [' + detail + ']' : ''}`); }
  else { fails.push(`${name} ${detail}`); console.log(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name, a === e, a === e ? `=${e}` : `期望 ${e} 实际 ${a}`);
}

/* 浏览器缩放的真实语义 */
const zoomCase = (zoom, baseW = 393, baseDpr = 3) => ({
  width: Math.round(baseW / zoom),
  dpr: +(baseDpr * zoom).toFixed(2),
});

const CASES = [
  { label: '320px窄屏', width: 320, height: 640, dpr: 2 },
  { label: '320px@DPR3', width: 320, height: 640, dpr: 3 },
  { label: '360px窄屏', width: 360, height: 780, dpr: 3 },
  { label: 'iPhone14Pro', width: 393, height: 852, dpr: 3 },
  { label: '宽窗口900', width: 900, height: 800, dpr: 1 },
  { label: '宽窗口1440', width: 1440, height: 900, dpr: 2 },
  { label: 'DPR1', width: 393, height: 852, dpr: 1 },
  { label: 'DPR2', width: 393, height: 852, dpr: 2 },
  { label: 'DPR3', width: 393, height: 852, dpr: 3 },
  { label: '缩放80%', ...zoomCase(0.8), height: 1065 },
  { label: '缩放100%', ...zoomCase(1.0), height: 852 },
  { label: '缩放125%', ...zoomCase(1.25), height: 682 },
  { label: '缩放150%', ...zoomCase(1.5), height: 568 },
];

const browser = await chromium.launch();

/** 在给定环境里量 4 个 tab 的药丸对齐情况 */
async function measureCase(c, { dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dpr,
    isMobile: true, hasTouch: true, locale: 'zh-CN',
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.tabbar', { timeout: 15000 });
  await page.waitForTimeout(300);

  const rows = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('.tab').nth(i).click();
    await page.waitForTimeout(430); // 等 transform / width 过渡跑完
    const m = await page.evaluate((idx) => {
      const bar = document.querySelector('.tabbar');
      const pill = document.querySelector('.tab-pill');
      const tabs = document.querySelectorAll('.tab');
      const tab = tabs[idx];
      if (!bar || !pill || !tab) return null;
      const barCs = getComputedStyle(bar);
      const pillCs = getComputedStyle(pill);
      const tabCs = getComputedStyle(tab);
      const br = bar.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      const tr = tab.getBoundingClientRect();

      const num = (v) => parseFloat(v) || 0;
      const contentLeft = br.left + num(barCs.borderLeftWidth) + num(barCs.paddingLeft);
      const contentRight = br.right - num(barCs.borderRightWidth) - num(barCs.paddingRight);
      const contentTop = br.top + num(barCs.borderTopWidth) + num(barCs.paddingTop);
      const contentBottom = br.bottom - num(barCs.borderBottomWidth) - num(barCs.paddingBottom);

      return {
        idx,
        tabCount: tabs.length,
        labels: [...tabs].map((t) => t.querySelector('.tab-label')?.textContent ?? null),
        onIndex: [...tabs].findIndex((t) => t.classList.contains('is-on')),
        ariaCurrentIndex: [...tabs].findIndex((t) => t.getAttribute('aria-current') === 'page'),

        devLeft: +(pr.left - tr.left).toFixed(3),
        devRight: +(pr.right - tr.right).toFixed(3),
        devCenter: +((pr.left + pr.width / 2) - (tr.left + tr.width / 2)).toFixed(3),
        devWidth: +(pr.width - tr.width).toFixed(3),
        devTop: +(pr.top - tr.top).toFixed(3),
        devBottom: +(pr.bottom - tr.bottom).toFixed(3),
        devHeight: +(pr.height - tr.height).toFixed(3),

        pillGapLeft: +(pr.left - contentLeft).toFixed(3),
        pillGapRight: +(contentRight - pr.right).toFixed(3),
        pillGapBottom: +(contentBottom - pr.bottom).toFixed(3),
        overhangLeft: +Math.max(0, contentLeft - pr.left).toFixed(3),
        overhangRight: +Math.max(0, pr.right - contentRight).toFixed(3),

        barRect: { x: +br.x.toFixed(2), y: +br.y.toFixed(2), w: +br.width.toFixed(2), h: +br.height.toFixed(2) },
        barW: +br.width.toFixed(2), barH: +br.height.toFixed(2),
        barRadius: barCs.borderRadius, barBg: barCs.backgroundColor,
        barShadow: barCs.boxShadow.slice(0, 60),
        barPadding: `${barCs.paddingTop} ${barCs.paddingRight} ${barCs.paddingBottom} ${barCs.paddingLeft}`,
        barBottomFromViewport: +(window.innerHeight - br.bottom).toFixed(2),

        pillW: +pr.width.toFixed(3), pillH: +pr.height.toFixed(3),
        pillRadius: pillCs.borderRadius, pillBgImage: pillCs.backgroundImage.slice(0, 80),
        pillShadow: pillCs.boxShadow.slice(0, 60), pillZ: pillCs.zIndex,
        pillLeft: pillCs.left, pillTop: pillCs.top,
        pillTransform: pillCs.transform,

        tabH: +tr.height.toFixed(3), tabRadius: tabCs.borderRadius,

        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
        bodyScrollW: document.body.scrollWidth,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, i);
    if (m) rows.push(m);
  }
  return { rows, errs, page, ctx };
}

/* ============================================================ */
console.log('\n' + '='.repeat(112));
console.log('C1. 各视口 / 缩放 / DPR 下，药丸 vs 当前 tab 的偏差（单位 px）');
console.log('='.repeat(112));
console.log('用例            视口宽  DPR   tab  左偏差  右偏差  中心偏差   宽差   上偏差  下偏差    左留白   右留白  横向滚动');
console.log('─'.repeat(112));

const allRows = [];
const invariants = [];
let worstAlign = 0, worstAlignAt = '', worstWidth = 0, worstOverhang = 0, worstVert = 0, hScrollCount = 0;
const problems = [];

for (const c of CASES) {
  const { rows, errs, ctx } = await measureCase(c);
  if (errs.length) problems.push(`${c.label}: JS 报错 ${errs.join('|')}`);
  for (const r of rows) {
    const align = Math.max(Math.abs(r.devLeft), Math.abs(r.devRight), Math.abs(r.devCenter));
    const vert = Math.max(Math.abs(r.devTop), Math.abs(r.devBottom), Math.abs(r.devHeight));
    const over = Math.max(r.overhangLeft, r.overhangRight);
    if (align > worstAlign) { worstAlign = align; worstAlignAt = `${c.label} tab${r.idx}`; }
    worstWidth = Math.max(worstWidth, Math.abs(r.devWidth));
    worstVert = Math.max(worstVert, vert);
    worstOverhang = Math.max(worstOverhang, over);
    if (r.hScroll) hScrollCount++;
    if (align > 1) problems.push(`${c.label} tab${r.idx}: 对齐偏差 ${align}px`);
    if (over > 1) problems.push(`${c.label} tab${r.idx}: 溢出内容边界 ${over}px`);
    if (r.hScroll) problems.push(`${c.label} tab${r.idx}: 出现横向滚动条`);

    invariants.push({ label: c.label, ...r });
    allRows.push({ label: c.label, width: c.width, dpr: c.dpr, ...r });
    console.log(
      `${c.label.padEnd(14)} ${String(c.width).padStart(6)} ${String(c.dpr).padStart(5)}  ${r.idx}  ` +
      `${String(r.devLeft).padStart(7)} ${String(r.devRight).padStart(7)} ${String(r.devCenter).padStart(8)} ` +
      `${String(r.devWidth).padStart(7)} ${String(r.devTop).padStart(7)} ${String(r.devBottom).padStart(7)} ` +
      `${String(r.pillGapLeft).padStart(8)} ${String(r.pillGapRight).padStart(8)}   ${r.hScroll ? '有!' : '无'}`,
    );
  }
  await ctx.close();
}
console.log('─'.repeat(112));

/* ============================================================ */
console.log('\n' + '='.repeat(112));
console.log('C2. 判定（阈值 ≤1px）');
console.log('='.repeat(112));
{
  ok('药丸 vs 当前 tab 最大对齐偏差 ≤1px', worstAlign <= 1, `最大 ${worstAlign.toFixed(3)}px @ ${worstAlignAt}`);
  ok('药丸与 tab 最大宽度差 ≤1px', worstWidth <= 1, `最大 ${worstWidth.toFixed(3)}px`);
  ok('药丸最大溢出导航栏内容边界 ≤1px', worstOverhang <= 1, `最大 ${worstOverhang.toFixed(3)}px`);
  ok('药丸垂直方向最大偏差 ≤1px', worstVert <= 1, `最大 ${worstVert.toFixed(3)}px`);
  eq('横向滚动条用例数', hScrollCount, 0);
  console.log(`  共 ${CASES.length} 个用例 × 4 个 tab = ${allRows.length} 次测量`);
  if (problems.length) { console.log('  问题：'); for (const p of problems.slice(0, 20)) console.log('   · ' + p); }
}

/* ============================================================ */
console.log('\n' + '='.repeat(112));
console.log('C3. 不变量：高度 / 背景 / 圆角 / 阴影 / 文案 / 跳转 / 按下反馈');
console.log('='.repeat(112));
{
  const uniqBy = (f) => [...new Set(allRows.map(f))];
  const labels = uniqBy((r) => JSON.stringify(r.labels));
  eq('4 个 tab 文案在所有用例下一致', labels, [JSON.stringify(['日历', '统计', '目标', '我的'])]);
  eq('tab 数量恒为 4', uniqBy((r) => r.tabCount), [4]);
  ok('每次点击后 is-on 都跟着当前 tab 走', allRows.every((r) => r.onIndex === r.idx),
    allRows.filter((r) => r.onIndex !== r.idx).map((r) => `${r.label} tab${r.idx}→on${r.onIndex}`).join(',') || 'OK');
  ok('aria-current="page" 也始终挂在当前 tab', allRows.every((r) => r.ariaCurrentIndex === r.idx),
    allRows.filter((r) => r.ariaCurrentIndex !== r.idx).length + ' 处不符');

  const u = (f) => uniqBy(f);
  eq('药丸高度在所有用例下一致', u((r) => r.pillH), [48]);
  eq('药丸圆角在所有用例下一致', u((r) => r.pillRadius), ['999px']);
  eq('药丸背景（渐变）在所有用例下一致', u((r) => r.pillBgImage).length, 1);
  console.log(`  药丸背景 = ${u((r) => r.pillBgImage)[0]}`);
  eq('药丸 z-index 一致（压在 tab 之下）', u((r) => r.pillZ), ['-1']);
  eq('药丸 left/top 计算值一致（left:0 显式对齐基准）', [u((r) => r.pillLeft), u((r) => r.pillTop)], [['0px'], ['0px']]);
  eq('tab 高度在所有用例下一致', u((r) => r.tabH), [48]);
  eq('导航栏圆角一致', u((r) => r.barRadius), ['999px']);
  eq('导航栏内边距一致', u((r) => r.barPadding), ['0px 8px 0px 8px']);
  eq('导航栏高度一致', u((r) => r.barH), [u((r) => r.barH)[0]]);
  console.log(`  导航栏高度 = ${u((r) => r.barH)[0]}px，背景 = ${u((r) => r.barBg).join(' / ')}`);
  console.log(`  导航栏阴影 = ${u((r) => r.barShadow)[0]}…`);
  console.log(`  药丸阴影   = ${u((r) => r.pillShadow)[0]}…（各用例唯一值 ${u((r) => r.pillShadow).length} 种）`);
  const barWidths = {};
  for (const r of allRows) barWidths[r.label] = r.barW;
  console.log(`  导航栏宽度：${Object.entries(barWidths).map(([k, v]) => `${k}=${v}`).join('  ')}`);
}

/* ============================================================ */
console.log('\n' + '='.repeat(112));
console.log('C4. 独立重构「修复前」：把 .tab-pill 的 left:0 去掉，量化当初那 8px');
console.log('='.repeat(112));
{
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.tabbar'); await page.waitForTimeout(400);

  const grab = () => page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    const pill = document.querySelector('.tab-pill');
    const tab = document.querySelector('.tab.is-on');
    const br = bar.getBoundingClientRect(), pr = pill.getBoundingClientRect(), tr = tab.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    const contentLeft = br.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
    const contentRight = br.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
    return {
      devCenter: +((pr.left + pr.width / 2) - (tr.left + tr.width / 2)).toFixed(3),
      devLeft: +(pr.left - tr.left).toFixed(3),
      overhangRight: +Math.max(0, pr.right - contentRight).toFixed(3),
      gapRight: +(contentRight - pr.right).toFixed(3),
      pillW: +pr.width.toFixed(2), pillH: +pr.height.toFixed(2),
      pillRadius: getComputedStyle(pill).borderRadius,
      pillBg: getComputedStyle(pill).backgroundImage.slice(0, 60),
      left: getComputedStyle(pill).left,
    };
  });

  // ---- 状态 A：当前代码（修好了）----
  await page.locator('.tab').nth(0).click(); await page.waitForTimeout(450);
  const fixed0 = await grab();
  await page.screenshot({ path: join(shotDir, 'verify-tabbar-after-fixed-tab0.png') });
  await page.locator('.tabbar').screenshot({ path: join(shotDir, 'verify-tabbar-after-fixed-tab0-crop.png') });
  await page.locator('.tab').nth(3).click(); await page.waitForTimeout(450);
  const fixed3 = await grab();
  await page.screenshot({ path: join(shotDir, 'verify-tabbar-after-fixed-tab3.png') });
  await page.locator('.tabbar').screenshot({ path: join(shotDir, 'verify-tabbar-after-fixed-tab3-crop.png') });

  // ---- 状态 B：重构修复前（注入 left:auto，绝对定位退回静态位置 = 内容盒起点）----
  await page.addStyleTag({ content: '.tab-pill{left:auto !important}' });
  await page.waitForTimeout(150);
  await page.locator('.tab').nth(0).click(); await page.waitForTimeout(450);
  const buggy0 = await grab();
  await page.screenshot({ path: join(shotDir, 'verify-tabbar-before-buggy-tab0.png') });
  await page.locator('.tabbar').screenshot({ path: join(shotDir, 'verify-tabbar-before-buggy-tab0-crop.png') });
  await page.locator('.tab').nth(3).click(); await page.waitForTimeout(450);
  const buggy3 = await grab();
  await page.screenshot({ path: join(shotDir, 'verify-tabbar-before-buggy-tab3.png') });
  await page.locator('.tabbar').screenshot({ path: join(shotDir, 'verify-tabbar-before-buggy-tab3-crop.png') });

  console.log(`  [after / 当前代码 left:0]      tab0: 中心偏差=${fixed0.devCenter}px 溢出=${fixed0.overhangRight}px 右留白=${fixed0.gapRight}px`);
  console.log(`  [after / 当前代码 left:0]      tab3: 中心偏差=${fixed3.devCenter}px 溢出=${fixed3.overhangRight}px 右留白=${fixed3.gapRight}px`);
  console.log(`  [before / 重构 left:auto]      tab0: 中心偏差=${buggy0.devCenter}px 溢出=${buggy0.overhangRight}px 右留白=${buggy0.gapRight}px  [computed left=${buggy0.left}]`);
  console.log(`  [before / 重构 left:auto]      tab3: 中心偏差=${buggy3.devCenter}px 溢出=${buggy3.overhangRight}px 右留白=${buggy3.gapRight}px`);

  ok('当前代码 tab0 居中（|中心偏差| ≤1px）', Math.abs(fixed0.devCenter) <= 1, `${fixed0.devCenter}px`);
  ok('当前代码 tab3 居中（|中心偏差| ≤1px）', Math.abs(fixed3.devCenter) <= 1, `${fixed3.devCenter}px`);
  ok('当前代码不溢出内容边界（tab0/tab3）',
    fixed0.overhangRight <= 1 && fixed3.overhangRight <= 1,
    `tab0=${fixed0.overhangRight}px tab3=${fixed3.overhangRight}px`);
  ok('重构出的修复前状态确实向右偏移（tab0 中心偏差 >5px）', buggy0.devCenter > 5,
    `中心偏差 ${buggy0.devCenter}px（= 导航栏 padding-left 8px）`);
  ok('重构出的修复前状态在 tab3 右侧溢出（复现用户说的「右边多出一截」）', buggy3.overhangRight > 5,
    `溢出 ${buggy3.overhangRight}px`);
  ok('修复只动了水平位置，高度/圆角/背景三者未变',
    fixed0.pillH === buggy0.pillH && fixed0.pillRadius === buggy0.pillRadius && fixed0.pillBg === buggy0.pillBg,
    `h ${fixed0.pillH}vs${buggy0.pillH} | r ${fixed0.pillRadius}vs${buggy0.pillRadius} | bg 相同=${fixed0.pillBg === buggy0.pillBg}`);

  await ctx.close();
}

/* ============================================================ */
console.log('\n' + '='.repeat(112));
console.log('C5. 按下反馈 / 深色模式 / 底部安全区');
console.log('='.repeat(112));
{
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.tabbar'); await page.waitForTimeout(400);

  // 按下反馈：.tab:active { transform: scale(0.94) }
  const box = await page.locator('.tab').nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const activeTf = await page.locator('.tab').nth(1).evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const restTf = await page.locator('.tab').nth(1).evaluate((el) => getComputedStyle(el).transform);
  console.log(`  按下时 transform = ${activeTf}`);
  console.log(`  松开后 transform = ${restTf}`);
  ok('按下有缩放反馈（scale < 1）',
    /matrix\(0\.9\d/.test(activeTf), activeTf);
  await ctx.close();

  // 深色模式（--brand 是暖金 = 用户说的「黄色」）
  const dctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'zh-CN', colorScheme: 'dark',
  });
  const dpage = await dctx.newPage();
  await dpage.goto(BASE, { waitUntil: 'load' });
  await dpage.waitForSelector('.tabbar'); await dpage.waitForTimeout(400);
  const dark = [];
  for (let i = 0; i < 4; i++) {
    await dpage.locator('.tab').nth(i).click();
    await dpage.waitForTimeout(430);
    dark.push(await dpage.evaluate((idx) => {
      const bar = document.querySelector('.tabbar');
      const pill = document.querySelector('.tab-pill');
      const tab = document.querySelectorAll('.tab')[idx];
      const cs = getComputedStyle(bar);
      const br = bar.getBoundingClientRect(), pr = pill.getBoundingClientRect(), tr = tab.getBoundingClientRect();
      const contentLeft = br.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
      const contentRight = br.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
      return {
        idx, devCenter: +((pr.left + pr.width / 2) - (tr.left + tr.width / 2)).toFixed(3),
        overhang: +Math.max(0, contentLeft - pr.left, pr.right - contentRight).toFixed(3),
        bg: getComputedStyle(pill).backgroundImage.slice(0, 70),
      };
    }, i));
  }
  const worstDark = Math.max(...dark.map((d) => Math.abs(d.devCenter)));
  const worstDarkOver = Math.max(...dark.map((d) => d.overhang));
  ok('深色模式药丸居中（|中心偏差| ≤1px）', worstDark <= 1, `最大 ${worstDark}px`);
  ok('深色模式不溢出', worstDarkOver <= 1, `最大 ${worstDarkOver}px`);
  console.log(`  深色药丸背景 = ${dark[0].bg}`);
  await dpage.screenshot({ path: join(shotDir, 'verify-tabbar-dark-AFTER.png') });

  // 底部安全区：env(safe-area-inset-bottom) 在 Chromium 里恒为 0，无法真实模拟 iPhone home indicator
  const sa = await dpage.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    const br = bar.getBoundingClientRect();
    // 正确量 env()：让探针的高度等于 env()，读它的 rect.height。
    // （给 bottom:env() 再读 bottom 是错的，那读到的是视口底部。）
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom, 0px);pointer-events:none';
    document.body.appendChild(probe);
    const envPx = +probe.getBoundingClientRect().height.toFixed(2);
    probe.remove();
    return { bottom: +br.bottom.toFixed(2), innerH: window.innerHeight,
      gap: +(window.innerHeight - br.bottom).toFixed(2), envPx };
  });
  console.log(`  视口高=${sa.innerH}  导航栏底边 y=${sa.bottom}  → 距视口底 ${sa.gap}px`);
  console.log(`  env(safe-area-inset-bottom) 实测 = ${sa.envPx}px（Chromium 桌面引擎恒为 0）`);
  ok('导航栏未超出视口底部', sa.gap >= 0, `gap=${sa.gap}px`);
  await dctx.close();
}

await browser.close();

console.log('\n' + '─'.repeat(112));
if (fails.length === 0) {
  console.log(`✅ C 项（底部导航居中）全部通过：${pass} 项断言，0 失败`);
  console.log('─'.repeat(112));
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log('   · ' + f);
  console.log('─'.repeat(112));
  process.exit(1);
}
