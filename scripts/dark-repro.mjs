/* 复刻用户截图里的那屏（深色模式 + 同样的数据），用来定位配色问题
   用户数据：时薪 17，10 月 5 日 8h、6~10 日各 12h（共 68h / ¥1,156）
   累计 11 天 ¥1,963.5（9 月另有 5 天） */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = 'verification';
await mkdir(OUT, { recursive: true });

const SETTINGS = {
  hourlyRate: 17,
  overtimeMultiplier: 1,
  currency: '¥',
  monthlyGoalIncome: 0,
  dailyGoalHours: 8,
  weekStartsMonday: true,
  reminderEnabled: false,
  reminderTime: '20:00',
  theme: 'dark',
  templates: [],
  recurring: [],
  savingsGoals: [],
};

const entries = {};
const put = (d, h) => {
  entries[d] = { date: d, hours: h, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 };
};
// 9 月：5 天，合计 ¥807.5（47.5h × 17）
[['2026-09-08', 8], ['2026-09-09', 10], ['2026-09-10', 10], ['2026-09-11', 10], ['2026-09-12', 9.5]]
  .forEach(([d, h]) => put(d, h));
// 10 月：5 日 8h，6~10 日 12h
put('2026-10-05', 8);
for (let d = 6; d <= 10; d++) put(`2026-10-${String(d).padStart(2, '0')}`, 12);

const seed = { version: 1, settings: SETTINGS, entries };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 900 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate((s) => {
  localStorage.clear();
  localStorage.setItem('workhours.state.v1', JSON.stringify(s));
}, seed);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);

// 数值自检：确认复刻对了
const read = await page.evaluate(() => ({
  hero: document.querySelector('.hero-value')?.textContent?.trim(),
  total: document.querySelector('.hero-total')?.textContent?.replace(/\s+/g, ' ').trim(),
  meta: [...document.querySelectorAll('.hero-meta-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}));
console.log('复刻结果：');
console.log('  本月已赚:', read.hero);
console.log('  累计行  :', read.total);
console.log('  指标    :', read.meta.join(' | '));

// 取关键元素的计算样式，用来精确定位颜色问题
const colors = await page.evaluate(() => {
  const g = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  };
  return {
    heroCard: g('.hero-card', ['backgroundImage', 'color']),
    heroTotal: g('.hero-total', ['backgroundColor', 'color']),
    heroMom: g('.hero-mom', ['backgroundColor', 'color']),
    dayFull: g('.day.is-full', ['backgroundImage', 'color']),
    dayFullNum: g('.day.is-full .day-num', ['color']),
    dayFullMoney: g('.day.is-full .day-money', ['color']),
    dayFullHoliday: g('.day.is-full .day-holiday', ['color']),
    body: g('body', ['backgroundColor']),
    card: g('.card', ['backgroundColor']),
    tabPill: g('.tab-pill', ['backgroundColor']),
  };
});
console.log('\n关键配色（实测 computed）：');
for (const [k, v] of Object.entries(colors)) {
  console.log(`  ${k.padEnd(16)} ${JSON.stringify(v)}`);
}

await page.screenshot({ path: `${OUT}/dark-repro-full.png`, fullPage: false });
await page.locator('.hero-card').screenshot({ path: `${OUT}/dark-repro-hero.png` });
console.log(`\n截图: ${OUT}/dark-repro-full.png , ${OUT}/dark-repro-hero.png`);

await ctx.close();
await browser.close();
