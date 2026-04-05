import { describe, expect, it } from 'vitest';

import worker from '../src/index';
import type { Env } from '../src/index';

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {
    },
    passThroughOnException() {
    },
    props: {},
  } as unknown as ExecutionContext;
}

function createWorkerRequest(url: string): Request<unknown, IncomingRequestCfProperties<unknown>> {
  return new Request(url) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

describe('worker SEO routes', () => {
  it('renders homepage SEO metadata for the canonical site URL', async () => {
    const response = await worker.fetch(
      createWorkerRequest('https://readtube.example.com/'),
      {} as Env,
      createExecutionContext(),
    );

    const html = await response.text();

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<title>ReadTube | YouTube 字幕阅读器与 AI 摘要</title>');
    expect(html).toContain('<link rel="canonical" href="https://readtube.example.com/" />');
    expect(html).toContain('<meta property="og:title" content="ReadTube | YouTube 字幕阅读器与 AI 摘要" />');
    expect(html).toContain('<meta property="og:image" content="https://readtube.example.com/icon.png" />');
    expect(html).toContain('"@type":"WebApplication"');
  });

  it('serves robots.txt with API exclusions and sitemap discovery', async () => {
    const response = await worker.fetch(
      createWorkerRequest('https://readtube.example.com/robots.txt'),
      {} as Env,
      createExecutionContext(),
    );

    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Sitemap: https://readtube.example.com/sitemap.xml');
  });

  it('serves a sitemap containing the homepage canonical URL', async () => {
    const response = await worker.fetch(
      createWorkerRequest('https://readtube.example.com/sitemap.xml'),
      {} as Env,
      createExecutionContext(),
    );

    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(body).toContain('<loc>https://readtube.example.com/</loc>');
  });

  it('serves a PNG icon for metadata consumers', async () => {
    const response = await worker.fetch(
      createWorkerRequest('https://readtube.example.com/icon.png'),
      {} as Env,
      createExecutionContext(),
    );

    const body = await response.arrayBuffer();

    expect(response.headers.get('content-type')).toBe('image/png');
    expect(body.byteLength).toBeGreaterThan(0);
  });
});
