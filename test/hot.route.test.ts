import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/index';
import { handleHotRoute, handleViewRoute } from '../src/routes/hot';

describe('hot routes', () => {
  it('returns fallback hot items with a warning when the database query fails', async () => {
    const env: Env = {
      HOT_DB: {
        prepare: vi.fn(() => ({
          all: vi.fn(async () => {
            throw new Error('db down');
          }),
        })),
      } as unknown as D1Database,
    };

    const response = await handleHotRoute(
      new Request('https://example.com/api/hot?limit=1'),
      env,
    );
    const payload = await response.json() as {
      items: unknown[];
      warning?: { code: string; message: string; status: number };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.warning).toEqual({
      code: 'hot_list_stale',
      message: '热门列表暂时无法更新，先为你展示默认内容。',
      status: 200,
    });
  });

  it('returns a structured JSON error when recording a video view fails', async () => {
    const env: Env = {
      HOT_DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn(async () => {
              throw new Error('write failed');
            }),
          })),
        })),
      } as unknown as D1Database,
    };

    const response = await handleViewRoute(
      new Request('https://example.com/api/view', {
        method: 'POST',
        body: JSON.stringify({
          videoId: 'abc123xyz90',
          sourceTitle: 'Test title',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
      env,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      code: 'hot_view_record_failed',
      message: '最近浏览暂时没有保存成功，请稍后再试。',
      status: 500,
    });
  });
});
