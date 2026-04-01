import { describe, expect, it } from 'vitest';

import { buildTranscriptChunks, buildTranscriptPreview, extractVideoId, formatTime } from '../src/services/youtube';

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
