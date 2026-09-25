# 工时记 · WorkHours

> 记录每天上了几小时班，自动算出这天赚了多少，日历上一眼看清整月。

一个圆角设计、离线可用、数据只存在你自己手机上的工时 & 工资记录 App。

---

## 功能

### 核心（你要的）
- **日历记账** — 月历视图，点任意一天就能记工；有记录的日子会亮起来，工时达标的日子填成品牌色
- **自动算工资** — 上 10 小时、时薪 20，这天就是 **¥200**。改任何数字，金额实时跟着变
- **每天独立可调** — 全局设一个默认时薪，某天单价不一样（比如周末双倍）可以单独覆盖

### 算钱规则（完整的工资引擎）
```
当天工资 = 正常工时 × 时薪  +  加班工时 × 时薪 × 加班倍率  +  补贴  −  扣款
```
- **加班倍率**：设 1.5 就是 1.5 倍工资
- **补贴 / 扣款**：餐补、交通补、请假扣款都能记
- **备注**：今天干了什么，随手写一句

### 自己加的
| 功能 | 说明 |
|---|---|
| **月度目标** | 设个工资目标，显示进度环、还差多少钱、剩下每天要赚多少 |
| **工资预测** | 根据已记录的工作日节奏，推算这月大概能拿多少 |
| **统计页** | 月度/年度切换、每天工时柱状图、等效时薪、加班占比、收入构成明细 |
| **每日工时目标** | 设 8 小时，日历上达标的日子用颜色标出来 |
| **班次模板** | 把常上的班（正常班 8h / 长班 10h / 加班 8+2h）存成模板，记录时一点就填好 |
| **连续记录天数** | 记录习惯的连击计数 |
| **导出备份** | JSON 完整备份（可再导入）、CSV 明细（Excel 直接打开，带 UTF-8 BOM 不乱码） |
| **深色模式** | 跟随系统 / 手动浅色 / 手动深色 |

数据全部存在设备本地（localStorage），**不联网、不上传、不需要登录**。

---

## 怎么拿到 APK（不用本地编译）

推送到 GitHub 后，**云端自动编译**，你只要下载安装包：

### 1. 新建仓库并推送

```bash
cd workhours-app
git init -b main
git add .
git commit -m "工时记 v1.0.0"
git remote add origin https://github.com/<你的用户名>/workhours-app.git
git push -u origin main
```

### 2. 等云端编译

推送后自动触发 `.github/workflows/android.yml`，大约 5–8 分钟。

打开仓库的 **Actions** 标签页 → 点最新的 `Build Android APK` → 等它变绿 ✅

> 构建用的是 GitHub 托管 runner **自带的 Android SDK**，不需要你安装任何东西。
> （也不要改成加 `android-actions/setup-android`：官方文档说明它是给自托管 runner 用的，
> 旧版本还依赖已弃用的 Node 20，会让构建在第一步就失败。）

### 3. 下载安装包

在构建页面底部 **Artifacts** 区域下载 `工时记-APK`（一个 zip），解压后有两个 apk：

| 文件 | 用途 |
|---|---|
| `工时记-debug.apk` | **直接装**，测试用，已自动签名 |
| `工时记-release.apk` | 正式包，体积更小 |

传到手机点击安装（需要允许「安装未知来源应用」）。

> **建议装 debug 那个**：debug 包用 Android 默认调试签名，安装最省事。

### 4. 想要正式签名？（可选）

默认会用一把临时生成的签名密钥。要换成你自己的正式签名，在仓库
**Settings → Secrets and variables → Actions** 添加：

| Secret | 说明 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 你的 keystore 转成 base64 后的内容 |
| `KEYSTORE_PASSWORD` | keystore 密码 |
| `KEY_ALIAS` | 密钥别名 |
| `KEY_PASSWORD` | 密钥密码 |

生成 keystore 并转 base64：

```bash
keytool -genkeypair -v -keystore release.keystore -alias workhours \
  -keyalg RSA -keysize 2048 -validity 10000

# Linux / macOS
base64 -w 0 release.keystore

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

**把 keytool 生成的 release.keystore 保管好** —— 以后更新 App 必须用同一把钥匙，丢了就只能卸载重装。

---

## 升级安装不会丢数据

仓库里的 `signing/workhours.keystore` 是**刻意提交的固定签名**。

原因：如果每次 CI 构建都现场生成一把随机钥匙，新 APK 的签名就和手机里已装的旧版
不一致，Android 会拒绝覆盖安装，逼你「卸载后重装」—— 而卸载会**清空本地工时数据**。
固定签名后，新包可以直接覆盖升级，记录都还在。

> ⚠️ 这把钥匙是**公开的**（在公开仓库里），所以只适合自己装/侧载。
> 如果你以后要上应用商店，请配置下面的 secrets 换成你自己的正式签名。

### 换用自己的正式签名

在仓库 **Settings → Secrets and variables → Actions** 添加
`ANDROID_KEYSTORE_BASE64`、`KEYSTORE_PASSWORD`、`KEY_ALIAS`、`KEY_PASSWORD`，
工作流会优先使用它们，忽略仓库内那把公开钥匙。

> **注意**：从「公开钥匙」切换到「你自己的钥匙」时，因为签名变了，
> 手机上的旧版需要卸载重装一次（请先在 App 里「导出备份」，装好后「导入备份」）。
> 之后再用同一把钥匙升级就不会再丢数据了。

---

## 本地开发（想看效果时用）

```bash
npm install
npm run dev        # 打开 http://127.0.0.1:5173
```

想在手机上实时预览：手机和电脑连同一个 Wi-Fi，`npm run dev -- --host` 后
用手机浏览器访问电脑 IP。

## 本地打包（可选，需要 Android Studio）

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android      # 在 Android Studio 里点 Run
```

---

## 技术栈

- **React 18 + TypeScript + Vite** — 快，类型安全
- **Capacitor 7** — 同一套代码打包成 Android App + 也能当 PWA 用
- **零 UI 框架依赖** — 样式是自己写的设计令牌系统（圆角尺度、浅深色、材质、动效曲线）

### 设计上的几个决定

| 决定 | 原因 |
|---|---|
| 全部走**圆角**（10 / 14 / 18 / 24 / 30 / 38 / full 七级尺度） | 统一的设计语言，不东一块西一块 |
| 动效用**自定义曲线**（`cubic-bezier(0.23,1,0.32,1)`） | CSS 内置曲线太弱，动起来不够干脆 |
| UI 动画**都控制在 300ms 以内** | 180ms 的下拉比 400ms 感觉更跟手 |
| 抽屉用**弹簧**而不是 CSS 过渡 | 弹簧能被打断：拉到一半反悔，从当前位置继续，不跳帧 |
| 松手时把**手指速度交接**给弹簧，并做**动量投影** | 轻轻一甩就能关掉，不用非得拖过某个距离 |
| 越界用**橡皮筋**阻尼 | 拖到头是「越拖越沉」，而不是撞墙 |
| 数字滚动**从当前显示值继续** | 金额快速变化时不会跳回起点重来 |
| 明细**按天四舍五入再累加** | 每天金额加起来正好等于月度合计，不会差一分钱 |
| 图标切换用 **morphicons 弹簧变形** | 比两个图标淡入淡出高级，且可打断 |
| 尊重 `prefers-reduced-motion` / `-transparency` / `-contrast` | 无障碍是基本功，不是加分项 |

---

## 项目结构

```
src/
├── main.tsx                 入口 + 页面外壳 + toast
├── lib/
│   ├── types.ts             数据模型
│   ├── pay.ts               ★ 工资引擎（所有算钱逻辑，有注释）
│   ├── date.ts              日期与金额格式化
│   ├── storage.ts           本地存储 / 导出 / 导入
│   ├── spring.ts            弹簧动画 + 动量投影 + 橡皮筋
│   └── store.tsx            全局状态
├── components/
│   ├── Icon.tsx             图标（lucide 数据 + morphicons 变形）
│   ├── BottomSheet.tsx      ★ 跟手可打断的底部抽屉
│   ├── EntrySheet.tsx       ★ 记工时抽屉（实时算钱）
│   ├── TabBar.tsx           底部导航（滑块 + 图标变形）
│   ├── magic.tsx            NumberTicker / MagicCard / ShineBorder / 进度环
│   └── ui.tsx               开关 / 步进器 / 分段控件 / 空状态 / toast
├── pages/
│   ├── CalendarPage.tsx     ★ 日历主页
│   ├── StatsPage.tsx        统计
│   ├── GoalsPage.tsx        目标
│   └── SettingsPage.tsx     设置
└── styles/
    ├── tokens.css           设计令牌（颜色/圆角/曲线/间距）
    └── app.css              应用样式
```

---

## 数据格式

一天的记录长这样，导出 JSON 后你可以自己看：

```json
{
  "date": "2026-08-14",
  "hours": 10,
  "overtimeHours": 0,
  "rate": 20,
  "allowance": 0,
  "deduction": 0,
  "note": "门店晚班",
  "updatedAt": 1755000000000
}
```

---

MIT License

---

## 自检与验证

项目自带可重复运行的验证脚本（都在 `scripts/`）：

| 命令 | 作用 |
|---|---|
| `npm run check` | 工资引擎 53 项断言（含用户给的「10 小时 × 20 元 = 200」） |
| `npm run typecheck` | TypeScript 严格模式类型检查 |
| `npm run build` | 生产构建 |
| `npm run icons:generate` | 重新生成图标与启动画面到 `assets/android/` |
| `npm run icons:apply` | 把 `assets/android/` 装进 Android 工程（CI 会跑） |
| `node scripts/visual-check.mjs` | 无头浏览器跑一遍核心流程并截图 |
| `node scripts/interact-check.mjs` | 抽屉拖拽/甩动关闭 + 无障碍检查 |

> `visual-check` / `interact-check` 需要先 `npm run build && npm run preview`，
> 并额外装一次 `npm install --no-save playwright`。

### 关键不变量

工资明细**按天四舍五入到分，再累加**，所以每天的金额加起来
正好等于月度合计，不会出现「明细和合计差一分钱」。
这条不变量由 `npm run check` 的第 7 组断言守着。
