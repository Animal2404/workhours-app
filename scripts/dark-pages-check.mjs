/* 抽查深色模式其余页面：统计 / 目标 / 设置 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('shots', { recursive: true });

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
      hourlyRate: 20, overtimeMultiplier: 1.5, currency: '¥',
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
  const hrs = [8, 10, 9, 7.5, 6, 8.5, 12, 10, 8, 9.5];
  for (let i = 1; i <= 10; i++) {
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
await p.waitForTimeout(1200);

for (const [name, label] of [['18-dark-stats', '统计'], ['19-dark-goals', '目标'], ['20-dark-settings', '我的']]) {
  await p.getByRole('button', { name: label }).click();
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `shots/${name}.png` });
  console.log(`  📸 ${name}.png`);
}

await b.close();
console.log('完成');
