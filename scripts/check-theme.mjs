/* ============================================================
   主题配色自检
   ------------------------------------------------------------
   直接**解析 src/styles/tokens.css**，不抄常量 —— 抄一份就会漂移。

   守三件事：
   1. **大面积必须无彩**（shadcn 的核心纪律）：background / card /
      muted / hero 卡底 这些铺满屏的角色，彩度必须接近 0。
      上一版深色被吐槽就是拿高饱和金色铺大面积 —— 这条把它变成可测规则。
   2. **强调色只做小面积点缀**：primary 不允许出现在大面积底色角色里。
   3. WCAG 对比度：半透明按 alpha 合成后再算，深色浅色各测一遍。
   4. 首帧底色四处一致（tokens.css / index.html / store.tsx / Android 资源）。

   跑：node scripts/check-theme.mjs
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf-8');

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fails.push(name);
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

/* ---------------- 解析 tokens.css ---------------- */
function blockOf(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`找不到 ${selector}`);
  const start = css.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') {
      depth--;
      if (depth === 0) return css.slice(start + 1, j);
    }
  }
  throw new Error(`${selector} 大括号不配平`);
}

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = vars(blockOf(":root,\n[data-theme='light']"));
const dark = vars(blockOf("[data-theme='dark']"));

/** 解析 var() 间接引用（最多 6 层），让 var(--day-full-bg) → var(--accent) → 真值 */
function resolve(name, table, depth = 0) {
  if (depth > 6) throw new Error(`${name} 的 var() 引用成环`);
  const raw = table[name];
  if (raw === undefined) throw new Error(`缺少 ${name}`);
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
  if (m) return resolve(m[1], table, depth + 1);
  return raw;
}

/* ---------------- 颜色工具 ---------------- */
function parseColor(v) {
  const s = String(resolve0(v)).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return { rgb: m[1].split('').map((c) => parseInt(c + c, 16)), a: 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`无法解析颜色: ${s}`);
}
// parseColor 可能被传入已经解析过的字符串，保留一个空壳
const resolve0 = (v) => v;

const comp = (fg, bgRgb) => fg.rgb.map((c, i) => c * fg.a + bgRgb[i] * (1 - fg.a));

function gradientEnds(v) {
  const colors = [...String(v).matchAll(/#[0-9a-f]{6}|rgba?\([^)]*\)/gi)].map((m) => m[0]);
  if (!colors.length) throw new Error(`无法解析渐变: ${v}`);
  return [parseColor(colors[0]), parseColor(colors[colors.length - 1])];
}

const lum = ([r, g, b]) => {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (n) => Math.round(n * 100) / 100;
const rgbStr = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;

function pair(tag, label, fgRaw, bgRgbs, need) {
  const fg = parseColor(fgRaw);
  let worst = Infinity;
  let worstBg = null;
  for (const bgRgb of bgRgbs) {
    const cr = ratio(comp(fg, bgRgb), bgRgb);
    if (cr < worst) {
      worst = cr;
      worstBg = bgRgb;
    }
  }
  const ok = worst >= need;
  if (ok) pass++;
  else fails.push(`[${tag}] ${label} ${r2(worst)}:1`);
  console.log(
    `  ${ok ? '✓' : '✗'} [${tag}] ${label.padEnd(26)} ${r2(worst).toFixed(2)}:1 (需 ${need})`,
  );
}

/** 彩度代理：max−min（0 = 纯灰）。用来判定「大面积是不是无彩」 */
const chroma = (v) => {
  const s = String(v).trim();
  // 渐变取两端里最花的那一端
  if (/gradient/i.test(s)) {
    return Math.max(...gradientEnds(s).map((c) => Math.max(...c.rgb) - Math.min(...c.rgb)));
  }
  const { rgb } = parseColor(s);
  return Math.max(...rgb) - Math.min(...rgb);
};

/* ============================================================
   1. 大面积必须无彩（shadcn 纪律）
   ============================================================ */
console.log('\n═══ 1. 大面积底色必须无彩（chroma ≤ 20/255）═══');
{
  const LARGE = ['--background', '--card', '--popover', '--muted', '--secondary', '--hero-bg'];
  const LIMIT = 20;
  for (const [tag, table] of [
    ['浅色', light],
    ['深色', dark],
  ]) {
    for (const name of LARGE) {
      const c = chroma(resolve(name, table));
      const ok = c <= LIMIT;
      if (ok) pass++;
      else fails.push(`[${tag}] ${name} 彩度 ${c}`);
      console.log(`  ${ok ? '✓' : '✗'} [${tag}] ${name.padEnd(14)} 彩度 ${String(c).padStart(3)} / ${LIMIT}`);
    }
  }
}

/* ============================================================
   1b. 大面积上的「叠加层」也必须克制
   ------------------------------------------------------------
   主数字卡 = --hero-bg（中性渐变）+ ::after 的 --hero-glow 径向叠加。
   只查 --hero-bg 会漏掉叠加层 —— 上一版就是这样漏过去的：
   底色是中性，但 0.22 的强调色辉光铺在整张卡上，看起来还是绿卡。
   ============================================================ */
console.log('\n═══ 1b. 大面积叠加层（hero 辉光）必须克制 ═══');
{
  const LIMIT = 30;
  for (const [tag, table] of [
    ['浅色', light],
    ['深色', dark],
  ]) {
    const bg = parseColor(resolve('--background', table)).rgb;
    // 辉光合成到主数字卡最亮那一端
    const heroTop = comp(gradientEnds(resolve('--hero-bg', table))[0], bg);
    const glow = parseColor(resolve('--hero-glow', table));
    const composited = comp(glow, heroTop);
    const c = Math.max(...composited) - Math.min(...composited);
    const ok = c <= LIMIT;
    if (ok) pass++;
    else fails.push(`[${tag}] hero 辉光合成后彩度 ${c}`);
    console.log(
      `  ${ok ? '✓' : '✗'} [${tag}] 辉光 alpha=${glow.a} 合成后彩度 ${String(c).padStart(3)} / ${LIMIT}  ${rgbStr(composited)}`,
    );
  }
}

/* ============================================================
   2. 强调色不得铺大面积
   ============================================================ */
console.log('\n═══ 2. 强调色只做小面积点缀 ═══');
{
  // primary 的值不允许出现在大面积角色的定义里（直接或经 var 间接）
  const LARGE = ['--background', '--card', '--popover', '--hero-bg', '--muted'];
  for (const [tag, table] of [
    ['浅色', light],
    ['深色', dark],
  ]) {
    const p = resolve('--primary', table).toUpperCase();
    const bad = LARGE.filter((n) => resolve(n, table).toUpperCase().includes(p));
    check(`[${tag}] primary(${resolve('--primary', table)}) 未用于大面积底色`, bad, []);
  }
  // accent 是「淡色底」，彩度也必须有上限（它是小面积，但仍不该是高饱和）
  for (const [tag, table] of [
    ['浅色', light],
    ['深色', dark],
  ]) {
    const c = chroma(resolve('--accent', table));
    const ok = c <= 40;
    if (ok) pass++;
    else fails.push(`[${tag}] --accent 彩度 ${c}`);
    console.log(`  ${ok ? '✓' : '✗'} [${tag}] --accent 彩度 ${String(c).padStart(3)} / 40（淡色底，允许略高）`);
  }
}

/* ============================================================
   3. 对比度
   ============================================================ */
console.log('\n═══ 3. WCAG 对比度 ═══');
for (const [tag, table] of [
  ['浅色', light],
  ['深色', dark],
]) {
  const bg = parseColor(resolve('--background', table)).rgb;
  const surf = comp(parseColor(resolve('--card', table)), bg);
  const heroRgb = gradientEnds(resolve('--hero-bg', table)).map((c) => comp(c, bg));
  const pill = heroRgb.map((h) => comp(parseColor(resolve('--hero-pill', table)), h));
  const dayRgb = gradientEnds(resolve('--day-full-bg', table)).map((c) => comp(c, bg));

  console.log(`\n[${tag}]`);
  pair(tag, '正文 / 卡片', resolve('--foreground', table), [surf], 4.5);
  pair(tag, '次要文字 / 卡片', resolve('--muted-foreground', table), [surf], 4.5);
  pair(tag, '弱化文字 / 卡片', resolve('--subtle-foreground', table), [surf], 3);
  pair(tag, '次要文字 / 页面底', resolve('--muted-foreground', table), [bg], 4.5);
  pair(tag, '主数字 / 主数字卡', resolve('--hero-fg', table), heroRgb, 4.5);
  pair(tag, '累计文字 / 药丸', resolve('--hero-fg', table), pill, 4.5);
  pair(tag, '涨幅 / 药丸', resolve('--hero-up', table), pill, 4.5);
  pair(tag, '跌幅 / 药丸', resolve('--hero-down', table), pill, 4.5);
  pair(tag, '达标格文字 / 格底', resolve('--day-full-fg', table), dayRgb, 4.5);
  pair(tag, 'on-primary / primary', resolve('--primary-foreground', table), [parseColor(resolve('--primary', table)).rgb], 4.5);
  pair(tag, '工资数字 / 卡片', resolve('--chart-1', table), [surf], 4.5);
  pair(tag, '加班 / 卡片', resolve('--chart-2', table), [surf], 3);
  pair(tag, '扣款 / 卡片', resolve('--chart-3', table), [surf], 4.5);
  pair(tag, '节日 / 卡片', resolve('--chart-5', table), [surf], 4.5);
  pair(tag, 'on-destructive / destructive', resolve('--destructive-foreground', table), [parseColor(resolve('--destructive', table)).rgb], 4.5);
}

/* ============================================================
   4. 首帧底色四处一致
   ============================================================ */
console.log('\n═══ 4. 首帧背景色一致性 ═══');
{
  const norm = (s) => s.trim().toUpperCase();
  const lightBg = norm(resolve('--background', light));
  const darkBg = norm(resolve('--background', dark));
  const html = readFileSync(join(root, 'index.html'), 'utf-8');
  const store = readFileSync(join(root, 'src/lib/store.tsx'), 'utf-8');

  console.log(`  tokens.css --background  浅色 ${lightBg} / 深色 ${darkBg}`);
  check('index.html 含深色 bg', html.toUpperCase().includes(`'${darkBg}'`), true);
  check('index.html 含浅色 bg', html.toUpperCase().includes(`'${lightBg}'`), true);
  check('store.tsx 含深色 bg', store.toUpperCase().includes(`'${darkBg}'`), true);
  check('store.tsx 含浅色 bg', store.toUpperCase().includes(`'${lightBg}'`), true);

  for (const stale of ['#101012', '#0F0F11', '#4F8DFF', '#D9A441']) {
    check(`index.html 不残留旧色 ${stale}`, html.toUpperCase().includes(stale), false);
  }
  for (const stale of ['#101012', '#0F0F11']) {
    check(`store.tsx 不残留旧色 ${stale}`, store.toUpperCase().includes(stale), false);
  }
}

/* ============================================================
   5. Android 资源与本文件一致
   ============================================================ */
console.log('\n═══ 5. Android 窗口底色一致 ═══');
{
  const norm = (s) => s.trim().toUpperCase();
  const lightBg = norm(resolve('--background', light));
  const darkBg = norm(resolve('--background', dark));
  const readXml = (p) => {
    try {
      return readFileSync(join(root, p), 'utf-8').toUpperCase();
    } catch {
      return '';
    }
  };
  check('values/colors.xml 含浅色 bg', readXml('assets/android/values/colors.xml').includes(lightBg), true);
  check('values-night/colors.xml 含深色 bg', readXml('assets/android/values-night/colors.xml').includes(darkBg), true);
}

console.log('\n' + '─'.repeat(72));
if (fails.length === 0) {
  console.log(`✅ 主题配色自检全部通过：${pass} 项`);
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  for (const f of fails) console.log(`   · ${f}`);
  process.exit(1);
}
