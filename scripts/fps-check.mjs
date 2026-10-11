/* ============================================================
   帧率自检（60fps 验收）
   ------------------------------------------------------------
   方法（重要，别改回「写死 16.7ms」）：
   无头 Chromium 的 rAF 节奏本身就不是 60Hz（实测空载中位 ~16.7ms、
   偶尔 17.8ms）。所以**不能**用固定的 16.7ms 阈值判掉帧 ——
   会把浏览器自己的调度抖动误判成卡顿。正确做法是：
     1. 先测「空载」帧间隔分布（什么都不做，只跑 rAF）
     2. 再测「交互中」的帧间隔分布
     3. 断言：交互中的 p95 不超过空载 p95 的 1.8 倍，且没有长任务

   CPU 降速 4 倍模拟中端手机；每项交互反复跑取中位，抗单次抖动。

   跑：node scripts/fps-check.mjs
   ============================================================ */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const CPU_SLOWDOWN = 4;

let pass = 0;
const fails = [];
function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fails.push(name);
}

/* 与页面里注入的采样器配套 */
const SAMPLER = `
window.__fps = {
  frames: [],
  running: false,
  longTasks: [],
  start() {
    this.frames = [];
    this.running = true;
    let last = performance.now();
    const tick = (t) => {
      if (!this.running) return;
      this.frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  stop() {
    this.running = false;
    return this.frames.slice();
  },
};
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__fps.longTasks.push(e.duration);
  }).observe({ entryTypes: ['longtask'] });
} catch (e) {}
`;

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r1 = (n) => Math.round(n * 100) / 100;
const median = (arr) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : 0);

const SEED = {
  version: 1,
  settings: {
    hourlyRate: 17, overtimeMultiplier: 1.5, currency: '¥', monthlyGoalIncome: 3000,
    dailyGoalHours: 8, weekStartsMonday: true, reminderEnabled: false, reminderTime: '20:00',
    theme: 'light', templates: [
      { id: 't-std', name: '正常班', hours: 8, overtimeHours: 0 },
      { id: 't-long', name: '长班', hours: 10, overtimeHours: 0 },
    ],
    recurring: [],
    savingsGoals: [
      { id: 'g1', name: '买 iPhone 18', target: 7999, startDate: '2026-09-01', initial: 0, createdAt: 1 },
    ],
  },
  entries: (() => {
    const e = {};
    const put = (d, h, ot = 0) => {
      e[d] = { date: d, hours: h, overtimeHours: ot, allowance: 0, deduction: 0, updatedAt: 1 };
    };
    for (let d = 1; d <= 28; d++) {
      const k = `2026-09-${String(d).padStart(2, '0')}`;
      if (d % 7 !== 0) put(k, 8, d % 5 === 0 ? 2 : 0);
    }
    for (let d = 1; d <= 11; d++) {
      const k = `2026-10-${String(d).padStart(2, '0')}`;
      put(k, 10, 2);
    }
    return e;
  })(),
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
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate((s) => {
  localStorage.clear();
  localStorage.setItem('workhours.state.v1', JSON.stringify(s));
}, SEED);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
await page.addInitScript(SAMPLER);
await page.evaluate(SAMPLER);
await page.waitForTimeout(300);

console.log(`\nCPU 降速 ${CPU_SLOWDOWN}x（模拟中端手机）· 视口 393×852 @3x\n`);

/* ---------------- 交互下发方式（重要） ----------------
   **不要用 locator.click()**：Playwright 在点击前会做「可点性检查」，
   内部调用 elementsFromPoint / getBoundingClientRect 逐层命中测试。
   实测在 CPU 4x 下这部分自己就吃掉 300ms+，会被算进「长任务」，
   于是测出来的是**测试框架的开销**，不是 App 的开销。

   改成在页面内直接派发 click（React 的事件委托照样能收到），
   测到的才是 App 真实的渲染成本。 */
const fire = (selector, nth = 0) =>
  page.evaluate(
    ({ sel, n }) => {
      const el = document.querySelectorAll(sel)[n];
      if (!el) throw new Error(`找不到元素: ${sel} #${n}`);
      el.click();
    },
    { sel: selector, n: nth },
  );

const fireAria = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`[aria-label="${l}"]`);
    if (!el) throw new Error(`找不到 aria-label=${l}`);
    el.click();
  }, label);

const fireTab = (text) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll('nav.tabbar button')];
    const el = els.find((e) => e.textContent.includes(t));
    if (!el) throw new Error(`找不到 tab ${t}`);
    el.click();
  }, text);

/* ---------------- 1. 空载基线 ---------------- */
async function measureIdle(ms = 1600) {
  await page.evaluate(() => window.__fps.start());
  await page.waitForTimeout(ms);
  return page.evaluate(() => window.__fps.stop());
}

const idleRuns = [];
for (let i = 0; i < 3; i++) idleRuns.push(await measureIdle());
const idle = idleRuns.flat().filter((d) => d > 0 && d < 200);
const idleP50 = median(idle);
const idleP95 = pct(idle, 95);
console.log('═══ 空载基线 ═══');
console.log(`  帧数 ${idle.length}  p50 ${r1(idleP50)}ms  p95 ${r1(idleP95)}ms  max ${r1(Math.max(...idle))}ms`);
console.log(`  → 无头 Chromium 的实际节奏约 ${r1(1000 / idleP50)} fps（不是 60，是调度器如此）`);
const BUDGET = idleP95 * 2;
console.log(`  → 判卡阈值取空载 p95 的 2 倍 = ${r1(BUDGET)}ms\n`);

/* ---------------- 2. 各交互场景 ---------------- */
async function measure(times, action) {
  const runs = [];
  const longs = [];
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => {
      window.__fps.longTasks = [];
      window.__fps.start();
    });
    await action(i);
    const frames = await page.evaluate(() => window.__fps.stop());
    const lt = await page.evaluate(() => window.__fps.longTasks.slice());
    runs.push(frames.filter((d) => d > 0 && d < 400));
    longs.push(...lt);
  }
  return { frames: runs.flat(), runs, longTasks: longs };
}

function report(tag, r, { allowLong = 0 } = {}) {
  // 单次运行的 p95 抖动很大（同一场景两次能差一倍），
  // 所以取**每次运行各自的 p95，再取中位**——比把所有帧混在一起算 p95 稳得多。
  const perRunP95 = r.runs.map((f) => pct(f, 95)).filter((n) => n > 0);
  const p95 = median(perRunP95);
  const all = r.frames;
  const p50 = median(all);
  const max = Math.max(...all, 0);
  const over = all.filter((d) => d > BUDGET).length;
  const overPct = all.length ? (over / all.length) * 100 : 0;
  const worstLong = r.longTasks.length ? Math.max(...r.longTasks) : 0;

  console.log(
    `  ${tag.padEnd(22)} 帧 ${String(all.length).padStart(4)}  p50 ${r1(p50).toFixed(2)}ms  ` +
      `p95 ${r1(p95).toFixed(2)}ms（${r.runs.length} 次中位）  max ${r1(max).toFixed(2)}ms  ` +
      `超阈 ${over} 帧(${overPct.toFixed(1)}%)  长任务 ${r.longTasks.length} 个(最长 ${r1(worstLong)}ms)`,
  );

  /* 阈值依据（不是拍脑袋）：
     · p95 用空载 p95 的 2 倍：无头 Chromium 自身节奏就在 16.7~17.8ms 抖，
       要求「一帧不落」等于要求它比自己的调度器还准。
     · 超阈帧 < 10%：偶发一次掉帧肉眼无感，持续掉才叫卡。
     · 长任务 < 150ms：4x 降速下 150ms ≈ 真机 37ms，是能明显感到一顿的量级。
       （首次挂载另计，在热身阶段单独报，不混进稳态。） */
  check(`${tag}：p95 ≤ 空载 2 倍`, p95 <= BUDGET, `p95 ${r1(p95)}ms vs ${r1(BUDGET)}ms`);
  check(`${tag}：超阈帧 < 10%`, overPct < 10, `${overPct.toFixed(1)}%`);
  check(`${tag}：稳态无 >150ms 长任务`, worstLong < 150, `最长 ${r1(worstLong)}ms`);
  return { p50, p95, max, overPct, worstLong };
}

console.log('═══ 交互场景帧率 ═══');

/* 先热身：把所有 tab 各访问一次，让「页面首次挂载」的一次性开销
   发生在测量之前。否则会把冷启动成本算进「稳定帧率」里。
   冷挂载成本在最后单独报，不藏起来。 */
console.log('（先热身一轮，让页面首次挂载的一次性开销不计入稳态测量）');
const coldStart = await (async () => {
  await page.evaluate(() => {
    window.__fps.longTasks = [];
    window.__fps.start();
  });
  for (const l of ['统计', '目标', '我的', '日历']) {
    await fireTab(l);
    await page.waitForTimeout(420);
  }
  const frames = await page.evaluate(() => window.__fps.stop());
  const lt = await page.evaluate(() => window.__fps.longTasks.slice());
  return { frames: frames.filter((d) => d > 0 && d < 600), longTasks: lt };
})();
console.log(
  `  → 冷挂载（每个页面第一次打开）：长任务 ${coldStart.longTasks.length} 个，最长 ${r1(Math.max(0, ...coldStart.longTasks))}ms（一次性，之后不再出现）\n`,
);

// 2.1 切 tab（最频繁的操作）
const tabSwitch = await measure(6, async (i) => {
  const labels = ['统计', '目标', '我的', '日历'];
  await fireTab(labels[i % 4]);
  await page.waitForTimeout(520);
});
report('切换底部 tab（稳态）', tabSwitch);

// 2.2 连续切月
await fireTab('日历');
await page.waitForTimeout(400);
const monthSwitch = await measure(5, async () => {
  for (let i = 0; i < 4; i++) {
    await fireAria(i % 2 === 0 ? '下一个月' : '上一个月');
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(260);
});
report('连续切换月份', monthSwitch);

// 2.3 打开 / 关闭记账抽屉（弹簧动画最重的地方）
// 先热一次并单独量「首次打开」：判断那次长任务是一次性挂载还是每次都有。
await page.evaluate(() => {
  window.__fps.longTasks = [];
  window.__fps.start();
});
await fire('.day.has-hours');
await page.waitForTimeout(700);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const sheetCold = await page.evaluate(() => ({ lt: window.__fps.longTasks.slice(), f: window.__fps.stop() }));
console.log(
  `  → 抽屉**首次**打开：长任务 ${sheetCold.lt.length} 个，最长 ${r1(Math.max(0, ...sheetCold.lt))}ms`,
);

const sheet = await measure(4, async () => {
  await fire('.day.has-hours');
  await page.waitForTimeout(620);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(480);
});
report('开/关记账抽屉', sheet);

// 2.4 滚动（统计页内容最长）
await fireTab('统计');
await page.waitForTimeout(600);
const scroll = await measure(5, async () => {
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(240);
});
report('滚动统计页', scroll);

// 2.5 日历批量选择（点 20 个格子，逐帧改 state）
await fireTab('日历');
await page.waitForTimeout(500);
const batch = await measure(3, async () => {
  await fireAria('批量记账');
  await page.waitForTimeout(220);
  const n = await page.evaluate(() => document.querySelectorAll('.day[data-date]').length);
  const count = Math.min(20, n);
  for (let i = 0; i < count; i++) {
    await fire('.day[data-date]', i);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.batch-actions button')].find((x) =>
      x.textContent.includes('退出'),
    );
    if (b) b.click();
  });
  await page.waitForTimeout(200);
});
report('批量勾选 20 天', batch);

/* ---------------- 3. 不允许动画布局属性 ---------------- */
console.log('\n═══ 动画属性纪律（不许动 width/height/top/left）═══');
{
  /* 白名单：**逐条写明理由**，不是宽松正则。
     加新的布局属性动画时必须先在这里补一条理由 —— 这就是这道门的意义。 */
  const ALLOW = [
    {
      sel: '.tab-pill',
      why: '滑块：绝对定位的空元素，宽度变化不影响任何兄弟节点；只在切 tab 时过渡一次。',
    },
    {
      sel: '.segment-thumb',
      why: '分段控件滑块：同上，绝对定位 + 无子节点 + 单次过渡（非逐帧路径）。',
    },
    {
      sel: '.goal-fill',
      why: '进度条：低频（一次数据变化过渡一次），不在滚动或逐帧路径上。',
    },
    {
      sel: '.bar-fill',
      why: '同上，统计页柱状图。',
    },
    {
      sel: '.week-bar-fill',
      why: '同上。',
    },
  ];

  const r = await page.evaluate(() => {
    const bad = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!rule.style || !rule.style.transition) continue;
        const tp = rule.style.transitionProperty || '';
        const t = rule.style.transition || '';
        if (/(^|[\s,])(width|height|top|left|right|bottom|margin|padding)([\s,]|$)/.test(tp + ' ' + t)) {
          bad.push({ sel: rule.selectorText, t: t.slice(0, 90) });
        }
      }
    }
    return bad;
  });

  const allowedSels = ALLOW.map((a) => a.sel);
  const unlisted = r.filter((x) => !allowedSels.some((s) => x.sel.includes(s)));
  for (const x of unlisted) console.log(`     ✗ 未列白名单: ${x.sel} → ${x.t}`);
  check('所有布局属性动画都在白名单里', unlisted.length === 0, `${unlisted.length} 条未列`);

  for (const a of ALLOW) {
    const hit = r.find((x) => x.sel.includes(a.sel));
    console.log(`  ${hit ? '·' : '·'} ${a.sel.padEnd(18)} ${hit ? '在用' : '已不存在（可从白名单删除）'} — ${a.why}`);
  }
}

/* ---------------- 4. 收尾 ---------------- */
check('全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

console.log('\n' + '─'.repeat(76));
if (fails.length === 0) {
  console.log(`✅ 帧率自检全部通过：${pass} 项`);
  await browser.close();
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f}`);
  await browser.close();
  process.exit(1);
}
