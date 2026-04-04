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
    titleTranslationZh: {
      type: 'string',
      description:
        'A direct Simplified Chinese translation of the original YouTube title, concise and headline-like. Return an empty string if unavailable.',
    },
    summaryZh: {
      type: 'string',
      description:
        'A natural Simplified Chinese translation of one standout highlight sentence from the whole transcript.',
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
    sections: {
      type: 'array',
      description:
        'A contiguous semantic outline for the full transcript. Each section must include only startLabel, endLabel, a higher-level Simplified Chinese thematic subtitle suitable as a quick-summary heading, and a concise Simplified Chinese summary.',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          startLabel: { type: 'string' },
          endLabel: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['startLabel', 'endLabel', 'subtitle', 'summary'],
      },
    },
  },
  required: ['titleTranslationZh', 'summaryZh', 'summary', 'speakers', 'sections'],
} as const;

const FULL_TRANSCRIPT_SECTION_BOUNDARIES_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      description:
        'A contiguous semantic outline for the full transcript. Each section must include only startLabel, endLabel, subtitle, and summary.',
      minItems: 2,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          startLabel: { type: 'string' },
          endLabel: { type: 'string' },
          subtitle: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['startLabel', 'endLabel', 'subtitle', 'summary'],
      },
    },
  },
  required: ['sections'],
} as const;

const TRANSCRIPT_DIALOGUE_SCHEMA = {
  type: 'object',
  properties: {
    topicTitleZh: {
      type: 'string',
      description:
        'A higher-level thematic Simplified Chinese heading for the section, suitable as a quick-summary title before the dialogue.',
    },
    topicSummaryZh: {
      type: 'string',
      description:
        'One concise Simplified Chinese summary sentence that captures the broader point or takeaway of the section.',
    },
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
    groups: {
      type: 'array',
      description:
        'Ordered dialogue groups inside the section. Each group should correspond to one main question-answer exchange or one coherent subtopic inside the larger section.',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          topicTitleZh: {
            type: 'string',
            description:
              'A concise Simplified Chinese mini-title for this question-answer group or subtopic.',
          },
          turns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                speaker: { type: 'string' },
                textZh: { type: 'string' },
              },
              required: ['timestamp', 'speaker', 'textZh'],
            },
          },
        },
        required: ['topicTitleZh', 'turns'],
      },
    },
  },
  required: ['topicTitleZh', 'topicSummaryZh', 'turns', 'groups'],
} as const;

const QUICK_SECTION_QA_SCHEMA = {
  type: 'object',
  properties: {
    topicTitleZh: {
      type: 'string',
      description:
        'A higher-level thematic Simplified Chinese heading for this exchange, suitable as a quick-summary title before the question and answer.',
    },
    topicSummaryZh: {
      type: 'string',
      description:
        'One concise Simplified Chinese summary sentence that captures the broader point or takeaway of the exchange.',
    },
    question: { type: 'string' },
    answer: { type: 'string' },
    questionZh: { type: 'string' },
    answerZh: { type: 'string' },
  },
  required: ['topicTitleZh', 'topicSummaryZh', 'question', 'answer', 'questionZh', 'answerZh'],
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
  topicTitleZh?: string;
  topicSummaryZh?: string;
  subtitleZh?: string;
  summaryZh?: string;
}

export interface TranscriptSectionBoundary {
  startLabel: string;
  endLabel: string;
  subtitle: string;
  summary: string;
}

export interface TranscriptDialogueTurn {
  timestamp: string;
  speaker: string;
  textZh: string;
}

export interface TranscriptDialogueGroup {
  topicTitleZh: string;
  turns: TranscriptDialogueTurn[];
}

export interface TranscriptDialogueSliceResult {
  section: TranscriptSection;
  turns: TranscriptDialogueTurn[];
  groups: TranscriptDialogueGroup[];
  model: string;
}

export interface TranscriptSectionsResult {
  sections: TranscriptSection[];
  titleTranslationZh?: string;
  summaryZh?: string;
  summary?: string;
  speakers?: string[];
  model: string;
}

export interface TranscriptSectionBoundariesResult {
  sections: TranscriptSectionBoundary[];
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

function hasMeaningfulSourceTitle(bundle: TranscriptBundle): boolean {
  const normalizedTitle = normalizeWhitespace(bundle.sourceTitle);
  return (
    Boolean(normalizedTitle)
    && normalizedTitle !== `YouTube 视频 ${bundle.videoId}`
    && !/^youtube$/i.test(normalizedTitle)
  );
}

function getPromptSourceTitle(bundle: TranscriptBundle): string {
  return hasMeaningfulSourceTitle(bundle) ? bundle.sourceTitle : 'N/A';
}

function isPlaceholderChineseTitle(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  return (
    /^YouTube\s*视频\s*[a-zA-Z0-9_-]{11}$/i.test(normalized)
    || /^youtube$/i.test(normalized)
    || /^youtube\s*视频$/i.test(normalized)
    || normalized === '油管'
    || normalized === '优兔'
  );
}

function sanitizeGeneratedTitleTranslation(
  bundle: TranscriptBundle,
  titleTranslationZh: string,
): string {
  if (!titleTranslationZh || isPlaceholderChineseTitle(titleTranslationZh)) {
    return '';
  }

  if (hasMeaningfulSourceTitle(bundle) && /^youtube$/i.test(normalizeWhitespace(titleTranslationZh))) {
    return '';
  }

  return titleTranslationZh;
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
    '13. If the original YouTube title is unavailable or marked as N/A, return an empty string for titleTranslationZh.',
    '14. Must Do not split a question into one group and its answer into another',
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
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
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
    'These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.',
    'Tasks:',
    '1. Split the full transcript into 2 to 10 contiguous sections that cover the whole transcript in order.',
    '2. For each section, return startLabel, endLabel, a short subtitle, a short summary, and the original transcript lines for that section only.',
    '3. Each section transcript must preserve timestamps and line order exactly as they appear in the source transcript.',
    '4. Do not overlap sections. Do not omit transcript lines.',
    '5. Keep section subtitles short, scannable, and thematic.',
    '6. Prefer section subtitles that capture the broader topic, tension, or takeaway instead of merely restating one question line.',
    '7. Never assume the content is a Q&A unless the transcript actually supports that structure.',
    '8. Keep section summaries concise and factual.',
    '9. Keep each subtitle and each summary under 10 words when possible.',
    '',
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
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
    'Split the following full YouTube transcript into content-based sections and return JSON only.',
    'These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.',
    'Whole-transcript tasks:',
    '1. Translate the original YouTube title into concise, direct Simplified Chinese as titleTranslationZh.',
    '2. Select one standout highlight sentence from the transcript content and return it in the transcript primary language as summary.',
    '3. Write a natural Simplified Chinese translation of that same highlight sentence as summaryZh.',
    '4. List all possible speakers only when they are explicitly named or strongly inferable from the transcript or title.',
    '5. Do not hallucinate speaker names. Return an empty array if you are not confident.',
    '6. Deduplicate speaker names and keep them short.',
    '7. If the content is not clearly a multi-speaker conversation with identifiable people, return an empty speakers array.',
    '8. If the original YouTube title is unavailable or marked as N/A, return an empty string for titleTranslationZh.',
    '9. Must Do not split a question into one group and its answer into another',
    '',
    'Highlight sentence rules:',
    '- Return exactly one sentence.',
    '- Keep it concise and memorable.',
    '',
    'Speaker rules:',
    '- Only include speakers who are explicitly named or strongly inferable.',
    '- For monologues, lectures, narration, or unclear attribution, return an empty speakers array.',
    '- When in doubt, prefer an empty speakers array.',
    '',
    'Decide the segmentation strategy before writing sections:',
    '1. If the content is clearly an interview, chat show, podcast, panel, debate, or host-guest conversation, segment primarily by question-answer exchanges or topic handoffs between speakers.',
    '2. In conversation content, keep each question with its direct answer in the same section whenever possible.',
    '3. Default to one section per main question and its direct answer whenever the conversation structure allows.',
    '4. Start a new section for each new host/interviewer question or each clearly new thing being asked, even if the broader theme stays related.',
    '5. Do not group multiple distinct questions into the same section just because they share a theme.',
    '6. Only combine multiple questions in one section when they are extremely short, inseparable follow-ups to the same answer.',
    '7. Must Do not split a question into one group and its main answer into another',
    '8. Do not merge unrelated Q&A themes into the same section just because they are adjacent.',
    '9. If the content is not a conversation, segment by content structure instead: topic shifts, claims, examples, argument turns, or chapter-like transitions.',
    '10. When in doubt, prefer semantic content sections over arbitrary equal-sized chunks.',
    '',
    'Section tasks:',
    '1. Return 1 to 12 contiguous sections for the full transcript in chronological order.',
    '2. For each section, return only startLabel, endLabel, a short Simplified Chinese subtitle, and a short Simplified Chinese summary.',
    '3. Use transcript timestamp labels from the source transcript for both startLabel and endLabel.',
    '4. startLabel must be the first transcript timestamp included in the section.',
    '5. endLabel must be the last transcript timestamp included in the section.',
    '6. Do not overlap sections. Cover the whole transcript in order.',
    '7. Make each section correspond to one coherent topic, question group, answer cluster, or content turn.',
    '8. Write all section subtitles in natural Simplified Chinese and keep them short, scannable, and thematic.',
    '9. Each subtitle should work as a higher-level quick-summary heading for the exchange or topic block.',
    '10. Prefer subtitles that synthesize the broader theme, stance, tension, or takeaway instead of merely repeating the literal wording of one question line.',
    '11. Avoid generic labels such as "提问", "回答", "继续讨论", and avoid copying transcript lines verbatim unless there is no better abstraction.',
    '12. Make the subtitle still make sense when shown alone to a reader who has not seen the transcript.',
    '13. Use the same heading logic for all video types: for conversations, summarize the exchange theme; for non-conversations, summarize the main concept, claim, lesson, event, or takeaway.',
    '14. Write all section summaries in natural Simplified Chinese. Keep them very concise and factual.',
    '15. Each summary should be a single short sentence that captures the broader point of the section, ideally under 20 Chinese characters when possible.',
    '16. Keep each subtitle and each summary under 10 words when possible.',
    '17. Do not return transcript text.',
    '18. Must Do not split a question into one group and its answer into another',
    '',
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Subtitle type: ${bundle.isAutoGenerated ? 'auto-generated' : 'manual'}`,
    '',
    'Full Transcript:',
    transcriptBody,
  ].join('\n');
}

function buildFullTranscriptSectionsPrompt(bundle: TranscriptBundle): string {
  return buildBaseTranscriptSectionsPrompt(bundle);
}

function buildFullTranscriptSectionBoundariesPrompt(bundle: TranscriptBundle): string {
  const transcriptBody = bundle.chunks
    .map((chunk) => `[${formatTime(chunk.start)}] ${chunk.text}`)
    .join('\n');

  return [
    'Split the following full YouTube transcript into sections and return JSON only.',
    'These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.',
    'Decide the segmentation strategy before writing sections:',
    '1. If the content is clearly an interview, chat show, podcast, panel, debate, or host-guest conversation, segment primarily by question-answer exchanges or topic handoffs between speakers.',
    '2. Default to one section per main question and its direct answer whenever the conversation structure allows.',
    '3. Start a new section for each new host/interviewer question or each clearly new thing being asked, even if the broader theme stays related.',
    '4. Do not group multiple distinct questions into the same section just because they share a theme.',
    '5. If the content is not a conversation, segment by content structure instead: topic shifts, claims, examples, argument turns, or chapter-like transitions.',
    '6. When in doubt, prefer semantic content sections over arbitrary equal-sized chunks.',
    '7. Must Do not split a question into one group and its answer into another',
    '',
    'Tasks:',
    '1. Return 2 to 12 contiguous sections for the full transcript in chronological order.',
    '2. For each section, return startLabel, endLabel, a short subtitle, and a short summary.',
    '3. Use transcript timestamp labels from the source transcript for both startLabel and endLabel.',
    '4. startLabel must be the first transcript timestamp included in the section.',
    '5. endLabel must be the last transcript timestamp included in the section.',
    '6. Cover the whole transcript in order without overlap or gaps.',
    '7. Return only timestamp boundaries, subtitles, and summaries. Do not return transcript text.',
    '8. Keep section subtitles short, scannable, and thematic.',
    '9. Prefer subtitles that capture the broader topic, tension, stance, or takeaway instead of merely restating one question line.',
    '10. Make the subtitle still make sense when shown alone to a reader who has not seen the transcript.',
    '11. Use the same heading logic for all video types: for conversations, summarize the exchange theme; for non-conversations, summarize the main concept, claim, lesson, event, or takeaway.',
    '12. Keep section summaries concise and factual.',
    '13. Keep each subtitle and each summary under 10 words when possible.',
    '14. Must Do not split a question into one group and its answer into another',
    '',
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
    `Author: ${bundle.sourceAuthor}`,
    `Language: ${bundle.languageName} (${bundle.languageCode})`,
    `Subtitle type: ${bundle.isAutoGenerated ? 'auto-generated' : 'manual'}`,
    '',
    'Full Transcript:',
    transcriptBody,
  ].join('\n');
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
    'These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.',
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
    '- Return topicTitleZh as a concise higher-level Simplified Chinese heading that works as a quick summary before the dialogue.',
    '- Make topicTitleZh capture the broader theme, stance, tension, or takeaway of the section instead of merely paraphrasing the first question line.',
    '- Make topicTitleZh work for any video type: for conversations, summarize the exchange theme; for non-conversations, summarize the main concept, claim, lesson, event, or takeaway.',
    '- topicTitleZh should still make sense when shown alone to a reader who has not seen the transcript.',
    '- Keep topicTitleZh under 10 words.',
    '- Avoid generic labels and avoid copying a transcript line verbatim when a better abstraction is possible.',
    '- Return topicSummaryZh as one concise natural Simplified Chinese summary sentence for the broader point of the section.',
    '- Keep topicSummaryZh under 10 words.',
    '- Also return groups for the smaller exchanges inside this larger section.',
    '- Keep the section-level topicTitleZh/topicSummaryZh as the big chapter title and summary for the whole section.',
    '- Each item in groups must represent **one main question and one answer pair**, if no question found, generate one question according to the answer',
    '- For conversation content, create a new group for each distinct question and its direct answer whenever possible.',
    '- Do not lump multiple distinct questions into one group just because they share a theme.',
    '- For non-conversation content, group by coherent subtopic or idea block.',
    '- Each group must include a concise topicTitleZh under 10 words.',
    '- Each group must include the translated turns that belong to that group only, in original order.',
    '- Every translated turn must appear in exactly one group.',
    '- Must Do not split a question into one group and its answer into another',
    ...(usesManualPlaceholderCopy
      ? [
          '- The provided section subtitle and summary are generic placeholder labels created from a fixed time slice.',
          '- Do not literally translate those placeholder labels.',
          '- Instead, write a fresh concise topicTitleZh and a fresh concise topicSummaryZh based on the actual transcript content in this section.',
        ]
      : []),
    '',
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
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
    'These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.',
    'Goal:',
    '- Summarize the section as one central question and one central answer/takeaway.',
    '',
    'Rules:',
    '- If the section is an interview, chat show, podcast, panel, or speaker exchange, identify the main question being raised and the main answer given in this section.',
    '- If the section is not a literal Q&A, rewrite the section as the central question the content is addressing and the clearest answer or takeaway it provides.',
    '- Keep question and answer grounded in the transcript. Do not invent details.',
    '- Keep the original-language question and answer concise.',
    '- Translate both into natural Simplified Chinese.',
    '- Return topicTitleZh as a concise higher-level Simplified Chinese heading that works as a quick summary before this exchange.',
    '- Make topicTitleZh capture the broader theme, stance, tension, or takeaway instead of merely restating the question literally.',
    '- Make topicTitleZh work for any video type: for conversations, summarize the exchange theme; for non-conversations, summarize the main concept, claim, lesson, event, or takeaway.',
    '- topicTitleZh should still make sense when shown alone to a reader who has not seen the transcript.',
    '- Keep topicTitleZh under 10 words.',
    '- Avoid generic labels and avoid copying a transcript line verbatim when a better abstraction is possible.',
    '- Return topicSummaryZh as one concise Simplified Chinese summary sentence for the broader point of the exchange.',
    '- Keep topicSummaryZh under 10 words.',
    '- Must Do not split a question into one group and its answer into another',
    '',
    `Original YouTube Title: ${getPromptSourceTitle(bundle)}`,
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
  const rawTitleTranslationZh = typeof record.titleTranslationZh === 'string'
    ? normalizeChineseTitle(record.titleTranslationZh)
    : '';
  const titleTranslationZh = isPlaceholderChineseTitle(rawTitleTranslationZh)
    ? ''
    : rawTitleTranslationZh;
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
  maximumSections = 12,
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

function normalizeSectionBoundariesPayload(
  payload: unknown,
  model: string,
  minimumSections = 2,
  maximumSections = 12,
): TranscriptSectionBoundariesResult {
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
      }))
      .filter((item) => item.startLabel && item.endLabel && item.subtitle && item.summary)
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
  const topicTitleZh = typeof record.topicTitleZh === 'string'
    ? normalizeWhitespace(record.topicTitleZh)
    : (typeof record.subtitleZh === 'string' ? normalizeWhitespace(record.subtitleZh) : '');
  const topicSummaryZh = typeof record.topicSummaryZh === 'string'
    ? normalizeWhitespace(record.topicSummaryZh)
    : (typeof record.summaryZh === 'string' ? normalizeWhitespace(record.summaryZh) : '');
  const question = typeof record.question === 'string' ? normalizeWhitespace(record.question) : '';
  const answer = typeof record.answer === 'string' ? normalizeWhitespace(record.answer) : '';
  const questionZh = typeof record.questionZh === 'string' ? normalizeWhitespace(record.questionZh) : '';
  const answerZh = typeof record.answerZh === 'string' ? normalizeWhitespace(record.answerZh) : '';

  if (!topicTitleZh || !topicSummaryZh || !question || !answer || !questionZh || !answerZh) {
    throw new AppError('gemini_missing_dialogue_section_intro', 'Gemini 没有返回完整的速读版问答摘要。', 502);
  }

  return {
    section: {
      ...section,
      topicTitleZh,
      topicSummaryZh,
      subtitleZh: topicTitleZh,
      summaryZh: topicSummaryZh,
    },
    question,
    answer,
    questionZh,
    answerZh,
    model,
  };
}

function normalizeDialogueTurnRecord(item: Record<string, unknown>): TranscriptDialogueTurn {
  return {
    timestamp: typeof item.timestamp === 'string' ? normalizeWhitespace(item.timestamp) : '',
    speaker: typeof item.speaker === 'string' ? normalizeWhitespace(item.speaker) : '',
    textZh: typeof item.textZh === 'string' ? normalizeWhitespace(item.textZh) : '',
  };
}

function normalizeDialogueTurns(payload: unknown, model: string, section: TranscriptSection): TranscriptDialogueSliceResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_dialogue_payload', 'Gemini 返回了无法识别的对话翻译结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const topicTitleZh = typeof record.topicTitleZh === 'string'
    ? normalizeWhitespace(record.topicTitleZh)
    : (typeof record.subtitleZh === 'string' ? normalizeWhitespace(record.subtitleZh) : '');
  const topicSummaryZh = typeof record.topicSummaryZh === 'string'
    ? normalizeWhitespace(record.topicSummaryZh)
    : (typeof record.summaryZh === 'string' ? normalizeWhitespace(record.summaryZh) : '');
  const turns = Array.isArray(record.turns)
    ? record.turns
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map(normalizeDialogueTurnRecord)
      .filter((item) => item.timestamp && item.textZh)
    : [];
  const groups = Array.isArray(record.groups)
    ? record.groups
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        topicTitleZh: typeof item.topicTitleZh === 'string' ? normalizeWhitespace(item.topicTitleZh) : '',
        turns: Array.isArray(item.turns)
          ? item.turns
            .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === 'object' && !Array.isArray(turn))
            .map(normalizeDialogueTurnRecord)
            .filter((turn) => turn.timestamp && turn.textZh)
          : [],
      }))
      .filter((item) => item.topicTitleZh && item.turns.length)
    : [];

  if (!turns.length) {
    throw new AppError('gemini_missing_dialogue_turns', 'Gemini 没有返回可渲染的对话片段。', 502);
  }

  if (!topicTitleZh || !topicSummaryZh) {
    throw new AppError('gemini_missing_dialogue_section_intro', 'Gemini 没有返回可渲染的分段中文标题或摘要。', 502);
  }

  if (!groups.length) {
    groups.push({
      topicTitleZh,
      turns,
    });
  }

  return {
    section: {
      ...section,
      topicTitleZh,
      topicSummaryZh,
      subtitleZh: topicTitleZh,
      summaryZh: topicSummaryZh,
    },
    turns,
    groups,
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
    groups: (result.groups ?? []).map((group) => ({
      ...group,
      turns: group.turns.map((turn) => ({
        ...turn,
        speaker: '',
      })),
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

    return normalizeQuickTranscriptSectionsOverviewPayload(parsed, model);
  }

  return normalizeQuickTranscriptSectionsOverviewPayload(raw, model);
}

function normalizeQuickTranscriptSectionsOverviewPayload(
  payload: unknown,
  model: string,
): TranscriptSectionsResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('gemini_invalid_sections_payload', 'Gemini 返回了无法识别的速读版分段结果。', 502);
  }

  const record = payload as Record<string, unknown>;
  const rawTitleTranslationZh = typeof record.titleTranslationZh === 'string'
    ? normalizeChineseTitle(record.titleTranslationZh)
    : '';
  const titleTranslationZh = isPlaceholderChineseTitle(rawTitleTranslationZh)
    ? ''
    : rawTitleTranslationZh;
  const summaryZh = typeof record.summaryZh === 'string'
    ? normalizeWhitespace(record.summaryZh)
    : '';
  const summary = typeof record.summary === 'string'
    ? normalizeWhitespace(record.summary)
    : '';
  const speakers = Array.isArray(record.speakers)
    ? [...new Set(record.speakers
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeWhitespace(item))
      .filter((item) => Boolean(item) && item.length <= 80))]
    : [];

  if (!summaryZh || !summary) {
    throw new AppError('gemini_missing_summary', 'Gemini 没有返回完整的速读版高亮句。', 502);
  }

  return {
    sections: normalizeSectionBoundariesPayload(payload, model, 1, 12).sections.map((section) => ({
      ...section,
      transcript: '',
    })),
    titleTranslationZh,
    summaryZh,
    summary,
    speakers,
    model,
  };
}

export function parseTranscriptSectionBoundariesPayload(
  raw: unknown,
  model: string,
): TranscriptSectionBoundariesResult {
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

    return normalizeSectionBoundariesPayload(parsed, model);
  }

  return normalizeSectionBoundariesPayload(raw, model);
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
  const insights = await generateStructuredContent(
    model,
    apiKey,
    TRANSCRIPT_INSIGHTS_PROMPT_BUILDERS[normalizedReadingMode](bundle),
    INSIGHTS_SCHEMA,
    parseTranscriptInsightsPayload,
    signal,
  );

  return {
    ...insights,
    titleTranslationZh: sanitizeGeneratedTitleTranslation(bundle, insights.titleTranslationZh),
  };
}

export async function generateTranscriptSections(
  bundle: TranscriptBundle,
  env: {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_INSIGHTS_MODEL?: string;
    GEMINI_DIALOGUE_MODEL?: string;
  },
  readingMode: GeminiReadingMode = 'quick',
  signal?: AbortSignal,
): Promise<TranscriptSectionsResult> {
  const normalizedReadingMode = normalizeGeminiReadingMode(readingMode);
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('missing_gemini_key', '未配置 GEMINI_API_KEY，无法生成内容分段。', 500);
  }

  const model =
    normalizedReadingMode === 'quick'
      ? (
        env.GEMINI_DIALOGUE_MODEL?.trim()
        || env.GEMINI_MODEL?.trim()
        || DEFAULT_GEMINI_DIALOGUE_MODEL
      )
      : (
        env.GEMINI_INSIGHTS_MODEL?.trim()
        || env.GEMINI_MODEL?.trim()
        || DEFAULT_GEMINI_INSIGHTS_MODEL
      );
  return generateStructuredContent(
    model,
    apiKey,
    TRANSCRIPT_SECTIONS_PROMPT_BUILDERS[normalizedReadingMode](bundle),
    normalizedReadingMode === 'quick' ? QUICK_TRANSCRIPT_SECTIONS_SCHEMA : TRANSCRIPT_SECTIONS_SCHEMA,
    normalizedReadingMode === 'quick' ? parseQuickTranscriptSectionsPayload : parseTranscriptSectionsPayload,
    signal,
  ).then((result) => (
    normalizedReadingMode === 'quick'
      ? {
        ...result,
        titleTranslationZh: sanitizeGeneratedTitleTranslation(bundle, result.titleTranslationZh ?? ''),
      }
      : result
  ));
}

export async function generateTranscriptSectionBoundaries(
  bundle: TranscriptBundle,
  env: { GEMINI_API_KEY?: string; GEMINI_MODEL?: string; GEMINI_INSIGHTS_MODEL?: string },
  signal?: AbortSignal,
): Promise<TranscriptSectionBoundariesResult> {
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
    buildFullTranscriptSectionBoundariesPrompt(bundle),
    FULL_TRANSCRIPT_SECTION_BOUNDARIES_SCHEMA,
    parseTranscriptSectionBoundariesPayload,
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
