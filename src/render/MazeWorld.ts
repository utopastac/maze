import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Quaternion,
  type Texture,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BALL_R,
  CELL,
  MEADOW_DROP,
  STORY,
  type MazeLayout,
  type Piece,
  type PieceKind,
  type TowerLayout,
} from "../core/layout.ts";
import { DIRECTION_VECTOR, SWITCH_COLOR_COUNT, WARP_COLOR_COUNT } from "../core/maze.ts";
import {
  resolveFloorSky,
  skyThemeAt,
  type PlaySettings,
} from "../core/playSettings.ts";
import type { Pose } from "../core/simulation.ts";
import { DEFAULT_FLOOR_THEME, type FloorThemeId } from "../core/theme.ts";
import {
  makeCoinGeo,
  makeCoinMaterial,
  makeHeartGeo,
  makeHeartIcon,
  makeHeartMaterials,
} from "./collectibleMeshes.ts";
import {
  EnterPlayController,
  type EnterPlayKind,
} from "./enterPlayCamera.ts";
import {
  ENTER_PLAY_SKY_ZOOM_DOOR,
  HOME_BACKDROP_SPAN,
  HOME_TOWER_H,
} from "./homeEnterConstants.ts";
import {
  addBarrenRocks,
  addFreePlayTrapdoor,
  addHomeShacks,
  addOminousTower,
  type HomeTowerContext,
} from "./homeTower.ts";
import { makeThemeSurfaces, type ThemeSurfaces } from "./themeMaterials.ts";
import { easeOutCubic } from "./easing.ts";
import {
  MEADOW_CAM_SECS,
  PlayCameraGlance,
  computePlayOrbitCamera,
  defaultMeadowY,
  placeHomeBackdropCamera,
  placeMeadowWinCamera,
  playAngleFromSettings,
  shownPlayAngle,
  shownPlayOrbit,
} from "./playCamera.ts";
import {
  type PickupBit,
  type Debris,
  type Spark,
  type FireworkBit,
  type RainBit,
} from "./mazeWorldTypes.ts";
import {
  VoidSky,
} from "./voidSky.ts";
import {
  starGeometry,
  wingGeometry,
  ghostGeometry,
  arrowGeometry,
  ramp,
  paintedSteps,
  paintedNormal,
  organicProps,
  setOrganicProps,
  paintRamp,
  makeCrumbleMat,
  makeCrumbleWell,
  makeVoidStarMat,
  crumbleChunks,
  toon,
  glow,
  facet,
  makeGateTopTexture,
  gateSignMaterial,
  token,
} from "./boardMaterials.ts";
import {
  type WinSceneKind,
  WIN_SCENES,
  GALLERY_SCENES,
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
  makeFloorMats,
  makeFailFloorMat,
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

const SHELL_ALPHA = 0.18;
/** Match HUD heart/coin proportions at maze-cell scale. */
const PICKUP_ICON_SCALE = 0.55;
const WARP_GATE_R = 0.3;
const WARP_GATE_H = 0.58;
const WARP_GATE_ALPHA = 0.38;
const SWITCH_CUBE = 0.28;
const SWITCH_CUBE_ALPHA = 0.45;
const EXIT_GATE_R = 0.34;
const EXIT_GATE_H = 0.58;
const EXIT_GATE_ALPHA = 0.4;
/** Content meadow size multiplier (props, signs, camera framing). */
const MEADOW_SPAN_MULT = 2.8;
/**
 * Ground plane vs content span — large enough that win/fail floors reach past
 * the camera far clip in every look direction (no visible pad edge).
 */
const MEADOW_GROUND_MULT = 14;

export type { EnterPlayKind };

export class MazeWorld {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly board = new Group();
  private readonly ball: Mesh;
  private readonly ballBands: [Mesh, Mesh];
  private readonly ballToonMat: MeshToonMaterial;
  private readonly ballSmoothMat: MeshStandardMaterial;
  private readonly bandPixelMat: MeshBasicMaterial;
  private readonly bandSmoothMat: MeshStandardMaterial;
  private ballGeoPixel: BufferGeometry;
  private ballGeoSmooth: BufferGeometry | null = null;
  private bandGeoPixel: BufferGeometry;
  private bandGeoSmooth: BufferGeometry | null = null;
  private ballNormal = false;
  private readonly key: DirectionalLight;
  private readonly materials: Record<PieceKind, MeshToonMaterial>;
  private readonly themeSurfaces: Map<FloorThemeId, ThemeSurfaces>;
  private readonly goalRingMat: MeshToonMaterial;
  private readonly startRingMat: MeshToonMaterial;
  private readonly goalLightColor: string;
  private readonly groundMats: Record<string, MeshToonMaterial>;
  private readonly floorMats: Record<WinSceneKind, MeshToonMaterial>;
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
  private readonly boostMarkMat: MeshToonMaterial;
  private readonly warpMats: MeshToonMaterial[];
  private readonly warpGateMats: MeshToonMaterial[];
  private readonly exitGateMat: MeshToonMaterial;
  private readonly iceMarkMat: MeshToonMaterial;
  private readonly switchCubeMats: MeshToonMaterial[];
  private readonly gateMeshes: Mesh[] = [];
  private readonly oneWayMeshes: Mesh[] = [];
  private readonly smashWalls: Mesh[] = [];
  /** Interior wall meshes (cloned mats) — pulsed translucent while ghost is active. */
  private readonly ghostWalls: Mesh[] = [];
  private ghostWallsLit = false;
  private readonly crumbleMeshes: Mesh[] = [];
  private readonly switchSpins: Mesh[] = [];
  private readonly arrowGeometry: BufferGeometry;
  private readonly heartGeometry: BufferGeometry;
  private readonly coinGeometry: BufferGeometry;
  private readonly starGeometry: BufferGeometry;
  private readonly wingGeometry: BufferGeometry;
  private readonly ghostGeometry: BufferGeometry;
  private readonly sparkGeometry: BufferGeometry;
  private readonly switchCubeGeometry: BufferGeometry;
  private readonly warpGateGeometry: BufferGeometry;
  private readonly exitGateGeometry: BufferGeometry;
  private readonly heartBodyMat: MeshStandardMaterial;
  private readonly heartShadeMat: MeshStandardMaterial;
  private readonly coinMat: MeshStandardMaterial;
  private readonly starMat: MeshToonMaterial;
  private readonly wingMat: MeshToonMaterial;
  private readonly ghostMat: MeshToonMaterial;
  private readonly gateMarkMat: MeshToonMaterial;
  private readonly gateSignGeometry: PlaneGeometry;
  private readonly gateAllowMat: MeshBasicMaterial;
  private readonly gateDenyMat: MeshBasicMaterial;
  private readonly gateOkWallMat: MeshToonMaterial;
  private readonly gateNoWallMat: MeshToonMaterial;
  private readonly gateEdgeWallMat: MeshToonMaterial;
  private readonly gateTopTextures: Record<NonNullable<Piece["oneWay"]>, CanvasTexture>;
  private readonly coinSparkColors: string[];
  private readonly heartSparkColors: string[];
  private readonly starSparkColors: string[];
  private readonly wingSparkColors: string[];
  private readonly ghostSparkColors: string[];
  private readonly starFlashColors: string[];
  private readonly fireworkColors: string[];
  private readonly ballBaseColor: string;
  private readonly bandBaseColor: string;
  private starFlashing = false;
  private readonly ballAura: Mesh;
  private readonly ballAuraMat: MeshBasicMaterial;
  private readonly hoverAuraColor: string;
  private readonly ghostAuraColor: string;
  private readonly hearts: PickupBit[] = [];
  private readonly coins: PickupBit[] = [];
  private readonly stars: PickupBit[] = [];
  private readonly wings: PickupBit[] = [];
  private readonly ghosts: PickupBit[] = [];
  private readonly warpSpins: Group[] = [];
  private readonly debris: Debris[] = [];
  private readonly sparks: Spark[] = [];
  private readonly fireworks: FireworkBit[] = [];
  private fireworkCooldown = 0;
  private readonly raindrops: RainBit[] = [];
  private rainCooldown = 0;
  private readonly rainGeometry: BufferGeometry;
  private readonly rainColors: string[];
  private readonly floorGroups: (Group | null)[] = [];
  private readonly frames: (Mesh | null)[] = [];
  private readonly goalRings: Mesh[] = [];
  private readonly goalGates: Mesh[] = [];
  private readonly goalLights: PointLight[] = [];
  private exitBreached = false;
  private meadow: Group | null = null;
  private meadowFlowers: Mesh[] = [];
  private meadowAnimals: AnimalBit[] = [];
  private meadowFlames: Object3D[] = [];
  private meadowDisco: { mesh: Mesh; phase: number; row: number; col: number }[] = [];
  private meadowDiscoBall: Group | null = null;
  private readonly discoMats: MeshToonMaterial[];
  private meadowLight: PointLight | null = null;
  private meadowWinLetters: Group | null = null;
  private escaped = false;
  private failed = false;
  private homeBackdrop = false;
  private homeOrbit = 0;
  private homeView: "menu" | "tower" = "menu";
  private homeViewBlend = 1;
  private readonly homeViewFromEye = new Vector3();
  private readonly homeViewFromLook = new Vector3();
  private readonly homeViewEye = new Vector3();
  private readonly homeViewLook = new Vector3();
  private homeTowerFloorMat: MeshToonMaterial | null = null;
  private homeTowerWallMat: MeshToonMaterial | null = null;
  private homeDoorRoot: Group | null = null;
  /** Meadow floor trapdoor — free-play zooms down into this hatch. */
  private homeFreeDoorRoot: Group | null = null;
  private readonly enterCtl: EnterPlayController;
  private lightningCooldown = 1.2;
  private lightningFlash = 0;
  private lightningLight: PointLight | null = null;
  private lightningBolt: Group | null = null;
  private readonly hemiLight: HemisphereLight;
  private readonly ambientLight: AmbientLight;
  private failFloorMat: MeshToonMaterial;
  private winSceneIndex = 0;
  private tower: TowerLayout | null = null;
  private settings: PlaySettings | null = null;
  private aspect = 1;
  private focusY = 0;
  private lastTime = 0;
  private story = STORY;
  private raised = 0;
  private readonly playGlance = new PlayCameraGlance();
  private meadowCamT = 0;
  private meadowCamLive = false;
  private readonly meadowCamFromPos = new Vector3();
  private readonly meadowCamFromLook = new Vector3();
  private readonly meadowCamEye = new Vector3();
  private readonly meadowCamLook = new Vector3();
  private readonly meadowCamLookBlend = new Vector3();
  private readonly reduceMotion: boolean;
  private readonly voidSky = new VoidSky();
  private readonly voidStarMat: ShaderMaterial;
  private readonly voidCamDir = new Vector3();
  private readonly voidResolution = new Vector2(1, 1);

  constructor() {
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new PerspectiveCamera(30, 1, 0.1, 140);
    this.enterCtl = new EnterPlayController({
      camera: this.camera,
      scene: this.scene,
      voidSky: this.voidSky,
      computePlayCamera: (eye, look) => this.computePlayCamera(eye, look),
      doorRoot: (kind) => (kind === "free" ? this.homeFreeDoorRoot : this.homeDoorRoot),
      meadowY: () => this.meadow?.position.y ?? -MEADOW_DROP,
      homeOrbit: () => this.homeOrbit,
    });
    this.scene.background = this.voidSky.texture;
    this.scene.add(this.board);
    this.voidStarMat = makeVoidStarMat(this.voidResolution, this.voidCamDir);

    this.materials = {
      floor: toon(token("--maze-floor")),
      boost: toon(token("--maze-boost"), token("--maze-boost"), 0.16),
      warp: toon(token("--maze-warp"), token("--maze-warp"), 0.14),
      ice: toon(token("--maze-ice"), token("--maze-ice-mark"), 0.1),
      crumble: makeCrumbleMat(),
      block: toon(token("--maze-block")),
      switch: toon(token("--maze-switch"), token("--maze-switch-0"), 0.12),
      start: toon(token("--maze-start")),
      goal: toon(token("--maze-goal-floor"), token("--maze-goal"), 0.55),
      wall: toon(token("--maze-wall")),
      grout: toon(token("--maze-grout")),
      frame: toon(token("--maze-frame")),
      pit: toon(token("--maze-pit")),
      void: toon(token("--maze-pit")),
      lip: toon(token("--maze-lip"), token("--maze-lip"), 0.9),
      hatch: toon(token("--maze-hatch"), token("--maze-hatch"), 0.85),
      exit: toon(token("--maze-goal"), token("--maze-goal"), 0.9),
      roof: toon(token("--maze-roof")),
    };
    this.materials.pit.side = DoubleSide;
    this.materials.goal.transparent = true;
    this.materials.goal.opacity = 0.38;
    this.materials.goal.depthWrite = false;
    this.materials.goal.toneMapped = false;
    this.materials.goal.side = DoubleSide;
    this.materials.lip.toneMapped = false;
    this.materials.hatch.toneMapped = false;
    this.materials.exit.toneMapped = false;
    this.themeSurfaces = makeThemeSurfaces(ramp);

    this.goalLightColor = token("--maze-goal");
    this.goalRingMat = glow(this.goalLightColor);
    this.goalRingMat.emissiveIntensity = 0.85;
    this.groundMats = {
      grass: toon(token("--maze-grass")),
      grassDark: toon(token("--maze-grass-dark")),
      sand: toon(token("--maze-sand")),
      sandDark: toon(token("--maze-sand-dark")),
      snow: toon(token("--maze-snow")),
      snowShade: toon(token("--maze-snow-shade")),
      dune: toon(token("--maze-dune")),
      duneDark: toon(token("--maze-dune-dark")),
      lavender: toon(token("--maze-lavender")),
      lavenderDark: toon(token("--maze-lavender-dark")),
      seabed: toon(token("--maze-seabed")),
      seabedDark: toon(token("--maze-seabed-dark")),
      seabedLit: toon(token("--maze-seabed-lit")),
      seabedSand: toon(token("--maze-seabed-sand")),
      pavement: toon(token("--maze-pavement")),
      pavementDark: toon(token("--maze-pavement-dark")),
      cobble: toon(token("--maze-cobble")),
      cobbleDark: toon(token("--maze-cobble-dark")),
      coral: toon(token("--maze-coral")),
      coralLit: toon(token("--maze-coral-lit")),
      anemone: toon(token("--maze-anemone")),
      seaweed: toon(token("--maze-seaweed")),
      building: toon(token("--maze-building")),
      buildingLit: toon(token("--maze-building-lit")),
      buildingBrick: toon(token("--maze-building-brick")),
      buildingBrickOld: toon(token("--maze-building-brick-old")),
      buildingGlass: toon(token("--maze-building-glass")),
      awning: toon(token("--maze-awning")),
      lamp: glow(token("--maze-lamp")),
      window: glow(token("--maze-window")),
      roof: toon(token("--maze-roof")),
      plaster: toon(token("--maze-plaster")),
      wreck: toon(token("--maze-wreck")),
      wreckDark: toon(token("--maze-wreck-dark")),
      fire: glow(token("--maze-fire")),
      fireCore: glow(token("--maze-fire-core")),
      ember: toon(token("--maze-ember")),
      moonDust: toon(token("--maze-moon-dust")),
      moonDustDark: toon(token("--maze-moon-dust-dark")),
      moonRock: toon(token("--maze-moon-rock")),
      venusGround: toon(token("--maze-venus-ground")),
      venusGroundDark: toon(token("--maze-venus-ground-dark")),
      venusRock: toon(token("--maze-venus-rock")),
      sulfur: toon(token("--maze-sulfur")),
      sulfurGlow: glow(token("--maze-sulfur-glow")),
      moss: toon(token("--maze-moss")),
      mossLit: toon(token("--maze-moss-lit")),
      mushroom: toon(token("--maze-mushroom")),
      mushroomCap: toon(token("--maze-mushroom-cap")),
      mushroomSpot: toon(token("--maze-mushroom-spot")),
      canopy: toon(token("--maze-canopy")),
      canopyLit: toon(token("--maze-canopy-lit")),
      canopyBright: toon(token("--maze-canopy-bright")),
      vine: toon(token("--maze-vine")),
      bromeliad: toon(token("--maze-bromeliad")),
      orchid: toon(token("--maze-orchid")),
      spaceDark: toon(token("--maze-space-dark")),
      discoFloor: toon(token("--maze-disco-floor")),
      discoFloorDark: toon(token("--maze-disco-floor-dark")),
      winNeon: toon(token("--maze-win-neon"), token("--maze-win-neon"), 0.35),
      failNeon: toon(token("--maze-fail-neon"), token("--maze-fail-neon"), 0.28),
      failGround: toon(token("--maze-fail-ground")),
      failGroundDark: toon(token("--maze-fail-ground-dark")),
      failCrack: toon(token("--maze-fail-crack")),
    };
    this.failFloorMat = makeFailFloorMat();
    this.discoMats = Array.from({ length: 8 }, (_, index) => glow(token(`--maze-disco-${index}`)));
    for (const mat of this.discoMats) mat.emissiveIntensity = 0.95;
    this.groundMats.window.emissiveIntensity = 0.7;
    this.groundMats.lamp.emissiveIntensity = 0.85;
    this.groundMats.fire.emissiveIntensity = 0.95;
    this.groundMats.fireCore.emissiveIntensity = 1.1;
    this.groundMats.sulfurGlow.emissiveIntensity = 0.85;
    this.streamMat = toon(token("--maze-stream"), token("--maze-stream"), 0.2);
    this.streamDeepMat = toon(token("--maze-stream-deep"), token("--maze-stream"), 0.12);
    this.oceanMat = toon(token("--maze-ocean"), token("--maze-ocean"), 0.18);
    this.oceanDeepMat = toon(token("--maze-ocean-deep"), token("--maze-stream"), 0.1);
    this.cactusMat = toon(token("--maze-cactus"));
    this.cactusLitMat = toon(token("--maze-cactus-lit"));
    this.palmMat = toon(token("--maze-palm"));
    this.palmLitMat = toon(token("--maze-palm-lit"));
    this.treeMats = {
      trunk: toon(token("--maze-trunk")),
      trunkPale: toon(token("--maze-trunk-pale")),
      leaf: toon(token("--maze-leaf")),
      leafLit: toon(token("--maze-leaf-lit")),
      pine: toon(token("--maze-pine")),
      pineLit: toon(token("--maze-pine-lit")),
      autumn: toon(token("--maze-autumn")),
      autumnLit: toon(token("--maze-autumn-lit")),
    };
    this.flowerMats = [
      glow(token("--maze-flower-0")),
      glow(token("--maze-flower-1")),
      glow(token("--maze-flower-2")),
      glow(token("--maze-flower-3")),
    ];
    for (const mat of this.flowerMats) mat.emissiveIntensity = 0.45;
    this.animalMats = {
      cow: toon(token("--maze-cow")),
      cowSpot: toon(token("--maze-cow-spot")),
      sheep: toon(token("--maze-sheep")),
      sheepFace: toon(token("--maze-sheep-face")),
      dog: toon(token("--maze-dog")),
      dogEar: toon(token("--maze-dog-ear")),
      horse: toon(token("--maze-horse")),
      horseMane: toon(token("--maze-horse-mane")),
      crab: toon(token("--maze-crab")),
      seagull: toon(token("--maze-seagull")),
      seagullWing: toon(token("--maze-seagull-wing")),
      turtle: toon(token("--maze-turtle")),
      turtleShell: toon(token("--maze-turtle-shell")),
      seal: toon(token("--maze-seal")),
      penguin: toon(token("--maze-penguin")),
      penguinBelly: toon(token("--maze-penguin-belly")),
      bear: toon(token("--maze-bear")),
      fox: toon(token("--maze-fox")),
      foxTip: toon(token("--maze-fox-tip")),
      hare: toon(token("--maze-hare")),
      camel: toon(token("--maze-camel")),
      giraffe: toon(token("--maze-giraffe")),
      giraffeSpot: toon(token("--maze-giraffe-spot")),
      elephant: toon(token("--maze-elephant")),
      elephantEar: toon(token("--maze-elephant-ear")),
      elephantTusk: toon(token("--maze-elephant-tusk")),
      lizard: toon(token("--maze-lizard")),
      snake: toon(token("--maze-snake")),
      scorpion: toon(token("--maze-scorpion")),
      chicken: toon(token("--maze-chicken")),
      chickenComb: toon(token("--maze-chicken-comb")),
      pig: toon(token("--maze-pig")),
      goat: toon(token("--maze-goat")),
      rabbit: toon(token("--maze-rabbit")),
      deer: toon(token("--maze-deer")),
      owl: toon(token("--maze-owl")),
      raccoon: toon(token("--maze-raccoon")),
      fish: toon(token("--maze-fish")),
      fishFin: toon(token("--maze-fish-fin")),
      octopus: toon(token("--maze-octopus")),
      seahorse: toon(token("--maze-seahorse")),
      ray: toon(token("--maze-ray")),
      shark: toon(token("--maze-shark")),
      sharkBelly: toon(token("--maze-shark-belly")),
      whale: toon(token("--maze-whale")),
      whaleBelly: toon(token("--maze-whale-belly")),
      jelly: toon(token("--maze-jelly"), token("--maze-jelly-glow"), 0.35),
      jellyGlow: glow(token("--maze-jelly-glow")),
      pigeon: toon(token("--maze-pigeon")),
      cat: toon(token("--maze-cat")),
      rat: toon(token("--maze-rat")),
      parrot: toon(token("--maze-parrot")),
      parrotWing: toon(token("--maze-parrot-wing")),
      parrotTail: toon(token("--maze-parrot-tail")),
      frog: toon(token("--maze-frog")),
      frogBelly: toon(token("--maze-frog-belly")),
      toucan: toon(token("--maze-toucan")),
      toucanBeak: toon(token("--maze-toucan-beak")),
      toucanChest: toon(token("--maze-toucan-chest")),
      monkey: toon(token("--maze-monkey")),
      monkeyFace: toon(token("--maze-monkey-face")),
    };
    this.animalMats.jellyGlow.emissiveIntensity = 0.7;
    this.floorMats = makeFloorMats();
    this.startRingMat = glow(token("--maze-start-mark"));
    this.startRingMat.emissiveIntensity = 0.28;
    this.boostMarkMat = glow(token("--maze-boost-mark"));
    this.warpMats = Array.from({ length: WARP_COLOR_COUNT }, (_, index) => glow(token(`--maze-warp-${index}`)));
    this.warpGateMats = Array.from({ length: WARP_COLOR_COUNT }, (_, index) => {
      const mat = glow(token(`--maze-warp-${index}`));
      mat.transparent = true;
      mat.opacity = WARP_GATE_ALPHA;
      mat.depthWrite = false;
      return mat;
    });
    this.exitGateMat = glow(token("--maze-goal"));
    this.exitGateMat.transparent = true;
    this.exitGateMat.opacity = EXIT_GATE_ALPHA;
    this.exitGateMat.depthWrite = false;
    this.iceMarkMat = glow(token("--maze-ice-mark"));
    this.switchCubeMats = Array.from({ length: SWITCH_COLOR_COUNT }, (_, index) => {
      const mat = glow(token(`--maze-switch-${index}`));
      mat.transparent = true;
      mat.opacity = SWITCH_CUBE_ALPHA;
      mat.depthWrite = false;
      return mat;
    });
    this.arrowGeometry = arrowGeometry();
    this.heartGeometry = makeHeartGeo();
    this.coinGeometry = makeCoinGeo();
    this.starGeometry = starGeometry();
    this.wingGeometry = wingGeometry();
    this.ghostGeometry = ghostGeometry();
    this.sparkGeometry = facet(new BoxGeometry(0.05, 0.14, 0.05));
    this.rainGeometry = facet(new BoxGeometry(0.028, 0.42, 0.028));
    this.switchCubeGeometry = facet(new BoxGeometry(SWITCH_CUBE, SWITCH_CUBE, SWITCH_CUBE));
    this.warpGateGeometry = facet(new CylinderGeometry(WARP_GATE_R, WARP_GATE_R, WARP_GATE_H, 8, 1, true));
    this.exitGateGeometry = facet(
      new CylinderGeometry(EXIT_GATE_R, EXIT_GATE_R, EXIT_GATE_H, 8, 1, true),
    );
    const heartMats = makeHeartMaterials(token("--maze-heart"));
    heartMats.outline.dispose();
    this.heartBodyMat = heartMats.body;
    this.heartShadeMat = heartMats.shade;
    this.coinMat = makeCoinMaterial(token("--maze-coin"), token("--maze-coin-shine"));
    this.starMat = glow(token("--maze-power"));
    this.starMat.emissiveIntensity = 0.95;
    this.wingMat = glow(token("--maze-hover"));
    this.wingMat.emissiveIntensity = 0.85;
    this.ghostMat = glow(token("--maze-ghost"));
    this.ghostMat.emissiveIntensity = 0.8;
    this.gateMarkMat = glow(token("--maze-gate"));
    this.gateMarkMat.emissiveIntensity = 0.7;
    this.gateSignGeometry = new PlaneGeometry(1, 1);
    this.gateAllowMat = gateSignMaterial(token("--maze-gate-ok"), "ok");
    this.gateDenyMat = gateSignMaterial(token("--maze-gate-no"), "no");
    this.gateOkWallMat = toon(token("--maze-gate-ok"), token("--maze-gate-ok"), 0.35);
    this.gateNoWallMat = toon(token("--maze-gate-no"), token("--maze-gate-no"), 0.35);
    this.gateEdgeWallMat = toon(token("--maze-gate"), token("--maze-gate"), 0.2);
    this.gateTopTextures = {
      e: makeGateTopTexture("e"),
      w: makeGateTopTexture("w"),
      n: makeGateTopTexture("n"),
      s: makeGateTopTexture("s"),
    };
    this.coinSparkColors = [token("--maze-coin"), token("--maze-coin-shine"), "#ffffff"];
    this.heartSparkColors = [token("--maze-heart"), "#ff8a9a", "#ffffff"];
    this.starSparkColors = [
      token("--maze-power"),
      token("--sky-rainbow-0"),
      token("--sky-rainbow-2"),
      token("--sky-rainbow-4"),
      token("--sky-rainbow-6"),
      "#ffffff",
    ];
    this.wingSparkColors = [token("--maze-hover"), token("--sky-ocean-1"), "#ffffff"];
    this.ghostSparkColors = [token("--maze-ghost"), "#e4d9ff", "#ffffff"];
    this.starFlashColors = [
      token("--sky-rainbow-0"),
      token("--sky-rainbow-1"),
      token("--sky-rainbow-2"),
      token("--sky-rainbow-3"),
      token("--sky-rainbow-4"),
      token("--sky-rainbow-5"),
      token("--sky-rainbow-6"),
      "#ffffff",
    ];
    this.ballBaseColor = token("--maze-ball");
    this.bandBaseColor = token("--maze-mark");
    this.hoverAuraColor = token("--maze-hover");
    this.ghostAuraColor = token("--maze-ghost");
    this.ballAuraMat = new MeshBasicMaterial({
      color: token("--maze-hover"),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      toneMapped: false,
    });
    this.ballAura = new Mesh(new SphereGeometry(BALL_R * 1.55, 16, 12), this.ballAuraMat);
    this.ballAura.visible = false;
    this.ballAura.renderOrder = 4;
    this.fireworkColors = [
      token("--maze-win-neon"),
      token("--maze-heart"),
      token("--maze-coin"),
      token("--maze-coin-shine"),
      token("--maze-warp-0"),
      token("--maze-warp-1"),
      token("--maze-warp-2"),
      token("--maze-goal"),
      "#ffffff",
    ];
    this.rainColors = [
      token("--maze-fail-neon"),
      token("--sky-ocean-3"),
      token("--sky-ocean-5"),
      "#9eb0c4",
      "#c8d6e4",
    ];

    this.hemiLight = new HemisphereLight(token("--maze-sky"), token("--maze-floor"), 0.7);
    this.ambientLight = new AmbientLight("#ffffff", 0.28);
    this.key = new DirectionalLight("#fff6ea", 1.45);
    this.key.position.set(4.4, 12.8, 6.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(512, 512);
    this.key.shadow.bias = -0.001;
    this.key.shadow.normalBias = 0.06;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 40;
    const fill = new DirectionalLight(token("--maze-sky"), 0.32);
    fill.position.set(-7.5, 5.5, -3.5);
    const rim = new DirectionalLight("#ffffff", 0.18);
    rim.position.set(-2.5, 7, -9);
    this.scene.add(this.hemiLight, this.ambientLight, this.key, this.key.target, fill, rim);

    this.ballToonMat = toon(token("--maze-ball"));
    this.ballSmoothMat = new MeshStandardMaterial({
      color: token("--maze-ball"),
      roughness: 0.28,
      metalness: 0.08,
    });
    this.bandPixelMat = new MeshBasicMaterial({ color: token("--maze-mark"), toneMapped: false });
    this.bandSmoothMat = new MeshStandardMaterial({
      color: token("--maze-mark"),
      roughness: 0.55,
      metalness: 0.12,
    });
    this.ballGeoPixel = facet(new SphereGeometry(BALL_R, 8, 6));
    this.bandGeoPixel = new TorusGeometry(BALL_R * 0.98, BALL_R * 0.04, 5, 20);
    this.ball = new Mesh(this.ballGeoPixel, this.ballToonMat);
    this.ball.castShadow = true;
    this.ball.receiveShadow = true;
    const bandA = new Mesh(this.bandGeoPixel, this.bandPixelMat);
    const bandB = new Mesh(this.bandGeoPixel, this.bandPixelMat);
    bandB.rotation.x = Math.PI / 2;
    this.ballBands = [bandA, bandB];
    this.ball.add(bandA, bandB, this.ballAura);
    this.scene.add(this.ball);
  }

  setTower(layout: TowerLayout, opts?: { fromEnterPlay?: boolean }): void {
    const fromEnter = Boolean(opts?.fromEnterPlay && this.enterCtl.state);
    this.tower = layout;
    this.story = layout.story;
    this.raised = 0;
    this.escaped = false;
    this.failed = false;
    this.clearDebris();
    this.clearSparks();
    this.homeBackdrop = false;
    this.clearLightning();
    this.restoreHomeLighting();
    this.meadowCamLive = false;
    this.meadowCamT = 0;
    this.clearMeadow();
    this.clearGenerated();
    this.key.shadow.camera.far = 40;
    this.camera.far = 140;
    this.scene.background = this.voidSky.texture;
    this.exitBreached = false;
    this.floorGroups.length = 0;
    this.frames.length = 0;
    this.focusY = 0;
    this.board.position.set(0, 0, 0);
    layout.floors.forEach((floor, index) => {
      const group = this.makeFloor(floor, -index * layout.story);
      this.frames[index] = this.addPieces(group, floor.pieces, floor.theme);
      this.addMarkers(group, floor);
      this.addTileMarks(group, floor);
      this.addPickups(group, floor);
      this.board.add(group);
      this.floorGroups.push(group);
    });
    this.setGoalLightsVisible(true);
    if (fromEnter && this.enterCtl.state) {
      this.ball.visible = true;
      this.syncShell(0, true);
      return;
    }
    this.ball.visible = true;
    this.fit();
    this.syncShell(0, true);
  }

  crumbleTop(): void {
    this.shatterFloor(this.topFloorIndex(), null);
  }

  /** Blow the ceiling off the stage we just landed on (hole was already open at start). */
  shatterRoof(): void {
    this.shatterRoofAt(this.topFloorIndex());
  }

  shatterEscape(): void {
    const index = this.topFloorIndex();
    const group = index >= 0 ? this.floorGroups[index] : null;
    const blast = group
      ? (group.userData.exit as { x: number; z: number } | null) ??
        (group.userData.hatch as { x: number; z: number } | null)
      : null;
    this.shatterExit();
    this.shatterFloor(index, blast);
    this.escaped = true;
    this.failed = false;
    this.clearGoalMarkers();
    this.winSceneIndex = Math.floor(Math.random() * WIN_SCENES.length);
    this.applyWinScene(this.winSceneIndex);
    this.beginMeadowCamera();
  }

  shatterFail(): void {
    const index = this.topFloorIndex();
    this.shatterFloor(index, { x: 0, z: 0 });
    for (let i = 0; i < this.floorGroups.length; i += 1) {
      if (i === index) continue;
      const group = this.floorGroups[i];
      if (group) group.visible = false;
      const frame = this.frames[i];
      if (frame) frame.visible = false;
    }
    this.escaped = true;
    this.failed = true;
    this.clearGoalMarkers();
    this.buildFailScene();
    this.scene.background = this.voidSky.texture;
    this.syncVoidSky(this.lastTime);
    this.beginMeadowCamera();
  }

  cycleWinScene(step = 1): boolean {
    if (!this.escaped) return false;
    const count = GALLERY_SCENES.length;
    this.winSceneIndex = ((this.winSceneIndex + step) % count + count) % count;
    this.applyWinScene(this.winSceneIndex);
    return true;
  }

  setWinScene(index: number): boolean {
    if (!this.escaped) return false;
    const count = GALLERY_SCENES.length;
    if (count <= 0) return false;
    this.winSceneIndex = ((index % count) + count) % count;
    this.applyWinScene(this.winSceneIndex);
    return true;
  }

  enterWinGallery(): void {
    this.homeBackdrop = false;
    this.homeView = "menu";
    this.homeViewBlend = 1;
    this.clearLightning();
    this.restoreHomeLighting();
    this.key.shadow.camera.far = 40;
    this.camera.far = 140;
    this.camera.fov = this.settings?.values.field ?? 40;
    this.camera.updateProjectionMatrix();
    this.escaped = true;
    this.failed = false;
    this.clearGoalMarkers();
    this.ball.visible = false;
    for (const group of this.floorGroups) {
      if (group) group.visible = false;
    }
    for (const frame of this.frames) {
      if (frame) frame.visible = false;
    }
    // Gallery from the title screen has no play tower — give meadows a normal footprint.
    if (!this.tower || this.tower.floors.length === 0) {
      this.tower = {
        floors: [],
        width: CELL * 11,
        depth: CELL * 11,
        story: STORY,
      };
    }
    this.winSceneIndex = 0;
    this.applyWinScene(0);
    this.beginMeadowCamera();
    this.placeCamera();
  }

  /** Ominous 100-floor tower meadow for the title screen. */
  enterHomeBackdrop(): void {
    this.clearEnterPlay(false);
    this.clearDebris();
    this.clearSparks();
    this.clearMeadow();
    this.clearGenerated();
    this.clearLightning();
    this.floorGroups.length = 0;
    this.frames.length = 0;
    this.exitBreached = false;
    this.raised = 0;
    this.focusY = 0;
    this.escaped = true;
    this.failed = false;
    this.homeBackdrop = true;
    this.homeView = "menu";
    this.homeViewBlend = 1;
    this.homeOrbit = 0.55; // start on a corner so the pyramid taper reads clearly
    this.lightningCooldown = 0.6 + Math.random() * 1.4;
    this.ball.visible = false;
    this.board.position.set(0, 0, 0);
    this.board.quaternion.identity();
    this.tower = {
      floors: [],
      width: HOME_BACKDROP_SPAN,
      depth: HOME_BACKDROP_SPAN,
      story: STORY,
    };
    this.story = STORY;
    this.buildHomeScene();
    this.scene.background = this.voidSky.texture;
    this.syncVoidSky(this.lastTime);
    this.applyHomeLighting();
    this.key.shadow.camera.far = 80;
    this.camera.far = 220;
    // Ultrawide like an iPhone 0.5× — big floor, looming stack.
    this.camera.fov = 88;
    this.camera.updateProjectionMatrix();
    this.meadowCamLive = true;
    this.meadowCamT = 1;
    this.restCamera();
    this.placeCamera();
  }

  leaveHomeBackdrop(): void {
    if (!this.homeBackdrop && !this.enterCtl.state) return;
    this.clearEnterPlay(false);
    this.homeBackdrop = false;
    this.homeView = "menu";
    this.homeViewBlend = 1;
    this.escaped = false;
    this.failed = false;
    this.meadowCamLive = false;
    this.meadowCamT = 0;
    this.clearLightning();
    this.restoreHomeLighting();
    this.key.shadow.camera.far = 40;
    this.camera.far = 140;
    this.camera.fov = this.settings?.values.field ?? 40;
    this.camera.updateProjectionMatrix();
    this.clearMeadow();
    this.clearGenerated();
    this.floorGroups.length = 0;
    this.frames.length = 0;
    this.tower = null;
    this.board.position.set(0, 0, 0);
    this.ball.visible = false;
    this.scene.background = this.voidSky.texture;
    this.syncVoidSky(this.lastTime);
  }

  /** Crane between the title low-angle and the summit Tower menu shot. */
  setHomeView(mode: "menu" | "tower"): void {
    if (!this.homeBackdrop) return;
    if (this.homeView === mode && this.homeViewBlend >= 1) return;
    this.homeViewFromEye.copy(this.camera.position);
    this.homeViewFromLook.copy(this.meadowCamLook);
    this.homeView = mode;
    this.homeViewBlend = this.reduceMotion ? 1 : 0;
    this.placeCamera();
  }

  homeViewMode(): "menu" | "tower" {
    return this.homeView;
  }

  /**
   * Start a camera handoff from the home storm scene into play.
   * Returns false when there is no home backdrop (caller should mount immediately).
   */
  beginEnterPlay(kind: EnterPlayKind): boolean {
    if (!this.homeBackdrop || this.reduceMotion) {
      this.clearEnterPlay(false);
      return false;
    }
    this.enterCtl.begin(
      kind,
      this.camera.position,
      this.meadowCamLook,
      this.camera.fov,
      this.settings?.values.field ?? 40,
    );
    this.restCamera();
    return true;
  }

  isEnterPlay(): boolean {
    return this.enterCtl.state !== null;
  }

  enterPlayNeedsSwap(): boolean {
    return this.enterCtl.needsSwap();
  }

  /** Call after mounting the play tower mid-transition. */
  notifyEnterPlaySwapped(): void {
    const ep = this.enterCtl.state;
    if (!ep || ep.swapped) return;
    ep.swapped = true;
    ep.toFov = this.settings?.values.field ?? 40;
    this.beginEnterCurtainReveal();
  }

  /**
   * Advance the home → play camera beat. Returns true when finished.
   * Call every frame while `isEnterPlay()`; mount the play tower when `enterPlayNeedsSwap()`.
   */
  tickEnterPlay(dt: number, time: number): boolean {
    const ep = this.enterCtl.state;
    if (!ep) return true;
    const done = this.enterCtl.advance(dt);
    if (this.homeBackdrop && !ep.playSky) {
      this.tickLightning(dt);
      this.tickRain(dt);
      this.syncVoidSky(time);
    } else {
      if (this.homeBackdrop && ep.playSky) {
        this.lightningFlash = 0;
        if (this.lightningLight) this.lightningLight.intensity = 0;
        if (this.lightningBolt) this.lightningBolt.visible = false;
        this.setTowerLightningFlash(0);
      }
      this.syncVoidSky(time);
    }
    this.placeCamera();
    if (!done) return false;
    this.finishEnterPlay();
    return true;
  }

  /** Tick rain, lightning, and orbit camera while the title backdrop is up. */
  updateHome(time: number): void {
    if (!this.homeBackdrop) return;
    const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    if (!this.reduceMotion) {
      this.homeOrbit += dt * (this.homeView === "tower" ? 0.045 : 0.09);
      if (this.homeViewBlend < 1) {
        this.homeViewBlend = Math.min(1, this.homeViewBlend + dt / 2.75);
      }
    } else {
      this.homeViewBlend = 1;
    }
    this.tickLightning(dt);
    this.tickRain(dt);
    this.syncVoidSky(time);
    this.placeCamera();
  }

  isHomeBackdrop(): boolean {
    return this.homeBackdrop;
  }

  private finishEnterPlay(): void {
    const ep = this.enterCtl.state;
    if (!ep) return;
    if (!ep.crossed) this.beginEnterCurtainReveal();
    this.board.position.set(0, 0, 0);
    this.ball.visible = true;
    for (const group of this.floorGroups) if (group) group.visible = true;
    for (const frame of this.frames) if (frame) frame.visible = true;
    this.camera.fov = ep.toFov;
    this.camera.far = 140;
    this.key.shadow.camera.far = 40;
    this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();
    this.enterCtl.release();
    this.meadowCamLive = false;
    this.meadowCamT = 0;
    this.restoreHomeLighting();
    this.placeCamera();
  }

  private clearEnterPlay(restoreBoard: boolean): void {
    if (!this.enterCtl.state && this.board.position.y === 0) return;
    this.enterCtl.release();
    this.camera.up.set(0, 1, 0);
    if (restoreBoard) {
      this.board.position.set(0, 0, 0);
      this.ball.visible = true;
    }
  }

  /**
   * Door has filled the frame — drop the storm, cover with curtains, and start
   * from a pulled-back play orbit so the board reads far away before we dolly in.
   */
  private beginEnterCurtainReveal(): void {
    const ep = this.enterCtl.state;
    if (!ep || ep.crossed) return;
    ep.crossed = true;
    ep.playSky = true;
    this.homeBackdrop = false;
    this.clearLightning();
    this.restoreHomeLighting();
    this.key.shadow.camera.far = 80;
    this.camera.far = 220;
    this.board.position.set(0, 0, 0);
    for (const group of this.floorGroups) if (group) group.visible = true;
    for (const frame of this.frames) if (frame) frame.visible = true;
    this.ball.visible = true;
    this.enterCtl.positionRevealCamera();
    const themeId = this.playSkyThemeId();
    this.voidSky.configure(this.settings?.values.skyPixels ?? 4, this.settings?.values.skyShade ?? 6, themeId);
    this.voidSky.setZoom(ENTER_PLAY_SKY_ZOOM_DOOR);
    this.voidSky.paint(this.lastTime, true);
    this.scene.background = this.voidSky.texture;
    this.enterCtl.showCurtains();
  }

  winGalleryScenes(): readonly string[] {
    return GALLERY_SCENES;
  }

  winGalleryStatus(): { index: number; count: number; name: string } {
    const count = GALLERY_SCENES.length;
    const index = ((this.winSceneIndex % count) + count) % count;
    return {
      index,
      count,
      name: GALLERY_SCENES[index] ?? "pasture",
    };
  }

  private applyWinScene(index: number): void {
    const count = GALLERY_SCENES.length;
    const safe = ((index % count) + count) % count;
    this.winSceneIndex = safe;
    const scene = GALLERY_SCENES[safe] ?? "pasture";
    if (scene === "fail") {
      this.failed = true;
      this.buildFailScene();
    } else {
      this.failed = false;
      this.buildWinScene(scene);
    }
    this.scene.background = this.voidSky.texture;
    this.syncVoidSky(this.lastTime);
  }

  rebase(dy: number): void {
    this.raised += dy;
    const up = new Vector3(0, dy, 0).applyQuaternion(this.board.quaternion);
    for (const group of this.floorGroups) {
      if (group) group.position.y += dy;
    }
    if (this.meadow) this.meadow.position.y += dy;
    for (const bit of this.debris) bit.mesh.position.add(up);
    this.focusY += dy;
    this.placeCamera();
  }

  appendFloor(layout: MazeLayout): void {
    const tower = this.tower;
    if (!tower) return;
    const index = this.floorGroups.length;
    const group = this.makeFloor(layout, -index * this.story + this.raised);
    this.frames[index] = this.addPieces(group, layout.pieces, layout.theme);
    this.addMarkers(group, layout);
    this.addTileMarks(group, layout);
    this.addPickups(group, layout);
    this.board.add(group);
    this.floorGroups.push(group);
    tower.floors.push(layout);
    tower.width = Math.max(tower.width, layout.width);
    tower.depth = Math.max(tower.depth, layout.depth);
    this.setGoalLightsVisible(true);
    this.fit();
  }

  collectHeart(cell: string): void {
    this.collectPickup(this.hearts, cell);
  }

  collectCoin(cell: string): void {
    this.collectPickup(this.coins, cell);
  }

  collectStar(cell: string): void {
    this.collectPickup(this.stars, cell);
  }

  collectWings(cell: string): void {
    this.collectPickup(this.wings, cell);
  }

  collectGhosts(cell: string): void {
    this.collectPickup(this.ghosts, cell);
  }

  /** Respawn stars/wings/ghosts on the active floor after a ball reset / retry. */
  restorePowerUps(): void {
    const tower = this.tower;
    if (!tower) return;
    const index = this.currentFloor();
    const group = this.floorGroups[index];
    const layout = tower.floors[index];
    if (!group || !layout) return;
    this.clearPowerUpsOn(group);
    this.addPowerUps(group, layout);
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.voidResolution.set(Math.max(1, width), Math.max(1, height));
    this.voidStarMat.uniforms.uResolution.value = this.voidResolution;
    this.fit();
  }

  useSettings(settings: PlaySettings): void {
    this.settings = settings;
    this.applyPicture();
    this.applyCamera();
  }

  applyPicture(): void {
    const steps = this.settings?.values.shade ?? 3;
    const normal = this.settings?.normalLook ?? false;
    const lookChanged = normal !== paintedNormal;
    const shadowSize = normal ? 2048 : 512;
    if (this.key.shadow.mapSize.x !== shadowSize) {
      this.key.shadow.mapSize.set(shadowSize, shadowSize);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.applyBallLook(normal);
    setOrganicProps(normal);
    this.syncVoidSky(this.lastTime);
    if (lookChanged && this.homeBackdrop) this.buildHomeScene();
    else if (lookChanged && this.escaped && !this.failed) this.applyWinScene(this.winSceneIndex);
    else if (lookChanged && this.failed) this.buildFailScene();
    if (!lookChanged && Math.abs(steps - paintedSteps) < 0.001) return;
    paintRamp(ramp, steps, normal);
    this.setTextureFiltering(normal);
  }

  private applyBallLook(normal: boolean): void {
    if (normal === this.ballNormal) return;
    this.ballNormal = normal;
    if (normal) {
      if (!this.ballGeoSmooth) this.ballGeoSmooth = new SphereGeometry(BALL_R, 48, 32);
      if (!this.bandGeoSmooth) {
        this.bandGeoSmooth = new TorusGeometry(BALL_R * 0.98, BALL_R * 0.032, 14, 64);
      }
      this.ball.geometry = this.ballGeoSmooth;
      this.ball.material = this.ballSmoothMat;
      for (const band of this.ballBands) {
        band.geometry = this.bandGeoSmooth;
        band.material = this.bandSmoothMat;
        band.castShadow = true;
      }
    } else {
      this.ball.geometry = this.ballGeoPixel;
      this.ball.material = this.ballToonMat;
      for (const band of this.ballBands) {
        band.geometry = this.bandGeoPixel;
        band.material = this.bandPixelMat;
        band.castShadow = false;
      }
    }
  }

  private setTextureFiltering(normal: boolean): void {
    const mag = normal ? LinearFilter : NearestFilter;
    const min = normal ? LinearMipmapLinearFilter : NearestFilter;
    for (const tex of this.pictureTextures()) {
      const nextMin = tex.generateMipmaps ? min : mag;
      if (tex.magFilter === mag && tex.minFilter === nextMin) continue;
      tex.magFilter = mag;
      tex.minFilter = nextMin;
      tex.needsUpdate = true;
    }
    ramp.magFilter = normal ? LinearFilter : NearestFilter;
    ramp.minFilter = normal ? LinearFilter : NearestFilter;
    ramp.needsUpdate = true;
  }

  private pictureTextures(): Texture[] {
    const out: Texture[] = [];
    const take = (mat: Material | Material[] | undefined): void => {
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      for (const item of list) {
        if (!(item instanceof MeshToonMaterial)) continue;
        if (item.map) out.push(item.map);
      }
    };
    for (const mat of Object.values(this.materials)) take(mat);
    for (const mat of Object.values(this.groundMats)) take(mat);
    for (const mat of Object.values(this.floorMats)) take(mat);
    take(this.failFloorMat);
    for (const surfaces of this.themeSurfaces.values()) {
      take(surfaces.floor);
      take(surfaces.wall);
      take(surfaces.start);
    }
    take(this.materials.crumble);
    return out;
  }

  private syncVoidSky(time: number): void {
    const chunk = this.settings?.values.skyPixels ?? 4;
    const steps = this.settings?.values.skyShade ?? 6;
    const themeId = (this.homeBackdrop && !this.enterCtl.state?.playSky) || this.failed
      ? "sad"
      : this.escaped
        ? "rainbow"
        : this.playSkyThemeId();
    const changed = this.voidSky.configure(chunk, steps, themeId);
    if (this.reduceMotion) {
      if (changed) this.voidSky.paint(0, true);
      return;
    }
    this.voidSky.paint(time, changed);
  }

  /** Authored floor sky when present, otherwise the player's Picture setting. */
  private playSkyThemeId(): string {
    const floor = this.tower?.floors[this.currentFloor()];
    if (this.settings) return resolveFloorSky(this.settings, floor?.skyTheme);
    return skyThemeAt(floor?.skyTheme ?? 0).id;
  }

  applyCamera(): void {
    this.restCamera();
    const field = this.settings?.values.field ?? 30;
    if (this.camera.fov !== field) {
      this.camera.fov = field;
      this.camera.updateProjectionMatrix();
    }
    this.fit();
  }

  nudgeCamera(dAngle: number, dOrbit: number): void {
    if (this.escaped || this.homeBackdrop) {
      this.playGlance.nudgeMeadow(dAngle, dOrbit);
      return;
    }
    this.playGlance.nudgePlay(dAngle, dOrbit, playAngleFromSettings(this.settings));
  }

  recallCamera(): void {
    this.playGlance.recall(this.reduceMotion);
  }

  stepCamera(dt: number): void {
    this.playGlance.step(dt);
  }

  restCamera(): void {
    this.playGlance.rest();
  }

  update(time: number, pose: Pose): void {
    this.board.quaternion.set(pose.board.x, pose.board.y, pose.board.z, pose.board.w);
    this.ball.position.set(pose.ballPosition.x, pose.ballPosition.y, pose.ballPosition.z);
    this.ball.quaternion.set(pose.ballRotation.x, pose.ballRotation.y, pose.ballRotation.z, pose.ballRotation.w);
    this.ball.scale.setScalar(pose.ballScale);
    this.syncStarBall(pose, time);
    this.syncHoverAura(pose, time);
    const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.tickDebris(dt);
    this.tickSparks(dt);
    this.tickAim(dt);
    this.tickMeadowCamera(dt);
    this.syncShell(dt, this.reduceMotion);
    this.placeCamera();
    this.syncVoidStars(time);
    this.syncTiles(pose, time);
    this.syncGhostWalls(pose, time);
    if (pose.fallingThrough) this.shatterExit();
    this.tickPickups(this.hearts, time, dt, 1.7, 2.4);
    this.tickPickups(this.coins, time, dt, 3.6, 2.8);
    this.tickPickups(this.stars, time, dt, 2.8, 3.2);
    this.tickPickups(this.wings, time, dt, 2.2, 2.6);
    this.tickPickups(this.ghosts, time, dt, 2.4, 2.4);
    this.syncVoidSky(time);
    if (this.reduceMotion) return;
    if (this.goalRings.length || this.goalGates.length) {
      const wave = Math.sin(time * 2.2);
      const pulse = 0.75 + wave * 0.25;
      const scale = 1 + wave * 0.03;
      this.goalRingMat.emissiveIntensity = pulse;
      this.exitGateMat.emissiveIntensity = pulse;
      this.exitGateMat.opacity = EXIT_GATE_ALPHA * (0.85 + wave * 0.15);
      for (const ring of this.goalRings) ring.scale.setScalar(scale);
      for (const gate of this.goalGates) gate.rotation.y = time * 0.65;
      for (const light of this.goalLights) light.intensity = 2.8 + wave * 0.8;
    }
    if (this.escaped) {
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
          if (this.failed) {
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
      if (this.homeBackdrop || this.failed) this.tickRain(dt);
      else this.tickFireworks(dt);
      if (this.homeBackdrop) this.tickLightning(dt);
    }
    this.boostMarkMat.emissiveIntensity = 0.55 + Math.sin(time * 4.5) * 0.28;
    this.iceMarkMat.emissiveIntensity = 0.35 + Math.sin(time * 1.6) * 0.12;
    for (const [index, mat] of this.warpMats.entries()) {
      const pulse = 0.55 + Math.sin(time * 2.2 + index * 0.7) * 0.25;
      mat.emissiveIntensity = pulse;
      const gate = this.warpGateMats[index];
      if (gate) gate.emissiveIntensity = pulse;
    }
    for (const spin of this.warpSpins) spin.rotation.y = time * 0.65;
    if (!this.reduceMotion) {
      for (const cube of this.switchSpins) {
        if (cube.userData.shattered) continue;
        cube.rotation.x = time * 0.9;
        cube.rotation.y = time * 1.25;
        cube.rotation.z = time * 0.55;
      }
    }
  }

  private makeFloor(layout: MazeLayout, y: number): Group {
    const group = new Group();
    group.position.y = y;
    group.userData.generated = true;
    group.userData.pieces = layout.pieces;
    group.userData.hatch = layout.hatch;
    group.userData.start = layout.start;
    group.userData.exit = layout.finale ? layout.goal : null;
    return group;
  }

  private topFloorIndex(): number {
    let index = -1;
    let top = -Infinity;
    this.floorGroups.forEach((group, i) => {
      if (!group || group.position.y <= top) return;
      top = group.position.y;
      index = i;
    });
    return index;
  }

  private shatterFloor(index: number, blast: { x: number; z: number } | null): void {
    const group = index >= 0 ? this.floorGroups[index] : null;
    if (!group) return;
    if (!this.reduceMotion) {
      const pieces = group.userData.pieces as Piece[] | undefined;
      const hatch =
        blast ??
        (group.userData.hatch as { x: number; z: number } | null) ??
        (group.userData.exit as { x: number; z: number } | null);
      this.board.updateWorldMatrix(true, true);
      if (pieces) {
        for (const piece of pieces) {
          if (
            piece.kind === "pit" ||
            piece.kind === "void" ||
            piece.kind === "lip" ||
            piece.kind === "grout" ||
            piece.kind === "roof" ||
            (piece.kind === "goal" && this.exitBreached)
          ) {
            continue;
          }
          this.spawnDebris(piece, group.position.y, this.board.quaternion, hatch);
        }
      }
    }
    this.board.remove(group);
    group.traverse((child) => this.disposeGenerated(child));
    this.floorGroups[index] = null;
    this.frames[index] = null;
    this.pruneSpins();
    this.pruneGoalMarkers();
    this.exitBreached = false;
  }

  /** Shatter the exit glass pad, veil, and ring as the ball passes through. */
  private shatterExit(): void {
    if (this.exitBreached) return;
    const index = this.topFloorIndex();
    const group = index >= 0 ? this.floorGroups[index] : null;
    if (!group) return;
    const hasExit =
      (group.userData.exit as { x: number; z: number } | null) != null ||
      (group.userData.hatch as { x: number; z: number } | null) != null;
    if (!hasExit) return;

    this.exitBreached = true;
    this.board.updateWorldMatrix(true, true);
    const floorY = group.position.y;
    const quat = this.board.quaternion;

    const pieces = (group.userData.pieces as Piece[] | undefined) ?? [];
    const goals = pieces.filter((piece) => piece.kind === "goal");
    group.userData.pieces = pieces.filter((piece) => piece.kind !== "goal");

    const remove: Object3D[] = [];
    for (const child of group.children) {
      if (child instanceof Mesh && child.userData.pieceKind === "goal") remove.push(child);
    }
    for (const mesh of remove) {
      group.remove(mesh);
      this.disposeGenerated(mesh);
    }

    if (!this.reduceMotion) {
      for (const piece of goals) this.spawnGlassBurst(piece, floorY, quat);
      this.burstExitMarkers(group, quat);
    } else {
      this.stripExitMarkers(group);
    }
  }

  private burstExitMarkers(group: Group, boardQuat: Quaternion): void {
    const blast = this.ball.position.clone();
    for (let i = this.goalRings.length - 1; i >= 0; i -= 1) {
      const ring = this.goalRings[i];
      if (!ring || ring.parent !== group) continue;
      this.spawnMarkerShards(ring, boardQuat, blast, 10, 0.08);
      ring.removeFromParent();
      this.goalRings.splice(i, 1);
    }
    for (let i = this.goalGates.length - 1; i >= 0; i -= 1) {
      const gate = this.goalGates[i];
      if (!gate || gate.parent !== group) continue;
      this.spawnMarkerShards(gate, boardQuat, blast, 14, 0.12);
      gate.removeFromParent();
      this.goalGates.splice(i, 1);
    }
    for (let i = this.goalLights.length - 1; i >= 0; i -= 1) {
      const light = this.goalLights[i];
      if (!light || light.parent !== group) continue;
      light.visible = false;
      light.removeFromParent();
      this.goalLights.splice(i, 1);
    }
  }

  private stripExitMarkers(group: Group): void {
    for (let i = this.goalRings.length - 1; i >= 0; i -= 1) {
      const ring = this.goalRings[i];
      if (!ring || ring.parent !== group) continue;
      ring.removeFromParent();
      this.goalRings.splice(i, 1);
    }
    for (let i = this.goalGates.length - 1; i >= 0; i -= 1) {
      const gate = this.goalGates[i];
      if (!gate || gate.parent !== group) continue;
      gate.removeFromParent();
      this.goalGates.splice(i, 1);
    }
    for (let i = this.goalLights.length - 1; i >= 0; i -= 1) {
      const light = this.goalLights[i];
      if (!light || light.parent !== group) continue;
      light.visible = false;
      light.removeFromParent();
      this.goalLights.splice(i, 1);
    }
  }

  private spawnMarkerShards(
    from: Mesh,
    boardQuat: Quaternion,
    blast: Vector3,
    count: number,
    size: number,
  ): void {
    this.spawnShards(from, boardQuat, blast, count, size, this.exitGateMat, 0.7);
  }

  private syncSwitchCubes(open: Set<string>): void {
    let needBurst = false;
    for (const cube of this.switchSpins) {
      const gate = cube.userData.gate as string;
      const triggered = gate.length > 0 && open.has(gate);
      if (triggered && !cube.userData.shattered) {
        needBurst = true;
        break;
      }
    }
    if (needBurst) this.board.updateWorldMatrix(true, true);
    const blast = this.ball.position.clone();
    const boardQuat = this.board.quaternion;
    for (let i = this.switchSpins.length - 1; i >= 0; i -= 1) {
      const cube = this.switchSpins[i];
      if (!cube?.parent) {
        this.switchSpins.splice(i, 1);
        continue;
      }
      const gate = cube.userData.gate as string;
      const triggered = gate.length > 0 && open.has(gate);
      if (triggered && !cube.userData.shattered) {
        cube.userData.shattered = true;
        cube.visible = false;
        if (!this.reduceMotion) {
          const tone = (cube.userData.tone as number | undefined) ?? 0;
          const source = this.switchCubeMats[tone % SWITCH_COLOR_COUNT] ?? this.switchCubeMats[0]!;
          this.spawnShards(cube, boardQuat, blast, 16, 0.1, source, 0.85);
        }
        continue;
      }
      if (!triggered && cube.userData.shattered) {
        cube.userData.shattered = false;
        cube.visible = true;
        cube.rotation.set(0, 0, 0);
      }
    }
  }

  private spawnShards(
    from: Mesh,
    boardQuat: Quaternion,
    blast: Vector3,
    count: number,
    size: number,
    source: MeshToonMaterial,
    opacity: number,
  ): void {
    const origin = from.getWorldPosition(new Vector3());
    for (let i = 0; i < count; i += 1) {
      const geo = new BoxGeometry(
        size * (0.5 + Math.random()),
        size * (0.7 + Math.random() * 1.4),
        size * (0.35 + Math.random() * 0.5),
      );
      const mat = source.clone();
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = false;
      const mesh = new Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 0.08 + Math.random() * 0.2;
      mesh.position.set(
        origin.x + Math.cos(angle) * radius,
        origin.y + (Math.random() - 0.3) * 0.35,
        origin.z + Math.sin(angle) * radius,
      );
      mesh.quaternion.copy(boardQuat);
      const away = mesh.position.clone().sub(blast);
      if (away.lengthSq() < 0.0001) away.set(Math.cos(angle), 0.5, Math.sin(angle));
      away.normalize();
      const speed = 1.6 + Math.random() * 2.4;
      const vel = away.multiplyScalar(speed);
      vel.y += 1.2 + Math.random() * 1.6;
      const spin = new Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
      );
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        vel,
        spin,
        delay: Math.random() * 0.04,
        age: 0,
        life: 0.85 + Math.random() * 0.35,
      });
    }
  }

  private spawnGlassBurst(piece: Piece, floorY: number, boardQuat: Quaternion): void {
    const source = this.materials.goal;
    const cols = 4;
    const rows = 2;
    const depth = 4;
    const sx = (piece.hx * 2) / cols;
    const sy = (piece.hy * 2) / rows;
    const sz = (piece.hz * 2) / depth;
    const blast = this.ball.position.clone();
    for (let ix = 0; ix < cols; ix += 1) {
      for (let iy = 0; iy < rows; iy += 1) {
        for (let iz = 0; iz < depth; iz += 1) {
          const ox = (ix + 0.5) / cols - 0.5;
          const oy = (iy + 0.5) / rows - 0.5;
          const oz = (iz + 0.5) / depth - 0.5;
          const geo = new BoxGeometry(sx * 0.85, sy * 0.85, sz * 0.85);
          const mat = source.clone();
          mat.transparent = true;
          mat.opacity = 0.65;
          mat.depthWrite = false;
          const mesh = new Mesh(geo, mat);
          const local = new Vector3(
            piece.x + ox * piece.hx * 2,
            piece.y + floorY + oy * piece.hy * 2,
            piece.z + oz * piece.hz * 2,
          );
          mesh.position.copy(local.applyQuaternion(boardQuat));
          mesh.quaternion.copy(boardQuat);
          const away = mesh.position.clone().sub(blast);
          if (away.lengthSq() < 0.0001) away.set(ox + 0.001, 0.5, oz + 0.001);
          away.normalize();
          const speed = 1.8 + Math.random() * 2.6;
          const vel = away.multiplyScalar(speed);
          vel.y += 1.1 + Math.random() * 1.7;
          const spin = new Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
          );
          this.scene.add(mesh);
          this.debris.push({
            mesh,
            vel,
            spin,
            delay: Math.random() * 0.03,
            age: 0,
            life: 0.9 + Math.random() * 0.4,
          });
        }
      }
    }
  }

  private shatterRoofAt(index: number): void {
    const group = index >= 0 ? this.floorGroups[index] : null;
    if (!group) return;
    const pieces = group.userData.pieces as Piece[] | undefined;
    if (!pieces?.some((piece) => piece.kind === "roof")) return;
    const blast =
      (group.userData.start as { x: number; z: number } | null) ??
      (group.userData.hatch as { x: number; z: number } | null);
    if (!this.reduceMotion) {
      this.board.updateWorldMatrix(true, true);
      for (const piece of pieces) {
        if (piece.kind !== "roof") continue;
        this.spawnDebris(piece, group.position.y, this.board.quaternion, blast);
      }
    }
    for (const child of [...group.children]) {
      if (child.userData.pieceKind !== "roof") continue;
      group.remove(child);
      this.disposeGenerated(child);
    }
    group.userData.pieces = pieces.filter((piece) => piece.kind !== "roof");
  }

  private addPickups(parent: Group, layout: MazeLayout): void {
    for (const heart of layout.hearts) {
      const icon = makeHeartIcon(
        this.heartGeometry,
        // Same red as the body so spinning sides/back stay uniform (HUD keeps the dark rim).
        this.heartBodyMat,
        this.heartBodyMat,
        this.heartShadeMat,
      );
      icon.scale.setScalar(PICKUP_ICON_SCALE);
      icon.position.set(heart.x, 0.38, heart.z);
      icon.renderOrder = 2;
      for (const child of icon.children) {
        if (!(child instanceof Mesh)) continue;
        child.castShadow = true;
        child.renderOrder = 2;
      }
      const body = icon.children[1];
      parent.add(icon);
      this.hearts.push({
        root: icon,
        visual: body instanceof Mesh ? body : icon.children[0] as Mesh,
        cell: `${heart.c},${heart.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.38,
        kind: "heart",
      });
    }
    for (const coin of layout.coins) {
      const root = new Group();
      root.position.set(coin.x, 0.42, coin.z);
      root.scale.setScalar(PICKUP_ICON_SCALE);
      const visual = new Mesh(this.coinGeometry, this.coinMat);
      // makeCoinGeo already faces ±Z (disc in XY); parent spins around world Y.
      visual.castShadow = true;
      visual.renderOrder = 2;
      root.add(visual);
      parent.add(root);
      this.coins.push({
        root,
        visual,
        cell: `${coin.c},${coin.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.42,
        kind: "coin",
      });
    }
    this.addPowerUps(parent, layout);
  }

  private addPowerUps(parent: Group, layout: MazeLayout): void {
    for (const star of layout.stars) {
      const mesh = new Mesh(this.starGeometry, this.starMat);
      mesh.position.set(star.x, 0.4, star.z);
      mesh.castShadow = true;
      mesh.renderOrder = 2;
      parent.add(mesh);
      this.stars.push({
        root: mesh,
        visual: mesh,
        cell: `${star.c},${star.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.4,
        kind: "star",
      });
    }
    for (const wing of layout.wings) {
      const root = new Group();
      root.position.set(wing.x, 0.4, wing.z);
      const left = new Mesh(this.wingGeometry, this.wingMat);
      const right = new Mesh(this.wingGeometry, this.wingMat);
      left.scale.x = -1;
      left.position.x = -0.02;
      right.position.x = 0.02;
      left.rotation.y = 0.45;
      right.rotation.y = -0.45;
      left.castShadow = true;
      right.castShadow = true;
      left.renderOrder = 2;
      right.renderOrder = 2;
      root.add(left, right);
      parent.add(root);
      this.wings.push({
        root,
        visual: right,
        cell: `${wing.c},${wing.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.4,
        kind: "wings",
      });
    }
    for (const ghost of layout.ghosts) {
      const mesh = new Mesh(this.ghostGeometry, this.ghostMat);
      mesh.position.set(ghost.x, 0.4, ghost.z);
      // Tip toward the camera so the eye cutouts read from the usual overhead angle.
      mesh.rotation.x = -0.42;
      mesh.castShadow = true;
      mesh.renderOrder = 2;
      parent.add(mesh);
      this.ghosts.push({
        root: mesh,
        visual: mesh,
        cell: `${ghost.c},${ghost.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.4,
        kind: "ghost",
      });
    }
  }

  private clearPowerUpsOn(group: Group): void {
    for (const list of [this.stars, this.wings, this.ghosts]) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const bit = list[i];
        if (!bit || bit.group !== group) continue;
        this.dropPickup(bit);
        list.splice(i, 1);
      }
    }
  }

  private collectPickup(list: PickupBit[], cell: string): void {
    const group = this.floorGroups[this.currentFloor()];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const bit = list[i];
      if (!bit || bit.taken || bit.cell !== cell || bit.group !== group) continue;
      if (this.reduceMotion) {
        this.dropPickup(bit);
        list.splice(i, 1);
        continue;
      }
      bit.taken = true;
      bit.age = 0;
      if (bit.kind === "coin") this.spawnPickupSparks(bit, this.coinSparkColors);
      else if (bit.kind === "star") this.spawnPickupSparks(bit, this.starSparkColors);
      else if (bit.kind === "wings") this.spawnPickupSparks(bit, this.wingSparkColors);
      else if (bit.kind === "ghost") this.spawnPickupSparks(bit, this.ghostSparkColors);
      if (bit.kind === "heart" || bit.kind === "wings") {
        for (const child of bit.root.children) {
          if (!(child instanceof Mesh)) continue;
          const source = child.material;
          if (
            !(source instanceof MeshToonMaterial
              || source instanceof MeshStandardMaterial
              || source instanceof MeshBasicMaterial)
          ) {
            continue;
          }
          const mat = source.clone();
          mat.transparent = true;
          child.material = mat;
          child.userData.owned = true;
          child.userData.baseOpacity = source.opacity;
        }
        continue;
      }
      const source = bit.visual.material;
      if (source instanceof MeshToonMaterial || source instanceof MeshStandardMaterial) {
        const mat = source.clone();
        mat.transparent = true;
        bit.visual.material = mat;
        bit.visual.userData.owned = true;
      }
    }
  }

  private spawnPickupSparks(bit: PickupBit, colors: string[]): void {
    const origin = bit.root.position;
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      const color = colors[i % colors.length] ?? colors[0]!;
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(this.sparkGeometry, mat);
      mesh.position.set(origin.x, origin.y, origin.z);
      mesh.renderOrder = 3;
      const yaw = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const pitch = 0.35 + Math.random() * 1.1;
      const speed = 1.6 + Math.random() * 2.4;
      const vel = new Vector3(
        Math.cos(yaw) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed * 0.85 + 0.55,
        Math.sin(yaw) * Math.cos(pitch) * speed,
      );
      mesh.scale.setScalar(0.55 + Math.random() * 0.7);
      const dir = vel.clone().normalize();
      if (dir.lengthSq() > 0.001) {
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      }
      bit.group.add(mesh);
      this.sparks.push({
        mesh,
        parent: bit.group,
        vel,
        spin: new Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
        ),
        age: 0,
        life: 0.32 + Math.random() * 0.22,
      });
    }
  }

  private tickSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      if (!spark) continue;
      spark.age += dt;
      const t = spark.age / spark.life;
      if (!spark.mesh.parent || t >= 1) {
        this.dropSpark(spark);
        this.sparks.splice(i, 1);
        continue;
      }
      spark.vel.y -= 7.5 * dt;
      spark.mesh.position.addScaledVector(spark.vel, dt);
      spark.mesh.rotateX(spark.spin.x * dt);
      spark.mesh.rotateY(spark.spin.y * dt);
      spark.mesh.rotateZ(spark.spin.z * dt);
      const fade = 1 - t * t;
      spark.mesh.scale.setScalar(Math.max(0.05, (0.55 + fade * 0.7) * (1 - t * 0.55)));
      if (spark.mesh.material instanceof MeshBasicMaterial) spark.mesh.material.opacity = fade;
    }
  }

  private dropSpark(spark: Spark): void {
    spark.parent.remove(spark.mesh);
    if (spark.mesh.material instanceof MeshBasicMaterial) spark.mesh.material.dispose();
  }

  private clearSparks(): void {
    for (const spark of this.sparks) this.dropSpark(spark);
    this.sparks.length = 0;
  }

  private tickFireworks(dt: number): void {
    const meadow = this.meadow;
    if (!meadow) {
      this.clearFireworks();
      return;
    }
    this.fireworkCooldown -= dt;
    if (this.fireworkCooldown <= 0) {
      const salvos = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < salvos; i += 1) this.launchFirework(meadow);
      this.fireworkCooldown = 0.12 + Math.random() * 0.28;
      if (Math.random() < 0.45) this.fireworkCooldown *= 0.35;
    }
    for (let i = this.fireworks.length - 1; i >= 0; i -= 1) {
      const bit = this.fireworks[i];
      if (!bit) continue;
      bit.age += dt;
      const t = bit.age / bit.life;
      if (!bit.mesh.parent || t >= 1) {
        this.dropFirework(bit);
        this.fireworks.splice(i, 1);
        continue;
      }
      bit.vel.y -= bit.gravity * dt;
      bit.vel.multiplyScalar(Math.max(0, 1 - bit.drag * dt));
      bit.mesh.position.addScaledVector(bit.vel, dt);
      bit.mesh.rotateX(bit.spin.x * dt);
      bit.mesh.rotateY(bit.spin.y * dt);
      bit.mesh.rotateZ(bit.spin.z * dt);
      const fade = 1 - t * t;
      bit.mesh.scale.setScalar(Math.max(0.04, bit.baseScale * (0.65 + fade * 0.55)));
      if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.opacity = fade;
    }
  }

  private launchFirework(meadow: Group): void {
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const x = (Math.random() - 0.5) * span * 1.55;
    const y = span * (0.14 + Math.random() * 0.34);
    const z = -span * (0.12 + Math.random() * 0.55);
    const palette = this.fireworkColors;
    const main = palette[Math.floor(Math.random() * Math.max(1, palette.length - 1))] ?? palette[0]!;
    const colors = Math.random() < 0.55
      ? [main, palette[Math.floor(Math.random() * palette.length)] ?? main, "#ffffff"]
      : [main, main, "#ffffff"];
    const count = 48 + Math.floor(Math.random() * 36);
    const burst = 2.8 + Math.random() * 3.4;
    for (let i = 0; i < count; i += 1) {
      const color = colors[i % colors.length] ?? main;
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(this.sparkGeometry, mat);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = burst * (0.55 + Math.random() * 0.7);
      const vel = new Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      const baseScale = 0.7 + Math.random() * 0.9;
      mesh.scale.setScalar(baseScale);
      const dir = vel.clone().normalize();
      if (dir.lengthSq() > 0.001) {
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      }
      meadow.add(mesh);
      this.fireworks.push({
        mesh,
        parent: meadow,
        vel,
        spin: new Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ),
        age: 0,
        life: 0.85 + Math.random() * 0.7,
        gravity: 1.6 + Math.random() * 1.4,
        drag: 0.55 + Math.random() * 0.7,
        baseScale,
      });
    }
  }

  private dropFirework(bit: FireworkBit): void {
    bit.parent.remove(bit.mesh);
    if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.dispose();
  }

  private clearFireworks(): void {
    for (const bit of this.fireworks) this.dropFirework(bit);
    this.fireworks.length = 0;
    this.fireworkCooldown = 0;
  }

  private tickRain(dt: number): void {
    const meadow = this.meadow;
    if (!meadow) {
      this.clearRain();
      return;
    }
    this.rainCooldown -= dt;
    if (this.rainCooldown <= 0) {
      const drops = 10 + Math.floor(Math.random() * 14);
      for (let i = 0; i < drops; i += 1) this.spawnRaindrop(meadow);
      this.rainCooldown = 0.04 + Math.random() * 0.06;
    }
    for (let i = this.raindrops.length - 1; i >= 0; i -= 1) {
      const bit = this.raindrops[i];
      if (!bit) continue;
      bit.age += dt;
      const t = bit.age / bit.life;
      if (!bit.mesh.parent || t >= 1 || bit.mesh.position.y < -0.2) {
        this.dropRaindrop(bit);
        this.raindrops.splice(i, 1);
        continue;
      }
      bit.mesh.position.addScaledVector(bit.vel, dt);
      const fade = t < 0.75 ? 0.55 + (1 - t) * 0.35 : (1 - t) * 2.2;
      bit.mesh.scale.setScalar(Math.max(0.08, bit.baseScale * (0.85 + fade * 0.2)));
      if (bit.mesh.material instanceof MeshBasicMaterial) {
        bit.mesh.material.opacity = Math.max(0, Math.min(0.85, fade));
      }
    }
  }

  private spawnRaindrop(meadow: Group): void {
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const x = (Math.random() - 0.5) * span * 1.35;
    const y = span * (0.55 + Math.random() * 0.55);
    const z = (Math.random() - 0.5) * span * 1.15 - span * 0.08;
    const palette = this.rainColors;
    const color = palette[Math.floor(Math.random() * palette.length)] ?? "#9eb0c4";
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(this.rainGeometry, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    const wind = 0.35 + Math.random() * 0.55;
    const fall = 7.5 + Math.random() * 5.5;
    const vel = new Vector3(
      -wind * (0.7 + Math.random() * 0.6),
      -fall,
      wind * 0.15 * (Math.random() - 0.5),
    );
    const baseScale = 0.75 + Math.random() * 1.1;
    mesh.scale.set(0.55 + Math.random() * 0.5, baseScale, 0.55 + Math.random() * 0.5);
    const dir = vel.clone().normalize();
    if (dir.lengthSq() > 0.001) {
      mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    }
    meadow.add(mesh);
    this.raindrops.push({
      mesh,
      parent: meadow,
      vel,
      age: 0,
      life: 1.1 + Math.random() * 0.7,
      baseScale,
    });
  }

  private dropRaindrop(bit: RainBit): void {
    bit.parent.remove(bit.mesh);
    if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.dispose();
  }

  private clearRain(): void {
    for (const bit of this.raindrops) this.dropRaindrop(bit);
    this.raindrops.length = 0;
    this.rainCooldown = 0;
  }

  private tickPickups(list: PickupBit[], time: number, dt: number, spin: number, bob: number): void {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const bit = list[i];
      if (!bit) continue;
      if (!bit.root.parent) {
        list.splice(i, 1);
        continue;
      }
      if (!bit.taken) {
        if (bit.kind === "star" && bit.visual.material instanceof MeshToonMaterial) {
          const colors = this.starFlashColors;
          const hex = colors[Math.floor(time * 8) % colors.length] ?? this.starFlashColors[0]!;
          bit.visual.material.color.set(hex);
          bit.visual.material.emissive.set(hex);
        }
        if (this.reduceMotion) continue;
        bit.root.rotation.y = time * spin;
        bit.root.position.y = bit.baseY + Math.sin(time * bob + bit.root.position.x) * 0.04;
        if (bit.kind === "wings") {
          const flap = Math.sin(time * 5.5) * 0.28;
          const left = bit.root.children[0];
          const right = bit.root.children[1];
          if (left) left.rotation.z = flap;
          if (right) right.rotation.z = -flap;
        }
        continue;
      }
      bit.age += dt;
      if (bit.kind === "heart") {
        if (this.tickHeartPop(bit, dt)) continue;
        this.dropPickup(bit);
        list.splice(i, 1);
        continue;
      }
      const rise = Math.min(1, bit.age / 0.28);
      bit.root.position.y = bit.baseY + rise * 0.42;
      const baseScale = bit.kind === "coin" ? PICKUP_ICON_SCALE : 1;
      bit.root.scale.setScalar(baseScale * (1 + rise * 0.35));
      bit.root.rotation.y += dt * 6;
      if (bit.kind === "wings") {
        for (const child of bit.root.children) {
          if (!(child instanceof Mesh)) continue;
          const mat = child.material;
          if (mat instanceof MeshToonMaterial || mat instanceof MeshStandardMaterial) mat.opacity = 1 - rise;
        }
      } else {
        const mat = bit.visual.material;
        if (mat instanceof MeshToonMaterial || mat instanceof MeshStandardMaterial) mat.opacity = 1 - rise;
      }
      if (rise < 1) continue;
      this.dropPickup(bit);
      list.splice(i, 1);
    }
  }

  /** Grow, then pop with sparks. Returns true while the pop is still playing. */
  private tickHeartPop(bit: PickupBit, dt: number): boolean {
    const growFor = 0.2;
    const popFor = 0.12;
    bit.root.rotation.y += dt * (bit.age < growFor ? 2.4 : 7);
    if (bit.age <= growFor) {
      const t = easeOutCubic(bit.age / growFor);
      bit.root.scale.setScalar(PICKUP_ICON_SCALE * (1 + t * 0.95));
      bit.root.position.y = bit.baseY + t * 0.1;
      this.setPickupOpacity(bit, 1);
      return true;
    }
    if (bit.age - dt <= growFor) this.spawnPickupSparks(bit, this.heartSparkColors);
    const t = Math.min(1, (bit.age - growFor) / popFor);
    const snap = t * t * (3 - 2 * t);
    bit.root.scale.setScalar(PICKUP_ICON_SCALE * Math.max(0.01, 1.95 * (1 - snap)));
    bit.root.position.y = bit.baseY + 0.1 + snap * 0.06;
    this.setPickupOpacity(bit, 1 - snap);
    return t < 1;
  }

  private setPickupOpacity(bit: PickupBit, opacity: number): void {
    if (bit.kind === "heart" || bit.kind === "wings") {
      for (const child of bit.root.children) {
        if (!(child instanceof Mesh)) continue;
        const mat = child.material;
        if (
          mat instanceof MeshToonMaterial
          || mat instanceof MeshStandardMaterial
          || mat instanceof MeshBasicMaterial
        ) {
          const base = typeof child.userData.baseOpacity === "number" ? child.userData.baseOpacity : 1;
          mat.opacity = base * opacity;
        }
      }
      return;
    }
    const mat = bit.visual.material;
    if (mat instanceof MeshToonMaterial || mat instanceof MeshStandardMaterial) mat.opacity = opacity;
  }

  private dropPickup(bit: PickupBit): void {
    bit.group.remove(bit.root);
    if (bit.kind === "heart" || bit.kind === "wings") {
      for (const child of bit.root.children) {
        if (!(child instanceof Mesh)) continue;
        if (
          child.userData.owned === true
          && (child.material instanceof MeshToonMaterial
            || child.material instanceof MeshStandardMaterial
            || child.material instanceof MeshBasicMaterial)
        ) {
          child.material.dispose();
        }
      }
      return;
    }
    if (
      bit.visual.userData.owned === true
      && (bit.visual.material instanceof MeshToonMaterial || bit.visual.material instanceof MeshStandardMaterial)
    ) {
      bit.visual.material.dispose();
    }
  }

  private addPieces(parent: Group, pieces: Piece[], theme: FloorThemeId): Mesh | null {
    const surfaces = this.themeSurfaces.get(theme);
    const groups = new Map<PieceKind, BufferGeometry[]>();
    for (const piece of pieces) {
      if (piece.kind === "void") {
        this.addVoidFloor(parent, piece);
        continue;
      }
      if (piece.gate || piece.kind === "crumble" || piece.wall) {
        this.addLoose(parent, piece, theme);
        continue;
      }
      const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
      geo.translate(piece.x, piece.y, piece.z);
      const list = groups.get(piece.kind) ?? [];
      list.push(geo);
      groups.set(piece.kind, list);
    }
    let frame: Mesh | null = null;
    for (const [kind, geos] of groups) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos);
      if (!merged) continue;
      if (geos.length > 1) {
        for (const geo of geos) geo.dispose();
      }
      const shared = this.surfaceMaterial(kind, surfaces);
      const material = kind === "wall" ? shared.clone() : shared;
      const mesh = new Mesh(merged, material);
      mesh.userData.pieceKind = kind;
      mesh.castShadow = kind === "wall" || kind === "frame" || kind === "block" || kind === "roof";
      mesh.receiveShadow =
        kind === "floor" ||
        kind === "start" ||
        kind === "boost" ||
        kind === "warp" ||
        kind === "ice" ||
        kind === "crumble" ||
        kind === "block" ||
        kind === "switch" ||
        kind === "grout" ||
        kind === "roof";
      if (kind === "goal") {
        mesh.renderOrder = 2;
        mesh.castShadow = false;
      }
      if (kind === "frame") {
        frame = mesh;
        mesh.userData.theme = theme;
      }
      if (kind === "wall") {
        mesh.userData.owned = true;
        this.trackGhostWall(mesh);
      }
      parent.add(mesh);
    }
    return frame;
  }

  private surfaceMaterial(kind: PieceKind, surfaces: ThemeSurfaces | undefined): MeshToonMaterial {
    if (surfaces) {
      if (kind === "floor") return surfaces.floor;
      if (kind === "start") return surfaces.start;
      if (kind === "wall" || kind === "block") return surfaces.wall;
      if (kind === "grout") return surfaces.grout;
      if (kind === "frame") return surfaces.frame;
      if (kind === "roof") return surfaces.wall;
    }
    return this.materials[kind];
  }

  private syncShell(dt: number, snap: boolean): void {
    const current = this.currentFloor();
    let glass: MeshToonMaterial | null = null;
    for (let index = 0; index < this.frames.length; index += 1) {
      const mesh = this.frames[index];
      if (!mesh) continue;
      const theme = (mesh.userData.theme as FloorThemeId | undefined) ?? DEFAULT_FLOOR_THEME;
      const surfaces = this.themeSurfaces.get(theme);
      if (!surfaces) continue;
      if (index === current) {
        if (mesh.material !== surfaces.glass) {
          mesh.material = surfaces.glass;
          mesh.castShadow = false;
          mesh.renderOrder = 2;
          surfaces.glass.opacity = snap ? SHELL_ALPHA : 1;
        }
        glass = surfaces.glass;
        continue;
      }
      if (mesh.material !== surfaces.frame) {
        mesh.material = surfaces.frame;
        mesh.castShadow = true;
        mesh.renderOrder = 0;
      }
    }
    if (!glass) return;
    const blend = snap ? 1 : 1 - Math.exp(-8 * dt);
    glass.opacity += (SHELL_ALPHA - glass.opacity) * blend;
    glass.depthWrite = glass.opacity > 0.85;
  }

  private currentFloor(): number {
    let index = -1;
    let top = -Infinity;
    this.floorGroups.forEach((group, i) => {
      if (!group || group.position.y <= top) return;
      top = group.position.y;
      index = i;
    });
    return index;
  }

  private addMarkers(parent: Group, layout: MazeLayout): void {
    const start = new Mesh(facet(new TorusGeometry(0.26, 0.04, 4, 8)), this.startRingMat);
    start.rotation.x = Math.PI / 2;
    start.position.set(layout.start.x, 0.03, layout.start.z);
    parent.add(start);

    const goal = layout.hatch ?? layout.goal;
    const ring = new Mesh(facet(new TorusGeometry(0.34, 0.045, 4, 8)), this.goalRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(goal.x, 0.045, goal.z);
    ring.renderOrder = 2;
    this.goalRings.push(ring);
    parent.add(ring);

    const gate = new Mesh(this.exitGateGeometry, this.exitGateMat);
    gate.position.set(goal.x, EXIT_GATE_H / 2 + 0.02, goal.z);
    gate.renderOrder = 3;
    this.goalGates.push(gate);
    parent.add(gate);

    const light = new PointLight(this.goalLightColor, 3.2, 4.2, 2);
    light.position.set(goal.x, 0.62, goal.z);
    this.goalLights.push(light);
    parent.add(light);
  }

  private buildWinScene(kind: WinSceneKind): void {
    this.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.fireworkCooldown = 0.02 + Math.random() * 0.08;
    this.addGround(group, span, kind);
    if (kind === "pasture") {
      const stream = meadowStream(span);
      this.addRibbon(group, stream, this.streamDeepMat, this.streamMat);
      this.addMixedTrees(group, span, stream);
      this.addScatter(group, span, stream, this.groundMats.grassDark, true);
    } else if (kind === "beach") {
      this.addShore(group, span);
      this.addPalms(group, span);
      this.addScatter(group, span, null, this.groundMats.sandDark, false);
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
    } else {
      this.addDiscoFloor(group, span);
    }
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

  private buildFailScene(): void {
    this.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const ground = this.meadowGroundSpan(span);
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.rainCooldown = 0.01;

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
    for (let i = 0; i < 48; i += 1) this.spawnRaindrop(group);
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
      0.18,
      body,
      shade,
      pupils,
      whites,
    );
    ghost.userData.planetFloat = true;
    ghost.userData.baseY = ghost.position.y;
    ghost.userData.driftPhase = 0.6;
    ghost.userData.driftSpeed = 1.15;
    ghost.userData.bobAmp = 0.2;
    ghost.userData.spin = 0.22;
    parent.add(ghost);
    this.meadowFlames.push(ghost);
  }

  private buildHomeScene(): void {
    this.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    // Extra-wide ground plane so the 0.5× FOV still reads as barren rock, not void.
    const span = Math.max(tower.width, tower.depth) * 4.2;
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.rainCooldown = 0.01;

    const pad = new Mesh(new BoxGeometry(span, 0.28, span), this.groundMats.failGroundDark);
    pad.position.y = -0.14;
    pad.receiveShadow = organicProps;
    group.add(pad);

    const tiles = Math.max(6, Math.round(span / 2.0));
    if (this.failFloorMat.map) {
      this.failFloorMat.map.repeat.set(tiles, tiles);
      this.failFloorMat.map.needsUpdate = true;
    }
    const carpet = new Mesh(new PlaneGeometry(span, span), this.failFloorMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    carpet.receiveShadow = organicProps;
    group.add(carpet);

    const homeCtx = this.homeTowerContext();
    addBarrenRocks(homeCtx, group, span);
    // Tower footprint still keyed to the playable tower span, not the expanded ground.
    const towerSpan = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    addOminousTower(homeCtx, group, towerSpan);
    addFreePlayTrapdoor(homeCtx, group, span, towerSpan * 0.36);
    addHomeShacks(homeCtx, group, span, towerSpan * 0.36);

    const light = new PointLight("#eef4ff", 0, span * 3.2, 1.6);
    light.position.set(0, 1.5, span * 0.15);
    group.add(light);
    this.lightningLight = light;

    // Soft fill so the tower silhouette stays readable under the storm sky.
    const wash = new PointLight("#8a9bb0", 2.2, span * 1.8, 2);
    wash.position.set(span * 0.22, HOME_TOWER_H * 0.55, span * 0.35);
    group.add(wash);
    const rim = new PointLight("#6a8098", 1.6, span * 1.6, 2);
    rim.position.set(-span * 0.3, HOME_TOWER_H * 0.4, -span * 0.2);
    group.add(rim);

    this.board.add(group);
    this.meadow = group;
    for (let i = 0; i < 64; i += 1) this.spawnRaindrop(group);
  }

  private homeTowerContext(): HomeTowerContext {
    return {
      groundMats: this.groundMats,
      frameMat: this.materials.frame,
      onFloorMat: (mat) => {
        this.homeTowerFloorMat = mat;
      },
      onWallMat: (mat) => {
        this.homeTowerWallMat = mat;
      },
      onTowerDoorRoot: (root) => {
        this.homeDoorRoot = root;
      },
      onFreeDoorRoot: (root) => {
        this.homeFreeDoorRoot = root;
      },
    };
  }

  private applyHomeLighting(): void {
    this.hemiLight.intensity = 0.48;
    this.ambientLight.intensity = 0.22;
    this.key.intensity = 0.85;
    this.key.color.set("#b0bec8");
    this.key.position.set(6, HOME_TOWER_H * 0.85, 10);
  }

  private restoreHomeLighting(): void {
    this.hemiLight.intensity = 0.7;
    this.ambientLight.intensity = 0.28;
    this.key.intensity = 1.45;
    this.key.color.set("#fff6ea");
    this.key.position.set(4.4, 12.8, 6.2);
  }

  private tickLightning(dt: number): void {
    if (!this.homeBackdrop || this.reduceMotion) {
      if (this.lightningLight) this.lightningLight.intensity = 0;
      if (this.lightningBolt) this.lightningBolt.visible = false;
      this.setTowerLightningFlash(0);
      return;
    }
    this.lightningCooldown -= dt;
    if (this.lightningFlash > 0) {
      this.lightningFlash -= dt;
      const peak = this.lightningFlash > 0.05;
      const after = this.lightningFlash > 0.02;
      const burst = peak
        ? 28 + Math.random() * 22
        : after
          ? 8 + Math.random() * 10
          : 1.2 + Math.random() * 2.5;
      if (this.lightningLight) this.lightningLight.intensity = burst;
      this.hemiLight.intensity = 0.48 + burst * 0.12;
      this.ambientLight.intensity = 0.22 + burst * 0.07;
      this.key.intensity = 0.85 + burst * 0.08;
      // Tower stack is tall — emissive flash so every floor reads the strike.
      this.setTowerLightningFlash(peak ? 0.85 + Math.random() * 0.35 : after ? 0.35 : 0.08);
      if (this.lightningBolt) this.lightningBolt.visible = peak || after;
      if (this.lightningFlash <= 0) {
        if (this.lightningLight) this.lightningLight.intensity = 0;
        this.dropLightningBolt();
        this.hemiLight.intensity = 0.48;
        this.ambientLight.intensity = 0.22;
        this.key.intensity = 0.85;
        this.setTowerLightningFlash(0);
      }
      return;
    }
    if (this.lightningCooldown > 0) return;
    this.strikeLightning();
    // Frequent double/triple cracks for a violent storm.
    this.lightningCooldown = Math.random() < 0.55
      ? 0.08 + Math.random() * 0.16
      : 0.9 + Math.random() * 2.4;
  }

  private setTowerLightningFlash(amount: number): void {
    const a = Math.max(0, amount);
    if (this.homeTowerFloorMat) this.homeTowerFloorMat.emissiveIntensity = a * 0.9;
    if (this.homeTowerWallMat) this.homeTowerWallMat.emissiveIntensity = a;
  }

  private strikeLightning(): void {
    const meadow = this.meadow;
    if (!meadow) return;
    this.lightningFlash = 0.16 + Math.random() * 0.12;
    const span = HOME_BACKDROP_SPAN * 4.2;
    const side = Math.random() < 0.5 ? -1 : 1;
    // Strike beside the tower, mid-height so the stack catches the flash.
    const x = side * (span * (0.12 + Math.random() * 0.22));
    const z = span * (0.08 + Math.random() * 0.18) * (Math.random() < 0.5 ? 1 : -0.35);
    if (this.lightningLight) {
      this.lightningLight.position.set(x, HOME_TOWER_H * (0.35 + Math.random() * 0.45), z);
      this.lightningLight.intensity = 36;
      this.lightningLight.distance = Math.max(span * 2.8, HOME_TOWER_H * 2.4);
    }
    if (this.lightningBolt) this.dropLightningBolt();
    const bolt = new Group();
    bolt.userData.generated = true;
    const coreMat = new MeshBasicMaterial({
      color: "#f4f8ff",
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    });
    const glowMat = new MeshBasicMaterial({
      color: "#9eb8ff",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      toneMapped: false,
    });
    bolt.userData.boltMat = coreMat;
    bolt.userData.boltGlowMat = glowMat;

    const skyY = HOME_TOWER_H * 2.1 + Math.random() * 2.5;
    const floorY = 0.06;
    this.addLightningFork(bolt, coreMat, glowMat, x, skyY, z, x, floorY, z, 0.11, true);

    // Side branches that peel off mid-fall.
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branches; b += 1) {
      const t = 0.25 + Math.random() * 0.45;
      const by = skyY + (floorY - skyY) * t;
      const bx = x + (Math.random() - 0.5) * 0.4;
      const bz = z + (Math.random() - 0.5) * 0.4;
      const endX = bx + side * (1.2 + Math.random() * 2.4);
      const endZ = bz + (Math.random() - 0.5) * 2.2;
      const endY = Math.max(floorY, by - (2.5 + Math.random() * 5.5));
      this.addLightningFork(bolt, coreMat, glowMat, bx, by, bz, endX, endY, endZ, 0.055, false);
    }

    // Ground bloom where the bolt hits the barren floor.
    const bloom = new Mesh(
      new BoxGeometry(0.55 + Math.random() * 0.35, 0.08, 0.55 + Math.random() * 0.35),
      glowMat,
    );
    bloom.position.set(x, 0.08, z);
    bolt.add(bloom);

    meadow.add(bolt);
    this.lightningBolt = bolt;
  }

  private addLightningFork(
    parent: Group,
    coreMat: MeshBasicMaterial,
    glowMat: MeshBasicMaterial,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    thickness: number,
    main: boolean,
  ): void {
    const drop = Math.max(0.5, y0 - y1);
    const segments = main
      ? Math.max(10, Math.round(drop / 1.15))
      : Math.max(4, Math.round(drop / 1.6));
    let cx = x0;
    let cy = y0;
    let cz = z0;
    for (let i = 0; i < segments; i += 1) {
      const t = (i + 1) / segments;
      const remain = segments - i;
      const step = (cy - y1) / remain;
      const len = Math.min(step, 0.7 + Math.random() * 1.35);
      const jag = main ? 0.85 : 1.25;
      const nx = i === segments - 1
        ? x1
        : cx + (x1 - cx) * (1 / remain) + (Math.random() - 0.5) * jag;
      const nz = i === segments - 1
        ? z1
        : cz + (z1 - cz) * (1 / remain) + (Math.random() - 0.5) * jag * 0.85;
      const ny = i === segments - 1 ? y1 : cy - len;
      const dx = nx - cx;
      const dy = ny - cy;
      const dz = nz - cz;
      const segLen = Math.hypot(dx, dy, dz) || 0.01;
      const thick = thickness * (main ? (1.15 - t * 0.35) : 0.7);
      const core = new Mesh(new BoxGeometry(thick, segLen, thick), coreMat);
      const glow = new Mesh(new BoxGeometry(thick * 2.6, segLen * 1.02, thick * 2.6), glowMat);
      const midX = (cx + nx) * 0.5;
      const midY = (cy + ny) * 0.5;
      const midZ = (cz + nz) * 0.5;
      const orient = (mesh: Mesh): void => {
        mesh.position.set(midX, midY, midZ);
        mesh.quaternion.setFromUnitVectors(
          new Vector3(0, 1, 0),
          new Vector3(dx / segLen, dy / segLen, dz / segLen),
        );
        parent.add(mesh);
      };
      orient(glow);
      orient(core);
      cx = nx;
      cy = ny;
      cz = nz;
    }
  }

  private dropLightningBolt(): void {
    const bolt = this.lightningBolt;
    if (!bolt) return;
    this.meadow?.remove(bolt);
    const mat = bolt.userData.boltMat;
    const glow = bolt.userData.boltGlowMat;
    bolt.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.geometry.dispose();
    });
    if (mat instanceof MeshBasicMaterial) mat.dispose();
    if (glow instanceof MeshBasicMaterial) glow.dispose();
    this.lightningBolt = null;
  }

  private clearLightning(): void {
    this.lightningFlash = 0;
    this.lightningCooldown = 1;
    if (this.lightningLight) {
      this.lightningLight.intensity = 0;
      this.lightningLight = null;
    }
    this.dropLightningBolt();
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
    return Math.max(contentSpan * MEADOW_GROUND_MULT, this.camera.far * 2.4);
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
    const places = [
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

  private addShore(parent: Group, span: number): void {
    const ocean = new Mesh(new BoxGeometry(span * 1.05, 0.14, span * 0.42), this.oceanDeepMat);
    ocean.position.set(0, -0.06, span * 0.32);
    const foam = new Mesh(new BoxGeometry(span * 1.02, 0.08, span * 0.28), this.oceanMat);
    foam.position.set(0, 0.01, span * 0.22);
    parent.add(ocean, foam);
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
    const rim = span * 0.38;
    const spots = [
      [-0.8, -0.15, 1.5], [-0.45, -0.55, 1.3], [0.7, -0.35, 1.6],
      [0.85, 0.1, 1.25], [-0.15, -0.7, 1.4],
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

  private clearMeadow(): void {
    this.clearFireworks();
    this.clearRain();
    this.dropLightningBolt();
    this.lightningLight = null;
    this.setTowerLightningFlash(0);
    this.homeTowerFloorMat = null;
    this.homeTowerWallMat = null;
    this.homeDoorRoot = null;
    this.homeFreeDoorRoot = null;
    if (this.meadow) {
      this.board.remove(this.meadow);
      this.meadow.traverse((child) => this.disposeGenerated(child));
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

  private fit(): void {
    this.placeCamera();
  }

  private beginMeadowCamera(): void {
    this.meadowCamFromPos.copy(this.camera.position);
    this.meadowCamFromLook.set(0, this.focusY, 0).applyQuaternion(this.board.quaternion);
    this.meadowCamLive = true;
    this.meadowCamT = this.reduceMotion ? 1 : 0;
    this.restCamera();
  }

  private tickMeadowCamera(dt: number): void {
    if (!this.meadowCamLive || this.meadowCamT >= 1) return;
    if (this.reduceMotion) {
      this.meadowCamT = 1;
      return;
    }
    this.meadowCamT = Math.min(1, this.meadowCamT + dt / MEADOW_CAM_SECS);
  }

  private placeCamera(): void {
    if (this.enterCtl.state) {
      this.placeEnterPlayCamera();
      return;
    }
    if (!this.tower) return;
    if (this.homeBackdrop) {
      this.placeHomeCamera();
      return;
    }
    if (this.escaped && this.meadowCamLive) {
      this.placeMeadowCamera();
      return;
    }
    this.computePlayCamera(this.enterCtl.eye, this.enterCtl.look);
    this.camera.position.copy(this.enterCtl.eye);
    this.camera.lookAt(this.enterCtl.look);

    const low = this.escaped ? 0 : this.lowest();
    const span = Math.max(this.tower.width, this.tower.depth) + Math.abs(low) * 0.28;
    const range = span * 0.78 + Math.abs(low) * 0.2;
    const shadow = this.key.shadow.camera as OrthographicCamera;
    shadow.left = -range;
    shadow.right = range;
    shadow.top = range;
    shadow.bottom = -range;
    shadow.updateProjectionMatrix();
    this.key.target.position.copy(this.enterCtl.look);
  }

  /** Play-orbit eye/look for the current tower (includes board rise offset). */
  private computePlayCamera(outEye: Vector3, outLook: Vector3): void {
    computePlayOrbitCamera(outEye, outLook, {
      tower: this.tower,
      focusY: this.focusY,
      board: this.board,
      lowest: this.lowest(),
      escaped: this.escaped,
      aspect: this.aspect,
      settings: this.settings,
      angleDeg: shownPlayAngle(this.settings, this.playGlance.glanceDAngle),
      orbitDeg: shownPlayOrbit(this.settings, this.playGlance.glanceDOrbit),
      fovDeg: this.enterCtl.state?.toFov ?? this.camera.fov,
      fallbackEye: this.camera.position,
    });
  }

  private placeEnterPlayCamera(): void {
    if (!this.enterCtl.state) return;
    const ctl = this.enterCtl;
    ctl.place();
    this.meadowCamEye.copy(ctl.eye);
    this.meadowCamLook.copy(ctl.look);

    const tower = this.tower;
    const span = tower ? Math.max(tower.width, tower.depth) : HOME_BACKDROP_SPAN;
    const range = Math.max(span * 2.2, HOME_TOWER_H * 0.55) * 0.9;
    const shadow = this.key.shadow.camera as OrthographicCamera;
    shadow.left = -range;
    shadow.right = range;
    shadow.top = range;
    shadow.bottom = -range;
    shadow.updateProjectionMatrix();
    this.key.target.position.copy(ctl.look);
  }

  private placeHomeCamera(): void {
    const tower = this.tower;
    if (!tower) return;
    const meadowY = this.meadow?.position.y ?? defaultMeadowY();
    placeHomeBackdropCamera(this.meadowCamEye, this.meadowCamLook, {
      homeViewEye: this.homeViewEye,
      homeViewLook: this.homeViewLook,
      meadowCamEye: this.meadowCamEye,
      meadowCamLook: this.meadowCamLook,
    }, {
      tower,
      meadowY,
      homeOrbit: this.homeOrbit,
      glance: this.playGlance,
      homeView: this.homeView,
      homeViewBlend: this.homeViewBlend,
      homeViewFromEye: this.homeViewFromEye,
      homeViewFromLook: this.homeViewFromLook,
      boardQuat: this.board.quaternion,
    });

    this.camera.position.copy(this.meadowCamEye);
    this.camera.lookAt(this.meadowCamLook);

    const range = Math.max(tower.width * 2.8, HOME_TOWER_H) * 0.9;
    const shadow = this.key.shadow.camera as OrthographicCamera;
    shadow.left = -range;
    shadow.right = range;
    shadow.top = range;
    shadow.bottom = -range;
    shadow.updateProjectionMatrix();
    this.key.target.position.copy(this.meadowCamLook);
  }

  private placeMeadowCamera(): void {
    const tower = this.tower;
    if (!tower) return;
    const meadowY = this.meadow?.position.y ?? defaultMeadowY();
    placeMeadowWinCamera(
      this.camera.position,
      this.meadowCamLookBlend,
      {
        meadowCamEye: this.meadowCamEye,
        meadowCamLook: this.meadowCamLook,
        meadowCamLookBlend: this.meadowCamLookBlend,
      },
      {
        tower,
        meadowY,
        glance: this.playGlance,
        meadowCamT: this.meadowCamT,
        meadowCamFromPos: this.meadowCamFromPos,
        meadowCamFromLook: this.meadowCamFromLook,
        boardQuat: this.board.quaternion,
        spanMult: MEADOW_SPAN_MULT,
      },
    );
    this.camera.lookAt(this.meadowCamLookBlend);

    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const range = span * 0.85;
    const shadow = this.key.shadow.camera as OrthographicCamera;
    shadow.left = -range;
    shadow.right = range;
    shadow.top = range;
    shadow.bottom = -range;
    shadow.updateProjectionMatrix();
    this.key.target.position.copy(this.meadowCamLookBlend);
  }

  private addTileMarks(parent: Group, layout: MazeLayout): void {
    for (const boost of layout.boosts) {
      const group = new Group();
      const dir = DIRECTION_VECTOR[boost.dir];
      group.position.set(boost.x, 0.03, boost.z);
      group.rotation.y = Math.atan2(-dir.x, -dir.z);
      for (const z of [0.18, -0.16]) {
        const arrow = new Mesh(this.arrowGeometry, this.boostMarkMat);
        arrow.position.z = z;
        arrow.renderOrder = 2;
        group.add(arrow);
      }
      parent.add(group);
    }

    for (const warp of layout.warps) {
      const tone = warp.pair % WARP_COLOR_COUNT;
      const mat = this.warpMats[tone];
      const gateMat = this.warpGateMats[tone];
      if (!mat || !gateMat) continue;
      const spin = new Group();
      spin.position.set(warp.x, 0, warp.z);
      const ring = new Mesh(facet(new TorusGeometry(0.32, 0.045, 4, 8)), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.034;
      ring.renderOrder = 2;
      const disc = new Mesh(new CircleGeometry(0.12, 6), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.022;
      disc.renderOrder = 2;
      const gate = new Mesh(this.warpGateGeometry, gateMat);
      gate.position.y = WARP_GATE_H / 2 + 0.02;
      gate.renderOrder = 3;
      spin.add(ring, disc, gate);
      this.warpSpins.push(spin);
      parent.add(spin);
    }

    for (const ice of layout.ices) {
      const group = new Group();
      group.position.set(ice.x, 0.02, ice.z);
      group.rotation.y = 0.55;
      for (const z of [-0.14, 0, 0.14]) {
        const streak = new Mesh(new BoxGeometry(0.42, 0.024, 0.06), this.iceMarkMat);
        streak.position.z = z;
        streak.renderOrder = 2;
        group.add(streak);
      }
      parent.add(group);
    }

    for (const plate of layout.switches) {
      const tone = plate.tone % SWITCH_COLOR_COUNT;
      const cubeMat = this.switchCubeMats[tone];
      if (!cubeMat) continue;
      const group = new Group();
      group.position.set(plate.x, 0, plate.z);
      const cube = new Mesh(this.switchCubeGeometry, cubeMat);
      cube.position.y = SWITCH_CUBE * 0.5 + 0.06;
      cube.renderOrder = 3;
      cube.userData.gate = plate.gate ?? "";
      cube.userData.shattered = false;
      cube.userData.tone = tone;
      group.add(cube);
      this.switchSpins.push(cube);
      parent.add(group);
    }
  }

  private addVoidFloor(parent: Group, piece: Piece): void {
    const mesh = new Mesh(new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2), this.voidStarMat);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.userData.pieceKind = "void";
    mesh.renderOrder = -1;
    parent.add(mesh);
  }

  private syncVoidStars(time: number): void {
    this.camera.getWorldDirection(this.voidCamDir);
    this.voidStarMat.uniforms.uCamDir.value.copy(this.voidCamDir);
    this.voidStarMat.uniforms.uTime.value = this.reduceMotion ? 0 : time;
  }

  private addLoose(parent: Group, piece: Piece, theme: FloorThemeId = DEFAULT_FLOOR_THEME): void {
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const surfaces = this.themeSurfaces.get(theme);
    const shared = this.surfaceMaterial(piece.kind, surfaces);
    const material = piece.oneWay
      ? this.gateWallMaterials(piece.oneWay)
      : piece.gate
        ? this.switchGateWallMaterial(piece.tone ?? 0)
        : piece.kind === "crumble" || piece.kind === "wall"
          ? shared.clone()
          : shared;
    const mesh = new Mesh(geo, material);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.castShadow = piece.kind === "wall";
    mesh.receiveShadow = false;
    mesh.userData.restX = piece.x;
    mesh.userData.restY = piece.y;
    if (piece.kind === "crumble") {
      mesh.userData.owned = true;
      mesh.userData.cell = piece.cell ?? "";
      if (material instanceof MeshToonMaterial) {
        material.transparent = true;
        material.opacity = 0;
        material.depthWrite = false;
      }
      const chunkMat = shared.clone();
      mesh.userData.chunkMat = chunkMat;
      const slab = new Mesh(new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2), chunkMat);
      slab.castShadow = true;
      slab.receiveShadow = true;
      mesh.add(slab);
      mesh.userData.slab = slab;
      mesh.userData.chunks = crumbleChunks(mesh, piece, chunkMat);
      mesh.userData.apart = 0;
      const well = makeCrumbleWell(piece, this.materials.pit, this.materials.lip, this.voidStarMat);
      well.visible = false;
      mesh.add(well);
      mesh.userData.well = well;
      this.crumbleMeshes.push(mesh);
    }
    if (piece.kind === "wall") {
      mesh.userData.owned = true;
      this.trackGhostWall(mesh);
    }
    if (piece.gate) {
      mesh.userData.gate = piece.gate;
      mesh.userData.ownedMats = true;
      this.gateMeshes.push(mesh);
    }
    if (piece.oneWay) {
      mesh.userData.oneWay = piece.oneWay;
      mesh.userData.ownedMats = true;
      this.addGateSigns(mesh, piece);
      this.oneWayMeshes.push(mesh);
    }
    if (piece.wall) {
      mesh.userData.wall = piece.wall;
      mesh.userData.piece = piece;
      mesh.userData.shattered = false;
      this.smashWalls.push(mesh);
    }
    parent.add(mesh);
  }

  private trackGhostWall(mesh: Mesh): void {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.userData.baseEmissives = mats.map((mat) => {
      if (!(mat instanceof MeshToonMaterial)) return { hex: 0, intensity: 0 };
      return { hex: mat.emissive.getHex(), intensity: mat.emissiveIntensity };
    });
    const first = mats[0];
    if (first instanceof MeshToonMaterial) {
      mesh.userData.baseEmissive = first.emissive.getHex();
      mesh.userData.baseEmissiveIntensity = first.emissiveIntensity;
    }
    this.ghostWalls.push(mesh);
  }

  /** Box face order: +x, -x, +y, -y, +z, -z — green on entry, red on blocked; top matches editor. */
  private gateWallMaterials(dir: NonNullable<Piece["oneWay"]>): MeshToonMaterial[] {
    const ok = this.gateOkWallMat.clone();
    const no = this.gateNoWallMat.clone();
    const edge = this.gateEdgeWallMat.clone();
    const top = this.gateTopMaterial(dir);
    if (dir === "e") return [no, ok, top, edge, edge, edge];
    if (dir === "w") return [ok, no, top, edge, edge, edge];
    if (dir === "s") return [edge, edge, top, edge, no, ok];
    return [edge, edge, top, edge, ok, no];
  }

  /** Half green / half red on +y, same split as the editor wall preview. */
  private gateTopMaterial(dir: NonNullable<Piece["oneWay"]>): MeshToonMaterial {
    const mat = toon("#ffffff", "#ffffff", 0.22);
    mat.map = this.gateTopTextures[dir];
    return mat;
  }

  /** Full wall painted with the linked switch colour so the barrier is obvious. */
  private switchGateWallMaterial(tone: number): MeshToonMaterial {
    const color = token(`--maze-switch-${tone % SWITCH_COLOR_COUNT}`);
    return toon(color, color, 0.45);
  }

  /** Green tick on entry, red bang on blocked, arrow on top pointing travel. */
  private addGateSigns(mesh: Mesh, piece: Piece): void {
    if (!piece.oneWay) return;
    const allow = new Mesh(this.gateSignGeometry, this.gateAllowMat);
    const deny = new Mesh(this.gateSignGeometry, this.gateDenyMat);
    const size = 0.3;
    const pad = 0.018;
    allow.scale.setScalar(size);
    deny.scale.setScalar(size);
    allow.renderOrder = 3;
    deny.renderOrder = 3;
    if (piece.oneWay === "e") {
      allow.position.set(-(piece.hx + pad), 0.02, 0);
      allow.rotation.y = -Math.PI / 2;
      deny.position.set(piece.hx + pad, 0.02, 0);
      deny.rotation.y = Math.PI / 2;
    } else if (piece.oneWay === "w") {
      allow.position.set(piece.hx + pad, 0.02, 0);
      allow.rotation.y = Math.PI / 2;
      deny.position.set(-(piece.hx + pad), 0.02, 0);
      deny.rotation.y = -Math.PI / 2;
    } else if (piece.oneWay === "s") {
      allow.position.set(0, 0.02, -(piece.hz + pad));
      allow.rotation.y = Math.PI;
      deny.position.set(0, 0.02, piece.hz + pad);
      deny.rotation.y = 0;
    } else {
      allow.position.set(0, 0.02, piece.hz + pad);
      allow.rotation.y = 0;
      deny.position.set(0, 0.02, -(piece.hz + pad));
      deny.rotation.y = Math.PI;
    }

    const dir = DIRECTION_VECTOR[piece.oneWay];
    const arrow = new Mesh(this.arrowGeometry, this.gateMarkMat);
    arrow.position.set(0, piece.hy + 0.02, 0);
    arrow.rotation.y = Math.atan2(-dir.x, -dir.z);
    arrow.scale.set(0.8, 1, 0.9);
    arrow.renderOrder = 2;
    mesh.add(allow, deny, arrow);
  }

  /** Interior walls go soft and pulse while the ghost power-up is active. */
  private syncGhostWalls(pose: Pose, time: number): void {
    const on = pose.ghostPower > 0;
    if (!on && !this.ghostWallsLit) return;
    const active = this.floorGroups[this.currentFloor()];
    const hurry = on && pose.ghostPower < 0.28;
    const wave = this.reduceMotion
      ? 0.55
      : 0.5 + 0.5 * Math.sin(time * (hurry ? 9 : 4.2));
    const opacity = on ? 0.16 + 0.22 * wave : 1;
    const glow = on ? 0.2 + 0.45 * wave : 0;
    for (let i = this.ghostWalls.length - 1; i >= 0; i -= 1) {
      const mesh = this.ghostWalls[i];
      if (!mesh?.parent) {
        this.ghostWalls.splice(i, 1);
        continue;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const bases = (mesh.userData.baseEmissives as { hex: number; intensity: number }[] | undefined)
        ?? mats.map(() => ({
          hex: (mesh.userData.baseEmissive as number | undefined) ?? 0,
          intensity: (mesh.userData.baseEmissiveIntensity as number | undefined) ?? 0,
        }));
      const live = on && mesh.parent === active && !mesh.userData.shattered;
      let any = false;
      for (let m = 0; m < mats.length; m += 1) {
        const mat = mats[m];
        if (!(mat instanceof MeshToonMaterial)) continue;
        any = true;
        const base = bases[m] ?? { hex: 0, intensity: 0 };
        if (live) {
          mat.transparent = true;
          mat.opacity = opacity;
          mat.depthWrite = false;
          mat.emissive.set(this.ghostAuraColor);
          mat.emissiveIntensity = glow;
          continue;
        }
        if (!mat.transparent && mat.opacity >= 1 && mat.emissiveIntensity === base.intensity) continue;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.emissive.setHex(base.hex);
        mat.emissiveIntensity = base.intensity;
      }
      if (!any) continue;
    }
    this.ghostWallsLit = on;
  }

  private syncTiles(pose: Pose, time: number): void {
    const smashed = new Set(pose.smashed);
    for (let i = this.smashWalls.length - 1; i >= 0; i -= 1) {
      const mesh = this.smashWalls[i];
      if (!mesh?.parent) {
        this.smashWalls.splice(i, 1);
        continue;
      }
      const id = mesh.userData.wall as string;
      const gone = smashed.has(id);
      if (gone && !mesh.userData.shattered) {
        mesh.userData.shattered = true;
        mesh.visible = false;
        if (!this.reduceMotion) {
          const piece = mesh.userData.piece as Piece;
          const floorY = (mesh.parent as Group | null)?.position.y ?? 0;
          this.board.updateWorldMatrix(true, true);
          this.spawnWallBurst(piece, floorY, this.board.quaternion, mesh);
        }
      } else if (!gone && mesh.userData.shattered) {
        mesh.userData.shattered = false;
        mesh.visible = true;
        mesh.position.y = mesh.userData.restY as number;
      }
    }

    const open = new Set(pose.gates);
    for (let i = this.gateMeshes.length - 1; i >= 0; i -= 1) {
      const mesh = this.gateMeshes[i];
      if (!mesh?.parent) {
        this.gateMeshes.splice(i, 1);
        continue;
      }
      if (mesh.userData.shattered) continue;
      const rest = mesh.userData.restY as number;
      const target = open.has(mesh.userData.gate as string) ? rest - 0.86 : rest;
      const blend = this.reduceMotion ? 1 : 0.22;
      mesh.position.y += (target - mesh.position.y) * blend;
    }

    this.syncSwitchCubes(open);

    const openWays = new Set(pose.oneWays);
    for (let i = this.oneWayMeshes.length - 1; i >= 0; i -= 1) {
      const mesh = this.oneWayMeshes[i];
      if (!mesh?.parent) {
        this.oneWayMeshes.splice(i, 1);
        continue;
      }
      if (mesh.userData.shattered) continue;
      const rest = mesh.userData.restY as number;
      const id = mesh.userData.wall as string | undefined;
      const target = id && openWays.has(id) ? rest - 0.86 : rest;
      const blend = this.reduceMotion ? 1 : 0.28;
      mesh.position.y += (target - mesh.position.y) * blend;
    }

    const crumble = new Map(pose.crumbles.map((item) => [item.cell, item]));
    for (let i = this.crumbleMeshes.length - 1; i >= 0; i -= 1) {
      const mesh = this.crumbleMeshes[i];
      if (!mesh?.parent) {
        this.crumbleMeshes.splice(i, 1);
        continue;
      }
      const info = crumble.get(mesh.userData.cell as string);
      mesh.position.x = mesh.userData.restX as number;
      mesh.position.y = mesh.userData.restY as number;
      mesh.visible = true;
      const progress = info?.progress ?? 0;
      const gone = info?.gone === true;
      const apart = mesh.userData.apart as number;
      const target = gone ? 1 : 0;
      const next = this.reduceMotion ? target : apart + (target - apart) * 0.16;
      mesh.userData.apart = next;
      const crack = gone ? 1 : progress;
      const chunkMat = mesh.userData.chunkMat;
      if (chunkMat instanceof MeshToonMaterial) chunkMat.emissiveIntensity = 0.04 + crack * 0.9 * (1 - next);
      const slab = mesh.userData.slab as Mesh | undefined;
      const breaking = crack > 0.12 || gone;
      if (slab) {
        slab.visible = !breaking;
        if (!breaking) {
          slab.position.y = this.reduceMotion ? 0 : Math.sin(time * 22) * 0.006 * crack;
          slab.rotation.y = this.reduceMotion ? 0 : Math.sin(time * 17) * 0.01 * crack;
        }
      }
      const chunks = mesh.userData.chunks as Mesh[];
      for (const chunk of chunks) {
        const dx = chunk.userData.dirX as number;
        const dz = chunk.userData.dirZ as number;
        const tilt = chunk.userData.tilt as number;
        const spread = crack * 0.034 + next * 0.2;
        const sink = crack * crack * 0.07 + next * 1.05;
        chunk.position.x = (chunk.userData.restX as number) + dx * spread;
        chunk.position.z = (chunk.userData.restZ as number) + dz * spread;
        chunk.position.y = -sink;
        const spin = this.reduceMotion ? 0 : (crack * 0.45 + next * 1.8) * tilt;
        chunk.rotation.x = dz * spin * 0.4;
        chunk.rotation.z = -dx * spin * 0.4;
        chunk.rotation.y = this.reduceMotion ? 0 : Math.sin(time * 2.4 + tilt) * next * 0.6;
        chunk.visible = breaking && next < 0.94;
      }
      const well = mesh.userData.well as Group | undefined;
      if (well) well.visible = gone || next > 0.55;
    }
  }

  private disposeGenerated(child: object): void {
    if (!(child instanceof Mesh)) return;
    const shared =
      child.geometry === this.arrowGeometry
      || child.geometry === this.gateSignGeometry
      || child.geometry === this.heartGeometry
      || child.geometry === this.coinGeometry
      || child.geometry === this.starGeometry
      || child.geometry === this.wingGeometry
      || child.geometry === this.ghostGeometry
      || child.geometry === this.sparkGeometry
      || child.geometry === this.rainGeometry
      || child.geometry === this.switchCubeGeometry
      || child.geometry === this.warpGateGeometry
      || child.geometry === this.exitGateGeometry;
    if (this.switchCubeMats.includes(child.material as MeshToonMaterial)) {
      return;
    }
    if (
      child.material === this.gateAllowMat
      || child.material === this.gateDenyMat
      || child.material === this.gateMarkMat
    ) {
      return;
    }
    if (!shared) child.geometry.dispose();
    if (child.userData.chunkMat instanceof MeshToonMaterial) child.userData.chunkMat.dispose();
    if (child.userData.owned === true || child.userData.ownedMats === true) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (
          mat instanceof MeshToonMaterial
          || mat instanceof MeshStandardMaterial
          || mat instanceof MeshBasicMaterial
        ) {
          mat.dispose();
        }
      }
    }
    if (
      child.material instanceof MeshBasicMaterial
      && (child.geometry === this.sparkGeometry || child.geometry === this.rainGeometry)
    ) {
      child.material.dispose();
    }
  }

  private clearGenerated(): void {
    this.clearSparks();
    this.clearFireworks();
    this.clearRain();
    const gone = this.board.children.filter((child) => child.userData.generated === true);
    for (const obj of gone) {
      this.board.remove(obj);
      obj.traverse((child) => this.disposeGenerated(child));
    }
    this.goalRings.length = 0;
    this.goalGates.length = 0;
    this.goalLights.length = 0;
    this.exitBreached = false;
    this.meadow = null;
    this.meadowFlowers.length = 0;
    this.meadowAnimals.length = 0;
    this.meadowFlames.length = 0;
    this.meadowDisco.length = 0;
    this.meadowDiscoBall = null;
    this.meadowLight = null;
    this.meadowWinLetters = null;
    this.hearts.length = 0;
    this.coins.length = 0;
    this.stars.length = 0;
    this.wings.length = 0;
    this.ghosts.length = 0;
    this.warpSpins.length = 0;
    this.switchSpins.length = 0;
    this.gateMeshes.length = 0;
    this.oneWayMeshes.length = 0;
    this.smashWalls.length = 0;
    this.ghostWalls.length = 0;
    this.ghostWallsLit = false;
    this.crumbleMeshes.length = 0;
  }

  private syncHoverAura(pose: Pose, time: number): void {
    const power = Math.max(pose.hoverPower, pose.ghostPower);
    const on = power > 0;
    this.ballAura.visible = on;
    if (!on) return;
    this.ballAuraMat.color.set(pose.ghostPower > pose.hoverPower ? this.ghostAuraColor : this.hoverAuraColor);
    const hurry = power < 0.28;
    const pulse = this.reduceMotion
      ? 0.3
      : 0.22 + (0.14 + (hurry ? 0.1 : 0)) * (0.5 + 0.5 * Math.sin(time * (hurry ? 10 : 4.5)));
    this.ballAuraMat.opacity = pulse;
    const swell = this.reduceMotion ? 1 : 1 + 0.06 * Math.sin(time * (hurry ? 9 : 3.6));
    this.ballAura.scale.setScalar(swell);
  }

  private syncStarBall(pose: Pose, time: number): void {
    if (pose.starPower <= 0) {
      if (!this.starFlashing) return;
      this.starFlashing = false;
      this.paintBallColor(this.ballBaseColor, this.bandBaseColor);
      return;
    }
    this.starFlashing = true;
    if (this.reduceMotion) {
      this.paintBallColor(this.starFlashColors[0] ?? this.ballBaseColor, "#ffffff");
      return;
    }
    const hurry = pose.starPower < 0.28;
    const rate = hurry ? 16 : 8;
    const colors = this.starFlashColors;
    const index = Math.floor(time * rate) % colors.length;
    const hex = colors[index] ?? this.ballBaseColor;
    this.paintBallColor(hex, "#ffffff");
  }

  private paintBallColor(body: string, band: string): void {
    this.ballToonMat.color.set(body);
    this.ballSmoothMat.color.set(body);
    this.bandPixelMat.color.set(band);
    this.bandSmoothMat.color.set(band);
  }

  private spawnWallBurst(
    piece: Piece,
    floorY: number,
    boardQuat: Quaternion,
    from?: Mesh,
  ): void {
    const shared = from?.material;
    const source = shared instanceof MeshToonMaterial
      ? shared
      : this.materials[piece.kind];
    if (!(source instanceof MeshToonMaterial)) return;
    const long = Math.max(piece.hx, piece.hz);
    const cols = long > 0.2 ? 4 : 2;
    const rows = 3;
    const depth = long > 0.2 ? 2 : 2;
    const sx = (piece.hx * 2) / cols;
    const sy = (piece.hy * 2) / rows;
    const sz = (piece.hz * 2) / depth;
    const blast = this.ball.position.clone();
    for (let ix = 0; ix < cols; ix += 1) {
      for (let iy = 0; iy < rows; iy += 1) {
        for (let iz = 0; iz < depth; iz += 1) {
          const ox = (ix + 0.5) / cols - 0.5;
          const oy = (iy + 0.5) / rows - 0.5;
          const oz = (iz + 0.5) / depth - 0.5;
          const geo = new BoxGeometry(sx * 0.9, sy * 0.9, sz * 0.9);
          const mat = source.clone();
          mat.transparent = true;
          mat.opacity = 1;
          const mesh = new Mesh(geo, mat);
          const local = new Vector3(
            piece.x + ox * piece.hx * 2,
            piece.y + floorY + oy * piece.hy * 2,
            piece.z + oz * piece.hz * 2,
          );
          mesh.position.copy(local.applyQuaternion(boardQuat));
          mesh.quaternion.copy(boardQuat);
          const away = mesh.position.clone().sub(blast);
          if (away.lengthSq() < 0.0001) {
            away.set(ox + 0.001, 0.4, oz + 0.001);
          }
          away.normalize();
          const speed = 2.2 + Math.random() * 2.8;
          const vel = away.multiplyScalar(speed);
          vel.y += 1.4 + Math.random() * 1.8;
          const spin = new Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
          );
          this.scene.add(mesh);
          this.debris.push({
            mesh,
            vel,
            spin,
            delay: Math.random() * 0.03,
            age: 0,
            life: 0.9 + Math.random() * 0.4,
          });
        }
      }
    }
  }

  private spawnDebris(piece: Piece, floorY: number, boardQuat: Quaternion, hatch: { x: number; z: number } | null): void {
    const source = this.materials[piece.kind];
    if (!(source instanceof MeshToonMaterial)) return;
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    const mesh = new Mesh(geo, mat);
    const local = new Vector3(piece.x, piece.y + floorY, piece.z);
    mesh.position.copy(local.applyQuaternion(boardQuat));
    mesh.quaternion.copy(boardQuat);
    const hx = hatch?.x ?? 0;
    const hz = hatch?.z ?? 0;
    let dx = piece.x - hx;
    let dz = piece.z - hz;
    const dist = Math.hypot(dx, dz);
    const len = dist || 1;
    dx /= len;
    dz /= len;
    const speed = 1.15 + Math.random() * 1.45;
    const vel = new Vector3(dx * speed, 0.4 + Math.random() * 1.05, dz * speed).applyQuaternion(boardQuat);
    const spin = new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.scene.add(mesh);
    this.debris.push({ mesh, vel, spin, delay: Math.min(0.48, dist * 0.06), age: 0, life: 1.15 });
  }

  private tickDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const bit = this.debris[i];
      if (!bit) continue;
      bit.age += dt;
      const elapsed = bit.age - bit.delay;
      if (elapsed < 0) continue;
      bit.vel.y -= 18 * dt;
      bit.mesh.position.addScaledVector(bit.vel, dt);
      bit.mesh.rotateX(bit.spin.x * dt);
      bit.mesh.rotateY(bit.spin.y * dt);
      bit.mesh.rotateZ(bit.spin.z * dt);
      const fade = elapsed < 0.28 ? 1 : Math.max(0, 1 - (elapsed - 0.28) / 0.7);
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.opacity = fade;
      if (elapsed <= bit.life) continue;
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
      this.debris.splice(i, 1);
    }
  }

  private tickAim(dt: number): void {
    const inv = this.board.quaternion.clone().invert();
    const localY = this.ball.position.clone().applyQuaternion(inv).y;
    const floor = this.escaped ? (this.meadow?.position.y ?? localY) : this.lowest();
    const rest = this.escaped ? floor : floor * 0.28;
    const target = this.escaped
      ? localY
      : Math.min(rest, Math.max(localY, floor));
    const blend = this.reduceMotion ? 1 : 1 - Math.exp(-7 * dt);
    this.focusY += (target - this.focusY) * blend;
  }

  private lowest(): number {
    let low = 0;
    for (const group of this.floorGroups) {
      if (group) low = Math.min(low, group.position.y);
    }
    return low;
  }

  private setGoalLightsVisible(visible: boolean): void {
    for (const light of this.goalLights) light.visible = visible;
  }

  private clearGoalMarkers(): void {
    for (const ring of this.goalRings) ring.removeFromParent();
    this.goalRings.length = 0;
    for (const gate of this.goalGates) gate.removeFromParent();
    this.goalGates.length = 0;
    for (const light of this.goalLights) {
      light.visible = false;
      light.removeFromParent();
    }
    this.goalLights.length = 0;
  }

  private pruneGoalMarkers(): void {
    for (let i = this.goalRings.length - 1; i >= 0; i -= 1) {
      if (!this.goalRings[i]?.parent) this.goalRings.splice(i, 1);
    }
    for (let i = this.goalGates.length - 1; i >= 0; i -= 1) {
      if (!this.goalGates[i]?.parent) this.goalGates.splice(i, 1);
    }
    for (let i = this.goalLights.length - 1; i >= 0; i -= 1) {
      if (!this.goalLights[i]?.parent) this.goalLights.splice(i, 1);
    }
  }

  private pruneSpins(): void {
    for (let i = this.warpSpins.length - 1; i >= 0; i -= 1) {
      if (!this.warpSpins[i]?.parent) this.warpSpins.splice(i, 1);
    }
  }

  private clearDebris(): void {
    for (const bit of this.debris) {
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
    }
    this.debris.length = 0;
  }
}
