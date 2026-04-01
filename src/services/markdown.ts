function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInlineMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderTimestamp(timestamp: string, compact = false): string {
  const className = compact ? 'timestamp rail compact' : 'timestamp rail';
  return `<span class="${className}">${escapeHtml(timestamp)}</span>`;
}

function renderSpeakerParagraph(content: string): string | null {
  const match = content.match(/^(?:\[([0-9:]+(?:-[0-9:]+)?)\]\s*)?([A-Za-z\u4e00-\u9fa5]{1,16})[：:]\s*(.+)$/s);
  if (!match) {
    return null;
  }

  const timestamp = match[1];
  const speaker = match[2];
  const body = match[3];
  return `<div class="qa"><div class="qa-time">${timestamp ? renderTimestamp(timestamp, true) : '<span class="timestamp rail compact ghost">--:--</span>'}</div><div class="qa-speaker">${escapeHtml(speaker)}</div><div class="qa-body">${renderInlineMarkdown(body)}</div></div>`;
}

function renderParagraph(lines: string[]): string {
  const content = lines.join(' ').trim();
  const speaker = renderSpeakerParagraph(content);
  if (speaker) {
    return speaker;
  }

  return `<p>${renderInlineMarkdown(content)}</p>`;
}

function renderBlockquote(lines: string[]): string {
  const content = lines.map((line) => line.replace(/^>\s?/, '').trim()).join(' ');
  return `<blockquote><p>${renderInlineMarkdown(content)}</p></blockquote>`;
}

function renderList(lines: string[]): string {
  const items = lines
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter(Boolean)
    .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
    .join('');

  return `<ul>${items}</ul>`;
}

function renderHeading(line: string): string | null {
  if (line.startsWith('# ')) {
    return `<h1>${renderInlineMarkdown(line.slice(2).trim())}</h1>`;
  }

  if (line.startsWith('## ')) {
    const content = line.slice(3).trim();
    const match = content.match(/^\[([0-9:]+(?:-[0-9:]+)?)\]\s*(.+)$/);
    if (match) {
      return `<h2 class="section-heading"><span class="section-rail">${renderTimestamp(match[1])}</span><span class="section-title">${renderInlineMarkdown(match[2])}</span></h2>`;
    }

    return `<h2>${renderInlineMarkdown(content)}</h2>`;
  }

  return null;
}

export function renderMarkdownBlock(block: string): string {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return '';
  }

  const heading = renderHeading(lines[0]);
  if (heading && lines.length === 1) {
    return heading;
  }

  if (lines.every((line) => line.startsWith('>'))) {
    return renderBlockquote(lines);
  }

  if (lines.every((line) => /^-\s+/.test(line))) {
    return renderList(lines);
  }

  return renderParagraph(lines);
}

function splitMarkdownBlocks(input: string): string[] {
  return input
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function renderMarkdownDocument(input: string): string {
  return splitMarkdownBlocks(input)
    .map(renderMarkdownBlock)
    .filter(Boolean)
    .join('');
}

export class MarkdownBlockStream {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(final: boolean): string[] {
    const parts = this.buffer.split(/\n{2,}/);
    if (!final && parts.length < 2) {
      return [];
    }

    const complete = final ? parts : parts.slice(0, -1);
    this.buffer = final ? '' : (parts.at(-1) ?? '');

    return complete
      .map((block) => block.trim())
      .filter(Boolean)
      .map(renderMarkdownBlock)
      .filter(Boolean);
  }
}
