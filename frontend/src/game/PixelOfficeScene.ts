import * as Phaser from "phaser";
import { AssetGenerator } from "./AssetGenerator";
import { AgentSprite, AgentSpriteConfig } from "./AgentSprite";

interface AgentData {
  id: string;
  name: string;
  role: string;
  status: string;
  color: string;
}

// Layout constants
const SCENE_W = 960;
const SCENE_H = 240;
const WALL_H = 48; // wall height at top
const LEFT_ROOM_W = 600;
const RIGHT_ROOM_X = 620; // after divider
const DIVIDER_X = 604;
const DIVIDER_W = 12;

// Desk positions in left room (x, y)
const LEFT_DESKS: { x: number; y: number }[] = [
  { x: 120, y: 100 }, // top-left (PM)
  { x: 300, y: 100 }, // top-right (Scrum Master)
  { x: 80, y: 170 }, // bottom-left (Dev 1)
  { x: 200, y: 170 }, // bottom-center-left (Dev 2)
  { x: 330, y: 170 }, // bottom-center-right (QA)
  { x: 460, y: 170 }, // bottom-right (Code Reviewer)
];

// Boss desk in right room
const BOSS_DESK = { x: 760, y: 130 };

// Mapping from agent ID to role (fallback)
const ID_ROLE_MAP: Record<string, string> = {
  "agent-boss": "boss",
  "agent-pm": "pm",
  "agent-sm": "scrum_master",
  "agent-dev": "developer",
  "agent-dev2": "developer",
  "agent-qa": "qa",
  "agent-cr": "code_reviewer",
};

export class PixelOfficeScene extends Phaser.Scene {
  private agentSprites: Map<string, AgentSprite> = new Map();
  private monitors: Phaser.GameObjects.Image[] = [];
  private coffeeMachine: Phaser.GameObjects.Image | null = null;
  private redPhone: Phaser.GameObjects.Image | null = null;
  private plants: Phaser.GameObjects.Image[] = [];
  private bossWalkTimer: Phaser.Time.TimerEvent | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  private bossIsWalking = false;
  private pendingAgentData: AgentData[] | null = null;

  constructor() {
    super({ key: "PixelOfficeScene" });
  }

  preload(): void {
    // Generate all textures programmatically
    const gen = new AssetGenerator(this);
    gen.generateAll();
  }

  create(): void {
    this.buildLeftRoom();
    this.buildRightRoom();
    this.buildDivider();
    this.placeCharacters();
    this.setupAmbientAnimations();
    this.addVignette();

    // If agent data was set before scene was ready, apply it now
    if (this.pendingAgentData) {
      this.updateAgents(this.pendingAgentData);
      this.pendingAgentData = null;
    }
  }

  // ─── LEFT ROOM (Open Office) ──────────────────────────────────

  private buildLeftRoom(): void {
    // Floor - wooden tiles
    for (let x = 0; x < LEFT_ROOM_W; x += 16) {
      for (let y = WALL_H; y < SCENE_H; y += 16) {
        const tile = this.add.image(x, y, "tile-wood-floor");
        tile.setOrigin(0, 0);
        tile.setDepth(0);
      }
    }

    // Walls at top
    for (let x = 0; x < LEFT_ROOM_W; x += 16) {
      for (let y = 0; y < WALL_H; y += 16) {
        const tile = this.add.image(x, y, "tile-wall-top");
        tile.setOrigin(0, 0);
        tile.setDepth(0);
      }
    }

    // Wall bottom edge (baseboard)
    const baseboard = this.add.graphics();
    baseboard.fillStyle(0xb0a080);
    baseboard.fillRect(0, WALL_H, LEFT_ROOM_W, 2);
    baseboard.setDepth(1);

    // ── Furniture ──

    // Bookshelf on left wall
    const bookshelf = this.add.image(10, 8, "bookshelf");
    bookshelf.setOrigin(0, 0);
    bookshelf.setDepth(2);

    // Whiteboard on top wall
    const whiteboard = this.add.image(200, 12, "whiteboard");
    whiteboard.setOrigin(0, 0);
    whiteboard.setDepth(2);

    // Scrum board on wall
    const scrumBoard = this.add.image(350, 14, "scrum-board");
    scrumBoard.setOrigin(0, 0);
    scrumBoard.setDepth(2);

    // Coffee machine in upper-right of left room
    this.coffeeMachine = this.add.image(540, WALL_H + 8, "coffee-machine");
    this.coffeeMachine.setOrigin(0, 0);
    this.coffeeMachine.setDepth(2);

    // Water cooler near middle
    const waterCooler = this.add.image(460, WALL_H + 12, "water-cooler");
    waterCooler.setOrigin(0, 0);
    waterCooler.setDepth(2);

    // Filing cabinet near left wall
    const filingCab = this.add.image(50, WALL_H + 4, "filing-cabinet");
    filingCab.setOrigin(0, 0);
    filingCab.setDepth(2);

    // Plants
    const plant1 = this.add.image(500, WALL_H + 2, "plant");
    plant1.setOrigin(0, 0);
    plant1.setDepth(2);
    this.plants.push(plant1);

    const plant2 = this.add.image(160, WALL_H + 4, "plant");
    plant2.setOrigin(0, 0);
    plant2.setDepth(2);
    this.plants.push(plant2);

    // ── Desks and Chairs ──
    for (const desk of LEFT_DESKS) {
      // Desk
      const d = this.add.image(desk.x - 16, desk.y - 4, "desk");
      d.setOrigin(0, 0);
      d.setDepth(3);

      // Monitor on desk
      const m = this.add.image(desk.x - 4, desk.y - 18, "desk-monitor");
      m.setOrigin(0, 0);
      m.setDepth(4);
      this.monitors.push(m);

      // Chair behind desk (below character)
      const c = this.add.image(desk.x - 4, desk.y + 4, "chair");
      c.setOrigin(0, 0);
      c.setDepth(2);
    }
  }

  // ─── RIGHT ROOM (Boss's Office) ──────────────────────────────

  private buildRightRoom(): void {
    // Carpet floor
    for (let x = RIGHT_ROOM_X; x < SCENE_W; x += 16) {
      for (let y = WALL_H; y < SCENE_H; y += 16) {
        const tile = this.add.image(x, y, "tile-carpet");
        tile.setOrigin(0, 0);
        tile.setDepth(0);
      }
    }

    // Darker walls
    for (let x = RIGHT_ROOM_X; x < SCENE_W; x += 16) {
      for (let y = 0; y < WALL_H; y += 16) {
        const tile = this.add.image(x, y, "tile-wall-dark");
        tile.setOrigin(0, 0);
        tile.setDepth(0);
      }
    }

    // Wall baseboard
    const baseboard = this.add.graphics();
    baseboard.fillStyle(0x2a3a55);
    baseboard.fillRect(RIGHT_ROOM_X, WALL_H, SCENE_W - RIGHT_ROOM_X, 2);
    baseboard.setDepth(1);

    // ── Furniture ──

    // Boss desk
    const bossDesk = this.add.image(BOSS_DESK.x - 16, BOSS_DESK.y - 4, "desk");
    bossDesk.setOrigin(0, 0);
    bossDesk.setDepth(3);

    // Boss monitor
    const bossMonitor = this.add.image(
      BOSS_DESK.x - 4,
      BOSS_DESK.y - 18,
      "desk-monitor"
    );
    bossMonitor.setOrigin(0, 0);
    bossMonitor.setDepth(4);
    this.monitors.push(bossMonitor);

    // Boss chair
    const bossChair = this.add.image(BOSS_DESK.x - 4, BOSS_DESK.y + 4, "chair");
    bossChair.setOrigin(0, 0);
    bossChair.setDepth(2);

    // Red phone on boss desk
    this.redPhone = this.add.image(BOSS_DESK.x + 16, BOSS_DESK.y - 10, "red-phone");
    this.redPhone.setOrigin(0, 0);
    this.redPhone.setDepth(5);

    // Couch / seating area
    const couch = this.add.image(660, 180, "couch");
    couch.setOrigin(0, 0);
    couch.setDepth(3);

    // Bookshelf on right wall
    const bookshelfRight = this.add.image(SCENE_W - 38, 6, "bookshelf");
    bookshelfRight.setOrigin(0, 0);
    bookshelfRight.setDepth(2);

    // Painting on wall
    const painting = this.add.image(700, 10, "painting");
    painting.setOrigin(0, 0);
    painting.setDepth(2);

    // Plants in boss room
    const plant3 = this.add.image(640, WALL_H + 2, "plant");
    plant3.setOrigin(0, 0);
    plant3.setDepth(2);
    this.plants.push(plant3);

    const plant4 = this.add.image(SCENE_W - 22, WALL_H + 6, "plant");
    plant4.setOrigin(0, 0);
    plant4.setDepth(2);
    this.plants.push(plant4);

    // Filing cabinet in boss room
    const filingCab2 = this.add.image(870, WALL_H + 4, "filing-cabinet");
    filingCab2.setOrigin(0, 0);
    filingCab2.setDepth(2);

    // Warm/cool room tinting
    // Add a subtle blue overlay for the boss room
    const coolOverlay = this.add.graphics();
    coolOverlay.fillStyle(0x1a2a44, 0.08);
    coolOverlay.fillRect(RIGHT_ROOM_X, 0, SCENE_W - RIGHT_ROOM_X, SCENE_H);
    coolOverlay.setDepth(1);

    // Warm overlay for left room
    const warmOverlay = this.add.graphics();
    warmOverlay.fillStyle(0x443322, 0.06);
    warmOverlay.fillRect(0, 0, LEFT_ROOM_W, SCENE_H);
    warmOverlay.setDepth(1);
  }

  // ─── DIVIDER WALL ──────────────────────────────────────────────

  private buildDivider(): void {
    const g = this.add.graphics();
    g.setDepth(6);

    // Wall sections (with doorway gap)
    // Top wall segment
    g.fillStyle(0x8888aa);
    g.fillRect(DIVIDER_X, 0, DIVIDER_W, 80);
    // Bottom wall segment
    g.fillRect(DIVIDER_X, 150, DIVIDER_W, SCENE_H - 150);

    // Wall highlights/shadows
    g.fillStyle(0x9999bb);
    g.fillRect(DIVIDER_X, 0, 2, 80);
    g.fillRect(DIVIDER_X, 150, 2, SCENE_H - 150);
    g.fillStyle(0x666688);
    g.fillRect(DIVIDER_X + DIVIDER_W - 2, 0, 2, 80);
    g.fillRect(DIVIDER_X + DIVIDER_W - 2, 150, 2, SCENE_H - 150);

    // Doorway frame top
    g.fillStyle(0x7777aa);
    g.fillRect(DIVIDER_X - 2, 78, DIVIDER_W + 4, 3);
    g.fillRect(DIVIDER_X - 2, 148, DIVIDER_W + 4, 3);

    // Door frame sides
    g.fillStyle(0x6b4e12);
    g.fillRect(DIVIDER_X, 80, 3, 70);
    g.fillRect(DIVIDER_X + DIVIDER_W - 3, 80, 3, 70);

    // Door frame top piece
    g.fillStyle(0x7a5c1a);
    g.fillRect(DIVIDER_X, 78, DIVIDER_W, 3);
  }

  // ─── CHARACTER PLACEMENT ──────────────────────────────────────

  private placeCharacters(): void {
    // Define default character configs
    // These will be matched to actual agent data
    const configs: AgentSpriteConfig[] = [
      {
        agentId: "agent-boss",
        agentName: "Boss",
        role: "boss",
        status: "working",
        color: "#F59E0B",
        spriteKey: "sprite-boss",
        deskX: BOSS_DESK.x,
        deskY: BOSS_DESK.y + 16,
      },
      {
        agentId: "agent-pm",
        agentName: "ProjectManager",
        role: "pm",
        status: "working",
        color: "#3B82F6",
        spriteKey: "sprite-pm",
        deskX: LEFT_DESKS[0].x,
        deskY: LEFT_DESKS[0].y + 16,
      },
      {
        agentId: "agent-sm",
        agentName: "ScrumMaster",
        role: "scrum_master",
        status: "idle",
        color: "#14B8A6",
        spriteKey: "sprite-sm",
        deskX: LEFT_DESKS[1].x,
        deskY: LEFT_DESKS[1].y + 16,
      },
      {
        agentId: "agent-dev",
        agentName: "Developer-1",
        role: "developer",
        status: "idle",
        color: "#22C55E",
        spriteKey: "sprite-dev",
        deskX: LEFT_DESKS[2].x,
        deskY: LEFT_DESKS[2].y + 16,
      },
      {
        agentId: "agent-dev2",
        agentName: "Developer-2",
        role: "developer",
        status: "idle",
        color: "#22C55E",
        spriteKey: "sprite-dev2",
        deskX: LEFT_DESKS[3].x,
        deskY: LEFT_DESKS[3].y + 16,
      },
      {
        agentId: "agent-qa",
        agentName: "QA-Tester",
        role: "qa",
        status: "idle",
        color: "#F97316",
        spriteKey: "sprite-qa",
        deskX: LEFT_DESKS[4].x,
        deskY: LEFT_DESKS[4].y + 16,
      },
      {
        agentId: "agent-cr",
        agentName: "CodeReviewer",
        role: "code_reviewer",
        status: "idle",
        color: "#8B5CF6",
        spriteKey: "sprite-cr",
        deskX: LEFT_DESKS[5].x,
        deskY: LEFT_DESKS[5].y + 16,
      },
    ];

    for (const cfg of configs) {
      const agentSprite = new AgentSprite(this, cfg);
      this.agentSprites.set(cfg.agentId, agentSprite);
    }
  }

  // ─── AMBIENT ANIMATIONS ──────────────────────────────────────

  private setupAmbientAnimations(): void {
    // Monitor screen flicker
    this.time.addEvent({
      delay: 2000,
      callback: () => {
        for (const monitor of this.monitors) {
          const tintVal = Phaser.Math.Between(0xddddff, 0xffffff);
          this.tweens.add({
            targets: monitor,
            duration: 150,
            onStart: () => monitor.setTint(tintVal),
            onComplete: () => monitor.clearTint(),
          });
        }
      },
      loop: true,
    });

    // Coffee machine blinking light
    if (this.coffeeMachine) {
      this.time.addEvent({
        delay: 1500,
        callback: () => {
          if (!this.coffeeMachine) return;
          this.tweens.add({
            targets: this.coffeeMachine,
            alpha: 0.7,
            duration: 200,
            yoyo: true,
            ease: "Sine.easeInOut",
          });
        },
        loop: true,
      });
    }

    // Plant leaf sway
    for (const plant of this.plants) {
      this.tweens.add({
        targets: plant,
        angle: Phaser.Math.Between(-2, 2),
        duration: Phaser.Math.Between(2000, 3500),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Phaser.Math.Between(0, 1000),
      });
    }

    // Red phone pulse
    if (this.redPhone) {
      this.time.addEvent({
        delay: 4000,
        callback: () => {
          if (!this.redPhone) return;
          this.tweens.add({
            targets: this.redPhone,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 200,
            yoyo: true,
            repeat: 3,
            ease: "Sine.easeInOut",
          });
        },
        loop: true,
      });
    }

    // Boss periodically walks to doorway and back
    this.bossWalkTimer = this.time.addEvent({
      delay: 12000,
      callback: () => this.bossPatrol(),
      loop: true,
      startAt: 8000,
    });

    // Random speech bubbles
    this.bubbleTimer = this.time.addEvent({
      delay: 5000,
      callback: () => this.randomBubble(),
      loop: true,
      startAt: 3000,
    });
  }

  private bossPatrol(): void {
    const boss = this.agentSprites.get("agent-boss");
    if (!boss || this.bossIsWalking) return;

    this.bossIsWalking = true;

    // Walk to doorway
    const doorwayX = DIVIDER_X + DIVIDER_W / 2;
    const doorwayY = 124;

    boss.walkTo(doorwayX, doorwayY, () => {
      // Pause at doorway, then walk back
      this.time.delayedCall(2000, () => {
        boss.returnToDesk(() => {
          this.bossIsWalking = false;
        });
      });
    });
  }

  private randomBubble(): void {
    const agentIds = Array.from(this.agentSprites.keys());
    const randomId = agentIds[Phaser.Math.Between(0, agentIds.length - 1)];
    const agent = this.agentSprites.get(randomId);
    if (!agent) return;

    const bubbleType = Math.random() > 0.5 ? "typing" : "thinking";
    agent.showBubble(bubbleType as "typing" | "thinking");

    // Auto hide after 2-3 seconds
    this.time.delayedCall(Phaser.Math.Between(2000, 3500), () => {
      agent.hideBubble();
    });
  }

  // ─── VIGNETTE EFFECT ──────────────────────────────────────────

  private addVignette(): void {
    // Use layered semi-transparent rectangles for a vignette effect
    // (fillGradientStyle may not render in WebGL on some setups)
    const g = this.add.graphics();
    g.setDepth(50);

    // Top edge - layered opacity
    for (let i = 0; i < 10; i++) {
      const alpha = 0.25 * (1 - i / 10);
      g.fillStyle(0x000000, alpha);
      g.fillRect(0, i * 2, SCENE_W, 2);
    }

    // Bottom edge
    for (let i = 0; i < 12; i++) {
      const alpha = 0.3 * (1 - i / 12);
      g.fillStyle(0x000000, alpha);
      g.fillRect(0, SCENE_H - (i + 1) * 2, SCENE_W, 2);
    }

    // Left edge
    for (let i = 0; i < 8; i++) {
      const alpha = 0.2 * (1 - i / 8);
      g.fillStyle(0x000000, alpha);
      g.fillRect(i * 2, 0, 2, SCENE_H);
    }

    // Right edge
    for (let i = 0; i < 8; i++) {
      const alpha = 0.2 * (1 - i / 8);
      g.fillStyle(0x000000, alpha);
      g.fillRect(SCENE_W - (i + 1) * 2, 0, 2, SCENE_H);
    }
  }

  // ─── PUBLIC API (called from React) ──────────────────────────

  public updateAgents(agents: AgentData[]): void {
    // If scene not ready, store for later
    if (!this.scene.isActive()) {
      this.pendingAgentData = agents;
      return;
    }

    for (const agentData of agents) {
      // Try exact ID match first
      let sprite = this.agentSprites.get(agentData.id);

      // If not found, try matching by role
      if (!sprite) {
        const role = agentData.role || ID_ROLE_MAP[agentData.id];
        if (role) {
          for (const [, s] of this.agentSprites) {
            if (s.role === role) {
              sprite = s;
              break;
            }
          }
        }
      }

      if (sprite) {
        sprite.agentName = agentData.name;
        sprite.setAgentStatus(agentData.status);
      }
    }
  }

  update(): void {
    // Update sprite positions (status dots, bubbles track with movement)
    for (const [, agentSprite] of this.agentSprites) {
      agentSprite.updatePosition();
    }
  }

  // Cleanup
  shutdown(): void {
    if (this.bossWalkTimer) this.bossWalkTimer.destroy();
    if (this.bubbleTimer) this.bubbleTimer.destroy();
    for (const [, sprite] of this.agentSprites) {
      sprite.destroy();
    }
    this.agentSprites.clear();
  }
}
