/* ============================================================
   FCP / TTI A/B 对照测量
   ------------------------------------------------------------
   性能队友报告：全工作区（他的改动 + 我的节假日改动）相对 HEAD
   出现 FCP 400→464ms、TTI 462→521ms 的**退步**，
   并指出退步来自节假日数据与日历逻辑。

   用户的要求是「首屏可交互时间不劣于改动前」，所以这条不能靠感觉。
   本脚本对两份产物交替测量多轮，取中位数与离散度：
     · HEAD   → http://127.0.0.1:4180  （git worktree，commit 50eace4）
     · 现在   → http://127.0.0.1:4173  （全部改动）

   交替测量（A,B,A,B…）而不是「先测完 A 再测完 B」，
   可以把机器负载漂移平摊到两边，避免把系统噪声当成代码差异。
   ============================================================ */

import { chromium } from 'playwright';

const A = process.env.A_URL ?? 'http://127.0.0.1:4180/'; // HEAD
const B = process.env.B_URL ?? 'http://127.0.0.1:4173/'; // 全部改动
const ROUNDS = Number(process.env.ROUNDS ?? 9);

const browser = await chromium.launch();

async function shot(url) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  // 中端安卓档：4x CPU 节流（与性能队友口径一致）
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
    const nav = performance.getEntriesByType('navigation')[0];
    // 交互可用：React 真正挂载出内容的时刻（用 MutationObserver 记录）
    return {
      fcp: fcp ? +fcp.toFixed(1) : null,
      domReady: nav ? +nav.domContentLoadedEventEnd.toFixed(1) : null,
      loadEnd: nav ? +nav.loadEventEnd.toFixed(1) : null,
      mounted: window.__mountedAt ? +window.__mountedAt.toFixed(1) : null,
    };
  });
  await ctx.close();
  return m;
}

/* 注入挂载时刻探针（在页面脚本之前跑） */
const PROBE = () => {
  window.__mountedAt = null;
  const t0 = performance.now();
  const check = () => {
    const root = document.getElementById('root');
    if (root && root.children.length > 0 && window.__mountedAt === null) {
      window.__mountedAt = performance.now() - t0 + 0;
      return true;
    }
    return false;
  };
  if (!check()) {
    const mo = new MutationObserver(() => {
      if (check()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
};

const rows = { A: [], B: [] };

for (let i = 0; i < ROUNDS; i++) {
  // 交替：A B A B…（奇偶轮换顺序，进一步抵消漂移）
  const order = i % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
  for (const which of order) {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
    });
    await ctx.addInitScript(PROBE);
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(which === 'A' ? A : B, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const paints = performance.getEntriesByType('paint');
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        fcp: paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null,
        mounted: window.__mountedAt,
        loadEnd: nav ? nav.loadEventEnd : null,
      };
    });
    rows[which].push(m);
    await ctx.close();
  }
}

await browser.close();

const med = (a) => {
  const s = a.filter((x) => typeof x === 'number' && x > 0).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const p = (a, q) => {
  const s = a.filter((x) => typeof x === 'number' && x > 0).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null;
};
const fmt = (v) => (v === null ? 'n/a' : `${v.toFixed(1)}ms`);

const metric = (k) => ({
  aMed: med(rows.A.map((r) => r[k])),
  bMed: med(rows.B.map((r) => r[k])),
  aP10: p(rows.A.map((r) => r[k]), 0.1),
  bP10: p(rows.B.map((r) => r[k]), 0.1),
  aMax: Math.max(...rows.A.map((r) => r[k] ?? 0)),
  bMax: Math.max(...rows.B.map((r) => r[k] ?? 0)),
});

console.log(`\n交替测量 ${ROUNDS} 轮（CPU 4x 节流，iPhone 14 Pro 模拟）`);
console.log('指标        HEAD 中位   现在 中位    差异      HEAD P10   现在 P10    HEAD 最大  现在 最大');
console.log('─'.repeat(96));
const results = {};
for (const [label, key] of [
  ['FCP', 'fcp'],
  ['挂载时刻', 'mounted'],
  ['loadEnd', 'loadEnd'],
]) {
  const r = metric(key);
  const diff = r.bMed !== null && r.aMed !== null ? r.bMed - r.aMed : null;
  results[key] = { ...r, diff };
  console.log(
    `${label.padEnd(10)} ${fmt(r.aMed).padStart(10)} ${fmt(r.bMed).padStart(11)} ` +
      `${(diff === null ? 'n/a' : (diff > 0 ? '+' : '') + diff.toFixed(1) + 'ms').padStart(9)} ` +
      `${fmt(r.aP10).padStart(11)} ${fmt(r.bP10).padStart(10)} ` +
      `${fmt(r.aMax).padStart(11)} ${fmt(r.bMax).padStart(10)}`,
  );
}
console.log('─'.repeat(96));

/* 判定：中位数差异是否超过 HEAD 自身的抖动幅度 */
const spreadFcp = results.fcp.aMax - results.fcp.aP10;
console.log(`HEAD 自身 FCP 抖动幅度(P10→最大) = ${spreadFcp.toFixed(1)}ms`);
const real = results.fcp.diff !== null && results.fcp.diff > spreadFcp;
console.log(
  real
    ? `❌ 现在的 FCP 中位数比 HEAD 慢 ${results.fcp.diff.toFixed(1)}ms，超过 HEAD 自身抖动 → 判为真实退步`
    : `✅ 差异 ${results.fcp.diff === null ? 'n/a' : results.fcp.diff.toFixed(1)}ms 未超过 HEAD 自身抖动 ${spreadFcp.toFixed(1)}ms → 判为噪声`,
);
