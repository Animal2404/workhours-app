/* ============================================================
   独立验证 · 第 1 步：从「原始权威来源」抽出官方原文
   ------------------------------------------------------------
   本脚本刻意不复用仓库里任何既有脚本，也不读 src/lib/holidays.ts。
   它只做一件事：把官方页面的正文抽出来，让我自己肉眼看原文，
   再手抄成期望值喂给 verify-holidays.mjs。这样才能真正独立核对。

   来源（自行抓取，存 verification/raw/）：
     · 国办发明电〔2025〕7号  → 2026 年放假安排
     · 国办发明电〔2024〕12号 → 2025 年放假安排
     · 国办发明电〔2023〕7号  → 2024 年放假安排
     · 香港天文台《公曆與農曆日期對照表》T2026c / T2025c

   运行：node scripts/verify-sources.mjs
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rawDir = join(root, 'verification', 'raw');

/* ---------------- HTML → 纯文本 ---------------- */
function htmlToText(buf) {
  let s = buf.toString('utf8');
  // 编码兜底：gov.cn 老页面偶有 GBK
  if (/charset=["']?gb2312|charset=["']?gbk/i.test(s.slice(0, 2000))) {
    s = new TextDecoder('gbk').decode(buf);
  }
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  const ent = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&ldquo;': '“', '&rdquo;': '”',
    '&mdash;': '—', '&hellip;': '…',
  };
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => ent[m.toLowerCase()] ?? m);
  s = s.replace(/[ \t\u3000]+/g, ' ');
  s = s.replace(/\n\s*\n+/g, '\n');
  return s.trim();
}

/* ---------------- 抽「放假安排」正文 ---------------- */
function extractArrangement(text) {
  // 官方通知的正文段落以「经国务院批准，现将…放假调休日期的具体安排通知如下」起
  const startRe = /(?:经国务院批准|现将)[^\n]{0,80}(?:放假|节假日)[^\n]{0,80}通知如下/;
  const m = startRe.exec(text);
  const body = m ? text.slice(m.index) : text;
  // 收尾：常见结尾
  const endRe = /(节假日期间|各地区、各部门要|不能停止生产|请及时报告)[^\n]{0,40}/;
  const e = endRe.exec(body);
  let seg = e ? body.slice(0, e.index + e[0].length) : body.slice(0, 2600);
  return seg.trim();
}

/* ---------------- 主流程 ---------------- */
const files = readdirSync(rawDir).sort();
console.log('='.repeat(74));
console.log('原始来源清单（含 sha256，证明我抓到的就是这一份）');
console.log('='.repeat(74));
for (const f of files) {
  const buf = readFileSync(join(rawDir, f));
  const h = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  console.log(`  ${f.padEnd(22)} ${String(buf.length).padStart(7)} bytes  sha256:${h}`);
}

/* ---- 1. 国务院通知原文（逐年） ---- */
for (const [file, year, docNo] of [
  ['gov-2026.htm', 2026, '国办发明电〔2025〕7号'],
  ['gov-2025.htm', 2025, '国办发明电〔2024〕12号'],
  ['gov-2024.htm', 2024, '国办发明电〔2023〕7号'],
]) {
  console.log('\n' + '='.repeat(74));
  console.log(`${year} 年 — ${docNo}  —  ${file}`);
  console.log('='.repeat(74));
  let text;
  try {
    text = htmlToText(readFileSync(join(rawDir, file)));
  } catch (e) {
    console.log(`  !! 读不到: ${e.message}`);
    continue;
  }
  const title = (text.match(/国务院办公厅关于[^\n]{0,60}节假日安排的通知/) || [])[0];
  console.log(`标题：${title ?? '(未匹配到标题)'}`);
  console.log('-'.repeat(74));
  console.log(extractArrangement(text));
}

/* ---- 2. 香港天文台农历对照表 ---- */
console.log('\n' + '='.repeat(74));
console.log('香港天文台《公曆與農曆日期對照表》— 查「八月十五」落哪一天');
console.log('='.repeat(74));
for (const [file, year] of [['hko-T2026c.txt', 2026], ['hko-T2025c.txt', 2025]]) {
  let txt;
  try {
    txt = new TextDecoder('utf8').decode(readFileSync(join(rawDir, file)));
  } catch (e) {
    console.log(`  !! 读不到 ${file}: ${e.message}`);
    continue;
  }
  console.log(`\n----- ${file} (${year}) -----`);
  const lines = txt.split(/\r?\n/);
  console.log(`总行数 ${lines.length}；表头样例：`);
  console.log('  ' + lines.slice(0, 3).join(' | '));

  // 该年所有含「八月十五」的行
  const hits = [];
  lines.forEach((ln, i) => {
    if (ln.includes('八月十五')) hits.push([i + 1, ln]);
  });
  if (hits.length === 0) {
    console.log('  !! 未找到「八月十五」——换用「中秋」再搜');
    lines.forEach((ln, i) => {
      if (ln.includes('中秋')) hits.push([i + 1, ln]);
    });
  }
  console.log(`含「八月十五」的行共 ${hits.length} 处：`);
  for (const [no, ln] of hits) console.log(`  L${no}: ${ln.trim()}`);

  /* --- 由「八月初一」+14 天独立推导八月十五（中秋） ---
     HKO 表只在初一那行写月份名，其余写「初二…三十」。
     所以正确做法是定位农曆月名字段 == '八月' 的那一天（= 八月初一），再 +14 天。
     闰八月会写成「閏八月」，要排除。 */
  const monthStarts = [];
  for (const ln of lines) {
    const m = /^\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s+(星期[一二三四五六日])\s*/.exec(ln);
    if (!m) continue;
    if (m[4] === '八月') monthStarts.push({ key: `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`, wd: m[5] });
  }
  console.log(`  農曆「八月」初一落在：${monthStarts.map((x) => `${x.key}(${x.wd})`).join(', ') || '(无)'}`);
  for (const ms of monthStarts) {
    const [y, mo, d] = ms.key.split('-').map(Number);
    const t = Date.UTC(y, mo - 1, d) + 14 * 86400000;
    const dd = new Date(t);
    const key = `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, '0')}-${String(dd.getUTCDate()).padStart(2, '0')}`;
    const WD = ['日', '一', '二', '三', '四', '五', '六'];
    console.log(`  ⇒ 八月初一 ${ms.key} + 14 天 = 八月十五 = ${key}（星期${WD[dd.getUTCDay()]}）`);
  }

  // 打印 9 月整块，便于人工核对 9/25 那一天
  const sepIdx = lines.findIndex((l) => new RegExp(`^\\s*${year}年9月`).test(l));
  if (sepIdx >= 0) {
    console.log(`\n  ${year} 年 9 月原始历表（L${sepIdx + 1} 起）：`);
    for (let i = sepIdx; i < Math.min(sepIdx + 16, lines.length); i++) {
      if (lines[i].trim() === '' && i > sepIdx + 2) break;
      console.log('    ' + lines[i]);
    }
  } else {
    console.log(`  !! 未定位到「${year}年9月」标题行`);
  }
}
console.log('\n完成。期望值由我据此手抄进 verify-holidays.mjs。\n');
