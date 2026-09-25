/* 抽查深色模式英雄卡（用户主要不满的地方） */
import { chromium, devices } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({
  ...devices['iPhone 14 Pro'],
  colorScheme: 'dark',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

await p.evaluate(() => {
  const raw = {
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥',
      monthlyGoalIncome: 3000, dailyGoalHours: 8, weekStartsMonday: true,
      reminderEnabled: false, reminderTime: '20:00', theme: 'dark',
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
      allowance: i === 2 ? 30 : 0, deduction: i === 4 ? 20 : 0, note: '', updatedAt: Date.now(),
    };
  }
  localStorage.setItem('workhours.state.v1', JSON.stringify(raw));
});

await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: 'shots/17-dark-hero.png' });

const info = await p.evaluate(() => {
  const hero = document.querySelector('.hero-card');
  const day = document.querySelector('.day.is-full');
  const cs = getComputedStyle(hero);
  return {
    heroBg: cs.backgroundImage.slice(0, 110),
    heroColor: cs.color,
    dayFullBg: day ? getComputedStyle(day).backgroundImage.slice(0, 90) : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    pill: getComputedStyle(document.querySelector('.tab-pill')).backgroundImage.slice(0, 90),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
