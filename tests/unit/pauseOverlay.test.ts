import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { BUTTON_LIP } from '../../src/game/view/buttonView';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { pauseIcon, playIcon } from '../../src/game/view/pauseIcon';
import { PAUSE_BUTTON, PAUSE_LAYOUT } from '../../src/game/view/pauseLayout';
import { pauseTexts } from '../../src/game/view/pauseText';
import { ICON_HALF, type IconShape } from '../../src/game/view/speakerIcon';

const points = (shapes: IconShape[]) =>
  shapes.flatMap((shape) => (shape.kind === 'polygon' ? [...shape.points] : []));

describe('pauseTexts', () => {
  it('words the overlay as the design does: Resume and Quit to title, plus Restart', () => {
    expect(pauseTexts()).toEqual({
      title: 'Paused',
      resumeLabel: 'Resume',
      restartLabel: 'Restart',
      quitLabel: 'Quit to title',
      keyHint: 'Esc or P to resume',
    });
  });

  it('names the keys that resume, and not R, which does nothing while paused', () => {
    const { keyHint } = pauseTexts();
    expect(keyHint).toContain('Esc');
    expect(keyHint).toContain('P');
    expect(keyHint).not.toMatch(/\bR\b/);
  });
});

describe('pause and play icons', () => {
  it('draws the pause icon as two bars, side by side with a gap, centered', () => {
    const shapes = pauseIcon();
    expect(shapes.map((shape) => shape.kind)).toEqual(['polygon', 'polygon']);
    const [left, right] = shapes.map((shape) => points([shape]).map((p) => p.x));
    expect(Math.max(...left)).toBeLessThan(Math.min(...right) - 4);
    expect(Math.min(...left)).toBe(-Math.max(...right));
  });

  it('draws the play icon as one triangle pointing right', () => {
    const shapes = playIcon();
    expect(shapes).toHaveLength(1);
    const corners = points(shapes);
    expect(corners).toHaveLength(3);
    const tip = corners.reduce((a, b) => (b.x > a.x ? b : a));
    expect(tip.y).toBe(0);
    expect(corners.filter((p) => p.x < tip.x)).toHaveLength(2);
  });

  it('makes the two icons differ in shape, not only in color', () => {
    expect(pauseIcon()).not.toEqual(playIcon());
  });

  it.each([
    ['pause', pauseIcon()],
    ['play', playIcon()],
  ])("keeps the %s icon inside the speaker icon's box, roughly centered", (_name, shapes) => {
    const all = points(shapes);
    for (const p of all) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(ICON_HALF);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(ICON_HALF);
    }
    const xs = all.map((p) => p.x);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2)).toBeLessThanOrEqual(4);
  });
});

describe('PAUSE_BUTTON layout', () => {
  const { x, y, width, height } = PAUSE_BUTTON;
  const right = x + width / 2;
  const left = x - width / 2;

  it("is the speaker button's twin: same size, same row, to its left", () => {
    expect(width).toBe(MUTE_BUTTON.width);
    expect(height).toBe(MUTE_BUTTON.height);
    expect(y).toBe(MUTE_BUTTON.y);
    expect(x).toBeLessThan(MUTE_BUTTON.x);
  });

  it('leaves a clear gap to the speaker, so a click lands on only one of them', () => {
    expect(MUTE_BUTTON.x - MUTE_BUTTON.width / 2 - right).toBeGreaterThanOrEqual(8);
  });

  it('is on the canvas, clear of the HUD at the left and the result message at the top middle', () => {
    expect(left).toBeGreaterThan(GAME_WIDTH / 2 + 300);
    expect(y + height / 2 + BUTTON_LIP).toBeLessThan(GAME_HEIGHT / 6);
  });
});

describe('PAUSE_LAYOUT', () => {
  const { card, resume, restart, quit } = PAUSE_LAYOUT;
  const buttons = [resume, restart, quit];
  const top = (b: { y: number; height: number }) => b.y - b.height / 2;
  const bottom = (b: { y: number; height: number }) => b.y + b.height / 2 + BUTTON_LIP;

  it('centers the card and the buttons on the canvas', () => {
    expect(card.x).toBe(GAME_WIDTH / 2);
    expect(card.y).toBe(GAME_HEIGHT / 2);
    for (const button of buttons) expect(button.x).toBe(GAME_WIDTH / 2);
  });

  it('stacks Resume, Restart and Quit to title top to bottom with a clear gap', () => {
    expect(top(restart)).toBeGreaterThanOrEqual(bottom(resume) + 8);
    expect(top(quit)).toBeGreaterThanOrEqual(bottom(restart) + 8);
  });

  it('keeps the title, the buttons and the key hint inside the card, in reading order', () => {
    const cardTop = card.y - card.height / 2;
    const cardBottom = card.y + card.height / 2;
    const titleBottom = PAUSE_LAYOUT.titleY + PAUSE_LAYOUT.titleSize * 0.6;
    expect(PAUSE_LAYOUT.titleY - PAUSE_LAYOUT.titleSize * 0.6).toBeGreaterThan(cardTop);
    expect(top(resume)).toBeGreaterThanOrEqual(titleBottom + 8);
    expect(PAUSE_LAYOUT.hintY - 14).toBeGreaterThanOrEqual(bottom(quit) + 8);
    expect(PAUSE_LAYOUT.hintY + 14).toBeLessThan(cardBottom);
    for (const button of buttons) {
      expect(button.x - button.width / 2).toBeGreaterThan(card.x - card.width / 2);
      expect(button.x + button.width / 2).toBeLessThan(card.x + card.width / 2);
    }
  });

  it('fits on the canvas and leaves the corner buttons uncovered by the card', () => {
    expect(card.y - card.height / 2).toBeGreaterThan(0);
    expect(card.y + card.height / 2 + PAUSE_LAYOUT.shadow).toBeLessThan(GAME_HEIGHT);
    expect(card.x + card.width / 2).toBeLessThan(PAUSE_BUTTON.x - PAUSE_BUTTON.width / 2);
  });

  it('leaves the held bottle (about x 230 to 330) and the power bar uncovered, so it can be seen dimmed', () => {
    expect(card.x - card.width / 2).toBeGreaterThan(340);
  });

  it('dims with a veil that is dark and see-through', () => {
    expect(PAUSE_LAYOUT.dim.alpha).toBeGreaterThan(0.3);
    expect(PAUSE_LAYOUT.dim.alpha).toBeLessThan(0.8);
  });
});
