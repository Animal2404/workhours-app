/* 诊断：量真实 DOM 几何，不猜 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500); // 远超动画时长

console.log('=== 视口 ===');
console.log(await page.evaluate(() => ({
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  dpr: window.devicePixelRatio,
})));

console.log('\n=== BlurFade 状态（2.5 秒后应该已经完全清晰）===');
console.log(await page.evaluate(() =>
  [...document.querySelectorAll('.blur-fade')].map((el) => {
    const cs = getComputedStyle(el);
    return {
      cls: el.className,
      opacity: cs.opacity,
      filter: cs.filter,
      transform: cs.transform,
      transitionDelay: cs.transitionDelay,
    };
  }),
));

console.log('\n=== reduced motion 环境 ===');
console.log(await page.evaluate(() => ({
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  transparency: window.matchMedia('(prefers-reduced-transparency: reduce)').matches,
  contrast: window.matchMedia('(prefers-contrast: more)').matches,
})));

/* 打开抽屉，量几何 */
console.log('\n=== 打开记录抽屉 ===');
await page.getByRole('button', { name: /记这天的工时|修改这天/ }).click();
await page.waitForTimeout(1200);

console.log(await page.evaluate(() => {
  const sheet = document.querySelector('.sheet');
  const body = document.querySelector('.sheet-body');
  const foot = document.querySelector('.sheet-foot');
  const grab = document.querySelector('.sheet-grabber');
  const bar = document.querySelector('.tabbar');
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      height: Math.round(b.height),
    };
  };
  const cs = sheet ? getComputedStyle(sheet) : null;
  return {
    viewportH: window.innerHeight,
    sheet: r(sheet),
    sheetMaxHeight: cs?.maxHeight,
    sheetTransform: cs?.transform,
    grabber: r(grab),
    body: r(body),
    bodyScrollHeight: body?.scrollHeight,
    bodyClientHeight: body?.clientHeight,
    bodyMinHeight: body ? getComputedStyle(body).minHeight : null,
    foot: r(foot),
    tabbar: r(bar),
    sheetZ: cs?.zIndex,
    tabbarZ: bar ? getComputedStyle(bar).zIndex : null,
    // 抽屉顶部是否超出视口
    sheetOverflowsTop: sheet ? sheet.getBoundingClientRect().top < -1 : null,
  };
}));

await browser.close();
