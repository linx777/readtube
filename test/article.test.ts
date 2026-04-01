import { describe, expect, it } from 'vitest';

import { splitChunksForCompression } from '../src/services/article';
import type { TranscriptChunk } from '../src/services/youtube';

describe('compression batching shape', () => {
  it('splits long transcript chunks into multiple prompt-sized batches', () => {
    const chunks: TranscriptChunk[] = [
      { start: 0, end: 4, text: 'alpha beta gamma' },
      { start: 5, end: 10, text: 'delta epsilon zeta' },
      { start: 11, end: 15, text: 'eta theta iota' },
    ];

    const batches = splitChunksForCompression(chunks, 40);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches[0]).toContain('alpha beta gamma');
    expect(batches.at(-1)).toContain('eta theta iota');
  });
});
