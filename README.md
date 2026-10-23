# 武汉景点地图

[![CI](https://github.com/gptsol56/wuhan-travel-map/actions/workflows/ci.yml/badge.svg)](https://github.com/gptsol56/wuhan-travel-map/actions/workflows/ci.yml)

零构建的单页 Web 应用 + 可选的人流代理后端：在腾讯地图上呈现武汉 50 个精选景点，提供近 10 天人流参考、预约/购票信息、多方式路线规划，并可作为 PWA 离线使用。

线上地址：<https://gptsol56.github.io/wuhan-travel-map/>

## 功能特性

**地图与景点**
- 腾讯地图 GL（2D 模式），50 个景点标记 + 缩放聚合 + 标签防碰撞
- 景点弹窗：开放时间 / 建议游玩时长 / 地铁交通 / 门票 / 预约要求 / 人流等级 / 游玩贴士 / 周边推荐
- 人流热力图层（近 10 天历史热力栅格）、人流着色、聚合气泡按人流分级
- 实时路况、行政区划边界（湖北 TopoJSON 本地绘制）、自研多段测距工具、卫星底图
- 天气卡（Open-Meteo，免费无 key）

**筛选与行程**
- 筛选：三镇分区（武昌 / 汉口 / 汉阳 / 远郊）× 地铁线路（自动从交通文本提取）× 人流 × 预约类型，任意组合
- 路线规划：驾车 / 步行 / 骑行 / 公交，支持多途经点，结果带多方案卡片与逐步提示
- 精选行程一键导入：经典一日游、博物馆之旅、东湖环线、亲子半日、汉口老城漫步、木兰远郊线
- 分享链接：当前筛选 + 行程编码进 URL hash，打开即还原（`#z=汉阳&ml=6&wp=黄鹤楼→汉口江滩&mode=transit`）

**PWA / 离线**
- Service Worker 分级缓存（stale-while-revalidate + 版本化预缓存），断网刷新仍可完整使用
- 预缓存地址以注册 scope 为基准解析，域名根路径或任意子路径（如 GitHub Pages 项目页）均可正常安装

**外观**
- 四套主题循环切换：🌅 晨曦（暖色浅底）/ 🌙 夜光（深底萤火绿）/ 🌌 极光（深空蓝 + 流动极光背景）/ 💜 紫晶（紫色系）
- iOS 液态玻璃质感（多层 box-shadow 光效 + backdrop 玻璃）、弹簧动效、列表/地图/面板/弹窗全面适配

## 架构总览

```
┌────────────────────────── 浏览器 ──────────────────────────┐
│  index.html（入口，PWA）                                     │
│   ├─ dist/app.min.js     ← src/app.js        （逻辑，唯一真相源）│
│   ├─ dist/style.min.css  ← src/style.css     （样式，唯一真相源）│
│   ├─ data/spots.data.js  ← data/spots.src.json（数据，唯一真相源）│
│   └─ sw.js（Service Worker，版本化缓存）                      │
│          │                                  │               │
│   腾讯地图 JSAPI（CDN）        Open-Meteo 天气 API（免费直连）  │
└──────────┼──────────────────────────────────┼───────────────┘
           │ /api/crowd（同源，可选）
┌──────────▼──────────────────────────────────────────────────┐
│  server/（Node + Express 人流代理，可选）                     │
│   路由：/api/crowd /api/crowd/stats /health /metrics         │
│   组件：缓存 · 限流 · 熔断 · 快照兜底 · Prometheus 指标        │
│   上游：及客智能热力 API（key 只存在服务端）                    │
└─────────────────────────────────────────────────────────────┘
```

前端与后端完全解耦：不启动后端时，前端自动降级为「本地动态估算」并在 UI 如实标注，所有地图/筛选/路线功能照常可用。

## 前端详解

### 零构建管线

应用本体**不依赖任何打包器**：`index.html` 用普通 `<script defer>` 加载产物文件，双击 `index.html`（file://）也能运行。三份产物进仓库，各有唯一的真相源，由 `tools/` 下的零依赖脚本生成：

| 真相源（改这里） | 产物（浏览器加载） | 生成命令 |
|---|---|---|
| `data/spots.src.json` | `data/spots.json` + `data/spots.data.js` | `npm run build:spots` |
| `src/app.js` | `dist/app.min.js` | `npm run build:js` |
| `src/style.css` | `dist/style.min.css` | `npm run build:css` |

- `spots.data.js` 是内嵌兜底数据（file:// 打开时用），`spots.json` 走 HTTP（正常部署用），两者内容一致
- `build-js.js` / `build-css.js` 是手写压缩器（无依赖），保留 `calc()` 空白等语义敏感结构
- `npm test` 会先依次跑完三个构建再执行测试；产物与源文件不同步会被测试当场拦下

### `src/app.js` 模块划分（约 3600 行，经典 script 组织）

| 区块 | 职责 |
|---|---|
| 地图初始化 | TMap GL 2D、视野复位、指南针、缩放控件 |
| 景点渲染 | 50 个 DOM 标记 + canvas 聚合 + 标签防碰撞（实测矩形判遮挡） |
| 人流图层 | S2 栅格热力绘制、人流着色、聚合分级（后端/估算双数据源） |
| 筛选系统 | 纯函数 `applyFilters` 组合分区×地铁×人流×预约，坐标换算独立可测 |
| 路线规划 | 腾讯 WebService：驾车/步行/骑行/公交，多途经点、多方案卡片 |
| 测距工具 | 自研多段测距（每段独立标签、双击/ESC/按钮等多种退出方式） |
| 行程预设 | `ITINERARIES` 六条线路一键导入（站名与数据逐字校验） |
| 分享链接 | 筛选+行程编码进 URL hash，打开还原 |
| 主题系统 | 4 态循环（晨曦→夜光→极光→紫晶），快捷键 D，`THEME_CLASS` 映射 body 类 |
| 天气卡 | Open-Meteo 当前天气 + 降水概率 |

### 样式与主题（`src/style.css`）

- CSS 变量驱动：`:root` 为晨曦基准，`body.dark`（夜光）、`body.aurora`（极光）、`body.violet`（紫晶）逐层覆盖变量 + 组件表面规则
- 极光主题带纯 CSS 流动极光背景（`transform` 动画，零重绘）与地图滤镜（`brightness/hue-rotate`）
- iOS 液态玻璃：多层 box-shadow 高光/暗影 + `backdrop-filter` 玻璃 + 弹簧 `cubic-bezier` 动效
- 可访问性：四主题文字对比度实测全部 ≥ WCAG AA（4.5:1）；`prefers-reduced-motion` 全局降级

### Service Worker（`sw.js`）

- `VERSION` 常量版本化：任何静态资源变更必须递增版本，否则 SWR 会继续供旧缓存
- 入口 HTML 用 navigate 模式兜底，静态资源 stale-while-revalidate，断网可用
- 预缓存 URL 以 scope 为基准解析（根路径/子路径部署皆可）

## 后端详解（`server/`，可选）

Node + Express 的人流数据代理，唯一职责：把需要 API key 的及客智能热力接口藏在服务端，给前端一个无需鉴权的同源 `/api/crowd`。

### HTTP 接口

| 路由 | 说明 |
|---|---|
| `GET /api/crowd` | 人流热力栅格（S2 网格 + 分级），前端定期轮询 |
| `GET /api/crowd/stats` | 上游状态统计（缓存命中/配额/熔断状态） |
| `GET /health` | 存活探测 `{ok:true}` |
| `GET /metrics` | Prometheus 指标 |

同时托管白名单内的前端静态资源（生产可一体化部署）。

### 核心组件（`server/lib/`）

| 组件 | 职责 |
|---|---|
| `jikeClient` | 上游及客智能 API 客户端（key 从 `server/.env` 读取） |
| `cache` | TTL + LRU + 并发请求合并（同 key 只打一次上游） |
| `rateLimit` | 每 IP 限流（滑动窗口） |
| `circuit` | 上游熔断器（连续失败自动断路，半开试探恢复） |
| `snapshot` | last-good 快照：配额耗尽/上游故障时回放最近一次好数据 |
| `normalize` / `geo` | 上游数据归一化、S2 网格与距离计算 |
| `metrics` | Prometheus 指标注册表 |

未配置 key 时自动降级为 mock 数据（按景点名哈希出稳定热度），前端 UI 会如实标注「本地估算 / mock」。

### 压缩与缓存

- 异步 brotli（质量 4）+ gzip，响应带 `Vary` 头避免缓存串版本
- 环境变量（见 `server/.env.example`）：`JIKE_API_KEY`、`JIKE_API_BASE`、`CACHE_TTL_SECONDS`、`QUOTA_COOLDOWN_SECONDS` 等

## 快速开始

**① 直接打开（file://）** —— 双击 `index.html`，使用内嵌景点数据兜底（无后端人流，按本地时间估算）。

**② 任意静态服务器（推荐）**：

```bash
python -m http.server 8000     # 或 npx serve
# 打开 http://127.0.0.1:8000/index.html
```

**③ 连同人流代理一起跑（完整体验）**：

```bash
cd server
cp .env.example .env        # 填入 JIKE_API_KEY（不填则自动 mock）
npm install
npm start                   # 监听 :3000，前端与 /api/crowd 同源
```

## 数据维护

- **改景点数据**：编辑 `data/spots.src.json`（字段含 `zone` 分区、`metro` 交通文本、`reserve` 预约类型等），跑 `npm run build:spots`
- **改行程预设**：编辑 `src/app.js` 里的 `ITINERARIES`（站名必须与 spots.src.json 逐字一致，测试会校验）
- **改样式/逻辑**：只改 `src/style.css` / `src/app.js`，`dist/` 是产物；改完跑 `npm run build:*` 或直接 `npm test`（会先构建）
- **改任何静态资源**：记得递增 `sw.js` 里的 `VERSION`，否则用户端继续用旧缓存

## 测试

```bash
npm test              # 前端：3 个构建 + 411 个用例（29 个文件）
cd server && npm test # 后端：149 个用例（9 个文件）
```

前端测试（`test/frontend/`，vitest + jsdom，按职责分 6 组：`build/` `dom/` `feature/` `logic/` `map/` `ui/`）的思路是「抽真实源码执行」——直接从 `src/app.js` 文本中截取被测函数，在桩件作用域里运行，避免测试和实现各写一份造成漂移。产物同步、CSS 大括号配平、主题对比度、构建器语义（如 `calc()` 空白保留）均有专测。

## 部署

- **纯前端**：把仓库根目录的文件丢到任意静态托管即可（GitHub Pages / Vercel / Nginx），根路径与子路径都支持。本项目当前即部署在 GitHub Pages
- **带后端**：`server/` 提供 Dockerfile 与 docker-compose.yml；后端仅暴露白名单内的静态资源，`/api/crowd` 供前端同源调用，`/metrics` 输出 Prometheus 指标

## 配置与安全

- **前端地图 Key（`TMAP_KEY`，`src/app.js` 顶部）**：以前端明文形式使用，这是 JSAPI 的固有限制。请务必到[腾讯位置服务控制台](https://lbs.qq.com/)为该 Key 配置**域名白名单**，否则任何拿到源码的人都能消耗你的配额
- **后端 Key（`server/.env`）**：及客智能热力 API 的 key 只存在服务端，已被 `.gitignore` 排除；克隆后从 `.env.example` 复制填写
- 后端未配置 key 时自动降级为 mock 数据，UI 如实标注

## 许可

见 [LICENSE](LICENSE)。
