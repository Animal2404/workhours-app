/* 拍 2027 年的日历（官方放假安排还没公布，只有节日当天）
   用来证明「往后翻也有节日」，而不是翻到 2027 就一片空白。 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();

const ctx = await browser.newContext({
  viewport: { width: 393, height: 900 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(400);

const monthOf = () => page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');

async function goTo(year, month) {
  for (let i = 0; i < 40; i++) {
    const label = await monthOf();
    const y = Number((label.match(/(\d{4})年/) ?? [])[1] ?? 0);
    const m = Number((label.match(/年(\d{1,2})月/) ?? [])[1] ?? 0);
    if (y === year && m === month) return true;
    const back = y > year || (y === year && m > month);
    await page.getByLabel(back ? '上一个月' : '下一个月').click();
    await page.waitForTimeout(45);
  }
  return false;
}

for (const [y, m, tag] of [
  [2027, 2, '2027-02-spring'],
  [2027, 9, '2027-09-midautumn'],
]) {
  const okGo = await goTo(y, m);
  await page.waitForTimeout(350);
  const card = page.locator('.card', { has: page.locator('.cal-grid') }).first();
  const out = `verification/lead-holiday-${tag}.png`;
  await card.screenshot({ path: out });
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-date]')]
      .map((el) => ({ d: el.dataset.date, l: el.querySelector('.day-holiday')?.textContent ?? null }))
      .filter((x) => x.l),
  );
  console.log(`  📸 ${out}  跳转=${okGo}  标注=${JSON.stringify(found)}`);
}

await ctx.close();
await browser.close();
