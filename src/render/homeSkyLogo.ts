import {
  BackSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  ShapeGeometry,
  type Camera,
  type Shape,
} from "three";
import { Font, type FontData } from "three/addons/loaders/FontLoader.js";
import logoFontData from "../assets/fonts/ArchivoBlack-logo.typeface.json";
import { organicProps, toon } from "./boardMaterials.ts";
import { HOME_TOWER_H } from "./homeEnterConstants.ts";

const LOGO_TEXT = "MAZESPIRE";
const LOGO_ARCH = 0.3;
/** Cap height of a full-scale letter. */
const LETTER_H = HOME_TOWER_H * 0.08;
/** Extrusion depth of each glyph. */
const LETTER_DEPTH = LETTER_H * 0.12;
/** Inverted-hull outline scale (cell-shaded outer silhouette). */
const OUTLINE_SCALE = 1.1;
/**
 * Light front fill vs black body — leftover rim is the inner face border.
 * Lower = thicker black edge on the front.
 */
const FACE_INSET = 0.84;
const ARC_RADIUS = HOME_TOWER_H * 0.5;
/** Mid-angle of the arc (0 = +Z). Back-left of the default home orbit. */
const ARC_MID = 1;
const ARC_SPAN = 1.15;
const ARC_Y = HOME_TOWER_H * 0.12;

const logoFont = new Font(logoFontData as unknown as FontData);

type LetterBuild = {
  bodyGeo: ExtrudeGeometry;
  faceGeo: ShapeGeometry;
  width: number;
  height: number;
};

function centerGlyphShapes(shapes: Shape[]): { midX: number; minY: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const pts = shape.getPoints(8);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return { midX: 0, minY: 0, height: LETTER_H };
  }
  return {
    midX: (minX + maxX) * 0.5,
    minY,
    height: Math.max(1e-4, maxY - minY),
  };
}

function buildLetter(ch: string, size: number): LetterBuild {
  const shapes = logoFont.generateShapes(ch, size);
  const { midX, minY, height } = centerGlyphShapes(shapes);

  const bodyGeo = new ExtrudeGeometry(shapes, {
    depth: LETTER_DEPTH,
    bevelEnabled: true,
    bevelThickness: size * 0.02,
    bevelSize: size * 0.018,
    bevelSegments: 1,
    curveSegments: 6,
  });
  // Center on X; sit baseline at y=0; extrude toward −Z so the face is at z=0.
  bodyGeo.computeBoundingBox();
  const box = bodyGeo.boundingBox;
  if (box) {
    bodyGeo.translate(-midX, -minY, -box.max.z);
  }
  bodyGeo.computeBoundingSphere();

  const faceGeo = new ShapeGeometry(shapes, 6);
  faceGeo.translate(-midX, -minY, 0);
  faceGeo.computeBoundingSphere();

  return {
    bodyGeo,
    faceGeo,
    width: letterAdvance(ch, size),
    height,
  };
}

function letterAdvance(ch: string, size: number): number {
  const glyphs = logoFont.data.glyphs as Record<string, { ha?: number }>;
  const ha = glyphs[ch]?.ha;
  const resolution = logoFont.data.resolution || 1000;
  if (typeof ha === "number") return (ha * size) / resolution;
  return size * 0.65;
}

/**
 * Extruded Mazespire wordmark — black body + inset light face (inner edge border),
 * outer silhouette hull, seated on a curve in the back-left sky.
 */
export function addHomeSkyLogo(parent: Group): Group {
  const root = new Group();
  root.position.set(0, ARC_Y, 0);
  root.userData.homeSkyLogo = true;
  root.userData.baseY = ARC_Y;

  const letters = [...LOGO_TEXT];
  const built: LetterBuild[] = [];
  const gap = LETTER_H * 0.06;
  let cursor = 0;

  for (let i = 0; i < letters.length; i += 1) {
    const ch = letters[i];
    if (!ch) continue;
    const mid = letters.length <= 1 ? 0.5 : i / (letters.length - 1);
    const scaleY = 1 - LOGO_ARCH * Math.sin(Math.PI * mid);
    const size = LETTER_H * scaleY;
    const letter = buildLetter(ch, size);
    built.push(letter);
    cursor += letter.width + (i > 0 ? gap : 0);
  }

  const totalArcLen = cursor;
  let walked = 0;
  for (let i = 0; i < built.length; i += 1) {
    const item = built[i]!;
    const center = walked + item.width * 0.5;
    const t = totalArcLen <= 0 ? 0.5 : center / totalArcLen;
    const angle = ARC_MID - ARC_SPAN * 0.5 + t * ARC_SPAN;
    const x = Math.sin(angle) * ARC_RADIUS;
    const z = Math.cos(angle) * ARC_RADIUS;

    const letter = new Group();
    letter.position.set(x, 0, z);
    // Face outward (toward the home camera), not into the tower — otherwise the word reads mirrored.
    letter.rotation.y = angle;
    letter.userData.phase = i * 0.55;

    const bodyMat = toon("#0a0c10", "#000000", 0);
    const fillMat = toon("#f4f6fa", "#dfe6f0", 0.28);
    const outlineMat = toon("#0a0c10", "#000000", 0);
    outlineMat.side = BackSide;

    // Outer cel silhouette.
    const outline = new Mesh(item.bodyGeo.clone(), outlineMat);
    outline.scale.set(OUTLINE_SCALE, OUTLINE_SCALE, 1.08);
    outline.position.z = -LETTER_DEPTH * 0.05;
    outline.castShadow = organicProps;
    outline.frustumCulled = false;
    outline.userData.owned = true;
    outline.userData.ownedMats = true;

    // Black extrusion — sides + full front; fill inset leaves a black face rim.
    const body = new Mesh(item.bodyGeo, bodyMat);
    body.castShadow = organicProps;
    body.receiveShadow = organicProps;
    body.frustumCulled = false;
    body.userData.owned = true;
    body.userData.ownedMats = true;

    const fill = new Mesh(item.faceGeo, fillMat);
    fill.scale.setScalar(FACE_INSET);
    // Scale about glyph center so the black rim stays even around the face.
    fill.position.set(0, item.height * 0.5 * (1 - FACE_INSET), 0.02);
    fill.frustumCulled = false;
    fill.userData.owned = true;
    fill.userData.ownedMats = true;

    letter.add(outline, body, fill);
    root.add(letter);
    walked += item.width + gap;
  }

  parent.add(root);
  return root;
}

/** Soft bob along the fixed sky arc. */
export function tickHomeSkyLogo(
  logo: Group,
  _camera: Camera,
  time: number,
  reduceMotion: boolean,
): void {
  const baseY = typeof logo.userData.baseY === "number" ? logo.userData.baseY : ARC_Y;
  if (reduceMotion) {
    logo.position.y = baseY;
    for (const child of logo.children) {
      child.position.y = 0;
    }
    return;
  }
  logo.position.y = baseY + Math.sin(time * 0.45) * 0.06;
  for (const child of logo.children) {
    const phase = typeof child.userData.phase === "number" ? child.userData.phase : 0;
    child.position.y = Math.sin(time * 0.9 + phase) * 0.045;
  }
}
