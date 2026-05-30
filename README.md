# QDII-Watch

监控中国大陆纳斯达克100 ETF联接基金（QDII）的申购限额情况。

## 在线访问

部署后访问：`https://qdii-watch.pages.dev`

## 功能

- 实时展示主要纳斯达克100指数场外联接基金的申购状态
- 支持按状态筛选（开放申购 / 限额 / 暂停申购）
- 支持按限额金额排序
- 支持搜索基金名称、代码、基金公司
- 移动优先的响应式设计

## 技术栈

- **数据抓取**: TypeScript + Node.js + Cheerio
- **前端**: 纯 HTML5 / CSS3 / Vanilla JS（零构建工具）
- **部署**: Cloudflare Pages（静态托管）+ GitHub Actions（定时爬虫）
- **数据源**: [天天基金网](https://fund.eastmoney.com)

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 抓取数据（生成 docs/data/funds.json）
npm run scrape

# 3. 启动本地服务器预览
npm run dev
# 访问 http://localhost:8080
```

或者一步完成：

```bash
npm install && npm run scrape && npm run dev
```

## 部署到 Cloudflare Pages

### 方式一：Git 集成（推荐）

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create a project
2. 连接 GitHub 仓库
3. Build settings：
   - **Build command**:（留空，纯静态不需要构建）
   - **Build output directory**: `docs`
4. Save and Deploy

之后每次 `git push` 到 main 分支，Cloudflare 自动重新部署。

### 方式二：Wrangler CLI

```bash
npm install -g wrangler
npx wrangler pages deploy docs --project-name=qdii-watch
```

## 定时自动更新

GitHub Actions 已配置每 4 小时自动抓取一次。抓取后如果有数据变化，会自动 push 到仓库，Cloudflare Pages 随后自动重新部署。

也可手动触发：仓库页面 → Actions → Scrape Fund Limits → Run workflow。

### 自有服务器 / NAS / 本地 cron

```bash
crontab -e
```

添加（每小时抓取一次）：

```
0 * * * * cd /path/to/qdii-watch && npm run scrape >> /tmp/qdii-watch.log 2>&1
```

然后用任何静态文件服务器托管 `docs/` 目录即可（Nginx、Caddy、Python http.server 均可）。

## 监控基金列表（17只）

| 代码 | 基金名称 | 基金公司 |
|------|---------|---------|
| 270042 | 广发纳指100ETF联接(QDII)A | 广发基金 |
| 040046 | 华安纳斯达克100ETF联接(QDII)A | 华安基金 |
| 018043 | 天弘纳斯达克100指数发起(QDII)A | 天弘基金 |
| 016532 | 嘉实纳斯达克100ETF发起联接(QDII)A | 嘉实基金 |
| 000834 | 大成纳斯达克100ETF联接(QDII)A | 大成基金 |
| 160213 | 国泰纳斯达克100指数(QDII) | 国泰基金 |
| 016452 | 南方纳斯达克100指数发起(QDII)A | 南方基金 |
| 019547 | 招商纳斯达克100ETF发起式联接(QDII)A | 招商基金 |
| 016055 | 博时纳斯达克100ETF发起式联接(QDII)A | 博时基金 |
| 539001 | 建信纳斯达克100指数(QDII)A | 建信基金 |
| 019524 | 华泰柏瑞纳斯达克100ETF发起式联接(QDII)A | 华泰柏瑞基金 |
| 161130 | 易方达纳斯达克100LOF | 易方达基金 |
| 018966 | 汇添富纳斯达克100ETF发起式联接(QDII)A | 汇添富基金 |
| 019172 | 摩根纳斯达克100指数(QDII)A | 摩根基金 |
| 019736 | 宝盈纳斯达克100指数发起(QDII)A | 宝盈基金 |
| 019441 | 万家纳斯达克100指数发起式(QDII)A | 万家基金 |
| 015299 | 华夏纳斯达克100ETF发起式联接(QDII)A | 华夏基金 |

## 免责声明

数据来源于天天基金网公开信息，仅供参考，不构成投资建议。投资有风险，入市需谨慎。
