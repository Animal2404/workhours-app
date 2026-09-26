/* ============================================================
   日历页换月性能自检
   ------------------------------------------------------------
   修复前：CalendarPage 的 .page 上挂了 key={`${year}-${month0}`}，
   换一次月 → 整个 page 子树被卸载重建：
     · 顶部工资卡重挂 → BlurFade 动画重放
     · NumberTicker 重播数字滚动
     · 下方所有卡片闪一次
   修复后：key 只挂在 .cal-grid 上，只有 42 个格子重建。

   验证方式（可证伪，不是看代码）：
   在浏览器里给节点打标记，换月后看节点是否还是同一个对象。
   修复后的预期：工资卡是同一个节点；网格是新节点。
   ============================================================ */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

// 采集长任务
await page.addInitScript(() => {
  window.__longTasks = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
});
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(500);

console.log('\n[1] 换月时哪些节点被重建');
{
  // 打标记：节点被重建的话标记就没了
  await page.evaluate(() => {
    document.querySelector('.hero-card').__mark = 'hero-original';
    document.querySelector('.cal-grid').__mark = 'grid-original';
    document.querySelector('.page').__mark = 'page-original';
  });

  await page.getByLabel('下一个月').click();
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => ({
    page: document.querySelector('.page').__mark ?? null,
    hero: document.querySelector('.hero-card').__mark ?? null,
    grid: document.querySelector('.cal-grid').__mark ?? null,
  }));

  check('页面容器没有被重建', r.page === 'page-original', `标记=${r.page}`);
  check('顶部工资卡没有被重建（动画不会重放）', r.hero === 'hero-original', `标记=${r.hero}`);
  check('日历网格被重建（换月轻量淡入）', r.grid === null, `标记=${r.grid}`);
}

console.log('\n[2] 连续快速换月');
{
  await page.evaluate(() => {
    window.__longTasks = [];
  });
  const next = page.getByLabel('下一个月');
  for (let i = 0; i < 10; i++) {
    await next.click();
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => ({
    long: window.__longTasks,
    month: document.querySelector('.cal-month')?.textContent ?? '',
    errored: window.__err ?? null,
  }));

  const worst = r.long.length ? Math.max(...r.long) : 0;
  const over50 = r.long.filter((d) => d > 50);
  console.log(`      长任务 ${r.long.length} 个，最长 ${worst}ms，>50ms 的有 ${over50.length} 个`);
  console.log(`      10 次快切后停在：${r.month}`);
  check('快切 10 次无超过 50ms 的长任务', over50.length === 0, over50.join(','));

  // 换月后格子仍正确。
  // 注意别用「固定点几次」来回到 9 月 —— 前面已经点过若干次，
  // 次数算错就会停在别的月份，然后误判成「节日丢了」。
  // 这里按标题循环回退，最多 30 次。
  const holidayBack = await (async () => {
    const prev = page.getByLabel('上一个月');
    for (let i = 0; i < 30; i++) {
      const m = await page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
      if (m.includes('2026年9月')) break;
      // 退过头了就前进
      const y = Number((m.match(/(\d{4})年/) ?? [])[1] ?? 0);
      const mo = Number((m.match(/年(\d{1,2})月/) ?? [])[1] ?? 0);
      if (y < 2026 || (y === 2026 && mo < 9)) {
        await page.getByLabel('下一个月').click();
      } else {
        await prev.click();
      }
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
    const label = await page.evaluate(
      () => document.querySelector('[data-date="2026-09-25"] .day-holiday')?.textContent ?? null,
    );
    return { at, label };
  })();
  console.log(`      回到：${holidayBack.at}`);
  check(
    '快切来回后 2026-09-25 仍显示中秋节',
    holidayBack.label === '中秋节',
    `实际 ${JSON.stringify(holidayBack.label)}`,
  );
}

console.log('\n[3] 换月期间掉帧检测（对比空载节奏，而不是写死 16.7ms）');
{
  // 无头 Chromium 的 rAF 本身就跑不到 60Hz（通常 ~56Hz），
  // 拿固定 16.7ms 当门槛会把「稳定但略慢的节奏」误判成卡顿。
  // 真正要测的是「有没有掉帧」：单帧是否达到空载节奏的 2 倍以上。
  const measure = async (withSwitching, clicks = 0) =>
    page.evaluate(
      async ([sw, n]) => {
        const gaps = [];
        let last = performance.now();
        let stop = false;
        const tick = () => {
          const now = performance.now();
          gaps.push(+(now - last).toFixed(2));
          last = now;
          if (!stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const next = document.querySelector('[aria-label="下一个月"]');
        if (sw) {
          for (let i = 0; i < n; i++) {
            next.click();
            await new Promise((r) => setTimeout(r, 90));
          }
        }
        await new Promise((r) => setTimeout(r, 500));
        stop = true;
        return gaps.slice(2);
      },
      [withSwitching, clicks],
    );

  const p = (a, q) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
  };

  const idle = await measure(false);
  const busy = await measure(true, 6);

  const idleMed = p(idle, 0.5);
  const idleP95 = p(idle, 0.95);
  const busyMed = p(busy, 0.5);
  const busyP95 = p(busy, 0.95);
  const busyMax = Math.max(...busy);
  const dropped = busy.filter((g) => g > idleMed * 1.8).length;

  console.log(`      空载：中位 ${idleMed}ms  P95 ${idleP95}ms  （${idle.length} 帧）`);
  console.log(`      换月：中位 ${busyMed}ms  P95 ${busyP95}ms  最长 ${busyMax}ms  （${busy.length} 帧）`);
  console.log(`      判定：约等于 2 倍空载帧长的「掉帧」共 ${dropped} 帧`);

  check('换月没有丢帧（无单帧超过空载中位的 1.8 倍）', dropped === 0, `掉帧 ${dropped} 帧`);
  check(
    '换月中位帧长不劣于空载',
    busyMed <= idleMed * 1.15,
    `${busyMed}ms vs 空载 ${idleMed}ms`,
  );
}

await ctx.close();
await browser.close();

console.log(`\n${'─'.repeat(52)}`);
if (fails.length === 0) console.log(`✅ 日历页性能自检全部通过（${pass} 项）`);
else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f}`);
}
console.log('─'.repeat(52));
process.exit(fails.length === 0 ? 0 : 1);
