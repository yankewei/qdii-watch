# QDII-Watch 限额变动通知系统设计

## 背景

QDII-Watch 是一个监控纳斯达克100 ETF联接基金申购限额的工具。当前每4小时自动抓取数据并通过 Cloudflare Pages 展示静态页面。用户希望在基金限额或申购状态发生变化时，能主动收到通知，且面向所有网站访问者开放订阅。

## 目标

- 任何访问网站的用户都能一键订阅限额变动通知
- 支持飞书机器人、钉钉机器人和通用 Webhook 三种通知渠道
- 通知触发条件：基金申购状态变化（开放/限额/暂停之间切换）或限额金额变化
- 零第三方依赖（除用户自建的飞书/钉钉机器人外），完全基于 Cloudflare 生态

## 架构

```
GitHub Actions (每4小时定时触发)
  → scraper.ts 抓取天天基金网数据
  → 读取旧的 docs/data/funds.json
  → 对比新旧数据，检测变化
  → 有变化？
    → push docs/data/funds.json 到仓库（Cloudflare Pages 自动重新部署）
    → curl POST /api/notify（携带 Secret Token）

Cloudflare Pages
  ├── 静态资源 (docs/)
  │   ├── index.html          # 新增「订阅通知」面板
  │   └── data/funds.json
  └── Pages Functions (functions/api/)
      ├── subscribe.ts        # POST /api/subscribe
      ├── unsubscribe.ts      # POST /api/unsubscribe
      └── notify.ts           # POST /api/notify

Cloudflare KV
  └── key: "webhooks"
      value: 订阅列表 JSON 数组
```

## 组件设计

### 1. 前端订阅面板（docs/index.html）

在页面底部新增一个可折叠的订阅面板：

- **通知类型选择**：单选按钮，选项为「飞书」「钉钉」「通用 Webhook」
- **URL 输入框**：placeholder 根据类型动态提示对应格式
- **订阅按钮**：点击后调用 `/api/subscribe`
- **测试发送按钮**：订阅成功后可用，立即发送一条测试消息验证配置
- **取消订阅按钮**：已订阅状态下显示
- **状态提示**：显示订阅成功/失败/测试中

**localStorage 记忆**：用 `localStorage` 记录用户是否已订阅以及订阅信息，刷新页面后恢复状态显示。

### 2. Pages Functions API

#### `POST /api/subscribe`

接收用户提交的订阅信息，存入 KV。

**请求体：**
```json
{
  "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
  "type": "feishu"
}
```

- `url`：用户机器人的 webhook URL
- `type`：可选值 `feishu` | `dingtalk` | `webhook`

**校验规则：**
- URL 必须以 `https://` 开头
- URL 域名需在白名单内（防止滥用）
- 同一 URL 不重复存储

**响应：**
```json
{ "success": true }
```

#### `POST /api/unsubscribe`

从 KV 中删除指定 URL 的订阅。

**请求体：**
```json
{
  "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
}
```

#### `POST /api/notify`

由 GitHub Actions 调用，触发向所有订阅者发送通知。

**请求头：**
```
Authorization: Bearer <NOTIFY_TOKEN>
Content-Type: application/json
```

**请求体：**
```json
{
  "changes": [
    {
      "code": "016452",
      "name": "南方纳斯达克100指数发起(QDII)A",
      "company": "南方基金",
      "old": { "status": "limited", "limitAmount": 200 },
      "new": { "status": "suspended", "limitAmount": null }
    }
  ]
}
```

**处理逻辑：**
1. 验证 `Authorization` Bearer Token
2. 从 KV 读取 `webhooks` 列表
3. 遍历每个订阅，根据 `type` 组装对应格式的消息
4. 并行发送（但限制并发数，如最多 10 个同时发送）
5. 每个发送设置 10 秒超时，单个失败不影响其他
6. 返回发送统计

**响应：**
```json
{
  "sent": 5,
  "failed": 0
}
```

### 3. KV 数据结构

**Key：** `webhooks`

**Value：**
```json
[
  {
    "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
    "type": "feishu",
    "createdAt": "2026-05-30T08:00:00Z"
  },
  {
    "url": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "type": "dingtalk",
    "createdAt": "2026-05-30T08:05:00Z"
  }
]
```

### 4. scraper.ts 变化检测

在 `scraper.ts` 中新增以下逻辑（在写入 `funds.json` 之前）：

1. 尝试读取 `docs/data/funds.json`（如果存在）
2. 将旧数据按 `code` 建立索引
3. 遍历新抓取的数据，与旧数据对比：
   - `status` 字段变化
   - `limitAmount` 字段变化（包括 null ↔ number 的变化）
4. 收集所有变化到 `changes` 数组
5. 如果 `changes.length > 0`：
   - 正常写入新 `funds.json`
   - 将 `changes` 输出到 stdout 或写入临时文件，供 GitHub Actions 下一步使用

### 5. GitHub Actions 触发通知

在 `.github/workflows/scrape.yml` 中新增一步：

```yaml
- name: Trigger notifications
  if: steps.commit.outputs.changed == 'true'
  run: |
    curl -X POST "${{ vars.PAGES_URL }}/api/notify" \
      -H "Authorization: Bearer ${{ secrets.NOTIFY_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d @changes.json
```

或者将变化数据通过环境变量/文件传递。

## 消息格式

飞书和钉钉均采用**卡片/富文本**格式，视觉效果优于纯文本。

### 飞书（interactive 卡片）

```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "QDII-Watch 限额变动提醒" },
      "template": "blue"
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**南方纳斯达克100指数发起(QDII)A**\n状态：限额 200元 → 暂停申购"
        }
      },
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**招商纳斯达克100ETF发起式联接(QDII)A**\n限额：100元 → 50元"
        }
      },
      {
        "tag": "note",
        "elements": [
          { "tag": "plain_text", "content": "更新时间：2026-05-30 15:30" }
        ]
      }
    ]
  }
}
```

### 钉钉（markdown 卡片）

```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "QDII-Watch 限额变动提醒",
    "text": "#### QDII-Watch 限额变动提醒\n\n**南方纳斯达克100指数发起(QDII)A**\n> 状态：限额 200元 → 暂停申购\n\n**招商纳斯达克100ETF发起式联接(QDII)A**\n> 限额：100元 → 50元\n\n---\n更新时间：2026-05-30 15:30\n[查看详情](https://qdii-watch.xxx.pages.dev)"
  }
}
```

### 通用 Webhook

```json
{
  "title": "QDII-Watch 限额变动提醒",
  "changes": [
    {
      "code": "016452",
      "name": "南方纳斯达克100指数发起(QDII)A",
      "company": "南方基金",
      "old": { "status": "limited", "limitAmount": 200 },
      "new": { "status": "suspended", "limitAmount": null }
    }
  ],
  "updatedAt": "2026-05-30T07:30:00Z",
  "url": "https://qdii-watch.xxx.pages.dev"
}
```

## 状态变化描述规则

| 变化场景 | 描述文本 |
|---------|---------|
| 开放 → 限额 | 状态：开放申购 → 限额 N元 |
| 限额 → 开放 | 状态：限额 N元 → 开放申购 |
| 开放 → 暂停 | 状态：开放申购 → 暂停申购 |
| 限额 → 暂停 | 状态：限额 N元 → 暂停申购 |
| 暂停 → 开放 | 状态：暂停申购 → 开放申购 |
| 限额金额变化 | 限额：N元 → M元 |
| 状态不变，限额变化 | 限额：N元 → M元 |

## 安全设计

| 措施 | 说明 |
|------|------|
| Token 认证 | `/api/notify` 必须携带正确的 `Authorization: Bearer <NOTIFY_TOKEN>`，GitHub Actions 通过 Secrets 注入 |
| URL 白名单 | `/api/subscribe` 校验 URL 域名，仅允许飞书、钉钉和通用 HTTPS URL |
| 超时控制 | 单个 webhook 发送超时 10 秒，防止阻塞 |
| 错误隔离 | 单个发送失败不影响其他订阅者 |
| 防重复 | 相同 URL 不重复存储 |

## 配置步骤（一次性）

1. **创建 KV Namespace**
   ```bash
   npx wrangler kv:namespace create SUBSCRIPTIONS
   ```

2. **绑定 KV 到 Pages**
   在 `wrangler.jsonc` 中添加：
   ```jsonc
   {
     "kv_namespaces": [
       {
         "binding": "SUBSCRIPTIONS",
         "id": "<上一步输出的 id>"
       }
     ]
   }
   ```

3. **设置环境变量**
   在 Cloudflare Dashboard → Pages 项目 → Settings → Variables 中设置：
   - `NOTIFY_TOKEN`：随机字符串（如 `openssl rand -hex 32` 生成）

4. **配置 GitHub Secrets**
   在仓库 Settings → Secrets and variables → Actions 中设置：
   - `NOTIFY_TOKEN`：与 Cloudflare 环境变量相同
   - `PAGES_URL`：如 `https://qdii-watch.xxx.pages.dev`

## 改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/index.html` | 修改 | 新增订阅面板 UI 和交互逻辑 |
| `functions/api/subscribe.ts` | 新建 | 接收订阅请求，存入 KV |
| `functions/api/unsubscribe.ts` | 新建 | 取消订阅，从 KV 删除 |
| `functions/api/notify.ts` | 新建 | 接收触发请求，向所有订阅发送通知 |
| `scraper.ts` | 修改 | 新增历史数据对比和变化检测逻辑 |
| `.github/workflows/scrape.yml` | 修改 | 新增触发通知步骤 |
| `wrangler.jsonc` | 修改 | 新增 KV namespace 绑定 |
| `package.json` | 修改 | 可能新增依赖（如需要） |

## 错误处理

- **发送失败**：记录失败的 URL 和错误原因，但不中断其他发送，响应中返回 `failed` 计数
- **KV 读取失败**：返回 500，GitHub Actions workflow 标记失败（但不影响已 push 的数据）
- **Token 验证失败**：返回 401
- **URL 格式校验失败**：返回 400，前端显示具体错误
- **前端网络错误**：显示"网络异常，请稍后重试"

## 后续扩展（不在本期实现）

- 支持按基金代码筛选订阅（只通知特定基金的变化）
- 支持邮件通知（需接入邮件服务商）
- 支持 Telegram Bot 通知
- 在页面上展示「变化历史」时间线
