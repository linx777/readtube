import { AppError } from './errors';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

interface GeminiRequestOptions {
  apiKey: string;
  model?: string;
  prompt: string;
  systemPrompt?: string;
  generationConfig?: GeminiGenerationConfig;
}

function buildRequestBody(
  prompt: string,
  generationConfig?: GeminiGenerationConfig,
  systemPrompt?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: generationConfig?.temperature ?? 0.7,
      topP: generationConfig?.topP ?? 0.9,
      maxOutputTokens: generationConfig?.maxOutputTokens ?? 2048,
    },
  };

  if (systemPrompt?.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt.trim() }],
    };
  }

  return body;
}

function extractCandidateText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

async function parseGeminiError(response: Response): Promise<AppError> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; status?: string };
    };

    const status = payload.error?.status ?? '';
    const message = payload.error?.message || 'Gemini 请求失败，请稍后重试。';

    if (
      response.status === 429 ||
      status === 'RESOURCE_EXHAUSTED' ||
      /quota exceeded|rate limit|free tier/i.test(message)
    ) {
      return new AppError(
        'gemini_quota_exceeded',
        'Gemini 当前项目配额不足或免费额度已用尽。请切换到有额度的模型，或为 AI Studio 项目启用 billing。',
        response.status,
      );
    }

    return new AppError(
      'gemini_request_failed',
      message,
      response.status,
    );
  } catch {
    return new AppError('gemini_request_failed', 'Gemini 请求失败，请稍后重试。', response.status);
  }
}

function buildEndpoint(apiKey: string, model: string, streaming = false): string {
  if (streaming) {
    return `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  }

  return `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
}

export async function generateGeminiText(options: GeminiRequestOptions): Promise<string> {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const response = await fetch(buildEndpoint(options.apiKey, model, false), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(options.prompt, options.generationConfig, options.systemPrompt)),
  });

  if (!response.ok) {
    throw await parseGeminiError(response);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractCandidateText(payload);

  if (!text.trim()) {
    throw new AppError('gemini_empty_response', 'Gemini 没有返回可用内容。', 502);
  }

  return text;
}

function parseSseFrame(frame: string): { event: string; data: string } | null {
  const lines = frame
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

function takeSseFrame(buffer: string): { frame: string; rest: string } | null {
  const match = buffer.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return null;
  }

  const frame = buffer.slice(0, match.index);
  const rest = buffer.slice(match.index + match[0].length);
  return { frame, rest };
}

export async function* streamGeminiText(options: GeminiRequestOptions): AsyncGenerator<string> {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const response = await fetch(buildEndpoint(options.apiKey, model, true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(options.prompt, options.generationConfig, options.systemPrompt)),
  });

  if (!response.ok) {
    throw await parseGeminiError(response);
  }

  if (!response.body) {
    throw new AppError('gemini_missing_body', 'Gemini 没有返回流式响应。', 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let extracted = takeSseFrame(buffer);
    while (extracted) {
      const frame = extracted.frame;
      buffer = extracted.rest;

      const parsed = parseSseFrame(frame);
      if (!parsed?.data || parsed.data === '[DONE]') {
        extracted = takeSseFrame(buffer);
        continue;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(parsed.data) as Record<string, unknown>;
      } catch {
        extracted = takeSseFrame(buffer);
        continue;
      }

      const text = extractCandidateText(payload);
      if (text) {
        yield text;
      }

      extracted = takeSseFrame(buffer);
    }
  }

  buffer += decoder.decode();
  const trailing = parseSseFrame(buffer);
  if (trailing?.data && trailing.data !== '[DONE]') {
    try {
      const payload = JSON.parse(trailing.data) as Record<string, unknown>;
      const text = extractCandidateText(payload);
      if (text) {
        yield text;
      }
    } catch {
      return;
    }
  }
}
