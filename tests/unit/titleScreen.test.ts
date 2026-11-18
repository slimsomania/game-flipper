import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { BUTTON_LIP } from '../../src/game/view/buttonView';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { titleTexts } from '../../src/game/view/titleText';

describe('titleTexts', () => {
  it('words the screen as the design does: name, Play, the best score, the controls', () => {
    expect(titleTexts(14)).toEqual({
      name: 'Flipper',
      playLabel: 'Play',
      startHint: 'or press Enter or Space',
      bestLine: 'Best: 14',
      controlsHint: 'Up/Down or wheel: power · Space: throw · or grab the bottle and push up',
    });
  });

  it('words the best score as the round summary does, for a best of 0 and a big one too', () => {
    expect(titleTexts(0).bestLine).toBe('Best: 0');
    expect(titleTexts(3).bestLine).toBe('Best: 3');
    expect(titleTexts(123).bestLine).toBe('Best: 123');
  });

  it('has a one-line controls hint that names every way to throw', () => {
    const { controlsHint } = titleTexts(0);
    expect(controlsHint).not.toContain('\n');
    for (const part of ['Up/Down', 'wheel', 'power', 'Space', 'throw', 'push up']) {
      expect(controlsHint).toContain(part);
    }
  });

  it('says that Enter and Space also start a round', () => {
    expect(titleTexts(0).startHint).toContain('Enter');
    expect(titleTexts(0).startHint).toContain('Space');
  });
});

describe('TITLE_LAYOUT', () => {
  const { play } = TITLE_LAYOUT;
  /** Top and bottom of each row: text rows by their font size, the button with its lip. */
  const rows = [
    {
      name: 'name',
      top: TITLE_LAYOUT.nameY - TITLE_LAYOUT.nameSize * 0.6,
      bottom: TITLE_LAYOUT.nameY + TITLE_LAYOUT.nameSize * 0.6,
    },
    { name: 'play', top: play.y - play.height / 2, bottom: play.y + play.height / 2 + BUTTON_LIP },
    { name: 'startHint', top: TITLE_LAYOUT.startHintY - 14, bottom: TITLE_LAYOUT.startHintY + 14 },
    { name: 'best', top: TITLE_LAYOUT.bestY - 24, bottom: TITLE_LAYOUT.bestY + 24 },
    {
      name: 'controls',
      top: TITLE_LAYOUT.controlsHintY - 16,
      bottom: TITLE_LAYOUT.controlsHintY + 16,
    },
  ];

  it('centers the Play button on the canvas', () => {
    expect(play.x).toBe(GAME_WIDTH / 2);
  });

  it('stacks the rows in reading order with a clear gap, nothing overlapping', () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].top, `${rows[i].name} clears ${rows[i - 1].name}`).toBeGreaterThanOrEqual(
        rows[i - 1].bottom + 8,
      );
    }
  });

  it('keeps every row on the canvas', () => {
    expect(rows[0].top).toBeGreaterThan(0);
    expect(rows[rows.length - 1].bottom).toBeLessThan(GAME_HEIGHT);
    expect(play.x - play.width / 2).toBeGreaterThan(0);
    expect(TITLE_LAYOUT.maxTextWidth).toBeLessThan(GAME_WIDTH);
  });

  it('leaves the top-right corner to the speaker button', () => {
    const buttonBottom = MUTE_BUTTON.y + MUTE_BUTTON.height / 2 + MUTE_BUTTON.lip;
    const buttonLeft = MUTE_BUTTON.x - MUTE_BUTTON.width / 2;
    // The name is at most `maxTextWidth` wide and centered: the button is right of that box (or,
    // as long as the box reaches it, above the name's row), so the two never overlap.
    const nameRight = (GAME_WIDTH + TITLE_LAYOUT.maxTextWidth) / 2;
    expect(buttonLeft >= nameRight || buttonBottom < rows[0].top).toBe(true);
    for (const row of rows.slice(1)) expect(buttonBottom).toBeLessThan(row.top);
  });
});
