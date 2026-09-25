#!/usr/bin/env python3
"""
给 Capacitor 生成的 android/app/build.gradle 注入固定签名配置。

为什么不用 sed：
签名块里含有引号、`?:`、括号和斜杠，在 shell 里逐层转义非常容易出错，
而 Groovy 少一个引号就是语法错误、整个构建失败。用 Python 写文件最稳。

注入内容：
  1. android { } 里加 signingConfigs.ci
  2. buildTypes.release 用 ci 签名
  3. buildTypes.debug   也用 ci 签名
     —— debug 包是用户主要安装的那个，签名必须固定，
        否则新包与已装旧包签名不一致，Android 会要求卸载重装并清空数据。

幂等：重复执行不会重复插入。
"""

import re
import sys
from pathlib import Path

PATH = Path("android/app/build.gradle")

if not PATH.exists():
    print(f"✗ 找不到 {PATH}，先执行 npx cap add android", file=sys.stderr)
    sys.exit(1)

src = PATH.read_text(encoding="utf-8")

SIGNING_BLOCK = """android {
    signingConfigs {
        ci {
            storeFile file("release.keystore")
            storePassword System.getenv("CI_STORE_PASSWORD") ?: "workhours"
            keyAlias System.getenv("CI_KEY_ALIAS") ?: "workhours"
            keyPassword System.getenv("CI_KEY_PASSWORD") ?: "workhours"
        }
    }"""

if "signingConfigs" in src:
    print("· signingConfigs 已存在，跳过插入")
else:
    if not re.search(r"^android \{", src, re.M):
        print("✗ 没找到 `android {` 块", file=sys.stderr)
        sys.exit(1)
    src = re.sub(r"^android \{", SIGNING_BLOCK, src, count=1, flags=re.M)
    print("✓ 已插入 signingConfigs.ci")

# release 用固定签名
if re.search(r"release \{[^}]*signingConfig", src):
    print("· release 已有签名配置，跳过")
else:
    src, n = re.subn(
        r"(\n        release \{)",
        r"\1\n            signingConfig signingConfigs.ci",
        src,
        count=1,
    )
    print("✓ 已为 release 指定固定签名" if n else "✗ 未找到 release 块")

# debug 也用固定签名（保证覆盖安装不丢数据）
if re.search(r"debug \{[^}]*signingConfig", src):
    print("· debug 已有签名配置，跳过")
else:
    if re.search(r"^    buildTypes \{", src, re.M):
        src = re.sub(
            r"^(    buildTypes \{)",
            r"\1\n        debug {\n            signingConfig signingConfigs.ci\n        }",
            src,
            count=1,
            flags=re.M,
        )
        print("✓ 已为 debug 指定固定签名")

# 结构自检：大括号必须配平，否则 Gradle 直接语法报错
depth = 0
for ch in src:
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
    if depth < 0:
        print("✗ 大括号提前闭合", file=sys.stderr)
        sys.exit(1)

if depth != 0:
    print(f"✗ build.gradle 大括号不配平: {depth}", file=sys.stderr)
    sys.exit(1)

# 引号完整性自检：签名字段必须有引号
for field in ("storeFile", "storePassword", "keyAlias", "keyPassword"):
    if not re.search(rf'{field} .*"', src):
        print(f"✗ {field} 的值缺少引号 —— Groovy 会报语法错误", file=sys.stderr)
        sys.exit(1)

PATH.write_text(src, encoding="utf-8", newline="\n")

print("✓ 大括号配平、引号完整，结构校验通过")
print("--- 注入后的前 40 行 ---")
for i, line in enumerate(src.splitlines()[:40], 1):
    print(f"{i:3} {line}")
