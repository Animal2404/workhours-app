/* ============================================================
   底部导航「黄色按钮」居中测量
   ------------------------------------------------------------
   用户反馈：底部导航栏里的黄色按钮不是水平居中，右边多出一截。

   对应元素是 src/components/TabBar.tsx 的 .tab-pill
   （滑动药丸指示器；深色模式下 --brand 是暖金色 = 用户说的「黄色」）。

   已定位的根因：
     药丸水平位置 = JS 量出的 offsetLeft（原点是 padding edge），
     而不写 left 时绝对定位元素会用「静态位置」（内容盒起点），
     两者正好差一个 padding-left = 8px → 药丸整体右移 8px。

   判定标准（对齐到当前 tab 才算对）：
     1. 药丸与当前 tab 的左/右/中心偏差 ≤ 1px
     2. 药丸宽度与 tab 宽度差 ≤ 1px
     3. 药丸不得溢出导航栏内容边界（左右留白 ≥ -1px）
     4. 无横向滚动条
     5. 垂直方向与 tab 对齐

   缩放口径说明：这里用「浏览器缩放」的真实语义 —— 缩放后 CSS 视口变小、
   DPR 变大，而不是设 CSS zoom 属性（那是另一套坐标空间，会误导测量）。
   ============================================================ */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

async function measure({ width, height, dpr, label }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const rows = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('.tab').nth(i).click();
    await page.waitForTimeout(420); // 等 transform/width 过渡结束

    const m = await page.evaluate((idx) => {
      const bar = document.querySelector('.tabbar');
      const pill = document.querySelector('.tab-pill');
      const tab = document.querySelectorAll('.tab')[idx];
      if (!bar || !pill || !tab) return null;

      const cs = getComputedStyle(bar);
      const br = bar.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      const tr = tab.getBoundingClientRect();

      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const brw = parseFloat(cs.borderRightWidth) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const prr = parseFloat(cs.paddingRight) || 0;
      const contentLeft = br.left + bl + pl;
      const contentRight = br.right - brw - prr;

      return {
        activeIndex: idx,
        devLeft: +(pr.left - tr.left).toFixed(2),
        devRight: +(pr.right - tr.right).toFixed(2),
        devCenter: +((pr.left + pr.width / 2) - (tr.left + tr.width / 2)).toFixed(2),
        devWidth: +(pr.width - tr.width).toFixed(2),
        devTop: +(pr.top - tr.top).toFixed(2),
        devBottom: +(pr.bottom - tr.bottom).toFixed(2),
        pillGapLeft: +(pr.left - contentLeft).toFixed(2),
        pillGapRight: +(contentRight - pr.right).toFixed(2),
        overflowsDoc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, i);

    if (m) rows.push(m);
  }

  await ctx.close();
  await browser.close();
  return rows;
}

/* 浏览器缩放：CSS 视口 = 物理宽 / 缩放，DPR = 基础 DPR × 缩放 */
const z = (zoom) => ({ w: Math.round(393 / zoom), d: +(3 * zoom).toFixed(2) });

const CASES = [
  { label: 'iPhone14Pro', width: 393, height: 852, dpr: 3 },
  { label: '窄屏320', width: 320, height: 640, dpr: 2 },
  { label: '窄屏360', width: 360, height: 780, dpr: 3 },
  { label: '宽屏768', width: 768, height: 1024, dpr: 2 },
  { label: '缩放80%', width: z(0.8).w, height: 1065, dpr: z(0.8).d },
  { label: '缩放100%', width: 393, height: 852, dpr: 3 },
  { label: '缩放125%', width: z(1.25).w, height: 682, dpr: z(1.25).d },
  { label: '缩放150%', width: z(1.5).w, height: 568, dpr: z(1.5).d },
  { label: 'DPR1', width: 393, height: 852, dpr: 1 },
  { label: 'DPR2', width: 393, height: 852, dpr: 2 },
];

let worstAlign = 0;
let worstWidth = 0;
let worstOverhang = 0;
let worstVert = 0;
let overflowCount = 0;
const problems = [];

console.log('\n逐个 tab 点过去，量「药丸 vs 当前 tab」的偏差（单位 px）\n');
console.log('视口          物理宽   tab  左偏差  右偏差  中心偏差  宽差   上偏差  下偏差  左留白  右留白');
console.log('─'.repeat(100));

for (const c of CASES) {
  const rows = await measure(c);
  for (const r of rows) {
    const align = Math.max(Math.abs(r.devLeft), Math.abs(r.devRight), Math.abs(r.devCenter));
    const vert = Math.max(Math.abs(r.devTop), Math.abs(r.devBottom));
    const overhang = Math.max(0, -r.pillGapLeft, -r.pillGapRight);

    worstAlign = Math.max(worstAlign, align);
    worstWidth = Math.max(worstWidth, Math.abs(r.devWidth));
    worstVert = Math.max(worstVert, vert);
    worstOverhang = Math.max(worstOverhang, overhang);
    if (r.overflowsDoc) overflowCount++;

    if (align > 1) problems.push(`${c.label} tab${r.activeIndex}: 对齐偏差 ${align}px`);
    if (overhang > 1) problems.push(`${c.label} tab${r.activeIndex}: 溢出内容边界 ${overhang}px`);

    console.log(
      `${c.label.padEnd(13)} ${String(c.width).padStart(5)}  ${r.activeIndex}  ` +
        `${String(r.devLeft).padStart(7)} ${String(r.devRight).padStart(7)} ` +
        `${String(r.devCenter).padStart(8)} ${String(r.devWidth).padStart(6)} ` +
        `${String(r.devTop).padStart(7)} ${String(r.devBottom).padStart(7)} ` +
        `${String(r.pillGapLeft).padStart(7)} ${String(r.pillGapRight).padStart(7)}`,
    );
  }
}

console.log('─'.repeat(100));
const ok =
  worstAlign <= 1 && worstWidth <= 1 && worstOverhang <= 1 && overflowCount === 0 && worstVert <= 1;

console.log(`药丸 vs tab 最大对齐偏差 : ${worstAlign.toFixed(2)}px  ${worstAlign <= 1 ? '✅' : '❌ 应 ≤1px'}`);
console.log(`药丸与 tab 最大宽度差    : ${worstWidth.toFixed(2)}px  ${worstWidth <= 1 ? '✅' : '❌ 应 ≤1px'}`);
console.log(`药丸最大溢出内容边界     : ${worstOverhang.toFixed(2)}px  ${worstOverhang <= 1 ? '✅' : '❌ 应 ≤1px'}`);
console.log(`垂直最大偏差             : ${worstVert.toFixed(2)}px  ${worstVert <= 1 ? '✅' : '❌ 应 ≤1px'}`);
console.log(`横向溢出用例数           : ${overflowCount}  ${overflowCount === 0 ? '✅' : '❌'}`);
console.log('─'.repeat(100));
if (problems.length) {
  console.log('问题清单：');
  for (const p of problems.slice(0, 20)) console.log('  · ' + p);
}
console.log(ok ? '✅ 底部导航居中全部达标' : '❌ 未达标');
process.exit(ok ? 0 : 1);
