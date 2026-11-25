import type { InputKind } from '../inputKind';

/** The lines of the title screen, as the player reads them. */
export interface TitleTexts {
  /** The game's name. */
  name: string;
  playLabel: string;
  /** Under the Play button: the keys that do the same thing; null on a touch device (no keys). */
  startHint: string | null;
  /** "Best: 14": the best round score saved so far (0 before any round scored). */
  bestLine: string;
  /** One line about the controls: mouse and keyboard, or fingers. */
  controlsHint: string;
}

/**
 * The words of the title screen (the design's section 6). "Best: N" is worded exactly as on the round
 * summary. The keyboard line names what the game really does: Up and Down or the wheel set the power,
 * Space throws, and pushing the bottle upward with the mouse throws it too. On a touch device the
 * line speaks of fingers and the key hint is left out.
 */
export function titleTexts(best: number, kind: InputKind = 'keyboard'): TitleTexts {
  const touch = kind === 'touch';
  return {
    name: 'Flipper',
    playLabel: 'Play',
    startHint: touch ? null : 'or press Enter or Space',
    bestLine: `Best: ${best}`,
    controlsHint: touch
      ? 'Touch the bottle and push it up to throw'
      : 'Up/Down or wheel: power · Space: throw · or grab the bottle and push up',
  };
}
