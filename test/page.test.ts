import { describe, expect, it } from 'vitest';

import { formatLocalDayKey, renderAppPage } from '../src/ui/page';

describe('page helpers', () => {
  it('formats local day keys as yyyy-mm-dd', () => {
    expect(formatLocalDayKey(new Date(2026, 3, 5, 9, 30, 0))).toBe('2026-04-05');
  });

  it('renders a non-zoomable mobile viewport', () => {
    const html = renderAppPage({
      canonicalUrl: 'https://readtube.example.com',
      iconUrl: 'https://readtube.example.com/icon.png',
    });

    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />',
    );
  });

  it('includes article collapse controls for sections and topics', () => {
    const html = renderAppPage({
      canonicalUrl: 'https://readtube.example.com',
      iconUrl: 'https://readtube.example.com/icon.png',
    });

    expect(html).toContain('function syncArticleCollapsibles(root)');
    expect(html).toContain('data-collapse-toggle');
    expect(html).toContain('section-theme-toggle');
    expect(html).toContain('dialogue-subtopic-toggle');
  });
});
