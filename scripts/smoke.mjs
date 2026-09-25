/* 交付冒烟：对新构建的产物跑一次无头浏览器，存证截图 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const resp = await page.goto(BASE, { waitUntil: 'networkidle' });
console.log(`HTTP 状态: ${resp?.status()}`);

// 灌一份演示数据，让截图里有内容可核对
await page.evaluate(() => {
  const raw = {
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥',
      monthlyGoalIncome: 3000, dailyGoalHours: 8, weekStartsMonday: true,
      reminderEnabled: false, reminderTime: '20:00', theme: 'light',
      templates: [
        { id: 't-std', name: '正常班', hours: 8, overtimeHours: 0 },
        { id: 't-long', name: '长班', hours: 10, overtimeHours: 0 },
        { id: 't-ot', name: '加班', hours: 8, overtimeHours: 2 },
        { id: 't-half', name: '半天', hours: 4, overtimeHours: 0 },
      ],
      recurring: [],
    },
    entries: {},
  };
  const today = new Date();
  const hrs = [8, 10, 9, 7.5, 6, 8.5, 12, 10];
  for (let i = 1; i <= 8; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    raw.entries[k] = {
      date: k, hours: hrs[i - 1], overtimeHours: i % 3 === 0 ? 1.5 : 0,
      allowance: i === 2 ? 30 : 0, deduction: i === 4 ? 20 : 0,
      note: i === 1 ? '门店晚班' : '', updatedAt: Date.now(),
    };
  }
  localStorage.setItem('workhours.state.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const title = await page.locator('.topbar-title').first().textContent();
const hero = await page.locator('.hero-value').textContent();

await page.screenshot({ path: 'verification/page-smoke.png' });
await page.screenshot({ path: 'verification/page-full.png', fullPage: true });

// 核对：逐天相加 == 页面显示
const check = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('workhours.state.v1') ?? '{}');
  const rate = raw.settings.hourlyRate;
  const mult = raw.settings.overtimeMultiplier;
  let total = 0;
  for (const e of Object.values(raw.entries)) {
    const gross = e.hours * rate + e.overtimeHours * rate * mult + (e.allowance || 0);
    total += Math.round((gross - (e.deduction || 0)) * 100) / 100;
  }
  total = Math.round(total * 100) / 100;
  const shown = document.querySelector('.hero-value')?.textContent?.replace(/[^\d.]/g, '');
  return { total: String(total), shown };
});

console.log(`页面标题: ${title}`);
console.log(`本月已赚: ${hero}`);
console.log(`逐天相加: ${check.total} | 页面显示: ${check.shown}`);
console.log(`数值一致: ${check.total === check.shown ? '✅' : '❌'}`);
console.log(`JS 报错: ${errors.length === 0 ? '✅ 无' : '❌ ' + errors.join(' | ')}`);

await browser.close();
process.exit(check.total === check.shown && errors.length === 0 ? 0 : 1);
