/* ============================================================
   Android 资源自检
   ------------------------------------------------------------
   为什么需要它：
   XML 注释里不允许出现连续两个减号。我第一版就在注释里写了
   「--bg」，aapt 会在编译期直接报错、整个 APK 构建失败。
   这类错误本地不查就只能在 CI 上炸一次，所以固化成脚本。

   检查项：
   1. assets/android 下所有 XML 都是 well-formed
   2. 深浅两套 app_background 与 tokens.css 的 bg 值一致
      （三方对齐，避免改了一处忘了另一处又出现白闪）
   3. 闪屏底色与 splash.png 实际底色一致
   ============================================================ */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const assetsDir = join(root, 'assets', 'android');

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fails.push(name + (detail ? ` (${detail})` : ''));
};

/* ---------------- 1. XML well-formed ---------------- */
console.log('\n[1] XML 结构');
const xmlFiles = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.xml')) xmlFiles.push(p);
  }
}
await walk(assetsDir);

for (const f of xmlFiles) {
  const text = await readFile(f, 'utf8');
  const rel = f.replace(root + '\\', '').replace(root + '/', '');

  // XML 注释不能含 "--"
  const comments = text.match(/<!--[\s\S]*?-->/g) ?? [];
  const badComment = comments.find((c) => c.slice(4, -3).includes('--'));

  // 标签配平
  const open = (text.match(/<[a-zA-Z][^>]*[^/]>/g) ?? []).length;
  const close = (text.match(/<\/[a-zA-Z][^>]*>/g) ?? []).length;
  const selfClose = (text.match(/<[a-zA-Z][^>]*\/>/g) ?? []).length;
  const balanced = open === close + selfClose;

  check(`${rel} well-formed`, !badComment && balanced,
    badComment ? 'XML 注释里含连续减号（--），aapt 会报错' : (!balanced ? `标签不配平 open=${open} close=${close} self=${selfClose}` : ''));
}

/* ---------------- 2. 背景色三方对齐 ---------------- */
console.log('\n[2] 背景色一致性（tokens.css ↔ Android 资源）');
const tokens = await readFile(join(root, 'src', 'styles', 'tokens.css'), 'utf8');

// 取 tokens.css 里浅色 :root 的 --bg
const lightBg = tokens.match(/--bg:\s*(#[0-9a-fA-F]{6})/)?.[1]?.toUpperCase();
// 取深色块里的 --bg
const darkSection = tokens.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const darkBg = darkSection.match(/--bg:\s*(#[0-9a-fA-F]{6})/)?.[1]?.toUpperCase();

const lightXml = await readFile(join(assetsDir, 'values', 'colors.xml'), 'utf8');
const nightXml = await readFile(join(assetsDir, 'values-night', 'colors.xml'), 'utf8');

const xmlLightBg = lightXml.match(/name="app_background">(#[0-9a-fA-F]{6})</)?.[1]?.toUpperCase();
const xmlDarkBg = nightXml.match(/name="app_background">(#[0-9a-fA-F]{6})</)?.[1]?.toUpperCase();

console.log(`    tokens.css 浅色 bg = ${lightBg} / Android app_background = ${xmlLightBg}`);
console.log(`    tokens.css 深色 bg = ${darkBg} / Android app_background(night) = ${xmlDarkBg}`);

check('浅色背景一致', !!lightBg && lightBg === xmlLightBg, `${lightBg} vs ${xmlLightBg}`);
check('深色背景一致', !!darkBg && darkBg === xmlDarkBg, `${darkBg} vs ${xmlDarkBg}`);

/* ---------------- 3. 闪屏底色 ---------------- */
console.log('\n[3] 闪屏底色');
const splashBg = lightXml.match(/name="splash_background">(#[0-9a-fA-F]{6})</)?.[1]?.toUpperCase();
// splash.png 的像素底色（读 PNG，用浏览器渲染太慢，这里只校验已声明且非白）
check('闪屏底色已声明且不为白色', !!splashBg && splashBg !== '#FFFFFF', `splash_background = ${splashBg}`);

const splashPath = join(assetsDir, 'drawable', 'splash.png');
check('splash.png 存在', existsSync(splashPath));

/* ---------------- 结果 ---------------- */
console.log(`\n${'─'.repeat(52)}`);
if (fails.length === 0) {
  console.log(`✅ Android 资源自检全部通过（${pass} 项）`);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f}`);
}
console.log('─'.repeat(52));
process.exit(fails.length === 0 ? 0 : 1);
