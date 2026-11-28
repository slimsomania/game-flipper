/** The words of the two-player HUD (design section 5). Pure text: no Phaser. */

export type DuelSide = 1 | 2;

/** "Player 1" or "Player 2". */
export const sideLabel = (side: DuelSide): string => `Player ${side}`;

/** The banner at the top: "Player 2's turn · Throw 3 / 10". */
export function duelBanner(active: DuelSide, throwNumber: number, throwsPerRound: number): string {
  return `${sideLabel(active)}'s turn · Throw ${throwNumber} / ${throwsPerRound}`;
}

/** One side's three lines: its label, "Score: N" and "Streak: N". */
export interface SideLines {
  label: string;
  scoreLine: string;
  streakLine: string;
}

export function sideLines(side: DuelSide, score: number, streak: number): SideLines {
  return { label: sideLabel(side), scoreLine: `Score: ${score}`, streakLine: `Streak: ${streak}` };
}
