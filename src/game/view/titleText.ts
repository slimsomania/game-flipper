import type { InputKind } from '../inputKind';

/** The lines of the title screen, as the player reads them. */
export interface TitleTexts {
  /** The game's name. */
  name: string;
  playLabel: string;
  howToLabel: string;
  /** Under the Play button: the keys that do the same thing; null on a touch device (no keys). */
  startHint: string | null;
  /** "Best: 14": the best round score saved so far (0 before any round scored). */
  bestLine: string;
  /** The quiet line under the best score: who made the game. */
  creditLine: string;
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
    name: 'Flipsy',
    playLabel: 'Play',
    howToLabel: 'How to play',
    startHint: touch ? null : 'or press Enter or Space',
    bestLine: `Best: ${best}`,
    creditLine: 'Created and designed by Vlas',
    controlsHint: touch
      ? 'Push the bottle up, or set the power bar and tap the bottle'
      : 'Up/Down or wheel: power · Space: throw · or grab the bottle and push up',
  };
}
