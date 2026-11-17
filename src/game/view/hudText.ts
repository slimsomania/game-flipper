/** What the round HUD needs from the simulation's snapshot. */
export interface HudState {
  throwNumber: number;
  throwsPerRound: number;
  score: number;
  streak: number;
}

/** The three lines of the round HUD, as the player reads them. */
export interface HudTexts {
  throwLine: string;
  scoreLine: string;
  streakLine: string;
}

/** "Throw 3 / 10", "Score: 2" and "Streak: 1": the words are the design's (section 4). */
export function hudTexts(state: HudState): HudTexts {
  return {
    throwLine: `Throw ${state.throwNumber} / ${state.throwsPerRound}`,
    scoreLine: `Score: ${state.score}`,
    streakLine: `Streak: ${state.streak}`,
  };
}
