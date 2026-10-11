/* CPU 采样：找出长任务到底花在哪。
   用 CDP Profiler 抓 JS 自耗时最高的函数，而不是靠猜。 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SCENARIO = process.argv[2] ?? 'batch';

const SEED = {
  version: 1,
  settings: {
    hourlyRate: 17, overtimeMultiplier: 1.5, currency: '¥', monthlyGoalIncome: 3000,
    dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false, reminderTime: '20:00',
    theme: 'light', templates: [], recurring: [],
    savingsGoals: [{ id: 'g1', name: '买 iPhone 18', target: 7999, startDate: '2026-09-01', initial: 0, createdAt: 1 }],
  },
  entries: (() => {
    const e = {};
    const put = (d, h, ot = 0) => { e[d] = { date: d, hours: h, overtimeHours: ot, allowance: 0, deduction: 0, updatedAt: 1 }; };
    for (let d = 1; d <= 28; d++) { const k = `2026-09-${String(d).padStart(2, '0')}`; if (d % 7 !== 0) put(k, 8, d % 5 === 0 ? 2 : 0); }
    for (let d = 1; d <= 11; d++) put(`2026-10-${String(d).padStart(2, '0')}`, 10, 2);
    return e;
  })(),
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('workhours.state.v1', JSON.stringify(s)); }, SEED);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');

/* 在页面内派发 click —— 不用 locator.click()。
   Playwright 的可点性检查会自己调用 elementsFromPoint/getBoundingClientRect，
   在 4x 降速下自身就吃掉 300ms+，会把「测试框架开销」算成 App 的开销。 */
const fireTab = (t) =>
  page.evaluate((x) => {
    const el = [...document.querySelectorAll('nav.tabbar button')].find((e) => e.textContent.includes(x));
    if (!el) throw new Error('no tab ' + x);
    el.click();
  }, t);
const fireAria = (l) =>
  page.evaluate((x) => document.querySelector(`[aria-label="${x}"]`)?.click(), l);

if (SCENARIO === 'batch') {
  await fireAria('批量记账');
  await page.waitForTimeout(250);
  const n = await page.evaluate(() => document.querySelectorAll('.day[data-date]').length);
  for (let i = 0; i < Math.min(20, n); i++) {
    await page.evaluate((k) => document.querySelectorAll('.day[data-date]')[k]?.click(), i);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(300);
} else if (SCENARIO === 'tab') {
  for (const l of ['统计', '目标', '我的', '日历', '统计', '目标']) {
    await fireTab(l);
    await page.waitForTimeout(500);
  }
} else if (SCENARIO === 'month') {
  for (let i = 0; i < 8; i++) {
    await fireAria(i % 2 === 0 ? '下一个月' : '上一个月');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
}

const { profile } = await cdp.send('Profiler.stop');

/* 汇总自耗时（排除 idle/gc/program） */
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const total = profile.timeDeltas.reduce((a, b) => a + b, 0);
for (let i = 0; i < profile.samples.length; i++) {
  const node = byId.get(profile.samples[i]);
  if (!node) continue;
  const cf = node.callFrame;
  if (!cf.url && /^(idle|program|gc|\(root\))$/.test(cf.functionName || '')) continue;
  const key = `${cf.functionName || '(anonymous)'}  ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
}
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);

console.log(`\n场景: ${SCENARIO}   采样总时长 ${(total / 1000).toFixed(2)}s（CPU 4x 降速下）\n`);
console.log('自耗时 Top 16：');
for (const [k, us] of rows) {
  const pctv = ((us / total) * 100).toFixed(1);
  console.log(`  ${(us / 1000).toFixed(0).padStart(6)}ms  ${pctv.padStart(5)}%   ${k}`);
}

await browser.close();
