/** What the round summary needs from the simulation's snapshot and from the saved best score. */
export interface SummaryState {
  /** The round's points. */
  score: number;
  /** The throws that landed upright. */
  landings: number;
  throwsPerRound: number;
  /** The best round score, this round included. */
  best: number;
  /** True when this round beat the best score saved before it. */
  isNewBest: boolean;
}

/** The lines of the round summary, as the player reads them. */
export interface SummaryTexts {
  title: string;
  scoreLine: string;
  landedLine: string;
  bestLine: string;
  /** "New best!" when the round beat the saved best, otherwise null: no line at all. */
  newBestLine: string | null;
  playAgainLabel: string;
  keyHint: string;
}

/**
 * "Score: 14" is the round's points and "Landed 7 / 10" the throws that landed out of the round's
 * throws (a double is worth 2 points but is still one landing); "Best: 14" is the best round score
 * and "New best!" says this round just set it: the words are the design's (section 6).
 */
export function summaryTexts(state: SummaryState): SummaryTexts {
  return {
    title: 'Round over',
    scoreLine: `Score: ${state.score}`,
    landedLine: `Landed ${state.landings} / ${state.throwsPerRound}`,
    bestLine: `Best: ${state.best}`,
    newBestLine: state.isNewBest ? 'New best!' : null,
    playAgainLabel: 'Play again',
    keyHint: 'or press Enter or Space',
  };
}
