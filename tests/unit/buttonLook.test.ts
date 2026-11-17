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
    expect(SUMMARY_LAYOUT.bestY - SUMMARY_LAYOUT.landedY).toBeGreaterThanOrEqual(50);
    expect(SUMMARY_LAYOUT.newBestY - SUMMARY_LAYOUT.bestY).toBeGreaterThanOrEqual(36);
    // The button and its lip stay clear of the lines around it.
    expect(playAgain.y - playAgain.height / 2).toBeGreaterThan(SUMMARY_LAYOUT.newBestY + 20);
    expect(playAgain.y + playAgain.height / 2 + BUTTON_LIP).toBeLessThan(
      SUMMARY_LAYOUT.keyHintY - 12,
    );
  });

  it('centers the button horizontally and fits it in the card', () => {
    expect(playAgain.x).toBe(card.x);
    expect(playAgain.width).toBeLessThan(card.width);
  });
});
