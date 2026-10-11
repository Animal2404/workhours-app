/* ============================================================
   白闪（FOUC）回归测试
   ------------------------------------------------------------
   思路：把 React 的 JS bundle 整个拦掉，只让 index.html 里那段
   内联脚本执行。如果这样首帧颜色仍然正确，就证明「主题判定」
   确实发生在首帧之前，而不是等 React 挂载后才补上。

   只要内联脚本失效（被删/被改成 module/顺序挪后），这个测试就会红。
   ============================================================ */

import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

await mkdir('verification', { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

/* 期望值**从 tokens.css 里读**，不要写死。
   写死过一次：tokens.css 的深色 --bg 从 #101012 改成 #0f0f11 后，
   这里还断言 rgb(16,16,18)，于是 4 项全红 —— 但产品其实是对的，
   红的是测试自己。测试应该跟着真值走，而不是抄一份常量。 */
function readTokens() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf-8');
  const grab = (selector, name) => {
    const i = css.indexOf(selector);
    const seg = css.slice(i, css.indexOf('}', css.indexOf('{', i)));
    const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`).exec(seg);
    if (!m) throw new Error(`tokens.css 里找不到 ${selector} 的 ${name}`);
    return m[1];
  };
  return {
    dark: grab("[data-theme='dark']", '--bg'),
    light: grab("[data-theme='light']", '--bg'),
  };
}

const hexToRgbStr = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

const TOKENS = readTokens();
const DARK_BG = hexToRgbStr(TOKENS.dark);
const LIGHT_BG = hexToRgbStr(TOKENS.light);
console.log(`期望值取自 tokens.css：深色 ${TOKENS.dark} → ${DARK_BG}；浅色 ${TOKENS.light} → ${LIGHT_BG}\n`);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fail++;
};

const browser = await chromium.launch();

/**
 * 打开页面并把 JS bundle 拦掉（模拟「React 还没跑起来」的瞬间）
 * @param {'dark'|'light'} systemScheme 系统配色
 * @param {'system'|'light'|'dark'} savedTheme 本地保存的主题设置
 */
async function probe(systemScheme, savedTheme, { blockJs = true } = {}) {
  const ctx = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    colorScheme: systemScheme,
    locale: 'zh-CN',
  });

  // 预置本地设置（模拟用户已经选过主题）
  await ctx.addInitScript(
    ([theme]) => {
      const state = {
        version: 1,
        settings: { theme, hourlyRate: 20, overtimeMultiplier: 1, currency: '¥' },
        entries: {},
      };
      try {
        localStorage.setItem('workhours.state.v1', JSON.stringify(state));
      } catch {}
    },
    [savedTheme],
  );

  if (blockJs) {
    // 拦掉所有打包 JS，只留内联脚本
    await ctx.route('**/assets/*.js', (r) => r.abort());
  }

  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const got = await page.evaluate(() => {
    const el = document.documentElement;
    return {
      attr: el.getAttribute('data-theme'),
      inlineBg: el.style.backgroundColor,
      computedHtmlBg: getComputedStyle(el).backgroundColor,
      computedBodyBg: getComputedStyle(document.body).backgroundColor,
      colorScheme: el.style.colorScheme,
      reactMounted: !!document.querySelector('#root')?.children.length,
    };
  });

  await ctx.close();
  return got;
}

console.log('\n[1] 深色系统 + 主题跟随系统（用户遇到的那一档）');
{
  const r = await probe('dark', 'system');
  check('React 确实没跑起来（只测内联脚本）', r.reactMounted === false, `reactMounted=${r.reactMounted}`);
  check('data-theme = dark', r.attr === 'dark', `实际 ${r.attr}`);
  check('首帧 html 背景是深色', r.computedHtmlBg === DARK_BG, `实际 ${r.computedHtmlBg}`);
  check('color-scheme = dark', r.colorScheme === 'dark', `实际 ${r.colorScheme}`);
}

console.log('\n[2] 深色系统 + 手动选浅色（应尊重用户设置）');
{
  const r = await probe('dark', 'light');
  check('data-theme = light', r.attr === 'light', `实际 ${r.attr}`);
  check('首帧 html 背景是浅色', r.computedHtmlBg === LIGHT_BG, `实际 ${r.computedHtmlBg}`);
}

console.log('\n[3] 浅色系统 + 主题跟随系统');
{
  const r = await probe('light', 'system');
  check('data-theme = light', r.attr === 'light', `实际 ${r.attr}`);
  check('首帧 html 背景是浅色', r.computedHtmlBg === LIGHT_BG, `实际 ${r.computedHtmlBg}`);
}

console.log('\n[4] 浅色系统 + 手动选深色');
{
  const r = await probe('light', 'dark');
  check('data-theme = dark', r.attr === 'dark', `实际 ${r.attr}`);
  check('首帧 html 背景是深色', r.computedHtmlBg === DARK_BG, `实际 ${r.computedHtmlBg}`);
}

console.log('\n[5] React 正常运行时不冲突（避免修好首帧、弄坏运行时）');
{
  const r = await probe('dark', 'system', { blockJs: false });
  check('React 已挂载', r.reactMounted === true);
  check('data-theme 仍为 dark', r.attr === 'dark', `实际 ${r.attr}`);
  check('html 背景仍为深色', r.computedHtmlBg === DARK_BG, `实际 ${r.computedHtmlBg}`);
  check('body 背景也是深色（主题变量生效）', r.computedBodyBg === DARK_BG, `实际 ${r.computedBodyBg}`);
}

await browser.close();

console.log(`\n${'─'.repeat(52)}`);
console.log(fail === 0 ? `✅ 白闪回归测试全部通过（${pass} 项）` : `❌ ${fail} 项失败 / 共 ${pass + fail} 项`);
console.log('─'.repeat(52));
process.exit(fail === 0 ? 0 : 1);
