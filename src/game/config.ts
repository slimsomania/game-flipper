import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/constants';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';
import { COLORS } from './theme';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.background,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Phaser's own sound manager is not used (the effects are made in src/game/audio): without this
    // it would open an AudioContext of its own at boot and unlock it on the first click or key.
    audio: { noAudio: true },
    // Overlays come after the Game scene, so they are drawn over it.
    scene: [BootScene, TitleScene, GameScene, SummaryScene, PauseScene],
  };
}
