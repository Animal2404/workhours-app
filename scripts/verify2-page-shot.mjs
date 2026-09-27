/* verify2 · 预览页整页截图（供交付 gate 的 page-verify 证据用） */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.cal-grid', { timeout: 20000 });
await page.waitForTimeout(800);
console.log('标题:', await page.title());
console.log('URL:', page.url());
console.log('初始月份:', (await page.evaluate(() => document.querySelector('.cal-month')?.textContent)) ?? '');
console.log('pageerror:', errs.length);
await page.screenshot({ path: join(ROOT, 'verification', 'verify2-page-app.png'), fullPage: true });
await browser.close();
