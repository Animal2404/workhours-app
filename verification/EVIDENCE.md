# 验证证据 · 工时记

本目录存放可复核的验证证据（截图、自检输出、云端构建记录）。

---

## 1. 云端构建证据（GitHub Actions）

- 仓库：https://github.com/Animal2404/workhours-app
- 最新提交：`61737e0`（本地 HEAD 与远端 main 为同一个 SHA）
- 运行链接：https://github.com/Animal2404/workhours-app/actions/runs/36099697250
- 结果：**success**
- 产物：`工时记-APK`，**6.32 MB**
- 下载页：https://github.com/Animal2404/workhours-app/actions/runs/36099697250

### 构建步骤（全部通过）

```
✓ 安装依赖 (npm ci)
✓ 工资引擎自检
✓ 类型检查 (tsc --noEmit)
✓ 构建前端（Vite）
✓ 添加 Android 平台 (cap add android)
✓ 装入图标与启动画面
✓ 同步 Web 资源到 Android 工程 (cap sync)
✓ 准备固定签名密钥
✓ 注入签名配置
✓ 构建 Debug APK
✓ 构建 Release APK
✓ 校验 APK 签名一致（升级安装的前提）
✓ 上传 APK（构建产物）
```

> 说明：GitHub 托管 runner 自带 Android SDK，构建不需要本地安装任何 Android 工具。
> 早期两次失败已修复并记录在提交历史里（`82bb6a5`、`ecf713d`）。

---

## 2. 本地自检

| 检查 | 命令 | 结果 |
|---|---|---|
| 工资引擎 | `npm run check` | ✅ **53 项断言全部通过** |
| 类型检查 | `npm run typecheck` | ✅ 退出码 0 |
| 生产构建 | `npm run build` | ✅ dist/ 产出成功 |
| 视觉核对 | `node scripts/visual-check.mjs` | ✅ 数值一致、无 console 报错 |
| 交互/无障碍 | `node scripts/interact-check.mjs` | ✅ 全部通过 |

### 核心数值（用户给的例子）

```
上 10 小时 × 时薪 20 元 = 200 元   ✅
```

### 关键不变量

工资明细**按天四舍五入到分再累加**，所以「每天的金额相加」恒等于「月度合计」：

```
逐天相加 = 1520    页面显示 = 1520    ✅ 一致
```

这避免了「明细之和 ≠ 合计」这种最伤信任的显示问题。

---

## 3. 截图

| 文件 | 说明 |
|---|---|
| `page-light.png` | 浅色模式 · 日历主页 |
| `page-dark.png` | 深色模式 · 日历主页（用户反馈后重做的配色） |
| `sheet-dark.png` | 深色模式 · 记录抽屉 |
| `stats-dark.png` | 深色模式 · 统计页 |
| `settings-dark.png` | 深色模式 · 设置页 |
| `splash.png` | Android 启动画面 |

### 深色模式配色说明（针对用户反馈）

用户反馈「深色模式别用蓝紫配色，大面积会让人眼不舒服」。改动：

| 项目 | 改前 | 改后 |
|---|---|---|
| 主色 | 蓝紫 `#8b7cff` | 暖金 `#d9a441`（蓝光成分低） |
| 背景 | 带蓝紫偏移 `#0d0d11` | 中性石墨 `#101012` |
| 英雄卡 | 大面积饱和蓝紫渐变 | 中性深面 + 极淡暖调（`rgb(39,33,25)`） |
| 日历达标日 | 亮紫蓝填充 | 暗一档暖金，小面积着色 |
| 顶部氛围光 | 双层彩色辉光 | 几乎不可见的中性微光 |
| 语义色 | 高饱和 | 整体降饱和 |

计算样式实测（`getComputedStyle`）：

```
--hero-bg  → linear-gradient(150deg, rgb(39,33,25), rgb(29,28,30), rgb(25,26,29))
--bg       → rgb(16,16,18)
tab-pill   → linear-gradient(135deg, rgb(217,164,65), rgb(194,134,47))
```

---

## 4. 修掉的主要缺陷（都是实测发现的，不是猜的）

| 缺陷 | 发现方式 | 根因 | 修法 |
|---|---|---|---|
| 抽屉顶部被裁掉（top=-39px） | 无头浏览器量 DOM 几何 | `.page-enter` 的动画残留 `transform`，成为 `position:fixed` 的包含块 | 抽屉改用 portal 挂到 body；动画去掉 `fill-mode: both` |
| 抽屉拖不动 | 交互测试（拖动 150px 位移 0） | 把手只有 21px 高，指针一移动就离开元素，`pointermove` 全丢 | 在 `pointerdown` 当场 `setPointerCapture` |
| 慢拖也被判成「甩动关闭」 | 交互测试 | 用滚动惯性减速率 0.998 做动量投影 ≈ 0.5×速度，阈值失真 | 改成与抽屉高度挂钩的速度阈值 |
| 工资四舍五入正负不一致 | 工资引擎断言 | `+Number.EPSILON` 让 −0.005 与 +0.005 都朝 +∞ 进位 | 按绝对值舍入再补符号 |
| 日历选中日看不见数字 | 截图核对 | 选中态与达标态同权重，紫字压紫底 | `:not(.is-full)` 让「有工时」底色优先 |
| 图标资产没进仓库 | CI 报错 + `git ls-files` 为 0 | `.gitignore` 的 `android/` 匹配了任意层级，误伤 `assets/android/` | 改为 `/android/` 锚定仓库根 |
| CI 在 SDK 步骤失败 | GitHub annotations | `setup-android@v3` 依赖已弃用的 Node 20；runner 本就自带 SDK | 删除该步骤 |
| 升级安装会清空数据 | 代码审查 | 每次构建生成随机签名，签名不一致会被拒绝覆盖安装 | 提交固定签名，debug/release 都用它 |
