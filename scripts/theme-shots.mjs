/* 深色主题改版后，四个页面各拍一张（外加浅色对照），逐张人工复核 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = 'verification';
await mkdir(OUT, { recursive: true });

const baseSettings = {
  hourlyRate: 17,
  overtimeMultiplier: 1.5,
  currency: '¥',
  monthlyGoalIncome: 3000,
  dailyGoalHours: 8,
  weekStartsMonday: true,
  reminderEnabled: false,
  reminderTime: '20:00',
  templates: [],
  recurring: [],
  savingsGoals: [
    { id: 'g1', name: '买 iPhone 18', target: 7999, startDate: '2026-09-01', initial: 0, createdAt: 1 },
  ],
};

const entries = {};
const put = (d, h, ot = 0, al = 0, de = 0) => {
  entries[d] = { date: d, hours: h, overtimeHours: ot, allowance: al, deduction: de, updatedAt: 1 };
};
[['2026-09-08', 8], ['2026-09-09', 10], ['2026-09-10', 10], ['2026-09-11', 10], ['2026-09-12', 9.5]]
  .forEach(([d, h]) => put(d, h));
put('2026-10-05', 8, 0, 30); // 带补贴 → 触发小圆点
for (let d = 6; d <= 10; d++) put(`2026-10-${String(d).padStart(2, '0')}`, 10, 2);
put('2026-10-01', 8, 3);

const browser = await chromium.launch();

async function shoot(theme, pages) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 900 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(
    (s) => {
      localStorage.clear();
      localStorage.setItem('workhours.state.v1', JSON.stringify(s));
    },
    { version: 1, settings: { ...baseSettings, theme }, entries },
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);

  for (const [label, tab] of pages) {
    if (tab) {
      await page.locator(`nav.tabbar button:has-text("${tab}")`).first().click();
      await page.waitForTimeout(700);
    }
    // 等 NumberTicker 之类滚完
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/theme-${theme}-${label}.png` });
    console.log(`  📸 ${OUT}/theme-${theme}-${label}.png`);
  }
  await ctx.close();
}

await shoot('dark', [
  ['calendar', null],
  ['stats', '统计'],
  ['goals', '目标'],
  ['settings', '我的'],
]);
await shoot('light', [['calendar', null]]);

await browser.close();
