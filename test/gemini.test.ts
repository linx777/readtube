import { describe, expect, it } from 'vitest';

import {
  generateTranscriptSections,
  generateTranscriptSectionBoundaries,
  generateTranscriptInsights,
  parseQuickTranscriptSectionSummaryPayload,
  parseQuickTranscriptSectionsPayload,
  parseTranscriptDialoguePayload,
  parseTranscriptSectionBoundariesPayload,
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
                text: '{"titleTranslationZh":"企业为什么更谨慎地采用 AI","summaryZh":"企业开始更谨慎地把 AI 用在真实工作流里。","summary":"Companies are using AI more carefully in real workflows.","speakers":["Host","Guest"],"sections":[{"startLabel":"20:00","endLabel":"24:30","subtitle":"Host frames the concern","summary":"The host raises the central concern and sets up the response."}]}',
              },
            ],
          },
        },
      ],
    }, 'gemini-3.1-pro-preview')).toEqual({
      titleTranslationZh: '企业为什么更谨慎地采用 AI',
      summaryZh: '企业开始更谨慎地把 AI 用在真实工作流里。',
      summary: 'Companies are using AI more carefully in real workflows.',
      speakers: ['Host', 'Guest'],
      sections: [
        {
          startLabel: '20:00',
          endLabel: '24:30',
          subtitle: 'Host frames the concern',
          summary: 'The host raises the central concern and sets up the response.',
          transcript: '',
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });
});

describe('parseTranscriptSectionBoundariesPayload', () => {
  it('parses full-transcript section boundaries without transcript text', () => {
    expect(parseTranscriptSectionBoundariesPayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sections":[{"startLabel":"00:00","endLabel":"02:10","subtitle":"Why typography matters","summary":"Introduces why typography changes readability and trust."},{"startLabel":"02:10","endLabel":"05:20","subtitle":"Layout systems","summary":"Explains spacing, hierarchy, and rhythm in layout systems."}]}',
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
        },
        {
          startLabel: '02:10',
          endLabel: '05:20',
          subtitle: 'Layout systems',
          summary: 'Explains spacing, hierarchy, and rhythm in layout systems.',
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
                text: '{"sectionTitleZh":"AI采用争论","sectionSummaryZh":"先抛出采用分歧。","topics":[{"topicTitleZh":"社会恐慌与采纳","question":{"timestamp":"00:12","speaker":"Jen","content":"面对 AI 带来的重大问题，公司与风投机构的应对有何不同？"},"answers":[{"timestamp":"00:35","speaker":"Mark","content":"这些问题价值巨大，而且目前还没有定论。"}]}]}',
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
        topicTitleZh: 'AI采用争论',
        topicSummaryZh: '先抛出采用分歧。',
        subtitleZh: 'AI采用争论',
        summaryZh: '先抛出采用分歧。',
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
      groups: [
        {
          topicTitleZh: '社会恐慌与采纳',
          question: {
            timestamp: '00:12',
            speaker: 'Jen',
            textZh: '面对 AI 带来的重大问题，公司与风投机构的应对有何不同？',
          },
          answers: [
            {
              timestamp: '00:35',
              speaker: 'Mark',
              textZh: '这些问题价值巨大，而且目前还没有定论。',
            },
          ],
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
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('parses one question with multiple answers when each answer has a different speaker', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sectionTitleZh":"多方回应","sectionSummaryZh":"多方表态。","topics":[{"topicTitleZh":"AI价值判断","question":{"timestamp":"00:12","speaker":"Jen","content":"你们分别怎么看 AI 的长期影响？"},"answers":[{"timestamp":"00:35","speaker":"Marc","content":"我认为它会重塑软件和生产力。"},{"timestamp":"00:48","speaker":"Ben","content":"我更关注它对组织结构和决策流程的影响。"}]}]}',
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
        topicTitleZh: '多方回应',
        topicSummaryZh: '多方表态。',
        subtitleZh: '多方回应',
        summaryZh: '多方表态。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '你们分别怎么看 AI 的长期影响？',
        },
        {
          timestamp: '00:35',
          speaker: 'Marc',
          textZh: '我认为它会重塑软件和生产力。',
        },
        {
          timestamp: '00:48',
          speaker: 'Ben',
          textZh: '我更关注它对组织结构和决策流程的影响。',
        },
      ],
      groups: [
        {
          topicTitleZh: 'AI价值判断',
          question: {
            timestamp: '00:12',
            speaker: 'Jen',
            textZh: '你们分别怎么看 AI 的长期影响？',
          },
          answers: [
            {
              timestamp: '00:35',
              speaker: 'Marc',
              textZh: '我认为它会重塑软件和生产力。',
            },
            {
              timestamp: '00:48',
              speaker: 'Ben',
              textZh: '我更关注它对组织结构和决策流程的影响。',
            },
          ],
          turns: [
            {
              timestamp: '00:12',
              speaker: 'Jen',
              textZh: '你们分别怎么看 AI 的长期影响？',
            },
            {
              timestamp: '00:35',
              speaker: 'Marc',
              textZh: '我认为它会重塑软件和生产力。',
            },
            {
              timestamp: '00:48',
              speaker: 'Ben',
              textZh: '我更关注它对组织结构和决策流程的影响。',
            },
          ],
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
                text: '{"sectionTitleZh":"独白开场","sectionSummaryZh":"先交代背景。","topics":[{"topicTitleZh":"独白开场","question":{"timestamp":"00:12","speaker":"","content":"这段内容主要在讲什么？"},"answers":[{"timestamp":"00:35","speaker":"","content":"讲者先从背景开始，再给出自己的判断。"}]}]}',
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
        topicTitleZh: '独白开场',
        topicSummaryZh: '先交代背景。',
        subtitleZh: '独白开场',
        summaryZh: '先交代背景。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: '',
          textZh: '这段内容主要在讲什么？',
        },
        {
          timestamp: '00:35',
          speaker: '',
          textZh: '讲者先从背景开始，再给出自己的判断。',
        },
      ],
      groups: [
        {
          topicTitleZh: '独白开场',
          question: {
            timestamp: '00:12',
            speaker: '',
            textZh: '这段内容主要在讲什么？',
          },
          answers: [
            {
              timestamp: '00:35',
              speaker: '',
              textZh: '讲者先从背景开始，再给出自己的判断。',
            },
          ],
          turns: [
            {
              timestamp: '00:12',
              speaker: '',
              textZh: '这段内容主要在讲什么？',
            },
            {
              timestamp: '00:35',
              speaker: '',
              textZh: '讲者先从背景开始，再给出自己的判断。',
            },
          ],
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('salvages legacy dialogue groups when Gemini returns translated turns without structured topics', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"topicTitleZh":"AI采用争论","topicSummaryZh":"先抛出采用分歧。","groups":[{"topicTitleZh":"社会恐慌与采纳","turns":[{"timestamp":"00:12","speaker":"Jen","textZh":"为什么企业现在更谨慎？"},{"timestamp":"00:35","speaker":"Mark","textZh":"因为部署要先落到真实流程里。"}]}]}',
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
        topicTitleZh: 'AI采用争论',
        topicSummaryZh: '先抛出采用分歧。',
        subtitleZh: 'AI采用争论',
        summaryZh: '先抛出采用分歧。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '为什么企业现在更谨慎？',
        },
        {
          timestamp: '00:35',
          speaker: 'Mark',
          textZh: '因为部署要先落到真实流程里。',
        },
      ],
      groups: [
        {
          topicTitleZh: '社会恐慌与采纳',
          turns: [
            {
              timestamp: '00:12',
              speaker: 'Jen',
              textZh: '为什么企业现在更谨慎？',
            },
            {
              timestamp: '00:35',
              speaker: 'Mark',
              textZh: '因为部署要先落到真实流程里。',
            },
          ],
        },
      ],
      model: 'gemini-3.1-pro-preview',
      usedFallback: true,
    });
  });

  it('reuses existing section preview copy when salvaging translated turns without section intro fields', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"groups":[{"turns":[{"timestamp":"00:12","speaker":"Jen","textZh":"为什么企业现在更谨慎？"},{"timestamp":"00:35","speaker":"Mark","textZh":"因为部署要先落到真实流程里。"}]}]}',
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
      topicTitleZh: '预览标题',
      topicSummaryZh: '预览摘要。',
      subtitleZh: '预览标题',
      summaryZh: '预览摘要。',
    })).toEqual({
      section: {
        startLabel: '00:00',
        endLabel: '05:00',
        subtitle: 'Opening debate',
        summary: 'The host frames the AI adoption debate.',
        transcript: '[00:12] Example line',
        topicTitleZh: '预览标题',
        topicSummaryZh: '预览摘要。',
        subtitleZh: '预览标题',
        summaryZh: '预览摘要。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '为什么企业现在更谨慎？',
        },
        {
          timestamp: '00:35',
          speaker: 'Mark',
          textZh: '因为部署要先落到真实流程里。',
        },
      ],
      groups: [
        {
          topicTitleZh: '话题 1',
          turns: [
            {
              timestamp: '00:12',
              speaker: 'Jen',
              textZh: '为什么企业现在更谨慎？',
            },
            {
              timestamp: '00:35',
              speaker: 'Mark',
              textZh: '因为部署要先落到真实流程里。',
            },
          ],
        },
      ],
      model: 'gemini-3.1-pro-preview',
      usedFallback: true,
    });
  });

  it('salvages translated turns when a topic question is not a single question sentence', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sectionTitleZh":"AI采用争论","sectionSummaryZh":"先抛出采用分歧。","topics":[{"topicTitleZh":"社会恐慌与采纳","question":{"timestamp":"00:12","speaker":"Jen","content":"企业现在更谨慎。"},"answers":[{"timestamp":"00:35","speaker":"Mark","content":"因为部署要先落到真实流程里。"}]}]}',
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
        topicTitleZh: 'AI采用争论',
        topicSummaryZh: '先抛出采用分歧。',
        subtitleZh: 'AI采用争论',
        summaryZh: '先抛出采用分歧。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '企业现在更谨慎。',
        },
        {
          timestamp: '00:35',
          speaker: 'Mark',
          textZh: '因为部署要先落到真实流程里。',
        },
      ],
      groups: [
        {
          topicTitleZh: '社会恐慌与采纳',
          turns: [
            {
              timestamp: '00:12',
              speaker: 'Jen',
              textZh: '企业现在更谨慎。',
            },
            {
              timestamp: '00:35',
              speaker: 'Mark',
              textZh: '因为部署要先落到真实流程里。',
            },
          ],
        },
      ],
      model: 'gemini-3.1-pro-preview',
      usedFallback: true,
    });
  });

  it('preserves structured question and answers when multiple answers reuse the same speaker', () => {
    expect(parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sectionTitleZh":"多方回应","sectionSummaryZh":"多方表态。","topics":[{"topicTitleZh":"AI价值判断","question":{"timestamp":"00:12","speaker":"Jen","content":"你们分别怎么看 AI 的长期影响？"},"answers":[{"timestamp":"00:35","speaker":"Marc","content":"我认为它会重塑软件和生产力。"},{"timestamp":"00:48","speaker":"Marc","content":"我也认为它会改变组织流程。"}]}]}',
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
        topicTitleZh: '多方回应',
        topicSummaryZh: '多方表态。',
        subtitleZh: '多方回应',
        summaryZh: '多方表态。',
      },
      turns: [
        {
          timestamp: '00:12',
          speaker: 'Jen',
          textZh: '你们分别怎么看 AI 的长期影响？',
        },
        {
          timestamp: '00:35',
          speaker: 'Marc',
          textZh: '我认为它会重塑软件和生产力。',
        },
        {
          timestamp: '00:48',
          speaker: 'Marc',
          textZh: '我也认为它会改变组织流程。',
        },
      ],
      groups: [
        {
          topicTitleZh: 'AI价值判断',
          question: {
            timestamp: '00:12',
            speaker: 'Jen',
            textZh: '你们分别怎么看 AI 的长期影响？',
          },
          answers: [
            {
              timestamp: '00:35',
              speaker: 'Marc',
              textZh: '我认为它会重塑软件和生产力。',
            },
            {
              timestamp: '00:48',
              speaker: 'Marc',
              textZh: '我也认为它会改变组织流程。',
            },
          ],
          turns: [
            {
              timestamp: '00:12',
              speaker: 'Jen',
              textZh: '你们分别怎么看 AI 的长期影响？',
            },
            {
              timestamp: '00:35',
              speaker: 'Marc',
              textZh: '我认为它会重塑软件和生产力。',
            },
            {
              timestamp: '00:48',
              speaker: 'Marc',
              textZh: '我也认为它会改变组织流程。',
            },
          ],
        },
      ],
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('still rejects dialogue payloads when there are no usable translated turns to render', () => {
    expect(() => parseTranscriptDialoguePayload({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"sectionTitleZh":"多方回应","sectionSummaryZh":"多方表态。","topics":[{"topicTitleZh":"AI价值判断","question":{"timestamp":"","speaker":"Jen","content":"你们分别怎么看 AI 的长期影响？"},"answers":[{"timestamp":"","speaker":"Marc","content":"我认为它会重塑软件和生产力。"}]}]}',
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
    })).toThrow('Gemini 没有返回可渲染的对话片段。');
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
                text: '{"topicTitleZh":"AI采用阻力","topicSummaryZh":"企业转向谨慎部署。","question":"Why is AI adoption slowing down for companies?","answer":"Because firms are moving from hype to measured deployments tied to real workflows.","questionZh":"为什么企业的 AI 采用速度放慢了？","answerZh":"因为企业正从追逐热潮转向围绕真实工作流做更谨慎的部署。"}',
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
        topicTitleZh: 'AI采用阻力',
        topicSummaryZh: '企业转向谨慎部署。',
        subtitleZh: 'AI采用阻力',
        summaryZh: '企业转向谨慎部署。',
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
                text: '{"sectionTitleZh":"独白开场","sectionSummaryZh":"讲者先交代背景。","topics":[{"topicTitleZh":"独白开场","question":{"timestamp":"00:12","speaker":"Donald","content":"这段内容主要在讲什么？"},"answers":[{"timestamp":"00:12","speaker":"Donald","content":"先从背景开始说起。"}]}]}',
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
          topicTitleZh: '独白开场',
          topicSummaryZh: '讲者先交代背景。',
          subtitleZh: '独白开场',
          summaryZh: '讲者先交代背景。',
        },
        turns: [
          {
            timestamp: '00:12',
            speaker: '',
            textZh: '这段内容主要在讲什么？',
          },
          {
            timestamp: '00:12',
            speaker: '',
            textZh: '先从背景开始说起。',
          },
        ],
        groups: [
          {
            topicTitleZh: '独白开场',
            question: {
              timestamp: '00:12',
              speaker: '',
              textZh: '这段内容主要在讲什么？',
            },
            answers: [
              {
                timestamp: '00:12',
                speaker: '',
                textZh: '先从背景开始说起。',
              },
            ],
            turns: [
              {
                timestamp: '00:12',
                speaker: '',
                textZh: '这段内容主要在讲什么？',
              },
              {
                timestamp: '00:12',
                speaker: '',
                textZh: '先从背景开始说起。',
              },
            ],
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
                  text: '{"sectionTitleZh":"AI 采用趋势","sectionSummaryZh":"聚焦AI落地。","topics":[{"topicTitleZh":"AI采用趋势","question":{"timestamp":"40:05","speaker":"","content":"企业在这一段里如何采用 AI？"},"answers":[{"timestamp":"40:05","speaker":"","content":"企业开始更务实地采用 AI。"}]}]}',
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
      expect(requestPrompt).toContain('write a fresh concise sectionTitleZh');
      expect(requestPrompt).toContain('These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.');
      expect(requestPrompt).toContain('Return sectionTitleZh as a concise higher-level Simplified Chinese heading');
      expect(requestPrompt).toContain('Return sectionSummaryZh as one concise natural Simplified Chinese summary sentence');
      expect(requestPrompt).toContain('Keep sectionTitleZh to exactly 4 Chinese characters when possible.');
      expect(requestPrompt).toContain('Keep sectionSummaryZh under 10 Chinese characters.');
      expect(requestPrompt).toContain('Also return topics for the smaller exchanges inside this larger section.');
      expect(requestPrompt).toContain('Each item in topics must represent exactly one main question with one or more direct answers.');
      expect(requestPrompt).toContain('Each topic.question must be a single translated question turn with its speaker and timestamp.');
      expect(requestPrompt).toContain('topic.question.content must be written as exactly one explicit question sentence, not multiple stitched questions.');
      expect(requestPrompt).toContain('Each item in topic.answers must be a single translated answer turn with its speaker and timestamp.');
      expect(requestPrompt).toContain('Keep each question concise, but keep each answer detailed and complete.');
      expect(requestPrompt).toContain('Do not over-compress answers into short summaries or slogans.');
      expect(requestPrompt).toContain('Preserve the answer detail from the source: key reasoning, examples, evidence, comparisons, qualifiers, and concrete claims should stay in topic.answers[*].content whenever present.');
      expect(requestPrompt).toContain('topic.answers[*].content may be multiple sentences when needed to retain the original detail and words.');
      expect(requestPrompt).toContain('If multiple speakers answer the same question, keep them as separate items in topic.answers instead of merging them into one speaker turn.');
      expect(requestPrompt).toContain('When topic.answers has multiple items, each answer must have a different non-empty speaker name.');
      expect(requestPrompt).toContain('sectionSummaryZh is the only place for a short summary; topic.answers[*].content should preserve the substantive detail of the original answer.');
      expect(requestPrompt).toContain('HARD REQUIREMENT FOR EVERY TOPIC: Each topic MUST contain exactly one question.');
      expect(requestPrompt).toContain('Each topic MUST contain one or more answers in answers.');
      expect(requestPrompt).toContain('If only answers are present, generate one corresponding question.');
      expect(requestPrompt).toContain('If, after processing, a topic still does not contain one valid question and at least one valid answer, discard that topic entirely.');
      expect(requestPrompt).toContain('FINAL CHECK BEFORE RETURNING: delete any topic that does not end with exactly one question and at least one answer.');
      expect(requestPrompt).toContain('Every translated idea in the section must appear in exactly one topic question or one of its answers.');
      expect(requestPrompt).toContain('"sectionTitleZh": "..."');
      expect(requestPrompt).toContain('"topics": [');
      expect(requestPrompt).toContain('"question": { "timestamp": "...", "speaker": "...", "content": "..." }');
      expect(requestPrompt).toContain('"answers": [');
      expect(requestPrompt).toContain('capture the broader theme, stance, tension, or takeaway');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('generateTranscriptInsights', () => {
  it('sends N/A to Gemini when the source title is only the internal fallback placeholder', async () => {
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
                  text: '{"titleTranslationZh":"","summaryZh":"这是一句中文高亮。","summary":"This is a highlight.","speakers":[]}',
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
      await expect(generateTranscriptInsights(
        {
          videoId: 'xRh2sVcNXQ8',
          sourceTitle: 'YouTube 视频 xRh2sVcNXQ8',
          sourceAuthor: 'Unknown Channel',
          channelId: '',
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
        {
          GEMINI_API_KEY: 'test-key',
        },
        'quick',
      )).resolves.toMatchObject({
        titleTranslationZh: '',
        summaryZh: '这是一句中文高亮。',
        summary: 'This is a highlight.',
      });

      expect(requestPrompt).toContain('Original YouTube Title: N/A');
      expect(requestPrompt).not.toContain('Original YouTube Title: YouTube 视频 xRh2sVcNXQ8');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('drops a generic Gemini title when the original YouTube title is more specific', async () => {
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
                  text: '{"titleTranslationZh":"YouTube","summaryZh":"这是一句中文高亮。","summary":"This is a highlight.","speakers":[]}',
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
      await expect(generateTranscriptInsights(
        {
          videoId: 'xRh2sVcNXQ8',
          sourceTitle: 'Marc Andreessen\'s 2026 Outlook: AI Timelines, US vs. China, and The Price of AI',
          sourceAuthor: 'a16z',
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
        {
          GEMINI_API_KEY: 'test-key',
        },
        'quick',
      )).resolves.toMatchObject({
        titleTranslationZh: '',
        summaryZh: '这是一句中文高亮。',
        summary: 'This is a highlight.',
      });

      expect(requestPrompt).toContain('Original YouTube Title: Marc Andreessen\'s 2026 Outlook: AI Timelines, US vs. China, and The Price of AI');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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
                  text: '{"topicTitleZh":"AI采用阻力","topicSummaryZh":"企业转向谨慎部署。","question":"Why is AI adoption slowing down for companies?","answer":"Because firms are moving from hype to measured deployments tied to real workflows.","questionZh":"为什么企业的 AI 采用速度放慢了？","answerZh":"因为企业正从追逐热潮转向围绕真实工作流做更谨慎的部署。"}',
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
      expect(requestPrompt).toContain('These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.');
      expect(requestPrompt).toContain('Return topicTitleZh as a concise higher-level Simplified Chinese heading');
      expect(requestPrompt).toContain('Make topicTitleZh work for any video type');
      expect(requestPrompt).toContain('Return topicSummaryZh as one concise Simplified Chinese summary sentence');
      expect(requestPrompt).toContain('Keep topicTitleZh to exactly 4 Chinese characters when possible.');
      expect(requestPrompt).toContain('Keep topicSummaryZh under 10 Chinese characters.');
      expect(requestPrompt).toContain('instead of merely restating the question literally');
      expect(requestPrompt).toContain('HARD REQUIREMENT FOR EVERY TOPIC/GROUP: Each topic MUST contain exactly one question and exactly one answer.');
      expect(requestPrompt).toContain('NO EXCEPTIONS: no more, no less.');
      expect(requestPrompt).toContain('If only an answer is present, generate a corresponding question.');
      expect(requestPrompt).toContain('If only a question is present, remove it.');
      expect(requestPrompt).toContain('FINAL CHECK BEFORE RETURNING: delete the section result if it does not end with exactly one question and exactly one answer.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('generateTranscriptSections', () => {
  it('asks Gemini quick mode for Chinese title, highlight, and Chinese slice summaries in one shot', async () => {
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
                  text: '{"titleTranslationZh":"企业为什么更谨慎地采用 AI","summaryZh":"企业开始更谨慎地把 AI 用在真实工作流里。","summary":"Companies are using AI more carefully in real workflows.","speakers":["Host","Guest"],"sections":[{"startLabel":"00:00","endLabel":"01:10","subtitle":"提出顾虑","summary":"先抛出采用放缓的问题。"},{"startLabel":"01:10","endLabel":"03:45","subtitle":"解释原因","summary":"再解释企业为何更谨慎。"}]}',
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
      await expect(generateTranscriptSections(
        {
          videoId: 'abc123xyz00',
          sourceTitle: 'Why AI adoption is slowing down',
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
            { start: 70, end: 90, text: 'Companies are getting more careful now.' },
          ],
          transcriptText: 'Why is adoption slowing down?\nCompanies are getting more careful now.',
        },
        {
          GEMINI_API_KEY: 'test-key',
          GEMINI_DIALOGUE_MODEL: 'gemini-3.1-flash-lite-preview',
        },
        'quick',
      )).resolves.toEqual({
        titleTranslationZh: '企业为什么更谨慎地采用 AI',
        summaryZh: '企业开始更谨慎地把 AI 用在真实工作流里。',
        summary: 'Companies are using AI more carefully in real workflows.',
        speakers: ['Host', 'Guest'],
        sections: [
          {
            startLabel: '00:00',
            endLabel: '01:10',
            subtitle: '提出顾虑',
            summary: '先抛出采用放缓的问题。',
            transcript: '',
          },
          {
            startLabel: '01:10',
            endLabel: '03:45',
            subtitle: '解释原因',
            summary: '再解释企业为何更谨慎。',
            transcript: '',
          },
        ],
        model: 'gemini-3.1-flash-lite-preview',
      });

      expect(requestPrompt).toContain('For each section, return only startLabel, endLabel, a short Simplified Chinese subtitle, and a short Simplified Chinese summary.');
      expect(requestPrompt).toContain('These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.');
      expect(requestPrompt).toContain('keep each question with its direct answer in the same section whenever possible');
      expect(requestPrompt).toContain('Default to one section per main question and its direct answer whenever the conversation structure allows.');
      expect(requestPrompt).toContain('Do not group multiple distinct questions into the same section just because they share a theme.');
      expect(requestPrompt).toContain('Do not merge unrelated Q&A themes into the same section');
      expect(requestPrompt).toContain('Write all section subtitles in natural Simplified Chinese');
      expect(requestPrompt).toContain('Each subtitle should work as a higher-level quick-summary heading');
      expect(requestPrompt).toContain('Use the same heading logic for all video types');
      expect(requestPrompt).toContain('instead of merely repeating the literal wording of one question line');
      expect(requestPrompt).toContain('Write all section summaries in natural Simplified Chinese');
      expect(requestPrompt).toContain('Make each subtitle exactly 4 Chinese characters when possible.');
      expect(requestPrompt).toContain('Each summary should be a single short sentence that captures the broader point of the section and must stay under 10 Chinese characters.');
      expect(requestPrompt).toContain('titleTranslationZh');
      expect(requestPrompt).toContain('summaryZh');
      expect(requestPrompt).toContain('summary');
      expect(requestPrompt).toContain('speakers');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('generateTranscriptSectionBoundaries', () => {
  it('asks Gemini for timestamp-only semantic sections for the full transcript', async () => {
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
                  text: '{"sections":[{"startLabel":"00:00","endLabel":"01:10","subtitle":"Opening","summary":"Introduces the topic."},{"startLabel":"01:10","endLabel":"03:45","subtitle":"Main discussion","summary":"Develops the central argument."}]}',
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
      await expect(generateTranscriptSectionBoundaries(
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
            { start: 0, end: 10, text: 'Opening line' },
            { start: 70, end: 90, text: 'Main discussion line' },
          ],
          transcriptText: 'Opening line\nMain discussion line',
        },
        {
          GEMINI_API_KEY: 'test-key',
          GEMINI_INSIGHTS_MODEL: 'gemini-3.1-pro-preview',
        },
      )).resolves.toEqual({
        sections: [
          {
            startLabel: '00:00',
            endLabel: '01:10',
            subtitle: 'Opening',
            summary: 'Introduces the topic.',
          },
          {
            startLabel: '01:10',
            endLabel: '03:45',
            subtitle: 'Main discussion',
            summary: 'Develops the central argument.',
          },
        ],
        model: 'gemini-3.1-pro-preview',
      });

      expect(requestPrompt).toContain('Return only timestamp boundaries, subtitles, and summaries. Do not return transcript text.');
      expect(requestPrompt).toContain('startLabel must be the first transcript timestamp included in the section.');
      expect(requestPrompt).toContain('These rules must generalize across interviews, podcasts, lectures, explainers, tutorials, news reports, documentaries, monologues, vlogs, speeches, and mixed-format videos.');
      expect(requestPrompt).toContain('Default to one section per main question and its direct answer whenever the conversation structure allows.');
      expect(requestPrompt).toContain('Do not group multiple distinct questions into the same section just because they share a theme.');
      expect(requestPrompt).toContain('Keep section subtitles short, scannable, and thematic.');
      expect(requestPrompt).toContain('Use the same heading logic for all video types');
      expect(requestPrompt).toContain('instead of merely restating one question line');
      expect(requestPrompt).toContain('Make each subtitle exactly 4 Chinese characters when possible.');
      expect(requestPrompt).toContain('Keep each summary under 10 Chinese characters.');
      expect(requestPrompt).toContain('HARD REQUIREMENT FOR EVERY TOPIC/GROUP: Each topic MUST contain exactly one question and exactly one answer.');
      expect(requestPrompt).toContain('NO EXCEPTIONS: no more, no less.');
      expect(requestPrompt).toContain('If only an answer is present, generate a corresponding question.');
      expect(requestPrompt).toContain('If only a question is present, remove it.');
      expect(requestPrompt).toContain('Full Transcript:');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
