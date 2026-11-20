import {
  BoxGeometry,
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshToonMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  TubeGeometry,
} from "three";
import {
  MEADOW_DROP,
  type TowerLayout,
} from "../core/layout.ts";
import {
  organicProps,
  facet,
  token,
} from "./boardMaterials.ts";
import {
  type WinSceneKind,
  GALLERY_SCENES,
  gallerySkyTheme,
  WIN_GLYPH_W,
  WIN_GLYPH_I,
  WIN_GLYPH_N,
  WIN_GLYPH_BANG,
  FAIL_GLYPH_F,
  FAIL_GLYPH_A,
  FAIL_GLYPH_I,
  FAIL_GLYPH_L,
  FAIL_GLYPH_BANG,
  GRAVE_GLYPH_RIP,
  GRAVE_GLYPH_CROSS,
  GRAVE_GLYPH_R,
  SCENE_ANIMALS,
  type AnimalBit,
  meadowStream,
  nearStream,
  flatDisc,
  type TreeKind,
  type TreeMats,
  makeTree,
  makeDeadTree,
  makeGrave,
  makeComedySkull,
  makeBone,
  makeCrow,
  makeBrokenGate,
  makeOpenCoffin,
  makeGraveLantern,
  makeGhost,
  makePalm,
  makeCactus,
  makeCottage,
  makeStreetLamp,
  makeBench,
  makeMushroomPatch,
  swimHeight,
  animalScale,
  type AnimalMats,
  makeAnimal,
  voxel,
} from "./winGalleryKit.ts";

import type { BoardEffects } from "./boardEffects.ts";
import { MEADOW_SPAN_MULT } from "./mazeWorldTypes.ts";

/**
 * Ground plane vs content span — past the far clip so pads don’t show an edge,
 * but not so huge the horizon reads as empty forever behind WIN/FAIL.
 */
const MEADOW_GROUND_MULT = 7;

/** Hooks back into the world so the meadow scenes don't reach into MazeWorld internals. */
export interface WinGalleryHost {
  readonly board: Group;
  readonly camera: PerspectiveCamera;
  readonly fx: BoardEffects;
  /** Active tower (sizes the meadow footprint). */
  tower(): TowerLayout | null;
  /** Tear down the previous meadow plus any home/lightning leftovers. */
  clearMeadow(): void;
  disposeGenerated(child: object): void;
  setFailed(failed: boolean): void;
  /** Repaint the void sky behind a freshly built scene. */
  syncBackdrop(): void;
}

/** Materials the meadow scenes dress with (built once by MazeWorld, shared with the home backdrop). */
export interface WinGalleryMats {
  groundMats: Record<string, MeshToonMaterial>;
  floorMats: Record<WinSceneKind, MeshToonMaterial>;
  failFloorMat: MeshToonMaterial;
  streamMat: MeshToonMaterial;
  streamDeepMat: MeshToonMaterial;
  oceanMat: MeshToonMaterial;
  oceanDeepMat: MeshToonMaterial;
  cactusMat: MeshToonMaterial;
  cactusLitMat: MeshToonMaterial;
  palmMat: MeshToonMaterial;
  palmLitMat: MeshToonMaterial;
  treeMats: TreeMats;
  flowerMats: MeshToonMaterial[];
  animalMats: AnimalMats;
  discoMats: MeshToonMaterial[];
}

/** Win / fail meadow scenes: build, swap, and animate the victory gallery. */
export class WinGalleryScenes {
  meadow: Group | null = null;
  meadowFlowers: Mesh[] = [];
  meadowAnimals: AnimalBit[] = [];
  meadowFlames: Object3D[] = [];
  meadowDisco: { mesh: Mesh; phase: number; row: number; col: number }[] = [];
  meadowDiscoBall: Group | null = null;
  meadowLight: PointLight | null = null;
  meadowWinLetters: Group | null = null;
  /** Index into GALLERY_SCENES for the scene on show. */
  sceneIndex = 0;

  private readonly board: Group;
  private readonly camera: PerspectiveCamera;
  private readonly fx: BoardEffects;
  private readonly groundMats: Record<string, MeshToonMaterial>;
  private readonly floorMats: Record<WinSceneKind, MeshToonMaterial>;
  private readonly failFloorMat: MeshToonMaterial;
  private readonly streamMat: MeshToonMaterial;
  private readonly streamDeepMat: MeshToonMaterial;
  private readonly oceanMat: MeshToonMaterial;
  private readonly oceanDeepMat: MeshToonMaterial;
  private readonly cactusMat: MeshToonMaterial;
  private readonly cactusLitMat: MeshToonMaterial;
  private readonly palmMat: MeshToonMaterial;
  private readonly palmLitMat: MeshToonMaterial;
  private readonly treeMats: TreeMats;
  private readonly flowerMats: MeshToonMaterial[];
  private readonly animalMats: AnimalMats;
  private readonly discoMats: MeshToonMaterial[];

  private readonly host: WinGalleryHost;

  constructor(host: WinGalleryHost, mats: WinGalleryMats) {
    this.host = host;
    this.board = host.board;
    this.camera = host.camera;
    this.fx = host.fx;
    this.groundMats = mats.groundMats;
    this.floorMats = mats.floorMats;
    this.failFloorMat = mats.failFloorMat;
    this.streamMat = mats.streamMat;
    this.streamDeepMat = mats.streamDeepMat;
    this.oceanMat = mats.oceanMat;
    this.oceanDeepMat = mats.oceanDeepMat;
    this.cactusMat = mats.cactusMat;
    this.cactusLitMat = mats.cactusLitMat;
    this.palmMat = mats.palmMat;
    this.palmLitMat = mats.palmLitMat;
    this.treeMats = mats.treeMats;
    this.flowerMats = mats.flowerMats;
    this.animalMats = mats.animalMats;
    this.discoMats = mats.discoMats;
  }

  private get tower(): TowerLayout | null {
    return this.host.tower();
  }

  /** Swap to gallery scene `index` (wraps), building the matching win or fail meadow. */
  applyWinScene(index: number): void {
    const count = GALLERY_SCENES.length;
    const safe = ((index % count) + count) % count;
    this.sceneIndex = safe;
    const scene = GALLERY_SCENES[safe] ?? "pasture";
    if (scene === "fail") {
      this.host.setFailed(true);
      this.buildFailScene();
    } else {
      this.host.setFailed(false);
      this.buildWinScene(scene);
    }
    this.host.syncBackdrop();
  }

  /** Void-sky theme for the meadow currently showing. */
  skyThemeId(): string {
    const count = GALLERY_SCENES.length;
    const index = ((this.sceneIndex % count) + count) % count;
    return gallerySkyTheme(GALLERY_SCENES[index] ?? "pasture");
  }

  /** Remove the current meadow and forget everything that animated on it. */
  clear(): void {
    if (this.meadow) {
      this.board.remove(this.meadow);
      this.meadow.traverse((child) => this.host.disposeGenerated(child));
      this.meadow = null;
    }
    this.meadowFlowers.length = 0;
    this.meadowAnimals.length = 0;
    this.meadowFlames.length = 0;
    this.meadowDisco.length = 0;
    this.meadowDiscoBall = null;
    this.meadowLight = null;
    this.meadowWinLetters = null;
  }

  /** Per-frame meadow animation (flowers, animals, flames, disco, letters). */
  tick(time: number, failed: boolean): void {
    for (const [index, flower] of this.meadowFlowers.entries()) {
      const baseY = typeof flower.userData.baseY === "number"
        ? flower.userData.baseY
        : flower.position.y;
      flower.userData.baseY = baseY;
      flower.position.y = baseY + Math.sin(time * 1.8 + index * 0.7) * 0.012;
      if (flower.userData.spin !== false) {
        flower.rotation.y = time * 0.35 + index;
      }
    }
    for (const [index, animal] of this.meadowAnimals.entries()) {
      const hop = Math.abs(Math.sin(time * 4.2 + index * 1.1));
      const bob = animal.baseY > 0.2 ? hop * 0.12 : hop * 0.2;
      animal.group.position.y = animal.baseY + bob;
      const s = animal.scale;
      animal.group.scale.setScalar(s);
      animal.group.rotation.y = animal.facing + Math.sin(time * 0.7 + index * 1.3) * 0.08;
    }
    for (const [index, flame] of this.meadowFlames.entries()) {
      if (flame.userData.planetFloat) {
        const phase = typeof flame.userData.driftPhase === "number" ? flame.userData.driftPhase : index;
        const speed = typeof flame.userData.driftSpeed === "number" ? flame.userData.driftSpeed : 0.35;
        const baseY = typeof flame.userData.baseY === "number" ? flame.userData.baseY : flame.position.y;
        const bob = typeof flame.userData.bobAmp === "number" ? flame.userData.bobAmp : 0.12;
        const spin = typeof flame.userData.spin === "number" ? flame.userData.spin : 0.18;
        flame.position.y = baseY + Math.sin(time * speed + phase) * bob;
        flame.rotation.y = time * spin + phase;
        flame.rotation.z = Math.sin(time * speed * 0.55 + phase) * 0.08;
        continue;
      }
      if (!(flame instanceof Mesh)) continue;
      if (flame.userData.flickerScale !== false) {
        const flicker = 0.85 + Math.sin(time * 14 + index * 2.1) * 0.2;
        flame.scale.set(flicker, 0.9 + Math.sin(time * 11 + index) * 0.35, flicker);
      }
      if (flame.material instanceof MeshToonMaterial) {
        flame.material.emissiveIntensity = 0.75 + Math.sin(time * 16 + index) * 0.35;
      }
    }
    if (this.meadowLight) {
      this.meadowLight.intensity = 2.4 + Math.sin(time * 12) * 0.6;
    }
    if (this.meadowDisco.length > 0 && this.discoMats.length > 0) {
      const beat = Math.floor(time * 5.5);
      for (const tile of this.meadowDisco) {
        const wave = beat + tile.row * 2 + tile.col + Math.floor(tile.phase);
        const mat = this.discoMats[((wave % this.discoMats.length) + this.discoMats.length) % this.discoMats.length];
        if (mat) tile.mesh.material = mat;
        const pulse = 0.55 + Math.abs(Math.sin(time * 8 + tile.phase)) * 0.55;
        tile.mesh.scale.set(1, pulse, 1);
        tile.mesh.position.y = 0.03 + pulse * 0.04;
      }
      if (this.meadowLight) {
        const glowMat = this.discoMats[beat % this.discoMats.length];
        if (glowMat) {
          this.meadowLight.color.set(glowMat.emissive);
          this.meadowLight.intensity = 3.2 + Math.sin(time * 14) * 1.2;
        }
      }
    }
    if (this.meadowDiscoBall) {
      this.meadowDiscoBall.rotation.y = time * 1.8;
      this.meadowDiscoBall.position.y = 2.1 + Math.sin(time * 2.2) * 0.08;
    }
    if (this.meadowWinLetters) {
      for (const letter of this.meadowWinLetters.children) {
        const phase = typeof letter.userData.phase === "number" ? letter.userData.phase : 0;
        const baseY = typeof letter.userData.baseY === "number" ? letter.userData.baseY : 0;
        if (failed) {
          letter.position.y = baseY + Math.sin(time * 1.1 + phase) * 0.05;
          letter.rotation.y = Math.sin(time * 0.55 + phase) * 0.04;
          letter.rotation.z = -0.04 + Math.sin(time * 0.7 + phase) * 0.03;
        } else {
          letter.position.y = baseY + Math.sin(time * 2.4 + phase) * 0.12;
          letter.rotation.y = Math.sin(time * 1.1 + phase) * 0.08;
          letter.rotation.z = 0;
        }
      }
    }
  }

  private buildWinScene(kind: WinSceneKind): void {
    this.host.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.fx.fireworkCooldown = 0.02 + Math.random() * 0.08;
    if (kind === "beach") {
      this.addBeachTerrain(group, span);
      this.addPalms(group, span);
      this.addBeachScatter(group, span);
    } else {
      this.addGround(group, span, kind);
    }
    if (kind === "pasture") {
      const stream = meadowStream(span);
      this.addRibbon(group, stream, this.streamDeepMat, this.streamMat);
      this.addMixedTrees(group, span, stream);
      this.addScatter(group, span, stream, this.groundMats.grassDark, true);
    } else if (kind === "snow") {
      this.addPineGrove(group, span);
      this.addDrifts(group, span);
    } else if (kind === "desert") {
      this.addCacti(group, span);
      this.addRocks(group, span);
    } else if (kind === "orchard") {
      this.addOrchardRows(group, span);
      this.addScatter(group, span, null, this.groundMats.grassDark, true);
    } else if (kind === "twilight") {
      this.addTwilightTrees(group, span);
      this.addScatter(group, span, null, this.groundMats.lavenderDark, true);
    } else if (kind === "underwater") {
      this.addReef(group, span);
      this.addSeaweed(group, span);
      this.addShipwreck(group, span);
    } else if (kind === "city") {
      this.addCityPark(group, span);
    } else if (kind === "village") {
      this.addVillage(group, span);
      this.addBonfire(group);
    } else if (kind === "moon") {
      this.addMoonscape(group, span);
    } else if (kind === "venus") {
      this.addVenusField(group, span);
    } else if (kind === "forest") {
      const brook = meadowStream(span);
      this.addRibbon(group, brook, this.streamDeepMat, this.streamMat);
      this.addFunForest(group, span, brook);
    } else if (kind === "rainforest") {
      const river = meadowStream(span);
      this.addRibbon(group, river, this.streamDeepMat, this.streamMat);
      this.addRainforest(group, span, river);
    } else if (kind === "disco") {
      this.addDiscoFloor(group, span);
    }
    // beach terrain/props already built above
    const riverScene = kind === "pasture" || kind === "forest" || kind === "rainforest";
    this.addAnimals(group, span, kind, riverScene ? meadowStream(span) : null);
    this.addWinSign(group, span);
    this.board.add(group);
    this.meadow = group;
  }

  private addWinSign(parent: Group, span: number): void {
    const glyphs = [WIN_GLYPH_W, WIN_GLYPH_I, WIN_GLYPH_N, WIN_GLYPH_BANG];
    const rows = WIN_GLYPH_W.length;
    let cols = 0;
    for (const glyph of glyphs) cols += glyph[0]?.length ?? 0;
    cols += glyphs.length - 1;

    const targetW = span * 0.62;
    const cell = targetW / cols;
    const depth = cell * 0.9;
    const letterH = cell * rows;
    const mat = this.groundMats.winNeon;

    const letters = new Group();
    letters.position.set(0, cell * 0.35, -span * 0.42);

    let cursor = -targetW * 0.5;
    for (const [index, glyph] of glyphs.entries()) {
      const width = glyph[0]?.length ?? 0;
      const letter = new Group();
      letter.position.x = cursor + width * cell * 0.5;
      letter.userData.baseY = 0;
      letter.userData.phase = index * 0.9;
      for (let r = 0; r < glyph.length; r += 1) {
        const line = glyph[r] ?? "";
        for (let c = 0; c < line.length; c += 1) {
          if (line[c] !== "#") continue;
          const x = (c + 0.5 - width * 0.5) * cell;
          const y = letterH - (r + 0.5) * cell;
          voxel(letter, mat, cell * 0.46, cell * 0.46, depth * 0.5, x, y, 0);
        }
      }
      letters.add(letter);
      cursor += (width + 1) * cell;
    }

    parent.add(letters);
    this.meadowWinLetters = letters;
  }

  buildFailScene(): void {
    this.host.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const ground = this.meadowGroundSpan(span);
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.fx.rainCooldown = 0.01;

    const pad = new Mesh(new BoxGeometry(ground, 0.22, ground), this.groundMats.failGroundDark);
    pad.position.y = -0.11;
    pad.receiveShadow = organicProps;
    group.add(pad);

    const tiles = Math.max(4, Math.round(ground / 2.4));
    if (this.failFloorMat.map) {
      this.failFloorMat.map.repeat.set(tiles, tiles);
      this.failFloorMat.map.needsUpdate = true;
    }
    const carpet = new Mesh(new PlaneGeometry(ground, ground), this.failFloorMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    carpet.receiveShadow = organicProps;
    group.add(carpet);

    this.addFailRubble(group, span);
    this.addFailDeadTrees(group, span);
    this.addFailGraves(group, span);
    this.addFailSkull(group, span);
    this.addFailBones(group, span);
    this.addFailGate(group, span);
    this.addFailCoffin(group, span);
    this.addFailLantern(group, span);
    this.addFailGhost(group, span);
    this.addFailSign(group, span);
    this.board.add(group);
    this.meadow = group;
    for (let i = 0; i < 48; i += 1) this.fx.spawnRaindrop(group);
  }

  private addFailRubble(parent: Group, span: number): void {
    const rim = span * 0.46;
    for (let i = 0; i < 36; i += 1) {
      const a = i * 1.31 + 0.4;
      // Keep the center clear for graves / ghost / skull.
      const radius = rim * (0.42 + ((i * 23) % 100) / 100 * 0.58);
      const rock = new Mesh(
        new BoxGeometry(
          0.1 + (i % 6) * 0.07,
          0.05 + (i % 5) * 0.045,
          0.08 + (i % 4) * 0.06,
        ),
        i % 4 === 0
          ? this.groundMats.failCrack
          : i % 4 === 1
            ? this.groundMats.failGroundDark
            : i % 4 === 2
              ? this.groundMats.moonRock
              : this.groundMats.failGround,
      );
      rock.position.set(
        Math.cos(a) * radius,
        0.04 + (i % 4) * 0.02,
        Math.sin(a) * radius * 0.92,
      );
      rock.rotation.y = a * 0.7;
      rock.rotation.z = ((i % 7) - 3) * 0.05;
      rock.rotation.x = ((i % 5) - 2) * 0.04;
      rock.castShadow = organicProps;
      rock.receiveShadow = organicProps;
      parent.add(rock);
    }
    for (let i = 0; i < 10; i += 1) {
      const a = i * 1.95 + 0.7;
      const pile = new Group();
      pile.position.set(
        Math.cos(a) * rim * (0.58 + (i % 3) * 0.12),
        0,
        Math.sin(a) * rim * (0.55 + (i % 4) * 0.1),
      );
      pile.rotation.y = a * 0.5;
      const mat = i % 2 === 0 ? this.groundMats.failGround : this.groundMats.failGroundDark;
      voxel(pile, mat, 0.22 + (i % 3) * 0.06, 0.08, 0.16, 0, 0.08, 0);
      voxel(pile, this.groundMats.failCrack, 0.12, 0.07, 0.1, 0.14, 0.14, 0.04);
      voxel(pile, this.groundMats.moonRock, 0.1, 0.05, 0.14, -0.12, 0.12, -0.06);
      parent.add(pile);
    }
  }

  private addFailDeadTrees(parent: Group, span: number): void {
    const rim = span * 0.46;
    const spots: { x: number; z: number; scale: number; lean: number }[] = [
      { x: rim * -0.95, z: rim * -0.35, scale: 1.35, lean: 0.12 },
      { x: rim * 0.96, z: rim * -0.28, scale: 1.2, lean: -0.18 },
      { x: rim * -0.88, z: rim * 0.72, scale: 1.05, lean: 0.22 },
      { x: rim * 0.9, z: rim * 0.68, scale: 1.45, lean: -0.08 },
      { x: rim * -0.35, z: rim * -0.92, scale: 0.95, lean: 0.28 },
      { x: rim * 0.42, z: rim * 0.95, scale: 1.1, lean: -0.25 },
    ];
    for (const spot of spots) {
      parent.add(makeDeadTree(spot.x, spot.z, spot.scale, spot.lean, this.treeMats.trunk));
    }
  }

  private addFailGraves(parent: Group, span: number): void {
    // Left cemetery plot — spread along a diagonal away from the ghost.
    const rim = span * 0.4;
    const graves: {
      x: number;
      z: number;
      scale: number;
      yaw: number;
      glyph: string[];
    }[] = [
      { x: rim * -0.82, z: rim * -0.05, scale: 1.35, yaw: 0.22, glyph: GRAVE_GLYPH_RIP },
      { x: rim * -0.58, z: rim * 0.48, scale: 1.5, yaw: -0.12, glyph: GRAVE_GLYPH_CROSS },
      { x: rim * -0.92, z: rim * 0.42, scale: 1.15, yaw: 0.35, glyph: GRAVE_GLYPH_R },
    ];
    for (const grave of graves) {
      parent.add(
        makeGrave(
          grave.x,
          grave.z,
          grave.scale,
          grave.yaw,
          grave.glyph,
          this.groundMats.failGround,
          this.groundMats.failGroundDark,
          this.groundMats.failCrack,
          this.groundMats.moonRock,
        ),
      );
    }
  }

  private addFailSkull(parent: Group, span: number): void {
    // Front-right focal piece, clear of the coffin and bones.
    const rim = span * 0.4;
    const skull = makeComedySkull(
      rim * 0.72,
      rim * -0.78,
      2.35,
      -0.28,
      0.12,
      this.groundMats.plaster,
      this.animalMats.sheep,
      this.groundMats.failCrack,
      this.animalMats.sheepFace,
    );
    skull.add(
      makeCrow(
        0.08,
        1.18,
        0.06,
        0.55,
        -0.4,
        this.animalMats.cowSpot,
        this.animalMats.sheepFace,
        this.groundMats.failCrack,
      ),
    );
    parent.add(skull);
  }

  private addFailBones(parent: Group, span: number): void {
    const rim = span * 0.4;
    const bone = this.groundMats.plaster;
    const boneLit = this.animalMats.sheep;
    parent.add(makeBone(rim * 0.42, rim * -0.52, 1.15, 0.9, 0.35, bone, boneLit));
    parent.add(makeBone(rim * 0.88, rim * -0.42, 1.0, -0.55, -0.2, bone, boneLit));
    parent.add(makeBone(rim * -0.35, rim * -0.72, 0.95, 1.35, 0.15, bone, boneLit));
  }

  private addFailGate(parent: Group, span: number): void {
    // Back-center under the FAIL sign.
    const rim = span * 0.44;
    parent.add(
      makeBrokenGate(
        rim * 0.08,
        rim * 0.88,
        1.35,
        -0.05,
        this.groundMats.moonRock,
        this.groundMats.failGroundDark,
        this.groundMats.failCrack,
      ),
    );
  }

  private addFailCoffin(parent: Group, span: number): void {
    // Mid-right, opposite the cemetery.
    const rim = span * 0.4;
    parent.add(
      makeOpenCoffin(
        rim * 0.78,
        rim * 0.28,
        1.25,
        -0.85,
        0.18,
        this.groundMats.wreck,
        this.groundMats.wreckDark,
        this.groundMats.plaster,
        this.groundMats.failGroundDark,
      ),
    );
  }

  private addFailLantern(parent: Group, span: number): void {
    // Between graves so the fire reads across the left plot.
    const rim = span * 0.4;
    const lx = rim * -0.62;
    const lz = rim * 0.18;
    const lantern = makeGraveLantern(
      lx,
      lz,
      1.15,
      0.25,
      this.groundMats.wreckDark,
      this.groundMats.moonRock,
      this.groundMats.fire,
      this.groundMats.fireCore,
    );
    parent.add(lantern);
    for (const child of lantern.children) {
      if (child instanceof Mesh && child.userData.lanternFlame) {
        this.meadowFlames.push(child);
      }
    }
    const light = new PointLight(token("--maze-fire"), 1.8, 6.5, 2);
    light.position.set(lx, 0.85, lz);
    parent.add(light);
    this.meadowLight = light;
  }

  private addFailGhost(parent: Group, span: number): void {
    // Center stage, facing the camera — clear of graves and skull.
    const rim = span * 0.4;
    const body = this.animalMats.jellyGlow;
    const shade = this.groundMats.failNeon;
    const pupils = this.groundMats.failCrack;
    const whites = this.animalMats.sheep;
    const ghost = makeGhost(
      rim * 0.08,
      rim * -0.12,
      2.45,
      0,
      body,
      shade,
      pupils,
      whites,
    );
    ghost.userData.planetFloat = true;
    ghost.userData.baseY = ghost.position.y;
    ghost.userData.driftPhase = 0;
    ghost.userData.driftSpeed = 1.15;
    ghost.userData.bobAmp = 0.2;
    // Face +Z (camera). Keep spin at 0 so the yaw stays locked.
    ghost.userData.spin = 0;
    parent.add(ghost);
    this.meadowFlames.push(ghost);
  }

  private addFailSign(parent: Group, span: number): void {
    const glyphs = [FAIL_GLYPH_F, FAIL_GLYPH_A, FAIL_GLYPH_I, FAIL_GLYPH_L, FAIL_GLYPH_BANG];
    const rows = FAIL_GLYPH_F.length;
    let cols = 0;
    for (const glyph of glyphs) cols += glyph[0]?.length ?? 0;
    cols += glyphs.length - 1;

    const targetW = span * 0.68;
    const cell = targetW / cols;
    const depth = cell * 0.9;
    const letterH = cell * rows;
    const mat = this.groundMats.failNeon;

    const letters = new Group();
    letters.position.set(0, cell * 0.2, -span * 0.42);

    let cursor = -targetW * 0.5;
    for (const [index, glyph] of glyphs.entries()) {
      const width = glyph[0]?.length ?? 0;
      const letter = new Group();
      letter.position.x = cursor + width * cell * 0.5;
      letter.userData.baseY = 0;
      letter.userData.phase = index * 0.85;
      for (let r = 0; r < glyph.length; r += 1) {
        const line = glyph[r] ?? "";
        for (let c = 0; c < line.length; c += 1) {
          if (line[c] !== "#") continue;
          const x = (c + 0.5 - width * 0.5) * cell;
          const y = letterH - (r + 0.5) * cell;
          voxel(letter, mat, cell * 0.46, cell * 0.46, depth * 0.5, x, y, 0);
        }
      }
      letters.add(letter);
      cursor += (width + 1) * cell;
    }

    parent.add(letters);
    this.meadowWinLetters = letters;
  }

  /** Floor extent past the far clip so meadow pads never show an edge. */
  private meadowGroundSpan(contentSpan: number): number {
    return Math.max(contentSpan * MEADOW_GROUND_MULT, this.camera.far * 1.5);
  }

  private addGround(parent: Group, span: number, kind: WinSceneKind): void {
    const sideMats: Record<WinSceneKind, MeshToonMaterial> = {
      pasture: this.groundMats.grassDark,
      beach: this.groundMats.sandDark,
      snow: this.groundMats.snowShade,
      desert: this.groundMats.duneDark,
      orchard: this.groundMats.grassDark,
      twilight: this.groundMats.lavenderDark,
      underwater: this.groundMats.seabedDark,
      city: this.groundMats.grassDark,
      village: this.groundMats.cobbleDark,
      moon: this.groundMats.moonDustDark,
      venus: this.groundMats.venusGroundDark,
      forest: this.groundMats.moss,
      rainforest: this.groundMats.canopy,
      disco: this.groundMats.discoFloorDark,
    };
    const ground = this.meadowGroundSpan(span);
    const pad = new Mesh(new BoxGeometry(ground, 0.22, ground), sideMats[kind]);
    pad.position.y = -0.11;
    pad.receiveShadow = organicProps;
    parent.add(pad);

    const floorMat = this.floorMats[kind];
    const tiles = Math.max(4, Math.round(ground / 2.4));
    if (floorMat.map) {
      floorMat.map.repeat.set(tiles, tiles);
      floorMat.map.needsUpdate = true;
    }
    const carpet = new Mesh(new PlaneGeometry(ground, ground), floorMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    carpet.receiveShadow = organicProps;
    parent.add(carpet);
    this.addFloorDetail(parent, span, kind);
  }

  private addFloorDetail(parent: Group, span: number, kind: WinSceneKind): void {
    if (kind === "moon") this.addMoonCraters(parent, span);
    else if (kind === "underwater") this.addSeabedFloor(parent, span);
  }

  private addMoonCraters(parent: Group, span: number): void {
    const craters = [
      { x: 0.2, z: -0.14, r: 0.2 },
      { x: -0.26, z: 0.18, r: 0.14 },
      { x: 0.08, z: 0.26, r: 0.1 },
    ];
    for (const [index, crater] of craters.entries()) {
      const x = crater.x * span;
      const z = crater.z * span;
      const rim = flatDisc(crater.r * span * 1.12, this.groundMats.moonRock);
      rim.position.set(x, 0.04 + index * 0.002, z);
      parent.add(rim);
      const bowl = flatDisc(crater.r * span, this.groundMats.moonDustDark);
      bowl.position.set(x, 0.05 + index * 0.002, z);
      parent.add(bowl);
      const floor = flatDisc(crater.r * span * 0.55, this.groundMats.moonDust);
      floor.position.set(x, 0.06 + index * 0.002, z);
      parent.add(floor);
    }
  }

  private addSeabedFloor(parent: Group, span: number): void {
    const accents = [
      { x: 0.22, z: -0.18, r: 0.1, mat: this.groundMats.seabedSand },
      { x: -0.26, z: 0.16, r: 0.09, mat: this.groundMats.coral },
      { x: 0.12, z: 0.24, r: 0.08, mat: this.groundMats.anemone },
      { x: -0.18, z: -0.24, r: 0.09, mat: this.groundMats.coralLit },
      { x: 0.3, z: 0.06, r: 0.07, mat: this.groundMats.seabedSand },
    ];
    for (const [index, patch] of accents.entries()) {
      const disc = flatDisc(patch.r * span, patch.mat);
      disc.position.set(patch.x * span, 0.05 + index * 0.002, patch.z * span);
      parent.add(disc);
    }
  }

  private addMoonscape(parent: Group, span: number): void {
    const rim = span * 0.36;
    for (let i = 0; i < 10; i += 1) {
      const a = i * 1.7 + 0.3;
      const boulder = new Mesh(
        new BoxGeometry(0.16 + (i % 4) * 0.06, 0.12 + (i % 3) * 0.05, 0.14 + (i % 2) * 0.05),
        i % 2 === 0 ? this.groundMats.moonRock : this.groundMats.moonDustDark,
      );
      boulder.position.set(Math.cos(a) * rim * 0.9, 0.08, Math.sin(a) * rim * 0.75);
      parent.add(boulder);
    }
    const lander = new Group();
    lander.position.set(-span * 0.12, 0, span * 0.08);
    voxel(lander, this.groundMats.moonDust, 0.18, 0.08, 0.18, 0, 0.22, 0);
    voxel(lander, this.groundMats.moonRock, 0.1, 0.14, 0.1, 0, 0.4, 0);
    voxel(lander, this.groundMats.buildingLit, 0.06, 0.04, 0.06, 0, 0.56, 0);
    for (const [x, z] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]] as const) {
      voxel(lander, this.groundMats.moonRock, 0.02, 0.16, 0.02, x, 0.16, z);
      voxel(lander, this.groundMats.moonDustDark, 0.05, 0.02, 0.05, x, 0.02, z);
    }
    parent.add(lander);

    const flag = new Group();
    flag.position.set(span * 0.08, 0, -span * 0.1);
    voxel(flag, this.groundMats.moonRock, 0.02, 0.35, 0.02, 0, 0.35, 0);
    voxel(flag, this.groundMats.fire, 0.14, 0.08, 0.02, 0.14, 0.58, 0);
    parent.add(flag);
  }

  private addVenusField(parent: Group, span: number): void {
    const rim = span * 0.36;
    for (let i = 0; i < 7; i += 1) {
      const a = i * 2.15;
      const ridge = new Mesh(
        new BoxGeometry(0.55 + (i % 3) * 0.2, 0.28 + (i % 2) * 0.16, 0.22 + (i % 4) * 0.06),
        i % 2 === 0 ? this.groundMats.venusRock : this.groundMats.venusGroundDark,
      );
      ridge.position.set(Math.cos(a) * rim * 0.8, 0.16, Math.sin(a) * rim * 0.7);
      ridge.rotation.y = a * 0.4;
      parent.add(ridge);
    }
    for (let i = 0; i < 8; i += 1) {
      const a = i * 1.85 + 0.5;
      const vent = new Group();
      vent.position.set(Math.cos(a) * rim * 0.55, 0, Math.sin(a) * rim * 0.5);
      voxel(vent, this.groundMats.venusRock, 0.1, 0.08, 0.1, 0, 0.1, 0);
      voxel(vent, this.groundMats.sulfur, 0.06, 0.1, 0.06, 0, 0.24, 0);
      voxel(vent, this.groundMats.sulfurGlow, 0.04, 0.12, 0.04, 0, 0.4, 0);
      parent.add(vent);
      const plume = vent.children[vent.children.length - 1] as Mesh;
      plume.userData.flickerScale = false;
      this.meadowFlames.push(plume);
    }
    const light = new PointLight(token("--maze-sulfur-glow"), 2.4, 10, 2);
    light.position.set(0, 1.0, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addReef(parent: Group, span: number): void {
    const rim = span * 0.34;
    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.05;
      const coral = new Group();
      const palette = [
        this.groundMats.coral,
        this.groundMats.coralLit,
        this.groundMats.anemone,
        this.groundMats.seabedLit,
      ];
      const mat = palette[i % palette.length]!;
      voxel(coral, mat, 0.06, 0.16 + (i % 3) * 0.05, 0.06, 0, 0.2, 0);
      voxel(coral, mat, 0.05, 0.1, 0.05, 0.1, 0.28, 0.04);
      voxel(coral, mat, 0.05, 0.1, 0.05, -0.08, 0.26, -0.05);
      if (i % 3 === 0) {
        voxel(coral, this.groundMats.coralLit, 0.08, 0.05, 0.08, 0, 0.38, 0);
      }
      coral.position.set(Math.cos(a) * rim, 0, Math.sin(a) * rim * 0.85);
      parent.add(coral);
    }
  }

  private addSeaweed(parent: Group, span: number): void {
    const rim = span * 0.38;
    for (let i = 0; i < 20; i += 1) {
      const a = i * 1.7 + 0.4;
      const weed = new Mesh(
        new BoxGeometry(0.05, 0.4 + (i % 4) * 0.1, 0.05),
        this.groundMats.seaweed,
      );
      weed.position.set(Math.cos(a) * rim * 0.9, 0.24, Math.sin(a) * rim * 0.75);
      weed.userData.baseY = weed.position.y;
      weed.userData.spin = false;
      parent.add(weed);
      this.meadowFlowers.push(weed);
    }
  }

  private addShipwreck(parent: Group, span: number): void {
    const wreck = new Group();
    wreck.position.set(-span * 0.12, 0.12, span * 0.08);
    wreck.rotation.z = 0.35;
    wreck.rotation.y = -0.55;
    voxel(wreck, this.groundMats.wreck, 0.7, 0.18, 0.28, 0, 0.2, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.55, 0.08, 0.22, 0.05, 0.38, 0);
    voxel(wreck, this.groundMats.wreck, 0.08, 0.55, 0.08, -0.35, 0.55, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.06, 0.28, 0.06, -0.35, 0.95, 0.12);
    voxel(wreck, this.groundMats.wreck, 0.22, 0.05, 0.05, -0.2, 0.85, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.12, 0.12, 0.04, 0.45, 0.22, 0.2);
    voxel(wreck, this.groundMats.wreck, 0.1, 0.08, 0.16, 0.55, 0.1, -0.05);
    parent.add(wreck);
  }

  private addCityPark(parent: Group, span: number): void {
    const lakeX = 0;
    const lakeZ = span * 0.04;
    const lakeR = span * 0.15;

    const shore = flatDisc(lakeR * 1.22, this.groundMats.sand);
    shore.position.set(lakeX, 0.03, lakeZ);
    parent.add(shore);
    const deep = flatDisc(lakeR, this.streamDeepMat);
    deep.position.set(lakeX, 0.04, lakeZ);
    parent.add(deep);
    const water = flatDisc(lakeR * 0.9, this.streamMat);
    water.position.set(lakeX, 0.055, lakeZ);
    parent.add(water);
    const gloss = flatDisc(lakeR * 0.42, this.streamMat);
    gloss.position.set(lakeX - lakeR * 0.18, 0.06, lakeZ + lakeR * 0.12);
    parent.add(gloss);

    const path = new Mesh(
      new RingGeometry(lakeR * 1.28, lakeR * 1.58, 40),
      this.groundMats.pavement,
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(lakeX, 0.035, lakeZ);
    path.receiveShadow = organicProps;
    parent.add(path);

    const approach = new Mesh(
      new BoxGeometry(span * 0.14, 0.04, span * 0.22),
      this.groundMats.pavement,
    );
    approach.position.set(0, 0.03, lakeZ + lakeR * 1.55);
    approach.receiveShadow = organicProps;
    parent.add(approach);

    const rim = span * 0.4;
    const trees: { kind: TreeKind; x: number; z: number; scale: number }[] = [
      { kind: "willow", x: -rim * 0.35, z: lakeZ + lakeR * 0.95, scale: 1.35 },
      { kind: "oak", x: rim * 0.55, z: lakeZ + lakeR * 0.7, scale: 1.45 },
      { kind: "birch", x: -rim * 0.7, z: lakeZ - lakeR * 0.15, scale: 1.25 },
      { kind: "oak", x: rim * 0.72, z: lakeZ - lakeR * 0.35, scale: 1.5 },
      { kind: "autumn", x: -rim * 0.55, z: rim * 0.55, scale: 1.3 },
      { kind: "pine", x: rim * 0.48, z: rim * 0.62, scale: 1.55 },
      { kind: "birch", x: -rim * 0.82, z: rim * 0.15, scale: 1.15 },
      { kind: "oak", x: rim * 0.88, z: rim * 0.08, scale: 1.35 },
      { kind: "autumn", x: -rim * 0.78, z: -rim * 0.55, scale: 1.2 },
      { kind: "pine", x: rim * 0.8, z: -rim * 0.52, scale: 1.4 },
    ];
    for (const tree of trees) {
      parent.add(makeTree(tree.kind, tree.x, tree.z, tree.scale, this.treeMats));
    }

    const benches: { x: number; z: number; facing: number }[] = [
      { x: -lakeR * 1.45, z: lakeZ + lakeR * 0.15, facing: Math.PI * 0.5 },
      { x: lakeR * 1.45, z: lakeZ - lakeR * 0.1, facing: -Math.PI * 0.5 },
      { x: -lakeR * 0.35, z: lakeZ + lakeR * 1.45, facing: Math.PI },
      { x: lakeR * 0.55, z: lakeZ + lakeR * 1.4, facing: Math.PI * 1.1 },
    ];
    for (const bench of benches) {
      parent.add(makeBench(bench.x, bench.z, bench.facing, this.treeMats.trunk, this.groundMats.plaster));
    }

    const unit = span * 0.12;
    const towers: {
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      style: "glass" | "brick" | "stone";
      stepped?: boolean;
    }[] = [
      { x: -2.8, z: 2.2, w: 1.2, d: 1.1, h: 1.55, style: "brick" },
      { x: 2.7, z: 2.0, w: 1.15, d: 1.05, h: 1.7, style: "glass" },
      { x: -2.9, z: -1.5, w: 1.1, d: 1.0, h: 1.35, style: "stone" },
      { x: 2.85, z: -1.65, w: 1.2, d: 1.1, h: 1.85, style: "brick", stepped: true },
    ];
    for (const tower of towers) {
      parent.add(
        this.makeCityTower(
          tower.x * unit,
          tower.z * unit,
          tower.w * unit,
          tower.d * unit,
          tower.h,
          tower.style,
          tower.stepped === true,
        ),
      );
    }

    for (const [x, z] of [
      [-1.35, 1.2],
      [1.35, 1.15],
      [-1.5, -0.85],
      [1.45, -0.9],
    ] as const) {
      parent.add(makeStreetLamp(x * unit, z * unit, this.groundMats.buildingLit, this.groundMats.lamp));
    }

    const count = Math.round(40 + span * 2.2);
    const keepOut = lakeR * 1.7;
    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2.399) % (Math.PI * 2);
      const radius = (0.14 + ((i * 17) % 100) / 100 * 0.78) * span * 0.46;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x - lakeX, z - lakeZ) < keepOut) continue;
      const mat = this.flowerMats[i % this.flowerMats.length];
      if (!mat) continue;
      const bloom = new Group();
      const stem = new Mesh(new BoxGeometry(0.03, 0.12, 0.03), this.groundMats.grassDark);
      stem.position.y = 0.06;
      const flower = new Mesh(facet(new SphereGeometry(0.07 + (i % 3) * 0.015, 5, 4)), mat);
      flower.position.y = 0.14;
      flower.userData.baseY = 0.14;
      bloom.add(stem, flower);
      bloom.position.set(x, 0, z);
      parent.add(bloom);
      this.meadowFlowers.push(flower);
    }
  }

  private makeCityTower(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    style: "glass" | "brick" | "stone",
    stepped: boolean,
  ): Group {
    const tower = new Group();
    tower.position.set(x, 0, z);
    const bodyMat =
      style === "glass"
        ? this.groundMats.buildingGlass
        : style === "brick"
          ? this.groundMats.buildingBrick
          : this.groundMats.building;
    const podium = new Mesh(new BoxGeometry(w * 1.12, 0.28, d * 1.12), this.groundMats.buildingLit);
    podium.position.y = 0.14;
    const body = new Mesh(new BoxGeometry(w, h, d), bodyMat);
    body.position.y = 0.28 + h / 2;
    tower.add(podium, body);

    if (style !== "glass") {
      const awning = new Mesh(new BoxGeometry(w * 0.7, 0.06, 0.18), this.groundMats.awning);
      awning.position.set(0, 0.42, d * 0.55);
      tower.add(awning);
      const door = new Mesh(new BoxGeometry(0.18, 0.28, 0.06), this.groundMats.wreckDark);
      door.position.set(0, 0.28, d * 0.56);
      tower.add(door);
    }

    const floors = Math.max(3, Math.floor(h / 0.38));
    const cols = Math.max(2, Math.floor(w / 0.28));
    for (let row = 0; row < floors; row += 1) {
      const wy = 0.55 + row * (h * 0.75) / Math.max(1, floors - 1);
      for (let col = 0; col < cols; col += 1) {
        const wx = -w * 0.35 + (col / Math.max(1, cols - 1)) * w * 0.7;
        const front = new Mesh(new BoxGeometry(0.1, 0.1, 0.04), this.groundMats.window);
        front.position.set(wx, wy, d * 0.51);
        const back = front.clone();
        back.position.z = -d * 0.51;
        tower.add(front, back);
      }
      if (row % 2 === 0) {
        for (let col = 0; col < cols; col += 1) {
          const wz = -d * 0.35 + (col / Math.max(1, cols - 1)) * d * 0.7;
          const side = new Mesh(new BoxGeometry(0.04, 0.1, 0.1), this.groundMats.window);
          side.position.set(w * 0.51, wy, wz);
          tower.add(side);
        }
      }
    }

    if (stepped) {
      const mid = new Mesh(new BoxGeometry(w * 0.72, h * 0.28, d * 0.72), bodyMat);
      mid.position.y = 0.28 + h + h * 0.14;
      const top = new Mesh(new BoxGeometry(w * 0.45, h * 0.22, d * 0.45), this.groundMats.buildingLit);
      top.position.y = mid.position.y + h * 0.22;
      tower.add(mid, top);
      const mast = new Mesh(new BoxGeometry(0.06, 0.35, 0.06), this.groundMats.buildingLit);
      mast.position.y = top.position.y + 0.28;
      tower.add(mast);
    } else {
      const cap = new Mesh(new BoxGeometry(w * 1.06, 0.12, d * 1.06), this.groundMats.buildingLit);
      cap.position.y = 0.28 + h + 0.06;
      tower.add(cap);
      if (style === "brick") {
        const tank = new Mesh(new BoxGeometry(0.28, 0.2, 0.28), this.groundMats.pavementDark);
        tank.position.set(w * 0.15, cap.position.y + 0.16, -d * 0.1);
        tower.add(tank);
      }
    }
    return tower;
  }

  private addVillage(parent: Group, span: number): void {
    const rim = span * 0.34;
    const houses = [
      { x: -0.75, z: 0.35, s: 1.1 },
      { x: -0.25, z: 0.55, s: 0.95 },
      { x: 0.55, z: 0.4, s: 1.2 },
      { x: -0.55, z: -0.5, s: 1.0 },
      { x: 0.35, z: -0.55, s: 1.15 },
    ];
    for (const house of houses) {
      parent.add(makeCottage(house.x * rim, house.z * rim, house.s, {
        plaster: this.groundMats.plaster,
        roof: this.groundMats.roof,
        trunk: this.treeMats.trunk,
        window: this.groundMats.window,
      }));
    }
    parent.add(makeTree("oak", rim * 0.8, rim * -0.15, 1.3, this.treeMats));
    parent.add(makeTree("pine", rim * -0.85, rim * -0.2, 1.5, this.treeMats));
  }

  private addBonfire(parent: Group): void {
    const pit = new Mesh(new BoxGeometry(0.55, 0.08, 0.55), this.groundMats.cobbleDark);
    pit.position.set(0, 0.04, 0);
    parent.add(pit);
    for (const [x, z] of [[-0.16, 0.1], [0.14, 0.12], [-0.08, -0.14], [0.12, -0.1]] as const) {
      const log = new Mesh(new BoxGeometry(0.28, 0.08, 0.08), this.treeMats.trunk);
      log.position.set(x, 0.1, z);
      log.rotation.y = x + z;
      parent.add(log);
    }
    const core = new Mesh(new BoxGeometry(0.16, 0.28, 0.16), this.groundMats.fireCore);
    core.position.set(0, 0.28, 0);
    const flameA = new Mesh(new BoxGeometry(0.2, 0.34, 0.12), this.groundMats.fire);
    flameA.position.set(0.04, 0.36, 0.02);
    const flameB = new Mesh(new BoxGeometry(0.12, 0.28, 0.18), this.groundMats.fire);
    flameB.position.set(-0.05, 0.34, -0.03);
    const ember = new Mesh(new BoxGeometry(0.22, 0.08, 0.22), this.groundMats.ember);
    ember.position.set(0, 0.16, 0);
    parent.add(core, flameA, flameB, ember);
    this.meadowFlames.push(core, flameA, flameB);
    const light = new PointLight(token("--maze-fire"), 2.6, 8, 2);
    light.position.set(0, 0.7, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addAnimals(
    parent: Group,
    span: number,
    scene: WinSceneKind,
    stream: CatmullRomCurve3 | null,
  ): void {
    const rim = span * 0.32;
    const kinds = SCENE_ANIMALS[scene];
    // Beach critters stay on the shore / dry sand, not mid-ocean.
    const places = scene === "beach"
      ? [
        { x: -rim * 0.75, z: rim * 0.35, facing: 0.4 },
        { x: rim * 0.7, z: rim * 0.25, facing: -0.7 },
        { x: rim * 0.15, z: rim * 0.05, facing: 2.2 },
        { x: -rim * 0.25, z: rim * 0.15, facing: -1.9 },
      ]
      : [
        { x: -rim * 0.7, z: rim * 0.55, facing: 0.6 },
        { x: rim * 0.65, z: rim * 0.35, facing: -0.9 },
        { x: rim * 0.15, z: -rim * 0.7, facing: 2.4 },
        { x: -rim * 0.35, z: -rim * 0.45, facing: -2.1 },
      ];
    for (const [index, place] of places.entries()) {
      const kind = kinds[index];
      if (!kind) continue;
      if (stream && nearStream(place.x, place.z, stream, 0.7)) {
        place.z += place.z >= 0 ? 1.1 : -1.1;
      }
      const animal = makeAnimal(kind, this.animalMats);
      const floatY = swimHeight(kind);
      const scale = animalScale(kind);
      animal.scale = scale;
      animal.baseY = floatY;
      animal.group.scale.setScalar(scale);
      animal.group.position.set(place.x, floatY, place.z);
      animal.group.rotation.y = place.facing;
      animal.facing = place.facing;
      parent.add(animal.group);
      this.meadowAnimals.push(animal);
    }
  }

  private addRibbon(
    parent: Group,
    stream: CatmullRomCurve3,
    bedMat: MeshToonMaterial,
    waterMat: MeshToonMaterial,
  ): void {
    const bed = new Mesh(new TubeGeometry(stream, 72, 0.38, 8, false), bedMat);
    bed.position.y = -0.02;
    bed.scale.y = 0.22;
    const water = new Mesh(new TubeGeometry(stream, 72, 0.3, 8, false), waterMat);
    water.position.y = 0.03;
    water.scale.y = 0.18;
    parent.add(bed, water);
  }

  private addDiscoFloor(parent: Group, span: number): void {
    const cols = 10;
    const rows = 10;
    const tile = span / cols;
    const origin = -span * 0.5 + tile * 0.5;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const mat = this.discoMats[(row + col) % this.discoMats.length]!;
        const cell = new Mesh(new BoxGeometry(tile * 0.92, 0.08, tile * 0.92), mat);
        cell.position.set(origin + col * tile, 0.05, origin + row * tile);
        parent.add(cell);
        this.meadowDisco.push({
          mesh: cell,
          phase: row * 0.55 + col * 0.35,
          row,
          col,
        });
      }
    }

    const ball = new Group();
    ball.position.set(0, 2.1, 0);
    voxel(ball, this.groundMats.buildingLit, 0.18, 0.18, 0.18, 0, 0, 0);
    for (let i = 0; i < 8; i += 1) {
      const a = i * (Math.PI / 4);
      voxel(
        ball,
        this.discoMats[i % this.discoMats.length]!,
        0.05,
        0.05,
        0.05,
        Math.cos(a) * 0.22,
        Math.sin(a * 2) * 0.08,
        Math.sin(a) * 0.22,
      );
    }
    parent.add(ball);
    this.meadowDiscoBall = ball;

    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) {
      const speaker = new Group();
      speaker.position.set(x * span * 0.28, 0, z * span * 0.28);
      voxel(speaker, this.groundMats.spaceDark, 0.18, 0.28, 0.12, 0, 0.3, 0);
      voxel(speaker, this.groundMats.discoFloor, 0.1, 0.1, 0.04, 0, 0.34, 0.12);
      voxel(speaker, this.discoMats[1]!, 0.06, 0.06, 0.02, 0, 0.34, 0.16);
      parent.add(speaker);
    }

    const light = new PointLight(token("--maze-disco-0"), 3.4, 14, 2);
    light.position.set(0, 2.4, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  /**
   * Beach as a coast looking out to sea: sand under the camera / WIN,
   * ocean filling the far half out to the horizon behind the sign.
   */
  private addBeachTerrain(parent: Group, span: number): void {
    const ground = this.meadowGroundSpan(span);
    const half = ground * 0.5;
    // Waterline just behind WIN so the sea reads as the backdrop, not a pool.
    const shoreZ = -span * 0.5;

    // Dry sand from the camera (+Z) up to the waterline.
    const sandDepth = half - shoreZ;
    const sandPad = new Mesh(new BoxGeometry(ground, 0.22, sandDepth), this.groundMats.sandDark);
    sandPad.position.set(0, -0.11, shoreZ + sandDepth * 0.5);
    sandPad.receiveShadow = organicProps;
    parent.add(sandPad);

    const floorMat = this.floorMats.beach;
    const tilesZ = Math.max(4, Math.round(sandDepth / 2.4));
    const tilesX = Math.max(4, Math.round(ground / 2.4));
    if (floorMat.map) {
      floorMat.map.repeat.set(tilesX, tilesZ);
      floorMat.map.needsUpdate = true;
    }
    const carpet = new Mesh(new PlaneGeometry(ground, sandDepth), floorMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.01, shoreZ + sandDepth * 0.5);
    carpet.receiveShadow = organicProps;
    parent.add(carpet);

    // Sea from the waterline out past the far clip (−Z horizon).
    const oceanDepth = half + shoreZ;
    const deep = new Mesh(new BoxGeometry(ground, 0.2, oceanDepth), this.oceanDeepMat);
    deep.position.set(0, -0.08, shoreZ - oceanDepth * 0.5);
    deep.receiveShadow = organicProps;
    parent.add(deep);

    // Thin nearshore tint — keeps the sea one body instead of stacked pool bands.
    const shallows = new Mesh(new BoxGeometry(ground, 0.1, span * 0.2), this.oceanMat);
    shallows.position.set(0, -0.03, shoreZ - span * 0.08);
    shallows.receiveShadow = organicProps;
    parent.add(shallows);

    // Wet sand tide line on the beach edge.
    const wet = new Mesh(new BoxGeometry(ground, 0.05, span * 0.1), this.groundMats.sandDark);
    wet.position.set(0, 0.02, shoreZ + span * 0.04);
    wet.receiveShadow = organicProps;
    parent.add(wet);
  }

  private addRainforest(parent: Group, span: number, river: CatmullRomCurve3): void {
    const kinds: TreeKind[] = ["oak", "pine", "willow", "oak", "birch", "autumn", "pine", "willow"];
    const lush: TreeMats = {
      ...this.treeMats,
      leaf: this.groundMats.canopy,
      leafLit: this.groundMats.canopyLit,
      pine: this.groundMats.canopy,
      pineLit: this.groundMats.canopyBright,
    };
    const vivid: TreeMats[] = [
      {
        ...this.treeMats,
        leaf: this.groundMats.orchid,
        leafLit: this.groundMats.bromeliad,
        pine: this.groundMats.orchid,
        pineLit: this.groundMats.canopyBright,
        autumn: this.groundMats.bromeliad,
        autumnLit: this.groundMats.orchid,
      },
      {
        ...this.treeMats,
        leaf: this.groundMats.seabedLit,
        leafLit: this.groundMats.anemone,
        pine: this.groundMats.seabedLit,
        pineLit: this.groundMats.canopyBright,
        autumn: this.groundMats.anemone,
        autumnLit: this.groundMats.seabedLit,
      },
      {
        ...this.treeMats,
        leaf: this.groundMats.bromeliad,
        leafLit: this.groundMats.coralLit,
        pine: this.groundMats.bromeliad,
        pineLit: this.groundMats.coral,
        autumn: this.groundMats.coral,
        autumnLit: this.groundMats.coralLit,
      },
      {
        ...this.treeMats,
        leaf: this.groundMats.lavender,
        leafLit: this.groundMats.orchid,
        pine: this.groundMats.lavender,
        pineLit: this.groundMats.bromeliad,
        autumn: this.groundMats.orchid,
        autumnLit: this.groundMats.lavender,
      },
      {
        ...this.treeMats,
        leaf: this.groundMats.canopyBright,
        leafLit: this.treeMats.autumnLit,
        pine: this.groundMats.canopyLit,
        pineLit: this.groundMats.canopyBright,
        autumn: this.groundMats.canopyBright,
        autumnLit: this.treeMats.autumnLit,
      },
    ];

    const cols = 7;
    const rows = 7;
    const xMin = -span * 0.42;
    const xMax = span * 0.42;
    const zMin = -span * 0.42;
    const zMax = span * 0.42;
    let treeIndex = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = xMin + (c / (cols - 1)) * (xMax - xMin);
        const z = zMin + (r / (rows - 1)) * (zMax - zMin);
        if (nearStream(x, z, river, 0.85)) continue;
        const kind = kinds[treeIndex % kinds.length]!;
        const scale = 1.2 + ((c + r) % 3) * 0.14 + (treeIndex % 2) * 0.08;
        const fancy = treeIndex % 5 === 0 || treeIndex % 7 === 3;
        const mats = fancy ? vivid[treeIndex % vivid.length]! : lush;
        parent.add(makeTree(kind, x, z, scale, mats));
        treeIndex += 1;
      }
    }

    for (let i = 0; i < 8; i += 1) {
      const c = 1 + (i % 5);
      const r = 1 + Math.floor(i / 5) * 3 + (i % 2);
      const x = xMin + (c / (cols - 1)) * (xMax - xMin) + span * 0.035;
      const z = zMin + (r / (rows - 1)) * (zMax - zMin) + span * 0.025;
      if (nearStream(x, z, river, 0.7)) continue;
      const leaf = i % 2 === 0 ? this.palmMat : this.groundMats.canopyBright;
      const lit = i % 3 === 0 ? this.groundMats.orchid : this.palmLitMat;
      parent.add(makePalm(x, z, 1.2 + (i % 4) * 0.12, this.treeMats.trunk, leaf, lit));
    }

    for (let i = 0; i < 10; i += 1) {
      const c = i % 6;
      const r = 1 + Math.floor(i / 6) * 4;
      const x = xMin + ((c + 0.5) / (cols - 1)) * (xMax - xMin);
      const z = zMin + ((r + 0.5) / (rows - 1)) * (zMax - zMin);
      if (nearStream(x, z, river, 0.65)) continue;
      const vine = new Mesh(
        new BoxGeometry(0.04, 0.7 + (i % 4) * 0.15, 0.04),
        this.groundMats.vine,
      );
      vine.position.set(x, 0.45, z);
      vine.userData.baseY = vine.position.y;
      vine.userData.spin = false;
      parent.add(vine);
      this.meadowFlowers.push(vine);
      const bloom = new Mesh(
        new BoxGeometry(0.08, 0.08, 0.08),
        i % 2 === 0 ? this.groundMats.bromeliad : this.groundMats.orchid,
      );
      bloom.position.set(x + 0.06, 0.55 + (i % 3) * 0.12, z);
      bloom.userData.baseY = bloom.position.y;
      parent.add(bloom);
      this.meadowFlowers.push(bloom);
    }

    for (let i = 0; i < 8; i += 1) {
      const c = 2 + (i % 4);
      const r = 2 + Math.floor(i / 4) * 2;
      const x = xMin + (c / (cols - 1)) * (xMax - xMin) + span * 0.03;
      const z = zMin + (r / (rows - 1)) * (zMax - zMin) - span * 0.02;
      if (nearStream(x, z, river, 0.6)) continue;
      parent.add(makeMushroomPatch(x, z, 0.75 + (i % 3) * 0.15, {
        stem: this.groundMats.mushroom,
        cap: i % 3 === 0 ? this.groundMats.orchid : i % 3 === 1 ? this.groundMats.bromeliad : this.groundMats.canopyBright,
        spot: this.groundMats.mushroomSpot,
      }));
    }

    this.addScatter(parent, span, river, this.groundMats.canopy, true);
  }

  private addFunForest(parent: Group, span: number, stream: CatmullRomCurve3): void {
    const kinds: TreeKind[] = ["oak", "pine", "birch", "willow", "autumn", "pine", "oak", "birch"];
    const cols = 7;
    const rows = 7;
    const xMin = -span * 0.42;
    const xMax = span * 0.42;
    const zMin = -span * 0.42;
    const zMax = span * 0.42;
    let treeIndex = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = xMin + (c / (cols - 1)) * (xMax - xMin);
        const z = zMin + (r / (rows - 1)) * (zMax - zMin);
        if (nearStream(x, z, stream, 0.85)) continue;
        const kind = kinds[treeIndex % kinds.length]!;
        const scale = 1.15 + ((c + r) % 3) * 0.12;
        parent.add(makeTree(kind, x, z, scale, this.treeMats));
        treeIndex += 1;
      }
    }

    for (let i = 0; i < 8; i += 1) {
      const c = 1 + (i % 5);
      const r = 1 + Math.floor(i / 5) * 3 + (i % 2);
      const x = xMin + (c / (cols - 1)) * (xMax - xMin) + span * 0.04;
      const z = zMin + (r / (rows - 1)) * (zMax - zMin) + span * 0.03;
      if (nearStream(x, z, stream, 0.65)) continue;
      parent.add(makeMushroomPatch(x, z, 0.85 + (i % 3) * 0.2, {
        stem: this.groundMats.mushroom,
        cap: i % 2 === 0 ? this.groundMats.mushroomCap : this.groundMats.coral,
        spot: this.groundMats.mushroomSpot,
      }));
    }

    for (let i = 0; i < 5; i += 1) {
      const c = i + 1;
      const r = rows - 2;
      const x = xMin + (c / (cols - 1)) * (xMax - xMin);
      const z = zMin + (r / (rows - 1)) * (zMax - zMin) + span * 0.05;
      if (nearStream(x, z, stream, 0.7)) continue;
      const log = new Mesh(
        new BoxGeometry(0.55 + (i % 3) * 0.12, 0.12, 0.14),
        this.treeMats.trunk,
      );
      log.position.set(x, 0.08, z);
      log.rotation.y = i * 0.55;
      parent.add(log);
      const moss = new Mesh(new BoxGeometry(0.2, 0.04, 0.1), this.groundMats.mossLit);
      moss.position.set(x + 0.08, 0.16, z);
      parent.add(moss);
    }

    for (let i = 0; i < 12; i += 1) {
      const c = i % 6;
      const r = 1 + Math.floor(i / 6) * 4;
      const bush = new Group();
      voxel(bush, this.groundMats.moss, 0.12, 0.1, 0.12, 0, 0.12, 0);
      voxel(bush, this.groundMats.mossLit, 0.1, 0.08, 0.1, 0.08, 0.18, 0.04);
      voxel(bush, this.treeMats.leaf, 0.08, 0.08, 0.08, -0.06, 0.2, -0.04);
      const x = xMin + ((c + 0.5) / (cols - 1)) * (xMax - xMin);
      const z = zMin + ((r + 0.5) / (rows - 1)) * (zMax - zMin);
      bush.position.set(x, 0, z);
      if (!nearStream(bush.position.x, bush.position.z, stream, 0.6)) parent.add(bush);
    }

    this.addScatter(parent, span, stream, this.groundMats.moss, true);
  }

  private addMixedTrees(parent: Group, span: number, stream: CatmullRomCurve3): void {
    const rim = span * 0.42;
    const spots: { kind: TreeKind; x: number; z: number; scale: number }[] = [
      { kind: "oak", x: -rim * 0.88, z: rim * 0.18, scale: 1.45 },
      { kind: "pine", x: -rim * 0.62, z: -rim * 0.72, scale: 1.7 },
      { kind: "pine", x: rim * 0.78, z: -rim * 0.58, scale: 1.9 },
      { kind: "birch", x: rim * 0.92, z: rim * 0.4, scale: 1.35 },
      { kind: "willow", x: rim * 0.22, z: rim * 0.88, scale: 1.25 },
      { kind: "oak", x: -rim * 0.2, z: rim * 0.78, scale: 1.6 },
      { kind: "autumn", x: -rim * 0.78, z: rim * 0.62, scale: 1.3 },
      { kind: "pine", x: rim * 0.55, z: rim * 0.7, scale: 1.55 },
      { kind: "birch", x: -rim * 0.4, z: -rim * 0.85, scale: 1.2 },
      { kind: "autumn", x: rim * 0.35, z: -rim * 0.82, scale: 1.4 },
    ];
    for (const spot of spots) {
      if (nearStream(spot.x, spot.z, stream, 0.9)) continue;
      parent.add(makeTree(spot.kind, spot.x, spot.z, spot.scale, this.treeMats));
    }
  }

  private addPineGrove(parent: Group, span: number): void {
    const rim = span * 0.4;
    const spots = [
      [-0.85, 0.2, 1.8], [-0.55, -0.7, 2.1], [0.75, -0.5, 1.9],
      [0.9, 0.35, 1.6], [0.15, 0.8, 2.0], [-0.2, 0.7, 1.7],
      [0.45, 0.65, 1.85], [-0.7, 0.55, 1.55],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makeTree("pine", rim * nx, rim * nz, scale, this.treeMats));
    }
  }

  private addTwilightTrees(parent: Group, span: number): void {
    const rim = span * 0.4;
    const spots: { kind: TreeKind; x: number; z: number; scale: number }[] = [
      { kind: "oak", x: -rim * 0.8, z: rim * 0.25, scale: 1.7 },
      { kind: "willow", x: rim * 0.7, z: -rim * 0.4, scale: 1.5 },
      { kind: "oak", x: rim * 0.85, z: rim * 0.5, scale: 1.8 },
      { kind: "birch", x: -rim * 0.3, z: -rim * 0.75, scale: 1.4 },
      { kind: "willow", x: -rim * 0.65, z: rim * 0.65, scale: 1.35 },
      { kind: "oak", x: rim * 0.25, z: rim * 0.8, scale: 1.6 },
    ];
    for (const spot of spots) {
      parent.add(makeTree(spot.kind, spot.x, spot.z, spot.scale, this.treeMats));
    }
  }

  private addOrchardRows(parent: Group, span: number): void {
    const cols = 4;
    const rows = 3;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -span * 0.32 + c * (span * 0.64) / (cols - 1);
        const z = -span * 0.28 + r * (span * 0.5) / (rows - 1);
        const kind: TreeKind = (c + r) % 2 === 0 ? "oak" : "autumn";
        parent.add(makeTree(kind, x, z, 1.15 + ((c + r) % 3) * 0.12, this.treeMats));
      }
    }
  }

  private addPalms(parent: Group, span: number): void {
    // Palms on dry sand near the waterline / WIN — not out in the sea.
    const rim = span * 0.38;
    const spots = [
      [-0.78, -0.05, 1.5], [-0.42, 0.12, 1.3], [0.55, -0.02, 1.55],
      [0.82, 0.18, 1.25], [-0.12, 0.28, 1.4], [0.22, 0.08, 1.15],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makePalm(rim * nx, rim * nz, scale, this.treeMats.trunk, this.palmMat, this.palmLitMat));
    }
  }

  private addCacti(parent: Group, span: number): void {
    const rim = span * 0.36;
    const spots = [
      [-0.7, 0.4, 1.2], [0.55, -0.5, 1.5], [-0.2, -0.65, 1.0],
      [0.75, 0.35, 1.35], [-0.55, -0.25, 0.9], [0.15, 0.7, 1.15],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makeCactus(rim * nx, rim * nz, scale, this.cactusMat, this.cactusLitMat));
    }
  }

  private addRocks(parent: Group, span: number): void {
    const mat = this.groundMats.duneDark;
    const rim = span * 0.3;
    for (let i = 0; i < 8; i += 1) {
      const rock = new Mesh(
        new BoxGeometry(0.18 + (i % 3) * 0.08, 0.1 + (i % 2) * 0.08, 0.16 + (i % 4) * 0.05),
        mat,
      );
      const a = i * 2.3;
      rock.position.set(Math.cos(a) * rim * 0.9, 0.06, Math.sin(a) * rim * 0.7);
      parent.add(rock);
    }
  }

  private addDrifts(parent: Group, span: number): void {
    const mat = this.groundMats.snowShade;
    for (let i = 0; i < 6; i += 1) {
      const drift = new Mesh(new BoxGeometry(span * 0.18, 0.1, span * 0.12), mat);
      const a = i * 1.1;
      drift.position.set(Math.cos(a) * span * 0.28, 0.02, Math.sin(a) * span * 0.25);
      parent.add(drift);
    }
  }

  /** Shells and pebbles on the dry beach (+Z of the waterline), clear of the sea. */
  private addBeachScatter(parent: Group, span: number): void {
    const count = Math.round(28 + span * 1.6);
    for (let i = 0; i < count; i += 1) {
      const x = ((i * 37) % 100) / 100 * span * 0.9 - span * 0.45;
      const z = span * (0.02 + ((i * 19) % 100) / 100 * 0.42);
      const shell = new Mesh(
        new BoxGeometry(0.08, 0.04, 0.06),
        this.flowerMats[i % this.flowerMats.length],
      );
      shell.position.set(x, 0.04, z);
      shell.rotation.y = (i * 0.7) % Math.PI;
      parent.add(shell);
    }
  }

  private addScatter(
    parent: Group,
    span: number,
    stream: CatmullRomCurve3 | null,
    stemMat: MeshToonMaterial,
    flowers: boolean,
  ): void {
    const count = Math.round(48 + span * 2.4);
    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2.399) % (Math.PI * 2);
      const radius = (0.12 + ((i * 17) % 100) / 100 * 0.78) * span * 0.46;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (stream && nearStream(x, z, stream, 0.55)) continue;
      if (!flowers) {
        const shell = new Mesh(
          new BoxGeometry(0.08, 0.04, 0.06),
          this.flowerMats[i % this.flowerMats.length],
        );
        shell.position.set(x, 0.04, z);
        parent.add(shell);
        continue;
      }
      const mat = this.flowerMats[i % this.flowerMats.length];
      if (!mat) continue;
      const bloom = new Group();
      const stem = new Mesh(new BoxGeometry(0.03, 0.12, 0.03), stemMat);
      stem.position.y = 0.06;
      const flower = new Mesh(facet(new SphereGeometry(0.07 + (i % 3) * 0.015, 5, 4)), mat);
      flower.position.y = 0.14;
      flower.userData.baseY = 0.14;
      bloom.add(stem, flower);
      bloom.position.set(x, 0, z);
      parent.add(bloom);
      this.meadowFlowers.push(flower);
    }
  }
}
