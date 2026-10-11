/* 进度环的彩色弧到底有没有画出来？
   怀疑点：CSS 里 .ring-bar { stroke: url(#ringGrad) } 是写死的 id，
   而组件用 useId() 生成唯一 id 并写在**行内属性**上。
   CSS 规则的优先级高于 SVG 行内 presentation attribute —— 所以
   行内那个正确的 url(#r1) 会被写死的 url(#ringGrad) 盖掉；
   若文档里没有 id="ringGrad" 的元素，stroke 就解析成 none，弧不可见。 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 900 }, deviceScaleFactor: 2 });

await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    'workhours.state.v1',
    JSON.stringify({
      version: 1,
      settings: {
        hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 3000,
        dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false, reminderTime: '20:00',
        theme: 'light', templates: [], recurring: [],
        savingsGoals: [{ id: 'g1', name: '买 iPhone 18', target: 7999, startDate: '2026-09-01', initial: 0, createdAt: 1 }],
      },
      entries: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => {
          const d = `2026-09-${String(i + 1).padStart(2, '0')}`;
          return [d, { date: d, hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 }];
        }),
      ),
    }),
  );
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(500);
await page.locator('nav.tabbar button:has-text("目标")').first().click();
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const out = [];
  for (const bar of document.querySelectorAll('.ring-bar')) {
    const cs = getComputedStyle(bar);
    const svg = bar.closest('svg');
    const grad = svg?.querySelector('linearGradient');
    out.push({
      inlineStroke: bar.getAttribute('stroke'),
      computedStroke: cs.stroke,
      gradId: grad?.id ?? null,
      gradExistsInDoc: grad ? !!document.getElementById(grad.id) : false,
      dashOffset: bar.getAttribute('stroke-dashoffset'),
      dashArray: bar.getAttribute('stroke-dasharray'),
      // 关键：computed stroke 若是 none 或指向不存在的 id，弧就画不出来
      resolves: cs.stroke !== 'none',
      bbox: (() => { try { return Math.round(bar.getBoundingClientRect().width); } catch { return null; } })(),
    });
  }
  return { count: document.querySelectorAll('.ring-bar').length, rings: out,
    hasRingGradElement: !!document.getElementById('ringGrad') };
});

console.log('文档里有 id="ringGrad" 的元素吗:', info.hasRingGradElement);
console.log('.ring-bar 个数:', info.count);
for (const r of info.rings) console.log(JSON.stringify(r, null, 2));

await browser.close();
