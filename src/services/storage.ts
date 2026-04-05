import type { TranscriptBundle } from './youtube';
import { isTranscriptBundle } from './youtube';
import { listCuratedHotVideoItems } from '../data/curated-hot-content';
import { getCuratedGeneratedArticle } from '../data/curated-hot-articles';

const TRANSCRIPT_CACHE_VERSION = 2;
const ARTICLE_CACHE_VERSION = 5;
const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_HOT_LIMIT = 6;
const MAX_HOT_LIMIT = 12;

interface ContentCacheBindings {
  CONTENT_CACHE?: KVNamespace;
  HOT_DB?: D1Database;
}

interface CachedTranscriptRecord {
  version: number;
  cachedAt: number;
  bundle: TranscriptBundle;
}

interface CachedGeneratedArticleRecord {
  version: number;
  cachedAt: number;
  articleHtml: string;
  meta: Record<string, unknown>;
}

interface HotVideoRow {
  video_id: string;
  source_title: string;
  source_author: string | null;
  thumbnail_url: string | null;
  view_count: number;
  updated_at: number;
}

export interface CachedGeneratedArticle {
  articleHtml: string;
  meta: Record<string, unknown>;
}

export interface HotVideoItem {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  viewCount: number;
  updatedAt: number;
}

export interface HotVideoViewInput {
  videoId: string;
  sourceTitle: string;
  sourceAuthor?: string;
  thumbnailUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getTranscriptCacheKey(videoId: string): string {
  return `transcript:v${TRANSCRIPT_CACHE_VERSION}:${videoId}`;
}

function getArticleCacheKey(videoId: string, readingMode: string): string {
  return `article:v${ARTICLE_CACHE_VERSION}:${readingMode}:${videoId}`;
}

function normalizeHotLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HOT_LIMIT;
  }

  return Math.min(MAX_HOT_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_HOT_LIMIT)));
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isCachedGeneratedArticleRecord(value: unknown): value is CachedGeneratedArticleRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.version === 'number' &&
    typeof value.cachedAt === 'number' &&
    typeof value.articleHtml === 'string' &&
    isRecord(value.meta)
  );
}

function mapHotVideoRow(row: HotVideoRow): HotVideoItem | null {
  const videoId = normalizeString(row.video_id);
  const title = normalizeString(row.source_title);
  if (!videoId || !title) {
    return null;
  }

  return {
    videoId,
    title,
    author: normalizeString(row.source_author),
    thumbnailUrl: normalizeString(row.thumbnail_url),
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    viewCount: Number.isFinite(row.view_count) ? Math.max(0, Math.floor(row.view_count)) : 0,
    updatedAt: Number.isFinite(row.updated_at) ? Math.max(0, Math.floor(row.updated_at)) : 0,
  };
}

export async function readCachedTranscriptBundle(
  env: ContentCacheBindings,
  videoId: string,
): Promise<TranscriptBundle | null> {
  if (!env.CONTENT_CACHE || !videoId) {
    return null;
  }

  try {
    const cached = await env.CONTENT_CACHE.get(getTranscriptCacheKey(videoId), 'json');
    if (!isRecord(cached)) {
      return null;
    }

    const bundle = cached.bundle;
    if (!isTranscriptBundle(bundle)) {
      return null;
    }

    return bundle;
  } catch (error) {
    console.error('[storage] transcript_cache_read_failed', {
      videoId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export async function writeCachedTranscriptBundle(
  env: ContentCacheBindings,
  bundle: TranscriptBundle,
): Promise<void> {
  if (!env.CONTENT_CACHE || !bundle.videoId) {
    return;
  }

  const record: CachedTranscriptRecord = {
    version: TRANSCRIPT_CACHE_VERSION,
    cachedAt: Date.now(),
    bundle,
  };

  try {
    await env.CONTENT_CACHE.put(
      getTranscriptCacheKey(bundle.videoId),
      JSON.stringify(record),
      {
        expirationTtl: DEFAULT_CACHE_TTL_SECONDS,
      },
    );
  } catch (error) {
    console.error('[storage] transcript_cache_write_failed', {
      videoId: bundle.videoId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function readCachedGeneratedArticle(
  env: ContentCacheBindings,
  videoId: string,
  readingMode: string,
): Promise<CachedGeneratedArticle | null> {
  const curatedArticle = videoId && readingMode
    ? getCuratedGeneratedArticle(videoId, readingMode)
    : null;

  if (curatedArticle) {
    return {
      articleHtml: curatedArticle.articleHtml,
      meta: curatedArticle.meta,
    };
  }

  if (!env.CONTENT_CACHE || !videoId || !readingMode) {
    return null;
  }

  try {
    const cached = await env.CONTENT_CACHE.get(getArticleCacheKey(videoId, readingMode), 'json');
    if (!isCachedGeneratedArticleRecord(cached)) {
      return null;
    }

    return {
      articleHtml: cached.articleHtml,
      meta: cached.meta,
    };
  } catch (error) {
    console.error('[storage] article_cache_read_failed', {
      videoId,
      readingMode,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export async function writeCachedGeneratedArticle(
  env: ContentCacheBindings,
  videoId: string,
  readingMode: string,
  articleHtml: string,
  meta: Record<string, unknown>,
): Promise<void> {
  if (!env.CONTENT_CACHE || !videoId || !readingMode || !articleHtml.trim()) {
    return;
  }

  const record: CachedGeneratedArticleRecord = {
    version: ARTICLE_CACHE_VERSION,
    cachedAt: Date.now(),
    articleHtml,
    meta,
  };

  try {
    await env.CONTENT_CACHE.put(
      getArticleCacheKey(videoId, readingMode),
      JSON.stringify(record),
      {
        expirationTtl: DEFAULT_CACHE_TTL_SECONDS,
      },
    );
  } catch (error) {
    console.error('[storage] article_cache_write_failed', {
      videoId,
      readingMode,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function listHotVideos(
  env: ContentCacheBindings,
  limit?: number,
): Promise<HotVideoItem[]> {
  const normalizedLimit = normalizeHotLimit(limit);
  const curatedItems = listCuratedHotVideoItems().map((item) => ({
    videoId: item.videoId,
    title: item.title,
    author: item.author,
    thumbnailUrl: item.thumbnailUrl,
    youtubeUrl: item.youtubeUrl,
    viewCount: item.viewCount,
    updatedAt: item.updatedAt,
  }));

  if (!env.HOT_DB) {
    return curatedItems.slice(0, normalizedLimit);
  }

  try {
    const result = await env.HOT_DB
      .prepare(
        `SELECT video_id, source_title, source_author, thumbnail_url, view_count, updated_at
         FROM popular_videos
         ORDER BY view_count DESC, updated_at DESC
         LIMIT ${normalizedLimit}`,
      )
      .all<HotVideoRow>();

    const databaseItems = (result.results ?? [])
      .map((row) => mapHotVideoRow(row))
      .filter((item): item is HotVideoItem => Boolean(item));
    const mergedItems = new Map<string, HotVideoItem>();

    for (const item of curatedItems) {
      mergedItems.set(item.videoId, item);
    }

    for (const item of databaseItems) {
      const existing = mergedItems.get(item.videoId);
      if (!existing) {
        mergedItems.set(item.videoId, item);
        continue;
      }

      mergedItems.set(item.videoId, {
        ...existing,
        viewCount: item.viewCount,
        updatedAt: Math.max(existing.updatedAt, item.updatedAt),
        youtubeUrl: item.youtubeUrl || existing.youtubeUrl,
      });
    }

    return [...mergedItems.values()]
      .sort((left, right) => (
        right.viewCount - left.viewCount
        || right.updatedAt - left.updatedAt
        || left.title.localeCompare(right.title)
      ))
      .slice(0, normalizedLimit);
  } catch (error) {
    console.error('[storage] hot_list_query_failed', {
      limit: normalizedLimit,
      error: error instanceof Error ? error.message : error,
    });
    return curatedItems.slice(0, normalizedLimit);
  }
}

export async function recordHotVideoView(
  env: ContentCacheBindings,
  input: HotVideoViewInput,
): Promise<void> {
  if (!env.HOT_DB) {
    return;
  }

  const videoId = normalizeString(input.videoId);
  const sourceTitle = normalizeString(input.sourceTitle);
  if (!videoId || !sourceTitle) {
    return;
  }

  const sourceAuthor = normalizeString(input.sourceAuthor);
  const thumbnailUrl = normalizeString(input.thumbnailUrl);
  const now = Date.now();

  try {
    await env.HOT_DB
      .prepare(
        `INSERT INTO popular_videos (
           video_id,
           source_title,
           source_author,
           thumbnail_url,
           view_count,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(video_id) DO UPDATE SET
           source_title = excluded.source_title,
           source_author = excluded.source_author,
           thumbnail_url = excluded.thumbnail_url,
           view_count = popular_videos.view_count + 1,
           updated_at = excluded.updated_at`,
      )
      .bind(videoId, sourceTitle, sourceAuthor, thumbnailUrl, now, now)
      .run();
  } catch (error) {
    console.error('[storage] hot_view_write_failed', {
      videoId,
      error: error instanceof Error ? error.message : error,
    });
  }
}
