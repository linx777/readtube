import { describe, expect, it } from 'vitest';

import { formatLocalDayKey } from '../src/ui/page';

describe('page helpers', () => {
  it('formats local day keys as yyyy-mm-dd', () => {
    expect(formatLocalDayKey(new Date(2026, 3, 5, 9, 30, 0))).toBe('2026-04-05');
  });
});
