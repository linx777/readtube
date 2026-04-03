import { describe, expect, it } from 'vitest';

import {
  generateTranscriptInsights,
  parseQuickTranscriptSectionSummaryPayload,
  parseQuickTranscriptSectionsPayload,
  parseTranscriptDialoguePayload,
  parseTranscriptInsightsPayload,
  parseTranscriptSectionsPayload,
  summarizeQuickTranscriptSection,
  translateTranscriptSectionToZh,
} from '../src/services/gemini';

describe('parseTranscriptInsightsPayload', () => {
  it('parses Gemini candidate text JSON', () => {
    expect(parseTranscriptInsightsPayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"titleTranslationZh":"网络时代的排版原则","summaryZh":"排版不只是让内容更美观，它还决定了人们是否愿意继续读下去。","summary":"Typography does not just decorate content, it decides whether people keep reading.","speakers":["Host","Guest","Host"]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      titleTranslationZh: '网络时代的排版原则',
      summaryZh: '排版不只是让内容更美观，它还决定了人们是否愿意继续读下去。',
      summary: 'Typography does not just decorate content, it decides whether people keep reading.',
      speakers: ['Host', 'Guest'],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('accepts already-unwrapped structured payloads', () => {
    expect(parseTranscriptInsightsPayload({
      titleTranslationZh: '“这是一条中文标题”',
      summaryZh: '这是一句中文高亮句。',
      summary: '这是一句原文高亮句。',
      speakers: ['主持人', '嘉宾'],
      sections: [
        {
          startLabel: '00:00',
          endLabel: '01:00',
          subtitle: '开场',
          summary: '介绍本期主题。',
          transcript: '[00:00] 开场白',
        },
        {
          startLabel: '01:00',
          endLabel: '02:00',
          subtitle: '讨论',
          summary: '展开主要观点。',
          transcript: '[01:00] 主要内容',
        },
        {
          startLabel: '02:00',
          endLabel: '03:00',
          subtitle: '结尾',
          summary: '收束并总结。',
          transcript: '[02:00] 结束语',
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      titleTranslationZh: '这是一条中文标题',
      summaryZh: '这是一句中文高亮句。',
      summary: '这是一句原文高亮句。',
      speakers: ['主持人', '嘉宾'],
      model: 'gemini-3.1-pro-preview',
    });
  });
});

describe('parseTranscriptSectionsPayload', () => {
  it('parses transcript sections from Gemini candidate text JSON', () => {
    expect(parseTranscriptSectionsPayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sections":[{"startLabel":"00:00","endLabel":"02:10","subtitle":"Why typography matters","summary":"Introduces why typography changes readability and trust.","transcript":"[00:00] Typography shapes how people read.\\n[01:10] It affects comprehension."},{"startLabel":"02:10","endLabel":"05:20","subtitle":"Layout systems","summary":"Explains spacing, hierarchy, and rhythm in layout systems.","transcript":"[02:10] Layout creates rhythm.\\n[03:45] Spacing is structure."}]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      sections: [
        {
          startLabel: '00:00',
          endLabel: '02:10',
          subtitle: 'Why typography matters',
          summary: 'Introduces why typography changes readability and trust.',
          transcript: '[00:00] Typography shapes how people read.\n[01:10] It affects comprehension.',
        },
        {
          startLabel: '02:10',
          endLabel: '05:20',
          subtitle: 'Layout systems',
          summary: 'Explains spacing, hierarchy, and rhythm in layout systems.',
          transcript: '[02:10] Layout creates rhythm.\n[03:45] Spacing is structure.',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('accepts already-unwrapped section payloads', () => {
    expect(parseTranscriptSectionsPayload({
      sections: [
        {
          startLabel: '00:00',
          endLabel: '01:00',
          subtitle: '开场',
          summary: '介绍本期主题。',
          transcript: '[00:00] 开场白',
        },
        {
          startLabel: '01:00',
          endLabel: '02:00',
          subtitle: '讨论',
          summary: '展开主要观点。',
          transcript: '[01:00] 主要内容',
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      sections: [
        {
          startLabel: '00:00',
          endLabel: '01:00',
          subtitle: '开场',
          summary: '介绍本期主题。',
          transcript: '[00:00] 开场白',
        },
        {
          startLabel: '01:00',
          endLabel: '02:00',
          subtitle: '讨论',
          summary: '展开主要观点。',
          transcript: '[01:00] 主要内容',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });
});

describe('parseQuickTranscriptSectionsPayload', () => {
  it('accepts a single section for a sliced quick-mode response', () => {
    expect(parseQuickTranscriptSectionsPayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sections":[{"startLabel":"20:00","endLabel":"24:30","subtitle":"Host frames the concern","summary":"The host raises the central concern and sets up the response.","transcript":"[20:00] Why is adoption slowing down?\\n[21:10] That is the key concern."}]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      sections: [
        {
          startLabel: '20:00',
          endLabel: '24:30',
          subtitle: 'Host frames the concern',
          summary: 'The host raises the central concern and sets up the response.',
          transcript: '[20:00] Why is adoption slowing down?\n[21:10] That is the key concern.',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });
});

describe('parseTranscriptDialoguePayload', () => {
  it('parses translated speaker turns for one section', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"subtitleZh":"开场争论","summaryZh":"主持人先抛出 AI 采用争议的背景。","turns":[{"timestamp":"00:12","speaker":"Jen","textZh":"面对 AI 带来的重大问题，公司与风投机构的应对有何不同？"},{"timestamp":"00:35","speaker":"Mark","textZh":"这些问题价值巨大，而且目前还没有定论。"}]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview', {
      startLabel: '00:00',
      endLabel: '05:00',
      subtitle: 'Opening debate',
      summary: 'The host frames the AI adoption debate.',
      transcript: '[00:12] Example line',
    })).toEqual({
      section: {
        startLabel: '00:00',
        endLabel: '05:00',
        subtitle: 'Opening debate',
        summary: 'The host frames the AI adoption debate.',
        transcript: '[00:12] Example line',
        subtitleZh: '开场争论',
        summaryZh: '主持人先抛出 AI 采用争议的背景。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '面对 AI 带来的重大问题，公司与风投机构的应对有何不同？',
        },
        {
          timestamp: '00:35',
          speaker: 'Mark',
          textZh: '这些问题价值巨大，而且目前还没有定论。',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('keeps turns with empty speaker names for no-speaker rendering', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"subtitleZh":"独白开场","summaryZh":"讲者先交代背景。","turns":[{"timestamp":"00:12","speaker":"","textZh":"先从背景开始说起。"},{"timestamp":"00:35","speaker":"","textZh":"接着给出自己的判断。"}]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview', {
      startLabel: '00:00',
      endLabel: '05:00',
      subtitle: 'Opening monologue',
      summary: 'The speaker sets up the topic alone.',
      transcript: '[00:12] Example line',
    })).toEqual({
      section: {
        startLabel: '00:00',
        endLabel: '05:00',
        subtitle: 'Opening monologue',
        summary: 'The speaker sets up the topic alone.',
        transcript: '[00:12] Example line',
        subtitleZh: '独白开场',
        summaryZh: '讲者先交代背景。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: '',
          textZh: '先从背景开始说起。',
        },
        {
          timestamp: '00:35',
          speaker: '',
          textZh: '接着给出自己的判断。',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });
});

describe('parseQuickTranscriptSectionSummaryPayload', () => {
  it('parses quick-mode central question and answer summaries', () => {
    expect(parseQuickTranscriptSectionSummaryPayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"subtitleZh":"AI 采用阻力","summaryZh":"这一段集中讨论企业为什么放慢采用速度。","question":"Why is AI adoption slowing down for companies?","answer":"Because firms are moving from hype to measured deployments tied to real workflows.","questionZh":"为什么企业的 AI 采用速度放慢了？","answerZh":"因为企业正从追逐热潮转向围绕真实工作流做更谨慎的部署。"}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-flash-lite-preview', {
      startLabel: '20:00',
      endLabel: '24:30',
      subtitle: 'Host frames the concern',
      summary: 'The host raises the central concern and sets up the response.',
      transcript: '[20:00] Why is adoption slowing down?',
    })).toEqual({
      section: {
        startLabel: '20:00',
        endLabel: '24:30',
        subtitle: 'Host frames the concern',
        summary: 'The host raises the central concern and sets up the response.',
        transcript: '[20:00] Why is adoption slowing down?',
        subtitleZh: 'AI 采用阻力',
        summaryZh: '这一段集中讨论企业为什么放慢采用速度。',
      },
      question: 'Why is AI adoption slowing down for companies?',
      answer: 'Because firms are moving from hype to measured deployments tied to real workflows.',
      questionZh: '为什么企业的 AI 采用速度放慢了？',
      answerZh: '因为企业正从追逐热潮转向围绕真实工作流做更谨慎的部署。',
      model: 'gemini-3.1-flash-lite-preview',
    });
  });
});

describe('translateTranscriptSectionToZh', () => {
  it('strips returned speaker names when the initial insights speaker list is empty', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"subtitleZh":"独白开场","summaryZh":"讲者先交代背景。","turns":[{"timestamp":"00:12","speaker":"Donald","textZh":"先从背景开始说起。"}]}',
              },
            ],
          },
        },
      ],
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })) as typeof fetch;

    try {
      await expect(translateTranscriptSectionToZh(
        {
          videoId: 'abc123xyz00',
          sourceTitle: 'Test title',
          sourceAuthor: 'Test author',
          channelId: 'channel',
          languageCode: 'en',
          languageName: 'English',
          isAutoGenerated: true,
          durationSeconds: 60,
          viewCount: 10,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          segments: [],
          chunks: [
            { start: 12, end: 18, text: 'Example line' },
          ],
          transcriptText: 'Example line',
        },
        {
          startLabel: '00:00',
          endLabel: '00:30',
          subtitle: 'Opening',
          summary: 'Intro',
          transcript: '[00:12] Example line',
        },
        {
          titleTranslationZh: '测试标题',
          summaryZh: '测试摘要',
          summary: 'Test summary',
          speakers: [],
          model: 'gemini-3.1-pro-preview',
        },
        '测试标题',
        {
          GEMINI_API_KEY: 'test-key',
          GEMINI_DIALOGUE_MODEL: 'gemini-3.1-flash-lite-preview',
        },
      )).resolves.toEqual({
        section: {
          startLabel: '00:00',
          endLabel: '00:30',
          subtitle: 'Opening',
          summary: 'Intro',
          transcript: '[00:12] Example line',
          subtitleZh: '独白开场',
          summaryZh: '讲者先交代背景。',
        },
        turns: [
          {
            timestamp: '00:12',
            speaker: '',
            textZh: '先从背景开始说起。',
          },
        ],
        model: 'gemini-3.1-flash-lite-preview',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('tells Gemini to generate fresh Chinese slice copy for manual placeholder sections', async () => {
    const originalFetch = globalThis.fetch;
    let requestPrompt = '';
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };
      requestPrompt = payload.contents?.[0]?.parts?.[0]?.text ?? '';

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"subtitleZh":"AI 采用趋势","summaryZh":"这一段聚焦企业采用 AI 的现实进展。","turns":[{"timestamp":"40:05","speaker":"","textZh":"企业开始更务实地采用 AI。"}]}',
                },
              ],
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }) as typeof fetch;

    try {
      await translateTranscriptSectionToZh(
        {
          videoId: 'abc123xyz00',
          sourceTitle: 'Test title',
          sourceAuthor: 'Test author',
          channelId: 'channel',
          languageCode: 'en',
          languageName: 'English',
          isAutoGenerated: true,
          durationSeconds: 60,
          viewCount: 10,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          segments: [],
          chunks: [
            { start: 2405, end: 2410, text: 'Example line' },
          ],
          transcriptText: 'Example line',
        },
        {
          startLabel: '40:00',
          endLabel: '01:00:00',
          subtitle: 'Transcript Section 3',
          summary: 'Transcript content from 40:00 to 01:00:00.',
          transcript: '[40:05] Example line',
        },
        {
          titleTranslationZh: '测试标题',
          summaryZh: '测试摘要',
          summary: 'Test summary',
          speakers: [],
          model: 'gemini-3.1-pro-preview',
        },
        '测试标题',
        {
          GEMINI_API_KEY: 'test-key',
          GEMINI_DIALOGUE_MODEL: 'gemini-3.1-flash-lite-preview',
        },
      );

      expect(requestPrompt).toContain('The provided section subtitle and summary are generic placeholder labels created from a fixed time slice.');
      expect(requestPrompt).toContain('Do not literally translate those placeholder labels.');
      expect(requestPrompt).toContain('write a fresh concise Simplified Chinese subtitle');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('generateTranscriptInsights', () => {
  it('reports a mode-specific error for quick mode when GEMINI_API_KEY is missing', async () => {
    await expect(generateTranscriptInsights(
      {
        videoId: 'abc123xyz00',
        sourceTitle: 'Test title',
        sourceAuthor: 'Test author',
        channelId: 'channel',
        languageCode: 'en',
        languageName: 'English',
        isAutoGenerated: true,
        durationSeconds: 60,
        viewCount: 10,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        segments: [],
        chunks: [
          { start: 0, end: 10, text: 'Example line' },
        ],
        transcriptText: 'Example line',
      },
      {},
      'quick',
    )).rejects.toThrow('无法生成速读版 AI 高亮句');
  });

  it('reports a mode-specific error for full mode when GEMINI_API_KEY is missing', async () => {
    await expect(generateTranscriptInsights(
      {
        videoId: 'abc123xyz00',
        sourceTitle: 'Test title',
        sourceAuthor: 'Test author',
        channelId: 'channel',
        languageCode: 'en',
        languageName: 'English',
        isAutoGenerated: true,
        durationSeconds: 60,
        viewCount: 10,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        segments: [],
        chunks: [
          { start: 0, end: 10, text: 'Example line' },
        ],
        transcriptText: 'Example line',
      },
      {},
      'full',
    )).rejects.toThrow('无法生成详细版 AI 高亮句');
  });
});

describe('summarizeQuickTranscriptSection', () => {
  it('tells Gemini to summarize each quick section as one central question and answer', async () => {
    const originalFetch = globalThis.fetch;
    let requestPrompt = '';
    globalThis.fetch = (async (_input, init) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };
      requestPrompt = payload.contents?.[0]?.parts?.[0]?.text ?? '';

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"subtitleZh":"AI 采用阻力","summaryZh":"这一段集中讨论企业为什么放慢采用速度。","question":"Why is AI adoption slowing down for companies?","answer":"Because firms are moving from hype to measured deployments tied to real workflows.","questionZh":"为什么企业的 AI 采用速度放慢了？","answerZh":"因为企业正从追逐热潮转向围绕真实工作流做更谨慎的部署。"}',
                },
              ],
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }) as typeof fetch;

    try {
      await summarizeQuickTranscriptSection(
        {
          videoId: 'abc123xyz00',
          sourceTitle: 'Test title',
          sourceAuthor: 'Test author',
          channelId: 'channel',
          languageCode: 'en',
          languageName: 'English',
          isAutoGenerated: true,
          durationSeconds: 60,
          viewCount: 10,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          segments: [],
          chunks: [
            { start: 0, end: 10, text: 'Why is adoption slowing down?' },
          ],
          transcriptText: 'Why is adoption slowing down?',
        },
        {
          startLabel: '20:00',
          endLabel: '24:30',
          subtitle: 'Host frames the concern',
          summary: 'The host raises the central concern and sets up the response.',
          transcript: '[20:00] Why is adoption slowing down?\n[21:10] Companies are getting more careful now.',
        },
        {
          GEMINI_API_KEY: 'test-key',
          GEMINI_DIALOGUE_MODEL: 'gemini-3.1-flash-lite-preview',
        },
      );

      expect(requestPrompt).toContain('Summarize the section as one central question and one central answer/takeaway.');
      expect(requestPrompt).toContain('If the section is an interview, chat show, podcast, panel, or speaker exchange');
      expect(requestPrompt).toContain('If the section is not a literal Q&A, rewrite the section as the central question');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
