const SAMPLE_URL = 'https://www.youtube.com/watch?v=xRh2sVcNXQ8';

function renderShowcaseArticle(): string {
  return `
    <div class="article-showcase">
      <p class="reader-label">AI 深度生成</p>
      <h1>效率的终极形式：<br />从转录到思想的飞跃</h1>
      <p>
        <span class="dropcap">在</span>
        数字信息爆炸的今天，视频已经成为了我们获取知识的主要载体。然而，视频的线性特质往往限制了深度检索与思考的速度。这就是为什么将视频内容“文本化”不仅仅是一个格式的转换，更是一场认知的重组。
      </p>
      <blockquote>
        <p>“文字是思想的定格，而文章则是逻辑的丝线。”</p>
      </blockquote>
      <p>
        通过先进的语义分析引擎，我们不仅能捕捉到转录中的每一个词汇，更能理解其背后的情感权重与论点结构。本文将深入探讨视频转录到主题表达的转化过程，以及它为何更适合进入可检索、可引用、可沉浸阅读的长文场域。
      </p>
      <h2>1. 语义重构的艺术</h2>
      <p>
        当我们谈论 YouTube 转录时，传统做法往往止步于文字堆砌。但“深度成文”更进一步，它能够识别出现频中的冗余信息、语气重复与跳跃表达，并将其编织为更具学术与可读性的段落节奏。
      </p>
      <p>
        这种处理方式并不抹平说话者的个性，反而会将观点最清晰、最有张力的部分提炼出来，让读者在更短时间里理解一段视频真正想表达的内容。
      </p>
    </div>
  `;
}

function renderStyles(): string {
  return `
    :root {
      --bg: #edf1f7;
      --paper: rgba(255, 255, 255, 0.92);
      --paper-strong: #ffffff;
      --line: rgba(24, 35, 67, 0.1);
      --text: #13203f;
      --muted: #66708a;
      --accent: #1f3f95;
      --accent-soft: rgba(31, 63, 149, 0.1);
      --accent-strong: #0d1f55;
      --shadow: 0 30px 70px rgba(31, 46, 92, 0.1);
      --sans: "IBM Plex Sans", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
      --serif: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif;
      color-scheme: light;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top, rgba(63, 97, 173, 0.08), transparent 26%),
        linear-gradient(180deg, #f5f7fb 0%, #eef2f7 58%, #ebeff6 100%);
      color: var(--text);
      font-family: var(--sans);
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(19, 32, 63, 0.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(19, 32, 63, 0.015) 1px, transparent 1px);
      background-size: 32px 32px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.24), transparent 88%);
      pointer-events: none;
    }

    .page {
      position: relative;
      padding: 40px 20px 88px;
    }

    .shell {
      width: min(1240px, 100%);
      margin: 0 auto;
    }

    .masthead {
      display: grid;
      gap: 26px;
      justify-items: center;
      text-align: center;
      margin-bottom: 34px;
    }

    .hero-copy {
      width: min(760px, 100%);
      display: grid;
      gap: 12px;
    }

    .hero-title {
      margin: 0;
      font: 800 clamp(40px, 5vw, 62px)/0.98 var(--sans);
      letter-spacing: -0.05em;
      color: var(--accent-strong);
    }

    .hero-title .accent {
      color: #6d7fba;
      font-style: italic;
      font-family: var(--serif);
      font-weight: 700;
    }

    .hero-subtitle {
      margin: 0 auto;
      max-width: 640px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.75;
    }

    .composer {
      width: min(840px, 100%);
      background: transparent;
      border: 0;
      box-shadow: none;
      padding: 0;
      display: grid;
      gap: 16px;
      align-content: start;
      justify-items: center;
    }

    .form {
      width: 100%;
    }

    .input-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      width: 100%;
      padding: 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(24, 35, 67, 0.06);
      box-shadow:
        0 18px 36px rgba(31, 46, 92, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(16px);
    }

    .input-shell {
      display: grid;
      gap: 4px;
      align-content: center;
      padding: 10px 10px 10px 20px;
    }

    .input-icon {
      display: none;
    }

    input[type="url"] {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--text);
      border-radius: 0;
      padding: 0;
      font: 600 18px/1.3 var(--sans);
      letter-spacing: -0.01em;
      outline: none;
    }

    .input-mirror {
      color: rgba(19, 32, 63, 0.45);
      font: 500 12px/1.4 var(--sans);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    input[type="url"]:focus {
      box-shadow: none;
      transform: none;
    }

    button {
      border: 0;
      border-radius: 999px;
      padding: 0 30px;
      min-width: 164px;
      min-height: 72px;
      background: linear-gradient(135deg, #6a95f2 0%, #4f7fe1 100%);
      color: white;
      font: 700 16px/1 var(--sans);
      cursor: pointer;
      transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
      box-shadow:
        0 14px 28px rgba(79, 127, 225, 0.28),
        inset 0 -2px 0 rgba(32, 61, 125, 0.14);
    }

    .button-secondary {
      min-width: auto;
      min-height: auto;
      padding: 0;
      background: transparent;
      color: var(--muted);
      border: 0;
      box-shadow: none;
      border-radius: 0;
      font-size: 13px;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.68;
      cursor: progress;
    }

    .status-row {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .status {
      min-height: 24px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
      text-align: center;
    }

    .cache-notice {
      display: none;
    }

    .toast {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 40;
      display: grid;
      gap: 4px;
      max-width: min(360px, calc(100vw - 32px));
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(13, 31, 85, 0.94);
      color: rgba(255, 255, 255, 0.96);
      box-shadow: 0 20px 44px rgba(13, 31, 85, 0.26);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(14px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-10px);
      transition: opacity 180ms ease, transform 180ms ease;
    }

    .toast.active {
      opacity: 1;
      transform: translateY(0);
    }

    .toast-title {
      font: 700 13px/1.4 var(--sans);
      letter-spacing: 0.02em;
    }

    .toast-body {
      font: 400 12px/1.65 var(--sans);
      color: rgba(255, 255, 255, 0.82);
    }

    .status-indicator {
      display: none;
      align-items: center;
      gap: 8px;
      min-width: 88px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(31, 63, 149, 0.08);
      border: 1px solid rgba(31, 63, 149, 0.1);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
    }

    .status-indicator.active {
      display: inline-flex;
    }

    .status-signal {
      position: relative;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: rgba(31, 63, 149, 0.12);
    }

    .status-signal::before,
    .status-signal::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 999px;
      border: 1px solid rgba(31, 63, 149, 0.24);
      animation: ping 1.8s ease-out infinite;
    }

    .status-signal::after {
      animation-delay: 0.6s;
    }

    .status-signal-dot {
      position: absolute;
      inset: 5px;
      border-radius: 999px;
      background: linear-gradient(135deg, #385fcb, #142d7b);
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
    }

    .status-bars {
      display: inline-flex;
      align-items: flex-end;
      gap: 3px;
      height: 14px;
    }

    .status-bar {
      width: 3px;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(180deg, #5174d8, #173681);
      animation: statusWave 1.1s ease-in-out infinite;
      transform-origin: bottom center;
    }

    .status-bar:nth-child(2) {
      animation-delay: 0.16s;
    }

    .status-bar:nth-child(3) {
      animation-delay: 0.32s;
    }

    .status-indicator[data-mode="writing"] .status-signal::before,
    .status-indicator[data-mode="writing"] .status-signal::after {
      border-color: rgba(140, 79, 47, 0.24);
    }

    .status-indicator[data-mode="writing"] .status-signal-dot,
    .status-indicator[data-mode="writing"] .status-bar {
      background: linear-gradient(180deg, #b07b53, #6d3e18);
    }

    .status-indicator[data-mode="done"] {
      background: rgba(56, 128, 84, 0.1);
      border-color: rgba(56, 128, 84, 0.14);
    }

    .status-indicator[data-mode="done"] .status-signal::before,
    .status-indicator[data-mode="done"] .status-signal::after {
      display: none;
    }

    .status-indicator[data-mode="done"] .status-signal-dot,
    .status-indicator[data-mode="done"] .status-bar {
      background: linear-gradient(180deg, #5aa46f, #2f6e46);
      animation-play-state: paused;
      transform: scaleY(0.7);
    }

    .hero-tools {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .fake-inline-control {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: auto;
      min-width: auto;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      font: 500 13px/1.4 var(--sans);
      box-shadow: none;
      cursor: default;
    }

    .fake-inline-control:disabled {
      opacity: 1;
      cursor: default;
    }

    .fake-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(31, 63, 149, 0.35);
      box-shadow: 0 0 0 4px rgba(31, 63, 149, 0.08);
    }

    .fake-caret {
      font-size: 11px;
    }

    .content-grid {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      gap: 28px;
      align-items: start;
    }

    .sidebar-stack {
      display: grid;
      gap: 18px;
      position: sticky;
      top: 28px;
    }

    .story-card,
    .cache-card,
    .reader-shell {
      background: var(--paper);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .story-card {
      border-radius: 26px;
      padding: 18px;
      display: grid;
      gap: 14px;
    }

    .cache-card {
      border-radius: 24px;
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    .cache-card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .cache-card-title {
      margin: 0;
      color: var(--accent-strong);
      font: 700 14px/1.2 var(--sans);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .cache-card-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .cache-list {
      display: grid;
      gap: 10px;
    }

    .cache-item {
      width: 100%;
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding: 10px;
      border: 1px solid rgba(24, 35, 67, 0.08);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.75);
      box-shadow: none;
      text-align: left;
      min-width: 0;
      min-height: 0;
    }

    .cache-item:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 14px 30px rgba(31, 46, 92, 0.08);
    }

    .cache-thumb {
      width: 72px;
      aspect-ratio: 1.2 / 0.78;
      border-radius: 10px;
      overflow: hidden;
      background: linear-gradient(140deg, rgba(8, 12, 22, 0.92), rgba(22, 31, 56, 0.9));
      border: 1px solid rgba(24, 35, 67, 0.08);
    }

    .cache-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cache-body {
      min-width: 0;
      display: grid;
      gap: 6px;
    }

    .cache-item-title {
      margin: 0;
      color: var(--accent-strong);
      font: 600 13px/1.45 var(--sans);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .cache-item-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .cache-empty {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }

    .story-cover {
      aspect-ratio: 1.18 / 0.78;
      border-radius: 18px;
      background:
        radial-gradient(circle at 76% 20%, rgba(255, 224, 156, 0.85), transparent 16%),
        linear-gradient(140deg, rgba(8, 12, 22, 0.92), rgba(22, 31, 56, 0.9) 46%, rgba(113, 84, 54, 0.88));
      position: relative;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
    }

    .story-cover.has-image {
      background: #172033;
    }

    .story-cover img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      opacity: 0;
      transition: opacity 240ms ease;
    }

    .story-cover.has-image img {
      opacity: 1;
    }

    .story-cover.has-image::before,
    .story-cover.has-image::after {
      display: none;
    }

    .story-cover.has-image .story-cover-scrim {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(10, 14, 24, 0.06), rgba(10, 14, 24, 0.26)),
        linear-gradient(0deg, rgba(10, 14, 24, 0.32), rgba(10, 14, 24, 0));
      pointer-events: none;
    }

    .story-cover::before {
      content: "";
      position: absolute;
      left: 14%;
      bottom: 0;
      width: 42%;
      height: 56%;
      border-radius: 10px 10px 0 0;
      background: linear-gradient(180deg, #10182a, #02050d);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.06);
    }

    .story-cover::after {
      content: "";
      position: absolute;
      right: 17%;
      bottom: 18%;
      width: 16%;
      height: 38%;
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(20,28,47,0.9), rgba(8,11,18,0.96));
      box-shadow:
        -84px 70px 0 -18px rgba(215, 181, 107, 0.9),
        -84px 46px 0 -20px rgba(255, 227, 170, 0.82);
    }

    .story-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .story-tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--accent);
      background: rgba(31, 63, 149, 0.08);
    }

    .story-title {
      margin: 0;
      font: 700 28px/1.14 var(--serif);
      letter-spacing: -0.03em;
      color: var(--accent-strong);
    }

    .story-summary {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.75;
    }

    .story-meta {
      display: flex;
      align-items: center;
      padding-top: 4px;
    }

    .story-meta-text {
      min-width: 0;
    }

    .story-meta-title {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-strong);
    }

    .story-meta-subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }

    .article-wrap {
      margin-top: 0;
      border-radius: 0;
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;
      backdrop-filter: none;
    }

    .reader-shell {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.95), rgba(251,253,255,0.98)),
        linear-gradient(90deg, rgba(31,63,149,0.025), transparent 16%, transparent 84%, rgba(31,63,149,0.025));
      border-radius: 28px;
      min-height: 760px;
      padding: 26px 26px 40px;
    }

    .article {
      width: min(760px, calc(100% - 20px));
      margin: 0 auto;
      font-family: var(--serif);
      font-size: 18px;
      line-height: 1.95;
      color: var(--text);
    }

    .article > * {
      opacity: 0;
      transform: translateY(18px);
      animation: rise 480ms ease forwards;
    }

    .article h1,
    .article h2 {
      margin: 0;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #1d140e;
    }

    .article h1 {
      margin-bottom: 20px;
      font-size: clamp(34px, 5vw, 54px);
      line-height: 1.08;
    }

    .article h1 + p {
      margin-top: -4px;
      margin-bottom: 28px;
      font-family: var(--sans);
      color: var(--muted);
      font-size: 15px;
      line-height: 1.8;
      letter-spacing: 0.02em;
    }

    .article .transcript-kicker {
      margin-top: -4px;
      margin-bottom: 28px;
      font-family: var(--sans);
      color: var(--muted);
      font-size: 15px;
      line-height: 1.8;
      letter-spacing: 0.02em;
    }

    .article .reader-label {
      margin: 0 0 10px;
      color: var(--muted);
      font-family: var(--sans);
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .article h2 {
      margin-top: 52px;
      margin-bottom: 14px;
      font-size: clamp(24px, 3.2vw, 32px);
      line-height: 1.26;
    }

    .article .section-heading {
      display: grid;
      grid-template-columns: 108px minmax(0, 1fr);
      align-items: start;
      gap: 18px;
    }

    .article .timestamp {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(140, 79, 47, 0.1);
      color: var(--accent);
      font-family: var(--sans);
      font-size: 12px;
      line-height: 1;
      letter-spacing: 0.06em;
      white-space: nowrap;
      vertical-align: middle;
    }

    .article .timestamp-link {
      text-decoration: none;
      cursor: pointer;
      transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }

    .article .timestamp-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(31, 63, 149, 0.08);
      background: rgba(31, 63, 149, 0.12);
    }

    .article .timestamp.rail {
      position: relative;
      min-width: 88px;
      justify-content: center;
      border: 1px solid rgba(140, 79, 47, 0.16);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
    }

    .article .timestamp.compact {
      padding: 4px 8px;
      font-size: 11px;
      min-width: 72px;
    }

    .article .timestamp.ghost {
      opacity: 0;
    }

    .article p {
      margin: 0 0 20px;
    }

    .article .dropcap {
      float: left;
      margin: 6px 12px 0 0;
      color: var(--accent-strong);
      font-family: var(--sans);
      font-size: 68px;
      line-height: 0.82;
      font-weight: 800;
    }

    .article .qa {
      display: grid;
      grid-template-columns: 84px 80px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      margin: 0 0 18px;
      padding: 12px 0;
      border-top: 1px solid rgba(33, 24, 17, 0.06);
      font-family: var(--sans);
      font-size: 16px;
      line-height: 1.9;
    }

    .article .qa:first-of-type {
      margin-top: 6px;
    }

    .article .qa-time {
      position: relative;
      padding-top: 1px;
    }

    .article .qa-time::after {
      content: "";
      position: absolute;
      top: 34px;
      bottom: -18px;
      left: 50%;
      width: 1px;
      background: linear-gradient(180deg, rgba(140, 79, 47, 0.2), rgba(140, 79, 47, 0));
      transform: translateX(-50%);
    }

    .article .qa:last-child .qa-time::after {
      display: none;
    }

    .article .qa-speaker {
      color: var(--accent);
      font-weight: 700;
      font-family: var(--sans);
      letter-spacing: 0.01em;
      padding-top: 3px;
    }

    .article .qa-body {
      min-width: 0;
    }

    .article .transcript-line {
      grid-template-columns: 84px minmax(0, 1fr);
    }

    .article .transcript-line .qa-time::after {
      bottom: -14px;
    }

    .article .transcript-body {
      font-family: var(--serif);
      font-size: 17px;
      line-height: 1.95;
      color: var(--text);
    }

    .article blockquote {
      margin: 30px 0;
      padding: 18px 20px;
      border-left: 3px solid rgba(140, 79, 47, 0.55);
      background: linear-gradient(135deg, rgba(140,79,47,0.08), rgba(140,79,47,0.03));
      border-radius: 0 18px 18px 0;
    }

    .article blockquote p {
      margin: 0;
      font-size: 19px;
      line-height: 1.9;
    }

    .article ul {
      margin: 20px 0 24px;
      padding-left: 1.2em;
    }

    .article li {
      margin-bottom: 12px;
    }

    .article code {
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      font-size: 0.9em;
      padding: 0.12em 0.32em;
      border-radius: 6px;
      background: rgba(33, 24, 17, 0.06);
    }

    .workbench {
      width: min(760px, calc(100% - 20px));
      margin: 0 auto 28px;
      display: none;
      gap: 14px;
    }

    .workbench.active {
      display: grid;
    }

    .workbench-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      font-family: var(--sans);
      color: var(--muted);
    }

    .workbench-title {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .workbench-note {
      font-size: 13px;
      line-height: 1.6;
    }

    .workbench-list {
      display: grid;
      gap: 14px;
    }

    .work-note {
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid rgba(33, 24, 17, 0.08);
      background: linear-gradient(180deg, rgba(251, 247, 240, 0.92), rgba(255, 252, 247, 0.98));
      font-family: var(--sans);
      color: var(--text);
    }

    .work-note-meta {
      margin-bottom: 10px;
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .work-note h2 {
      margin-top: 14px;
      margin-bottom: 8px;
      font-family: var(--sans);
      font-size: 18px;
      line-height: 1.5;
    }

    .work-note ul {
      margin: 10px 0 0;
      padding-left: 18px;
    }

    .work-note li,
    .work-note p {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 1.75;
    }

    .empty {
      width: min(760px, calc(100% - 20px));
      margin: 80px auto 0;
      text-align: center;
      color: var(--muted);
      font: 500 15px/1.8 var(--sans);
    }

    .empty.hidden {
      display: none;
    }

    .article-showcase {
      opacity: 1;
      transform: none;
    }

    .error {
      margin-top: 6px;
      color: #8c1f1f;
    }

    .fineprint {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }

    @keyframes rise {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes statusWave {
      0%, 100% {
        transform: scaleY(0.35);
        opacity: 0.45;
      }

      50% {
        transform: scaleY(1);
        opacity: 1;
      }
    }

    @keyframes ping {
      0% {
        transform: scale(0.85);
        opacity: 0.6;
      }

      100% {
        transform: scale(1.9);
        opacity: 0;
      }
    }

    @media (max-width: 920px) {
      .page {
        padding-top: 24px;
      }

      .content-grid {
        grid-template-columns: 1fr;
      }

      .sidebar-stack {
        position: static;
      }
    }

    @media (max-width: 640px) {
      .page {
        padding-left: 14px;
        padding-right: 14px;
      }

      .toast {
        top: 14px;
        right: 14px;
        left: 14px;
        max-width: none;
      }

      .composer {
        width: 100%;
      }

      .input-row {
        grid-template-columns: 1fr;
        padding: 10px;
      }

      button {
        min-height: 58px;
        min-width: 0;
      }

      .reader-shell {
        padding: 20px 14px 28px;
      }

      .article {
        width: min(100%, calc(100% - 10px));
        font-size: 17px;
      }

      .hero-title {
        font-size: 36px;
      }

      .hero-tools {
        gap: 12px;
      }

      .article .section-heading {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .article .section-rail {
        display: block;
      }

      .article .qa {
        grid-template-columns: 1fr;
        gap: 8px;
      }

      .article .qa-time::after {
        display: none;
      }

      .article .qa-speaker {
        padding-top: 0;
      }

      .workbench {
        width: min(100%, calc(100% - 10px));
      }
    }
  `;
}

function renderScript(): string {
  return `
    const TRANSCRIPT_CACHE_PREFIX = 'xvc:transcript:';
    const TRANSCRIPT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const form = document.querySelector('[data-form]');
    const input = document.querySelector('[data-input]');
    const inputMirror = document.querySelector('[data-input-mirror]');
    const button = document.querySelector('[data-submit]');
    const mockButton = document.querySelector('[data-mock-submit]');
    const statusRow = document.querySelector('[data-status-row]');
    const status = document.querySelector('[data-status]');
    const statusIndicator = document.querySelector('[data-status-indicator]');
    const toast = document.querySelector('[data-toast]');
    const toastTitle = document.querySelector('[data-toast-title]');
    const toastBody = document.querySelector('[data-toast-body]');
    const article = document.querySelector('[data-article]');
    const empty = document.querySelector('[data-empty]');
    const error = document.querySelector('[data-error]');
    const sideTitle = document.querySelector('[data-side-title]');
    const sideSummary = document.querySelector('[data-side-summary]');
    const sideTags = document.querySelector('[data-side-tags]');
    const sideThumb = document.querySelector('[data-side-thumb]');
    const sideCover = document.querySelector('[data-side-cover]');
    const sideMetaTitle = document.querySelector('[data-side-meta-title]');
    const sideMetaSubtitle = document.querySelector('[data-side-meta-subtitle]');
    const cacheList = document.querySelector('[data-cache-list]');
    const cacheCount = document.querySelector('[data-cache-count]');
    const workbench = document.querySelector('[data-workbench]');
    const workbenchList = document.querySelector('[data-workbench-list]');
    const workbenchNote = document.querySelector('[data-workbench-note]');

    let currentController = null;
    let currentVideoId = '';
    let hasArticleContent = false;
    let toastTimer = null;
    let suppressCacheHitToast = false;

    function extractVideoId(input) {
      const trimmed = (input || '').trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
      }

      const match = trimmed.match(/(?:v=|\\/|v\\/|embed\\/|watch\\?.*v=|youtu\\.be\\/|watch\\?.*vi?=|\\/embed\\/|vi?\\/)([a-zA-Z0-9_-]{11})/i);
      return match && match[1] ? match[1] : '';
    }

    function getTranscriptCacheKey(videoId) {
      return TRANSCRIPT_CACHE_PREFIX + videoId;
    }

    function readCachedTranscript(videoId) {
      if (!videoId) {
        return null;
      }

      try {
        const raw = localStorage.getItem(getTranscriptCacheKey(videoId));
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw);
        const bundle = parsed && typeof parsed === 'object' && parsed.bundle ? parsed.bundle : parsed;
        const cachedAt =
          parsed && typeof parsed === 'object' && typeof parsed.cachedAt === 'number'
            ? parsed.cachedAt
            : 0;

        if (!bundle || bundle.videoId !== videoId) {
          localStorage.removeItem(getTranscriptCacheKey(videoId));
          return null;
        }

        if (!cachedAt || Date.now() - cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
          localStorage.removeItem(getTranscriptCacheKey(videoId));
          return null;
        }

        return bundle;
      } catch {
        try {
          localStorage.removeItem(getTranscriptCacheKey(videoId));
        } catch {}
        return null;
      }
    }

    function writeCachedTranscript(bundle) {
      if (!bundle || !bundle.videoId) {
        return;
      }

      try {
        localStorage.setItem(
          getTranscriptCacheKey(bundle.videoId),
          JSON.stringify({
            cachedAt: Date.now(),
            bundle,
          }),
        );
      } catch {}

      renderCachedTranscriptList();
    }

    function escapeHtmlText(input) {
      return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getCachedTranscriptEntries() {
      const entries = [];

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(TRANSCRIPT_CACHE_PREFIX)) {
          continue;
        }

        try {
          const raw = localStorage.getItem(key);
          if (!raw) {
            continue;
          }

          const parsed = JSON.parse(raw);
          const bundle = parsed && typeof parsed === 'object' && parsed.bundle ? parsed.bundle : parsed;
          const cachedAt =
            parsed && typeof parsed === 'object' && typeof parsed.cachedAt === 'number'
              ? parsed.cachedAt
              : 0;

          if (!bundle || !bundle.videoId || !bundle.sourceTitle) {
            localStorage.removeItem(key);
            continue;
          }

          if (!cachedAt || Date.now() - cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
            localStorage.removeItem(key);
            continue;
          }

          entries.push({
            videoId: bundle.videoId,
            youtubeUrl: 'https://www.youtube.com/watch?v=' + bundle.videoId,
            title: bundle.sourceTitle,
            author: bundle.sourceAuthor || '',
            thumbnailUrl: bundle.thumbnailUrl || '',
            cachedAt,
            bundle,
          });
        } catch {
          localStorage.removeItem(key);
        }
      }

      return entries.sort((left, right) => right.cachedAt - left.cachedAt);
    }

    function renderCachedTranscriptList() {
      const entries = getCachedTranscriptEntries();
      cacheCount.textContent = entries.length ? String(entries.length) : '0';

      if (!entries.length) {
        cacheList.innerHTML = '<div class="cache-empty">还没有本地缓存的视频。生成过一次后，这里会出现可直接打开的 transcript。</div>';
        return;
      }

      cacheList.innerHTML = entries.map((entry) => {
        const thumb = entry.thumbnailUrl
          ? '<div class="cache-thumb"><img src="' + escapeHtmlText(entry.thumbnailUrl) + '" alt="' + escapeHtmlText(entry.title) + ' 缩略图" loading="lazy" referrerpolicy="no-referrer" /></div>'
          : '<div class="cache-thumb"></div>';

        return (
          '<button type="button" class="cache-item" data-cache-video="' + escapeHtmlText(entry.videoId) + '">' +
            thumb +
            '<div class="cache-body">' +
              '<p class="cache-item-title">' + escapeHtmlText(entry.title) + '</p>' +
              '<div class="cache-item-meta">' +
                (entry.author ? '<span>' + escapeHtmlText(entry.author) + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</button>'
        );
      }).join('');
    }

    function setBusy(active, mode) {
      statusRow.dataset.busy = active ? 'true' : 'false';
      if (active) {
        statusIndicator.classList.add('active');
        statusIndicator.dataset.mode = mode || 'fetching';
      } else {
        statusIndicator.classList.remove('active');
        statusIndicator.dataset.mode = mode || 'idle';
      }
    }

    function setStatus(text, options) {
      status.textContent = text || '';
      if (options && typeof options.busy === 'boolean') {
        setBusy(options.busy, options.mode);
      } else if (!text) {
        setBusy(false, 'idle');
      }
    }

    function setError(text) {
      error.textContent = text || '';
    }

    function syncInputMirror() {
      inputMirror.textContent = (input.value || '').trim() || 'https://www.youtube.com/watch?v=...';
    }

    function showToast(title, body) {
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }

      toastTitle.textContent = title || '';
      toastBody.textContent = body || '';
      toast.classList.add('active');

      toastTimer = setTimeout(() => {
        toast.classList.remove('active');
        toastTimer = null;
      }, 2600);
    }

    function setLoading(loading) {
      button.disabled = loading;
      mockButton.disabled = loading;
      button.textContent = loading ? '生成中...' : '生成文章';
      mockButton.textContent = loading ? 'Mock 中...' : '载入 Mock';
      if (!loading) {
        setBusy(false, 'idle');
      }
    }

    async function startStream(endpoint, body, options) {
      setError('');
      resetArticle();
      setStatus('准备开始...', { busy: true, mode: 'fetching' });
      suppressCacheHitToast = Boolean(options && options.suppressCacheHitToast);

      if (currentController) {
        currentController.abort();
      }

      currentController = new AbortController();
      setLoading(true);

      try {
        const requestBody = body ? { ...body } : {};
        if (endpoint === '/api/generate') {
          const videoId = extractVideoId(requestBody.youtubeUrl || '');
          const cachedTranscript = readCachedTranscript(videoId);
          if (cachedTranscript) {
            requestBody.cachedTranscript = cachedTranscript;
          }
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: currentController.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || '请求失败');
        }

        await consumeSse(response);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : '请求失败，请稍后再试。');
          setStatus('生成中断', { busy: false, mode: 'idle' });
        } else {
          setStatus('已停止', { busy: false, mode: 'idle' });
        }
      } finally {
        setLoading(false);
      }
    }

    function resetArticle() {
      article.innerHTML = '';
      empty.classList.remove('hidden');
      workbench.classList.remove('active');
      workbenchList.innerHTML = '';
      workbenchNote.textContent = '长视频模式下，这里会先出现分段整理中的编辑笔记。';
      sideTitle.textContent = '深度解读：人工智能如何在 2024 重塑内容创作领域';
      sideSummary.textContent = '从转录、抽取到深度成文，一条视频如何被整理成可检索、可引用、可沉浸阅读的文章界面。';
      sideTags.innerHTML = '<span class="story-tag">AI PROCESSING</span><span class="story-tag">TECHNOLOGY</span>';
      sideThumb.removeAttribute('src');
      sideThumb.alt = '';
      sideCover.classList.remove('has-image');
      currentVideoId = '';
      sideMetaTitle.textContent = '';
      sideMetaSubtitle.textContent = '';
      hasArticleContent = false;
      setBusy(false, 'idle');
      renderCachedTranscriptList();
    }

    function setSideTags(tags) {
      sideTags.innerHTML = '';
      for (const tag of tags) {
        const element = document.createElement('span');
        element.className = 'story-tag';
        element.textContent = tag;
        sideTags.appendChild(element);
      }
    }

    function setSideThumbnail(payload) {
      const thumbnailUrl =
        payload.thumbnailUrl ||
        (payload.videoId ? 'https://i.ytimg.com/vi/' + payload.videoId + '/hqdefault.jpg' : '');

      if (!thumbnailUrl) {
        sideThumb.removeAttribute('src');
        sideThumb.alt = '';
        sideCover.classList.remove('has-image');
        return;
      }

      sideThumb.src = thumbnailUrl;
      sideThumb.alt = payload.sourceTitle ? payload.sourceTitle + ' 缩略图' : 'YouTube 缩略图';
      sideCover.classList.add('has-image');
    }

    function timestampToSeconds(label) {
      const primary = (label || '').split('-')[0].trim();
      const parts = primary.split(':').map((part) => Number.parseInt(part, 10));
      if (parts.some((part) => Number.isNaN(part))) {
        return null;
      }

      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }

      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }

      return null;
    }

    function enhanceTimestampLinks(root) {
      if (!currentVideoId || !root) {
        return;
      }

      const timestamps = root.querySelectorAll('.timestamp:not([data-linked])');
      for (const stamp of timestamps) {
        if (stamp.classList.contains('ghost')) {
          stamp.dataset.linked = 'true';
          continue;
        }

        const label = stamp.textContent ? stamp.textContent.trim() : '';
        const seconds = timestampToSeconds(label);
        if (seconds == null) {
          stamp.dataset.linked = 'true';
          continue;
        }

        const anchor = document.createElement('a');
        anchor.href = 'https://www.youtube.com/watch?v=' + currentVideoId + '&t=' + seconds + 's';
        anchor.target = '_blank';
        anchor.rel = 'noreferrer noopener';
        anchor.className = stamp.className + ' timestamp-link';
        anchor.textContent = label;
        anchor.dataset.linked = 'true';
        stamp.replaceWith(anchor);
      }
    }

    function renderMeta(payload) {
      if (payload.statusText) {
        const mode =
          payload.stage === 'writing'
            ? 'writing'
            : payload.stage === 'complete'
              ? 'done'
              : 'fetching';
        setStatus(payload.statusText, { busy: payload.stage !== 'complete', mode });
      }

      if (!payload.sourceTitle) {
        return;
      }

      if (payload.videoId) {
        currentVideoId = payload.videoId;
        enhanceTimestampLinks(article);
      }

      sideTitle.textContent = payload.sourceTitle;
      sideSummary.textContent = '';
      setSideThumbnail(payload);
      sideMetaTitle.textContent = payload.sourceAuthor || 'Transcript Engine';
      sideMetaSubtitle.textContent = '';
      setSideTags([
        payload.usedCompression ? 'LONGFORM' : 'TRANSCRIPT',
        (payload.sourceLanguageCode || 'lang').toUpperCase(),
        payload.isAutoGenerated ? 'AUTO SUB' : 'MANUAL SUB',
      ]);
    }

    function appendHtml(html, target) {
      if (!html) return;
      if (target === 'notes') {
        workbench.classList.add('active');
        empty.classList.add('hidden');
        workbenchList.insertAdjacentHTML('beforeend', html);
        return;
      }

      empty.classList.add('hidden');
      hasArticleContent = true;
      article.insertAdjacentHTML('beforeend', html);
      enhanceTimestampLinks(article);
    }

    function parseSseChunk(chunk) {
      const event = { event: 'message', data: '' };
      const lines = chunk.split(/\\r?\\n/).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('event:')) {
          event.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          event.data += line.slice(5).trimStart();
        }
      }
      return event;
    }

    function takeSseFrame(buffer) {
      const match = buffer.match(/\\r?\\n\\r?\\n/);
      if (!match || match.index == null) {
        return null;
      }

      return {
        frame: buffer.slice(0, match.index),
        rest: buffer.slice(match.index + match[0].length),
      };
    }

    async function consumeSse(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let extracted = takeSseFrame(buffer);
        while (extracted) {
          const frame = extracted.frame;
          buffer = extracted.rest;
          if (!frame.trim()) continue;

          const parsed = parseSseChunk(frame);
          if (!parsed.data) continue;

          let payload;
          try {
            payload = JSON.parse(parsed.data);
          } catch {
            extracted = takeSseFrame(buffer);
            continue;
          }

          if (parsed.event === 'meta') {
            renderMeta(payload);
            if (payload.stage === 'cache_hit') {
              if (!suppressCacheHitToast) {
                showToast('已读取本地缓存', '这个视频的字幕已存在于 localhost，本次优先使用本地缓存。');
              }
              suppressCacheHitToast = false;
            }
            if (payload.stage === 'transcript_ready') {
              setStatus('字幕已就绪，正在排版正文', { busy: true, mode: 'writing' });
            } else if (payload.stage === 'preview_ready') {
              setStatus('首批字幕已就绪，正在继续抓取完整字幕', { busy: true, mode: 'fetching' });
            } else if (payload.stage === 'compressing') {
              workbench.classList.add('active');
              workbenchNote.textContent = '正在逐段整理长视频内容，下面会边处理边显示阶段性笔记。';
            } else if (payload.stage === 'writing') {
              workbenchNote.textContent = '脉络整理已完成，下面保留的是刚才生成过程中的阶段性笔记。';
            } else if (payload.stage === 'complete') {
              workbenchNote.textContent = '阶段性编辑笔记保留在这里，方便与最终正文对照。';
            }
          } else if (parsed.event === 'html') {
            appendHtml(payload.html, payload.target);
          } else if (parsed.event === 'cache') {
            writeCachedTranscript(payload.bundle);
          } else if (parsed.event === 'error') {
            setError(payload.message || '生成失败，请稍后重试。');
            setBusy(false, 'idle');
          } else if (parsed.event === 'done') {
            setStatus('', { busy: false, mode: 'done' });
          }

          extracted = takeSseFrame(buffer);
        }
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await startStream('/api/generate', { youtubeUrl: input.value.trim() });
    });

    input.addEventListener('input', () => {
      syncInputMirror();
    });

    cacheList.addEventListener('click', async (event) => {
      const trigger = event.target.closest('[data-cache-video]');
      if (!trigger) {
        return;
      }

      const videoId = trigger.getAttribute('data-cache-video');
      const cachedTranscript = readCachedTranscript(videoId || '');
      if (!cachedTranscript) {
        renderCachedTranscriptList();
        return;
      }

      const youtubeUrl = 'https://www.youtube.com/watch?v=' + cachedTranscript.videoId;
      input.value = youtubeUrl;
      await startStream('/api/generate', {
        youtubeUrl,
        cachedTranscript,
      }, {
        suppressCacheHitToast: true,
      });
    });

    mockButton.addEventListener('click', async () => {
      await startStream('/api/mock-generate', { youtubeUrl: input.value.trim() });
    });

    renderCachedTranscriptList();
    syncInputMirror();
  `;
}

export function renderAppPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YouTube 对话成稿</title>
    <meta
      name="description"
      content="输入一个带字幕的 YouTube 链接，基于字幕流式生成一篇中文对话整理稿。"
    />
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main class="page">
      <div class="toast" data-toast aria-live="polite" aria-atomic="true">
        <div class="toast-title" data-toast-title></div>
        <div class="toast-body" data-toast-body></div>
      </div>
      <div class="shell">
        <section class="masthead">
          <div class="hero-copy">
            <h1 class="hero-title">让视频内容<span class="accent">跃然纸上</span></h1>
            <p class="hero-subtitle">
              将 YouTube 转录和无缝转换为排版精美的深度文章。专为追求阅读质感的创作者与读者打造。
            </p>
          </div>

          <div class="composer">
            <form class="form" data-form>
              <div class="input-row">
                <div class="input-shell">
                  <input
                    id="youtube-url"
                    data-input
                    name="youtubeUrl"
                    type="url"
                    required
                    value="${SAMPLE_URL}"
                    placeholder="粘贴 YouTube 视频链接..."
                  />
                  <div class="input-mirror" data-input-mirror>${SAMPLE_URL}</div>
                </div>
                <button type="submit" data-submit>生成文章</button>
              </div>
            </form>

            <div class="hero-tools">
              <button type="button" class="fake-inline-control" disabled>
                <span class="fake-dot"></span>
                <span>配置 Gemini AI 密钥</span>
                <span class="fake-caret">⌄</span>
              </button>
              <button type="button" class="button-secondary" data-mock-submit>载入 Mock 数据</button>
            </div>

            <div class="status-row" data-status-row>
              <div class="status-indicator" data-status-indicator data-mode="idle" aria-hidden="true">
                <span class="status-signal"><span class="status-signal-dot"></span></span>
                <span class="status-bars">
                  <span class="status-bar"></span>
                  <span class="status-bar"></span>
                  <span class="status-bar"></span>
                </span>
              </div>
              <div class="status" data-status>等待输入</div>
            </div>
            <div class="status error" data-error></div>
          </div>
        </section>

        <section class="content-grid">
          <aside class="sidebar-stack">
            <section class="story-card">
              <div class="story-cover" data-side-cover>
                <img data-side-thumb loading="lazy" referrerpolicy="no-referrer" />
                <div class="story-cover-scrim"></div>
              </div>
              <div class="story-tags" data-side-tags>
                <span class="story-tag">AI PROCESSING</span>
                <span class="story-tag">TECHNOLOGY</span>
              </div>
              <h2 class="story-title" data-side-title>深度解读：人工智能如何在 2024 重塑内容创作领域</h2>
              <p class="story-summary" data-side-summary>
                从转录、抽取到深度成文，一条视频如何被整理成可检索、可引用、可沉浸阅读的文章界面。
              </p>
              <div class="story-meta">
                <div class="story-meta-text">
                  <p class="story-meta-title" data-side-meta-title></p>
                  <p class="story-meta-subtitle" data-side-meta-subtitle></p>
                </div>
              </div>
            </section>

            <section class="cache-card">
              <div class="cache-card-head">
                <h3 class="cache-card-title">最近浏览</h3>
                <div class="cache-card-meta"><span data-cache-count>0</span> 个视频</div>
              </div>
              <div class="cache-list" data-cache-list>
                <div class="cache-empty">还没有本地缓存的视频。生成过一次后，这里会出现可直接打开的 transcript。</div>
              </div>
            </section>
          </aside>

          <section class="article-wrap">
            <div class="reader-shell">
            <section class="workbench" data-workbench>
              <div class="workbench-head">
                <p class="workbench-title">Editor Notes</p>
                <div class="workbench-note" data-workbench-note>
                  长视频模式下，这里会先出现分段整理中的编辑笔记。
                </div>
              </div>
              <div class="workbench-list" data-workbench-list></div>
            </section>

            <article class="article" data-article>${renderShowcaseArticle()}</article>
            <div class="empty hidden" data-empty>
              文章还没有开始生成。输入链接后，页面会先显示源视频信息与字幕预览，再逐段插入标题、导语、小节和重点引语。
            </div>
            </div>
          </section>
        </section>
      </div>
    </main>
    <script type="module">${renderScript()}</script>
  </body>
</html>`;
}
