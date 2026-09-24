/* ============================================================
   交互验证：抽屉的拖拽/甩动关闭（自己写的弹簧，必须实测）
   + 设置页下方内容 + 提示条
   ============================================================ */

import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '..', 'shots');
await mkdir(shots, { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failures = 0;
const assert = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

/* 先记一天，好让设置页有数据 */
await page.getByRole('button', { name: /记这天的工时|修改这天/ }).click();
await page.waitForTimeout(500);
await page.locator('.sheet .chip', { hasText: /^8小时$/ }).click();
await page.waitForTimeout(300);
await page.locator('.sheet-foot .btn-primary').click();
await page.waitForTimeout(800);

/* ---------------- 1. 拖拽关闭 ---------------- */
console.log('\n[1] 抽屉拖拽关闭');
await page.getByRole('button', { name: /修改这天|记这天的工时/ }).click();
await page.waitForTimeout(700);

const grab = await page.locator('.sheet-grabber').boundingBox();
assert('抽屉把手可见', !!grab);

// 1:1 跟手：按下后拖 150px，量抽屉实际位移是否跟着走
await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
await page.mouse.down();
await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + 150, { steps: 12 });
await page.waitForTimeout(120);

const duringDrag = await page.evaluate(() => {
  const sheet = document.querySelector('.sheet');
  const m = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
  return { translateY: Math.round(m.f), top: Math.round(sheet.getBoundingClientRect().top) };
});
console.log(`    拖动 150px 后：位移 ${duringDrag.translateY}px`);
assert(
  '跟手：位移接近手指距离（1:1）',
  Math.abs(duringDrag.translateY - 150) < 25,
  `实际 ${duringDrag.translateY}px`,
);

await page.screenshot({ path: join(shots, '13-sheet-dragging.png') });

// 松开 → 应该弹回去（没超过阈值）
await page.mouse.up();
await page.waitForTimeout(900);
const afterRelease = await page.evaluate(() => {
  const sheet = document.querySelector('.sheet');
  return sheet ? Math.round(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).f) : null;
});
console.log(`    松手后归位到：${afterRelease}px`);
assert('小幅拖动后自动归位', afterRelease !== null && Math.abs(afterRelease) < 3);

// ---------------- 2. 快速甩动应关闭（动量投影） ----------------
console.log('\n[2] 快速甩动关闭（动量投影 + 速度交接）');
const grab2 = await page.locator('.sheet-grabber').boundingBox();
await page.mouse.move(grab2.x + grab2.width / 2, grab2.y + grab2.height / 2);
await page.mouse.down();
// 快速下甩，位移不大但速度很快
await page.mouse.move(grab2.x + grab2.width / 2, grab2.y + grab2.height / 2 + 60, { steps: 3 });
await page.mouse.move(grab2.x + grab2.width / 2, grab2.y + grab2.height / 2 + 120, { steps: 2 });
await page.mouse.up();
await page.waitForTimeout(900);
const closedByFlick = await page.locator('.sheet').count();
assert('快速甩动后抽屉关闭', closedByFlick === 0, `.sheet 数量 ${closedByFlick}`);

/* ---------------- 3. 点遮罩关闭 ---------------- */
console.log('\n[3] 点遮罩关闭');
await page.getByRole('button', { name: /修改这天|记这天的工时/ }).click();
await page.waitForTimeout(700);
await page.locator('.sheet-scrim').click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(800);
assert('点遮罩后关闭', (await page.locator('.sheet').count()) === 0);

/* ---------------- 4. 设置页下方（ShineBorder 完整可见） ---------------- */
console.log('\n[4] 设置页下半部分');
await page.getByRole('button', { name: '我的' }).click();
await page.waitForTimeout(700);
await page.evaluate(() => {
  document.querySelector('.app-main')?.scrollTo?.(0, 900);
  window.scrollTo(0, 900);
});
// 主区是文档流，直接滚页面
await page.mouse.wheel(0, 900);
await page.waitForTimeout(700);
await page.screenshot({ path: join(shots, '14-settings-lower.png') });

const shineBox = await page.locator('.shine-wrap').boundingBox().catch(() => null);
assert('ShineBorder 卡片存在于页面', !!shineBox);

/* ---------------- 5. 提示条 ---------------- */
console.log('\n[5] 保存提示条');
await page.getByRole('button', { name: '日历' }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /修改这天|记这天的工时/ }).click();
await page.waitForTimeout(600);
await page.locator('.sheet .chip', { hasText: /^10小时$/ }).click();
await page.waitForTimeout(200);
await page.locator('.sheet-foot .btn-primary').click();
await page.waitForTimeout(500);
const toastText = await page.locator('.toast').first().textContent().catch(() => null);
console.log(`    提示条内容：${toastText}`);
assert('保存后出现提示条', !!toastText && /已记/.test(toastText));
await page.screenshot({ path: join(shots, '15-toast.png') });

/* ---------------- 6. 无障碍 ---------------- */
console.log('\n[6] 无障碍基本检查');
const a11y = await page.evaluate(() => {
  const days = [...document.querySelectorAll('.day:not(.is-blank)')];
  const labelled = days.filter((d) => (d.getAttribute('aria-label') ?? '').length > 4);
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const tabbar = document.querySelector('nav[aria-label]');
  const todayMarked = document.querySelectorAll('[aria-current="date"]').length;
  const lang = document.documentElement.lang;
  const tabButtons = [...document.querySelectorAll('.tab')];
  return {
    days: days.length,
    labelled: labelled.length,
    hasTabbar: !!tabbar,
    todayMarked,
    lang,
    tabLabels: tabButtons.map((b) => b.textContent?.trim()).filter(Boolean),
    dialogsOpen: dialogs.length,
  };
});
console.log('   ', JSON.stringify(a11y));
assert('每个日期都有 aria-label', a11y.labelled === a11y.days, `${a11y.labelled}/${a11y.days}`);
assert('底部导航有语义标签', a11y.hasTabbar);
assert('今天被标记 aria-current', a11y.todayMarked === 1);
assert('页面语言为 zh-CN', a11y.lang === 'zh-CN');
assert('4 个 tab 都有文字标签', a11y.tabLabels.length === 4);

console.log(`\n${'─'.repeat(50)}`);
assert('无 JS 报错', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(failures === 0 ? '✅ 交互验证全部通过' : `❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
