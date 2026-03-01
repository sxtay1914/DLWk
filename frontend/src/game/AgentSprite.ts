import * as Phaser from "phaser";

export interface AgentSpriteConfig {
  agentId: string;
  agentName: string;
  role: string;
  status: string;
  color: string;
  spriteKey: string;
  deskX: number;
  deskY: number;
}

/**
 * AgentSprite wraps a Phaser sprite for an agent character,
 * handling animations, tooltips, bubbles, and interactivity.
 */
export class AgentSprite {
  public sprite: Phaser.GameObjects.Sprite;
  public agentId: string;
  public agentName: string;
  public role: string;
  public status: string;
  public color: string;
  public deskX: number;
  public deskY: number;

  private scene: Phaser.Scene;
  private tooltip: Phaser.GameObjects.Text | null = null;
  private bubble: Phaser.GameObjects.Image | null = null;
  private statusDot: Phaser.GameObjects.Image | null = null;
  private isMoving = false;
  private moveTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, config: AgentSpriteConfig) {
    this.scene = scene;
    this.agentId = config.agentId;
    this.agentName = config.agentName;
    this.role = config.role;
    this.status = config.status;
    this.color = config.color;
    this.deskX = config.deskX;
    this.deskY = config.deskY;

    // Create the sprite
    this.sprite = scene.add.sprite(config.deskX, config.deskY, config.spriteKey, 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(10);

    // Create animations for this character
    this.createAnimations(config.spriteKey);

    // Set up interactivity
    this.sprite.setInteractive({ useHandCursor: true });
    this.setupHover();
    this.setupClick();

    // Create status dot
    this.updateStatusDot();

    // Start default animation
    this.playTyping();
  }

  private createAnimations(key: string): void {
    const anims = this.scene.anims;
    const prefix = `${key}-`;

    // Only create if not already existing
    if (!anims.exists(`${prefix}walk-down`)) {
      anims.create({
        key: `${prefix}walk-down`,
        frames: anims.generateFrameNumbers(key, { start: 0, end: 2 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!anims.exists(`${prefix}walk-up`)) {
      anims.create({
        key: `${prefix}walk-up`,
        frames: anims.generateFrameNumbers(key, { start: 3, end: 5 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!anims.exists(`${prefix}walk-left`)) {
      anims.create({
        key: `${prefix}walk-left`,
        frames: anims.generateFrameNumbers(key, { start: 6, end: 8 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!anims.exists(`${prefix}typing`)) {
      anims.create({
        key: `${prefix}typing`,
        frames: anims.generateFrameNumbers(key, { start: 9, end: 11 }),
        frameRate: 4,
        repeat: -1,
      });
    }

    if (!anims.exists(`${prefix}idle`)) {
      anims.create({
        key: `${prefix}idle`,
        frames: [{ key, frame: 0 }],
        frameRate: 1,
        repeat: -1,
      });
    }
  }

  private setupHover(): void {
    this.sprite.on("pointerover", () => {
      // Bounce tween
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 120,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      // Show tooltip
      this.showTooltip();
    });

    this.sprite.on("pointerout", () => {
      this.hideTooltip();
    });
  }

  private setupClick(): void {
    this.sprite.on("pointerdown", () => {
      // Emit event for React
      this.scene.game.events.emit("agent-clicked", this.agentId);

      // Visual click feedback
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: 0.9,
        scaleY: 0.9,
        duration: 80,
        yoyo: true,
        ease: "Quad.easeInOut",
      });
    });
  }

  private showTooltip(): void {
    if (this.tooltip) return;

    const statusLabel =
      this.status === "working"
        ? "Working"
        : this.status === "idle"
        ? "Idle"
        : this.status === "blocked"
        ? "Blocked"
        : this.status === "reviewing"
        ? "Reviewing"
        : "Offline";

    const text = `${this.agentName}\n${statusLabel}`;
    this.tooltip = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - 32,
      text,
      {
        fontSize: "7px",
        fontFamily: "monospace",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
        align: "center",
      }
    );
    this.tooltip.setOrigin(0.5, 1);
    this.tooltip.setDepth(100);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  public setAgentStatus(status: string): void {
    this.status = status;
    this.updateStatusDot();

    if (!this.isMoving) {
      if (status === "working" || status === "reviewing") {
        this.playTyping();
      } else {
        this.playIdle();
      }
    }
  }

  private updateStatusDot(): void {
    if (this.statusDot) {
      this.statusDot.destroy();
    }

    const dotKey =
      this.status === "working" || this.status === "reviewing"
        ? "status-dot-green"
        : this.status === "blocked"
        ? "status-dot-red"
        : this.status === "idle"
        ? "status-dot-yellow"
        : "status-dot-red";

    this.statusDot = this.scene.add.image(
      this.sprite.x + 8,
      this.sprite.y - 24,
      dotKey
    );
    this.statusDot.setDepth(15);
  }

  public showBubble(type: "typing" | "thinking"): void {
    this.hideBubble();
    const key = type === "typing" ? "bubble-typing" : "bubble-thinking";
    this.bubble = this.scene.add.image(
      this.sprite.x,
      this.sprite.y - 34,
      key
    );
    this.bubble.setDepth(20);
    this.bubble.setScale(0.8);

    // Fade in
    this.bubble.setAlpha(0);
    this.scene.tweens.add({
      targets: this.bubble,
      alpha: 1,
      y: this.sprite.y - 38,
      duration: 300,
      ease: "Back.easeOut",
    });
  }

  public hideBubble(): void {
    if (this.bubble) {
      const b = this.bubble;
      this.scene.tweens.add({
        targets: b,
        alpha: 0,
        y: b.y - 4,
        duration: 200,
        onComplete: () => b.destroy(),
      });
      this.bubble = null;
    }
  }

  public walkTo(x: number, y: number, onComplete?: () => void): void {
    if (this.isMoving) return;
    this.isMoving = true;

    const spriteKey = this.sprite.texture.key;
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;

    // Choose walk animation based on direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.sprite.play(`${spriteKey}-walk-left`);
      this.sprite.setFlipX(dx > 0);
    } else if (dy < 0) {
      this.sprite.play(`${spriteKey}-walk-up`);
      this.sprite.setFlipX(false);
    } else {
      this.sprite.play(`${spriteKey}-walk-down`);
      this.sprite.setFlipX(false);
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 40; // pixels per second
    const duration = (dist / speed) * 1000;

    this.moveTween = this.scene.tweens.add({
      targets: this.sprite,
      x,
      y,
      duration: Math.max(duration, 500),
      ease: "Linear",
      onUpdate: () => {
        // Update status dot position
        if (this.statusDot) {
          this.statusDot.setPosition(this.sprite.x + 8, this.sprite.y - 24);
        }
      },
      onComplete: () => {
        this.isMoving = false;
        this.sprite.setFlipX(false);
        this.playIdle();
        onComplete?.();
      },
    });
  }

  public returnToDesk(onComplete?: () => void): void {
    this.walkTo(this.deskX, this.deskY, () => {
      this.playTyping();
      onComplete?.();
    });
  }

  public playTyping(): void {
    const spriteKey = this.sprite.texture.key;
    if (this.scene.anims.exists(`${spriteKey}-typing`)) {
      this.sprite.play(`${spriteKey}-typing`);
    }
  }

  public playIdle(): void {
    const spriteKey = this.sprite.texture.key;
    if (this.scene.anims.exists(`${spriteKey}-idle`)) {
      this.sprite.play(`${spriteKey}-idle`);
    }
  }

  public updatePosition(): void {
    // Keep status dot synced
    if (this.statusDot) {
      this.statusDot.setPosition(this.sprite.x + 8, this.sprite.y - 24);
    }
    if (this.bubble) {
      this.bubble.setPosition(this.sprite.x, this.sprite.y - 38);
    }
  }

  public destroy(): void {
    this.hideTooltip();
    this.hideBubble();
    if (this.statusDot) this.statusDot.destroy();
    if (this.moveTween) this.moveTween.stop();
    this.sprite.destroy();
  }
}
