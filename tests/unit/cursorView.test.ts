import { describe, expect, it } from 'vitest';
import { cursorFor } from '../../src/game/view/cursorView';

describe('cursorFor', () => {
  it('is a grabbing hand while the bottle is held with the mouse, wherever the pointer is', () => {
    expect(cursorFor(true, true)).toBe('grabbing');
    expect(cursorFor(true, false)).toBe('grabbing');
  });

  it('is an open hand over a bottle that can be grabbed', () => {
    expect(cursorFor(false, true)).toBe('grab');
  });

  it('is the normal arrow everywhere else', () => {
    expect(cursorFor(false, false)).toBe('');
  });
});
