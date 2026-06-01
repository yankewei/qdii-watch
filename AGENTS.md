# QDII-Watch — Agent 项目指南

本文件面向 AI coding agent。如果你刚接触这个项目，请先通读本文档再修改代码。

## 项目概述

QDII-Watch 是一个监控中国大陆纳斯达克100 ETF 联接基金（QDII）申购限额状态的单页应用。

- **数据源**：天天基金网（fund.eastmoney.com）
- **监控标的**：17 只纳指100场外联接基金（基金代码和名称硬编码在 `scraper.ts` 中）
- **核心功能**：实时展示基金申购状态（开放申购 / 限额 / 暂停申购）、支持搜索/筛选/排序、支持 webhook 订阅限额变动通知

## 技术栈

- **后端 / API**：TypeScript + Cloudflare Workers（Wrangler 部署）
- **数据抓取**：Node.js + `tsx` + Cheerio
- **前端**：纯 HTML5 / CSS3 / Vanilla JS，零构建工具，单文件 `docs/index.html`
- **存储**：Cloudflare KV（`SUBSCRIPTIONS`）保存 webhook 订阅列表
- **CI / 定时任务**：GitHub Actions（每 4 小时自动抓取一次）
- **测试框架**：Vitest

## 项目结构

```
├── worker.ts                    # Worker 入口，负责路由和静态资源兜底
├── scraper.ts                   # 独立爬虫脚本，抓取基金状态并写入 docs/data/funds.json
├── functions/
│   ├── api/
│   │   ├── notify.ts            # POST /api/notify — 触发通知推送（需 Bearer Token）
│   │   ├── subscribe.ts         # POST /api/subscribe — 订阅 webhook（需 Turnstile 验证）
│   │   └── unsubscribe.ts       # POST /api/unsubscribe — 取消订阅（需 Turnstile 验证）
│   └── _shared/
│       ├── types.ts             # 共享 TypeScript 类型定义
│       ├── diff.ts              # 新旧数据变化检测逻辑
│       └── format.ts            # 状态格式化 + 飞书/钉钉/通用 webhook payload 构建
├── docs/
│   ├── index.html               # 前端页面（单页应用，零构建）
│   └── data/
│       ├── funds.json           # 爬虫输出的基金数据
│       └── changes.json         # 数据变化详情（GitHub Actions 消费）
├── tests/
│   ├── diff.test.ts             # diff 逻辑单元测试
│   ├── format.test.ts           # 格式化与 payload 构建测试
│   └── worker.test.ts           # Worker 路由与中间件测试
├── .github/workflows/scrape.yml # GitHub Actions 定时爬虫工作流
├── wrangler.jsonc               # Cloudflare Workers 部署配置
└── package.json
```

## 构建与运行命令

```bash
# 安装依赖
npm install

# 运行爬虫（生成 docs/data/funds.json）
npm run scrape

# 本地开发预览 Worker（含静态资源 + API）
npm run dev          # wrangler dev

# 仅预览静态前端（不启动 Worker）
npm run dev:static   # cd docs && python3 -m http.server 8080

# 运行测试
npm test             # vitest run

# 部署到 Cloudflare Workers
npm run deploy       # wrangler deploy
```

**本地完整开发流程示例**：
```bash
npm install && npm run scrape && npm run dev
# 访问 http://localhost:8787
```

## Worker 运行时架构

- `wrangler.jsonc` 指定 `main: "worker.ts"`，静态资源目录为 `docs`，通过 `ASSETS` binding 暴露。
- `run_worker_first: ["/api/*"]` 确保所有 `/api/*` 请求优先进入 Worker 逻辑，而非直接命中静态文件。
- `worker.ts` 仅处理 `POST` 请求，按路径分发给 `functions/api/*.ts` 中的 `onRequestPost` 处理器；其余请求全部 fallback 到 `env.ASSETS.fetch(request)`。
- API 处理器使用 `PagesFunction<Env>` 签名，但在 `worker.ts` 中手动包装为适配对象传入。

### 环境变量与 Secrets

| 名称 | 用途 | 配置方式 |
|---|---|---|
| `SUBSCRIPTIONS` | KV namespace，存储 webhook 订阅列表 | `wrangler.jsonc` 中绑定 |
| `NOTIFY_TOKEN` | `/api/notify` 接口的 Bearer Token 鉴权 | `wrangler secret put NOTIFY_TOKEN` |
| `TURNSTILE_SECRET` | Cloudflare Turnstile 服务端校验密钥 | `wrangler secret put TURNSTILE_SECRET` |

## 代码组织约定

- **模块系统**：ES Modules（`"type": "module"`）。
- **导入风格**：TypeScript 源码使用 `.ts` 后缀编写，但 `import` 语句中统一使用 `.js` 扩展名（Node16 / NodeNext 风格）。
- **函数目录约定**：`functions/api/` 下每个文件导出一个 `onRequestPost` 处理器；`functions/_shared/` 存放无状态纯工具函数和类型定义。
- **前端约定**：`docs/index.html` 是一个自包含的单文件，CSS 和 JS 全部内联，不依赖任何构建工具或外部框架。
- **注释与文案**：项目面向中文用户，代码注释、日志输出、UI 文案均为中文。新增功能时请保持中文文案。

## 数据模型核心概念

### FundData（单只基金数据）
```ts
interface FundData {
  code: string;              // 基金代码
  name: string;              // 基金名称
  company: string;           // 基金公司
  status: string;            // open | limited | suspended | unknown | error
  limitAmount: number | null;// 日累计申购限额（元）
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  yearlyReturn: number | null;
}
```

### 状态优先级（排序用）
爬虫输出默认按以下顺序排序：
`open` > `limited` > `suspended` > `unknown` > `error`
同状态下按 `limitAmount` 从小到大排序。

### 变化检测
`diff.ts` 只比较 `status` 和 `limitAmount` 两个字段。如果基金在旧数据中不存在，或在新数据中不存在，均忽略。

## 测试策略

- 使用 **Vitest**，无额外配置文件（使用默认配置）。
- 测试覆盖三层：
  1. **纯逻辑**：`diff.test.ts`、`format.test.ts`
  2. **Worker 路由层**：`worker.test.ts`（使用 `vi.fn()` mock KV 和静态资源）
- 爬虫脚本 `scraper.ts` 目前**没有**集成测试；修改后建议手动运行 `npm run scrape` 验证输出格式。

## 安全与鉴权

- `/api/subscribe` 与 `/api/unsubscribe` 强制要求 Cloudflare Turnstile token，防止机器人滥用。
- `/api/notify` 强制要求 `Authorization: Bearer <NOTIFY_TOKEN>`，防止未授权触发通知。
- webhook URL 必须 `https://` 开头；飞书/钉钉类型额外校验域名白名单。
- 爬虫请求带伪装浏览器 UA 和 Referer，但不对抗高强度反爬；若源站结构变化可能导致解析失败。

## 部署流程

### 手动部署
```bash
npm ci
npx wrangler secret put NOTIFY_TOKEN
npm run deploy
```

### 自动抓取与通知流程（GitHub Actions）
1. `.github/workflows/scrape.yml` 每 4 小时触发一次。
2. 运行 `npx tsx scraper.ts`，生成 `docs/data/funds.json`。
3. 若数据有变化：
   - 自动 `git commit` 并 `git push` 到仓库。
   - 读取 `docs/data/changes.json` 并 POST 到 `${PAGES_URL}/api/notify` 推送订阅通知。
4. 错误率超过 30% 时爬虫进程以 `exit code 1` 退出，Actions 会标记失败。

## 常见修改场景

| 场景 | 需要修改的文件 |
|---|---|
| 新增/删除监控基金 | `scraper.ts` 中的 `FUNDS` 常量 |
| 天天基金网页面结构变化 | `scraper.ts` 中的 `parseFundPage` 和 `fetchReturnRates` |
| 新增通知渠道格式 | `functions/_shared/format.ts` + `functions/api/notify.ts` |
| 前端 UI/交互调整 | `docs/index.html`（内联 CSS 和 JS） |
| API 路由变更 | `worker.ts` + 对应 `functions/api/*.ts` |
| 排序/过滤逻辑 | `docs/index.html` 的 JS 部分 + `scraper.ts` 的后端排序 |
