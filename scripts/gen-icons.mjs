/* ============================================================
   生成 Android 启动图标 + 启动画面
   ------------------------------------------------------------
   不引入额外图像库：直接复用 Playwright 自带的 Chromium 渲染 SVG。
   产物写到 assets/android/（会被提交），构建时由
   scripts/apply-android-assets.mjs 拷进 android/ 工程。

   运行：npm run icons:generate
   ============================================================ */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outRoot = join(root, 'assets', 'android');

/* 先清干净，避免残留旧图标 */
await rm(outRoot, { recursive: true, force: true });

/* 自适应图标：前景只占中间 62%，四周留给系统裁切 */
const DENSITIES = [
  { name: 'mdpi', legacy: 48, fg: 108 },
  { name: 'hdpi', legacy: 72, fg: 162 },
  { name: 'xhdpi', legacy: 96, fg: 216 },
  { name: 'xxhdpi', legacy: 144, fg: 324 },
  { name: 'xxxhdpi', legacy: 192, fg: 432 },
];

/* 启动画面尺寸：竖屏 + 横屏，各密度 */
const SPLASH = [
  { dir: 'drawable', w: 480, h: 320 },
  { dir: 'drawable-port-mdpi', w: 320, h: 480 },
  { dir: 'drawable-port-hdpi', w: 480, h: 800 },
  { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
  { dir: 'drawable-land-mdpi', w: 480, h: 320 },
  { dir: 'drawable-land-hdpi', w: 800, h: 480 },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
  { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
  { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
];

const BRAND = '#6D5EFC';

const iconSvg = await readFile(join(root, 'public', 'icon.svg'), 'utf8');
const maskableSvg = await readFile(join(root, 'public', 'icon-maskable.svg'), 'utf8');

/** 自适应图标前景：透明底 + 白色时钟，缩到中间 */
const foregroundSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <g transform="translate(256 256) scale(0.62) translate(-256 -256)">
    <circle cx="256" cy="256" r="132" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="26" />
    <path d="M256 150v106" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <path d="M256 256l78 62" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <circle cx="256" cy="256" r="18" fill="#ffffff" />
  </g>
</svg>`;

/** 启动画面：品牌色底 + 居中白色时钟 */
const splashSvg = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BRAND}"/>
  <g transform="translate(${w / 2} ${h / 2}) scale(${s / 512}) translate(-256 -256)">
    <circle cx="256" cy="256" r="132" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="26" />
    <path d="M256 150v106" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <path d="M256 256l78 62" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" />
    <circle cx="256" cy="256" r="18" fill="#ffffff" />
  </g>
</svg>`;
};

const browser = await chromium.launch();

async function render(svg, w, h, outPath) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  // SVG 里写死了尺寸；改成目标尺寸，viewBox 保证等比缩放而不是被裁掉
  const sized = svg
    .replace(/width="\d+"/, `width="${w}"`)
    .replace(/height="\d+"/, `height="${h}"`);
  await page.setContent(
    `<html><body style="margin:0;padding:0;background:transparent">
       <div style="width:${w}px;height:${h}px;overflow:hidden">${sized}</div>
     </body></html>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: outPath, omitBackground: true });
  await page.close();
}

console.log('生成 Android 图标...\n');

for (const d of DENSITIES) {
  const dir = join(outRoot, `mipmap-${d.name}`);
  await mkdir(dir, { recursive: true });
  await render(iconSvg, d.legacy, d.legacy, join(dir, 'ic_launcher.png'));
  await render(iconSvg, d.legacy, d.legacy, join(dir, 'ic_launcher_round.png'));
  await render(foregroundSvg(d.fg), d.fg, d.fg, join(dir, 'ic_launcher_foreground.png'));
  console.log(`  ✓ mipmap-${d.name}  legacy ${d.legacy}px / 前景 ${d.fg}px`);
}

console.log('\n生成启动画面...\n');
for (const s of SPLASH) {
  const dir = join(outRoot, s.dir);
  await mkdir(dir, { recursive: true });
  await render(splashSvg(s.w, s.h), s.w, s.h, join(dir, 'splash.png'));
  console.log(`  ✓ ${s.dir}/splash.png  ${s.w}x${s.h}`);
}

/* 自适应图标底色 + 品牌色资源 */
await mkdir(join(outRoot, 'values'), { recursive: true });
await writeFile(
  join(outRoot, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND}</color>
</resources>
`,
  'utf8',
);

/* 启动画面的主题样式：让闪屏就是品牌色，而不是白屏一闪 */
await writeFile(
  join(outRoot, 'values', 'styles.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- 基础主题 -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <!-- 启动画面：品牌色底 + 居中 logo，配合 drawable/splash.png -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`,
  'utf8',
);

/* 状态栏/主题色也跟着品牌走 */
await writeFile(
  join(outRoot, 'values', 'colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">${BRAND}</color>
    <color name="colorPrimaryDark">#4F46E5</color>
    <color name="colorAccent">#4F8DFF</color>
</resources>
`,
  'utf8',
);

console.log('\n  ✓ values/ic_launcher_background.xml  → 品牌底色');
console.log('  ✓ values/styles.xml                  → 启动画面主题');
console.log('  ✓ values/colors.xml                  → 主题色');

await browser.close();
console.log(`\n✅ 全部生成到 ${outRoot}`);
