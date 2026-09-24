/* ============================================================
   把预生成的启动图标 / 启动画面装进 Android 工程
   ------------------------------------------------------------
   为什么需要这一步：
   项目 .gitignore 忽略了 android/（由 CI 用 cap add android 现场生成），
   所以图标不能靠改 android/ 目录来交付，必须把图标源文件提交进仓库，
   构建时再拷进刚生成的工程里。

   源文件：assets/android/  （由 npm run icons 生成并已提交）
   目标：  android/app/src/main/res/
   ============================================================ */

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'assets', 'android');
const res = join(root, 'android', 'app', 'src', 'main', 'res');

if (!existsSync(src)) {
  console.error(`✗ 找不到图标源目录：${src}`);
  console.error('  先运行：npm run icons:generate');
  process.exit(1);
}

if (!existsSync(res)) {
  console.error(`✗ 找不到 Android 资源目录：${res}`);
  console.error('  先运行：npx cap add android');
  process.exit(1);
}

await mkdir(res, { recursive: true });

let dirs = 0;
let files = 0;

for (const entry of await readdir(src, { withFileTypes: true })) {
  const from = join(src, entry.name);
  const to = join(res, entry.name);

  if (entry.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const f of await readdir(from)) {
      await cp(join(from, f), join(to, f), { force: true });
      files++;
    }
    dirs++;
    console.log(`  ✓ ${entry.name}/  (${(await readdir(from)).length} 个文件)`);
  } else {
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { force: true });
    files++;
    console.log(`  ✓ ${entry.name}`);
  }
}

console.log(`\n✅ 已装入 ${dirs} 个目录 / ${files} 个文件 → ${res}`);
