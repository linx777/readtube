import { isAbortError, throwIfAborted } from '../services/abort';
import type { Env } from '../index';
import { getCuratedHotTranslationContent } from '../data/curated-hot-content';
import { AppError, formatErrorMessage, jsonErrorResponse } from '../services/errors';
import {
  generateTranscriptSections,
  type QuickTranscriptSectionSummaryResult,
  type TranscriptDialogueSliceResult,
  type TranscriptSectionBoundary,
  type TranscriptSection,
  type TranscriptSectionsResult,
  translateTranscriptSectionToZh,
} from '../services/gemini';
import { renderMarkdownDocument } from '../services/markdown';
import type {
  StoredFullRendering,
  StoredFullSection,
  StoredQuickRendering,
  StoredQuickSection,
  StoredTranslationSource,
} from '../services/render-content';
import { createSseResponse, sendSseEvent } from '../services/sse';
import {
  buildTranscriptTextFromChunks,
  extractVideoId,
  fetchTranscriptBundle,
  formatTime,
  isTranscriptBundle,
} from '../services/youtube';
import type {
  TranscriptBundle,
  TranscriptChunk,
  TranscriptProviderOptions,
} from '../services/youtube';
import {
  readCachedGeneratedArticle,
  readCachedTranscriptBundle,
  writeCachedGeneratedArticle,
  writeCachedTranscriptBundle,
} from '../services/storage';

interface GenerateRequestBody {
  youtubeUrl?: string;
  cachedTranscript?: TranscriptBundle;
  readingMode?: 'quick' | 'full';
  geminiApiKey?: string;
  localDayKey?: string;
}

type ReadingMode = 'quick' | 'full';
const DEFAULT_READING_MODE: ReadingMode = 'quick';
const SUPPORTED_READING_MODES: ReadingMode[] = ['quick', 'full'];
const READING_MODE_LABELS: Record<ReadingMode, string> = {
  quick: '速读版',
  full: '详细版',
};

const FIRST_CALL_TRANSCRIPT_LIMIT_SECONDS = 30 * 60;
const MANUAL_SECTION_WINDOW_SECONDS = 20 * 60;
const QUICK_SECTIONING_SLICE_SECONDS = 18 * 60;
const MANUAL_SECTION_MODEL = 'manual_time_slice';
const DAILY_SUCCESSFUL_GEMINI_TRANSLATION_LIMIT = 3;
const DAILY_SUCCESSFUL_GEMINI_TRANSLATION_COOKIE = 'xvc_gemini_success';
const SECTION_BOUNDARY_MAX_RETRIES = 1;
const MANUAL_SECTION_SUBTITLE_PATTERN = /^Transcript Section (\d+)$/i;
const MANUAL_SECTION_SUMMARY_PATTERN = /^Transcript content from (.+) to (.+)\.$/i;
const FULL_DIALOGUE_LOADING_HINTS = [
  {
    title: 'Gemini 正在逐段翻译',
    body: '按时间顺序处理片段，尽量保留原话语气。',
  },
  {
    title: 'Gemini 正在对齐时间戳',
    body: '翻译内容会和原始时间点一一对应，方便回跳视频。',
  },
  {
    title: 'Gemini 正在打磨中文表达',
    body: '会优先保持自然、直接、适合阅读的中文语感。',
  },
  {
    title: 'Gemini 正在继续写入后续片段',
    body: '剩余片段生成中，新的内容会陆续出现。',
  },
  {
    title: 'Gemini 正在统一中文语气',
    body: '会尽量让整篇中文读起来连续、自然、不生硬。',
  },
  {
    title: 'Gemini 正在处理下一段内容',
    body: '新的段落正在生成，很快会接到当前内容后面。',
  },
  {
    title: 'Gemini 正在保留原文节奏',
    body: '会尽量顺着原视频的推进顺序来呈现信息。',
  },
  {
    title: 'Gemini 正在修整长句',
    body: '较长的口语句子会被适度整理得更适合阅读。',
  },
  {
    title: 'Gemini 正在生成后续卡片',
    body: '新的时间片段与对应内容正在陆续补上。',
  },
  {
    title: 'Gemini 正在核对片段顺序',
    body: '确保内容顺序和时间线保持一致，阅读不会跳脱。',
  },
  {
    title: 'Gemini 正在补齐剩余内容',
    body: '还没出现的部分正在继续生成，请再稍等一下。',
  },
  {
    title: 'Gemini 正在润色当前批次',
    body: '这一批片段正在做最后的中文整理。',
  },
] as const;

type LoadingHintCopy = {
  title: string;
  body: string;
};

const RETRYABLE_SECTION_BOUNDARY_ERROR_CODES = new Set([
  'missing_section_timestamp',
  'invalid_section_timestamp',
]);
const SECTION_TIMESTAMP_MATCH_TOLERANCE_SECONDS = 10;

class SectionBoundaryResolutionError extends AppError {
  constructor(
    error: AppError,
    readonly latestResult: TranscriptSectionsResult,
  ) {
    super(error.code, error.publicMessage, error.status, { cause: error });
    this.name = 'SectionBoundaryResolutionError';
  }
}

function getUsableCachedTranscript(body: GenerateRequestBody, youtubeUrl: string): TranscriptBundle | null {
  if (!isTranscriptBundle(body.cachedTranscript)) {
    return null;
  }

  const expectedVideoId = extractVideoId(youtubeUrl);
  if (body.cachedTranscript.videoId !== expectedVideoId) {
    return null;
  }

  if (!body.cachedTranscript.chunks.length || !body.cachedTranscript.transcriptText.trim()) {
    return null;
  }

  return body.cachedTranscript;
}

async function parseRequestBody(request: Request): Promise<GenerateRequestBody> {
  try {
    return (await request.json()) as GenerateRequestBody;
  } catch {
    throw new AppError('invalid_json', '请求体不是合法的 JSON。', 400);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeReadingMode(value: unknown): ReadingMode {
  return SUPPORTED_READING_MODES.includes(value as ReadingMode)
    ? value as ReadingMode
    : DEFAULT_READING_MODE;
}

function hasCustomGeminiKey(body: GenerateRequestBody): boolean {
  return typeof body.geminiApiKey === 'string' && Boolean(body.geminiApiKey.trim());
}

function isValidLocalDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function getUtcDayKey(now = new Date()): string {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getRequestedLocalDayKey(body: GenerateRequestBody): string {
  return isValidLocalDayKey(body.localDayKey)
    ? body.localDayKey.trim()
    : getUtcDayKey();
}

function readCookieValue(request: Request, name: string): string {
  const rawCookie = request.headers.get('cookie') || '';
  const parts = rawCookie.split(/;\s*/);

  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    return part.slice(separatorIndex + 1).trim();
  }

  return '';
}

function getDailySuccessfulGeminiTranslationCount(
  request: Request,
  localDayKey: string,
): number {
  const rawValue = readCookieValue(request, DAILY_SUCCESSFUL_GEMINI_TRANSLATION_COOKIE);
  const match = rawValue.match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  if (!match || match[1] !== localDayKey) {
    return 0;
  }

  const parsedCount = Number.parseInt(match[2], 10);
  return Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0;
}

function buildDailySuccessfulGeminiTranslationCookie(localDayKey: string, successCount: number): string {
  const normalizedCount = Math.max(0, Math.floor(successCount));
  return [
    `${DAILY_SUCCESSFUL_GEMINI_TRANSLATION_COOKIE}=${localDayKey}.${normalizedCount}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    'Max-Age=172800',
  ].join('; ');
}

interface GeminiUsageBody {
  localDayKey?: string;
}

async function parseGeminiUsageBody(request: Request): Promise<GeminiUsageBody> {
  try {
    return (await request.json()) as GeminiUsageBody;
  } catch {
    return {};
  }
}

function createGeminiUsageStatusResponse(localDayKey: string, successCount: number): Response {
  const used = Math.max(0, successCount);
  const remaining = Math.max(0, DAILY_SUCCESSFUL_GEMINI_TRANSLATION_LIMIT - used);

  return new Response(JSON.stringify({
    localDayKey,
    limit: DAILY_SUCCESSFUL_GEMINI_TRANSLATION_LIMIT,
    used,
    remaining,
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function handleGeminiTranslationUsageRoute(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const localDayKey = isValidLocalDayKey(url.searchParams.get('localDayKey'))
      ? String(url.searchParams.get('localDayKey')).trim()
      : getUtcDayKey();
    const currentCount = getDailySuccessfulGeminiTranslationCount(request, localDayKey);
    return createGeminiUsageStatusResponse(localDayKey, currentCount);
  }

  const body = await parseGeminiUsageBody(request);
  const localDayKey = isValidLocalDayKey(body.localDayKey)
    ? body.localDayKey.trim()
    : getUtcDayKey();
  const currentCount = getDailySuccessfulGeminiTranslationCount(request, localDayKey);
  const nextCount = currentCount + 1;

  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'set-cookie': buildDailySuccessfulGeminiTranslationCookie(localDayKey, nextCount),
    },
  });
}

function shouldUseSharedArticleCache(body: GenerateRequestBody): boolean {
  return !hasCustomGeminiKey(body);
}

function articleHtmlShowsOriginalTranscriptFallback(articleHtml: string): boolean {
  return articleHtml.includes('<span class="section-title">原文片段</span>');
}

function cachedArticleNeedsRefresh(
  cachedArticle: { articleHtml: string; meta: Record<string, unknown> },
): boolean {
  return (
    cachedArticle.meta.translationNeedsRefresh === true
    || cachedArticle.meta.geminiTranslationComplete === false
    || articleHtmlShowsOriginalTranscriptFallback(cachedArticle.articleHtml)
  );
}

function getTranscriptProviderOptions(env: Env): TranscriptProviderOptions | undefined {
  const supadataApiKey = env.SUPADATA_API_KEY?.trim();
  if (!supadataApiKey) {
    return undefined;
  }

  return {
    supadataApiKey,
    supadataMode: env.SUPADATA_TRANSCRIPT_MODE?.trim(),
  };
}

function tryExtractVideoId(input: string): string {
  try {
    return extractVideoId(input);
  } catch {
    return '';
  }
}

function getReadingModeLabel(readingMode: ReadingMode): string {
  return READING_MODE_LABELS[normalizeReadingMode(readingMode)];
}

export function usesGeminiReadingFlow(readingMode: ReadingMode): boolean {
  return SUPPORTED_READING_MODES.includes(normalizeReadingMode(readingMode));
}

function getEffectiveGeminiEnv(
  env: Env,
  body: GenerateRequestBody,
): Env {
  const geminiApiKey = body.geminiApiKey?.trim();
  if (!geminiApiKey) {
    return env;
  }

  return {
    ...env,
    GEMINI_API_KEY: geminiApiKey,
  };
}

function assertGeminiKeyConfigured(env: Env, readingMode: ReadingMode): void {
  if (!usesGeminiReadingFlow(readingMode) || env.GEMINI_API_KEY?.trim()) {
    return;
  }

  throw new AppError(
    'missing_gemini_key',
    '未找到可用的 Gemini key，请先在设置中填写后再试。',
    400,
  );
}

function buildBundleMeta(bundle: TranscriptBundle, readingMode: ReadingMode): Record<string, unknown> {
  return {
    videoId: bundle.videoId,
    sourceTitle: bundle.sourceTitle,
    sourceAuthor: bundle.sourceAuthor,
    sourceLanguage: bundle.languageName,
    sourceLanguageCode: bundle.languageCode,
    isAutoGenerated: bundle.isAutoGenerated,
    thumbnailUrl: bundle.thumbnailUrl,
    durationSeconds: bundle.durationSeconds,
    transcriptChunks: bundle.chunks.length,
    resultMode: 'transcript',
    readingMode,
    readingModeLabel: getReadingModeLabel(readingMode),
  };
}

function getTranscriptDurationSeconds(bundle: TranscriptBundle): number {
  return Math.max(
    bundle.durationSeconds,
    Math.ceil(bundle.chunks.at(-1)?.end ?? 0),
  );
}

export function shouldSliceFirstGeminiCall(bundle: TranscriptBundle): boolean {
  return getTranscriptDurationSeconds(bundle) > FIRST_CALL_TRANSCRIPT_LIMIT_SECONDS;
}

export function buildFirstCallTranscriptBundle(bundle: TranscriptBundle): TranscriptBundle {
  if (!shouldSliceFirstGeminiCall(bundle)) {
    return bundle;
  }

  const chunks = bundle.chunks
    .filter((chunk) => chunk.start < FIRST_CALL_TRANSCRIPT_LIMIT_SECONDS)
    .map((chunk) => ({
      ...chunk,
      end: Math.min(chunk.end, FIRST_CALL_TRANSCRIPT_LIMIT_SECONDS),
    }));

  return {
    ...bundle,
    chunks,
    durationSeconds: Math.min(getTranscriptDurationSeconds(bundle), FIRST_CALL_TRANSCRIPT_LIMIT_SECONDS),
    transcriptText: buildTranscriptTextFromChunks(chunks),
  };
}

export function buildManualTranscriptSections(
  bundle: TranscriptBundle,
  windowSeconds = MANUAL_SECTION_WINDOW_SECONDS,
): TranscriptSection[] {
  if (!bundle.chunks.length) {
    return [];
  }

  const sections: TranscriptSection[] = [];
  let chunkIndex = 0;

  while (chunkIndex < bundle.chunks.length) {
    const firstChunk = bundle.chunks[chunkIndex];
    const windowStart = Math.floor(firstChunk.start / windowSeconds) * windowSeconds;
    const windowEnd = windowStart + windowSeconds;
    const sectionChunks: TranscriptChunk[] = [];

    while (chunkIndex < bundle.chunks.length && bundle.chunks[chunkIndex].start < windowEnd) {
      sectionChunks.push(bundle.chunks[chunkIndex]);
      chunkIndex += 1;
    }

    if (!sectionChunks.length) {
      continue;
    }

    const isLastSection = chunkIndex >= bundle.chunks.length;
    const sectionEndSeconds = isLastSection
      ? Math.ceil(sectionChunks.at(-1)?.end ?? windowEnd)
      : windowEnd;
    const startLabel = formatTime(windowStart);
    const endLabel = formatTime(sectionEndSeconds);

    sections.push({
      startLabel,
      endLabel,
      subtitle: `Transcript Section ${sections.length + 1}`,
      summary: `Transcript content from ${startLabel} to ${endLabel}.`,
      transcript: sectionChunks
        .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
        .join('\n'),
    });
  }

  return sections;
}

export function buildTranscriptSliceBundles(
  bundle: TranscriptBundle,
  windowSeconds = QUICK_SECTIONING_SLICE_SECONDS,
): TranscriptBundle[] {
  if (!bundle.chunks.length) {
    return [];
  }

  const slices: TranscriptBundle[] = [];
  let chunkIndex = 0;

  while (chunkIndex < bundle.chunks.length) {
    const firstChunk = bundle.chunks[chunkIndex];
    const windowStart = Math.floor(firstChunk.start / windowSeconds) * windowSeconds;
    const windowEnd = windowStart + windowSeconds;
    const sliceChunks: TranscriptChunk[] = [];

    while (chunkIndex < bundle.chunks.length && bundle.chunks[chunkIndex].start < windowEnd) {
      sliceChunks.push(bundle.chunks[chunkIndex]);
      chunkIndex += 1;
    }

    if (!sliceChunks.length) {
      continue;
    }

    slices.push({
      ...bundle,
      chunks: sliceChunks,
      durationSeconds: Math.ceil(sliceChunks.at(-1)?.end ?? windowEnd),
      transcriptText: buildTranscriptTextFromChunks(sliceChunks),
    });
  }

  return slices;
}

function parseTimestampLabelToSeconds(label: string): number | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const values = parts.map((part) => Number.parseInt(part, 10));
  if (values.some((value) => Number.isNaN(value) || value < 0)) {
    return null;
  }

  if (values.length === 2) {
    const [minute, second] = values;
    if (second >= 60) {
      return null;
    }
    return minute * 60 + second;
  }

  const [hour, minute, second] = values;
  if (minute >= 60 || second >= 60) {
    return null;
  }

  return hour * 3600 + minute * 60 + second;
}

function findChunkIndexForTimestamp(
  chunks: TranscriptChunk[],
  timestampSeconds: number,
  fromIndex: number,
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = Math.max(0, fromIndex); index < chunks.length; index += 1) {
    const chunkTimestampSeconds = Math.floor(chunks[index].start);
    const distance = Math.abs(chunkTimestampSeconds - timestampSeconds);
    if (chunkTimestampSeconds === timestampSeconds) {
      return index;
    }

    if (
      distance <= SECTION_TIMESTAMP_MATCH_TOLERANCE_SECONDS
      && distance < bestDistance
    ) {
      bestIndex = index;
      bestDistance = distance;
    }

    if (chunkTimestampSeconds > timestampSeconds + SECTION_TIMESTAMP_MATCH_TOLERANCE_SECONDS) {
      break;
    }
  }

  if (bestIndex >= 0) {
    return bestIndex;
  }

  for (let index = Math.max(0, fromIndex); index < chunks.length; index += 1) {
    const chunkTimestampSeconds = Math.floor(chunks[index].start);
    const distance = Math.abs(chunkTimestampSeconds - timestampSeconds);

    if (
      distance < bestDistance
      || (distance === bestDistance && (bestIndex < 0 || index < bestIndex))
    ) {
      bestIndex = index;
      bestDistance = distance;
    }
  }

  return bestIndex;
}

function findLastChunkIndexForTimestamp(
  chunks: TranscriptChunk[],
  timestampSeconds: number,
  fromIndex: number,
): number {
  let matchedIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = Math.max(0, fromIndex); index < chunks.length; index += 1) {
    const chunkTimestampSeconds = Math.floor(chunks[index].start);
    if (chunkTimestampSeconds > timestampSeconds + SECTION_TIMESTAMP_MATCH_TOLERANCE_SECONDS) {
      break;
    }

    const distance = Math.abs(chunkTimestampSeconds - timestampSeconds);
    if (chunkTimestampSeconds === timestampSeconds) {
      matchedIndex = index;
      bestDistance = 0;
      continue;
    }

    if (
      distance <= SECTION_TIMESTAMP_MATCH_TOLERANCE_SECONDS
      && (distance < bestDistance || (distance === bestDistance && index > matchedIndex))
    ) {
      matchedIndex = index;
      bestDistance = distance;
    }
  }

  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  for (let index = Math.max(0, fromIndex); index < chunks.length; index += 1) {
    const chunkTimestampSeconds = Math.floor(chunks[index].start);
    const distance = Math.abs(chunkTimestampSeconds - timestampSeconds);

    if (
      distance < bestDistance
      || (distance === bestDistance && index > matchedIndex)
    ) {
      matchedIndex = index;
      bestDistance = distance;
    }
  }

  return matchedIndex;
}

export function buildTranscriptSectionsFromTimestampBoundaries(
  bundle: TranscriptBundle,
  sectionBoundaries: TranscriptSectionBoundary[],
): TranscriptSection[] {
  if (!sectionBoundaries.length) {
    return [];
  }

  const sections: TranscriptSection[] = [];
  let nextSearchIndex = 0;

  for (let index = 0; index < sectionBoundaries.length; index += 1) {
    const boundary = sectionBoundaries[index];
    const startSeconds = parseTimestampLabelToSeconds(boundary.startLabel);
    if (startSeconds === null) {
      throw new AppError('invalid_section_timestamp', `Gemini 返回了无法识别的分段起始时间：${boundary.startLabel}`, 502);
    }

    const startIndex = findChunkIndexForTimestamp(bundle.chunks, startSeconds, nextSearchIndex);
    if (startIndex < 0) {
      throw new AppError('missing_section_timestamp', `无法在原始字幕中定位分段起始时间：${boundary.startLabel}`, 502);
    }

    let endIndex: number;
    if (index < sectionBoundaries.length - 1) {
      const nextBoundary = sectionBoundaries[index + 1];
      const nextStartSeconds = parseTimestampLabelToSeconds(nextBoundary.startLabel);
      if (nextStartSeconds === null) {
        throw new AppError('invalid_section_timestamp', `Gemini 返回了无法识别的下一段起始时间：${nextBoundary.startLabel}`, 502);
      }

      let nextStartIndex = findChunkIndexForTimestamp(bundle.chunks, nextStartSeconds, startIndex + 1);
      if (nextStartIndex < 0) {
        throw new AppError('missing_section_timestamp', `无法在原始字幕中定位下一段起始时间：${nextBoundary.startLabel}`, 502);
      }
      if (nextStartIndex <= startIndex) {
        nextStartIndex = startIndex + 1;
      }

      if (nextStartIndex >= bundle.chunks.length) {
        endIndex = bundle.chunks.length - 1;
        nextSearchIndex = bundle.chunks.length;
      } else {
        endIndex = nextStartIndex - 1;
        nextSearchIndex = nextStartIndex;
      }
    } else {
      const endSeconds = parseTimestampLabelToSeconds(boundary.endLabel);
      if (endSeconds === null) {
        throw new AppError('invalid_section_timestamp', `Gemini 返回了无法识别的分段结束时间：${boundary.endLabel}`, 502);
      }

      endIndex = findLastChunkIndexForTimestamp(bundle.chunks, endSeconds, startIndex);
      if (endIndex < startIndex) {
        throw new AppError('missing_section_timestamp', `无法在原始字幕中定位分段结束时间：${boundary.endLabel}`, 502);
      }
      nextSearchIndex = bundle.chunks.length;
    }

    const sliceChunks = bundle.chunks.slice(startIndex, endIndex + 1);
    if (!sliceChunks.length) {
      throw new AppError('empty_transcript_section', `分段 ${boundary.startLabel}-${boundary.endLabel} 没有匹配到任何原始字幕。`, 502);
    }

    sections.push({
      startLabel: formatTime(sliceChunks[0].start),
      endLabel: formatTime(sliceChunks.at(-1)?.start ?? sliceChunks[0].start),
      subtitle: boundary.subtitle,
      summary: boundary.summary,
      transcript: sliceChunks
        .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
        .join('\n'),
    });
  }

  return sections;
}

async function generateTranscriptSectionsWithBoundaryRetry(
  bundle: TranscriptBundle,
  env: {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_INSIGHTS_MODEL?: string;
    GEMINI_DIALOGUE_MODEL?: string;
  },
  readingMode: 'quick' | 'full',
  signal?: AbortSignal,
  options?: {
    onRetry?: (context: {
      attempt: number;
      maxRetries: number;
      error: AppError;
      latestResult: TranscriptSectionsResult;
    }) => Promise<void> | void;
  },
): Promise<{
  result: TranscriptSectionsResult;
  sections: TranscriptSection[];
}> {
  for (let attempt = 0; attempt <= SECTION_BOUNDARY_MAX_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    const result = await generateTranscriptSections(bundle, env, readingMode, signal);

    try {
      return {
        result,
        sections: buildTranscriptSectionsFromTimestampBoundaries(bundle, result.sections),
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      const appError = AppError.from(error);
      if (
        !RETRYABLE_SECTION_BOUNDARY_ERROR_CODES.has(appError.code)
        || attempt >= SECTION_BOUNDARY_MAX_RETRIES
      ) {
        throw new SectionBoundaryResolutionError(appError, result);
      }

      await options?.onRetry?.({
        attempt: attempt + 1,
        maxRetries: SECTION_BOUNDARY_MAX_RETRIES,
        error: appError,
        latestResult: result,
      });
    }
  }

  throw new AppError('unexpected_error', 'Gemini 分段失败，请稍后重试。', 502);
}

function extractTranscriptLineText(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/^\[[0-9:]+\]\s*(.+)$/);
  return (match?.[1] || trimmed).trim();
}

function getFirstTranscriptLineText(section: TranscriptSection): string {
  const line = section.transcript
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ? extractTranscriptLineText(line) : '';
}

function getLastTranscriptLineText(section: TranscriptSection): string {
  const lines = section.transcript
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const line = lines.at(-1);
  return line ? extractTranscriptLineText(line) : '';
}

function looksQuestionLikeText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (/[?？]$/.test(normalized)) {
    return true;
  }

  if (/^(who|what|when|where|why|how|which|whether|is|are|am|was|were|do|does|did|can|could|should|would|will|have|has|had)\b/i.test(normalized)) {
    return true;
  }

  return /(什么|为什么|为何|如何|是否|谁|哪(里|个|些|种)?|几时|多久|吗|呢)/.test(normalized);
}

function chooseMergedSectionSubtitle(previous: TranscriptSection, next: TranscriptSection): string {
  const previousSubtitle = previous.subtitle.trim();
  const nextSubtitle = next.subtitle.trim();

  if (!previousSubtitle) {
    return nextSubtitle;
  }

  if (!nextSubtitle || previousSubtitle === nextSubtitle) {
    return previousSubtitle;
  }

  const previousQuestionLike = looksQuestionLikeText(previousSubtitle);
  const nextQuestionLike = looksQuestionLikeText(nextSubtitle);

  if (previousQuestionLike && !nextQuestionLike) {
    return nextSubtitle;
  }

  if (!previousQuestionLike && nextQuestionLike) {
    return previousSubtitle;
  }

  if (nextSubtitle.includes(previousSubtitle)) {
    return nextSubtitle;
  }

  if (previousSubtitle.includes(nextSubtitle)) {
    return previousSubtitle;
  }

  return `${previousSubtitle} / ${nextSubtitle}`;
}

function chooseMergedSectionSummary(previous: TranscriptSection, next: TranscriptSection): string {
  const previousSummary = previous.summary.trim();
  const nextSummary = next.summary.trim();

  if (!previousSummary) {
    return nextSummary;
  }

  if (!nextSummary || previousSummary === nextSummary) {
    return previousSummary;
  }

  const previousQuestionLike = looksQuestionLikeText(previousSummary);
  const nextQuestionLike = looksQuestionLikeText(nextSummary);

  if (previousQuestionLike && !nextQuestionLike) {
    return nextSummary;
  }

  if (!previousQuestionLike && nextQuestionLike) {
    return previousSummary;
  }

  if (nextSummary.includes(previousSummary)) {
    return nextSummary;
  }

  if (previousSummary.includes(nextSummary)) {
    return previousSummary;
  }

  return `${previousSummary}；${nextSummary}`;
}

function shouldMergeQuestionAnswerBoundary(previous: TranscriptSection, next: TranscriptSection): boolean {
  const previousLastText = getLastTranscriptLineText(previous);
  const nextFirstText = getFirstTranscriptLineText(next);

  if (!previousLastText || !nextFirstText) {
    return false;
  }

  return looksQuestionLikeText(previousLastText) && !looksQuestionLikeText(nextFirstText);
}

export function mergeQuestionAnswerSplitSections(sections: TranscriptSection[]): TranscriptSection[] {
  const merged: TranscriptSection[] = [];

  for (const section of sections) {
    const previous = merged.at(-1);

    if (!previous || !shouldMergeQuestionAnswerBoundary(previous, section)) {
      merged.push(section);
      continue;
    }

    const previousEndsWithQuestion = looksQuestionLikeText(getLastTranscriptLineText(previous));
    merged[merged.length - 1] = {
      ...previous,
      endLabel: section.endLabel,
      subtitle: previousEndsWithQuestion
        ? (section.subtitle.trim() || chooseMergedSectionSubtitle(previous, section))
        : chooseMergedSectionSubtitle(previous, section),
      summary: previousEndsWithQuestion
        ? (section.summary.trim() || chooseMergedSectionSummary(previous, section))
        : chooseMergedSectionSummary(previous, section),
      transcript: `${previous.transcript}\n${section.transcript}`.trim(),
    };
  }

  return merged;
}

function renumberManualPlaceholderSections(sections: TranscriptSection[]): TranscriptSection[] {
  let manualIndex = 0;

  return sections.map((section) => {
    if (
      MANUAL_SECTION_SUBTITLE_PATTERN.test(section.subtitle.trim())
      && MANUAL_SECTION_SUMMARY_PATTERN.test(section.summary.trim())
    ) {
      manualIndex += 1;
      return {
        ...section,
        subtitle: `Transcript Section ${manualIndex}`,
        summary: `Transcript content from ${section.startLabel} to ${section.endLabel}.`,
      };
    }

    return section;
  });
}

function attachSectionPreviewCopy(
  sections: TranscriptSection[],
  previewSections: Array<Pick<TranscriptSection, 'startLabel' | 'endLabel' | 'subtitle' | 'summary'>>,
): TranscriptSection[] {
  if (!sections.length || !previewSections.length) {
    return sections;
  }

  const normalizedPreviewSections = previewSections
    .map((preview) => ({
      ...preview,
      subtitle: preview.subtitle.trim(),
      summary: preview.summary.trim(),
      startSeconds: parseTimestampLabelToSeconds(preview.startLabel),
      endSeconds: parseTimestampLabelToSeconds(preview.endLabel),
    }))
    .filter((preview) => preview.subtitle && preview.summary);

  if (!normalizedPreviewSections.length) {
    return sections;
  }

  if (sections.length === normalizedPreviewSections.length) {
    return sections.map((section, index) => ({
      ...section,
      subtitleZh: section.subtitleZh?.trim() || normalizedPreviewSections[index].subtitle,
      summaryZh: section.summaryZh?.trim() || normalizedPreviewSections[index].summary,
    }));
  }

  return sections.map((section) => {
    const sectionStartSeconds = parseTimestampLabelToSeconds(section.startLabel);
    const sectionEndSeconds = parseTimestampLabelToSeconds(section.endLabel);

    const bestPreview = normalizedPreviewSections.reduce<{
      subtitle: string;
      summary: string;
      score: number;
    } | null>((best, preview) => {
      if (
        sectionStartSeconds === null
        || sectionEndSeconds === null
        || preview.startSeconds === null
        || preview.endSeconds === null
      ) {
        return best;
      }

      const overlapSeconds = Math.max(
        0,
        Math.min(sectionEndSeconds, preview.endSeconds) - Math.max(sectionStartSeconds, preview.startSeconds),
      );
      const boundaryDistance =
        Math.abs(sectionStartSeconds - preview.startSeconds)
        + Math.abs(sectionEndSeconds - preview.endSeconds);
      const score = overlapSeconds * 1_000 - boundaryDistance;

      if (!best || score > best.score) {
        return {
          subtitle: preview.subtitle,
          summary: preview.summary,
          score,
        };
      }

      return best;
    }, null);

    if (!bestPreview) {
      return section;
    }

    return {
      ...section,
      subtitleZh: section.subtitleZh?.trim() || bestPreview.subtitle,
      summaryZh: section.summaryZh?.trim() || bestPreview.summary,
    };
  });
}

function buildManualFallbackSections(
  bundle: TranscriptBundle,
  previewSections: Array<Pick<TranscriptSection, 'startLabel' | 'endLabel' | 'subtitle' | 'summary'>> = [],
): TranscriptSection[] {
  return attachSectionPreviewCopy(
    buildManualTranscriptSections(bundle),
    previewSections,
  );
}

function renderTranscriptIntro(
  bundle: TranscriptBundle,
  readingMode: ReadingMode,
  translatedTitleZh?: string,
  summaryZh?: string,
): string[] {
  const displayTitle = translatedTitleZh?.trim() || bundle.sourceTitle;
  const introText = summaryZh?.trim()
    || (readingMode === 'quick'
      ? '按内容结构速读视频内容，快速浏览每段摘要与时间范围。'
      : '直接阅读视频原始字幕，点击时间戳即可跳回对应片段。');
  const thumbnailUrl = bundle.thumbnailUrl || `https://i.ytimg.com/vi/${bundle.videoId}/hqdefault.jpg`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${bundle.videoId}`;

  return [
    [
      '<header class="article-hero" data-article-hero>',
      `<h1 data-article-title>${escapeHtml(displayTitle)}</h1>`,
      '<blockquote class="article-pullquote">',
      '<p class="transcript-kicker">',
      `<span data-article-kicker>${escapeHtml(introText)}</span>`,
      '</p>',
      '</blockquote>',
      '<figure class="article-media">',
      `<img class="article-media-image" data-article-thumb src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(displayTitle)} 缩略图" loading="eager" referrerpolicy="no-referrer" />`,
      '</figure>',
      '</header>',
    ].join(''),
  ];
}

function joinChunkText(left: string, right: string): string {
  if (!left) {
    return right;
  }

  if (/[-/([]$/.test(left) || /^[,.;:!?)]/.test(right)) {
    return `${left}${right}`;
  }

  return `${left} ${right}`;
}

function buildQuickReadChunks(chunks: TranscriptChunk[]): TranscriptChunk[] {
  const grouped: TranscriptChunk[] = [];
  let current: TranscriptChunk | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    const gap = chunk.start - current.end;
    const nextLength = current.text.length + 1 + chunk.text.length;
    const nextDuration = chunk.end - current.start;
    const shouldSplit =
      gap > 12 ||
      nextLength > 900 ||
      nextDuration > 150 ||
      (current.text.length > 420 && /[.!?。！？]$/.test(current.text));

    if (shouldSplit) {
      grouped.push(current);
      current = { ...chunk };
      continue;
    }

    current.end = chunk.end;
    current.text = joinChunkText(current.text, chunk.text);
  }

  if (current) {
    grouped.push(current);
  }

  return grouped;
}

function renderDetailedTranscriptChunk(chunk: TranscriptChunk): string {
  return [
    '<section class="qa transcript-line">',
    `<div class="qa-time"><span class="timestamp compact">${escapeHtml(formatTime(chunk.start))}</span></div>`,
    `<div class="qa-body transcript-body"><p>${escapeHtml(chunk.text)}</p></div>`,
    '</section>',
  ].join('');
}

function renderQuickReadChunk(chunk: TranscriptChunk): string {
  return [
    '<section class="qa">',
    `<div class="qa-time"><span class="timestamp">${escapeHtml(formatTime(chunk.start))}</span></div>`,
    `<div class="qa-body"><p>${escapeHtml(chunk.text)}</p></div>`,
    '</section>',
  ].join('');
}

type SectionThemeCopy = {
  subtitle: string;
  summary: string;
  topicTitleZh?: string;
  topicSummaryZh?: string;
  subtitleZh?: string;
  summaryZh?: string;
};

function resolveSectionThemeCopy(section: SectionThemeCopy): { title: string; summary: string } {
  const normalizedSubtitle = section.subtitle.trim();
  const normalizedSummary = section.summary.trim();
  const manualSubtitleMatch = normalizedSubtitle.match(MANUAL_SECTION_SUBTITLE_PATTERN);
  const manualSummaryMatch = normalizedSummary.match(MANUAL_SECTION_SUMMARY_PATTERN);
  const title = section.topicTitleZh?.trim()
    || section.subtitleZh?.trim()
    || (manualSubtitleMatch ? `片段 ${manualSubtitleMatch[1]}` : section.subtitle);
  const summary = section.topicSummaryZh?.trim()
    || section.summaryZh?.trim()
    || (manualSummaryMatch ? `该片段覆盖 ${manualSummaryMatch[1]} 到 ${manualSummaryMatch[2]} 的原文内容。` : section.summary);
  return { title, summary };
}

function renderSectionThemeHtml(section: SectionThemeCopy): string {
  const resolved = resolveSectionThemeCopy(section);
  const summaryHtml = resolved.summary
    ? `<span class="section-theme-divider">: </span><span class="section-theme-summary">${escapeHtml(resolved.summary)}</span>`
    : '';
  return [
    '<section class="section-theme-block">',
    `<h2 class="section-theme-title"><span class="section-theme-title-text">${escapeHtml(resolved.title)}</span>${summaryHtml}</h2>`,
    '</section>',
  ].join('');
}

function renderDialogueSliceMarkdown(
  section: SectionThemeCopy,
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>,
  groups: Array<{
    topicTitleZh: string;
    question?: { timestamp: string; speaker: string; textZh: string };
    answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
    turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  }> = [],
  showSpeakerNames = true,
): string {
  const mergedTurns = mergeConsecutiveDialogueTurns(turns);
  const mergedGroups = groups.length
    ? groups
      .map((group) => {
        const normalizedAnswers = normalizeAnswerTurnsForRendering(group.question, group.answers ?? []);
        const mergedGroupTurns = mergeConsecutiveDialogueTurns(group.turns);
        return {
          topicTitleZh: group.topicTitleZh.trim(),
          question: group.question,
          answers: normalizedAnswers,
          turns: group.question && normalizedAnswers.length
            ? [group.question, ...normalizedAnswers]
            : mergedGroupTurns,
        };
      })
      .filter((group) => group.topicTitleZh && group.turns.length)
    : [];
  const displayTurns = mergedGroups.length ? mergedGroups.flatMap((group) => group.turns) : mergedTurns;
  const shouldShowSpeakerNames = showSpeakerNames || displayTurns.some((turn) => !turn.speaker.trim());
  const speakerDisplayNames = shouldShowSpeakerNames
    ? buildSpeakerDisplayNames(displayTurns)
    : new Map<string, string>();

  return [
    renderSectionThemeHtml(section),
    (mergedGroups.length
      ? mergedGroups.map((group) => renderDialogueSubtopicHtml(group, speakerDisplayNames, shouldShowSpeakerNames)).join('')
      : renderDialogueTurnsHtml(mergedTurns, speakerDisplayNames, shouldShowSpeakerNames)),
  ].join('');
}

function reconcileDialogueGroup(
  group: {
    topicTitleZh: string;
    question?: { timestamp: string; speaker: string; textZh: string };
    answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
    turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  },
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>,
): {
  topicTitleZh: string;
  question?: { timestamp: string; speaker: string; textZh: string };
  answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
} {
  const normalizedAnswers = mergeConsecutiveDialogueTurns(group.answers ?? []);
  const normalizedGroup = {
    topicTitleZh: group.topicTitleZh.trim(),
    turns,
  } as {
    topicTitleZh: string;
    question?: { timestamp: string; speaker: string; textZh: string };
    answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
    turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  };

  if (
    group.question
    && normalizedAnswers.length
    && turns.length === 1 + normalizedAnswers.length
    && isSameDialogueTurn(turns[0], group.question)
    && normalizedAnswers.every((answer, index) => isSameDialogueTurn(turns[index + 1], answer))
  ) {
    normalizedGroup.question = group.question;
    normalizedGroup.answers = normalizedAnswers;
  }

  return normalizedGroup;
}

function canRenderDialogueQaGroup(group: {
  question?: { timestamp: string; speaker: string; textZh: string };
  answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
}): group is {
  question: { timestamp: string; speaker: string; textZh: string };
  answers: Array<{ timestamp: string; speaker: string; textZh: string }>;
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
} {
  const answers = group.answers ?? [];
  return (
    Boolean(group.question)
    && answers.length > 0
    && group.turns.length === 1 + answers.length
    && isSameDialogueTurn(group.turns[0], group.question!)
    && answers.every((answer, index) => isSameDialogueTurn(group.turns[index + 1], answer))
  );
}

function renderDialogueQaTurnHtml(
  turn: { timestamp: string; speaker: string; textZh: string },
  speakerDisplayNames: Map<string, string>,
  showSpeakerNames: boolean,
): string {
  const speaker = turn.speaker.trim();
  const roleLabel = showSpeakerNames
    ? (speakerDisplayNames.get(speaker) || getSpeakerDisplayName(speaker))
    : '';
  const speakerHtml = roleLabel
    ? `<div class="qa-speaker">${escapeHtml(roleLabel)}</div>`
    : '';

  return [
    '<section class="qa">',
    '<div class="qa-meta">',
    speakerHtml,
    `<div class="qa-time"><span class="timestamp rail compact">${escapeHtml(turn.timestamp)}</span></div>`,
    '</div>',
    `<div class="qa-body"><p>${escapeHtml(turn.textZh)}</p></div>`,
    '</section>',
  ].join('');
}

function renderDialogueSubtopicHtml(
  group: {
    topicTitleZh: string;
    question?: { timestamp: string; speaker: string; textZh: string };
    answers?: Array<{ timestamp: string; speaker: string; textZh: string }>;
    turns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  },
  speakerDisplayNames: Map<string, string>,
  showSpeakerNames: boolean,
): string {
  const bodyHtml = canRenderDialogueQaGroup(group)
    ? [
        renderDialogueQaTurnHtml(group.question, speakerDisplayNames, showSpeakerNames),
        ...group.answers.map((answer) => renderDialogueQaTurnHtml(answer, speakerDisplayNames, showSpeakerNames)),
      ].join('')
    : renderDialogueTurnsHtml(group.turns, speakerDisplayNames, showSpeakerNames);

  return [
    '<section class="dialogue-subtopic-block">',
    `<h3 class="dialogue-subtopic-title">${escapeHtml(group.topicTitleZh)}</h3>`,
    bodyHtml,
    '</section>',
  ].join('');
}

function renderDialogueTurnsHtml(
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>,
  speakerDisplayNames: Map<string, string>,
  showSpeakerNames: boolean,
): string {
  const lines: string[] = [];

  for (const turn of turns) {
    if (lines.length) {
      lines.push('');
    }

    const speaker = turn.speaker.trim();
    if (!showSpeakerNames) {
      lines.push(`[${turn.timestamp}] ${turn.textZh}`);
      continue;
    }

    lines.push(`[${turn.timestamp}] ${speakerDisplayNames.get(speaker) || getSpeakerDisplayName(speaker)}: ${turn.textZh}`);
  }

  return renderMarkdownDocument(lines.join('\n'));
}

function getSpeakerFirstToken(speaker: string): string {
  const normalized = speaker.trim();
  if (!normalized || !normalized.includes(' ')) {
    return normalized;
  }

  const [firstToken] = normalized.split(/\s+/);
  return firstToken || normalized;
}

function getSpeakerDisplayName(speaker: string): string {
  const normalized = speaker.trim();
  if (!normalized) {
    return 'host';
  }

  if (/^unknown$/i.test(normalized)) {
    return 'Host';
  }

  return getSpeakerFirstToken(normalized);
}

function buildSpeakerDisplayNames(
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>,
): Map<string, string> {
  const groupedByFirstName = new Map<string, Set<string>>();

  for (const turn of turns) {
    const normalized = turn.speaker.trim();
    if (!normalized) {
      continue;
    }

    const firstToken = getSpeakerFirstToken(normalized);
    const existing = groupedByFirstName.get(firstToken) || new Set<string>();
    existing.add(normalized);
    groupedByFirstName.set(firstToken, existing);
  }

  const displayNames = new Map<string, string>();
  for (const turn of turns) {
    const normalized = turn.speaker.trim();
    if (!normalized || displayNames.has(normalized)) {
      continue;
    }

    if (/^unknown$/i.test(normalized)) {
      displayNames.set(normalized, 'Host');
      continue;
    }

    const firstToken = getSpeakerFirstToken(normalized);
    const collidingSpeakers = groupedByFirstName.get(firstToken);
    if (normalized.includes(' ') && collidingSpeakers && collidingSpeakers.size > 1) {
      displayNames.set(normalized, normalized);
    } else {
      displayNames.set(normalized, firstToken);
    }
  }

  return displayNames;
}

function mergeConsecutiveDialogueTurns(
  turns: Array<{ timestamp: string; speaker: string; textZh: string }>,
): Array<{ timestamp: string; speaker: string; textZh: string }> {
  const merged: Array<{ timestamp: string; speaker: string; textZh: string }> = [];

  for (const turn of turns) {
    const speaker = turn.speaker.trim();
    const textZh = turn.textZh.trim();
    if (!textZh) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && speaker && previous.speaker.trim() === speaker) {
      previous.textZh = joinDialogueText(previous.textZh, textZh);
      continue;
    }

    merged.push({
      timestamp: turn.timestamp,
      speaker,
      textZh,
    });
  }

  return merged;
}

function normalizeAnswerTurnsForRendering(
  question: { timestamp: string; speaker: string; textZh: string } | undefined,
  answers: Array<{ timestamp: string; speaker: string; textZh: string }>,
): Array<{ timestamp: string; speaker: string; textZh: string }> {
  const mergedAnswers = mergeConsecutiveDialogueTurns(answers);
  const questionSpeakerKey = question?.speaker.trim().toLowerCase() || '';
  const seenSpeakers = new Set<string>();
  const normalized: Array<{ timestamp: string; speaker: string; textZh: string }> = [];

  for (const answer of mergedAnswers) {
    const speaker = answer.speaker.trim();
    if (!speaker) {
      normalized.push(answer);
      continue;
    }

    const speakerKey = speaker.toLowerCase();
    if (seenSpeakers.has(speakerKey)) {
      continue;
    }

    if (questionSpeakerKey && speakerKey === questionSpeakerKey && seenSpeakers.size > 0) {
      continue;
    }

    seenSpeakers.add(speakerKey);
    normalized.push(answer);
  }

  return normalized;
}

function isSameDialogueTurn(
  left: { timestamp: string; speaker: string; textZh: string },
  right: { timestamp: string; speaker: string; textZh: string },
): boolean {
  return (
    left.timestamp === right.timestamp
    && left.speaker.trim() === right.speaker.trim()
    && left.textZh.trim() === right.textZh.trim()
  );
}

function mergeDialogueBoundaryTurns(
  previousTurns: Array<{ timestamp: string; speaker: string; textZh: string }>,
  nextTurns: Array<{ timestamp: string; speaker: string; textZh: string }>,
): {
  previousTurns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  nextTurns: Array<{ timestamp: string; speaker: string; textZh: string }>;
  movedTurn: { timestamp: string; speaker: string; textZh: string } | null;
} {
  const previousLastTurn = previousTurns.at(-1);
  const nextFirstTurn = nextTurns[0];
  const previousSpeaker = previousLastTurn?.speaker.trim() || '';
  const nextSpeaker = nextFirstTurn?.speaker.trim() || '';

  if (!previousLastTurn || !nextFirstTurn || !previousSpeaker || previousSpeaker !== nextSpeaker) {
    return {
      previousTurns,
      nextTurns,
      movedTurn: null,
    };
  }

  return {
    previousTurns: [
      ...previousTurns.slice(0, -1),
      {
        ...previousLastTurn,
        speaker: previousSpeaker,
        textZh: joinDialogueText(previousLastTurn.textZh, nextFirstTurn.textZh),
      },
    ],
    nextTurns: nextTurns.slice(1),
    movedTurn: nextFirstTurn,
  };
}

function normalizeDialogueGroups(
  groups: TranscriptDialogueSliceResult['groups'],
): TranscriptDialogueSliceResult['groups'] {
  const normalized = groups
    .map((group) => reconcileDialogueGroup(group, mergeConsecutiveDialogueTurns(group.turns)))
    .filter((group) => group.topicTitleZh && group.turns.length);

  let index = 1;
  while (index < normalized.length) {
    const mergedBoundary = mergeDialogueBoundaryTurns(
      normalized[index - 1].turns,
      normalized[index].turns,
    );

    if (wouldOrphanStructuredGroupQuestion(normalized[index], mergedBoundary.movedTurn)) {
      index += 1;
      continue;
    }

    normalized[index - 1] = reconcileDialogueGroup(normalized[index - 1], mergedBoundary.previousTurns);
    normalized[index] = reconcileDialogueGroup(normalized[index], mergedBoundary.nextTurns);

    if (!normalized[index].turns.length) {
      normalized.splice(index, 1);
      continue;
    }

    index += 1;
  }

  return normalized;
}

function mergeMovedTurnIntoLastGroup(
  groups: TranscriptDialogueSliceResult['groups'],
  movedTurn: { timestamp: string; speaker: string; textZh: string } | null,
): TranscriptDialogueSliceResult['groups'] {
  if (!movedTurn || !groups.length) {
    return groups;
  }

  const lastGroup = groups.at(-1);
  const lastTurn = lastGroup?.turns.at(-1);
  if (!lastGroup || !lastTurn) {
    return groups;
  }

  const mergedLastTurn = lastTurn.speaker.trim() === movedTurn.speaker.trim()
    ? {
        ...lastTurn,
        speaker: lastTurn.speaker.trim(),
        textZh: joinDialogueText(lastTurn.textZh, movedTurn.textZh),
      }
    : movedTurn;

  return [
    ...groups.slice(0, -1),
    reconcileDialogueGroup(lastGroup, lastTurn.speaker.trim() === movedTurn.speaker.trim()
      ? [...lastGroup.turns.slice(0, -1), mergedLastTurn]
      : [...lastGroup.turns, movedTurn]),
  ];
}

function removeMovedTurnFromFirstGroup(
  groups: TranscriptDialogueSliceResult['groups'],
  movedTurn: { timestamp: string; speaker: string; textZh: string } | null,
): TranscriptDialogueSliceResult['groups'] {
  if (!movedTurn || !groups.length) {
    return groups;
  }

  let hasRemoved = false;

  return groups
    .map((group) => {
      if (hasRemoved || !group.turns.length) {
        return group;
      }

      if (!isSameDialogueTurn(group.turns[0], movedTurn)) {
        return group;
      }

      hasRemoved = true;
      return reconcileDialogueGroup(group, group.turns.slice(1));
    })
    .filter((group) => group.turns.length);
}

function wouldOrphanStructuredGroupQuestion(
  group: TranscriptDialogueSliceResult['groups'][number] | undefined,
  movedTurn: { timestamp: string; speaker: string; textZh: string } | null,
): boolean {
  return Boolean(group?.question && movedTurn && isSameDialogueTurn(group.question, movedTurn));
}

function wouldOrphanStructuredQuestion(
  next: TranscriptDialogueSliceResult,
  movedTurn: { timestamp: string; speaker: string; textZh: string } | null,
): boolean {
  return wouldOrphanStructuredGroupQuestion(next.groups.at(0), movedTurn);
}

function normalizeDialogueSliceTurns(
  slice: TranscriptDialogueSliceResult,
): TranscriptDialogueSliceResult {
  const mergedTurns = mergeConsecutiveDialogueTurns(slice.turns);
  const normalizedGroups = normalizeDialogueGroups(slice.groups ?? []);

  return {
    ...slice,
    turns: mergedTurns,
    groups: normalizedGroups,
  };
}

export function mergeDialogueSectionBoundary(
  previous: TranscriptDialogueSliceResult,
  next: TranscriptDialogueSliceResult,
  showSpeakerNames: boolean,
): [TranscriptDialogueSliceResult, TranscriptDialogueSliceResult] {
  const normalizedPrevious = normalizeDialogueSliceTurns(previous);
  const normalizedNext = normalizeDialogueSliceTurns(next);

  if (!showSpeakerNames) {
    return [normalizedPrevious, normalizedNext];
  }

  const mergedBoundary = mergeDialogueBoundaryTurns(normalizedPrevious.turns, normalizedNext.turns);

  if (!mergedBoundary.movedTurn) {
    return [normalizedPrevious, normalizedNext];
  }

  if (wouldOrphanStructuredQuestion(normalizedNext, mergedBoundary.movedTurn)) {
    return [normalizedPrevious, normalizedNext];
  }

  return [
    normalizeDialogueSliceTurns({
      ...normalizedPrevious,
      turns: mergedBoundary.previousTurns,
      groups: mergeMovedTurnIntoLastGroup(normalizedPrevious.groups, mergedBoundary.movedTurn),
    }),
    normalizeDialogueSliceTurns({
      ...normalizedNext,
      turns: mergedBoundary.nextTurns,
      groups: removeMovedTurnFromFirstGroup(normalizedNext.groups, mergedBoundary.movedTurn),
    }),
  ];
}

function joinDialogueText(left: string, right: string): string {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (/[\s([{'"“‘-]$/.test(left) || /^[,.;:!?，。！？、；：)\]}%'"”’]/.test(right)) {
    return `${left}${right}`;
  }

  if (/[A-Za-z0-9.]$/.test(left) || /^[A-Za-z0-9]/.test(right)) {
    return `${left} ${right}`;
  }

  return `${left}${right}`;
}

function renderFallbackSliceHtml(
  startLabel: string,
  endLabel: string,
  chunks: TranscriptChunk[],
): string {
  return [
    `<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">${escapeHtml(`${startLabel}-${endLabel}`)}</span></span><span class="section-title">原文片段</span></h2>`,
    ...chunks.map(renderDetailedTranscriptChunk),
  ].join('');
}

function renderFallbackSectionHtml(
  section: {
    startLabel: string;
    endLabel: string;
    subtitle: string;
    summary: string;
    transcript: string;
    topicTitleZh?: string;
    topicSummaryZh?: string;
    subtitleZh?: string;
    summaryZh?: string;
  },
): string {
  const lines = section.transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = lines.map((line) => {
    const match = line.match(/^\[([0-9:]+(?:-[0-9:]+)?)\]\s*(.+)$/);
    if (!match) {
      return [
        '<section class="qa transcript-line">',
        `<div class="qa-body transcript-body"><p>${escapeHtml(line)}</p></div>`,
        '</section>',
      ].join('');
    }

    return [
      '<section class="qa transcript-line">',
      `<div class="qa-time"><span class="timestamp compact">${escapeHtml(match[1])}</span></div>`,
      `<div class="qa-body transcript-body"><p>${escapeHtml(match[2])}</p></div>`,
      '</section>',
    ].join('');
  });

  return [
    renderSectionThemeHtml(section),
    `<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">${escapeHtml(`${section.startLabel}-${section.endLabel}`)}</span></span><span class="section-title">原文片段</span></h2>`,
    ...items,
  ].join('');
}

function renderDialogueLoadingHtml(): string {
  return renderDialogueLoadingCardHtml(
    '正在继续生成内容',
    '努力生成高质量的剩余内容中，请稍等。。。',
    true,
    0,
  );
}

function getLoadingHintCopy(hints: readonly LoadingHintCopy[], offset = 0): LoadingHintCopy {
  if (!hints.length) {
    return {
      title: '正在继续生成内容',
      body: '努力生成高质量的剩余内容中，请稍等。。。',
    };
  }

  const normalizedOffset = ((offset % hints.length) + hints.length) % hints.length;
  return hints[normalizedOffset];
}

function renderDialogueLoadingCardHtml(
  title: string,
  copy: string,
  trackAsGlobalLoading = false,
  hintOffset?: number,
): string {
  const attributes = [
    'class="dialogue-loading-block"',
    trackAsGlobalLoading ? 'data-dialogue-loading' : '',
    typeof hintOffset === 'number' ? `data-loading-hint-offset="${hintOffset}"` : '',
  ].filter(Boolean).join(' ');

  return [
    `<section ${attributes}>`,
    '<div class="dialogue-loading-head">',
    '<span class="dialogue-loading-dot" aria-hidden="true"></span>',
    `<p class="dialogue-loading-title">${escapeHtml(title)}</p>`,
    '</div>',
    `<p class="dialogue-loading-copy">${escapeHtml(copy)}</p>`,
    '</section>',
  ].join('');
}

function renderQuickSectionSummaryHtml(
  result: QuickTranscriptSectionSummaryResult,
): string {
  return [
    renderSectionThemeHtml(result.section),
    `<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">${escapeHtml(`${result.section.startLabel}-${result.section.endLabel}`)}</span></span><span class="section-title">核心问答</span></h2>`,
    '<section class="qa transcript-line">',
    '<div class="qa-time"><span class="timestamp compact">问题</span></div>',
    `<div class="qa-body transcript-body"><p>${escapeHtml(result.questionZh)}</p></div>`,
    '</section>',
    '<section class="qa transcript-line">',
    '<div class="qa-time"><span class="timestamp compact">回答</span></div>',
    `<div class="qa-body transcript-body"><p>${escapeHtml(result.answerZh)}</p></div>`,
    '</section>',
  ].join('');
}

function renderQuickSectionFallbackHtml(
  section: TranscriptSection,
): string {
  return [
    renderSectionThemeHtml(section),
    `<h2 class="section-heading"><span class="section-rail"><span class="timestamp rail">${escapeHtml(`${section.startLabel}-${section.endLabel}`)}</span></span><span class="section-title">切片范围</span></h2>`,
  ].join('');
}

function buildTranscriptBundleFromStoredSource(source: StoredTranslationSource): TranscriptBundle {
  return {
    videoId: source.videoId,
    sourceTitle: source.sourceTitle,
    sourceAuthor: source.sourceAuthor,
    channelId: '',
    languageCode: source.sourceLanguageCode,
    languageName: source.sourceLanguage,
    isAutoGenerated: source.isAutoGenerated,
    durationSeconds: source.durationSeconds,
    viewCount: 0,
    thumbnailUrl: source.thumbnailUrl,
    segments: [],
    chunks: [],
    transcriptText: '',
  };
}

function buildStoredRenderingMeta(
  source: StoredTranslationSource,
  readingMode: ReadingMode,
  rendering: StoredQuickRendering | StoredFullRendering,
): Record<string, unknown> {
  return {
    ...buildBundleMeta(buildTranscriptBundleFromStoredSource(source), readingMode),
    translatedTitleZh: rendering.hero.translatedTitleZh,
    summaryZh: rendering.hero.summaryZh,
    geminiTranslationComplete: rendering.geminiTranslationComplete,
    translationNeedsRefresh: rendering.translationNeedsRefresh,
  };
}

function renderStoredQuickSectionHtml(section: StoredQuickSection): string {
  return renderQuickSectionFallbackHtml({
    startLabel: section.startLabel,
    endLabel: section.endLabel,
    subtitle: section.titleZh,
    summary: section.summaryZh,
    transcript: '',
    topicTitleZh: section.titleZh,
    topicSummaryZh: section.summaryZh,
    subtitleZh: section.titleZh,
    summaryZh: section.summaryZh,
  });
}

function renderStoredFullSectionHtml(
  section: StoredFullSection,
  showSpeakerNames: boolean,
): string {
  return renderDialogueSliceMarkdown(
    {
      subtitle: section.titleZh,
      summary: section.summaryZh,
      topicTitleZh: section.titleZh,
      topicSummaryZh: section.summaryZh,
      subtitleZh: section.titleZh,
      summaryZh: section.summaryZh,
    },
    section.turns,
    section.groups,
    showSpeakerNames,
  );
}

function wrapDialogueSectionHtml(sectionId: string, html: string): string {
  return `<div class="dialogue-section-block" data-dialogue-section-id="${escapeHtml(sectionId)}">${html}</div>`;
}

function renderHiddenDialogueSectionHtml(sectionId: string): string {
  return `<div class="dialogue-section-block" data-dialogue-section-id="${escapeHtml(sectionId)}" hidden aria-hidden="true"></div>`;
}

function renderDialogueSectionPreviewHtml(section: TranscriptSection, hintOffset: number): string {
  const hint = getLoadingHintCopy(FULL_DIALOGUE_LOADING_HINTS, hintOffset);
  return [
    renderSectionThemeHtml(section),
    renderDialogueLoadingCardHtml(
      hint.title,
      hint.body,
      false,
      hintOffset,
    ),
  ].join('');
}

function logGenerate(event: string, details: Record<string, unknown>): void {
  console.log('[generate]', event, JSON.stringify(details));
}

export async function handleGenerateRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  try {
    const body = await parseRequestBody(request);
    const youtubeUrl = body.youtubeUrl?.trim();
    const readingMode = normalizeReadingMode(body.readingMode);
    const requestedLocalDayKey = getRequestedLocalDayKey(body);
    const effectiveEnv = getEffectiveGeminiEnv(env, body);
    const transcriptProviderOptions = getTranscriptProviderOptions(env);
    if (!youtubeUrl) {
      throw new AppError('missing_url', '请输入一个带字幕的 YouTube 视频链接。', 400);
    }

    const { response, writer } = createSseResponse();
    const cachedTranscript = getUsableCachedTranscript(body, youtubeUrl);
    const requestedVideoId = tryExtractVideoId(youtubeUrl);
    const sharedArticleCacheEnabled = shouldUseSharedArticleCache(body);

    logGenerate('request_start', {
      youtubeUrl,
      cacheHit: Boolean(cachedTranscript),
      readingMode,
      requestedVideoId,
      sharedArticleCacheEnabled,
    });
    request.signal.addEventListener('abort', () => {
      logGenerate('request_aborted', { youtubeUrl, readingMode });
      void writer.abort(request.signal.reason).catch(() => {});
    }, { once: true });

    ctx.waitUntil(
      (async () => {
        try {
          throwIfAborted(request.signal);

          const articleHtmlParts: string[] = [];
          const dialogueHtmlParts: string[] = [];
          const dialogueSectionIndexes = new Map<string, number>();
          const emitHtml = async (
            target: 'article' | 'dialogue' | 'dialogue-loading' | 'dialogue-replace',
            html: string,
            sectionId?: string,
          ): Promise<void> => {
            await sendSseEvent(writer, 'html', { target, html, sectionId });

            if (target === 'article') {
              articleHtmlParts.push(html);
              return;
            }

            if (target === 'dialogue') {
              if (sectionId) {
                dialogueSectionIndexes.set(sectionId, dialogueHtmlParts.length);
              }
              dialogueHtmlParts.push(html);
              return;
            }

            if (target === 'dialogue-replace') {
              const existingIndex = sectionId ? dialogueSectionIndexes.get(sectionId) : undefined;
              if (existingIndex == null) {
                if (sectionId) {
                  dialogueSectionIndexes.set(sectionId, dialogueHtmlParts.length);
                }
                dialogueHtmlParts.push(html);
                return;
              }

              dialogueHtmlParts[existingIndex] = html;
            }
          };
          const getRenderedArticleHtml = (): string => (
            articleHtmlParts.join('') + dialogueHtmlParts.join('')
          );

          if (requestedVideoId) {
            const cachedArticle = await readCachedGeneratedArticle(env, requestedVideoId, readingMode);
            if (cachedArticle) {
              if (cachedArticleNeedsRefresh(cachedArticle)) {
                logGenerate('cloud_article_cache_refresh_required', {
                  videoId: requestedVideoId,
                  readingMode,
                });
              } else {
                const cachedCloudTranscript = cachedTranscript
                  ?? await readCachedTranscriptBundle(env, requestedVideoId);

                if (cachedCloudTranscript) {
                  await sendSseEvent(writer, 'cache', {
                    videoId: cachedCloudTranscript.videoId,
                    bundle: cachedCloudTranscript,
                  });
                }

                logGenerate('cloud_article_cache_hit', {
                  videoId: requestedVideoId,
                  readingMode,
                });

                await sendSseEvent(writer, 'meta', {
                  ...cachedArticle.meta,
                  stage: 'cloud_article_cache_hit',
                  statusText: '命中云端内容缓存，正在回填结果',
                });
                await emitHtml('article', cachedArticle.articleHtml);
                await sendSseEvent(writer, 'meta', {
                  ...cachedArticle.meta,
                  stage: 'complete',
                  statusText: '内容已完成',
                  consumesDailyGeminiTranslationLimit: false,
                });
                await sendSseEvent(writer, 'done', { ok: true });
                return;
              }
            }
          }

          if (requestedVideoId) {
            const curatedContent = getCuratedHotTranslationContent(requestedVideoId);
            const curatedRendering = curatedContent?.renderings[readingMode];

            if (curatedContent && curatedRendering) {
              const curatedBundle = buildTranscriptBundleFromStoredSource(curatedContent.source);
              const curatedMeta = buildStoredRenderingMeta(
                curatedContent.source,
                readingMode,
                curatedRendering,
              );

              logGenerate('curated_hot_content_hit', {
                videoId: requestedVideoId,
                readingMode,
              });

              await sendSseEvent(writer, 'meta', {
                ...curatedMeta,
                stage: 'writing',
                statusText: '命中热门内容，正在回填结果',
              });

              for (const html of renderTranscriptIntro(
                curatedBundle,
                readingMode,
                curatedRendering.hero.translatedTitleZh,
                curatedRendering.hero.summaryZh,
              )) {
                await emitHtml('article', html);
              }

              if (readingMode === 'quick') {
                const quickRendering = curatedRendering as StoredQuickRendering;
                for (const section of quickRendering.sections) {
                  await emitHtml('dialogue', renderStoredQuickSectionHtml(section), section.id);
                }
              } else {
                const fullRendering = curatedRendering as StoredFullRendering;
                const showSpeakerNames = fullRendering.speakers.length > 0;
                for (const section of fullRendering.sections) {
                  await emitHtml(
                    'dialogue',
                    wrapDialogueSectionHtml(
                      section.id,
                      renderStoredFullSectionHtml(section, showSpeakerNames),
                    ),
                    section.id,
                  );
                }
              }

              const completionMeta = {
                ...curatedMeta,
                stage: 'complete',
                statusText: '内容已完成',
                consumesDailyGeminiTranslationLimit: false,
              };

              if (sharedArticleCacheEnabled) {
                const renderedArticleHtml = getRenderedArticleHtml();
                if (renderedArticleHtml.trim()) {
                  ctx.waitUntil(
                    writeCachedGeneratedArticle(
                      env,
                      requestedVideoId,
                      readingMode,
                      renderedArticleHtml,
                      completionMeta,
                    ),
                  );
                }
              }

              await sendSseEvent(writer, 'meta', completionMeta);
              await sendSseEvent(writer, 'done', { ok: true });
              return;
            }
          }

          if (
            !hasCustomGeminiKey(body)
            && getDailySuccessfulGeminiTranslationCount(request, requestedLocalDayKey) >= DAILY_SUCCESSFUL_GEMINI_TRANSLATION_LIMIT
          ) {
            throw new AppError(
              'daily_gemini_translation_limit_exceeded',
              `今天最多可完成 ${DAILY_SUCCESSFUL_GEMINI_TRANSLATION_LIMIT} 次成功的 Gemini 翻译。你可以在设置里填入你自己的 Gemini key 后继续使用。`,
              429,
            );
          }

          assertGeminiKeyConfigured(effectiveEnv, readingMode);

          let transcriptBundle: TranscriptBundle;
          let transcriptSource: 'client' | 'cloud' | 'fetch' = 'fetch';
          let translatedTitleZh = '';
          let summaryZh = '';
          let geminiTranslationComplete = false;
          let translationNeedsRefresh = false;

          if (cachedTranscript) {
            transcriptBundle = cachedTranscript;
            transcriptSource = 'client';
            logGenerate('cache_hit', {
              videoId: transcriptBundle.videoId,
              chunks: transcriptBundle.chunks.length,
            });
            await sendSseEvent(writer, 'meta', {
              stage: 'cache_hit',
              statusText: '命中本地字幕缓存，正在准备内容',
              ...buildBundleMeta(transcriptBundle, readingMode),
              transcriptReady: true,
            });
          } else if (requestedVideoId) {
            const cloudCachedTranscript = await readCachedTranscriptBundle(env, requestedVideoId);
            if (cloudCachedTranscript) {
              transcriptBundle = cloudCachedTranscript;
              transcriptSource = 'cloud';
              logGenerate('cloud_transcript_cache_hit', {
                videoId: transcriptBundle.videoId,
                chunks: transcriptBundle.chunks.length,
              });
              await sendSseEvent(writer, 'meta', {
                stage: 'cloud_transcript_cache_hit',
                statusText: '命中云端字幕缓存，正在准备内容',
                ...buildBundleMeta(transcriptBundle, readingMode),
                transcriptReady: true,
              });
              await sendSseEvent(writer, 'cache', {
                videoId: transcriptBundle.videoId,
                bundle: transcriptBundle,
              });
            } else {
              throwIfAborted(request.signal);
              logGenerate('fetch_start', { youtubeUrl });
              await sendSseEvent(writer, 'meta', {
                stage: 'fetching',
                statusText: '正在抓取字幕与视频信息',
              });

              transcriptBundle = await fetchTranscriptBundle(
                youtubeUrl,
                {
                  onPreviewReady: async (payload) => {
                    throwIfAborted(request.signal);
                    await sendSseEvent(writer, 'meta', {
                      stage: 'preview_ready',
                      statusText: '首批字幕已就绪，正在继续抓取完整内容',
                      videoId: payload.videoId,
                      sourceTitle: payload.sourceTitle,
                      sourceAuthor: payload.sourceAuthor,
                      sourceLanguage: payload.sourceLanguage,
                      sourceLanguageCode: payload.sourceLanguageCode,
                      isAutoGenerated: payload.isAutoGenerated,
                      thumbnailUrl: payload.thumbnailUrl,
                      transcriptReady: false,
                      resultMode: 'transcript',
                      readingMode,
                      readingModeLabel: getReadingModeLabel(readingMode),
                    });
                  },
                },
                request.signal,
                transcriptProviderOptions,
              );

              await sendSseEvent(writer, 'cache', {
                videoId: transcriptBundle.videoId,
                bundle: transcriptBundle,
              });

              ctx.waitUntil(writeCachedTranscriptBundle(env, transcriptBundle));

              logGenerate('fetch_complete', {
                videoId: transcriptBundle.videoId,
                chunks: transcriptBundle.chunks.length,
                languageCode: transcriptBundle.languageCode,
              });
            }
          } else {
            throwIfAborted(request.signal);
            logGenerate('fetch_start', { youtubeUrl });
            await sendSseEvent(writer, 'meta', {
              stage: 'fetching',
              statusText: '正在抓取字幕与视频信息',
            });

            transcriptBundle = await fetchTranscriptBundle(
              youtubeUrl,
              {
                onPreviewReady: async (payload) => {
                  throwIfAborted(request.signal);
                  await sendSseEvent(writer, 'meta', {
                    stage: 'preview_ready',
                    statusText: '首批字幕已就绪，正在继续抓取完整内容',
                    videoId: payload.videoId,
                    sourceTitle: payload.sourceTitle,
                    sourceAuthor: payload.sourceAuthor,
                    sourceLanguage: payload.sourceLanguage,
                    sourceLanguageCode: payload.sourceLanguageCode,
                    isAutoGenerated: payload.isAutoGenerated,
                    thumbnailUrl: payload.thumbnailUrl,
                    transcriptReady: false,
                    resultMode: 'transcript',
                    readingMode,
                    readingModeLabel: getReadingModeLabel(readingMode),
                  });
                },
              },
              request.signal,
              transcriptProviderOptions,
            );

            await sendSseEvent(writer, 'cache', {
              videoId: transcriptBundle.videoId,
              bundle: transcriptBundle,
            });

            ctx.waitUntil(writeCachedTranscriptBundle(env, transcriptBundle));

            logGenerate('fetch_complete', {
              videoId: transcriptBundle.videoId,
              chunks: transcriptBundle.chunks.length,
              languageCode: transcriptBundle.languageCode,
            });
          }

          logGenerate('transcript_ready', {
            videoId: transcriptBundle.videoId,
            chunks: transcriptBundle.chunks.length,
          });
          console.log(
            '[generate] original_transcript',
            transcriptBundle.videoId,
            '\n' + transcriptBundle.transcriptText,
          );
          await sendSseEvent(writer, 'meta', {
            stage: 'transcript_ready',
            statusText: '字幕已抓取，正在排版内容',
            ...buildBundleMeta(transcriptBundle, readingMode),
            transcriptReady: true,
          });

          if (readingMode === 'quick') {
            throwIfAborted(request.signal);
            try {
              logGenerate('quick_sectioning_mode', {
                videoId: transcriptBundle.videoId,
                durationSeconds: transcriptBundle.durationSeconds,
              });

              for (const html of renderTranscriptIntro(transcriptBundle, readingMode, translatedTitleZh, summaryZh)) {
                await emitHtml('article', html);
              }
              await emitHtml('dialogue-loading', renderDialogueLoadingHtml());

              await sendSseEvent(writer, 'meta', {
                stage: 'analyzing',
                statusText: '正在让 Gemini 按问题结构切片',
                ...buildBundleMeta(transcriptBundle, readingMode),
              });

              const sectionGeneration = await generateTranscriptSectionsWithBoundaryRetry(
                transcriptBundle,
                effectiveEnv,
                readingMode,
                request.signal,
                {
                  onRetry: async ({ attempt, maxRetries, error }) => {
                    logGenerate('section_boundary_retry', {
                      videoId: transcriptBundle.videoId,
                      readingMode,
                      attempt,
                      maxRetries,
                      code: error.code,
                      message: error.publicMessage,
                    });
                    await sendSseEvent(writer, 'meta', {
                      stage: 'analyzing',
                      statusText: `分段时间戳对齐失败，正在自动重试（${attempt}/${maxRetries}）`,
                      ...buildBundleMeta(transcriptBundle, readingMode),
                    });
                  },
                },
              );
              const sectionsResult = sectionGeneration.result;
              translatedTitleZh = sectionsResult.titleTranslationZh?.trim() || translatedTitleZh;
              summaryZh = sectionsResult.summaryZh?.trim() || summaryZh;
              const sections = renumberManualPlaceholderSections(
                mergeQuestionAnswerSplitSections(
                  sectionGeneration.sections,
                ),
              );

              logGenerate('quick_sections_ready', {
                videoId: transcriptBundle.videoId,
                sections: sections.length,
                model: sectionsResult.model,
                hasTranslatedTitle: Boolean(translatedTitleZh),
                hasHighlightSentence: Boolean(summaryZh),
                speakers: sectionsResult.speakers?.length ?? 0,
              });

              await sendSseEvent(writer, 'meta', {
                stage: 'writing',
                statusText: '正在写入切片摘要',
                ...buildBundleMeta(transcriptBundle, readingMode),
                translatedTitleZh,
                summaryZh,
              });

              for (let index = 0; index < sections.length; index += 1) {
                throwIfAborted(request.signal);
                const section = sections[index];
                await emitHtml('dialogue', renderQuickSectionFallbackHtml(section));

                await sendSseEvent(writer, 'meta', {
                  stage: 'writing',
                  statusText: `正在写入切片摘要（${index + 1}/${sections.length}）`,
                  ...buildBundleMeta(transcriptBundle, readingMode),
                });
              }
              geminiTranslationComplete = sections.length > 0;
            } catch (error) {
              if (isAbortError(error)) {
                throw error;
              }

              const appError = AppError.from(error);
              const latestSectioningResult = error instanceof SectionBoundaryResolutionError
                ? error.latestResult
                : null;
              translationNeedsRefresh = true;
              translatedTitleZh = latestSectioningResult?.titleTranslationZh?.trim() || translatedTitleZh;
              summaryZh = latestSectioningResult?.summaryZh?.trim() || summaryZh;
              logGenerate('quick_flow_failed', {
                videoId: transcriptBundle.videoId,
                code: appError.code,
                message: appError.publicMessage,
              });
              await sendSseEvent(writer, 'warning', {
                code: appError.code,
                title: '已回退到固定时间分段',
                message: `AI 分段失败，已自动回退到固定 20 分钟分段。${appError.publicMessage ? ` ${appError.publicMessage}` : ''}`.trim(),
              });

              await sendSseEvent(writer, 'meta', {
                stage: 'writing',
                statusText: 'AI 分段失败，回退到固定时间分段',
                ...buildBundleMeta(transcriptBundle, readingMode),
                translatedTitleZh,
                summaryZh,
              });

              const fallbackSections = buildManualFallbackSections(
                transcriptBundle,
                latestSectioningResult?.sections ?? [],
              );
              for (const chunk of fallbackSections) {
                throwIfAborted(request.signal);
                await emitHtml('dialogue', renderQuickSectionFallbackHtml(chunk));
              }
            }
          } else if (readingMode === 'full') {
            throwIfAborted(request.signal);
            await sendSseEvent(writer, 'meta', {
              stage: 'analyzing',
              statusText: '正在调用 Gemini 生成高质量内容',
              ...buildBundleMeta(transcriptBundle, readingMode),
            });

            try {
              logGenerate('analysis_mode', {
                videoId: transcriptBundle.videoId,
                firstCallTranscriptSeconds: transcriptBundle.durationSeconds,
                firstCallSliced: false,
              });

              let overviewResult: TranscriptSectionsResult;
              let sectioningWarning = '';
              const insights: {
                titleTranslationZh: string;
                summaryZh: string;
                summary: string;
                speakers: string[];
                model: string;
              } = {
                titleTranslationZh: '',
                summaryZh: '',
                summary: '',
                speakers: [],
                model: '',
              };

              let sectionsResult: { sections: TranscriptSection[]; model: string };
              try {
                const overviewGeneration = await generateTranscriptSectionsWithBoundaryRetry(
                  transcriptBundle,
                  effectiveEnv,
                  'quick',
                  request.signal,
                  {
                    onRetry: async ({ attempt, maxRetries, error }) => {
                      logGenerate('section_boundary_retry', {
                        videoId: transcriptBundle.videoId,
                        readingMode,
                        attempt,
                        maxRetries,
                        code: error.code,
                        message: error.publicMessage,
                      });
                      await sendSseEvent(writer, 'meta', {
                        stage: 'analyzing',
                        statusText: `分段时间戳对齐失败，正在自动重试（${attempt}/${maxRetries}）`,
                        ...buildBundleMeta(transcriptBundle, readingMode),
                      });
                    },
                  },
                );
                overviewResult = overviewGeneration.result;
                sectionsResult = {
                  sections: mergeQuestionAnswerSplitSections(overviewGeneration.sections),
                  model: overviewResult.model,
                };
              } catch (error) {
                if (isAbortError(error)) {
                  throw error;
                }
                if (!(error instanceof SectionBoundaryResolutionError)) {
                  const sectionError = AppError.from(error);
                  logGenerate('full_sections_failed', {
                    videoId: transcriptBundle.videoId,
                    code: sectionError.code,
                    message: sectionError.publicMessage,
                  });
                  sectioningWarning = sectionError.publicMessage;
                  translationNeedsRefresh = true;
                  overviewResult = {
                    sections: [],
                    model: '',
                  };
                  sectionsResult = {
                    sections: buildManualFallbackSections(transcriptBundle),
                    model: MANUAL_SECTION_MODEL,
                  };
                } else {
                  overviewResult = error.latestResult;
                  const sectionError = AppError.from(error);
                  logGenerate('full_sections_failed', {
                    videoId: transcriptBundle.videoId,
                    code: sectionError.code,
                    message: sectionError.publicMessage,
                  });
                  sectioningWarning = sectionError.publicMessage;
                  translationNeedsRefresh = true;

                  sectionsResult = {
                    sections: buildManualFallbackSections(
                      transcriptBundle,
                      overviewResult.sections,
                    ),
                    model: MANUAL_SECTION_MODEL,
                  };
                }
              }
              insights.titleTranslationZh = overviewResult.titleTranslationZh?.trim() || '';
              insights.summaryZh = overviewResult.summaryZh?.trim() || '';
              insights.summary = overviewResult.summary?.trim() || '';
              insights.speakers = overviewResult.speakers ?? [];
              insights.model = overviewResult.model;
              translatedTitleZh = insights.titleTranslationZh;
              summaryZh = insights.summaryZh;
              logGenerate('insights_ready', {
                videoId: transcriptBundle.videoId,
                model: insights.model,
                speakers: insights.speakers.length,
                sections: sectionsResult.sections.length,
                sectionsModel: sectionsResult.model,
              });
              await sendSseEvent(writer, 'insights', {
                ...insights,
                titleTranslationZh: translatedTitleZh,
                warningCode: sectioningWarning ? 'sectioning_fallback' : undefined,
                warning: sectioningWarning || undefined,
              });

              await sendSseEvent(writer, 'meta', {
                stage: 'writing',
                statusText: `正在写入${getReadingModeLabel(readingMode)}开头信息`,
                ...buildBundleMeta(transcriptBundle, readingMode),
                translatedTitleZh,
                summaryZh,
              });

              for (const html of renderTranscriptIntro(transcriptBundle, readingMode, translatedTitleZh, summaryZh)) {
                await emitHtml('article', html);
              }
              await emitHtml('dialogue-loading', renderDialogueLoadingHtml());

              await sendSseEvent(writer, 'meta', {
                stage: 'translating_dialogue',
                statusText: '正在继续生成内容',
                ...buildBundleMeta(transcriptBundle, readingMode),
                translatedTitleZh,
                summaryZh,
              });

              const sections = sectionsResult.sections;
              const sectionIds = sections.map((_, index) => `dialogue-section-${index + 1}`);
              const showSpeakerNames = insights.speakers.length > 0;
              let pendingDialogueSlice: TranscriptDialogueSliceResult | null = null;
              let pendingDialogueSectionId = '';

              for (let index = 0; index < sections.length; index += 1) {
                await emitHtml(
                  'dialogue',
                  wrapDialogueSectionHtml(
                    sectionIds[index],
                    renderDialogueSectionPreviewHtml(sections[index], index + 1),
                  ),
                  sectionIds[index],
                );
              }

              const flushPendingDialogueSlice = async (): Promise<void> => {
                if (!pendingDialogueSlice || !pendingDialogueSectionId) {
                  return;
                }

                await emitHtml(
                  'dialogue-replace',
                  wrapDialogueSectionHtml(
                    pendingDialogueSectionId,
                    renderDialogueSliceMarkdown(
                      pendingDialogueSlice.section,
                      pendingDialogueSlice.turns,
                      pendingDialogueSlice.groups,
                      showSpeakerNames,
                    ),
                  ),
                  pendingDialogueSectionId,
                );
                pendingDialogueSlice = null;
                pendingDialogueSectionId = '';
              };
              let allSectionsTranslated = true;
              for (let index = 0; index < sections.length; index += 1) {
                throwIfAborted(request.signal);
                const section = sections[index];
                const sectionId = sectionIds[index];

                try {
                  const translatedSlice = await translateTranscriptSectionToZh(
                    transcriptBundle,
                    section,
                    insights,
                    translatedTitleZh,
                    effectiveEnv,
                    readingMode,
                    request.signal,
                  );
                  if (translatedSlice.usedFallback) {
                    translationNeedsRefresh = true;
                  }
                  if (pendingDialogueSlice) {
                    const [readySlice, nextPendingSlice] = mergeDialogueSectionBoundary(
                      pendingDialogueSlice,
                      translatedSlice,
                      showSpeakerNames,
                    );
                    pendingDialogueSlice = readySlice;
                    await flushPendingDialogueSlice();
                    if (nextPendingSlice.turns.length) {
                      pendingDialogueSlice = nextPendingSlice;
                      pendingDialogueSectionId = sectionId;
                    } else {
                      pendingDialogueSlice = null;
                      pendingDialogueSectionId = '';
                      await emitHtml(
                        'dialogue-replace',
                        renderHiddenDialogueSectionHtml(sectionId),
                        sectionId,
                      );
                    }
                  } else {
                    pendingDialogueSlice = normalizeDialogueSliceTurns(translatedSlice);
                    pendingDialogueSectionId = sectionId;
                  }
                } catch (error) {
                  if (isAbortError(error)) {
                    throw error;
                  }

                  allSectionsTranslated = false;
                  translationNeedsRefresh = true;
                  await flushPendingDialogueSlice();
                  const sliceError = AppError.from(error);
                  logGenerate('dialogue_slice_failed', {
                    videoId: transcriptBundle.videoId,
                    slice: `${section.startLabel}-${section.endLabel}`,
                    code: sliceError.code,
                    message: sliceError.publicMessage,
                  });
                  await sendSseEvent(writer, 'warning', {
                    code: sliceError.code,
                    title: '部分片段翻译失败',
                    message: `片段 ${section.startLabel}-${section.endLabel} 翻译失败，已自动回退为原文片段。${sliceError.publicMessage ? ` ${sliceError.publicMessage}` : ''}`.trim(),
                  });
                  await emitHtml(
                    'dialogue-replace',
                    wrapDialogueSectionHtml(sectionId, renderFallbackSectionHtml(section)),
                    sectionId,
                  );
                }

                await sendSseEvent(writer, 'meta', {
                  stage: 'translating_dialogue',
                  statusText: `正在继续生成内容（${index + 1}/${sections.length}）`,
                  ...buildBundleMeta(transcriptBundle, readingMode),
                  translatedTitleZh,
                  summaryZh,
                });
              }
              await flushPendingDialogueSlice();
              geminiTranslationComplete = allSectionsTranslated;
            } catch (error) {
              if (isAbortError(error)) {
                throw error;
              }

              translationNeedsRefresh = true;
              const appError = AppError.from(error);
              logGenerate('insights_failed', {
                videoId: transcriptBundle.videoId,
                code: appError.code,
                message: appError.publicMessage,
              });
              await sendSseEvent(writer, 'insights', {
                titleTranslationZh: '',
                summaryZh: '',
                summary: '',
                speakers: [],
                model: '',
                warningCode: appError.code,
                warning: appError.publicMessage,
              });

              await sendSseEvent(writer, 'meta', {
                stage: 'writing',
                statusText: 'AI 翻译失败，回退到原始字幕',
                ...buildBundleMeta(transcriptBundle, readingMode),
              });

              for (const html of renderTranscriptIntro(transcriptBundle, readingMode)) {
                await emitHtml('article', html);
              }

              for (const chunk of transcriptBundle.chunks) {
                throwIfAborted(request.signal);
                await emitHtml('article', renderDetailedTranscriptChunk(chunk));
              }
            }
          }

          logGenerate('request_complete', {
            videoId: transcriptBundle.videoId,
            chunks: transcriptBundle.chunks.length,
            readingMode,
            transcriptSource,
          });
          const completionMeta = {
            stage: 'complete',
            statusText: '内容已完成',
            ...buildBundleMeta(transcriptBundle, readingMode),
            translatedTitleZh,
            summaryZh,
            geminiTranslationComplete,
            translationNeedsRefresh,
            consumesDailyGeminiTranslationLimit: geminiTranslationComplete && !translationNeedsRefresh,
          };

          if (sharedArticleCacheEnabled && geminiTranslationComplete && !translationNeedsRefresh) {
            const renderedArticleHtml = getRenderedArticleHtml();
            if (renderedArticleHtml.trim()) {
              ctx.waitUntil(
                writeCachedGeneratedArticle(
                  env,
                  transcriptBundle.videoId,
                  readingMode,
                  renderedArticleHtml,
                  completionMeta,
                ),
              );
            }
          }

          await sendSseEvent(writer, 'meta', completionMeta);
          await sendSseEvent(writer, 'done', { ok: true });
        } catch (error) {
          if (isAbortError(error)) {
            logGenerate('request_cancelled', {
              youtubeUrl,
              readingMode,
            });
            return;
          }

          const appError = AppError.from(error);
          console.error('[generate] request_error', {
            code: appError.code,
            status: appError.status,
            message: appError.publicMessage,
            cause: error instanceof Error ? error.stack ?? error.message : error,
          });
          await sendSseEvent(writer, 'error', {
            code: appError.code,
            message: formatErrorMessage(appError),
          });
        } finally {
          await writer.close().catch(() => {});
        }
      })(),
    );

    return response;
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
