/* 白闪修复的视觉证据：
   把 React 的 JS 拦掉（模拟「页面刚到、React 还没挂载」的那一瞬间），
   截图看首帧底色。修复前这里会是接近白的浅色，修复后应为深色。 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('verification', { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();

async function shot(scheme, theme, out) {
  const ctx = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    colorScheme: scheme,
    locale: 'zh-CN',
  });
  await ctx.addInitScript(
    ([t]) => {
      localStorage.setItem(
        'workhours.state.v1',
        JSON.stringify({ version: 1, settings: { theme: t }, entries: {} }),
      );
    },
    [theme],
  );
  await ctx.route('**/assets/*.js', (r) => r.abort()); // 拦掉 React
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await ctx.close();
  console.log(`  📸 ${out}  → 首帧底色 ${bg}`);
  return bg;
}

console.log('\n模拟「React 尚未运行」的首帧（白闪就发生在这个瞬间）：');
const dark = await shot('dark', 'system', 'verification/firstframe-dark.png');
const light = await shot('light', 'system', 'verification/firstframe-light.png');

await browser.close();

const ok = dark === 'rgb(16, 16, 18)' && light === 'rgb(244, 244, 247)';
console.log(ok ? '\n✅ 深浅两种系统偏好下，首帧底色都正确' : '\n❌ 首帧底色不对');
process.exit(ok ? 0 : 1);
