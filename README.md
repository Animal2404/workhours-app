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

### 用起来之后补的
| 功能 | 说明 |
|---|---|
| **批量记账** | 日历右上角切到批量模式，点着选（或「整月」「本月已过」一键选），一次给这些天记同样的班。**一次落盘**，选 31 天也不会卡；已有记录会提示将被覆盖 |
| **累计总收入** | 日历顶部除了「本月已赚」，还有一行**累计**（所有月份加起来）和**环比上月**。点一下跳统计页看明细 |
| **逐月明细** | 统计页切到「全部」，按月从新到旧列出每个月赚了多少、出勤几天，点一行跳到那个月 |
| **存款目标** | 设个想买的东西（比如「买 iPhone 18」）和金额，显示环形进度 %、已攒 / 还差、**还要上几天班**、**预计达成日期**。起算日可选「今天起 / 本月 1 号 / 今年开始 / 全部记录」 |
| **月度目标** | 设个工资目标，显示进度环、还差多少钱、剩下每天要赚多少 |
| **工资预测** | 根据已记录的工作日节奏，推算这月大概能拿多少 |
| **统计页** | 月度/年度/全部切换、每天工时柱状图、等效时薪、加班占比、收入构成明细 |
| **每日工时目标** | 设 8 小时，日历上达标的日子用颜色标出来 |
| **班次模板** | 把常上的班（正常班 8h / 长班 10h / 加班 8+2h）存成模板，记录时一点就填好 |
| **记账提醒** | 到点且今天还没记，打开 App 时顶部提醒一句（**应用内提醒**，不是系统推送 —— 见下方说明） |
| **连续记录天数** | 记录习惯的连击计数 |
| **导出备份** | JSON 完整备份（可再导入）、CSV 明细（Excel 直接打开，带 UTF-8 BOM 不乱码） |
| **深色模式** | 跟随系统 / 手动浅色 / 手动深色 |
| **节假日标注** | 日历上显示中国法定节假日名（春节/清明/劳动节/端午/中秋/国庆/元旦），调休上班的周末标「班」，含放假安排 |

> **关于「记账提醒」的口径**：它是**打开 App 时**的应用内提醒，不是定时推送。
> WebView 里没有原生通知能力，要做真·后台推送得引入 Capacitor 本地通知插件并改原生工程。
> 之前的版本这个开关是**空壳**（有开关但没有代码），现在至少名副其实。

> **关于「还要上几天班」**：用的是**起算日至今每个出勤日的平均收入**（如每天 ¥160），
> 所以那个天数是**出勤天数**，不是自然日；「预计达成日期」则按**自然日**速度折算，
> 会把休息日算进去，因此两个数字看起来不一样是正常的。

数据全部存在设备本地（localStorage），**不联网、不上传、不需要登录**。

---

## 节假日数据：两层设计

节假日分两类，`src/lib/holidays.ts` 里对应两张表：

| 层 | 年份 | 显示什么 | 数据来源 |
|---|---|---|---|
| **官方放假安排**（`YEAR_PLANS`） | 2024–2026 | 整个放假区间 + 调休「班」 | 国务院办公厅通知（gov.cn 原文逐字转录） |
| **节日日期**（`FESTIVALS`） | 2027–2030 | 只标节日当天 | 香港天文台《公曆與農曆日期對照表》 |

**为什么要分两层**：国务院每年 11 月才发次年的放假安排，所以「2027 年放几天、哪天调休」现在**无人知道**。但「春节是正月初一」「中秋是八月十五」是农历本身的属性，天文台早已公布 —— 手机日历显示的正是这个。所以这类年份只标节日当天，不假装知道放假区间。

**界面上会说明**：翻到 2027–2030 时，月份标题旁会显示一个小标签「放假安排未公布」；翻到 2031 及以后显示「数据至 2030 年」。这样不会出现「翻到某年什么都没有、以为是坏了」的情况。

推导规则：春节 = 正月初一 ／ 端午 = 五月初一 +4 ／ 中秋 = 八月初一 +14 ／ 清明 = 表上标「清明」那天。**这套规则已用 2024–2026 的官方数据反向验证：春节/端午/中秋三年六处全部逐日吻合**（`node scripts/derive-festivals.mjs` 可复现）。

**两层之外的年份**（2031 及以后、2023 及以前）：`getHoliday()` 返回 `null`，该日按普通日期显示，不报错、不显示 `undefined`。

**更新方法**（每年 11 月官方发通知后，约 5 分钟）：
1. 搜「国务院办公厅关于 20XX 年部分节假日安排的通知」（gov.cn 原文）
2. 在 `YEAR_PLANS` 里照着上一年加一段：放假区间写进 `ranges`，调休上班的日子写进 `workdays`
   （该年份会自动从「节日日期」层升级为「官方放假安排」层，因为官方数据优先）
3. 在 `scripts/check-holidays.mjs` 里补上对应断言
4. 跑 `npm run check:holidays`，全绿即可

**往后补节日日期**：去天文台拿 `T{年份}c.txt`，跑一次 `node scripts/derive-festivals.mjs`，把输出贴进 `FESTIVALS`。

> 想省掉手工步骤，可以换成 npm 包
> [`chinese-days`](https://github.com/vsme/chinese-days)（9.4 KB gzip、MIT、零依赖、
> 社区用 GitHub Action 跟公告自动更新）。本项目选了内置表：零依赖、数据来自
> gov.cn 原文逐字转录 + 香港天文台历表交叉核对，171 项断言锁住。
> 调研对比见 [docs/research-ui-perf.md](docs/research-ui-perf.md)。

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

**推荐：直接去 Releases 页拿**（不用解压、链接永久有效、每次推送自动更新）：

> **https://github.com/Animal2404/workhours-app/releases/latest**
>
> 点 **`工时记.apk`** 下载即可。这个链接永远是**最新构建**，不用每次回来换。

也可以从构建页面拿（**Artifacts** 区域，保留 90 天）：

| 文件 | 用途 |
|---|---|
| `工时记-debug.apk` | 测试用，已自动签名 |
| `工时记-release.apk` | 正式包，体积更小 |

传到手机点击安装（需要允许「安装未知来源应用」）。

> **两个包用的是同一把固定签名**，所以**都能直接覆盖安装、本地工时数据不丢**。
> 只有第一次装（或之前用的是别的签名）才需要先卸载旧版。

> **更新机制**：每次推送到主分支，CI 都会重新构建并**滚动更新同一个 Release**
> （固定 tag `latest`，所以上面那个链接不会变）。历史版本可在 Actions 的构建产物里取。
> 版本号取自 `package.json`，构建时会注入进 APK 并在 CI 里核对
> （`aapt2 dump badging` 读出来的 `versionName` 必须和 `package.json` 一致，
> 不一致直接让构建失败 —— 免得 Releases 页写的版本和手机「应用信息」里显示的对不上）。

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
│   ├── EntrySheet.tsx       单天记账抽屉
│   ├── BatchSheet.tsx       批量记账抽屉
│   ├── GoalSheet.tsx        存款目标新建 / 编辑
│   ├── magic.tsx            NumberTicker / MagicCard / ShineBorder / 进度环
│   └── ui.tsx               开关 / 步进器 / 分段控件 / 空状态 / toast
├── pages/
│   ├── CalendarPage.tsx     ★ 日历主页（含批量记账）
│   ├── StatsPage.tsx        统计（月度 / 年度 / 全部 + 逐月明细）
│   ├── GoalsPage.tsx        目标（存款目标 + 月度目标）
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

存款目标存在 `settings.savingsGoals` 里：

```json
{
  "id": "g-abc123",
  "name": "买 iPhone 18",
  "target": 7999,
  "startDate": "2026-09-01",
  "initial": 0,
  "createdAt": 1755000000000
}
```

> `startDate` 决定哪些收入算进这个目标。老版本的数据里没有 `savingsGoals` 字段，
> 读取时会自动补成 `[]`，**不需要版本迁移、不会丢数据**（`check:savings` 第 10 组守着）。

---

MIT License

---

## 自检与验证

项目自带可重复运行的验证脚本（都在 `scripts/`）：

| 命令 | 作用 |
|---|---|
| `npm run verify` | **一键全跑**：工资 + 存款目标 + 节假日 + Android 资源 + 类型 + 构建 |
| `npm run check` | 工资引擎 53 项断言（含用户给的「10 小时 × 20 元 = 200」） |
| `npm run check:savings` | 存款目标 / 累计 / 逐月明细 / 老数据迁移 67 项断言 |
| `npm run check:signing` | 签名与版本号注入脚本 20 项（幂等、versionCode 递增、异常输入不写坏文件） |
| `npm run check:features` | 批量记账 / 累计 / 存款目标 / 提醒 端到端 43 项（需浏览器） |
| `npm run check:holidays` | 节假日数据 171 项断言（放假区间 / 调休 / 非法输入 / 遍历 1096 天） |
| `npm run check:android` | Android 资源自检（XML 合法性 + 深浅背景色与 `tokens.css` 三方一致） |
| `npm run check:fouc` | 启动白闪回归 14 项（拦掉 React，只验首帧主题） |
| `npm run check:tabbar` | 底部导航居中（10 种视口/缩放/DPR × 4 tab，全 0.00px） |
| `npm run check:holiday-ui` | 日历节假日显示 39 项（含三行叠加极限、切月切年闰年） |
| `npm run typecheck` | TypeScript 严格模式类型检查 |
| `npm run build` | 生产构建 |
| `npm run icons:generate` | 重新生成图标与启动画面到 `assets/android/` |
| `npm run icons:apply` | 把 `assets/android/` 装进 Android 工程（CI 会跑） |
| `node scripts/visual-check.mjs` | 无头浏览器跑一遍核心流程并截图 |
| `node scripts/interact-check.mjs` | 抽屉拖拽/甩动关闭 + 无障碍检查 |
| `node scripts/cal-perf-check.mjs` | 换月性能（节点是否重建、长任务、掉帧） |
| `node scripts/fcp-ab.mjs` | 首屏 FCP 与 baseline 交替对照（防「优化成退步」） |
| `node scripts/verify-*.mjs` | 独立验证脚本（节假日 / 日历 / 导航），见 `verification/VERIFY-REPORT.md` |

> 带浏览器的脚本需要先 `npm run build && npm run preview`，
> 并额外装一次 `npm install --no-save playwright`。
> 纯 node 的 `check` / `check:holidays` / `check:android` 不需要浏览器，CI 里也会跑。

### 关键不变量

工资明细**按天四舍五入到分，再累加**，所以每天的金额加起来
正好等于月度合计，不会出现「明细和合计差一分钱」。
这条不变量由 `npm run check` 的第 7 组断言守着。

另外两条同样由脚本守着，改动时别弄坏：
- **首帧主题**：`index.html` 里那段同步内联脚本必须先于样式执行，
  且不能改成 `type="module"`（module 是延迟执行，等于没提前）。改了 `check:fouc` 会红。
- **日格溢出判定**：不能用 `scrollHeight`。选中态的 `.day.is-selected::after`
  有 `inset:-3px` 外环，会把 `scrollHeight` 撑大 3px 造成假报警；
  要用「非 `position:absolute` 子元素包围盒 vs 父内容盒」来判。

### ⚠️ 改源码时别用 PowerShell 读写文件

本项目的源码是 **UTF-8 无 BOM**，而 Windows PowerShell 5 的
`Get-Content -Raw` 默认按**系统 ANSI（中文机器上是 GBK）**解码。
一旦 `Get-Content ... | Set-Content` 往返一次，**全文件中文会变成乱码且不可逆**
（中转时无法映射的字节会永久丢失）。

这个坑真的踩过一次：`GoalsPage.tsx` 被整文件写坏，只能 `git checkout` 回滚重做。

**正确做法**：用编辑工具（会按 UTF-8 处理），或
`[System.IO.File]::ReadAllText/WriteAllText` 显式指定 `UTF8Encoding($false)`。
**绝不要**为了「批量替换」把 .ts/.tsx/.css 交给 PowerShell 的文本管道。
