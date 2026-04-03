import { describe, expect, it } from 'vitest';

import { MarkdownBlockStream, renderMarkdownBlock, renderMarkdownDocument } from '../src/services/markdown';

describe('renderMarkdownBlock', () => {
  it('renders headings, quotes, lists, and speaker paragraphs safely', () => {
    expect(renderMarkdownBlock('# 标题')).toBe('<h1>标题</h1>');
    expect(renderMarkdownBlock('## 小节')).toBe('<h2>小节</h2>');
    expect(renderMarkdownBlock('## [00:12-03:45] 技术革命：八十年一遇的AI巅峰')).toBe(
      '<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">00:12-03:45</span></span><span class="section-title">技术革命：八十年一遇的AI巅峰</span></h2>',
    );
    expect(renderMarkdownBlock('## 技术革命：八十年一遇的AI巅峰 [00:12-03:45]')).toBe(
      '<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">00:12-03:45</span></span><span class="section-title">技术革命：八十年一遇的AI巅峰</span></h2>',
    );
    expect(renderMarkdownBlock('> 关键观点')).toBe('<blockquote><p>关键观点</p></blockquote>');
    expect(renderMarkdownBlock('- 第一条\n- 第二条')).toBe('<ul><li>第一条</li><li>第二条</li></ul>');
    expect(renderMarkdownBlock('[00:32] Jen: 这是一个问题')).toBe(
      '<div class="qa"><div class="qa-meta"><div class="qa-speaker">Jen</div><div class="qa-time"><span class="timestamp rail compact">00:32</span></div></div><div class="qa-body">这是一个问题</div></div>',
    );
    expect(renderMarkdownBlock('[00:32] 这是一个问题')).toBe(
      '<div class="qa"><div class="qa-meta"><div class="qa-time"><span class="timestamp rail compact">00:32</span></div></div><div class="qa-body">这是一个问题</div></div>',
    );
    expect(renderMarkdownBlock('欧文·詹宁斯（Owen Jennings）: 这是一个回答')).toBe(
      '<div class="qa no-time"><div class="qa-meta"><div class="qa-speaker">欧文·詹宁斯（Owen Jennings）</div></div><div class="qa-body">这是一个回答</div></div>',
    );
    expect(renderMarkdownBlock('**主持人**：这是一个问题')).toBe(
      '<div class="qa no-time"><div class="qa-meta"><div class="qa-speaker">主持人</div></div><div class="qa-body">这是一个问题</div></div>',
    );
    expect(renderMarkdownBlock('**主持人**\n这是一个问题')).toBe(
      '<div class="qa no-time"><div class="qa-meta"><div class="qa-speaker">主持人</div></div><div class="qa-body">这是一个问题</div></div>',
    );
    expect(renderMarkdownBlock('Jen: 这是一个问题')).toBe(
      '<div class="qa no-time"><div class="qa-meta"><div class="qa-speaker">Jen</div></div><div class="qa-body">这是一个问题</div></div>',
    );
  });

  it('renders heading plus following paragraph within the same block', () => {
    expect(renderMarkdownBlock('## 丑闻曝光与官方回应 [00:07-00:40]\n前国土安全部部长对此表示震惊。')).toBe(
      '<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">00:07-00:40</span></span><span class="section-title">丑闻曝光与官方回应</span></h2><p>前国土安全部部长对此表示震惊。</p>',
    );
  });

  it('escapes html', () => {
    expect(renderMarkdownBlock('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});

describe('MarkdownBlockStream', () => {
  it('flushes completed blocks only', () => {
    const stream = new MarkdownBlockStream();

    expect(stream.push('# 标题\n\n第一段')).toEqual(['<h1>标题</h1>']);
    expect(stream.push('\n\n## 小节')).toEqual(['<p>第一段</p>']);
    expect(stream.flush()).toEqual(['<h2>小节</h2>']);
  });
});

describe('renderMarkdownDocument', () => {
  it('renders multiple markdown blocks as a document', () => {
    expect(
      renderMarkdownDocument('## 脉络整理片段\n\n- 第一条\n- 第二条\n\n> 关键引语'),
    ).toBe(
      '<h2>脉络整理片段</h2><ul><li>第一条</li><li>第二条</li></ul><blockquote><p>关键引语</p></blockquote>',
    );
  });
});
