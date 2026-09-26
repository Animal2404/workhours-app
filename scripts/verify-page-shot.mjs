/* ============================================================
   独立验证 · 页面级冒烟截图（供 delivery gate 的 page-verify 用）
   ------------------------------------------------------------
   本会话 bash 通道不可用（ctx.shell.execute is not a function），
   改用 pwsh 跑；截图后用 read_image 人工复核。

   运行：node scripts/verify-page-shot.mjs
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

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const t0 = Date.now();
const resp = await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.cal-grid', { timeout: 15000 });
await page.waitForTimeout(500);
const loadMs = Date.now() - t0;

// 关键事实自检
const facts = await page.evaluate(() => {
  const cell = document.querySelector('.day[data-date="2026-09-25"]');
  const lbl = cell?.querySelector('.day-holiday');
  const bar = document.querySelector('.tabbar')?.getBoundingClientRect();
  const pill = document.querySelector('.tab-pill')?.getBoundingClientRect();
  const tab = document.querySelector('.tab.is-on')?.getBoundingClientRect();
  return {
    month: (() => { const e = document.querySelector('.cal-month'); const c = e.cloneNode(true); c.querySelector('em')?.remove(); return c.textContent.trim(); })(),
    holidayText: lbl?.textContent ?? null,
    holidayColor: lbl ? getComputedStyle(lbl).color : null,
    tabbarH: bar ? +bar.height.toFixed(2) : null,
    pillCenterDev: (pill && tab) ? +((pill.left + pill.width / 2) - (tab.left + tab.width / 2)).toFixed(3) : null,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
});

const out = join(shotDir, 'verify-page-final.png');
await page.screenshot({ path: out, fullPage: false });
const outFull = join(shotDir, 'verify-page-final-full.png');
await page.screenshot({ path: outFull, fullPage: true });

console.log(`HTTP        : ${resp?.status()}`);
console.log(`BASE        : ${BASE}`);
console.log(`加载耗时     : ${loadMs} ms`);
console.log(`当前月份     : ${facts.month}`);
console.log(`09-25 标签   : ${JSON.stringify(facts.holidayText)}  颜色 ${facts.holidayColor}`);
console.log(`导航栏高度   : ${facts.tabbarH} px`);
console.log(`药丸中心偏差 : ${facts.pillCenterDev} px`);
console.log(`横向滚动条   : ${facts.hScroll ? '有' : '无'}`);
console.log(`页面报错     : ${errs.length === 0 ? '无' : errs.join(' | ')}`);
console.log(`截图         : ${out}`);
console.log(`截图(全页)   : ${outFull}`);

await ctx.close();
await browser.close();

const bad = errs.length > 0 || facts.holidayText !== '中秋节' || facts.hScroll;
console.log(bad ? '\n❌ 页面冒烟未通过' : '\n✅ 页面冒烟通过');
process.exit(bad ? 1 : 0);
