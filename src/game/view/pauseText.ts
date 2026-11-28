import type { InputKind } from '../inputKind';

/** The words of the pause overlay, as the player reads them. */
export interface PauseTexts {
  title: string;
  resumeLabel: string;
  howToLabel: string;
  restartLabel: string;
  quitLabel: string;
  /** Under the buttons: the keys that pause and resume; null on a touch device (no keys). */
  keyHint: string | null;
}

/**
 * The words of the overlay (the design's section 6 lists Resume and Quit to title; section 7 adds the
 * Restart button, so the overlay has all three). Restart starts a new round: the hint doesn't
 * name R, because R does nothing while the game is paused.
 */
export function pauseTexts(kind: InputKind = 'keyboard'): PauseTexts {
  return {
    title: 'Paused',
    resumeLabel: 'Resume',
    howToLabel: 'How to play',
    restartLabel: 'Restart',
    quitLabel: 'Quit to title',
    keyHint: kind === 'touch' ? null : 'Esc or P to resume',
  };
}
