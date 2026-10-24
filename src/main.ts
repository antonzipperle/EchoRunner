import Phaser from 'phaser';
import { ARENA, RENDER_SCALE } from './game/constants';
import { enableHiResText } from './game/hiRes';
import { GameScene } from './scenes/GameScene';
import { StartScene } from './scenes/StartScene';

enableHiResText();

// 16:9 canvas that scales to fit desktop and mobile screens. The canvas has RENDER_SCALE times
// the pixels of the 1280x720 game space so everything stays sharp; cameras zoom to compensate.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width * RENDER_SCALE,
  height: ARENA.height * RENDER_SCALE,
  backgroundColor: '#0d0f14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [StartScene, GameScene],
};

new Phaser.Game(config);
