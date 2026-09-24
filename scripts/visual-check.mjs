/* ============================================================
   视觉验证：真的把 App 跑起来，点一遍核心流程并截图
   模拟 iPhone 尺寸，验证：
     1. 日历页渲染 + 记一笔工时 → 金额立刻算对
     2. 记 10 小时 × 20 = 200（用户给的例子）
     3. 抽屉、统计页、目标页、设置页、深色模式
   ============================================================ */

import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '..', 'shots');
await mkdir(shots, { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();

const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false });
  console.log(`  📸 ${name}.png`);
};

console.log(`\n打开 ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

/* ---------------- 1. 首屏 ---------------- */
console.log('\n[1] 日历首屏');
await shot('01-calendar-empty');

const title = await page.locator('.topbar-title').first().textContent();
console.log(`  标题：${title}`);

/* ---------------- 2. 记一笔：10 小时 ---------------- */
console.log('\n[2] 记一笔 10 小时（时薪默认 20 → 应为 200）');
await page.getByRole('button', { name: /记这天的工时|修改这天/ }).click();
await page.waitForTimeout(600);
await shot('02-entry-sheet-open');

// 点「10小时」快捷胶囊
await page.locator('.sheet .chip', { hasText: /^10小时$/ }).click();
await page.waitForTimeout(500);

const preview = await page.locator('.live-preview .v').textContent();
console.log(`  实时预览金额：${preview}`);
await shot('03-entry-sheet-10h');

/* ---------------- 3. 保存并核对日历 ---------------- */
console.log('\n[3] 保存并核对');
await page.locator('.sheet-foot .btn-primary').click();
await page.waitForTimeout(900);
await shot('04-calendar-saved');

const heroValue = await page.locator('.hero-value').textContent();
const heroMeta = await page.locator('.hero-meta').textContent();
console.log(`  Hero 金额：${heroValue}`);
console.log(`  Hero 明细：${heroMeta?.replace(/\s+/g, ' ')}`);

const dayDetail = await page.locator('.day-detail-money').textContent().catch(() => null);
console.log(`  当天明细金额：${dayDetail}`);

/* ---------------- 4. 多记几天，看图表效果 ---------------- */
console.log('\n[4] 多记几天（让统计页有数据）');
const hoursToAdd = [8, 9, 7.5, 10, 6, 8.5, 12];
for (let i = 0; i < hoursToAdd.length; i++) {
  // 直接操作存储，模拟多天记录，避免大量点击
  await page.evaluate(
    ([h, idx]) => {
      const raw = JSON.parse(localStorage.getItem('workhours.state.v1') ?? '{}');
      const d = new Date();
      d.setDate(d.getDate() - (idx + 1));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      raw.entries[key] = {
        date: key,
        hours: h,
        overtimeHours: idx % 3 === 0 ? 1.5 : 0,
        allowance: idx === 2 ? 30 : 0,
        deduction: idx === 4 ? 20 : 0,
        note: idx === 0 ? '门店晚班' : '',
        updatedAt: Date.now(),
      };
      localStorage.setItem('workhours.state.v1', JSON.stringify(raw));
    },
    [hoursToAdd[i], i],
  );
}
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('05-calendar-with-data');

/* ---------------- 5. 统计页 ---------------- */
console.log('\n[5] 统计页');
await page.getByRole('button', { name: '统计' }).click();
await page.waitForTimeout(900);
await shot('06-stats-month');

await page.locator('.mini-seg button', { hasText: '年' }).click();
await page.waitForTimeout(900);
await shot('07-stats-year');

/* ---------------- 6. 目标页 ---------------- */
console.log('\n[6] 目标页（先设个目标）');
await page.getByRole('button', { name: '我的' }).click();
await page.waitForTimeout(500);
const goalInput = page.getByLabel('月度工资目标');
await goalInput.fill('3000');
await page.waitForTimeout(400);
await page.locator('.set-input').first().blur().catch(() => {});
await page.waitForTimeout(400);

await page.getByRole('button', { name: '目标' }).click();
await page.waitForTimeout(1000);
await shot('08-goals');

/* ---------------- 7. 设置页 ---------------- */
console.log('\n[7] 设置页');
await page.getByRole('button', { name: '我的' }).click();
await page.waitForTimeout(700);
await shot('09-settings');

/* ---------------- 8. 深色模式 ---------------- */
console.log('\n[8] 深色模式');
await page.locator('.segment-btn', { hasText: '深色' }).click();
await page.waitForTimeout(800);
await shot('10-settings-dark');

await page.getByRole('button', { name: '日历' }).click();
await page.waitForTimeout(900);
await shot('11-calendar-dark');

/* ---------------- 9. 抽屉在深色下的样子 ---------------- */
console.log('\n[9] 深色下的记录抽屉');
await page.getByRole('button', { name: /记这天的工时|修改这天/ }).click();
await page.waitForTimeout(700);
await shot('12-entry-sheet-dark');

/* ---------------- 10. 核对算钱是否真的对 ---------------- */
console.log('\n[10] 数值核对');
const verify = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('workhours.state.v1') ?? '{}');
  const rate = raw.settings.hourlyRate;
  const mult = raw.settings.overtimeMultiplier;
  const rows = Object.values(raw.entries).map((e) => {
    const base = e.hours * rate;
    const ot = e.overtimeHours * rate * mult;
    const gross = base + ot + (e.allowance || 0);
    const net = Math.round((gross - (e.deduction || 0)) * 100) / 100;
    return { date: e.date, hours: e.hours, ot: e.overtimeHours, net };
  });
  const total = Math.round(rows.reduce((a, r) => a + r.net, 0) * 100) / 100;
  const shown = document.querySelector('.hero-value')?.textContent?.replace(/[^\d.]/g, '');
  return { rate, mult, rows, total: String(total), shown };
});
console.log(`  时薪 ${verify.rate}，加班倍率 ${verify.mult}`);
for (const r of verify.rows) {
  console.log(`    ${r.date}: ${r.hours}h${r.ot ? ` +${r.ot}h加班` : ''} → ${r.net} 元`);
}
console.log(`  逐天相加 = ${verify.total}`);
console.log(`  页面显示 = ${verify.shown}`);
const match = String(verify.total) === String(verify.shown);
console.log(`  ${match ? '✅ 一致' : '❌ 不一致'}`);

/* ---------------- 收尾 ---------------- */
console.log('\n[11] 控制台错误检查');
if (logs.length === 0) console.log('  ✅ 无 console 报错');
else for (const l of logs) console.log(`  ⚠️ ${l}`);

await browser.close();

console.log(`\n截图目录：${shots}`);
console.log(`数值核对：${match ? 'PASS' : 'FAIL'}｜控制台：${logs.length === 0 ? 'PASS' : 'FAIL'}`);
process.exit(match && logs.length === 0 ? 0 : 1);
