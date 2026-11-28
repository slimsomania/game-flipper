import { describe, expect, it } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { GAME_WIDTH, PIXELS_PER_METER } from '../../src/core/constants';
import { TABLE_LEFT_X, TABLE_RIGHT_X } from '../../src/core/table';
import {
  mirrorAngle,
  mirrorMeters,
  mirrorPose,
  mirrorX,
  viewPose,
} from '../../src/game/view/mirror';

describe('the mirror for Player 2', () => {
  it('maps x to GAME_WIDTH - x and the angle to its negative', () => {
    expect(mirrorX(100)).toBe(GAME_WIDTH - 100);
    expect(mirrorX(GAME_WIDTH / 2)).toBe(GAME_WIDTH / 2);
    expect(mirrorAngle(0.7)).toBe(-0.7);
  });

  it('is its own inverse', () => {
    const pose = { x: 3.3, y: 4.1, angle: 2.2, water: 0.4 };
    const back = mirrorPose(mirrorPose(pose));
    expect(back.x).toBeCloseTo(pose.x, 12);
    expect(back.y).toBe(pose.y);
    expect(back.angle).toBeCloseTo(pose.angle, 12);
    expect(back.water).toBe(0.4);
    expect(mirrorX(mirrorX(417))).toBe(417);
  });

  it('maps the left hand to the right-hand point at the same height', () => {
    const hand = mirrorPose({ x: HAND_X, y: HAND_Y, angle: 0 });
    expect(hand.x * PIXELS_PER_METER).toBeCloseTo(GAME_WIDTH - HAND_X * PIXELS_PER_METER, 9);
    expect(hand.y).toBe(HAND_Y);
    expect(hand.x * PIXELS_PER_METER).toBeGreaterThan(GAME_WIDTH / 2);
  });

  it('maps the table ends onto each other', () => {
    expect(mirrorMeters(TABLE_LEFT_X)).toBeCloseTo(TABLE_RIGHT_X, 9);
    expect(mirrorMeters(TABLE_RIGHT_X)).toBeCloseTo(TABLE_LEFT_X, 9);
  });

  it('draws Player 1 as is and Player 2 mirrored', () => {
    const pose = { x: 2, y: 3, angle: 1 };
    expect(viewPose(pose, false)).toBe(pose);
    expect(viewPose(pose, true).angle).toBe(-1);
  });
});
