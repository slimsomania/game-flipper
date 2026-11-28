import type Phaser from 'phaser';
import { GAME_WIDTH } from '../../core/constants';
import type { SimSnapshot } from '../../core/simulation';
import { COLORS, FONT_FAMILY } from '../theme';
import { BANNER, DUEL_HUD_DEPTH, DUEL_MARGIN, STACK, sideColor } from './duelLayout';
import { duelBanner, sideLines, type DuelSide } from './duelText';
import { drawnPowerBar, POWER_BAR_NAME, WAITING_BAR_NAME } from './powerBarView';
import type { WaitingPicture, WaitingSideView } from './waitingSideView';

/** What the hook `duelSides()` reports about one side, as the scene last drew it. */
export interface DrawnDuelSide {
  side: DuelSide;
  label: string;
  /** 'active': full color and live; 'grayed': waiting, grayed out. */
  look: 'active' | 'grayed';
  /** The color of the side's label text (a CSS color). */
  labelColor: string;
  scoreLine: string;
  streakLine: string;
  /** The value its power bar shows and the bar's track box in game pixels. */
  barValue: number;
  bar: { left: number; right: number; top: number; bottom: number };
  /** The waiting side's bottle picture; null for the active side and when no throws are left. */
  picture: WaitingPicture | null;
}

const SIDES_KEY = 'duelSides';

/** The sides as the Game scene last drew them, or null outside a duel. */
export function drawnDuelSides(scene: Phaser.Scene): DrawnDuelSide[] | null {
  return (scene.data.get(SIDES_KEY) as DrawnDuelSide[] | undefined) ?? null;
}

export interface DuelHudView {
  update(snapshot: SimSnapshot): void;
}

/**
 * The two-player HUD: the turn banner at the top and one stack of label, score and streak per
 * side, Player 1's at the left edge and Player 2's at the right. The active side is in the usual
 * color and the waiting side is grayed (its bar and picture come from `waiting`).
 */
export function createDuelHudView(scene: Phaser.Scene, waiting: WaitingSideView): DuelHudView {
  const text = (x: number, y: number, size: number, originX: number) =>
    scene.add
      .text(x, y, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setOrigin(originX, 0)
      .setDepth(DUEL_HUD_DEPTH);
  const banner = text(BANNER.x, BANNER.y, BANNER.size, 0.5);
  const stack = (side: DuelSide) => {
    const x = side === 1 ? DUEL_MARGIN : GAME_WIDTH - DUEL_MARGIN;
    const origin = side === 1 ? 0 : 1;
    return {
      label: text(x, STACK.y, STACK.labelSize, origin),
      score: text(x, STACK.scoreY, STACK.scoreSize, origin),
      streak: text(x, STACK.streakY, STACK.streakSize, origin),
    };
  };
  const stacks = [stack(1), stack(2)] as const;

  return {
    update(snapshot) {
      const duel = snapshot.duel;
      if (!duel) return;
      const other: DuelSide = duel.active === 1 ? 2 : 1;
      banner.setText(duelBanner(duel.active, snapshot.throwNumber, snapshot.throwsPerRound));
      for (const side of [1, 2] as DuelSide[]) {
        const lines = sideLines(side, duel.sides[side - 1].score, duel.sides[side - 1].streak);
        const color = sideColor(side === duel.active);
        const views = stacks[side - 1];
        views.label.setText(lines.label).setColor(color);
        views.score.setText(lines.scoreLine).setColor(color);
        views.streak.setText(lines.streakLine).setColor(color);
      }
      waiting.update(other, duel.sides[other - 1].power, duel.waitingWater);

      const picture = waiting.picture();
      const sides = ([1, 2] as DuelSide[]).map((side): DrawnDuelSide => {
        const active = side === duel.active;
        const bar = drawnPowerBar(scene, active ? POWER_BAR_NAME : WAITING_BAR_NAME)!;
        const lines = sideLines(side, duel.sides[side - 1].score, duel.sides[side - 1].streak);
        return {
          side,
          label: lines.label,
          look: active ? 'active' : 'grayed',
          labelColor: sideColor(active),
          scoreLine: lines.scoreLine,
          streakLine: lines.streakLine,
          barValue: bar.value,
          bar: { left: bar.left, right: bar.right, top: bar.top, bottom: bar.bottom },
          picture: active ? null : picture,
        };
      });
      scene.data.set(SIDES_KEY, sides);
    },
  };
}
