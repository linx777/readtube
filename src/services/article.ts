import { generateGeminiText, streamGeminiText } from './gemini';
import { MarkdownBlockStream } from './markdown';
import {
  ARTICLE_SYSTEM_PROMPT,
  buildArticlePrompt,
  buildCompressionMergePrompt,
  buildCompressionPrompt,
  buildContinuationArticlePrompt,
  buildOpeningArticlePrompt,
} from './prompt';
import type { TranscriptBundle, TranscriptChunk } from './youtube';
import { buildTranscriptTextFromChunks } from './youtube';

export const LONG_TRANSCRIPT_THRESHOLD = 18000;
export const EARLY_WRITING_WINDOW_SECONDS = 8 * 60;
const COMPRESSION_CHUNK_BUDGET = 6500;

export interface ArticleGenerationCallbacks {
  onCompressionProgress?: (current: number, total: number) => Promise<void> | void;
  onCompressionSummary?: (summary: string, current: number, total: number) => Promise<void> | void;
  onPhaseChange?: (phase: 'writing') => Promise<void> | void;
}

function renderChunk(chunk: TranscriptChunk): string {
  return `[${Math.floor(chunk.start)}-${Math.floor(chunk.end)}] ${chunk.text}`;
}

export function splitChunksForCompression(chunks: TranscriptChunk[], budget = COMPRESSION_CHUNK_BUDGET): string[] {
  const batches: string[] = [];
  let current = '';

  for (const chunk of chunks) {
    const line = renderChunk(chunk);
    if (!current) {
      current = line;
      continue;
    }

    if (current.length + 1 + line.length > budget) {
      batches.push(current);
      current = line;
      continue;
    }

    current += `\n${line}`;
  }

  if (current) {
    batches.push(current);
  }

  return batches;
}

function chunksAfterWindow(chunks: TranscriptChunk[], startSeconds: number): TranscriptChunk[] {
  return chunks.filter((chunk) => chunk.end > startSeconds);
}

async function buildCondensedBrief(
  bundle: TranscriptBundle,
  geminiApiKey: string,
  geminiModel: string | undefined,
  callbacks?: ArticleGenerationCallbacks,
): Promise<string> {
  const batches = splitChunksForCompression(bundle.chunks);
  const partialSummaries: string[] = [];

  for (const [index, batch] of batches.entries()) {
    const summary = await generateGeminiText({
      apiKey: geminiApiKey,
      model: geminiModel,
      prompt: buildCompressionPrompt(bundle, batch, `第 ${index + 1} / ${batches.length} 段`),
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 900,
      },
    });

    partialSummaries.push(summary);
    await callbacks?.onCompressionSummary?.(summary, index + 1, batches.length);
    await callbacks?.onCompressionProgress?.(index + 1, batches.length);
  }

  if (partialSummaries.length === 1) {
    return partialSummaries[0];
  }

  return generateGeminiText({
    apiKey: geminiApiKey,
    model: geminiModel,
    prompt: buildCompressionMergePrompt(bundle, partialSummaries),
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 1500,
    },
  });
}

export async function* generateArticleStream(
  bundle: TranscriptBundle,
  geminiApiKey: string,
  useCompression: boolean,
  geminiModel?: string,
  callbacks?: ArticleGenerationCallbacks,
): AsyncGenerator<string> {
  const condensedBrief = useCompression
    ? await buildCondensedBrief(bundle, geminiApiKey, geminiModel, callbacks)
    : undefined;

  await callbacks?.onPhaseChange?.('writing');

  const prompt = buildArticlePrompt(bundle, condensedBrief);
  const renderer = new MarkdownBlockStream();

  for await (const delta of streamGeminiText({
    apiKey: geminiApiKey,
    model: geminiModel,
    systemPrompt: ARTICLE_SYSTEM_PROMPT,
    prompt,
    generationConfig: {
      temperature: 0.72,
      topP: 0.9,
      maxOutputTokens: 4096,
    },
  })) {
    for (const html of renderer.push(delta)) {
      yield html;
    }
  }

  for (const html of renderer.flush()) {
    yield html;
  }
}

export async function* generateOpeningArticleStream(
  bundle: TranscriptBundle,
  openingTranscriptText: string,
  windowEndLabel: string,
  geminiApiKey: string,
  geminiModel?: string,
): AsyncGenerator<string> {
  const renderer = new MarkdownBlockStream();
  const prompt = buildOpeningArticlePrompt(bundle, openingTranscriptText, windowEndLabel);

  for await (const delta of streamGeminiText({
    apiKey: geminiApiKey,
    model: geminiModel,
    systemPrompt: ARTICLE_SYSTEM_PROMPT,
    prompt,
    generationConfig: {
      temperature: 0.68,
      topP: 0.9,
      maxOutputTokens: 2200,
    },
  })) {
    for (const html of renderer.push(delta)) {
      yield html;
    }
  }

  for (const html of renderer.flush()) {
    yield html;
  }
}

export async function* generateContinuationArticleStream(
  bundle: TranscriptBundle,
  openingWindowEndLabel: string,
  geminiApiKey: string,
  geminiModel?: string,
  callbacks?: ArticleGenerationCallbacks,
): AsyncGenerator<string> {
  const laterChunks = chunksAfterWindow(bundle.chunks, EARLY_WRITING_WINDOW_SECONDS);
  if (!laterChunks.length) {
    return;
  }

  const laterTranscriptText = buildTranscriptTextFromChunks(laterChunks);
  const useCompression = laterTranscriptText.length > LONG_TRANSCRIPT_THRESHOLD;
  const condensedBrief = useCompression
    ? await buildCondensedBrief(
        {
          ...bundle,
          chunks: laterChunks,
          transcriptText: laterTranscriptText,
        },
        geminiApiKey,
        geminiModel,
        callbacks,
      )
    : undefined;

  await callbacks?.onPhaseChange?.('writing');

  const prompt = buildContinuationArticlePrompt(
    bundle,
    laterTranscriptText,
    openingWindowEndLabel,
    condensedBrief,
  );
  const renderer = new MarkdownBlockStream();

  for await (const delta of streamGeminiText({
    apiKey: geminiApiKey,
    model: geminiModel,
    systemPrompt: ARTICLE_SYSTEM_PROMPT,
    prompt,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 3200,
    },
  })) {
    for (const html of renderer.push(delta)) {
      yield html;
    }
  }

  for (const html of renderer.flush()) {
    yield html;
  }
}
