import Phaser from 'phaser';

/**
 * Make every key event act once.
 *
 * Phaser's keyboard manager pushes each key event onto a queue and, right away, has every scene's
 * keyboard plugin walk the whole queue; it empties the queue only once a frame. The plugin skips an
 * event it already handled only when that event is the one just before, so with three or more key
 * events in one frame an older one is handled again: three quick ArrowUp taps moved the power four
 * or five steps, and a second M press undid itself. That takes fast taps or a slow frame (GitHub's
 * runners hit it every run; a busy phone or laptop can too).
 *
 * By the time a key event has reached the window's listeners after Phaser's own, every scene has
 * handled it, so this empties the queue there. Call it right after creating the game: it installs
 * its listeners when the game is ready, after Phaser added its own at boot (listeners on one target
 * run in the order they were added).
 */
export function processEachKeyOnce(game: Phaser.Game): void {
  const install = (): void => {
    const keyboard = game.input.keyboard as unknown as { queue?: KeyboardEvent[] } | null;
    if (!keyboard || !Array.isArray(keyboard.queue)) return;
    const done = (): void => {
      keyboard.queue!.length = 0;
    };
    window.addEventListener('keydown', done);
    window.addEventListener('keyup', done);
  };
  game.events.once(Phaser.Core.Events.READY, install);
}
