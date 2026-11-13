import { describe, expect, it } from 'vitest';
import { createFixedStepper } from '../../src/core/fixedStep';

const DT = 1 / 60;

describe('createFixedStepper', () => {
  it('runs one step per 1/60 s of elapsed time', () => {
    const stepper = createFixedStepper(DT);
    let steps = 0;
    for (let i = 0; i < 60; i++) stepper.advance(1000 / 60, () => steps++);
    expect(steps).toBe(60);
  });

  it('accumulates partial frames', () => {
    const stepper = createFixedStepper(DT);
    let steps = 0;
    stepper.advance(10, () => steps++);
    expect(steps).toBe(0);
    expect(stepper.alpha).toBeGreaterThan(0);
    stepper.advance(10, () => steps++);
    expect(steps).toBe(1);
  });

  it('caps catch-up steps after a long pause and drops the backlog', () => {
    const stepper = createFixedStepper(DT, 5);
    let steps = 0;
    expect(stepper.advance(5000, () => steps++)).toBe(5);
    expect(stepper.advance(0, () => steps++)).toBe(0);
    expect(steps).toBe(5);
  });

  it('ignores negative elapsed time and can be reset', () => {
    const stepper = createFixedStepper(DT);
    expect(stepper.advance(-100, () => {})).toBe(0);
    stepper.advance(10, () => {});
    stepper.reset();
    expect(stepper.alpha).toBe(0);
  });
});
