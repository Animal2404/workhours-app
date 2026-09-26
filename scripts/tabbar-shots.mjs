/* ============================================================
   底部导航居中：前后对比图
   ------------------------------------------------------------
   「修复前」怎么来的要说清楚，不能拿假图糊弄：
   修复的根因是 .tab-pill 少了 left/top:0，导致它退回「静态位置」
   （内容盒起点），而 JS 给的偏移量是相对 padding edge 的，
   两者差一个 padding-left(8px) 与 border-top(1px)。
   所以这里把这两条 CSS 覆写回去，就精确复现了修复前的渲染结果 ——
   不是画出来的，是真实渲染出来的。
   配套的数值证据见 tabbar-center-check.mjs 的输出（8px → 0px）。
   ============================================================ */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

/* 修复前的等价 CSS：取消显式原点 → 回到静态位置 */
const BEFORE_CSS = `.tab-pill { left: auto !important; top: 6px !important; }`;

const browser = await chromium.launch();

async function shot({ tabIndex, before, out }) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  if (before) await page.addStyleTag({ content: BEFORE_CSS });
  await page.waitForTimeout(200);

  await page.locator('.tab').nth(tabIndex).click();
  await page.waitForTimeout(500);

  const bar = page.locator('.tabbar');
  await bar.screenshot({ path: out });

  const m = await page.evaluate((idx) => {
    const barEl = document.querySelector('.tabbar');
    const pill = document.querySelector('.tab-pill');
    const tab = document.querySelectorAll('.tab')[idx];
    const cs = getComputedStyle(barEl);
    const br = barEl.getBoundingClientRect();
    const pr = pill.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const contentRight =
      br.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
    return {
      药丸相对tab左偏: +(pr.left - tr.left).toFixed(2),
      药丸相对tab右偏: +(pr.right - tr.right).toFixed(2),
      药丸右边缘越出内容边界: +(pr.right - contentRight).toFixed(2),
    };
  }, tabIndex);

  await ctx.close();
  console.log(`  ${out}`);
  console.log(`     ${JSON.stringify(m, null, 0).replace(/"/g, '')}`);
}

console.log('\n最后一个 tab（最右边，最容易看出「右边多出一截」）：');
await shot({ tabIndex: 3, before: true, out: 'verification/lead-tabbar-before.png' });
await shot({ tabIndex: 3, before: false, out: 'verification/lead-tabbar-after.png' });

console.log('\n第一个 tab（默认打开就在这，看着「没居中」）：');
await shot({ tabIndex: 0, before: true, out: 'verification/lead-tabbar-before-tab0.png' });
await shot({ tabIndex: 0, before: false, out: 'verification/lead-tabbar-after-tab0.png' });

await browser.close();
console.log('\n✅ 对比图已生成到 verification/');
