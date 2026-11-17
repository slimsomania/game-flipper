import Phaser from 'phaser';
import { installTuningPanel } from './debug/tuningPanel';
import { installTestHooks } from './debug/testHooks';
import { createGameConfig } from './game/config';

installTuningPanel(); // before the game starts, so the first bottle already has the saved tuning
const game = new Phaser.Game(createGameConfig('game'));
installTestHooks(game);
