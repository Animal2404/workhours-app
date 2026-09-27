/* 逐月扫描：把 2024-01 到 2027-12 每个月都翻一遍，
   列出界面上真实出现的节日标注，和数据里应有的对比。
   用来回答「为什么只看到中秋和国庆」。 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(400);

const monthOf = () =>
  page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');

// 跳到指定年月
async function goTo(year, month) {
  for (let i = 0; i < 40; i++) {
    const label = await monthOf();
    const y = Number((label.match(/(\d{4})年/) ?? [])[1] ?? 0);
    const m = Number((label.match(/年(\d{1,2})月/) ?? [])[1] ?? 0);
    if (y === year && m === month) return true;
    if (y === 0) return false;
    const back = y > year || (y === year && m > month);
    await page.getByLabel(back ? '上一个月' : '下一个月').click();
    await page.waitForTimeout(45);
  }
  return false;
}

const collect = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-date]')]
      .map((el) => ({
        date: el.dataset.date,
        label: el.querySelector('.day-holiday')?.textContent ?? null,
      }))
      .filter((x) => x.label),
  );

console.log('\n逐月扫描（只列有标注的月份）\n');
console.log('月份          出现的标注');
console.log('─'.repeat(78));

const allFound = [];
for (let year = 2024; year <= 2031; year++) {
  for (let month = 1; month <= 12; month++) {
    if (!(await goTo(year, month))) {
      console.log(`${year}-${String(month).padStart(2, '0')}   ⚠ 跳转失败`);
      continue;
    }
    await page.waitForTimeout(220);
    const items = await collect();
    if (items.length) {
      allFound.push(...items.map((i) => ({ ...i, month: `${year}-${String(month).padStart(2, '0')}` })));
      const byName = {};
      for (const it of items) byName[it.label] = (byName[it.label] ?? 0) + 1;
      const summary = Object.entries(byName)
        .map(([k, v]) => `${k}×${v}`)
        .join('  ');
      console.log(`${year}-${String(month).padStart(2, '0')}          ${summary}`);
    }
  }
}

await browser.close();

console.log('─'.repeat(78));
const names = [...new Set(allFound.filter((f) => f.label !== '班').map((f) => f.label))];
console.log(`全程出现的节日名（${names.length} 种）：${names.join('、')}`);
console.log(`调休「班」出现 ${allFound.filter((f) => f.label === '班').length} 天`);
console.log(`有标注的月份数：${new Set(allFound.map((f) => f.month)).size}`);
