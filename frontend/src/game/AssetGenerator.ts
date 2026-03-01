import * as Phaser from "phaser";

/**
 * AssetGenerator creates all pixel art textures programmatically
 * using Phaser's Graphics API and generateTexture().
 */
export class AssetGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generateAll(): void {
    this.generateTiles();
    this.generateFurniture();
    this.generateCharacterSprites();
    this.generateStatusIndicators();
  }

  // ─── TILE TEXTURES ──────────────────────────────────────────────

  private generateTiles(): void {
    // Wood floor tile 16x16
    this.makeTex("tile-wood-floor", 16, 16, (g) => {
      g.fillStyle(0x8b6914);
      g.fillRect(0, 0, 16, 16);
      // Plank lines horizontal
      g.fillStyle(0x7a5c12);
      g.fillRect(0, 3, 16, 1);
      g.fillRect(0, 7, 16, 1);
      g.fillRect(0, 11, 16, 1);
      g.fillRect(0, 15, 16, 1);
      // Vertical stagger lines
      g.fillRect(8, 0, 1, 4);
      g.fillRect(4, 4, 1, 4);
      g.fillRect(12, 8, 1, 4);
      g.fillRect(6, 12, 1, 4);
      // Grain highlights
      g.fillStyle(0x9a7a1e);
      g.fillRect(2, 1, 2, 1);
      g.fillRect(10, 5, 3, 1);
      g.fillRect(1, 9, 2, 1);
      g.fillRect(13, 13, 2, 1);
      // Subtle knots
      g.fillStyle(0x6e5510);
      g.fillRect(5, 1, 1, 1);
      g.fillRect(11, 9, 1, 1);
    });

    // Carpet tile 16x16
    this.makeTex("tile-carpet", 16, 16, (g) => {
      g.fillStyle(0x2d4a7a);
      g.fillRect(0, 0, 16, 16);
      // Subtle texture dots
      g.fillStyle(0x335588);
      for (let y = 0; y < 16; y += 2) {
        for (let x = (y % 4 === 0 ? 0 : 1); x < 16; x += 2) {
          g.fillRect(x, y, 1, 1);
        }
      }
      // Border hint
      g.fillStyle(0x243f6a);
      g.fillRect(0, 0, 16, 1);
      g.fillRect(0, 0, 1, 16);
    });

    // Wall top tile
    this.makeTex("tile-wall-top", 16, 16, (g) => {
      g.fillStyle(0xd4c5a0);
      g.fillRect(0, 0, 16, 16);
      // Brick pattern
      g.fillStyle(0xc9b890);
      g.fillRect(0, 4, 16, 1);
      g.fillRect(0, 9, 16, 1);
      g.fillRect(0, 14, 16, 1);
      g.fillRect(8, 0, 1, 5);
      g.fillRect(4, 5, 1, 5);
      g.fillRect(12, 10, 1, 5);
      // Highlight
      g.fillStyle(0xdfd0b0);
      g.fillRect(1, 1, 3, 1);
      g.fillRect(9, 6, 3, 1);
    });

    // Dark wall tile
    this.makeTex("tile-wall-dark", 16, 16, (g) => {
      g.fillStyle(0x3d4f6a);
      g.fillRect(0, 0, 16, 16);
      g.fillStyle(0x354560);
      g.fillRect(0, 5, 16, 1);
      g.fillRect(0, 11, 16, 1);
      g.fillRect(7, 0, 1, 6);
      g.fillRect(3, 6, 1, 6);
      g.fillRect(11, 12, 1, 4);
      // Subtle highlight
      g.fillStyle(0x455a75);
      g.fillRect(1, 1, 2, 1);
      g.fillRect(9, 7, 2, 1);
    });
  }

  // ─── FURNITURE TEXTURES ──────────────────────────────────────────

  private generateFurniture(): void {
    // Desk 32x20
    this.makeTex("desk", 32, 20, (g) => {
      // Shadow
      g.fillStyle(0x4a3a0a);
      g.fillRect(2, 16, 28, 4);
      // Legs
      g.fillStyle(0x6b4e12);
      g.fillRect(3, 14, 2, 6);
      g.fillRect(27, 14, 2, 6);
      g.fillRect(14, 14, 2, 6);
      // Desktop surface
      g.fillStyle(0x8b6914);
      g.fillRect(1, 8, 30, 7);
      // Top surface highlight
      g.fillStyle(0xa07a1e);
      g.fillRect(1, 8, 30, 2);
      // Wood grain lines
      g.fillStyle(0x7a5c12);
      g.fillRect(2, 11, 28, 1);
      g.fillRect(2, 13, 28, 1);
      // Edge darkening
      g.fillStyle(0x5a4510);
      g.fillRect(1, 14, 30, 1);
      // Corner detail
      g.fillStyle(0x6b4e12);
      g.fillRect(0, 8, 1, 7);
      g.fillRect(31, 8, 1, 7);
      // Drawer handle
      g.fillStyle(0xaaaaaa);
      g.fillRect(14, 12, 4, 1);
    });

    // Monitor 12x14
    this.makeTex("desk-monitor", 12, 14, (g) => {
      // Stand base
      g.fillStyle(0x333333);
      g.fillRect(4, 12, 4, 2);
      g.fillRect(3, 13, 6, 1);
      // Stand neck
      g.fillStyle(0x444444);
      g.fillRect(5, 10, 2, 3);
      // Screen frame (dark)
      g.fillStyle(0x222222);
      g.fillRect(0, 0, 12, 11);
      // Screen bezel
      g.fillStyle(0x333333);
      g.fillRect(0, 0, 12, 1);
      g.fillRect(0, 0, 1, 11);
      g.fillRect(11, 0, 1, 11);
      g.fillRect(0, 10, 12, 1);
      // Screen glow
      g.fillStyle(0x4488cc);
      g.fillRect(1, 1, 10, 9);
      // Screen content - code lines
      g.fillStyle(0x66aaee);
      g.fillRect(2, 2, 6, 1);
      g.fillRect(2, 4, 8, 1);
      g.fillRect(3, 6, 5, 1);
      g.fillRect(2, 8, 7, 1);
      // Bright pixel highlights
      g.fillStyle(0x88ccff);
      g.fillRect(2, 2, 2, 1);
      g.fillRect(3, 6, 2, 1);
      // Power LED
      g.fillStyle(0x00ff00);
      g.fillRect(6, 10, 1, 1);
    });

    // Chair 12x14
    this.makeTex("chair", 12, 14, (g) => {
      // Wheels (bottom)
      g.fillStyle(0x222222);
      g.fillRect(1, 12, 2, 2);
      g.fillRect(9, 12, 2, 2);
      g.fillRect(5, 13, 2, 1);
      // Chair post
      g.fillStyle(0x444444);
      g.fillRect(5, 9, 2, 4);
      // Seat
      g.fillStyle(0x333344);
      g.fillRect(1, 7, 10, 3);
      // Seat cushion highlight
      g.fillStyle(0x444455);
      g.fillRect(2, 7, 8, 1);
      // Backrest
      g.fillStyle(0x333344);
      g.fillRect(2, 1, 8, 7);
      // Backrest detail
      g.fillStyle(0x3d3d55);
      g.fillRect(3, 2, 6, 5);
      // Backrest top curve
      g.fillStyle(0x2a2a3a);
      g.fillRect(2, 0, 8, 1);
      g.fillRect(1, 1, 1, 1);
      g.fillRect(10, 1, 1, 1);
      // Armrests
      g.fillStyle(0x444444);
      g.fillRect(0, 5, 2, 3);
      g.fillRect(10, 5, 2, 3);
    });

    // Bookshelf 32x32
    this.makeTex("bookshelf", 32, 32, (g) => {
      // Back panel
      g.fillStyle(0x5a4020);
      g.fillRect(0, 0, 32, 32);
      // Frame
      g.fillStyle(0x6b4e12);
      g.fillRect(0, 0, 2, 32);
      g.fillRect(30, 0, 2, 32);
      g.fillRect(0, 0, 32, 2);
      g.fillRect(0, 30, 32, 2);
      // Shelves
      g.fillStyle(0x7a5c1a);
      g.fillRect(2, 9, 28, 2);
      g.fillRect(2, 18, 28, 2);
      g.fillRect(2, 27, 28, 2);
      // Shelf highlights
      g.fillStyle(0x8b6c22);
      g.fillRect(2, 9, 28, 1);
      g.fillRect(2, 18, 28, 1);
      g.fillRect(2, 27, 28, 1);

      // Books on shelves - row 1 (top)
      const bookColors1 = [0xcc3333, 0x3366cc, 0x33aa33, 0xccaa33, 0xcc3366, 0x6633cc, 0x33aacc];
      let x = 3;
      for (let i = 0; i < bookColors1.length && x < 28; i++) {
        const w = 2 + (i % 2);
        const h = 5 + (i % 3);
        g.fillStyle(bookColors1[i]);
        g.fillRect(x, 9 - h, w, h);
        // Book spine highlight
        g.fillStyle(this.lighten(bookColors1[i], 0.2));
        g.fillRect(x, 9 - h, 1, h);
        x += w + 1;
      }

      // Books on shelves - row 2 (middle)
      const bookColors2 = [0x44aa44, 0xdd6622, 0x2255bb, 0xaa2266, 0xddcc44, 0x5544aa];
      x = 3;
      for (let i = 0; i < bookColors2.length && x < 28; i++) {
        const w = 2 + ((i + 1) % 2);
        const h = 4 + ((i + 1) % 3);
        g.fillStyle(bookColors2[i]);
        g.fillRect(x, 18 - h, w, h);
        g.fillStyle(this.lighten(bookColors2[i], 0.2));
        g.fillRect(x, 18 - h, 1, h);
        x += w + 1;
      }

      // Books on shelves - row 3 (bottom)
      const bookColors3 = [0xbb4444, 0x44bbbb, 0x8844aa, 0xbb8833, 0x338844, 0xaa3344, 0x4466cc];
      x = 3;
      for (let i = 0; i < bookColors3.length && x < 28; i++) {
        const w = 2 + (i % 2);
        const h = 5 + (i % 2);
        g.fillStyle(bookColors3[i]);
        g.fillRect(x, 27 - h, w, h);
        g.fillStyle(this.lighten(bookColors3[i], 0.2));
        g.fillRect(x, 27 - h, 1, h);
        x += w + 1;
      }
    });

    // Plant 14x20
    this.makeTex("plant", 14, 20, (g) => {
      // Pot
      g.fillStyle(0xcc8844);
      g.fillRect(3, 13, 8, 7);
      // Pot rim
      g.fillStyle(0xdd9955);
      g.fillRect(2, 12, 10, 2);
      // Pot highlight
      g.fillStyle(0xddaa66);
      g.fillRect(4, 14, 2, 5);
      // Pot bottom
      g.fillStyle(0xbb7733);
      g.fillRect(4, 19, 6, 1);
      // Soil
      g.fillStyle(0x554422);
      g.fillRect(4, 12, 6, 2);
      // Main stem
      g.fillStyle(0x336622);
      g.fillRect(6, 5, 2, 8);
      // Left branch
      g.fillRect(4, 7, 3, 1);
      g.fillRect(3, 5, 2, 2);
      // Right branch
      g.fillRect(7, 6, 3, 1);
      g.fillRect(9, 4, 2, 2);
      // Leaves - various greens
      g.fillStyle(0x44aa33);
      g.fillRect(5, 2, 4, 4);
      g.fillRect(3, 3, 3, 3);
      g.fillRect(8, 3, 3, 3);
      // Lighter leaf highlights
      g.fillStyle(0x55cc44);
      g.fillRect(6, 1, 2, 2);
      g.fillRect(2, 4, 2, 2);
      g.fillRect(10, 2, 2, 2);
      // Leaf tips
      g.fillStyle(0x66dd55);
      g.fillRect(7, 0, 1, 2);
      g.fillRect(1, 4, 1, 1);
      g.fillRect(12, 3, 1, 1);
      // Dark leaf shadows
      g.fillStyle(0x338822);
      g.fillRect(4, 5, 2, 1);
      g.fillRect(8, 5, 2, 1);
    });

    // Whiteboard 28x20
    this.makeTex("whiteboard", 28, 20, (g) => {
      // Frame
      g.fillStyle(0x888888);
      g.fillRect(0, 0, 28, 20);
      // Inner frame
      g.fillStyle(0x999999);
      g.fillRect(1, 1, 26, 18);
      // White surface
      g.fillStyle(0xf0f0f0);
      g.fillRect(2, 2, 24, 16);
      // Board content - lines and shapes
      g.fillStyle(0x3366cc);
      g.fillRect(4, 4, 8, 1);
      g.fillRect(4, 7, 12, 1);
      g.fillStyle(0xcc3333);
      g.fillRect(4, 10, 10, 1);
      g.fillStyle(0x33aa33);
      g.fillRect(4, 13, 6, 1);
      // A small box diagram
      g.fillStyle(0x333333);
      g.fillRect(18, 4, 6, 4);
      g.fillStyle(0xf0f0f0);
      g.fillRect(19, 5, 4, 2);
      // Arrow
      g.fillStyle(0x333333);
      g.fillRect(18, 10, 1, 4);
      g.fillRect(19, 13, 1, 1);
      g.fillRect(17, 13, 1, 1);
      // Marker tray
      g.fillStyle(0x777777);
      g.fillRect(3, 18, 22, 1);
      // Markers in tray
      g.fillStyle(0xff0000);
      g.fillRect(5, 17, 3, 1);
      g.fillStyle(0x0000ff);
      g.fillRect(9, 17, 3, 1);
      g.fillStyle(0x000000);
      g.fillRect(13, 17, 3, 1);
    });

    // Scrum board 28x20
    this.makeTex("scrum-board", 28, 20, (g) => {
      // Board background
      g.fillStyle(0xeeeeee);
      g.fillRect(0, 0, 28, 20);
      // Frame
      g.fillStyle(0x888888);
      g.fillRect(0, 0, 28, 1);
      g.fillRect(0, 19, 28, 1);
      g.fillRect(0, 0, 1, 20);
      g.fillRect(27, 0, 1, 20);
      // Column dividers
      g.fillStyle(0xcccccc);
      g.fillRect(9, 1, 1, 18);
      g.fillRect(18, 1, 1, 18);
      // Column headers
      g.fillStyle(0x666666);
      g.fillRect(2, 2, 5, 1);
      g.fillRect(11, 2, 5, 1);
      g.fillRect(20, 2, 5, 1);
      // Sticky notes - column 1 (To Do)
      g.fillStyle(0xffee55);
      g.fillRect(2, 4, 6, 3);
      g.fillRect(2, 8, 6, 3);
      g.fillRect(2, 12, 6, 3);
      // Sticky notes - column 2 (In Progress)
      g.fillStyle(0x66ccff);
      g.fillRect(11, 4, 6, 3);
      g.fillRect(11, 8, 6, 3);
      // Sticky notes - column 3 (Done)
      g.fillStyle(0x77ee77);
      g.fillRect(20, 4, 6, 3);
      // Text lines on stickies
      g.fillStyle(0x999966);
      g.fillRect(3, 5, 4, 1);
      g.fillRect(3, 9, 4, 1);
      g.fillRect(3, 13, 3, 1);
      g.fillStyle(0x558899);
      g.fillRect(12, 5, 4, 1);
      g.fillRect(12, 9, 3, 1);
      g.fillStyle(0x559955);
      g.fillRect(21, 5, 4, 1);
    });

    // Coffee machine 12x16
    this.makeTex("coffee-machine", 12, 16, (g) => {
      // Base
      g.fillStyle(0x333333);
      g.fillRect(1, 12, 10, 4);
      // Body
      g.fillStyle(0x444444);
      g.fillRect(2, 2, 8, 11);
      // Top
      g.fillStyle(0x555555);
      g.fillRect(1, 0, 10, 3);
      // Water reservoir (blue tint)
      g.fillStyle(0x334466);
      g.fillRect(7, 3, 3, 6);
      // Water level
      g.fillStyle(0x4477aa);
      g.fillRect(8, 4, 1, 4);
      // Dispenser area
      g.fillStyle(0x222222);
      g.fillRect(3, 7, 4, 4);
      // Cup
      g.fillStyle(0xdddddd);
      g.fillRect(3, 10, 4, 2);
      g.fillStyle(0xcccccc);
      g.fillRect(4, 10, 2, 1);
      // Coffee in cup
      g.fillStyle(0x664422);
      g.fillRect(4, 10, 2, 1);
      // Red power light
      g.fillStyle(0xff0000);
      g.fillRect(3, 4, 2, 2);
      // Button
      g.fillStyle(0x888888);
      g.fillRect(3, 6, 1, 1);
      // Highlight
      g.fillStyle(0x555555);
      g.fillRect(2, 2, 1, 10);
    });

    // Couch 28x16
    this.makeTex("couch", 28, 16, (g) => {
      // Shadow
      g.fillStyle(0x1a1a2e);
      g.fillRect(2, 14, 24, 2);
      // Legs
      g.fillStyle(0x442200);
      g.fillRect(3, 13, 2, 3);
      g.fillRect(23, 13, 2, 3);
      // Base
      g.fillStyle(0xcc4455);
      g.fillRect(1, 8, 26, 6);
      // Back
      g.fillStyle(0xbb3344);
      g.fillRect(0, 2, 28, 7);
      // Cushions
      g.fillStyle(0xdd5566);
      g.fillRect(2, 8, 11, 5);
      g.fillRect(15, 8, 11, 5);
      // Cushion highlights
      g.fillStyle(0xee6677);
      g.fillRect(3, 8, 9, 2);
      g.fillRect(16, 8, 9, 2);
      // Armrests
      g.fillStyle(0xaa2233);
      g.fillRect(0, 3, 3, 11);
      g.fillRect(25, 3, 3, 11);
      // Armrest highlight
      g.fillStyle(0xbb3344);
      g.fillRect(0, 3, 1, 10);
      g.fillRect(27, 3, 1, 10);
      // Back cushion division
      g.fillStyle(0xaa2233);
      g.fillRect(13, 3, 2, 5);
      // Back highlight
      g.fillStyle(0xcc4455);
      g.fillRect(4, 3, 8, 2);
      g.fillRect(16, 3, 8, 2);
      // Pillows detail
      g.fillStyle(0xee8899);
      g.fillRect(4, 3, 3, 2);
      g.fillRect(21, 3, 3, 2);
    });

    // Painting 20x14
    this.makeTex("painting", 20, 14, (g) => {
      // Frame outer
      g.fillStyle(0x8b6914);
      g.fillRect(0, 0, 20, 14);
      // Frame inner shadow
      g.fillStyle(0x6b4e12);
      g.fillRect(1, 1, 18, 12);
      // Canvas
      // Sky
      g.fillStyle(0x77bbee);
      g.fillRect(2, 2, 16, 5);
      // Clouds
      g.fillStyle(0xddeeff);
      g.fillRect(4, 3, 4, 2);
      g.fillRect(12, 2, 3, 2);
      // Sun
      g.fillStyle(0xffdd44);
      g.fillRect(14, 3, 2, 2);
      // Mountains
      g.fillStyle(0x667788);
      g.fillRect(2, 5, 4, 3);
      g.fillRect(5, 4, 3, 4);
      g.fillRect(11, 5, 5, 3);
      // Snow caps
      g.fillStyle(0xffffff);
      g.fillRect(6, 4, 1, 1);
      g.fillRect(13, 5, 1, 1);
      // Ground/grass
      g.fillStyle(0x44aa44);
      g.fillRect(2, 7, 16, 3);
      // Darker grass
      g.fillStyle(0x339933);
      g.fillRect(2, 9, 16, 2);
      // Trees
      g.fillStyle(0x226622);
      g.fillRect(3, 6, 2, 3);
      g.fillRect(9, 7, 2, 2);
      g.fillRect(15, 6, 2, 3);
      // Tree trunks
      g.fillStyle(0x664422);
      g.fillRect(3, 9, 1, 2);
      g.fillRect(9, 9, 1, 2);
      g.fillRect(16, 9, 1, 2);
      // Frame highlight
      g.fillStyle(0xa07a1e);
      g.fillRect(0, 0, 20, 1);
      g.fillRect(0, 0, 1, 14);
    });

    // Filing cabinet 14x18
    this.makeTex("filing-cabinet", 14, 18, (g) => {
      // Shadow
      g.fillStyle(0x1a1a2e);
      g.fillRect(2, 16, 10, 2);
      // Body
      g.fillStyle(0x777788);
      g.fillRect(1, 0, 12, 17);
      // Edge highlight left
      g.fillStyle(0x8888aa);
      g.fillRect(1, 0, 1, 17);
      // Edge dark right
      g.fillStyle(0x666677);
      g.fillRect(12, 0, 1, 17);
      // Top
      g.fillStyle(0x8888aa);
      g.fillRect(1, 0, 12, 1);
      // Drawer divisions
      g.fillStyle(0x555566);
      g.fillRect(2, 5, 10, 1);
      g.fillRect(2, 10, 10, 1);
      g.fillRect(2, 15, 10, 1);
      // Drawer faces
      g.fillStyle(0x888899);
      g.fillRect(2, 1, 10, 4);
      g.fillRect(2, 6, 10, 4);
      g.fillRect(2, 11, 10, 4);
      // Handles
      g.fillStyle(0xaaaacc);
      g.fillRect(5, 2, 4, 1);
      g.fillRect(5, 7, 4, 1);
      g.fillRect(5, 12, 4, 1);
      // Handle highlights
      g.fillStyle(0xccccee);
      g.fillRect(5, 2, 2, 1);
      g.fillRect(5, 7, 2, 1);
      g.fillRect(5, 12, 2, 1);
      // Lock on top drawer
      g.fillStyle(0x444444);
      g.fillRect(7, 3, 1, 1);
    });

    // Red phone 8x6
    this.makeTex("red-phone", 8, 6, (g) => {
      // Base
      g.fillStyle(0xcc2222);
      g.fillRect(0, 3, 8, 3);
      // Base highlight
      g.fillStyle(0xdd3333);
      g.fillRect(1, 3, 6, 1);
      // Handset cradle
      g.fillStyle(0xaa1111);
      g.fillRect(1, 2, 6, 2);
      // Handset
      g.fillStyle(0xee3333);
      g.fillRect(0, 0, 3, 3);
      g.fillRect(5, 0, 3, 3);
      g.fillRect(2, 1, 4, 1);
      // Handset earpiece
      g.fillStyle(0x881111);
      g.fillRect(0, 0, 2, 2);
      g.fillRect(6, 0, 2, 2);
      // Cord
      g.fillStyle(0xcc2222);
      g.fillRect(3, 4, 2, 1);
      // Dial/buttons
      g.fillStyle(0xffffff);
      g.fillRect(3, 4, 1, 1);
      g.fillRect(5, 4, 1, 1);
    });

    // Water cooler 10x18
    this.makeTex("water-cooler", 10, 18, (g) => {
      // Shadow
      g.fillStyle(0x1a1a2e);
      g.fillRect(2, 16, 6, 2);
      // Legs
      g.fillStyle(0x777777);
      g.fillRect(1, 14, 2, 4);
      g.fillRect(7, 14, 2, 4);
      // Stand body
      g.fillStyle(0xdddddd);
      g.fillRect(1, 8, 8, 7);
      // Stand front panel
      g.fillStyle(0xeeeeee);
      g.fillRect(2, 9, 6, 5);
      // Spigots
      g.fillStyle(0x3388ff);
      g.fillRect(3, 10, 2, 1);
      g.fillStyle(0xff3333);
      g.fillRect(6, 10, 2, 1);
      // Drip tray
      g.fillStyle(0xaaaaaa);
      g.fillRect(2, 13, 6, 1);
      // Water bottle (blue tint)
      g.fillStyle(0x88bbee);
      g.fillRect(2, 0, 6, 9);
      // Water bottle highlight
      g.fillStyle(0xaaddff);
      g.fillRect(3, 1, 2, 7);
      // Water bottle cap
      g.fillStyle(0x6699cc);
      g.fillRect(3, 0, 4, 1);
      // Water bottle bottom rim
      g.fillStyle(0x6699cc);
      g.fillRect(2, 8, 6, 1);
      // Bubble inside
      g.fillStyle(0xcceeff);
      g.fillRect(4, 3, 1, 1);
      g.fillRect(5, 5, 1, 1);
    });
  }

  // ─── CHARACTER SPRITE SHEETS ──────────────────────────────────────

  private generateCharacterSprites(): void {
    const characters: {
      key: string;
      shirtColor: number;
      hairColor: number;
      hairStyle: "messy" | "neat" | "short" | "long" | "spiky" | "side";
      skinColor: number;
      hasGlasses: boolean;
      isHoodie: boolean;
    }[] = [
      {
        key: "sprite-boss",
        shirtColor: 0xf59e0b,
        hairColor: 0x332211,
        hairStyle: "neat",
        skinColor: 0xffcc99,
        hasGlasses: false,
        isHoodie: false,
      },
      {
        key: "sprite-pm",
        shirtColor: 0x3b82f6,
        hairColor: 0xaa8855,
        hairStyle: "side",
        skinColor: 0xffddaa,
        hasGlasses: false,
        isHoodie: false,
      },
      {
        key: "sprite-sm",
        shirtColor: 0x14b8a6,
        hairColor: 0x553322,
        hairStyle: "short",
        skinColor: 0xddaa77,
        hasGlasses: false,
        isHoodie: false,
      },
      {
        key: "sprite-dev",
        shirtColor: 0x22c55e,
        hairColor: 0x222222,
        hairStyle: "messy",
        skinColor: 0xffcc99,
        hasGlasses: false,
        isHoodie: true,
      },
      {
        key: "sprite-dev2",
        shirtColor: 0x16a34a,
        hairColor: 0x663311,
        hairStyle: "short",
        skinColor: 0xddbb99,
        hasGlasses: true,
        isHoodie: true,
      },
      {
        key: "sprite-qa",
        shirtColor: 0xf97316,
        hairColor: 0x884422,
        hairStyle: "spiky",
        skinColor: 0xeebb88,
        hasGlasses: true,
        isHoodie: false,
      },
      {
        key: "sprite-cr",
        shirtColor: 0x8b5cf6,
        hairColor: 0x111111,
        hairStyle: "long",
        skinColor: 0xddbb99,
        hasGlasses: false,
        isHoodie: false,
      },
    ];

    const fw = 18; // frame width
    const fh = 24; // frame height
    const cols = 3;
    const rows = 4;

    for (const char of characters) {
      const totalW = fw * cols;
      const totalH = fh * rows;

      // Remove existing texture if any
      if (this.scene.textures.exists(char.key)) {
        this.scene.textures.remove(char.key);
      }

      // Use a Graphics object to draw the spritesheet, then generate texture
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = this.scene.make.graphics({ x: 0, y: 0, add: false } as any);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const ox = col * fw;
          const oy = row * fh;
          this.drawCharFrame(
            g,
            ox,
            oy,
            fw,
            fh,
            row,
            col,
            char.shirtColor,
            char.hairColor,
            char.hairStyle,
            char.skinColor,
            char.hasGlasses,
            char.isHoodie
          );
        }
      }
      // Generate as a plain texture first
      g.generateTexture(char.key, totalW, totalH);
      g.destroy();

      // Now add spritesheet frame data to the existing texture
      // Access the internal Parser directly via the texture
      const tex = this.scene.textures.get(char.key);
      if (tex) {
        const src = tex.source[0];
        // Use Phaser's internal SpriteSheet parser to add frame data
        // This is available on the texture's frames
        (Phaser.Textures.Parsers as any).SpriteSheet(
          tex,
          0,       // sourceIndex
          0,       // x
          0,       // y
          src.width,
          src.height,
          {
            frameWidth: fw,
            frameHeight: fh,
          }
        );
      }
    }
  }

  private drawCharFrame(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    _fw: number,
    _fh: number,
    row: number,
    col: number,
    shirtColor: number,
    hairColor: number,
    hairStyle: string,
    skinColor: number,
    hasGlasses: boolean,
    isHoodie: boolean
  ): void {
    const darkerShirt = this.darken(shirtColor, 0.2);
    const darkerSkin = this.darken(skinColor, 0.15);
    const pantsColor = 0x333344;
    const shoeColor = 0x222222;

    // Walk animation offsets
    const walkOffset = col === 1 ? -1 : col === 2 ? 1 : 0;
    const legSpread = col === 1 ? 1 : col === 2 ? -1 : 0;

    if (row === 3) {
      // Typing animation - seated, arms move
      this.drawSeatedChar(
        g,
        ox,
        oy,
        col,
        shirtColor,
        darkerShirt,
        hairColor,
        hairStyle,
        skinColor,
        darkerSkin,
        pantsColor,
        hasGlasses,
        isHoodie
      );
      return;
    }

    // ── HEAD ──
    // Skin face
    g.fillStyle(skinColor);
    g.fillRect(ox + 5, oy + 2, 8, 8);
    // Ears
    g.fillRect(ox + 4, oy + 5, 1, 3);
    g.fillRect(ox + 13, oy + 5, 1, 3);
    // Face shadow
    g.fillStyle(darkerSkin);
    g.fillRect(ox + 5, oy + 9, 8, 1);

    // ── EYES ──
    if (row === 0) {
      // Facing down - visible eyes
      g.fillStyle(0xffffff);
      g.fillRect(ox + 6, oy + 5, 3, 2);
      g.fillRect(ox + 10, oy + 5, 3, 2);
      g.fillStyle(0x222222);
      g.fillRect(ox + 7, oy + 5, 2, 2);
      g.fillRect(ox + 11, oy + 5, 2, 2);
      // Pupils
      g.fillStyle(0x000000);
      g.fillRect(ox + 8, oy + 6, 1, 1);
      g.fillRect(ox + 12, oy + 6, 1, 1);
      // Mouth
      g.fillStyle(darkerSkin);
      g.fillRect(ox + 8, oy + 8, 3, 1);
    } else if (row === 1) {
      // Facing up - just hair, no face details
      // (we draw hair over this below)
    } else if (row === 2) {
      // Facing left - side profile
      g.fillStyle(0xffffff);
      g.fillRect(ox + 6, oy + 5, 2, 2);
      g.fillStyle(0x222222);
      g.fillRect(ox + 6, oy + 5, 1, 2);
      g.fillStyle(0x000000);
      g.fillRect(ox + 6, oy + 6, 1, 1);
      // Nose
      g.fillStyle(darkerSkin);
      g.fillRect(ox + 4, oy + 6, 1, 2);
      // Mouth
      g.fillRect(ox + 5, oy + 8, 2, 1);
    }

    // ── HAIR ──
    this.drawHair(g, ox, oy, hairColor, hairStyle, row);

    // ── GLASSES ──
    if (hasGlasses && row !== 1) {
      g.fillStyle(0x444466);
      if (row === 0) {
        g.fillRect(ox + 5, oy + 4, 4, 1);
        g.fillRect(ox + 9, oy + 4, 4, 1);
        g.fillRect(ox + 5, oy + 4, 1, 3);
        g.fillRect(ox + 8, oy + 4, 2, 1);
        g.fillRect(ox + 12, oy + 4, 1, 3);
        g.fillRect(ox + 5, oy + 7, 4, 1);
        g.fillRect(ox + 9, oy + 7, 4, 1);
      } else if (row === 2) {
        g.fillRect(ox + 5, oy + 4, 3, 1);
        g.fillRect(ox + 5, oy + 4, 1, 3);
        g.fillRect(ox + 7, oy + 4, 1, 3);
        g.fillRect(ox + 5, oy + 7, 3, 1);
      }
    }

    // ── BODY / SHIRT ──
    g.fillStyle(shirtColor);
    g.fillRect(ox + 4, oy + 10 + walkOffset, 10, 6);
    // Collar
    g.fillStyle(darkerShirt);
    g.fillRect(ox + 6, oy + 10 + walkOffset, 6, 1);

    if (isHoodie) {
      // Hood details
      g.fillStyle(darkerShirt);
      g.fillRect(ox + 4, oy + 10 + walkOffset, 1, 6);
      g.fillRect(ox + 13, oy + 10 + walkOffset, 1, 6);
      // Kangaroo pocket
      g.fillRect(ox + 6, oy + 13 + walkOffset, 6, 2);
      // Hood strings
      g.fillStyle(0xffffff);
      g.fillRect(ox + 7, oy + 10 + walkOffset, 1, 2);
      g.fillRect(ox + 10, oy + 10 + walkOffset, 1, 2);
    } else {
      // Shirt highlights
      g.fillStyle(this.lighten(shirtColor, 0.15));
      g.fillRect(ox + 5, oy + 11 + walkOffset, 2, 4);
    }

    // Arms
    g.fillStyle(skinColor);
    g.fillRect(ox + 3, oy + 11 + walkOffset, 1, 4);
    g.fillRect(ox + 14, oy + 11 + walkOffset, 1, 4);
    // Sleeve
    g.fillStyle(shirtColor);
    g.fillRect(ox + 3, oy + 10 + walkOffset, 1, 2);
    g.fillRect(ox + 14, oy + 10 + walkOffset, 1, 2);

    // ── PANTS ──
    g.fillStyle(pantsColor);
    if (col === 0) {
      // Idle - legs together
      g.fillRect(ox + 5, oy + 16, 8, 4);
      // Belt
      g.fillStyle(0x444455);
      g.fillRect(ox + 5, oy + 16, 8, 1);
    } else {
      // Walking - legs apart
      g.fillRect(ox + 5 - legSpread, oy + 16, 4, 4);
      g.fillRect(ox + 9 + legSpread, oy + 16, 4, 4);
      // Belt
      g.fillStyle(0x444455);
      g.fillRect(ox + 5 - legSpread, oy + 16, 4, 1);
      g.fillRect(ox + 9 + legSpread, oy + 16, 4, 1);
    }

    // ── SHOES ──
    g.fillStyle(shoeColor);
    if (col === 0) {
      g.fillRect(ox + 5, oy + 20, 3, 2);
      g.fillRect(ox + 10, oy + 20, 3, 2);
    } else {
      g.fillRect(ox + 5 - legSpread, oy + 20, 3, 2);
      g.fillRect(ox + 10 + legSpread, oy + 20, 3, 2);
    }
    // Shoe highlights
    g.fillStyle(0x333333);
    if (col === 0) {
      g.fillRect(ox + 5, oy + 20, 3, 1);
      g.fillRect(ox + 10, oy + 20, 3, 1);
    }
  }

  private drawSeatedChar(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    col: number,
    shirtColor: number,
    darkerShirt: number,
    hairColor: number,
    hairStyle: string,
    skinColor: number,
    darkerSkin: number,
    pantsColor: number,
    hasGlasses: boolean,
    isHoodie: boolean
  ): void {
    // Seated character typing at desk
    const armLift = col === 1 ? -1 : col === 2 ? 1 : 0;

    // ── HEAD (same as facing down) ──
    g.fillStyle(skinColor);
    g.fillRect(ox + 5, oy + 2, 8, 8);
    g.fillRect(ox + 4, oy + 5, 1, 3);
    g.fillRect(ox + 13, oy + 5, 1, 3);
    g.fillStyle(darkerSkin);
    g.fillRect(ox + 5, oy + 9, 8, 1);

    // Eyes (looking down at screen)
    g.fillStyle(0xffffff);
    g.fillRect(ox + 6, oy + 5, 3, 2);
    g.fillRect(ox + 10, oy + 5, 3, 2);
    g.fillStyle(0x222222);
    g.fillRect(ox + 7, oy + 6, 2, 1);
    g.fillRect(ox + 11, oy + 6, 2, 1);
    g.fillStyle(0x000000);
    g.fillRect(ox + 8, oy + 6, 1, 1);
    g.fillRect(ox + 12, oy + 6, 1, 1);

    // Glasses
    if (hasGlasses) {
      g.fillStyle(0x444466);
      g.fillRect(ox + 5, oy + 4, 4, 1);
      g.fillRect(ox + 9, oy + 4, 4, 1);
      g.fillRect(ox + 5, oy + 4, 1, 3);
      g.fillRect(ox + 8, oy + 4, 2, 1);
      g.fillRect(ox + 12, oy + 4, 1, 3);
      g.fillRect(ox + 5, oy + 7, 4, 1);
      g.fillRect(ox + 9, oy + 7, 4, 1);
    }

    // Hair
    this.drawHair(g, ox, oy, hairColor, hairStyle, 0);

    // Mouth (slight smile while typing)
    g.fillStyle(darkerSkin);
    g.fillRect(ox + 8, oy + 8, 3, 1);

    // ── BODY ──
    g.fillStyle(shirtColor);
    g.fillRect(ox + 4, oy + 10, 10, 6);
    g.fillStyle(darkerShirt);
    g.fillRect(ox + 6, oy + 10, 6, 1);

    if (isHoodie) {
      g.fillStyle(darkerShirt);
      g.fillRect(ox + 4, oy + 10, 1, 6);
      g.fillRect(ox + 13, oy + 10, 1, 6);
      g.fillRect(ox + 6, oy + 13, 6, 2);
      g.fillStyle(0xffffff);
      g.fillRect(ox + 7, oy + 10, 1, 2);
      g.fillRect(ox + 10, oy + 10, 1, 2);
    } else {
      g.fillStyle(this.lighten(shirtColor, 0.15));
      g.fillRect(ox + 5, oy + 11, 2, 4);
    }

    // ── TYPING ARMS ──
    // Arms extended forward (typing)
    g.fillStyle(skinColor);
    // Left arm
    g.fillRect(ox + 3, oy + 11, 1, 3);
    g.fillRect(ox + 2 + armLift, oy + 14, 2, 1);
    // Right arm
    g.fillRect(ox + 14, oy + 11, 1, 3);
    g.fillRect(ox + 14 - armLift, oy + 14, 2, 1);
    // Hands (typing position)
    g.fillRect(ox + 2 + armLift, oy + 14, 1, 1);
    g.fillRect(ox + 15 - armLift, oy + 14, 1, 1);

    // Sleeves
    g.fillStyle(shirtColor);
    g.fillRect(ox + 3, oy + 10, 1, 2);
    g.fillRect(ox + 14, oy + 10, 1, 2);

    // ── SEATED LEGS (visible bent) ──
    g.fillStyle(pantsColor);
    g.fillRect(ox + 5, oy + 16, 8, 3);
    g.fillStyle(0x444455);
    g.fillRect(ox + 5, oy + 16, 8, 1);
    // Feet
    g.fillStyle(0x222222);
    g.fillRect(ox + 5, oy + 19, 3, 2);
    g.fillRect(ox + 10, oy + 19, 3, 2);
  }

  private drawHair(
    g: Phaser.GameObjects.Graphics,
    ox: number,
    oy: number,
    hairColor: number,
    hairStyle: string,
    row: number
  ): void {
    const lighter = this.lighten(hairColor, 0.2);

    g.fillStyle(hairColor);

    switch (hairStyle) {
      case "neat":
        // Neat combed hair
        g.fillRect(ox + 5, oy + 0, 8, 3);
        g.fillRect(ox + 4, oy + 1, 1, 3);
        g.fillRect(ox + 13, oy + 1, 1, 3);
        if (row === 1) {
          // Back of head more hair
          g.fillRect(ox + 5, oy + 0, 8, 5);
          g.fillRect(ox + 4, oy + 1, 1, 6);
          g.fillRect(ox + 13, oy + 1, 1, 6);
        }
        // Part line
        g.fillStyle(lighter);
        g.fillRect(ox + 8, oy + 0, 1, 2);
        break;

      case "side":
        // Side-parted hair
        g.fillRect(ox + 5, oy + 0, 8, 3);
        g.fillRect(ox + 4, oy + 1, 1, 3);
        g.fillRect(ox + 13, oy + 1, 1, 4);
        // Side sweep
        g.fillRect(ox + 13, oy + 2, 2, 3);
        if (row === 1) {
          g.fillRect(ox + 5, oy + 0, 8, 5);
          g.fillRect(ox + 13, oy + 1, 2, 5);
        }
        g.fillStyle(lighter);
        g.fillRect(ox + 6, oy + 0, 2, 1);
        break;

      case "short":
        // Short cropped
        g.fillRect(ox + 5, oy + 1, 8, 2);
        g.fillRect(ox + 4, oy + 2, 1, 2);
        g.fillRect(ox + 13, oy + 2, 1, 2);
        if (row === 1) {
          g.fillRect(ox + 5, oy + 1, 8, 4);
          g.fillRect(ox + 4, oy + 2, 1, 4);
          g.fillRect(ox + 13, oy + 2, 1, 4);
        }
        g.fillStyle(lighter);
        g.fillRect(ox + 7, oy + 1, 3, 1);
        break;

      case "messy":
        // Messy/spiky developer hair
        g.fillRect(ox + 5, oy + 0, 8, 3);
        g.fillRect(ox + 4, oy + 1, 1, 3);
        g.fillRect(ox + 13, oy + 1, 1, 3);
        // Stray strands
        g.fillRect(ox + 4, oy + 0, 1, 1);
        g.fillRect(ox + 7, oy - 1, 1, 1);
        g.fillRect(ox + 10, oy - 1, 1, 1);
        g.fillRect(ox + 14, oy + 0, 1, 1);
        if (row === 1) {
          g.fillRect(ox + 5, oy + 0, 8, 5);
          g.fillRect(ox + 4, oy + 1, 1, 5);
          g.fillRect(ox + 13, oy + 1, 1, 5);
        }
        g.fillStyle(lighter);
        g.fillRect(ox + 6, oy + 0, 2, 1);
        g.fillRect(ox + 11, oy + 0, 2, 1);
        break;

      case "spiky":
        // Spiky styled
        g.fillRect(ox + 5, oy + 0, 8, 3);
        g.fillRect(ox + 4, oy + 1, 1, 3);
        g.fillRect(ox + 13, oy + 1, 1, 3);
        // Spikes
        g.fillRect(ox + 5, oy - 1, 2, 1);
        g.fillRect(ox + 8, oy - 1, 2, 1);
        g.fillRect(ox + 11, oy - 1, 2, 1);
        if (row === 1) {
          g.fillRect(ox + 5, oy + 0, 8, 5);
          g.fillRect(ox + 4, oy + 1, 1, 5);
          g.fillRect(ox + 13, oy + 1, 1, 5);
        }
        g.fillStyle(lighter);
        g.fillRect(ox + 6, oy - 1, 1, 1);
        g.fillRect(ox + 9, oy - 1, 1, 1);
        g.fillRect(ox + 12, oy - 1, 1, 1);
        break;

      case "long":
        // Longer neat hair
        g.fillRect(ox + 5, oy + 0, 8, 3);
        g.fillRect(ox + 4, oy + 1, 1, 5);
        g.fillRect(ox + 13, oy + 1, 1, 5);
        g.fillRect(ox + 5, oy + 0, 2, 1);
        if (row === 1) {
          g.fillRect(ox + 5, oy + 0, 8, 6);
          g.fillRect(ox + 4, oy + 1, 1, 7);
          g.fillRect(ox + 13, oy + 1, 1, 7);
        }
        // Side locks
        g.fillRect(ox + 3, oy + 4, 1, 4);
        g.fillRect(ox + 14, oy + 4, 1, 4);
        g.fillStyle(lighter);
        g.fillRect(ox + 7, oy + 0, 3, 1);
        break;
    }
  }

  // ─── STATUS INDICATORS ──────────────────────────────────────────

  private generateStatusIndicators(): void {
    // Typing bubble "..."
    this.makeTex("bubble-typing", 20, 14, (g) => {
      // Bubble body
      g.fillStyle(0xffffff);
      g.fillRect(2, 0, 16, 10);
      g.fillRect(0, 2, 20, 6);
      g.fillRect(1, 1, 18, 8);
      // Tail
      g.fillRect(4, 10, 3, 2);
      g.fillRect(3, 12, 2, 1);
      g.fillRect(2, 13, 1, 1);
      // Dots
      g.fillStyle(0x666666);
      g.fillRect(5, 4, 2, 2);
      g.fillRect(9, 4, 2, 2);
      g.fillRect(13, 4, 2, 2);
    });

    // Thinking bubble "?"
    this.makeTex("bubble-thinking", 16, 16, (g) => {
      // Cloud shape
      g.fillStyle(0xffffff);
      g.fillRect(2, 0, 12, 10);
      g.fillRect(0, 2, 16, 6);
      g.fillRect(1, 1, 14, 8);
      // Cloud tail dots
      g.fillRect(4, 10, 3, 2);
      g.fillRect(3, 12, 2, 2);
      g.fillRect(2, 14, 1, 1);
      // Question mark
      g.fillStyle(0x6666cc);
      g.fillRect(5, 2, 6, 1);
      g.fillRect(10, 2, 1, 3);
      g.fillRect(7, 4, 4, 1);
      g.fillRect(7, 5, 2, 1);
      g.fillRect(7, 7, 2, 1);
    });

    // Status dots
    this.makeTex("status-dot-green", 6, 6, (g) => {
      g.fillStyle(0x22cc44);
      g.fillRect(1, 0, 4, 6);
      g.fillRect(0, 1, 6, 4);
      // Highlight
      g.fillStyle(0x44ee66);
      g.fillRect(1, 1, 2, 2);
    });

    this.makeTex("status-dot-red", 6, 6, (g) => {
      g.fillStyle(0xcc2222);
      g.fillRect(1, 0, 4, 6);
      g.fillRect(0, 1, 6, 4);
      g.fillStyle(0xee4444);
      g.fillRect(1, 1, 2, 2);
    });

    this.makeTex("status-dot-yellow", 6, 6, (g) => {
      g.fillStyle(0xccaa22);
      g.fillRect(1, 0, 4, 6);
      g.fillRect(0, 1, 6, 4);
      g.fillStyle(0xeecc44);
      g.fillRect(1, 1, 2, 2);
    });
  }

  // ─── UTILITY ──────────────────────────────────────────────────

  private makeTex(
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void
  ): void {
    // Check if texture already exists and remove it
    if (this.scene.textures.exists(key)) {
      this.scene.textures.remove(key);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false } as any);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private lighten(color: number, amount: number): number {
    let r = (color >> 16) & 0xff;
    let gg = (color >> 8) & 0xff;
    let b = color & 0xff;
    r = Math.min(255, Math.floor(r + (255 - r) * amount));
    gg = Math.min(255, Math.floor(gg + (255 - gg) * amount));
    b = Math.min(255, Math.floor(b + (255 - b) * amount));
    return (r << 16) | (gg << 8) | b;
  }

  private darken(color: number, amount: number): number {
    let r = (color >> 16) & 0xff;
    let gg = (color >> 8) & 0xff;
    let b = color & 0xff;
    r = Math.floor(r * (1 - amount));
    gg = Math.floor(gg * (1 - amount));
    b = Math.floor(b * (1 - amount));
    return (r << 16) | (gg << 8) | b;
  }
}
