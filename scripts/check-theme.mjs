/* ============================================================
   深色 / 浅色主题配色自检
   ------------------------------------------------------------
   两件事：
   1. WCAG 对比度：直接**解析 src/styles/tokens.css**，
      半透明层按 alpha 合成到底色后再算比值 —— 拿 token 原值直接算会偏乐观。
      解析真实文件而不是抄一份常量，这样改了 token 这个门就会跟着动。
   2. 色相纪律：深色下统计「参与大面积着色的色相个数」，
      超过阈值就报警 —— 一张屏上五颜六色就是这么来的。

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
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const light = vars(blockOf("[data-theme='light']"));
const dark = vars(blockOf("[data-theme='dark']"));

/* ---------------- 颜色工具 ---------------- */
function parseColor(v) {
  const s = String(v).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: 1 };
  }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    return { rgb: m[1].split('').map((c) => parseInt(c + c, 16)), a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  }
  throw new Error(`无法解析颜色: ${s}`);
}

/** 取渐变两端的颜色（深色下这些渐变都是两段，取端点即可覆盖最坏情况） */
function gradientEnds(v) {
  const colors = [...String(v).matchAll(/#[0-9a-f]{6}|rgba?\([^)]*\)/gi)]
    .map((m) => m[0])
    .filter(Boolean);
  if (!colors.length) throw new Error(`无法解析渐变: ${v}`);
  return [parseColor(colors[0]), parseColor(colors[colors.length - 1])];
}

/** 把 fg（可含 alpha）合成到不透明底色 bgRgb（原始数组）上 */
const comp = (fg, bgRgb) => fg.rgb.map((c, i) => c * fg.a + bgRgb[i] * (1 - fg.a));

/** 渐变两端的颜色，各自合成到底色上 → 得到不透明 rgb 数组 */
const stopsOf = (v, baseRgb) =>
  gradientEnds(v).map((c) => comp(c, baseRgb));

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

/**
 * 检查一组「文字色 × 若干候选底色」的对比度，取最坏的一个。
 * 半透明文字会先按 alpha 合成再算 —— 直接用 token 原值算会偏乐观。
 */
function pair(tag, label, fgVar, bgRgbs, need) {
  const fg = parseColor(fgVar);
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
    `  ${ok ? '✓' : '✗'} [${tag}] ${label.padEnd(28)} ${r2(worst).toFixed(2)}:1 (需 ${need})  ${rgbStr(comp(fg, worstBg))} on ${rgbStr(worstBg)}`,
  );
}

console.log('\n═══ 深色主题对比度（解析 tokens.css 实测）═══');
{
  const bg = parseColor(dark['--bg']).rgb;
  const surface = parseColor(dark['--surface']);
  const surfRgb = comp(surface, bg);

  console.log('\n[1] 正文层级');
  pair('深色', '正文 / 卡片', dark['--text'], [surfRgb], 4.5);
  pair('深色', '次要文字 / 卡片', dark['--text-2'], [surfRgb], 4.5);
  pair('深色', '弱化文字 / 卡片', dark['--text-3'], [surfRgb], 3);

  console.log('\n[2] 英雄卡（渐变两端都要达标）');
  const heroRgb = stopsOf(dark['--hero-bg'], bg);
  pair('深色', '主数字 / 卡底', dark['--hero-fg'], heroRgb, 4.5);
  const pillStops = heroRgb.map((h) => comp(parseColor(dark['--hero-pill']), h));
  pair('深色', '累计文字 / 药丸', dark['--hero-fg'], pillStops, 4.5);
  pair('深色', '涨幅 / 药丸', dark['--hero-up'], pillStops, 4.5);
  pair('深色', '跌幅 / 药丸', dark['--hero-down'], pillStops, 4.5);

  console.log('\n[3] 日历达标格子（渐变两端）');
  const dayRgb = stopsOf(dark['--day-full-bg'], bg);
  pair('深色', '日号货币 / 格底', dark['--day-full-fg'], dayRgb, 4.5);

  console.log('\n[4] 语义色');
  pair('深色', '节日名 / 卡片', dark['--holiday'], [surfRgb], 4.5);
  pair('深色', '工资金额 / 卡片', dark['--money'], [surfRgb], 4.5);
  pair('深色', '扣款 / 卡片', dark['--danger'], [surfRgb], 4.5);
  pair('深色', '加班 / 卡片', dark['--warn'], [surfRgb], 3);

  console.log('\n[5] 主色上的文字（选中态）');
  pair('深色', 'on-brand / brand', dark['--on-brand'], [parseColor(dark['--brand']).rgb], 4.5);
}

console.log('\n═══ 浅色主题对比度 ═══');
{
  const bg = parseColor(light['--bg']).rgb;
  const surface = parseColor(light['--surface']);
  const surfRgb = comp(surface, bg);
  const heroRgb = stopsOf(light['--hero-bg'], bg);
  pair('浅色', '正文 / 卡片', light['--text'], [surfRgb], 4.5);
  pair('浅色', '次要文字 / 卡片', light['--text-2'], [surfRgb], 4.5);
  pair('浅色', '主数字 / 卡底', light['--hero-fg'], heroRgb, 4.5);
  const pillStops = heroRgb.map((h) => comp(parseColor(light['--hero-pill']), h));
  pair('浅色', '累计文字 / 药丸', light['--hero-fg'], pillStops, 4.5);
  pair('浅色', '涨幅 / 药丸', light['--hero-up'], pillStops, 4.5);
  pair('浅色', '节日名 / 卡片', light['--holiday'], [surfRgb], 4.5);
  pair('浅色', '工资金额 / 卡片', light['--money'], [surfRgb], 4.5);
  pair('浅色', 'on-brand / brand', light['--on-brand'], [parseColor(light['--brand']).rgb], 4.5);
}

/* ---------------- 首帧背景色：四处必须一致 ---------------- */
console.log('\n═══ 首帧背景色一致性 ═══');
{
  // 同一件事写在四个地方：
  //   tokens.css(--bg) / index.html(内联首帧脚本 + theme-color meta)
  //   store.tsx(换主题时更新行内样式) / Android values(-night)/colors.xml
  // 改一处漏一处就会出现「启动闪一下别的颜色」或状态栏色不对。
  // （真的踩过：改 tokens.css 忘了 index.html/store.tsx）
  const norm = (s) => s.trim().toUpperCase();
  const lightBg = norm(light['--bg']);
  const darkBg = norm(dark['--bg']);

  const html = readFileSync(join(root, 'index.html'), 'utf-8');
  const store = readFileSync(join(root, 'src/lib/store.tsx'), 'utf-8');

  const htmlLight = [...html.matchAll(/'(#[0-9a-fA-F]{6})'\s*:\s*'#[0-9a-fA-F]{6}'/g)];
  const hasHtmlDark = html.toUpperCase().includes(`'${darkBg}'`);
  const hasHtmlLight = html.toUpperCase().includes(`'${lightBg}'`);
  const hasStoreDark = store.toUpperCase().includes(`'${darkBg}'`);
  const hasStoreLight = store.toUpperCase().includes(`'${lightBg}'`);

  console.log(`  tokens.css  --bg   浅色 ${lightBg} / 深色 ${darkBg}`);
  check('index.html 首帧脚本含深色 bg', hasHtmlDark, true);
  check('index.html 首帧脚本含浅色 bg', hasHtmlLight, true);
  check('store.tsx 换主题时含深色 bg', hasStoreDark, true);
  check('store.tsx 换主题时含浅色 bg', hasStoreLight, true);

  // 旧值不该还残留在任何地方（防「改了一半」）
  for (const stale of ['#101012', '#4F8DFF']) {
    const inHtml = html.toUpperCase().includes(stale);
    const inStore = store.toUpperCase().includes(stale);
    check(`index.html 不残留旧色 ${stale}`, inHtml, false);
    check(`store.tsx 不残留旧色 ${stale}`, inStore, false);
  }
  void htmlLight;
}

/* ---------------- 色相纪律 ---------------- */
console.log('\n═══ 色相纪律（深色）═══');
{
  // 参与「大面积着色」的角色：卡底/格子底/主色/节日/money
  /** 传 rgb 数组，返回色相角度；近灰的返回 'neutral' */
  const hueOfRgb = ([r, g, b]) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 0.06) return 'neutral'; // 近灰 → 不算一个色相
    const d = mx - mn;
    let h = 0;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return Math.round(((h * 60) + 360) % 360);
  };

  const big = {
    英雄卡底: dark['--hero-bg'],
    达标格子: dark['--day-full-bg'],
    主色: dark['--brand'],
    节日名: dark['--holiday'],
    工资金额: dark['--money'],
  };
  const hues = [];
  for (const [k, v] of Object.entries(big)) {
    // 渐变取两端，纯色取本身；统一合成到最底层背景上再判色相
    const rgbs = /gradient/.test(v)
      ? stopsOf(v, parseColor(dark['--bg']).rgb)
      : [comp(parseColor(v), parseColor(dark['--bg']).rgb)];
    const hs = rgbs.map(hueOfRgb);
    console.log(`  ${k.padEnd(10)} 色相 ${hs.map((h) => (h === 'neutral' ? '中性' : h + '°')).join(' / ')}`);
    for (const h of hs) if (h !== 'neutral') hues.push(h);
  }

  // 归到 60° 一档，数「彼此相隔超过 60° 的色相簇」
  const clusters = [];
  for (const h of hues) {
    if (!clusters.some((c) => Math.min(Math.abs(c - h), 360 - Math.abs(c - h)) <= 60)) clusters.push(h);
  }
  console.log(`  → 相隔 >60° 的色相簇数量：${clusters.length}（目标 ≤ 3）`);
  check('深色大面积色相簇 ≤ 3', clusters.length <= 3, true);

  // money 必须还在暖金之外单独可辨（它是「钱」的语义色，不能和主色撞）
  const brandH = hueOfRgb(comp(parseColor(dark['--brand']), parseColor(dark['--bg']).rgb));
  const moneyH = hueOfRgb(comp(parseColor(dark['--money']), parseColor(dark['--bg']).rgb));
  const gap = Math.min(Math.abs(brandH - moneyH), 360 - Math.abs(brandH - moneyH));
  console.log(`  主色 ${brandH}° vs 工资绿 ${moneyH}°  相隔 ${gap}°`);
  check('工资金额与主色可区分（相隔 > 60°）', gap > 60, true);
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
