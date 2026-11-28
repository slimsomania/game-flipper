import { GAME_WIDTH } from '../../core/constants';
import { MUTE_BUTTON, CORNER_HIT_GAP, CORNER_HIT_SIZE, CORNER_X } from './muteLayout';
import { BAR_BOTTOM, BAR_TOP, BAR_X } from './powerBarLayout';
import { COLORS } from '../theme';
import { duelBanner, sideLines, type DuelSide } from './duelText';

/*
 * Where the two-player HUD is, in pixels on the 1280x720 canvas. The banner is centered at the top
 * (between the corner buttons' row on the right and the left stack). Player 1's stack is at the
 * left edge and Player 2's at the right edge, both below the corner buttons' row so the buttons'
 * clickable areas stay clear; the power bars stand by the hands, lower down.
 */
export const DUEL_MARGIN = 32;
export const BANNER = { x: GAME_WIDTH / 2, y: 20, size: 30 } as const;
export const STACK = {
  y: 100,
  labelSize: 24,
  scoreY: 131,
  scoreSize: 36,
  streakY: 177,
  streakSize: 24,
} as const;
/** Depth of the HUD texts, above the result flash like the solo HUD. */
export const DUEL_HUD_DEPTH = 20;

/** The text color of a side: the usual HUD color while it is the active one, gray while it waits. */
export const sideColor = (active: boolean): string => (active ? COLORS.text : COLORS.waiting);

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A text's estimated box (the real ones are measured in the e2e spec): wide letters, tall lines. */
function textBox(text: string, size: number, x: number, y: number, origin: 0 | 0.5 | 1): Box {
  const width = text.length * size * 0.62;
  const height = size * 1.25;
  const left = x - width * origin;
  return { left, top: y, right: left + width, bottom: y + height };
}

/** Every duel HUD text at its widest (two-digit numbers), with its font size and estimated box. */
export function duelTextBoxes(): { text: string; size: number; box: Box }[] {
  const out: { text: string; size: number; box: Box }[] = [];
  out.push({
    text: duelBanner(2, 10, 10),
    size: BANNER.size,
    box: textBox(duelBanner(2, 10, 10), BANNER.size, BANNER.x, BANNER.y, 0.5),
  });
  for (const side of [1, 2] as DuelSide[]) {
    const lines = sideLines(side, 99, 10);
    const x = side === 1 ? DUEL_MARGIN : GAME_WIDTH - DUEL_MARGIN;
    const origin = side === 1 ? 0 : 1;
    const rows = [
      [lines.label, STACK.labelSize, STACK.y],
      [lines.scoreLine, STACK.scoreSize, STACK.scoreY],
      [lines.streakLine, STACK.streakSize, STACK.streakY],
    ] as const;
    for (const [text, size, y] of rows) {
      out.push({ text, size, box: textBox(text, size, x, y, origin) });
    }
  }
  return out;
}

/** The corner buttons' clickable areas (pause, speaker, fullscreen) as boxes. */
export function cornerHitBoxes(): Box[] {
  const half = CORNER_HIT_SIZE / 2;
  const y = MUTE_BUTTON.y + MUTE_BUTTON.lip / 2;
  return [
    CORNER_X,
    CORNER_X - CORNER_HIT_SIZE - CORNER_HIT_GAP,
    CORNER_X - 2 * (CORNER_HIT_SIZE + CORNER_HIT_GAP),
  ].map((x) => ({ left: x - half, top: y - half, right: x + half, bottom: y + half }));
}

/** A power bar with its caption and value label: Player 1's on the left, Player 2's mirrored. */
export function barBoxes(): Box[] {
  const half = 45; // the 90 px touch area the caption and value fit in
  const box = (x: number): Box => ({
    left: x - half,
    top: BAR_TOP - 10 - 30,
    right: x + half,
    bottom: BAR_BOTTOM + 8 + 36,
  });
  return [box(BAR_X), box(GAME_WIDTH - BAR_X)];
}
