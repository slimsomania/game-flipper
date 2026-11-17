/** What the round summary needs from the simulation's snapshot. */
export interface SummaryState {
  /** The round's points. */
  score: number;
  /** The throws that landed upright. */
  landings: number;
  throwsPerRound: number;
}

/** The lines of the round summary, as the player reads them. */
export interface SummaryTexts {
  title: string;
  scoreLine: string;
  landedLine: string;
  playAgainLabel: string;
  keyHint: string;
}

/**
 * "Score: 14" is the round's points and "Landed 7 / 10" the throws that landed out of the round's
 * throws (a double is worth 2 points but is still one landing): the words are the design's
 * (section 6).
 */
export function summaryTexts(state: SummaryState): SummaryTexts {
  return {
    title: 'Round over',
    scoreLine: `Score: ${state.score}`,
    landedLine: `Landed ${state.landings} / ${state.throwsPerRound}`,
    playAgainLabel: 'Play again',
    keyHint: 'or press Enter or Space',
  };
}
