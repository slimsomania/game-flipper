import Phaser from 'phaser';
import { installTuningPanel } from './debug/tuningPanel';
import { installTestHooks } from './debug/testHooks';
import { restoreMute } from './game/audio/mute';
import { sharedSfx, unlockOnFirstInput } from './game/audio/sfx';
import { createGameConfig } from './game/config';
import { installPageGuards } from './game/pageGuards';

installTuningPanel(); // before the game starts, so the first bottle already has the saved tuning
restoreMute(); // a player who muted the sound last time hears nothing, from the first throw on
unlockOnFirstInput(sharedSfx(), window); // sound starts only after the first click or key press
const game = new Phaser.Game(createGameConfig('game'));
installTestHooks(game);
installPageGuards(game, document.getElementById('game')!);
