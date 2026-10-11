/* ============================================================
   inject-signing.py 的离线自检
   ------------------------------------------------------------
   为什么需要：CI 里这个脚本跑挂了 = 整条 APK 流水线断掉。
   本脚本用一份**仿真的 Capacitor 生成的 build.gradle** 在临时目录里
   跑一遍真脚本，核对：
     1. 签名配置注入成功且幂等
     2. 版本号从 package.json 注入正确
     3. versionCode 单调递增（升级安装的前提）
     4. 大括号配平 / 引号完整
     5. 重复执行不产生重复块
   跑：node scripts/check-inject-signing.mjs
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SCRIPT = join(root, 'scripts', 'inject-signing.py');

/** 找可用的 python 解释器。
 *  ubuntu 上通常只有 python3，Windows 上通常只有 python —— 两个都试。 */
function findPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' });
      return cmd;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}
const PY = findPython();

if (!PY) {
  // CI 里没 python 说明环境不对，必须红；本地没装才允许跳过
  if (process.env.CI) {
    console.log('❌ CI 环境里找不到 python3，签名注入无法执行');
    process.exit(1);
  }
  console.log('⚠ 本地找不到 python / python3，跳过自检');
  process.exit(0);
}

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

/** Capacitor 7 `npx cap add android` 生成出来的 build.gradle 骨架（节选但结构一致） */
const FIXTURE = `apply plugin: 'com.android.application'

android {
    namespace "com.workhours.app"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.workhours.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             ignoreAssetsPattern '!.svn:!.git:!.ds_store'
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
}
`;

function runIn(dir) {
  return execFileSync(PY, [SCRIPT], { cwd: dir, encoding: 'utf-8', stdio: 'pipe' });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'inject-'));
  mkdirSync(join(dir, 'android', 'app'), { recursive: true });
  writeFileSync(join(dir, 'android', 'app', 'build.gradle'), FIXTURE, 'utf-8');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'x', version: '1.1.0' }),
    'utf-8',
  );
  return dir;
}

console.log('\n[1] 首次注入');
{
  const dir = setup();
  const out = runIn(dir);
  const g = readFileSync(join(dir, 'android', 'app', 'build.gradle'), 'utf-8');

  check('signingConfigs.ci 已插入', g.includes('signingConfigs'), true);
  check('ci 签名块存在', /ci \{[\s\S]*storeFile file\("release\.keystore"\)/.test(g), true);
  check('release 使用 ci 签名', /release \{[\s\S]{0,80}signingConfig signingConfigs\.ci/.test(g), true);
  check('debug 使用 ci 签名', /debug \{[\s\S]{0,60}signingConfig signingConfigs\.ci/.test(g), true);
  check('versionCode → 10100', /versionCode 10100/.test(g), true);
  check('versionName → "1.1.0"', /versionName "1\.1\.0"/.test(g), true);
  check('applicationId 未被破坏', g.includes('applicationId "com.workhours.app"'), true);
  check('原 release 块内容保留（proguardFiles）', g.includes('proguardFiles'), true);
  check('大括号配平', (g.match(/\{/g) ?? []).length, (g.match(/\}/g) ?? []).length);
  check('脚本自检输出含版本号', /versionName=1\.1\.0/.test(out), true);

  console.log('\n[2] 幂等：再跑一次');
  const out2 = runIn(dir);
  const g2 = readFileSync(join(dir, 'android', 'app', 'build.gradle'), 'utf-8');
  check('signingConfigs 只出现一次', (g2.match(/signingConfigs \{/g) ?? []).length, 1);
  check('debug 块只出现一次', (g2.match(/^\s*debug \{/gm) ?? []).length, 1);
  check('内容未变化', g2, g);
  check('第二次跳过插入', /已存在，跳过插入/.test(out2), true);

  rmSync(dir, { recursive: true, force: true });
}

console.log('\n[3] versionCode 单调递增');
{
  const code = (v) => {
    const dir = setup();
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, version: v }), 'utf-8');
    runIn(dir);
    const g = readFileSync(join(dir, 'android', 'app', 'build.gradle'), 'utf-8');
    const m = /versionCode (\d+)/.exec(g);
    rmSync(dir, { recursive: true, force: true });
    return Number(m[1]);
  };
  const v100 = code('1.0.0');
  const v101 = code('1.0.1');
  const v110 = code('1.1.0');
  const v200 = code('2.0.0');
  console.log(`     1.0.0→${v100}  1.0.1→${v101}  1.1.0→${v110}  2.0.0→${v200}`);
  check('严格递增', v100 < v101 && v101 < v110 && v110 < v200, true);
  check('1.1.0 → 10100', v110, 10100);
  check('2.0.0 → 20000', v200, 20000);
}

console.log('\n[4] 异常输入不静默写坏文件');
{
  // 没有 android/app/build.gradle → 必须非零退出
  const dir = mkdtempSync(join(tmpdir(), 'inject-bad-'));
  let code = 0;
  try {
    runIn(dir);
  } catch (e) {
    code = e.status ?? 1;
  }
  check('缺 build.gradle 时非零退出', code !== 0, true);
  rmSync(dir, { recursive: true, force: true });

  // 版本号写坏（非 semver）→ 回退成 1，但不该抛异常
  const dir2 = setup();
  const pkg = JSON.parse(readFileSync(join(dir2, 'package.json'), 'utf-8'));
  writeFileSync(join(dir2, 'package.json'), JSON.stringify({ ...pkg, version: 'abc' }), 'utf-8');
  let code2 = 0;
  let g2 = '';
  try {
    runIn(dir2);
    g2 = readFileSync(join(dir2, 'android', 'app', 'build.gradle'), 'utf-8');
  } catch (e) {
    code2 = e.status ?? 1;
  }
  check('非 semver 版本不导致失败', code2, 0);
  check('非 semver 时 versionCode 回退为 1', /versionCode 1\b/.test(g2), true);
  rmSync(dir2, { recursive: true, force: true });
}

console.log('\n' + '─'.repeat(60));
if (fails.length === 0) {
  console.log(`✅ inject-signing 自检全部通过：${pass} 项断言`);
  process.exit(0);
} else {
  console.log(`❌ ${fails.length} 项失败 / 共 ${pass + fails.length} 项`);
  process.exit(1);
}
