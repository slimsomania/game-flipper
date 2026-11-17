import Phaser from 'phaser';
import { installTuningPanel } from './debug/tuningPanel';
import { installTestHooks } from './debug/testHooks';
import { sharedSfx, unlockOnFirstInput } from './game/audio/sfx';
import { createGameConfig } from './game/config';

installTuningPanel(); // before the game starts, so the first bottle already has the saved tuning
unlockOnFirstInput(sharedSfx(), window); // sound starts only after the first click or key press
const game = new Phaser.Game(createGameConfig('game'));
installTestHooks(game);
