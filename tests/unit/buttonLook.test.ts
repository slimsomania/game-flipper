import { describe, expect, it } from 'vitest';
import { BUTTON_LIP, buttonLook } from '../../src/game/view/buttonView';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';

describe('buttonLook', () => {
  it('tells idle, hover and pressed apart by the face color', () => {
    const faces = (['idle', 'hover', 'pressed'] as const).map((state) => buttonLook(state).face);
    expect(new Set(faces).size).toBe(3);
  });

  it('sinks the face when pressed, but never past the lip', () => {
    expect(buttonLook('idle').sink).toBe(0);
    expect(buttonLook('hover').sink).toBe(0);
    expect(buttonLook('pressed').sink).toBeGreaterThan(0);
    expect(buttonLook('pressed').sink).toBeLessThan(BUTTON_LIP);
  });

  it('keeps the same lip color in every state, so it reads as one button', () => {
    const lips = new Set((['idle', 'hover', 'pressed'] as const).map((s) => buttonLook(s).lip));
    expect(lips.size).toBe(1);
  });
});

describe('SUMMARY_LAYOUT', () => {
  const { card, playAgain } = SUMMARY_LAYOUT;

  it('centers the card on the canvas and keeps it, with its shadow, on the screen', () => {
    expect(card.x).toBe(GAME_WIDTH / 2);
    expect(card.y).toBe(GAME_HEIGHT / 2);
    expect(card.x - card.width / 2).toBeGreaterThan(0);
    expect(card.y + card.height / 2 + SUMMARY_LAYOUT.shadow).toBeLessThan(GAME_HEIGHT);
  });

  it('puts every line and the button inside the card, in reading order', () => {
    const top = card.y - card.height / 2;
    const bottom = card.y + card.height / 2;
    const ys = [
      SUMMARY_LAYOUT.titleY,
      SUMMARY_LAYOUT.scoreY,
      SUMMARY_LAYOUT.landedY,
      SUMMARY_LAYOUT.bestY,
      SUMMARY_LAYOUT.newBestY,
      playAgain.y,
      SUMMARY_LAYOUT.keyHintY,
    ];
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ys[0]).toBeGreaterThan(top);
    expect(ys[ys.length - 1]).toBeLessThan(bottom);
    // The lines of the best score (36 px and 32 px text) don't touch each other or the line above.
    // A text box can be about 1.3 times its font size tall, so two lines need half of 1.3 times
    // both sizes between their centers: 36 + 32 px text needs 44.2 px (40 overlapped on Linux CI).
    expect(SUMMARY_LAYOUT.bestY - SUMMARY_LAYOUT.landedY).toBeGreaterThanOrEqual(0.65 * (44 + 36));
    expect(SUMMARY_LAYOUT.newBestY - SUMMARY_LAYOUT.bestY).toBeGreaterThanOrEqual(0.65 * (36 + 32));
    // The button and its lip stay clear of the lines around it.
    expect(playAgain.y - playAgain.height / 2).toBeGreaterThan(SUMMARY_LAYOUT.newBestY + 20);
    expect(playAgain.y + playAgain.height / 2 + BUTTON_LIP).toBeLessThan(
      SUMMARY_LAYOUT.keyHintY - 12,
    );
  });

  // F018 put the Title button beside Play again, so it is the row of the two that is centered.
  it('centers the row of the Play again and Title buttons and fits it in the card', () => {
    const { title } = SUMMARY_LAYOUT;
    const rowLeft = playAgain.x - playAgain.width / 2;
    const rowRight = title.x + title.width / 2;
    expect((rowLeft + rowRight) / 2).toBe(card.x);
    expect(rowLeft).toBeGreaterThan(card.x - card.width / 2);
    expect(rowRight).toBeLessThan(card.x + card.width / 2);
  });

  it('puts the Title button right of Play again, in the same row, with a gap between them', () => {
    const { title } = SUMMARY_LAYOUT;
    expect(title.y).toBe(playAgain.y);
    expect(title.height).toBe(playAgain.height);
    const gap = title.x - title.width / 2 - (playAgain.x + playAgain.width / 2);
    expect(gap).toBeGreaterThanOrEqual(16);
    // Both are wide enough for their labels ("Play again" is the longer one at 36 px bold).
    expect(playAgain.width).toBeGreaterThanOrEqual(260);
    expect(title.width).toBeGreaterThanOrEqual(150);
  });
});
