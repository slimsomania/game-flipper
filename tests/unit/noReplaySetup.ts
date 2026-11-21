import { DEFAULT_TUNING } from '../../src/core/tuning';

/*
 * The slow-motion replay (F027) makes the result phase longer. Most unit tests are about the
 * result delay, the scoring and the round, and count exactly `RESULT_STEPS` steps to the next
 * bottle, so by default they run with the replay off (`replaySpeed` 0). The tests of the replay
 * itself (replayPhase.test.ts) turn it on with `REPLAY_SPEED`.
 */
(DEFAULT_TUNING as { replaySpeed: number }).replaySpeed = 0;
