import { describe, expect, it, vi } from 'vitest';

import {
  buildVideoBootstrapUrls,
  buildTranscriptChunks,
  buildTranscriptPreview,
  buildTranscriptTextFromChunks,
  extractVideoId,
  fetchTranscriptBundle,
  formatTime,
} from '../src/services/youtube';

describe('extractVideoId', () => {
  it('parses watch and short urls', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).toBe('xRh2sVcNXQ8');
    expect(extractVideoId('https://youtu.be/xRh2sVcNXQ8?t=12')).toBe('xRh2sVcNXQ8');
    expect(extractVideoId('xRh2sVcNXQ8')).toBe('xRh2sVcNXQ8');
  });

  it('throws on invalid urls', () => {
    expect(() => extractVideoId('https://example.com/video')).toThrowError(/YouTube/);
  });
});

describe('buildTranscriptChunks', () => {
  it('merges nearby transcript fragments and splits on gaps', () => {
    const chunks = buildTranscriptChunks([
      { text: 'this new wave', duration: 1.2, offset: 0, lang: 'en' },
      { text: 'of ai companies', duration: 1.3, offset: 1.4, lang: 'en' },
      { text: '[Music]', duration: 1, offset: 5, lang: 'en' },
      { text: 'looks different', duration: 1.4, offset: 12, lang: 'en' },
    ]);

    expect(chunks).toEqual([
      { start: 0, end: 2.7, text: 'this new wave of ai companies' },
      { start: 12, end: 13.4, text: 'looks different' },
    ]);
  });
});

describe('formatTime', () => {
  it('formats seconds into mm:ss and hh:mm:ss', () => {
    expect(formatTime(63)).toBe('01:03');
    expect(formatTime(3663)).toBe('01:01:03');
  });
});

describe('buildTranscriptPreview', () => {
  it('builds preview items with formatted time labels and truncated text', () => {
    const preview = buildTranscriptPreview(
      [
        {
          start: 5,
          end: 13,
          text: 'a'.repeat(240),
        },
      ],
      10,
      20,
    );

    expect(preview).toEqual([
      {
        startLabel: '00:05',
        endLabel: '00:13',
        text: `${'a'.repeat(20)}...`,
      },
    ]);
  });
});

describe('buildTranscriptTextFromChunks', () => {
  it('joins transcript content without timestamps', () => {
    expect(
      buildTranscriptTextFromChunks([
        { start: 5, end: 13, text: 'hello there' },
        { start: 20, end: 24, text: 'general kenobi' },
      ]),
    ).toBe('hello there\ngeneral kenobi');
  });
});

describe('buildVideoBootstrapUrls', () => {
  it('includes desktop, mobile, and embed fallbacks', () => {
    expect(buildVideoBootstrapUrls('xRh2sVcNXQ8')).toEqual([
      'https://www.youtube.com/watch?v=xRh2sVcNXQ8&hl=en&persist_hl=1&bpctr=9999999999&has_verified=1',
      'https://m.youtube.com/watch?v=xRh2sVcNXQ8&hl=en&persist_hl=1&bpctr=9999999999&has_verified=1',
      'https://www.youtube.com/embed/xRh2sVcNXQ8?hl=en',
    ]);
  });
});

describe('fetchTranscriptBundle', () => {
  it('falls back to the direct watch-page path when transcript-plus player lookup fails but captions are embedded', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://example.com/api/timedtext?v=xRh2sVcNXQ8&lang=en","languageCode":"en","kind":"asr","vssId":"a.en","name":{"simpleText":"English (auto-generated)"}}]}},"videoDetails":{"title":"Test title","author":"Test author","channelId":"channel","lengthSeconds":"15","viewCount":"42","thumbnail":{"thumbnails":[{"url":"https://example.com/thumb.jpg"}]}}};</script><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.startsWith('https://example.com/api/timedtext')) {
        return new Response(
          '<transcript><text start="0" dur="2">Hello there</text><text start="2" dur="2">General Kenobi</text></transcript>',
          { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).resolves.toMatchObject({
        videoId: 'xRh2sVcNXQ8',
        sourceTitle: 'Test title',
        sourceAuthor: 'Test author',
        languageCode: 'en',
        languageName: 'English (auto-generated)',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });

      expect(requests.some((url) => url.includes('/youtubei/v1/player'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses youtube-transcript-plus first when the player API and transcript XML both succeed', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Library title","author":"Library author","channelId":"channel","lengthSeconds":"15","viewCount":"42","thumbnail":{"thumbnails":[{"url":"https://example.com/library-thumb.jpg"}]}}};</script><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: 'https://example.com/api/timedtext?v=xRh2sVcNXQ8&lang=en',
                    languageCode: 'en',
                    kind: 'asr',
                    vssId: 'a.en',
                    name: { simpleText: 'English (auto-generated)' },
                  },
                ],
              },
            },
            videoDetails: {
              title: 'Library title',
              author: 'Library author',
              channelId: 'channel',
              lengthSeconds: '15',
              viewCount: '42',
              thumbnail: { thumbnails: [{ url: 'https://example.com/library-thumb.jpg' }] },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://example.com/api/timedtext')) {
        return new Response(
          '<transcript><text start="0" dur="2">Hello there</text><text start="2" dur="2">General Kenobi</text></transcript>',
          { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).resolves.toMatchObject({
        videoId: 'xRh2sVcNXQ8',
        sourceTitle: 'Library title',
        sourceAuthor: 'Library author',
        languageCode: 'en',
        languageName: 'English (auto-generated)',
        thumbnailUrl: 'https://example.com/library-thumb.jpg',
      });

      expect(requests.some((url) => url.includes('/youtubei/v1/player'))).toBe(true);
      expect(requests.some((url) => url.startsWith('https://example.com/api/timedtext'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('prefers the oEmbed title when direct metadata only says YouTube', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<title>YouTube</title><meta property="og:image" content="https://example.com/watch-thumb.jpg"><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: 'https://example.com/api/timedtext?v=xRh2sVcNXQ8&lang=en',
                    languageCode: 'en',
                    kind: 'asr',
                    vssId: 'a.en',
                    name: { simpleText: 'English (auto-generated)' },
                  },
                ],
              },
            },
            videoDetails: {
              title: 'YouTube',
              author: 'a16z',
              thumbnail: { thumbnails: [{ url: 'https://example.com/player-thumb.jpg' }] },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://example.com/api/timedtext')) {
        return new Response(
          '<transcript><text start="0" dur="2">Hello there</text><text start="2" dur="2">General Kenobi</text></transcript>',
          { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } },
        );
      }

      if (url.startsWith('https://www.youtube.com/oembed?')) {
        return new Response(
          JSON.stringify({
            title: 'Marc Andreessen\'s 2026 Outlook: AI Timelines, US vs. China, and The Price of AI',
            author_name: 'a16z',
            thumbnail_url: 'https://example.com/oembed-thumb.jpg',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).resolves.toMatchObject({
        videoId: 'xRh2sVcNXQ8',
        sourceTitle: 'Marc Andreessen\'s 2026 Outlook: AI Timelines, US vs. China, and The Price of AI',
        sourceAuthor: 'a16z',
        languageCode: 'en',
        languageName: 'English (auto-generated)',
        thumbnailUrl: 'https://example.com/player-thumb.jpg',
      });

      expect(requests.some((url) => url.startsWith('https://www.youtube.com/oembed?'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails instead of returning a placeholder title when the original YouTube title cannot be recovered', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    baseUrl: 'https://example.com/api/timedtext?v=xRh2sVcNXQ8&lang=en',
                    languageCode: 'en',
                    kind: 'asr',
                    vssId: 'a.en',
                    name: { simpleText: 'English (auto-generated)' },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://example.com/api/timedtext')) {
        return new Response(
          '<transcript><text start="0" dur="2">Hello there</text><text start="2" dur="2">General Kenobi</text></transcript>',
          { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } },
        );
      }

      if (url.startsWith('https://www.youtube.com/oembed?')) {
        return new Response('not found', { status: 404, statusText: 'Not Found' });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).rejects.toThrow(
        '无法读取 YouTube 原始标题，请稍后重试。',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a specific login or age-verification message when YouTube requires it', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm your age"}};</script><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: {
              status: 'LOGIN_REQUIRED',
              reason: 'Sign in to confirm your age',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle('https://www.youtube.com/watch?v=xRh2sVcNXQ8')).rejects.toThrow(
        '这个视频需要登录或年龄验证后才能观看，当前无法提取字幕。',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to Supadata when direct YouTube caption access fails', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm your age"},"videoDetails":{"title":"Fallback title","author":"Fallback author","channelId":"channel","lengthSeconds":"15","viewCount":"42","thumbnail":{"thumbnails":[{"url":"https://example.com/thumb.jpg"}]}}};</script><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: {
              status: 'LOGIN_REQUIRED',
              reason: 'Sign in to confirm your age',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://api.supadata.ai/v1/transcript?')) {
        return new Response(
          JSON.stringify({
            content: [
              { text: 'Hello there', offset: 0, duration: 1200, lang: 'en' },
              { text: 'General Kenobi', offset: 1400, duration: 1400, lang: 'en' },
            ],
            lang: 'en',
            availableLangs: ['en'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await expect(fetchTranscriptBundle(
        'https://www.youtube.com/watch?v=xRh2sVcNXQ8',
        undefined,
        undefined,
        { supadataApiKey: 'test-supadata-key' },
      )).resolves.toMatchObject({
        videoId: 'xRh2sVcNXQ8',
        sourceTitle: 'Fallback title',
        sourceAuthor: 'Fallback author',
        languageCode: 'en',
        languageName: 'en',
        isAutoGenerated: false,
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });

      expect(requests.some((url) => url.startsWith('https://api.supadata.ai/v1/transcript?'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('polls Supadata jobs when transcript generation is asynchronous', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    vi.useFakeTimers();

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.startsWith('https://www.youtube.com/watch?')) {
        return new Response(
          '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm your age"},"videoDetails":{"title":"Async title","author":"Async author","channelId":"channel","lengthSeconds":"3600","viewCount":"7","thumbnail":{"thumbnails":[{"url":"https://example.com/async-thumb.jpg"}]}}};</script><script>var ytcfg = {"INNERTUBE_API_KEY":"test-key"};</script>',
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      if (url.includes('/youtubei/v1/player?key=')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: {
              status: 'LOGIN_REQUIRED',
              reason: 'Sign in to confirm your age',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://api.supadata.ai/v1/transcript?')) {
        return new Response(
          JSON.stringify({ jobId: 'job-123' }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url === 'https://api.supadata.ai/v1/transcript/job-123') {
        const pollCount = requests.filter((item) => item === url).length;
        if (pollCount === 1) {
          return new Response(
            JSON.stringify({ status: 'queued' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            status: 'completed',
            result: {
              content: [
                { text: 'Async transcript line one', offset: 0, duration: 1800, lang: 'en' },
                { text: 'Async transcript line two', offset: 2500, duration: 1500, lang: 'en' },
              ],
              lang: 'en',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const promise = fetchTranscriptBundle(
        'https://www.youtube.com/watch?v=xRh2sVcNXQ8',
        undefined,
        undefined,
        { supadataApiKey: 'test-supadata-key', supadataMode: 'generate' },
      );

      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toMatchObject({
        sourceTitle: 'Async title',
        sourceAuthor: 'Async author',
        languageCode: 'en',
        isAutoGenerated: true,
        thumbnailUrl: 'https://example.com/async-thumb.jpg',
      });

      expect(requests.filter((url) => url === 'https://api.supadata.ai/v1/transcript/job-123').length).toBe(2);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});
