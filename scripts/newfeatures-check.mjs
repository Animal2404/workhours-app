/* ============================================================
   本轮新功能的端到端验证（真实浏览器 + 真实 dist）
   ------------------------------------------------------------
   覆盖用户提的三件事：
     1. 批量记账
     2. 所有月工资总和 + 逐月明细
     3. 存款目标（买 iPhone 18 那类）
   外加我补的：应用内记账提醒

   BASE_URL 指向 vite preview（跑 dist/）
   ============================================================ */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SHOTS = 'verification';
await mkdir(SHOTS, { recursive: true });

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

/** 每次都从干净状态开始 */
async function freshApp(seed) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem('workhours.state.v1', JSON.stringify(s));
  }, seed ?? null);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(350);
}

const goTab = async (label) => {
  await page.locator(`nav.tabbar button:has-text("${label}")`).first().click();
  await page.waitForTimeout(300);
};

const readState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('workhours.state.v1') || '{}'));

/* ============================================================
   1. 批量记账
   ============================================================ */
console.log('\n[1] 批量记账');
await freshApp();
{
  // 进入批量模式
  await page.getByLabel('批量记账').click();
  await page.waitForTimeout(250);
  check('批量模式开关变成「退出批量记账」', await page.getByLabel('退出批量记账').count(), 1);

  // 选一整月
  await page.locator('.batch-quick button:has-text("整月")').click();
  await page.waitForTimeout(250);
  const countText = await page.locator('.batch-count').innerText();
  const n = Number((countText.match(/(\d+)/) ?? [])[1]);
  console.log(`     整月选中 ${n} 天`);
  check('整月选中 28–31 天', n >= 28 && n <= 31, true);
  check('格子进入已选中态', await page.locator('.day.is-picked').count(), n);

  // 打开批量抽屉
  await page.locator('.batch-actions button:has-text("记这")').click();
  await page.waitForTimeout(400);
  const sheetTitle = await page.locator('.sheet-title, .sheet h2, [class*=sheet] h2').first().innerText().catch(() => '');
  console.log(`     抽屉标题: ${sheetTitle.trim()}`);
  check('抽屉显示「批量记 N 天」', /批量记\s*\d+\s*天/.test(sheetTitle), true);

  // 填 10 小时 + 2 小时加班，保存
  await page.locator('.sheet .chip:has-text("10小时")').first().click();
  await page.waitForTimeout(120);
  await page.locator('.sheet .chip:has-text("+2h")').first().click();
  await page.waitForTimeout(120);

  const totalText = await page.locator('.breakdown-row.is-total .v').first().innerText();
  console.log(`     预览合计: ${totalText}（${n} 天 × 10h）`);
  // 10h × 20 = 200，加班 2h × 20 × 1 = 40 → 单天 240，n 天 = 240n
  check('预览合计 = 240 × 天数', Number(totalText.replace(/[^\d.]/g, '')), 240 * n);

  await page.locator('.sheet-foot button:has-text("记这")').click();
  await page.waitForTimeout(600);

  const st = await readState();
  const saved = Object.keys(st.entries ?? {}).length;
  check(`一次写入 ${n} 天`, saved, n);
  check('每天工时 = 12h（10 正常 + 2 加班）', Object.values(st.entries)[0].hours + Object.values(st.entries)[0].overtimeHours, 12);
  check('批量后自动退出批量模式', await page.locator('.batch-bar').count(), 0);
  check('日历上出现金额标注', (await page.locator('.day-money').count()) > 0, true);

  await page.screenshot({ path: `${SHOTS}/lead-batch-after.png` });

  // 批量清空（需重新进入批量模式）
  await page.getByLabel('批量记账').click();
  await page.waitForTimeout(250);
  await page.locator('.batch-quick button:has-text("整月")').click();
  await page.waitForTimeout(200);
  await page.locator('.batch-actions button:has-text("记这")').click();
  await page.waitForTimeout(400);
  await page.locator('.sheet-foot button:has-text("清空")').click();
  await page.waitForTimeout(150);
  await page.locator('.sheet-foot button:has-text("确认清空")').click();
  await page.waitForTimeout(600);
  const st2 = await readState();
  check('批量清空后记录为 0', Object.keys(st2.entries ?? {}).length, 0);
}

/* ============================================================
   2. 累计 + 逐月明细
   ============================================================ */
console.log('\n[2] 累计收入与逐月明细');
{
  // 造两个月的数据：8 月 2 天、9 月 3 天（各 8h × 20 = 160）
  const seed = {
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 0,
      dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false,
      reminderTime: '20:00', theme: 'light', templates: [], recurring: [], savingsGoals: [],
    },
    entries: {
      '2026-08-03': { date: '2026-08-03', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
      '2026-08-04': { date: '2026-08-04', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
      '2026-09-01': { date: '2026-09-01', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
      '2026-09-02': { date: '2026-09-02', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
      '2026-09-03': { date: '2026-09-03', hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
    },
  };
  await freshApp(seed);
  await page.waitForTimeout(400);

  const heroTotal = await page.locator('.hero-total').innerText();
  console.log(`     顶部累计: ${heroTotal.replace(/\s+/g, ' ').trim()}`);
  // 5 天 × 160 = 800
  check('累计显示 800', /800/.test(heroTotal), true);
  check('累计显示 5 天', /5\s*天/.test(heroTotal), true);

  await goTab('统计');
  await page.locator('.mini-seg button:has-text("全部")').click();
  await page.waitForTimeout(400);

  const sub = await page.locator('.topbar-sub').first().innerText();
  console.log(`     统计页副标题: ${sub.trim()}`);
  check('显示共 2 个月', /2\s*个月/.test(sub), true);

  const rows = await page.locator('.month-row').count();
  check('逐月明细 2 行', rows, 2);

  const texts = await page.locator('.month-row').allInnerTexts();
  console.log(`     明细: ${texts.map((t) => t.replace(/\s+/g, ' ')).join(' | ')}`);
  check('第一行是最新的 9 月', /2026年9月/.test(texts[0]), true);
  check('9 月 = 480（3 天）', /480/.test(texts[0]), true);
  check('第二行是 8 月 = 320（2 天）', /2026年8月/.test(texts[1]) && /320/.test(texts[1]), true);

  await page.screenshot({ path: `${SHOTS}/lead-stats-all.png` });

  // 点一行跳回那个月
  await page.locator('.month-row').nth(1).click();
  await page.waitForTimeout(400);
  check('点明细跳回 8 月的月度视图', await page.locator('.mini-seg button:has-text("月")').first().getAttribute('aria-selected'), 'true');
  const monthLbl = await page.locator('.topbar-sub').first().innerText();
  check('确实停在 2026年8月', /2026年8月/.test(monthLbl), true);
}

/* ============================================================
   3. 存款目标（买 iPhone 18）
   ============================================================ */
console.log('\n[3] 存款目标');
{
  const seed = {
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 0,
      dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false,
      reminderTime: '20:00', theme: 'light', templates: [], recurring: [], savingsGoals: [],
    },
    entries: {},
  };
  await freshApp(seed);
  // 从 9 月 1 日起记 10 天，每天 160 → 1600
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('workhours.state.v1'));
    for (let i = 1; i <= 10; i++) {
      const d = `2026-09-${String(i).padStart(2, '0')}`;
      s.entries[d] = { date: d, hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 };
    }
    localStorage.setItem('workhours.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);

  await goTab('目标');
  await page.waitForTimeout(300);
  // 注意：dailyGoalHours 默认是 8，所以页面级的「空页」不会出现；
  // 走的是主渲染里的「存款目标」卡片，那里的按钮文案是「添加目标」。
  check('目标页出现「存款目标」区块', await page.locator('.card-title:has-text("存款目标")').count(), 1);
  check('卡片里有「添加目标」按钮', await page.locator('.empty button:has-text("添加目标")').count(), 1);

  await page.locator('.empty button:has-text("添加目标")').click();
  await page.waitForTimeout(400);
  await page.getByLabel('目标名称').fill('买 iPhone 18');
  await page.getByLabel('目标金额').fill('7999');
  await page.getByLabel('起算日').fill('2026-09-01');
  await page.waitForTimeout(200);
  await page.locator('.sheet-foot button:has-text("添加")').click();
  await page.waitForTimeout(600);

  const st = await readState();
  check('目标已保存', st.settings.savingsGoals.length, 1);
  check('目标名正确', st.settings.savingsGoals[0].name, '买 iPhone 18');
  check('目标金额正确', st.settings.savingsGoals[0].target, 7999);
  check('起算日正确', st.settings.savingsGoals[0].startDate, '2026-09-01');

  const card = await page.locator('.goal-card').first().innerText();
  console.log(`     目标卡: ${card.replace(/\s+/g, ' ').trim()}`);
  check('显示目标名', /买 iPhone 18/.test(card), true);
  check('显示已攒 1,600', /1,600/.test(card), true);
  check('显示还差 6,399', /6,399/.test(card), true);
  check('显示还要上班天数', /还要上班/.test(card) && /\d+\s*天/.test(card), true);
  check('显示预计达成', /预计达成/.test(card), true);
  check('显示进度百分比', /\d+%/.test(card), true);
  check('显示出勤天数与日均', /出勤\s*10\s*天/.test(card) && /160/.test(card), true);

  await page.screenshot({ path: `${SHOTS}/lead-goal-iphone.png` });

  // 编辑：改成已达成
  await page.locator('.goal-card button[aria-label^="编辑目标"]').click();
  await page.waitForTimeout(400);
  await page.getByLabel('目标金额').fill('1000');
  await page.locator('.sheet-foot button:has-text("保存")').click();
  await page.waitForTimeout(500);
  const doneCard = await page.locator('.goal-card').first().innerText();
  console.log(`     改小目标后: ${doneCard.replace(/\s+/g, ' ').trim()}`);
  check('达成后显示「不用了」', /不用了/.test(doneCard), true);
  check('达成后进度 100%', /100%/.test(doneCard), true);
}

/* ============================================================
   4. 记账提醒（原来是空壳，现在真的会提醒）
   ============================================================ */
console.log('\n[4] 记账提醒');
{
  const seed = {
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 0,
      dailyGoalHours: 8, weekStartsMonday: true,
      reminderEnabled: true, reminderTime: '00:01', // 今天肯定已过
      theme: 'light', templates: [], recurring: [], savingsGoals: [],
    },
    entries: {}, // 今天没记录
  };
  await freshApp(seed);
  await page.waitForTimeout(500);
  check('过点且今天没记 → 出现提醒条', await page.locator('.reminder-bar').count(), 1);
  const rt = await page.locator('.reminder-text').innerText();
  console.log(`     提醒文案: ${rt}`);
  check('提醒文案含「还没记账」', /还没记账/.test(rt), true);

  // 记一天后提醒应消失
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('workhours.state.v1'));
    const d = new Date();
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    s.entries[k] = { date: k, hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 };
    localStorage.setItem('workhours.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('今天已记录 → 提醒消失', await page.locator('.reminder-bar').count(), 0);

  // 关掉开关也不该提醒
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('workhours.state.v1'));
    s.settings.reminderEnabled = false;
    s.entries = {};
    localStorage.setItem('workhours.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('开关关闭 → 不提醒', await page.locator('.reminder-bar').count(), 0);
}

/* ============================================================
   5. 老数据兼容（升级安装不能丢数据）
   ============================================================ */
console.log('\n[5] 老版本数据兼容');
{
  // 模拟上一版 APK 存下来的数据：settings 里没有 savingsGoals
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'workhours.state.v1',
      JSON.stringify({
        version: 1,
        settings: { hourlyRate: 22, currency: '¥', templates: [], recurring: [], theme: 'dark' },
        entries: {
          '2026-09-01': { date: '2026-09-01', hours: 9, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 },
        },
      }),
    );
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);

  check('老数据没有导致 pageerror', pageErrors.length, 0);
  const heroTotal = await page.locator('.hero-total').innerText();
  check('老数据照常显示累计 198（9h×22）', /198/.test(heroTotal), true);
  await goTab('目标');
  await page.waitForTimeout(300);
  check('目标页正常渲染（无 savingsGoals 也不炸）', await page.locator('.page').count(), 1);
  const saved = await readState();
  check('回写后仍保留老时薪', saved.settings.hourlyRate, 22);
}

/* ============================================================
   5b. 进度环的彩色弧必须真的画出来
   ------------------------------------------------------------
   回归案例：CSS 里曾写死 .ring-bar { stroke: url(#ringGrad) }，
   而组件用 useId() 生成唯一渐变 id 写在**行内属性**上。
   CSS 优先级高于 SVG presentation attribute，于是行内正确的
   url(#r0) 被盖成不存在的 url(#ringGrad) → 弧线整条不渲染，
   进度环永远只有灰色底环。这个 bug 存在了很久没人发现。
   ============================================================ */
console.log('\n[5b] 进度环彩色弧');
{
  await freshApp({
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 0,
      dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false, reminderTime: '20:00',
      theme: 'light', templates: [], recurring: [],
      savingsGoals: [
        { id: 'g-ring', name: '买 iPhone 18', target: 7999, startDate: '2026-09-01', initial: 0, createdAt: 1 },
      ],
    },
    entries: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => {
        const d = `2026-09-${String(i + 1).padStart(2, '0')}`;
        return [d, { date: d, hours: 8, overtimeHours: 0, allowance: 0, deduction: 0, updatedAt: 1 }];
      }),
    ),
  });
  await goTab('目标');
  await page.waitForTimeout(900);

  const ring = await page.evaluate(() => {
    const bar = document.querySelector('.goal-card .ring-bar');
    if (!bar) return null;
    const cs = getComputedStyle(bar);
    const grad = bar.closest('svg')?.querySelector('linearGradient');
    return {
      computedStroke: cs.stroke,
      gradId: grad?.id ?? null,
      gradExists: grad ? !!document.getElementById(grad.id) : false,
      dashOffset: Number(bar.getAttribute('stroke-dashoffset')),
      dashArray: Number(bar.getAttribute('stroke-dasharray')),
    };
  });

  check('存在进度环弧线元素', !!ring, true);
  check('弧线颜色解析到真实存在的渐变（不是 none / 不存在的 id）', ring?.gradExists, true);
  check(
    'computed stroke 指向组件生成的那个渐变 id',
    ring?.computedStroke?.includes(ring?.gradId ?? '@@'),
    true,
  );
  // 20% 进度：offset 应显著小于周长，即确实画出了一段弧
  const drawn = ring ? 1 - ring.dashOffset / ring.dashArray : 0;
  console.log(`     弧线描出比例 = ${(drawn * 100).toFixed(1)}%（期望 ≈20%）`);
  check('弧线描出比例 ≈ 20%', Math.abs(drawn * 100 - 20) < 3, true);
}

/* ============================================================
   6. 边界：目标页在极端输入下不崩
   ============================================================ */
console.log('\n[6] 稳健性');
{
  await freshApp({
    version: 1,
    settings: {
      hourlyRate: 20, overtimeMultiplier: 1, currency: '¥', monthlyGoalIncome: 0,
      dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false, reminderTime: '20:00',
      theme: 'light', templates: [], recurring: [],
      savingsGoals: [
        { id: 'bad1', name: '零目标', target: 0, startDate: '2026-09-01', initial: 0, createdAt: 1 },
        { id: 'bad2', name: '未来起算', target: 5000, startDate: '2027-01-01', initial: 0, createdAt: 1 },
      ],
    },
    entries: {},
  });
  await goTab('目标');
  await page.waitForTimeout(400);
  check('target=0 / 未来起算日 都不崩', await page.locator('.goal-card').count(), 2);
  const t = await page.locator('.goal-card').first().innerText();
  check('零目标不显示 NaN / Infinity / undefined', /NaN|Infinity|undefined/.test(t), false);
  const t2 = await page.locator('.goal-card').nth(1).innerText();
  check('未来起算日不显示 NaN', /NaN|Infinity|undefined/.test(t2), false);
  check('未来起算日 → 记账后可知（不瞎猜天数）', /记账后可知|数据还不够/.test(t2), true);
}

console.log('\n' + '─'.repeat(64));
check('全程零 pageerror', pageErrors.length, 0);
if (pageErrors.length) console.log('  ' + pageErrors.slice(0, 3).join('\n  '));

await ctx.close();
await browser.close();

if (fails.length === 0) {
  console.log(`✅ 新功能端到端验证全部通过：${pass} 项断言`);
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  console.log('   ' + fails.join('\n   '));
  process.exit(1);
}
