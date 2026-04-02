# YouTube Transcript Viewer Worker

一个基于 Node.js/TypeScript 开发、部署到 Cloudflare Worker 的单页应用。

输入一个带字幕的 YouTube 视频链接后，Worker 会：

1. 抓取视频元信息与字幕
2. 将原始 transcript 排版成可读的 HTML
3. 以 SSE 流式方式一点点推送到页面上

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 启动本地开发：

```bash
npm run dev
```

默认会启动一个本地 Worker 服务。

3. 打开页面并粘贴一个带字幕的 YouTube 视频链接。

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

## 说明

- 页面和 API 都由同一个 Worker 提供
- 生成结果通过 `POST /api/generate` 的 SSE 事件流返回
- 当前版本不做持久化历史记录
