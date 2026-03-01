import * as Phaser from "phaser";
import { PixelOfficeScene } from "./PixelOfficeScene";

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 240,
    pixelArt: true,
    transparent: false,
    backgroundColor: "#1a1a2e",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [PixelOfficeScene],
    render: {
      antialias: false,
      roundPixels: true,
    },
  };
}
