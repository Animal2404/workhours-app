/* ============================================================
   生成 Android 启动图标（用 Chromium 渲染 SVG → PNG）
   ------------------------------------------------------------
   不引入额外图像库：直接用已经装好的 Chromium 截图。
   输出到 android/app/src/main/res/ 下各 mipmap-密度目录，并改掉自适应图标的底色。
   ============================================================ */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');

/* 自适应图标：前景只占中间 66%，四周留给系统裁切 */
const DENSITIES = [
  { name: 'mdpi', legacy: 48, fg: 108 },
  { name: 'hdpi', legacy: 72, fg: 162 },
  { name: 'xhdpi', legacy: 96, fg: 216 },
  { name: 'xxhdpi', legacy: 144, fg: 324 },
  { name: 'xxxhdpi', legacy: 192, fg: 432 },
];

const iconSvg = await readFile(join(root, 'public', 'icon.svg'), 'utf8');
const maskableSvg = await readFile(join(root, 'public', 'icon-maskable.svg'), 'utf8');

/* 前景：透明背景 + 白色时钟图形，缩到 66% */
const foregroundSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <g transform="translate(256 256) scale(0.62) translate(-256 -256)">
    <circle cx="256" cy="256" r="132" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="26" />
    <path d="M256 150v106" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <path d="M256 256l78 62" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <circle cx="256" cy="256" r="18" fill="#ffffff" />
  </g>
</svg>`;

const browser = await chromium.launch();

async function render(svg, size, outPath) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  // SVG 里写死了 width/height=512，直接塞进小容器会被裁掉而不是缩放；
  // 这里把尺寸改写成目标尺寸，viewBox 保留，图形才会等比缩放。
  const sized = svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
  await page.setContent(
    `<html><body style="margin:0;padding:0;background:transparent">
       <div style="width:${size}px;height:${size}px;overflow:hidden">${sized}</div>
     </body></html>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: outPath, omitBackground: true });
  await page.close();
}

console.log('生成启动图标...\n');

for (const d of DENSITIES) {
  const dir = join(res, `mipmap-${d.name}`);
  // 传统图标（含背景的完整方形）
  await render(iconSvg, d.legacy, join(dir, 'ic_launcher.png'));
  await render(iconSvg, d.legacy, join(dir, 'ic_launcher_round.png'));
  // 自适应图标前景（透明底）
  await render(foregroundSvg(d.fg), d.fg, join(dir, 'ic_launcher_foreground.png'));
  console.log(`  ✓ mipmap-${d.name}  legacy ${d.legacy}px / fg ${d.fg}px`);
}

/* 让自适应图标背景用品牌色，跟图标本体一致 */
await writeFile(
  join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#6D5EFC</color>
</resources>
`,
  'utf8',
);
console.log('  ✓ 自适应图标底色 → #6D5EFC');

/* 顺便把启动画面（splash）也换成品牌色，别闪白屏 */
try {
  const stylesPath = join(res, 'values', 'styles.xml');
  const styles = await readFile(stylesPath, 'utf8');
  console.log('\nstyles.xml 现状（前 20 行）：');
  console.log(styles.split('\n').slice(0, 20).join('\n'));
} catch {
  console.log('\n（没有 styles.xml，跳过）');
}

await browser.close();
console.log('\n✅ 图标生成完成');
