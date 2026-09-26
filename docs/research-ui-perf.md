# workhours-app · UI / 动效 / 性能 外部调研

> 调研范围：① 日历里的中国法定节假日（含调休）② 底部导航 TabBar 居中与 iOS 安全区适配 ③ 全 App 满帧 60fps
> **判断前提：验收环境是 Capacitor 打包的手机 WebView（Android System WebView / iOS WKWebView），不是桌面浏览器。**
> 每条要点格式：**链接 + 它解决什么问题 + 是否适合本项目**。
> 文末区分「已成熟可直接用」与「有风险 / 不建议」。

---

## 0. 调研可用性声明（先读，影响可信度判断）

| 通道 | 状态 | 说明 |
| --- | --- | --- |
| `gh` CLI（GitHub API / 仓库 / issue / code search） | ✅ 可用 | 已认证，本次大量使用 |
| `read_page` | ✅ 可用（降级到本地抓取） | 云端 firecrawl 引擎 403，本地引擎正常 |
| `curl.exe` + `node`（直连 npm registry / jsdelivr / raw.githubusercontent / gov.cn） | ✅ 可用 | 体积、gzip、源码均由此实测 |
| `web_search` | ❌ **不可用** | modsearch：`Every engine for the web source failed`（firecrawl keyless 403，本机 IP 被判定可疑） |
| `x_search` | ❌ **不可用** | 同上，X 源全线失败 |
| Jina Reader（`r.jina.ai`） | ❌ **不可用** | `401 AuthenticationRequiredError`：匿名配额因网络信誉（AS7018）被封 |
| 需登录态平台（小红书 / B站 / Reddit / V2EX） | ⛔ 未尝试 | 本会话无对应后端，且与本次技术选型无强相关 |

**因此本报告的链接都来自「可直连的一手源」**：npm registry API、jsdelivr 文件清单、GitHub raw、MDN content 仓库原始 markdown、caniuse 数据集、gov.cn。
凡是我没能亲自打开的页面，都会标注「仅链接，未核实正文」——不编造内容。

---

## 1. 结论速览（TL;DR）

| 议题 | 推荐做法 | 风险等级 |
| --- | --- | --- |
| 日历节假日 | **直接依赖 `chinese-days`（pin 版本）**；若坚持零依赖，则内置表必须用它的 JSON 做 CI 交叉校验 | 低 |
| TabBar 安全区 | `capacitor.config.ts` 加 `android.adjustMarginsForEdgeToEdge: 'auto'`（零依赖，一行） | 低 |
| TabBar 居中 | 现有 `.tabbar` 居中逻辑**已正确**，无需改动；真正要修的是 `backdrop-filter` + 切换动画 | 中 |
| 满帧 60fps | 四个页面**保持挂载**（现在是条件渲染 → 每次切 tab 全量重挂载）+ 持久化写入**去抖** | 中 |
| 长列表 | 本项目**不需要虚拟化**；用 `content-visibility` / `contain` 即可 | 低 |
| 页面切换动画 | **渐进增强** `document.startViewTransition`（Android WebView 需 ≥111，iOS 需 ≥18.1）；降级用 CSS transform/opacity | 中 |
| React 18 | 拆 Context / `useSyncExternalStore` 选择器订阅 / `memo` / `useDeferredValue`；**不要**过度用 `useTransition` | 低 |
| 动效库 | 需要就上 `@formkit/auto-animate`（3.2 KB gz，0 依赖）；**不要**上 `motion`（47.7 KB gz） | 低 |

**一句话总结**：本项目最大的性能收益不在"换库"，而在①减少页面重挂载 ②干掉每帧 backdrop-filter ③持久化写入去抖。**加依赖的收益远小于改现有代码。**

---

## 2. 【专项 · 给 T1】中国法定节假日数据包调研

> T1 正在做「内置节假日数据模块」。本节回答：**到底该用现成包，还是内置自己的数据表？**

### 2.1 候选包横向对比（数据均由 npm registry API / jsdelivr 实测，2026-09 快照）

| 指标 | **chinese-days** ⭐推荐 | holiday-cn（NateScarlet） | lunar-javascript | chinese-holidays | holiday-cn（npm 上的） |
| --- | --- | --- | --- | --- | --- |
| npm 包名 | `chinese-days` | ❌ **没有 npm 包** | `lunar-javascript` | `chinese-holidays` | `holiday-cn` |
| 最新版本 | 1.5.9 | CalVer `YYYY.0M.0D` | 1.7.7 | 1.8.0 | 1.0.1 |
| 发布时间 | 2026-06-02 | 随国务院公告滚动发布 | 2025-11-05 | 2025-11-22 | **2017-02-22** |
| 仓库最后 push | 2026-07-07 | 2026-09-15 | 2025-11-05 | 2025-11-22 | 2022-06-18 |
| Star | 1,304 | **2,175** | — | 41 | — |
| 许可证 | **MIT** | **MIT** | MIT | MIT | MIT |
| 运行时依赖 | **0** | 0（纯 JSON） | **0** | **4**（lodash / moment / request / request-promise-native） | 3（axios / tlan / xx-oss-service） |
| 体积（min+gzip） | **8.2 KB**（`main`=index.min.js）/ **9.4 KB**（`module`=index.es.js） | 按年取 JSON：单年 1.4–2.2 KB raw，**gzip ≈ 0.4 KB / 年** | **97.7 KB gzip**（bundlephobia 实测 size=307,101 / gzip=100,018） | 未测（依赖体量已劝退） | 未测 |
| 数据覆盖 | **节假日 2004–2026**；24 节气 1900–2100；农历 1900–2100 | 2019 起逐年，按年独立 JSON | 农历 1900–2100 + 节日 | 未核实 | 2017 年即停更 |
| 支持调休 | ✅ 是（`isWorkday` / `isHoliday` / `getDayDetail`，区分"调休上班日"） | ✅ 是（`isOffDay: false` 即调休补班日） | 部分（`HolidayUtil`，覆盖年份未核实） | 未核实 | ⚠️ |
| 数据更新机制 | GitHub Action 每日抓取 + AI 自动更新 + 自动 PR + 邮件提醒 | GitHub Action 每日抓取国务院公告，CI 自动发版 | 人工 | 人工 | 已废弃 |
| 附加能力 | TS 类型、CJS/ESM/UMD、ics 日历、农历/节气互转 | 纯 JSON + Release 打包下载 | 农历/八字/黄历（功能远超所需） | — | — |

### 2.2 逐包判断（链接 + 解决什么问题 + 是否适合）

**① `chinese-days` — ✅ 强推荐**
- 链接：https://github.com/vsme/chinese-days ｜ 文档 https://chinese-days.yaavi.me/ ｜ npm `chinese-days`
- 解决什么问题：把「中国法定节假日 + 调休 + 工作日 + 农历 + 24 节气」做成一个零依赖、带 TS 类型的查询库，并用 GitHub Action 每天抓国务院公告自动更新——**把"每年 11 月手工抄调休"这件脏活外包出去**。
- 是否适合本项目：**非常适合**。`0` 运行时依赖、MIT、gzip 9.4 KB（相对本项目 dist 体量可忽略）、`type: commonjs` 但有 `module: dist/index.es.js`，Vite 6 会正常走 ESM + tree-shaking。数据离线内置，**完全符合本 App"不联网、数据只在设备上"的定位**（不需要任何网络请求）。
- 实测文件（jsdelivr `chinese-days@1.5.9`）：`dist/index.min.js` 23,837 B / gzip 8,398 B；`dist/index.es.js` 32,138 B / gzip 9,626 B；`dist/chinese-days.json` 37,428 B / gzip 3,090 B；`dist/years/2026.json` 1,856 B / gzip 370 B。

**② `NateScarlet/holiday-cn` — ✅ 推荐作为「数据源 / 校验基准」**
- 链接：https://github.com/NateScarlet/holiday-cn
- 解决什么问题：**只做数据、不做逻辑**。每天抓国务院公告，产出 `{年份}.json`，结构极简：`{ year, papers[], days: [{ name, date, isOffDay }] }`——`isOffDay: false` 就是调休补班日。
- 是否适合本项目：**适合当"事实标准"**，但不适合当运行时依赖——它没有 npm 包，只能走 `raw.githubusercontent.com` / jsDelivr `/gh/` 拉取，**而本 App 是离线优先的，运行时联网拉数据不可接受**。
- ⚠️ 两个官方注意事项（直接影响 T1 的正确性）：
  1. 年份按**国务院文件标题年份**归档，12 月的日期可能被下一年的文件影响 → 查 12 月要同时看两年文件。
  2. **"与周末连休"的周末不算法定节假日**，数据里不含；法定节假日只按《全国年节及纪念日放假办法》算。**这正是内置表最容易抄错的地方。**

**③ `lunar-javascript` — ⚠️ 不建议（就本需求而言）**
- 链接：https://github.com/6tail/lunar-javascript ｜ npm `lunar-javascript`
- 解决什么问题：农历/公历互转 + 八字 + 黄历 + 24 节气 + 节日。
- 是否适合本项目：**过重且偏题**。gzip **97.7 KB**（约为 `chinese-days` 的 10 倍），且核心能力（八字、宜忌、神煞）与"工时记录"毫无关系。**除非将来要显示农历日期**——但那个能力 `chinese-days` 已包含（1900–2100）。

**④ `chinese-holidays`（bastengao） — ❌ 不建议**
- 链接：https://github.com/bastengao/chinese-holidays-node ｜ npm `chinese-holidays`
- 解决什么问题：早期中文节假日查询 Node 库。
- 是否适合本项目：**不适合**。即使包本体只有 32 KB，它拖着 `lodash` + `moment` + `request` + `request-promise-native` 4 个运行时依赖——`request` **早已 deprecated**。为一个 1 KB 的查询功能引入 4 个依赖（其中 2 个是历史包袱），性价比极差。

**⑤ npm 上的 `holiday-cn`（miserylee） — ❌ 绝对不要用**
- 链接：https://www.npmjs.com/package/holiday-cn
- 解决什么问题：2017 年的「中国法定节假日微服务」。
- 是否适合本项目：**名不副实，且已死**。最后发布 2017-02-22，仓库 2022-06-18 后无动静，依赖陈旧 axios 0.15。**注意：它和 GitHub 上 2175 star 的 `NateScarlet/holiday-cn` 是两个完全不同的项目**，极易混淆——请以仓库地址为准。

### 2.3 权威依据（数据为什么必须"跟着公告走"）

- 《国务院关于修改〈全国年节及纪念日放假办法〉的决定》：https://www.gov.cn/zhengce/content/202411/content_6986380.htm
- 已实测正文（2026-09 抓取，HTTP 200），**全体公民放假的节日合计 13 天**：
  - 元旦 1 天；**春节 4 天（农历除夕、正月初一至初三）**；清明 1 天；**劳动节 2 天（5 月 1 日、2 日）**；端午 1 天；中秋 1 天；国庆 3 天。
  - 第六条：全体公民放假的假日**适逢周六周日应在工作日补假**；部分公民放假的假日则不补假。
  - 第七条：可统一放假调休，**除个别特殊情形外，法定节假日假期前后连续工作一般不超过 6 天**。
- 对 T1 的直接含义：**法定节假日天数与调休规则是"政策"，不是"日历规律"**。春节 4 天 / 劳动节 2 天是 2024-11 修订后的新规（2025 年起适用）——**2024 年及以前必须用旧规则（春节 3 天、劳动节 1 天）**，一刀切写死必错。
- 历史特例（内置表最容易漏的坑）：2020 年春节延长、2015 年抗战胜利 70 周年假、除夕在"放假/不放假"之间多次变动。

### 2.4 ✅ 结论：用现成包，还是内置数据表？

> **推荐：直接用 `chinese-days`（`package.json` 里 pin 死版本，例如 `"chinese-days": "1.5.9"`）。**

**理由（按权重排序）：**

1. **维护成本才是这件事的真实成本，不是体积。** 调休安排每年 11 月由国务院公告发布，且带历史特例。`chinese-days` 用 GitHub Action 每天抓取 + 自动 PR + 邮件提醒，**这个机制本身就是它最大的价值**；内置表则意味着团队要永久承担一项每年一次的、容易抄错的人工仪式。
2. **体积代价可以忽略。** 9.4 KB gzip vs. 内置 5 年数据表约 2 KB gzip——**7 KB 的差额，在"满帧 60fps"的验收里毫无影响**，为了 7 KB 去背一份手工数据不划算。
3. **零运行时依赖 + MIT + 有 TS 类型**，供应链风险与集成成本都低。
4. **离线可用**：数据编译进 bundle，`Capacitor` 打包后设备上不需要任何网络请求，完全符合本项目"数据只在设备上"的隐私定位。
5. **顺带拿到农历/24 节气**（1900–2100），日历以后要显示农历不用再加库。

**但必须同时做到（否则包也会坑你）：**

- **pin 精确版本**（`"1.5.9"` 而非 `"^1.5.9"`），避免某次自动更新把数据变更悄悄带进构建。
- **加一条"数据保鲜"自检**：断言表内覆盖到 `当前年份 + 1`，未覆盖时**降级为"周六周日休息、其余工作日"**并静默通过——绝不允许日历因为查不到数据而报错或显示空白。这同时也是 T1 自检脚本的验收点。
- **复核 12 月归属**：查 12 月日期时要同时看当年和次年的节假日文件（`holiday-cn` 明确记录的坑），对"元旦假期跨年"尤其重要。

**如果团队有"零运行时依赖"硬约束（T1 已经在做内置表）：**

> 那就**保留内置表作为运行时数据，但把 `chinese-days` 的 `dist/chinese-days.json`（3.0 KB gz）或 `holiday-cn` 的按年 JSON 接进 CI 做逐年交叉校验**。
> 这样既不引入运行时依赖，又把"数据是否正确"这件事交给了已经自动化的上游——等价于用现成包的数据当事实标准。**纯手工、无交叉校验的内置表，是本项目最可能出错的一环。**

**⚠️ 写本文时对 T1 已交付产物的实测（`src/lib/holidays.ts`，只读未改）：**

- 内置表当前只覆盖 **2024 / 2025 / 2026 三年**（`COVERED_YEARS = {2024, 2025, 2026}`），表外年份返回 `null`（"未知"）。
- 对照 `chinese-days` 的 **2004–2026**：内置表**向前少 20 年、向后少 0 年**。也就是说明年（2027）一到，**当前表会立刻变成"完全无数据"**。
- 因此无论最终选哪条路，**下面这条必须有**：日历遇到表外年份时，必须**降级为"周六周日休息、其余工作日"**并静默工作，绝不能因为查不到就报错/空白。这是 T1 自检脚本最该加的一条断言，也是本次调研里**风险最高、最容易漏**的一点。
- 与之相对，`chinese-days` 已经把"每年 11 月跟国务院公告"这件事用 GitHub Action + 自动 PR 承接掉了——这正是 §2.4 推荐它的核心理由。

---

## 3. 主题一：日历 / 节假日标注实现

| # | 链接 | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- |
| 1.1 | https://github.com/vsme/chinese-days | 节假日/调休/工作日/农历/节气一站式查询，自动更新 | ✅ **首选**，见 §2 |
| 1.2 | https://github.com/NateScarlet/holiday-cn | 纯 JSON 数据 + `isOffDay` 布尔，最简调休表示法 | ✅ 作数据源/校验基准 |
| 1.3 | https://github.com/LKI/chinese-calendar | Python 参考实现（`chinese-days` 的数据生成即参考它） | 📖 仅作规则参考，不引入 |
| 1.4 | https://www.gov.cn/zhengce/content/202411/content_6986380.htm | 权威政策原文（13 天、补假规则、调休上限） | ✅ **必须读**，规则的唯一事实来源 |
| 1.5 | https://cdn.jsdelivr.net/npm/chinese-days/dist/chinese-days.json | 全量 JSON 单文件（3.0 KB gz），可离线内置 | ✅ 若要零依赖，用它当数据 |
| 1.6 | https://cdn.jsdelivr.net/npm/chinese-days/dist/years/2026.json | 按年切片（370 B gz），只需近 N 年时更省 | ✅ 推荐粒度 |

### 数据结构的推荐表示法（给 T1 参考）

调休的本质是**三态**而不是两态，内置表请用：

```ts
type DayKind = 'holiday' | 'workday' | 'weekend';
// holiday = 法定节假日（放假）
// workday = 调休补班日（本该休息却要上班）——「周末上班」就是这一态
// weekend = 普通周六周日（非节假日、非补班）
```

- **不要只存"哪些天放假"**：漏掉补班日会让"这个月上了几天班"算错，而这是工时 App 的核心数字。
- **不要自己推"第几个周一"**：清明/端午/中秋是农历或节气驱动，推不出来，必须查表。
- **未覆盖年份的降级规则**：`weekend = 周六|周日`，其余 `workday`。**永不抛错。**

---

## 4. 主题二：TabBar 居中与 iOS / Android 安全区适配

### 4.1 ⚠️ 最重要的一条：Android WebView 的 `env(safe-area-inset-*)` 是有条件的

**证据（三条独立来源，互相印证）：**

- `@capacitor-community/safe-area` README 原文：*"On web and iOS the safe area insets work perfectly fine out of the box… On Android (in combination with Capacitor), however, those CSS variables will not always have the correct values when Edge-to-Edge mode is enabled… If a user has a Chromium version **lower than 140**, this plugin makes sure the webview gets the safe area as padding. The `env(safe-area-inset-*)` values will be set to `0px`."*
  → 链接：https://github.com/capacitor-community/safe-area
- Capacitor issue **#8394**「[Bug]: CSS safe-area-inset-x, is not being applied on Android mobiles with API <= 34」+ PR **#8424**「fix(SystemBars): make `safe-area-inset-x` available on API <= 34」→ Android 侧 inset 确实是"后来才修好的"。
  → https://github.com/ionic-team/capacitor/issues/8394
- Capacitor issue **#8623**（仍 open）「[Bug]: SystemBars injects non-zero `--safe-area-inset-*` when the WebView is not edge-to-edge (regression in 8.5.2)」→ 连 Capacitor 8 的 SystemBars 都还在修这个。
  → https://github.com/ionic-team/capacitor/issues/8623

**本项目实测（读的是 `node_modules` 里装的那一份源码，不是文档）：**

- 装的是 `@capacitor/android@7.6.9`，`MainActivity` 是空的 `BridgeActivity` 子类，**没有** `EdgeToEdge.enable(this)`。
- `android/variables.gradle`：`targetSdkVersion = 35`（Android 15）、`minSdkVersion = 23`、`compileSdkVersion = 35`。
- `CapacitorWebView.edgeToEdgeHandler()`（`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapacitorWebView.java:58-88`）：
  - 配置键 `android.adjustMarginsForEdgeToEdge`，**默认值 `"disable"`**（`CapConfig.java:291`）→ 方法第一行就 `return`，**不注册任何 `WindowInsets` 监听**。
  - `"force"`：总是把 `systemBars | displayCutout` 的 inset 作为 **WebView 视图的 margin** 应用，并 `WindowInsetsCompat.CONSUMED`（不再下传）。
  - `"auto"`：仅在 `SDK_INT >= 35`（`VANILLA_ICE_CREAM`）且主题**未**设置 `android:windowOptOutEdgeToEdgeEnforcement=true` 时才应用上述 margin。
- `android/app/src/main/res/values/styles.xml` 里**没有** `windowOptOutEdgeToEdgeEnforcement`；`capacitor.config.ts` 里**没有** `adjustMarginsForEdgeToEdge`。

**推导出的真实风险窗口：**

| 场景 | WebView 视口 | `env(safe-area-inset-bottom)` | 底栏表现 |
| --- | --- | --- | --- |
| iOS WKWebView（任意版本） | 铺满（`viewport-fit=cover`） | **正确** | ✅ 正确抬升 |
| Android ≤14（本 App） | 未 edge-to-edge，被系统栏夹住 | `0` | ✅ 离底 12px，正确 |
| Android 15+ / WebView **≥140** | 系统强制 edge-to-edge，铺到导航栏下 | **正确** | ✅ 正确抬升 |
| Android 15+ / WebView **<140** | 铺到导航栏下 | **`0`（错误）** | ❌ **底栏被手势条压住** |

> 关键：`targetSdkVersion = 35` 意味着 **Android 15 上系统会强制 edge-to-edge**，而 `adjustMarginsForEdgeToEdge` 默认 `disable` 让 Capacitor 什么都不做。风险窗口 = "Android 15+ 且 WebView < 140"。caniuse 快照显示当前 Android Chrome/WebView 已是 **152**，所以主流设备安全——**但"被冻结在旧版 WebView 的设备"（旧机型、WebView 被禁用/不更新）会实打实翻车。**

### 4.2 三种修法

| 方案 | 做法 | 代价 | 建议 |
| --- | --- | --- | --- |
| **A（推荐）** | `capacitor.config.ts` 加 `android: { adjustMarginsForEdgeToEdge: 'auto' }` | **一行，零依赖** | ✅ Android 15+ 由原生给 WebView 让出安全区 → `env()` 恒为 `0`，现有 CSS 表现完全确定；iOS 照旧吃 `env()`。**风险归零，观感上没有 edge-to-edge 沉浸效果** |
| **B（要沉浸观感）** | `@capacitor-community/safe-area@^7.0.0` + `MainActivity` 里 `EdgeToEdge.enable(this)` | 一个 MIT、0 依赖的原生插件 | ⚠️ 可行但引入原生依赖；注意 **Capacitor 7 必须用 `7.0.0`，`latest`(8.0.1) 的 peer 是 `@capacitor/core@>=8.0.0`** |
| C（不推荐） | `capacitor-plugin-safe-area@^4` 把原生 inset 读进 JS 再写 CSS 变量 | 需等 JS 启动后才写变量 | ❌ 首帧会跳一下，与"满帧"目标相悖 |

### 4.3 链接清单

| # | 链接 | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- |
| 2.1 | https://developer.mozilla.org/en-US/docs/Web/CSS/env | `env()` 官方语义 + 官方示例 `padding: 1em 1em calc(1em + env(safe-area-inset-bottom))` | ✅ 已核实正文 |
| 2.2 | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport | `viewport-fit=cover` 是 `env()` 非 0 的前提 | ✅ 本项目**已有** |
| 2.3 | https://webkit.org/blog/7929/designing-websites-for-iphone-x/ | iPhone X 刘海/home indicator 与 `constant()`→`env()` 由来 | 📖 仅链接，未核实正文（Jina 被封） |
| 2.4 | https://github.com/capacitor-community/safe-area | 明确给出「Chromium < 140 时 Android 侧 `env()` 不可靠」这一判据 | ✅ **本次最关键证据** |
| 2.5 | https://github.com/AlwaysLoveme/capacitor-plugin-safe-area | 原生侧读 safe area inset（v4.x 对应 Capacitor 7） | ⚠️ 备选，非首选 |
| 2.6 | https://github.com/ionic-team/capacitor/issues/8394 · /pull/8424 | Android API ≤34 上 `safe-area-inset-x` 失效的官方修复记录 | ✅ 佐证 |
| 2.7 | MDN `safe-area-max-inset-*`（见 2.1 页面内） | **静态**最大值，避免键盘/工具栏收起时 `env()` 变化导致布局跳动 | 💡 值得一试 |

### 4.4 TabBar「居中」本身：本项目实测结论 —— 已经是对的

读 `src/components/TabBar.tsx` + `src/styles/app.css:1460` 起：

- `.tabbar { position: fixed; left: 50%; transform: translateX(-50%); width: min(calc(560px - var(--page-pad)*2), calc(100% - var(--page-pad)*2)) }` → 水平居中**正确**。
- `.tab { flex: 1 }` × 4 + `gap: 2px` → 四等分，天然对称居中。
- `.tab-pill` 的 `left: 0` + JS 量出的 `translateX(pill.x)`：`x = btnRect.left - (barRect.left + borderLeft)`，用 `getBoundingClientRect()` 取**小数**而非 `offsetLeft` 取整——**代码注释里已经记录了这个 8px 偏移 bug 的修复**，做法正确。
- **结论：居中不需要改。** 若仍觉得视觉上偏，问题不在几何居中，而在下面这条。

**真正会影响"看起来居中/顺不顺"的三点（按收益排序）：**

1. **`backdrop-filter` 是掉帧头号嫌疑。** `.tabbar` 同时有 `backdrop-filter: var(--material-blur)`、`-webkit-backdrop-filter`、`border-radius`、`box-shadow`，且是 `position: fixed` 浮在滚动列表之上；内部还有 `.tab:active { transform: scale(.94) }` 和药丸的 `translateX` 动画（`app.css:1481-1482`、`1560-1561`、`613`）。**背景模糊元素内部做 transform 动画 = 每帧重新采样并模糊背后的内容**，在 Android WebView 上极易掉帧。
   → **建议**：给 `.tabbar` 换成高不透明度纯色/渐变背景；若一定要毛玻璃，至少保证药丸滑动期间其背后的滚动内容静止。
2. **`env(safe-area-inset-bottom)` 键盘弹出时会变**（iOS），底栏会跟着跳。Capacitor 有同源 issue（#8329「Too much bottom safe area when keyboard is visible」）。→ 建议键盘态隐藏 TabBar 或锁定 `bottom` 值。
3. `transition: color …` 会触发 paint 而非合成；金额/标签变色的过渡优先级低，可留给 CSS，不必上 JS。

---

## 5. 主题三：长列表虚拟化

| # | 链接 | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- |
| 3.1 | https://github.com/bvaughn/react-window | 大列表只渲染可视区（17.2k★，MIT，2026-09 仍活跃） | ⚠️ **本项目不需要**。月视图最多 42 格；日列表按年也就 366 条 |
| 3.2 | https://github.com/petyosi/react-virtuoso | 变高行 / 分组 / 粘性表头 / 自动测量（6.4k★） | ❌ 不需要，且引入 19.3 KB gz |
| 3.3 | https://github.com/TanStack/virtual | 无头虚拟化内核（7.1k★，MIT） | ❌ 同上，7.8 KB gz |
| 3.4 | https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility | `content-visibility: auto` 让 UA 跳过屏外内容的 layout/paint | ✅ **首选**。Chrome 85+ / Safari 18.1+，零依赖、零 API |
| 3.5 | https://developer.mozilla.org/en-US/docs/Web/CSS/contain | `contain: layout / paint / strict` 把样式与布局计算限制在子树内 | ✅ 零依赖，日历格子/统计卡片都适合 `contain: layout paint` |

**体积对比（bundlephobia 实测 min+gzip）**：`react-window` 5.3 KB · `@tanstack/react-virtual` 7.8 KB · `react-virtuoso` 19.3 KB。

**判断**：本项目的数据规模（一个月 42 格、一年 366 条记录）**远低于虚拟化的收益门槛**，引入虚拟化只会换来"滚动位置/焦点管理/测量抖动"这些新 bug。**用 CSS 而非 JS 解决**：
- 日历只渲染当前月（已如此）+ 每格 `contain: layout paint`；
- 统计页若出现长列表，用 `content-visibility: auto` + `contain-intrinsic-size` 占位；
- ⚠️ `content-visibility: auto` 需要 `contain-intrinsic-size` 配合，否则滚动条长度会跳。

---

## 6. 主题四：页面 / 路由切换动画

**本项目现状实测**：`src/main.tsx` 用 `{tab === 'calendar' ? <CalendarPage …/> : null}` 条件渲染——**没有 router，每次切 tab 都是卸载 + 重新挂载整个页面**（日历页要重建 42 个格子，统计页要重算聚合）。这既是"切换卡顿"的根因，也是"没有切换动画"的根因。

| # | 链接 | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- |
| 4.1 | https://developer.chrome.com/docs/web-platform/view-transitions/ | View Transitions API：一次 DOM 变更自动生成前后态交叉过渡，无需手写 FLIP | ⚠️ **有条件适合**，见下方版本门槛 |
| 4.2 | https://caniuse.com/view-transitions | 支持矩阵（实测 caniuse 数据集：**Chrome 111+ / Safari 18.1+ / iOS Safari 18.1+**） | ⚠️ Android WebView 自动更新 → 基本可用；**iOS < 18.1 完全不可用** |
| 4.3 | https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS | 合成器友好属性 / 减少 reflow 的官方指引 | ✅ 已核实正文 |
| 4.4 | https://react.dev/reference/react/ViewTransition | React 官方 `<ViewTransition>` 组件 | ❌ **React 19 特性，本项目是 React 18，用不了** |

**推荐做法（渐进增强，两段式）：**
1. **先让四个页面常驻挂载**，用 CSS 切换可见性（`hidden` / `display` / `content-visibility`）而不是卸载重建——**这一步本身就消除了切 tab 的卡顿**，比任何动画库收益都大。
2. 在此之上加过渡：
   ```ts
   if (document.startViewTransition) document.startViewTransition(() => flushSync(update));
   else /* 降级：CSS opacity/transform 过渡 */
   ```
   - ⚠️ 必须用 `flushSync` 包住状态更新，否则 DOM 变更发生在回调返回之后，过渡会捕捉到空快照。
   - ⚠️ **不要把 `startViewTransition` 用在"点击格子打开 BottomSheet"上**——那类交互必须立即反馈，包一层异步快照反而增加感知延迟。
3. **动画只用 `transform` 和 `opacity`**（合成器属性）；避免动画 `top/left/width/height/box-shadow/background` 触发 layout/paint。
   - ⚠️ 本项目 `.tab-pill` 用 `translateX`（✅ 合成友好），但**宽度 `width: pill.w` 是布局属性**——若将来要让它"弹性变宽"，改成 `transform: scaleX()` 或接受每帧 layout。

---

## 7. 主题五：React 18 性能优化

> 全部来自 react.dev 官方文档原始 markdown（已核实正文）。

| # | 链接 | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- |
| 5.1 | https://react.dev/reference/react/memo | 跳过 props 未变的子树重渲染 | ✅ 日历格子、统计卡片适用。注意官方注记：**React Compiler 会自动做等价优化，但那是 React 19 的能力** |
| 5.2 | https://react.dev/reference/react/useDeferredValue | 让"重的部分"延后渲染，输入保持跟手 | ✅ **很适合**——统计页重算时用，日历交互不受影响 |
| 5.3 | https://react.dev/reference/react/useTransition | 把更新标记为可中断的 Transition | ⚠️ **谨慎**。低端 WebView 上收益有限；**绝不能**用在必须立即反馈的交互（点击格子开面板）上 |
| 5.4 | https://react.dev/reference/react/useSyncExternalStore | 给外部 store 做**按选择器**订阅，避免全树重渲染 | ✅ **本项目最对症的一条**，见下 |
| 5.5 | https://react.dev/reference/react/Profiler | 程序化测量渲染耗时 | ✅ 建议在 perf 任务里挂一个 `<Profiler>` 出真数据 |
| 5.6 | https://react.dev/reference/react/useMemo | 缓存计算结果 | ✅ 已有使用；注意**不要给每个值都套**，成本可能高于收益 |

### 本项目代码级发现（给 `perf` 任务的三条具体建议）

1. **`src/lib/store.tsx` 是单一大 Context**：`value = { state, ...11 个回调, storageFailed }`，任何 state 变化都会让**所有** `useStore()` 消费者重渲染。
   - ✅ 低成本改法：**拆成两个 Context**——`StoreStateContext`（易变）与 `StoreActionsContext`（回调全部 `useCallback([])`，**永不变化**）。只用 action 的组件（如设置页的按钮）就不会再被 state 变更牵连。
   - ✅ 更彻底：按 5.4 改用 `useSyncExternalStore` + 选择器订阅。
2. **`store.tsx:128-136` 每次 state 变化都同步写 localStorage**：`saveState` = `JSON.stringify(state)` + `localStorage.setItem`（`storage.ts:108-110`）。**这是主线程上的同步序列化 + 同步磁盘写**，数据量随记录数增长；在低端 WebView 上单次 5–20 ms 就会吃掉一帧。
   - ✅ 建议：改为**去抖 ~500 ms 写入**，并在 `visibilitychange`（hidden）/ `pagehide` 时**强制 flush**，保证不丢数据。这是"满帧"里性价比最高的一处改动。
   - ⚠️ 注意 `storageFailed` 的提示不能因此延迟到用户看不见。
3. **测量口径**：`main.tsx` 用了 `<StrictMode>`（开发期双调用），**性能必须在生产构建上量**（`npm run build` + `npx cap sync android` 后跑真机/WebView），在 Vite dev server 上测出来的数字没有意义。

---

## 8. 主题六：适合移动端 WebView 的 UI / 动效库

| # | 库 | 体积（min+gzip，实测） | 解决什么问题 | 是否适合本项目 |
| --- | --- | --- | --- | --- |
| 6.1 | `@formkit/auto-animate` https://github.com/formkit/auto-animate | **3.2 KB**，**0 依赖**（13.9k★，MIT，2026-07 活跃） | 一行代码给列表增删/重排加过渡，零配置 | ✅ **唯一推荐的动效库**。体积可忽略，正好覆盖"统计列表增删"这类场景 |
| 6.2 | `motion`（framer-motion 后继） https://github.com/motiondivision/motion | **47.7 KB gz**，2 依赖 | 完整声明式动效 / 手势 / layout 动画 | ❌ **不建议**。为一个"满帧"目标引入 47.7 KB 的 JS 动效运行时，在低端 WebView 上是净负担。若确有复杂手势需求再评估 |
| 6.3 | Magic UI https://github.com/magicuidesign/magicui | 按组件复制源码（MIT） | 75+ 个炫酷 React 动效组件 | ❌ **不适合**。它是 shadcn registry 形态，**面向 Next.js + Tailwind**；本项目是 Vite 6 + 手写 CSS（`app.css`/`tokens.css`），迁移成本远大于收益 |
| 6.4 | `morphicons` https://github.com/morphicons/morphicons | 已在 `package.json` 依赖中 | 描边图标带弹簧变形（菜单↔关闭等） | ✅ **已在用**（`src/components/Icon.tsx` 的 `MorphingIcon`），继续即可 |
| 6.5 | `lucide` | 已在依赖中，按需 tree-shake | 图标集 | ✅ 已在用；注意 `import { X } from 'lucide'` 应保持具名导入以利 tree-shaking |
| 6.6 | MDN CSS 性能指引 https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS | — | 合成器友好动画、减少 reflow 的原则 | ✅ **先看原则再决定要不要库** |

**总原则**：这个项目的动效需求（药丸滑动、图标变形、面板进出）**用 CSS transition/animation + 已有的 morphicons 就够了**。结论是 **不新增动效库**；若要加，只加 `auto-animate`（3.2 KB）。

---

## 9. ✅ 已成熟可直接用 vs ⚠️ 有风险 / 不建议

### 9.1 已成熟，可直接用

| 项 | 理由 |
| --- | --- |
| **`chinese-days`（pin 版本）** 作为节假日数据 | MIT、0 依赖、9.4 KB gz、2004–2026 覆盖、含调休、GitHub Action 每日自动更新 |
| **`capacitor.config.ts` → `android.adjustMarginsForEdgeToEdge: 'auto'`** | 一行、零依赖、零原生代码，直接消灭 Android 15+ 的安全区风险 |
| **`viewport-fit=cover` + `env()` 带 fallback** | 本项目**已具备**；`env(safe-area-inset-bottom, 0px)` 写法正确 |
| **`content-visibility: auto` + `contain: layout paint`** | Chrome 85+ / Safari 18.1+；零依赖、零 API；是虚拟化的正确替代 |
| **四个页面常驻挂载 + CSS 切换可见性** | 纯代码改动，直接消除切 tab 的全量重挂载 |
| **持久化写入去抖 + `pagehide` flush** | 纯代码改动，直接消掉主线程同步写 |
| **拆 Context（state / actions 分离）** | 纯代码改动，直接缩小重渲染面 |
| **`React.memo` + `useDeferredValue`** | React 18 原生能力，官方文档明确 |
| **`@formkit/auto-animate`** | 3.2 KB gz、0 依赖、13.9k★、MIT |
| **`document.startViewTransition` 渐进增强（带 feature detect + fallback）** | Android WebView 111+ 可用；iOS 需 18.1+，故必须降级路径 |

### 9.2 ⚠️ 有风险 / 不建议

| 项 | 风险 |
| --- | --- |
| **`lunar-javascript`** | 97.7 KB gz ≈ `chinese-days` 的 10 倍，且核心能力偏题 |
| **`chinese-holidays`（npm）** | 拖 `lodash`+`moment`+`request`(已 deprecated)+`request-promise-native` 4 个依赖 |
| **npm 上的 `holiday-cn`（miserylee）** | 2017 年停更的"微服务"包，**与 2175★ 的 `NateScarlet/holiday-cn` 同名不同物，极易误装** |
| **Android 上"不管 `adjustMarginsForEdgeToEdge`，纯靠 `env()`"** | Android 15 + WebView < 140 时 `env()` 返回 0 → 底栏被手势条压住 |
| **`capacitor-plugin-safe-area`（JS 读 inset 再写 CSS 变量）** | 需等 JS 启动，首帧会跳，与"满帧"目标冲突 |
| **`motion`（47.7 KB gz）** | 为动效引入近 50 KB JS 运行时，低端 WebView 上是净负担 |
| **Magic UI** | 面向 Next.js + Tailwind，与本项目 Vite + 手写 CSS 技术栈不匹配 |
| **`react-window` / `react-virtuoso` / `@tanstack/react-virtual`** | 本项目数据规模远未到虚拟化门槛，只会引入滚动/测量类新 bug |
| **`useTransition` 用在必须即时反馈的交互上** | 点击格子开面板会感觉"慢半拍" |
| **`<ViewTransition>`（React 官方组件）** | **React 19 特性，本项目 React 18 用不了** |
| **`startViewTransition` 不加 feature detect** | iOS < 18.1 直接抛错 / 白屏 |
| **在 Vite dev server 上测性能** | `StrictMode` 双调用 + 未压缩，数字无参考价值 |
| **`backdrop-filter` 浮层内部做 transform 动画** | 每帧重新采样模糊背景，Android WebView 掉帧头号原因 |

---

## 10. 附录：本次调研的证据获取方式（可复现）

- npm 元数据：`https://registry.npmjs.org/<pkg>`（版本、发布时间、license、`unpackedSize`、依赖数）。
- 真实体积：从 `cdn.jsdelivr.net` 拉 `dist` 产物 → node `zlib.gzipSync(level:9)` 现算 gzip。
  - `react-window` / `react-virtuoso` / `@tanstack/react-virtual` / `motion` / `@formkit/auto-animate` 体积来自 bundlephobia API。
- 浏览器支持：caniuse 数据集 `raw.githubusercontent.com/Fyrd/caniuse/main/features-json/<feature>.json`，用脚本取「首个稳定支持版本」。
- 官方文档正文：`raw.githubusercontent.com` 上的 MDN `content` 与 React `react.dev` 原始 markdown（比抓 HTML 干净）。
- 本项目实测：直接读 `node_modules/@capacitor/android@7.6.9` 的 Java 源码、`android/variables.gradle`、`android/app/src/main/res/values/styles.xml`、`src/**`。

**未核实正文的链接**：`webkit.org/blog/7929`（Jina Reader 被封，仅确认链接存在且为官方博文）。

**不可用后端**：`web_search`、`x_search`（modsearch 全线失败，firecrawl keyless 403）、Jina Reader（401 匿名配额封禁）。小红书 / B站 / Reddit 等需登录态平台未尝试。
