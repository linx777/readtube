# YouTube 对话成稿 Worker

一个基于 Node.js/TypeScript 开发、部署到 Cloudflare Worker 的单页应用。

输入一个带字幕的 YouTube 视频链接后，Worker 会：

1. 抓取视频元信息与字幕
2. 调用 Gemini API 生成中文对话整理稿
3. 将受限 Markdown 转成安全 HTML
4. 以 SSE 流式方式一点点推送到页面上

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：

```bash
cp .dev.vars.example .dev.vars
```

然后把 `.dev.vars` 里的 `GEMINI_API_KEY` 改成你在 Google AI Studio 申请的 key。
如果某个 Gemini 模型在你的 project 下额度为 0，可以顺手配置：

```bash
GEMINI_MODEL=gemini-2.5-flash-lite
```

3. 启动本地开发：

```bash
npm run dev
```

默认会启动一个本地 Worker 服务。

## 检查与测试

```bash
npm run check
```

## 部署到 Cloudflare Worker

先登录 Cloudflare：

```bash
npx wrangler login
```

然后部署：

```bash
npm run deploy
```

部署成功后，默认会得到一个类似下面的地址：

```text
https://xvc.<your-subdomain>.workers.dev
```

## 配置项

- `GEMINI_API_KEY`: Google AI Studio API key
- `GEMINI_MODEL`: 可选，默认 `gemini-2.5-flash-lite`

## 说明

- 页面和 API 都由同一个 Worker 提供
- 前端不直连 Gemini，API key 只保存在服务端
- 生成结果通过 `POST /api/generate` 的 SSE 事件流返回
- 当前版本不做持久化历史记录
