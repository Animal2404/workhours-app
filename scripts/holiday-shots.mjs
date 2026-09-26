/* 节假日显示的视觉证据：浅色 / 深色 各一张（截日历卡片） */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();

async function shot({ theme, out, width = 393 }) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  await ctx.addInitScript(
    ([t]) => {
      localStorage.setItem(
        'workhours.state.v1',
        JSON.stringify({
          version: 1,
          settings: { theme: t, hourlyRate: 20, dailyGoalHours: 8, monthlyGoalIncome: 3000 },
          entries: {
            // 让 25 号（中秋节）同时有工时，验证三行叠加的真实观感
            '2026-09-25': { date: '2026-09-25', hours: 10, overtimeHours: 2, allowance: 0, deduction: 0 },
            '2026-09-18': { date: '2026-09-18', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0 },
          },
        }),
      );
    },
    [theme],
  );
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // 只截日历那张卡片，看得清
  const card = page.locator('.card', { has: page.locator('.cal-grid') }).first();
  await card.screenshot({ path: out });
  console.log(`  📸 ${out}`);
  await ctx.close();
}

console.log('\n节假日显示：');
await shot({ theme: 'light', out: 'verification/lead-holiday-light.png' });
await shot({ theme: 'dark', out: 'verification/lead-holiday-dark.png' });
await shot({ theme: 'light', out: 'verification/lead-holiday-320.png', width: 320 });

await browser.close();
console.log('✅ 截图完成');
