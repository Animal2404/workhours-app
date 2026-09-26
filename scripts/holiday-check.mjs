/* ============================================================
   日历节假日显示自检
   ------------------------------------------------------------
   用户反馈：日历里 25 号是中秋节，界面上却没显示。

   本脚本在真实浏览器里核对，而不是读代码：
   1. 2026-09-25 那格真的出现「中秋节」文字
   2. 当月所有放假日都显示节日名（不允许只有个别显示）
   3. 跨月补齐格子（2026-10-01 落在 9 月网格里）也照样显示
   4. 调休上班日显示「班」，且颜色与节日名区分
   5. 所有节日名同字号、同颜色、同位置、同层级
   6. 窄屏 320/360px 下三行内容不溢出、不裁切
   7. 切月/切年/连续快切后不残留、不串月；无数据年份不报错
   ============================================================ */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();

async function open({ width = 393, height = 852, dpr = 3, dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    colorScheme: dark ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

/** 读某一格上的节日标注 */
const cellInfo = (page, date) =>
  page.evaluate((d) => {
    const el = document.querySelector(`[data-date="${d}"]`);
    if (!el) return null;
    const label = el.querySelector('.day-holiday');
    const num = el.querySelector('.day-num');
    const money = el.querySelector('.day-money');
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // 溢出必须用「子元素包围盒 vs 内容盒」来算。
    // 不能用 scrollHeight/scrollWidth —— 选中态的 ::after 外环是 inset:-3px，
    // 它会把 scrollHeight 撑大 3px，造成「今天+选中」那格永远假报溢出。
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const brw = parseFloat(cs.borderRightWidth) || 0;
    const contentH = rect.height - bt - bb;
    const contentW = rect.width - bl - brw;

    // 只量「在流内」的子元素。.day-dot 是 position:absolute 的角标，
    // 它的包围盒混进来会让 neededH 变得毫无意义（量出 10px 这种假数字），
    // 那样三行叠加是否真的放得下就没被验证到。
    const flowKids = [...el.children]
      .filter((c) => getComputedStyle(c).position !== 'absolute')
      .map((c) => c.getBoundingClientRect());
    const neededH = flowKids.length
      ? flowKids[flowKids.length - 1].bottom - flowKids[0].top
      : 0;
    const widestKid = flowKids.reduce((m, k) => Math.max(m, k.width), 0);

    return {
      exists: true,
      classes: el.className,
      label: label ? label.textContent : null,
      labelColor: label ? getComputedStyle(label).color : null,
      labelFontSize: label ? getComputedStyle(label).fontSize : null,
      labelFontWeight: label ? getComputedStyle(label).fontWeight : null,
      childOrder: [...el.children].map((c) => c.className).join('|'),
      ariaLabel: el.getAttribute('aria-label'),
      contentH: +contentH.toFixed(2),
      neededH: +neededH.toFixed(2),
      overflowYPx: +(neededH - contentH).toFixed(2),
      overflowXPx: +(widestKid - contentW).toFixed(2),
      cellW: +rect.width.toFixed(1),
      cellH: +rect.height.toFixed(1),
      labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
      numVisible: num ? num.getBoundingClientRect().height > 0 : false,
      moneyVisible: money ? money.getBoundingClientRect().height > 0 : false,
      labelLeft: label
        ? +(label.getBoundingClientRect().left - rect.left).toFixed(2)
        : null,
      labelRelTop: label
        ? +(label.getBoundingClientRect().top - rect.top).toFixed(2)
        : null,
    };
  }, date);

/* ---------------- 1. 核心：2026-09-25 = 中秋节 ---------------- */
console.log('\n[1] 核心诉求：2026-09-25 显示中秋节');
{
  const { ctx, page, errors } = await open();
  const c = await cellInfo(page, '2026-09-25');
  check('该格子存在', !!c?.exists);
  check('节日名 = 中秋节', c?.label === '中秋节', `实际 ${JSON.stringify(c?.label)}`);
  check('aria-label 带上节日名', !!c?.ariaLabel?.includes('中秋节'), c?.ariaLabel ?? '');
  check('无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---------------- 2. 当月全覆盖 ---------------- */
console.log('\n[2] 当月所有放假日都要显示（不允许只有个别显示）');
{
  const { ctx, page } = await open();
  const expected = {
    '2026-09-25': '中秋节',
    '2026-09-26': '中秋节',
    '2026-09-27': '中秋节',
    '2026-09-20': '班',
  };
  for (const [d, want] of Object.entries(expected)) {
    const c = await cellInfo(page, d);
    check(`${d} → ${want}`, c?.label === want, `实际 ${JSON.stringify(c?.label)}`);
  }

  // 网格里一共有几个带标注的格子，必须正好等于预期数量
  const count = await page.evaluate(() => document.querySelectorAll('.day-holiday').length);
  check('标注格子数 = 4', count === 4, `实际 ${count}`);

  // 反例：不是节日的日子不能有标注
  const normal = await cellInfo(page, '2026-09-10');
  check('普通日期没有节日标签', normal?.label === null, `实际 ${JSON.stringify(normal?.label)}`);
  await ctx.close();
}

/* ---------------- 3. 跨月补齐格子 / 跨年前后 ---------------- */
console.log('\n[3] 月首尾补齐格子 + 跨年前后');
{
  const { ctx, page } = await open();

  // 本项目的 monthMatrix 对补齐位返回 null，渲染成没有日期的空格子
  // （不是「有日期但漏标节日」）。所以这里断言的是：空格子必须是中性的，
  // 不能挂任何节日标注，也不能可点击。
  const blanks = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.day.is-blank')];
    return {
      count: bs.length,
      withLabel: bs.filter((b) => b.querySelector('.day-holiday')).length,
      withDate: bs.filter((b) => b.dataset.date).length,
      clickable: bs.filter((b) => b.tagName === 'BUTTON').length,
    };
  });
  check('空格子不挂节日标注', blanks.withLabel === 0, `实际 ${blanks.withLabel}`);
  check('空格子没有日期', blanks.withDate === 0, `实际 ${blanks.withDate}`);
  check('空格子不可点击', blanks.clickable === 0, `实际 ${blanks.clickable}`);

  // 跨年前后：退到 2026-01，元旦（3 天）必须显示
  const prev = page.getByLabel('上一个月');
  for (let i = 0; i < 8; i++) {
    await prev.click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
  const month = await page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
  const jan1 = await cellInfo(page, '2026-01-01');
  const jan3 = await cellInfo(page, '2026-01-03');
  check('退到 2026 年 1 月', month.includes('2026年1月'), month);
  check('跨年后 2026-01-01 → 元旦', jan1?.label === '元旦', `实际 ${JSON.stringify(jan1?.label)}`);
  check('2026-01-03 → 元旦', jan3?.label === '元旦', `实际 ${JSON.stringify(jan3?.label)}`);

  // 春节（跨月：2026-02-15 起）
  await page.getByLabel('下一个月').click();
  await page.waitForTimeout(320);
  const spring = await cellInfo(page, '2026-02-15');
  const makeup = await cellInfo(page, '2026-02-14');
  check('2026-02-15 → 春节', spring?.label === '春节', `实际 ${JSON.stringify(spring?.label)}`);
  check('2026-02-14 调休 → 班', makeup?.label === '班', `实际 ${JSON.stringify(makeup?.label)}`);
  await ctx.close();
}

/* ---------------- 4. 一致性（同字号/同色/同位置/同层级） ---------------- */
console.log('\n[4] 所有节日名呈现方式必须一致');
{
  const { ctx, page } = await open();
  const cells = await page.evaluate(() =>
    [...document.querySelectorAll('.day-holiday')].map((l) => {
      const el = l.closest('.day');
      return {
        text: l.textContent,
        size: getComputedStyle(l).fontSize,
        weight: getComputedStyle(l).fontWeight,
        color: getComputedStyle(l).color,
        order: [...el.children].map((c) => c.className).join('|'),
        alignCenter: getComputedStyle(el).alignItems,
      };
    }),
  );
  const holidayOnes = cells.filter((c) => c.text !== '班');
  const sizes = new Set(holidayOnes.map((c) => c.size));
  const colors = new Set(holidayOnes.map((c) => c.color));
  const orders = new Set(holidayOnes.map((c) => c.order));
  check('节日名字号一致', sizes.size === 1, [...sizes].join(','));
  check('节日名颜色一致', colors.size === 1, [...colors].join(','));
  check('DOM 层级一致（日号→节日名→金额）', orders.size === 1, [...orders].join('  vs  '));
  check('节日名数量 ≥ 3', holidayOnes.length >= 3, `实际 ${holidayOnes.length}`);

  const makeup = cells.find((c) => c.text === '班');
  check('调休「班」与节日名颜色不同', !!makeup && makeup.color !== [...colors][0],
    makeup ? `${makeup.color} vs ${[...colors][0]}` : 'none');
  await ctx.close();
}

/* ---------------- 5. 窄屏不溢出 ---------------- */
console.log('\n[5] 窄屏 320 / 360px：内容不溢出、不裁切');
for (const w of [320, 360, 393, 430]) {
  const { ctx, page } = await open({ width: w, dpr: 2 });
  const dates = ['2026-09-25', '2026-09-26', '2026-09-20', '2026-09-10'];
  const bad = [];
  let sample = null;
  for (const d of dates) {
    const c = await cellInfo(page, d);
    if (!c) {
      bad.push(`${d} 缺失`);
      continue;
    }
    if (c.overflowYPx > 1) bad.push(`${d} 纵向溢出 ${c.overflowYPx}px`);
    if (c.overflowXPx > 1) bad.push(`${d} 横向溢出 ${c.overflowXPx}px`);
    if (c.labelClipped) bad.push(`${d} 节日名被截断`);
    if (d === '2026-09-25') sample = c;
  }
  check(`${w}px 无溢出/无截断`, bad.length === 0, bad.join(', '));
  console.log(
    `      格子 ${sample.cellW}×${sample.cellH}px，内容需要 ${sample.neededH}px / 可用 ${sample.contentH}px ` +
      `（余量 ${(sample.contentH - sample.neededH).toFixed(2)}px），节日名 ${sample.labelFontSize}`,
  );
  await ctx.close();
}

/* ---------------- 5b. 节日 + 有工时（三行叠加，最容易撑破） ---------------- */
console.log('\n[5b] 节日当天又记了工时（日号+节日名+金额 三行叠加）');
for (const w of [320, 360, 393]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'workhours.state.v1',
      JSON.stringify({
        version: 1,
        settings: { theme: 'light' },
        entries: {
          // 三行全占：节日名 + 金额；再加补贴触发右上角小圆点
          '2026-09-25': {
            date: '2026-09-25',
            hours: 10,
            overtimeHours: 2,
            allowance: 50,
            deduction: 0,
          },
        },
      }),
    );
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(450);

  const c = await cellInfo(page, '2026-09-25');
  const bad = [];
  if (!c) bad.push('格子缺失');
  else {
    if (c.label !== '中秋节') bad.push(`节日名丢失（${JSON.stringify(c.label)}）`);
    if (!c.moneyVisible) bad.push('金额不可见');
    if (!c.numVisible) bad.push('日号不可见');
    if (c.overflowYPx > 1) bad.push(`纵向溢出 ${c.overflowYPx}px`);
    if (c.overflowXPx > 1) bad.push(`横向溢出 ${c.overflowXPx}px`);
    if (c.labelClipped) bad.push('节日名被截断');
  }
  check(`${w}px 三行叠加仍不溢出且三项都可见`, bad.length === 0, bad.join(', '));
  if (c) {
    console.log(
      `      子元素 ${c.childOrder}；需要 ${c.neededH}px / 可用 ${c.contentH}px（余量 ${(c.contentH - c.neededH).toFixed(2)}px）`,
    );
  }
  await ctx.close();
}

/* ---------------- 6. 深色模式 ---------------- */
console.log('\n[6] 深色模式');
{
  const { ctx, page } = await open({ dark: true });
  const c = await cellInfo(page, '2026-09-25');
  check('深色下仍显示中秋节', c?.label === '中秋节', `实际 ${JSON.stringify(c?.label)}`);
  console.log(`      深色节日名颜色 ${c.labelColor}`);
  await page.screenshot({ path: 'verification/lead-holiday-dark.png' });
  await ctx.close();
}

/* ---------------- 7. 切月 / 切年 / 连续快切 ---------------- */
console.log('\n[7] 切月、切年、连续快速切月：不残留、不串月');
{
  const { ctx, page, errors } = await open();
  const next = page.getByLabel('下一个月');
  const prev = page.getByLabel('上一个月');

  // 到 10 月：应显示国庆节，且不再有中秋标注残留
  await next.click();
  await page.waitForTimeout(320);
  const oct1 = await cellInfo(page, '2026-10-01');
  const leftover = await cellInfo(page, '2026-09-25');
  check('切到 10 月：2026-10-01 = 国庆节', oct1?.label === '国庆节', `实际 ${JSON.stringify(oct1?.label)}`);
  check('9 月的格子已不在视图里（无残留）', leftover === null);

  // 连续快速切 6 次到 2027-04（超出数据范围）
  for (let i = 0; i < 6; i++) {
    await next.click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const labels2027 = await page.evaluate(() => document.querySelectorAll('.day-holiday').length);
  const month2027 = await page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
  check('切到无数据月份不报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('无数据月份没有乱标', labels2027 === 0, `标注数 ${labels2027}，月份 ${month2027}`);

  // 连续快切回 2026-09
  for (let i = 0; i < 7; i++) {
    await prev.click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(420);
  const back = await cellInfo(page, '2026-09-25');
  check('快切回 9 月仍正确显示中秋节', back?.label === '中秋节', `实际 ${JSON.stringify(back?.label)}`);

  // 回到今天
  const todayBtn = page.locator('button', { hasText: '回到今天' });
  if (await todayBtn.count()) {
    await todayBtn.first().click();
    await page.waitForTimeout(320);
  }
  const afterToday = await cellInfo(page, '2026-09-25');
  check('回到今天后仍正确', afterToday?.label === '中秋节', `实际 ${JSON.stringify(afterToday?.label)}`);
  await ctx.close();
}

/* ---------------- 8. 闰年 / 大小月不越界 ---------------- */
console.log('\n[8] 闰年 2 月、大小月不越界');
{
  const { ctx, page, errors } = await open();
  const prev = page.getByLabel('上一个月');
  // 从 2026-09 往回退到 2024-02（闰年）
  for (let i = 0; i < 31; i++) {
    await prev.click();
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(500);
  const month = await page.evaluate(() => document.querySelector('.cal-month')?.textContent ?? '');
  const days = await page.evaluate(() => document.querySelectorAll('[data-date]').length);
  check('退到 2024 年区间无报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('格子数在 28–42 之间（不越界）', days >= 28 && days <= 42, `实际 ${days}，月份 ${month}`);
  await ctx.close();
}

await browser.close();

console.log(`\n${'─'.repeat(56)}`);
if (fails.length === 0) console.log(`✅ 节假日显示自检全部通过（${pass} 项）`);
else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f}`);
}
console.log('─'.repeat(56));
process.exit(fails.length === 0 ? 0 : 1);
