import Phaser from 'phaser';
import { installTestHooks } from './debug/testHooks';
import { createGameConfig } from './game/config';

const game = new Phaser.Game(createGameConfig('game'));
installTestHooks(game);
