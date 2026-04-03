import { createAbortError, isAbortError, sleepWithAbort, throwIfAborted } from './abort';
import { AppError } from './errors';
import { formatTime } from './youtube';
import type { TranscriptBundle } from './youtube';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_GEMINI_INSIGHTS_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_GEMINI_DIALOGUE_MODEL = 'gemini-3.1-flash-lite-preview';

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    titleTranslationZh: {
      type: 'string',
      description:
        'A direct Simplified Chinese translation of the original YouTube title, concise and headline-like.',
    },
    summaryZh: {
      type: 'string',
      description:
        'A natural Simplified Chinese translation of the chosen highlight sentence, suitable for a pull quote.',
    },
    summary: {
      type: 'string',
      description:
        'One memorable highlight sentence quoted or closely extracted from the transcript primary language.',
    },
    speakers: {
      type: 'array',
      description:
        'All possible speakers explicitly named or strongly inferable from the transcript or title. Return an empty array when unknown.',
      items: {
        type: 'string',
      },
    },
  },
  required: ['titleTranslationZh', 'summaryZh', 'summary', 'speakers'],
} as const;

const TRANSCRIPT_SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      description:
        'A contiguous transcript outline with 2 to 10 sections. Each section must include a short subtitle, short summary, and the original transcript lines with timestamps.',
      minItems: 2,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          startLabel: { type: 'string' },
          endLabel: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
          transcript: { type: 'string' },
        },
        required: ['startLabel', 'endLabel', 'subtitle', 'summary', 'transcript'],
      },
    },
  },
  required: ['sections'],
} as const;

const QUICK_TRANSCRIPT_SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      description:
        'A contiguous transcript outline for this transcript slice. Each section must include a short subtitle, short summary, and the original transcript lines for that section.',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          startLabel: { type: 'string' },
          endLabel: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
          transcript: { type: 'string' },
        },
        required: ['startLabel', 'endLabel', 'subtitle', 'summary', 'transcript'],
      },
    },
  },
  required: ['sections'],
} as const;

const TRANSCRIPT_DIALOGUE_SCHEMA = {
  type: 'object',
  properties: {
    subtitleZh: { type: 'string' },
    summaryZh: { type: 'string' },
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string' },
          speaker: {
            type: 'string',
            description:
              'Speaker name for the turn. Return an empty string when no speaker attribution should be shown.',
          },
          textZh: { type: 'string' },
        },
        required: ['timestamp', 'speaker', 'textZh'],
      },
    },
  },
  required: ['subtitleZh', 'summaryZh', 'turns'],
} as const;

const QUICK_SECTION_QA_SCHEMA = {
  type: 'object',
  properties: {
    subtitleZh: { type: 'string' },
    summaryZh: { type: 'string' },
    question: { type: 'string' },
    answer: { type: 'string' },
    questionZh: { type: 'string' },
    answerZh: { type: 'string' },
  },
  required: ['subtitleZh', 'summaryZh', 'question', 'answer', 'questionZh', 'answerZh'],
} as const;

const GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const GEMINI_MAX_RETRIES = 2;

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiCandidatePart[];
  };
  finishReason?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
}

export interface TranscriptInsights {
  titleTranslationZh: string;
  summaryZh: string;
  summary: string;
  speakers: string[];
  model: string;
}

export interface TranscriptSection {
  startLabel: string;
  endLabel: string;
  subtitle: string;
  summary: string;
  transcript: string;
  subtitleZh?: string;
  summaryZh?: string;
}

export interface TranscriptDialogueTurn {
  timestamp: string;
  speaker: string;
  textZh: string;
}

export interface TranscriptDialogueSliceResult {
  section: TranscriptSection;
  turns: TranscriptDialogueTurn[];
  model: string;
}

export interface TranscriptSectionsResult {
  sections: TranscriptSection[];
  model: string;
}

export type GeminiReadingMode = 'quick' | 'full';

export interface QuickTranscriptSectionSummaryResult {
  section: TranscriptSection;
  question: string;
  answer: string;
  questionZh: string;
  answerZh: string;
  model: string;
}

const MANUAL_SECTION_SUBTITLE_PATTERN = /^Transcript Section \d+$/i;
const MANUAL_SECTION_SUMMARY_PATTERN = /^Transcript content from .+\.$/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeChineseTitle(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^["'“”‘’《》〈〉「」『』]+/, '')
    .replace(/["'“”‘’《》〈〉「」『』]+$/, '')
    .replace(/\s+\|\s+/g, ' | ');
}

function normalizeTranscriptSectionText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n');
}

function shouldRetryGeminiError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }

  if (error.code === 'gemini_timeout') {
    return true;
  }

  if (error.code !== 'gemini_request_failed') {
    return false;
  }

  const message = normalizeWhitespace(error.publicMessage).toLowerCase();
  return (
    message.includes('503')
    || message.includes('429')
    || message.includes('unavailable')
    || message.includes('high demand')
    || message.includes('try again later')
    || message.includes('resource exhausted')
  );
}

function buildBaseTranscriptPrompt(bundle: TranscriptBundle): string {
  const transcriptBody = bundle.chunks
    .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
    .join('\n');

  return [
    'Analyze the following YouTube transcript and return JSON only.',
    'Tasks:',
    '1. Translate the original YouTube title into concise, direct Simplified Chinese.',
    '2. Select one standout highlight sentence from the transcript content.',
    '3. Return that highlight sentence in the transcript primary language when possible.',
    '4. Write a natural Simplified Chinese translation of that same highlight sentence for UI display.',
    '5. Prefer a sentence that captures the core idea, argument, or emotional peak of the content.',
    '6. Keep the highlight sentence faithful to the transcript. Do not invent a quote or combine distant lines.',
    '7. List all possible speakers only when they are explicitly named or strongly inferable from the transcript or title.',
    '8. Do not hallucinate speaker names. Return an empty array if you are not confident.',
    '9. Deduplicate speaker names and keep them short.',
    '10. If the content is not clearly an interview, chat show, panel, debate, podcast, or other multi-speaker conversation with identifiable people, return an empty speakers array.',
    '11. For monologues, lectures, narration, essays, or transcripts without clearly attributable speakers, return an empty speakers array.',
    '12. When in doubt, prefer an empty speakers array.',
    '',
    'Title translation rules:',
    '- Translate only the original title text itself.',
    '- Do not use transcript context or inferred content to rewrite the title.',
    '- Keep names, brands, show names, and keywords accurate.',
    '- Keep the result concise and headline-like.',
    '- Do not turn it into a quote, slogan, or dramatic paraphrase.',
    '- Prefer original English spelling for person names and brands unless there is a very common Chinese name.',
    '',
    'Highlight sentence rules:',
    '- Return exactly one sentence.',
    '- Prefer a complete sentence that can stand alone as a quote.',
    '- Keep it concise when the transcript offers multiple similar options.',
    '- Remove filler words, false starts, and disfluencies only when needed for readability.',
    '- Do not add quotation marks.',
    '',
    `Original YouTube Title: ${bundle.sourceTitle}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Subtitle type: ${bundle.isAutoGenerated ? 'auto-generated' : 'manual'}`,
    '',
    'Transcript:',
    transcriptBody,
  ].join('\n');
}

function buildQuickTranscriptInsightsPrompt(bundle: TranscriptBundle): string {
  return buildBaseTranscriptPrompt(bundle);
}

function buildFullTranscriptInsightsPrompt(bundle: TranscriptBundle): string {
  return buildBaseTranscriptPrompt(bundle);
}

function buildBaseTranscriptSectionsPrompt(bundle: TranscriptBundle): string {
  const transcriptBody = bundle.chunks
    .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
    .join('\n');

  return [
    'Split the following YouTube transcript into sections and return JSON only.',
    'Tasks:',
    '1. Split the full transcript into 2 to 10 contiguous sections that cover the whole transcript in order.',
    '2. For each section, return startLabel, endLabel, a short subtitle, a short summary, and the original transcript lines for that section only.',
    '3. Each section transcript must preserve timestamps and line order exactly as they appear in the source transcript.',
    '4. Do not overlap sections. Do not omit transcript lines.',
    '5. Keep section subtitles short and scannable.',
    '6. Keep section summaries concise and factual.',
    '',
    `Original YouTube Title: ${bundle.sourceTitle}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Subtitle type: ${bundle.isAutoGenerated ? 'auto-generated' : 'manual'}`,
    '',
    'Transcript:',
    transcriptBody,
  ].join('\n');
}

function buildQuickTranscriptSectionsPrompt(bundle: TranscriptBundle): string {
  const transcriptBody = bundle.chunks
    .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
    .join('\n');

  return [
    'Split the following YouTube transcript slice into sections and return JSON only.',
    'Decide the segmentation strategy before writing sections:',
    '1. If the content is clearly an interview, chat show, podcast, panel, debate, or host-guest conversation, segment primarily by question-answer exchanges or topic handoffs between speakers.',
    '2. If the content is not a conversation, segment by content structure instead: topic shifts, claims, examples, argument turns, or chapter-like transitions.',
    '3. When in doubt, prefer semantic content sections over arbitrary equal-sized chunks.',
    '',
    'Tasks:',
    '1. Return 1 to 8 contiguous sections for this transcript slice in chronological order.',
    '2. For each section, return startLabel, endLabel, a short subtitle, a short summary, and the original transcript lines for that section only.',
    '3. Each section transcript must preserve timestamps and line order exactly as they appear in the source transcript.',
    '4. Do not overlap sections. Do not omit transcript lines.',
    '5. Use the exact first and last timestamp labels that bound the section.',
    '6. Keep section subtitles short and scannable.',
    '7. Keep section summaries concise and factual.',
    '',
    `Original YouTube Title: ${bundle.sourceTitle}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Subtitle type: ${bundle.isAutoGenerated ? 'auto-generated' : 'manual'}`,
    '',
    'Transcript Slice:',
    transcriptBody,
  ].join('\n');
}

function buildFullTranscriptSectionsPrompt(bundle: TranscriptBundle): string {
  return buildBaseTranscriptSectionsPrompt(bundle);
}

function buildBaseTranscriptDialoguePrompt(
  bundle: TranscriptBundle,
  section: TranscriptSection,
  insights: TranscriptInsights,
  titleTranslationZh: string,
): string {
  const speakerList = insights.speakers.length ? insights.speakers.join(', ') : '(empty list)';
  const usesManualPlaceholderCopy =
    MANUAL_SECTION_SUBTITLE_PATTERN.test(normalizeWhitespace(section.subtitle))
    || MANUAL_SECTION_SUMMARY_PATTERN.test(normalizeWhitespace(section.summary));

  return [
    'Convert the following transcript section into direct Simplified Chinese speaker-attributed dialogue and return JSON only.',
    'Goal:',
    '- Produce lines shaped like [name]: [words], with timestamps kept separately in JSON.',
    '',
    'Rules:',
    '- Translate faithfully into natural Simplified Chinese.',
    '- If Possible Speaker Count is greater than 0, assign each turn to one speaker.',
    '- Strongly prefer selecting a speaker from the provided Possible Speakers list for every turn.',
    '- If there are only two possible speakers, force a best-guess assignment between them unless the text is completely non-attributable.',
    '- Keep speaker names exactly as written in the Possible Speakers list when you choose one of them.',
    '- Use "Unknown" only as a last resort when there is truly not enough signal to choose any listed speaker.',
    '- Minimize the number of "Unknown" turns.',
    '- If Possible Speaker Count is 0, do not invent speaker attribution.',
    '- If Possible Speaker Count is 0, return speaker as an empty string for every turn.',
    '- If Possible Speaker Count is 0, never use "Unknown".',
    '- Do not hallucinate extra content.',
    '- Merge adjacent transcript lines into a single turn when they clearly belong to one speaker.',
    '- Preserve the original order of ideas.',
    '- Keep each turn concise but complete.',
    '- Use the timestamp of the first transcript line in each turn.',
    '- Translate the section subtitle into concise Simplified Chinese and return it as subtitleZh.',
    '- Translate the section summary into concise natural Simplified Chinese and return it as summaryZh.',
    ...(usesManualPlaceholderCopy
      ? [
          '- The provided section subtitle and summary are generic placeholder labels created from a fixed time slice.',
          '- Do not literally translate those placeholder labels.',
          '- Instead, write a fresh concise Simplified Chinese subtitle and a fresh concise Simplified Chinese summary based on the actual transcript content in this section.',
        ]
      : []),
    '',
    `Original YouTube Title: ${bundle.sourceTitle}`,
    `Chinese Title: ${titleTranslationZh || 'N/A'}`,
    `Highlight Sentence: ${insights.summary}`,
    `Chinese Highlight Sentence: ${insights.summaryZh}`,
    `Possible Speakers: ${speakerList}`,
    `Possible Speaker Count: ${insights.speakers.length}`,
    `Section Window: ${section.startLabel}-${section.endLabel}`,
    `Section Subtitle: ${section.subtitle}`,
    `Section Summary: ${section.summary}`,
    '',
    'Transcript Section:',
    section.transcript,
  ].join('\n');
}

function buildQuickTranscriptDialoguePrompt(
  bundle: TranscriptBundle,
  section: TranscriptSection,
  insights: TranscriptInsights,
  titleTranslationZh: string,
): string {
  return buildBaseTranscriptDialoguePrompt(bundle, section, insights, titleTranslationZh);
}

function buildQuickSectionQaPrompt(
  bundle: TranscriptBundle,
  section: TranscriptSection,
): string {
  return [
    'Read the following transcript section and return JSON only.',
    'Goal:',
    '- Summarize the section as one central question and one central answer/takeaway.',
    '',
    'Rules:',
    '- If the section is an interview, chat show, podcast, panel, or speaker exchange, identify the main question being raised and the main answer given in this section.',
    '- If the section is not a literal Q&A, rewrite the section as the central question the content is addressing and the clearest answer or takeaway it provides.',
    '- Keep question and answer grounded in the transcript. Do not invent details.',
    '- Keep the original-language question and answer concise.',
    '- Translate both into natural Simplified Chinese.',
    '- Also translate the section subtitle into concise Simplified Chinese as subtitleZh.',
    '- Also write one concise Simplified Chinese section summary as summaryZh.',
    '',
    `Original YouTube Title: ${bundle.sourceTitle}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Section Window: ${section.startLabel}-${section.endLabel}`,
    `Section Subtitle: ${section.subtitle}`,
    `Section Summary: ${section.summary}`,
    '',
    'Transcript Section:',
    section.transcript,
  ].join('\n');
}

function buildFullTranscriptDialoguePrompt(
  bundle: TranscriptBundle,
  section: TranscriptSection,
  insights: TranscriptInsights,
  titleTranslationZh: string,
): string {
  return buildBaseTranscriptDialoguePrompt(bundle, section, insights, titleTranslationZh);
}

function normalizeGeminiReadingMode(readingMode: string | undefined): GeminiReadingMode {
  return readingMode === 'full' ? 'full' : 'quick';
}

function getGeminiReadingModeLabel(readingMode: GeminiReadingMode): string {
  return readingMode === 'full' ? '详细版' : '速读版';
}

const TRANSCRIPT_INSIGHTS_PROMPT_BUILDERS: Record<GeminiReadingMode, (bundle: TranscriptBundle) => string> = {
  quick: buildQuickTranscriptInsightsPrompt,
  full: buildFullTranscriptInsightsPrompt,
};

const TRANSCRIPT_SECTIONS_PROMPT_BUILDERS: Record<GeminiReadingMode, (bundle: TranscriptBundle) => string> = {
  quick: buildQuickTranscriptSectionsPrompt,
  full: buildFullTranscriptSectionsPrompt,
};

const TRANSCRIPT_DIALOGUE_PROMPT_BUILDERS: Record<
GeminiReadingMode,
(bundle: TranscriptBundle, section: TranscriptSection, insights: TranscriptInsights, titleTranslationZh: string) => string
> = {
  quick: buildQuickTranscriptDialoguePrompt,
  full: buildFullTranscriptDialoguePrompt,
};

function extractCandidateText(response: GeminiGenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (text) {
    return text;
  }

  if (response.promptFeedback?.blockReason) {
    throw new AppError(
      'gemini_blocked',
      `Gemini 返回了被拦截的结果：${response.promptFeedback.blockReason}。`,
      502,
    );
  }

  throw new AppError('gemini_empty', 'Gemini 没有返回可解析的内容。', 502);
}

function normalizeInsightsPayload(payload: unknown, model: string): TranscriptInsights {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_payload', 'Gemini 返回了无法识别的结构化结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const titleTranslationZh = typeof record.titleTranslationZh === 'string'
    ? normalizeChineseTitle(record.titleTranslationZh)
    : '';
  const summaryZh = typeof record.summaryZh === 'string'
    ? normalizeWhitespace(record.summaryZh)
    : '';
  const summary = typeof record.summary === 'string' ? normalizeWhitespace(record.summary) : '';
  const speakers = Array.isArray(record.speakers)
    ? [...new Set(record.speakers
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeWhitespace(item))
      .filter((item) => Boolean(item) && item.length <= 80))]
    : [];

  if (!summary) {
    throw new AppError('gemini_missing_summary', 'Gemini 没有返回高亮句子。', 502);
  }

  return {
    titleTranslationZh,
    summaryZh,
    summary,
    speakers,
    model,
  };
}

function normalizeSectionsPayload(
  payload: unknown,
  model: string,
  minimumSections = 2,
  maximumSections = 10,
): TranscriptSectionsResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_sections_payload', 'Gemini 返回了无法识别的分段结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const sections = Array.isArray(record.sections)
    ? record.sections
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        startLabel: typeof item.startLabel === 'string' ? normalizeWhitespace(item.startLabel) : '',
        endLabel: typeof item.endLabel === 'string' ? normalizeWhitespace(item.endLabel) : '',
        subtitle: typeof item.subtitle === 'string' ? normalizeWhitespace(item.subtitle) : '',
        summary: typeof item.summary === 'string' ? normalizeWhitespace(item.summary) : '',
        transcript: typeof item.transcript === 'string' ? normalizeTranscriptSectionText(item.transcript) : '',
      }))
      .filter((item) => item.startLabel && item.endLabel && item.subtitle && item.summary && item.transcript)
    : [];

  if (sections.length < minimumSections || sections.length > maximumSections) {
    throw new AppError(
      'gemini_invalid_sections',
      `Gemini 没有返回 ${minimumSections} 到 ${maximumSections} 个可用的内容分段。`,
      502,
    );
  }

  return {
    sections,
    model,
  };
}

function normalizeQuickSectionQaPayload(
  payload: unknown,
  model: string,
  section: TranscriptSection,
): QuickTranscriptSectionSummaryResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_dialogue_payload', 'Gemini 返回了无法识别的速读版摘要结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const subtitleZh = typeof record.subtitleZh === 'string' ? normalizeWhitespace(record.subtitleZh) : '';
  const summaryZh = typeof record.summaryZh === 'string' ? normalizeWhitespace(record.summaryZh) : '';
  const question = typeof record.question === 'string' ? normalizeWhitespace(record.question) : '';
  const answer = typeof record.answer === 'string' ? normalizeWhitespace(record.answer) : '';
  const questionZh = typeof record.questionZh === 'string' ? normalizeWhitespace(record.questionZh) : '';
  const answerZh = typeof record.answerZh === 'string' ? normalizeWhitespace(record.answerZh) : '';

  if (!subtitleZh || !summaryZh || !question || !answer || !questionZh || !answerZh) {
    throw new AppError('gemini_missing_dialogue_section_intro', 'Gemini 没有返回完整的速读版问答摘要。', 502);
  }

  return {
    section: {
      ...section,
      subtitleZh,
      summaryZh,
    },
    question,
    answer,
    questionZh,
    answerZh,
    model,
  };
}

function normalizeDialogueTurns(payload: unknown, model: string, section: TranscriptSection): TranscriptDialogueSliceResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_dialogue_payload', 'Gemini 返回了无法识别的对话翻译结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const subtitleZh = typeof record.subtitleZh === 'string'
    ? normalizeWhitespace(record.subtitleZh)
    : '';
  const summaryZh = typeof record.summaryZh === 'string'
    ? normalizeWhitespace(record.summaryZh)
    : '';
  const turns = Array.isArray(record.turns)
    ? record.turns
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        timestamp: typeof item.timestamp === 'string' ? normalizeWhitespace(item.timestamp) : '',
        speaker: typeof item.speaker === 'string' ? normalizeWhitespace(item.speaker) : '',
        textZh: typeof item.textZh === 'string' ? normalizeWhitespace(item.textZh) : '',
      }))
      .filter((item) => item.timestamp && item.textZh)
    : [];

  if (!turns.length) {
    throw new AppError('gemini_missing_dialogue_turns', 'Gemini 没有返回可渲染的对话片段。', 502);
  }

  if (!subtitleZh || !summaryZh) {
    throw new AppError('gemini_missing_dialogue_section_intro', 'Gemini 没有返回可渲染的分段中文标题或摘要。', 502);
  }

  return {
    section: {
      ...section,
      subtitleZh,
      summaryZh,
    },
    turns,
    model,
  };
}

function stripDialogueSpeakers(
  result: TranscriptDialogueSliceResult,
  shouldHideSpeakers: boolean,
): TranscriptDialogueSliceResult {
  if (!shouldHideSpeakers) {
    return result;
  }

  return {
    ...result,
    turns: result.turns.map((turn) => ({
      ...turn,
      speaker: '',
    })),
  };
}

export function parseTranscriptInsightsPayload(raw: unknown, model: string): TranscriptInsights {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'candidates' in raw) {
    const candidateText = extractCandidateText(raw as GeminiGenerateContentResponse);
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidateText);
    } catch (error) {
      throw new AppError('gemini_invalid_json', 'Gemini 返回了无法解析的 JSON。', 502, {
        cause: error,
      });
    }

    return normalizeInsightsPayload(parsed, model);
  }

  return normalizeInsightsPayload(raw, model);
}

export function parseTranscriptSectionsPayload(raw: unknown, model: string): TranscriptSectionsResult {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'candidates' in raw) {
    const candidateText = extractCandidateText(raw as GeminiGenerateContentResponse);
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidateText);
    } catch (error) {
      throw new AppError('gemini_invalid_sections_json', 'Gemini 返回了无法解析的分段 JSON。', 502, {
        cause: error,
      });
    }

    return normalizeSectionsPayload(parsed, model);
  }

  return normalizeSectionsPayload(raw, model);
}

export function parseQuickTranscriptSectionsPayload(raw: unknown, model: string): TranscriptSectionsResult {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'candidates' in raw) {
    const candidateText = extractCandidateText(raw as GeminiGenerateContentResponse);
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidateText);
    } catch (error) {
      throw new AppError('gemini_invalid_sections_json', 'Gemini 返回了无法解析的速读版分段 JSON。', 502, {
        cause: error,
      });
    }

    return normalizeSectionsPayload(parsed, model, 1, 8);
  }

  return normalizeSectionsPayload(raw, model, 1, 8);
}

export function parseTranscriptDialoguePayload(
  raw: unknown,
  model: string,
  section: TranscriptSection,
): TranscriptDialogueSliceResult {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'candidates' in raw) {
    const candidateText = extractCandidateText(raw as GeminiGenerateContentResponse);
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidateText);
    } catch (error) {
      throw new AppError('gemini_invalid_dialogue_json', 'Gemini 返回了无法解析的对话 JSON。', 502, {
        cause: error,
      });
    }

    return normalizeDialogueTurns(parsed, model, section);
  }

  return normalizeDialogueTurns(raw, model, section);
}

export function parseQuickTranscriptSectionSummaryPayload(
  raw: unknown,
  model: string,
  section: TranscriptSection,
): QuickTranscriptSectionSummaryResult {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'candidates' in raw) {
    const candidateText = extractCandidateText(raw as GeminiGenerateContentResponse);
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidateText);
    } catch (error) {
      throw new AppError('gemini_invalid_dialogue_json', 'Gemini 返回了无法解析的速读版问答摘要 JSON。', 502, {
        cause: error,
      });
    }

    return normalizeQuickSectionQaPayload(parsed, model, section);
  }

  return normalizeQuickSectionQaPayload(raw, model, section);
}

async function generateStructuredContent<T>(
  model: string,
  apiKey: string,
  prompt: string,
  responseJsonSchema: Record<string, unknown>,
  parser: (raw: unknown, model: string) => T,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    try {
      throwIfAborted(signal);

      const controller = new AbortController();
      let detachAbortListener = () => {};

      if (signal) {
        if (signal.aborted) {
          controller.abort(signal.reason);
        } else {
          const onAbort = () => controller.abort(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
          detachAbortListener = () => signal.removeEventListener('abort', onAbort);
        }
      }

      const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

      const response = await fetch(`${GEMINI_API_BASE}${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseJsonSchema,
          },
        }),
        signal: controller.signal,
      }).catch((error: unknown) => {
        if (signal?.aborted) {
          throw createAbortError(signal.reason ?? error);
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError('gemini_timeout', 'Gemini 请求超时，已跳过当前片段。', 504, {
            cause: error,
          });
        }

        throw error;
      }).finally(() => {
        clearTimeout(timeoutId);
        detachAbortListener();
      });

      if (!response.ok) {
        const detail = normalizeWhitespace(await response.text().catch(() => ''));
        throw new AppError(
          'gemini_request_failed',
          detail ? `Gemini 请求失败：${detail}` : 'Gemini 请求失败，请稍后重试。',
          502,
        );
      }

      throwIfAborted(signal);
      return parser(await response.json(), model);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (attempt >= GEMINI_MAX_RETRIES || !shouldRetryGeminiError(error)) {
        throw error;
      }

      await sleepWithAbort(1200 * (attempt + 1), signal);
    }
  }

  throw new AppError('gemini_request_failed', 'Gemini 请求失败，请稍后重试。', 502);
}

export async function generateTranscriptInsights(
  bundle: TranscriptBundle,
  env: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; GEMINI_INSIGHTS_MODEL?: string },
  readingMode: GeminiReadingMode = 'quick',
  signal?: AbortSignal,
): Promise<TranscriptInsights> {
  const normalizedReadingMode = normalizeGeminiReadingMode(readingMode);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      'missing_gemini_key',
      `未配置 GEMINI_API_KEY，无法生成${getGeminiReadingModeLabel(normalizedReadingMode)} AI 高亮句。`,
      500,
    );
  }

  const model =
    env.GEMINI_INSIGHTS_MODEL?.trim()
    || env.GEMINI_MODEL?.trim()
    || DEFAULT_GEMINI_INSIGHTS_MODEL;
  return generateStructuredContent(
    model,
    apiKey,
    TRANSCRIPT_INSIGHTS_PROMPT_BUILDERS[normalizedReadingMode](bundle),
    INSIGHTS_SCHEMA,
    parseTranscriptInsightsPayload,
    signal,
  );
}

export async function generateTranscriptSections(
  bundle: TranscriptBundle,
  env: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; GEMINI_INSIGHTS_MODEL?: string },
  readingMode: GeminiReadingMode = 'quick',
  signal?: AbortSignal,
): Promise<TranscriptSectionsResult> {
  const normalizedReadingMode = normalizeGeminiReadingMode(readingMode);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('missing_gemini_key', '未配置 GEMINI_API_KEY，无法生成内容分段。', 500);
  }

  const model =
    env.GEMINI_INSIGHTS_MODEL?.trim()
    || env.GEMINI_MODEL?.trim()
    || DEFAULT_GEMINI_INSIGHTS_MODEL;
  return generateStructuredContent(
    model,
    apiKey,
    TRANSCRIPT_SECTIONS_PROMPT_BUILDERS[normalizedReadingMode](bundle),
    normalizedReadingMode === 'quick' ? QUICK_TRANSCRIPT_SECTIONS_SCHEMA : TRANSCRIPT_SECTIONS_SCHEMA,
    normalizedReadingMode === 'quick' ? parseQuickTranscriptSectionsPayload : parseTranscriptSectionsPayload,
    signal,
  );
}

export async function translateTranscriptSectionToZh(
  bundle: TranscriptBundle,
  section: TranscriptSection,
  insights: TranscriptInsights,
  titleTranslationZh: string,
  env: {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_DIALOGUE_MODEL?: string;
  },
  readingMode: GeminiReadingMode = 'quick',
  signal?: AbortSignal,
): Promise<TranscriptDialogueSliceResult> {
  const normalizedReadingMode = normalizeGeminiReadingMode(readingMode);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('missing_gemini_key', '未配置 GEMINI_API_KEY，无法生成中文对话。', 500);
  }

  const model =
    env.GEMINI_DIALOGUE_MODEL?.trim()
    || DEFAULT_GEMINI_DIALOGUE_MODEL;
  const result = await generateStructuredContent(
    model,
    apiKey,
    TRANSCRIPT_DIALOGUE_PROMPT_BUILDERS[normalizedReadingMode](bundle, section, insights, titleTranslationZh),
    TRANSCRIPT_DIALOGUE_SCHEMA,
    (raw, currentModel) => parseTranscriptDialoguePayload(raw, currentModel, section),
    signal,
  );
  return stripDialogueSpeakers(result, insights.speakers.length === 0);
}

export async function translateTranscriptSectionsToZh(
  bundle: TranscriptBundle,
  insights: TranscriptInsights,
  sections: TranscriptSection[],
  titleTranslationZh: string,
  env: {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_DIALOGUE_MODEL?: string;
  },
  readingMode: GeminiReadingMode = 'quick',
  signal?: AbortSignal,
): Promise<TranscriptDialogueSliceResult[]> {
  const results: TranscriptDialogueSliceResult[] = [];

  for (const section of sections) {
    results.push(await translateTranscriptSectionToZh(
      bundle,
      section,
      insights,
      titleTranslationZh,
      env,
      readingMode,
      signal,
    ));
  }

  return results;
}

export async function summarizeQuickTranscriptSection(
  bundle: TranscriptBundle,
  section: TranscriptSection,
  env: {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_DIALOGUE_MODEL?: string;
  },
  signal?: AbortSignal,
): Promise<QuickTranscriptSectionSummaryResult> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('missing_gemini_key', '未配置 GEMINI_API_KEY，无法生成速读版问答摘要。', 500);
  }

  const model =
    env.GEMINI_DIALOGUE_MODEL?.trim()
    || DEFAULT_GEMINI_DIALOGUE_MODEL;
  return generateStructuredContent(
    model,
    apiKey,
    buildQuickSectionQaPrompt(bundle, section),
    QUICK_SECTION_QA_SCHEMA,
    (raw, currentModel) => parseQuickTranscriptSectionSummaryPayload(raw, currentModel, section),
    signal,
  );
}
