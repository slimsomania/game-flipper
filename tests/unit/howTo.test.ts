import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { hitBox, type HitBox } from '../../src/game/view/buttonView';
import { HOW_TO_LAYOUT } from '../../src/game/view/howToLayout';
import { howToTexts } from '../../src/game/view/howToText';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';

describe('howToTexts', () => {
  it('keyboard: the goal, the desktop controls, water, scoring, streak, and the credit last', () => {
    const { lines } = howToTexts('keyboard');
    expect(lines[0]).toMatch(/flips .* lands upright on its base/);
    expect(lines[1]).toContain('Up/Down');
    expect(lines[1]).toContain('mouse wheel');
    expect(lines[1]).toContain('Space');
    expect(lines[1]).toMatch(/grab the bottle and push it up with the mouse/);
    expect(lines[2]).toMatch(/more water/);
    expect(lines[2]).toMatch(/heavier/);
    expect(lines[2]).toMatch(/more power/);
    expect(lines[2]).not.toMatch(/\d/);
    const scoring = lines[3];
    expect(scoring).toMatch(/1 point for a single/);
    expect(scoring).toMatch(/2 for a double/);
    expect(scoring).toMatch(/3 for a triple/);
    expect(scoring).toMatch(/5 for landing on the cap/);
    expect(scoring).toMatch(/round is 10 throws/);
    expect(scoring).toMatch(/best score is saved/);
    expect(lines[4]).toMatch(/streak counts landings in a row/);
    expect(lines[4]).toMatch(/no points/);
    expect(lines[lines.length - 1]).toBe('Created and designed by Vlas');
  });

  it('touch: finger controls and no key names', () => {
    const { lines, title, closeLabel } = howToTexts('touch');
    expect(lines[1]).toMatch(/finger/);
    expect(lines[1]).toMatch(/slide the power bar and then tap the bottle/);
    for (const text of [title, closeLabel, ...lines]) {
      expect(text, text).not.toMatch(/\b(Up|Down|Space|Enter|Esc|H)\b/);
    }
    expect(lines[lines.length - 1]).toBe('Created and designed by Vlas');
  });

  it('the two kinds differ only in the controls line', () => {
    const k = howToTexts('keyboard').lines;
    const t = howToTexts('touch').lines;
    expect(t.filter((line, i) => line !== k[i])).toEqual([t[1]]);
  });
});

const overlap = (a: HitBox, b: HitBox) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('how to play layout', () => {
  const L = HOW_TO_LAYOUT;
  const closeHit = hitBox(L.close);

  it('the card is on the canvas and every text size is at least the phone minimum', () => {
    expect(L.box.left).toBeGreaterThanOrEqual(0);
    expect(L.box.top).toBeGreaterThanOrEqual(0);
    expect(L.box.right).toBeLessThanOrEqual(GAME_WIDTH);
    expect(L.box.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
    for (const size of [L.title.size, L.close.fontSize, L.body.size, L.credit.size]) {
      expect(size).toBeGreaterThanOrEqual(L.minTextSize);
    }
  });

  it('the body column, the picture strip, the title, the close button and the credit fit and do not overlap', () => {
    const { body, pictures, title, credit } = L;
    expect(body.left + body.width).toBeLessThan(pictures.left);
    expect(pictures.left + pictures.width).toBeLessThanOrEqual(L.box.right);
    expect(pictures.top + pictures.height).toBeLessThanOrEqual(credit.y - credit.size / 2);
    expect(body.maxBottom).toBeLessThan(credit.y - credit.size / 2);
    expect(credit.y + credit.size).toBeLessThanOrEqual(L.box.bottom);
    expect(title.x).toBeGreaterThan(L.box.left);
    expect(closeHit.top).toBeGreaterThan(L.box.top);
    expect(closeHit.right).toBeLessThan(L.box.right);
    expect(closeHit.bottom).toBeLessThan(Math.min(body.top, pictures.top));
    // The title sits left of the button.
    expect(title.x + 400).toBeLessThan(closeHit.left);
  });

  it('the Close and How to play hit areas are at least 88x88 and overlap no other button', () => {
    const howTo = hitBox(TITLE_LAYOUT.howTo);
    for (const box of [closeHit, howTo]) {
      expect(box.right - box.left).toBeGreaterThanOrEqual(88);
      expect(box.bottom - box.top).toBeGreaterThanOrEqual(88);
    }
    const others = [hitBox(TITLE_LAYOUT.play), hitBox(MUTE_BUTTON)];
    for (const other of others) expect(overlap(howTo, other)).toBe(false);
  });
});
