/** The lines of the title screen, as the player reads them. */
export interface TitleTexts {
  /** The game's name. */
  name: string;
  playLabel: string;
  /** Under the Play button: the keys that do the same thing. */
  startHint: string;
  /** "Best: 14": the best round score saved so far (0 before any round scored). */
  bestLine: string;
  /** One line about the controls, mouse and keyboard. */
  controlsHint: string;
}

/**
 * The words of the title screen (the design's section 6). "Best: N" is worded exactly as on the round
 * summary. The controls line names what the game really does: Up and Down or the wheel set the power,
 * Space throws, and pushing the bottle upward with the mouse throws it too.
 */
export function titleTexts(best: number): TitleTexts {
  return {
    name: 'Flipper',
    playLabel: 'Play',
    startHint: 'or press Enter or Space',
    bestLine: `Best: ${best}`,
    controlsHint: 'Up/Down or wheel: power · Space: throw · or grab the bottle and push up',
  };
}
