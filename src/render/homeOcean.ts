import {
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { organicProps, token } from "./boardMaterials.ts";
import { HOME_OCEAN_SIZE, HOME_TOWER_H } from "./homeEnterConstants.ts";

/** World-Y of the calm water plane (island pads sit just above). */
export const HOME_OCEAN_Y = -0.18;

export type HomeOceanIsland = { x: number; z: number; r: number };

function hexColor(name: string, fallback: string): Color {
  try {
    return new Color(token(name));
  } catch {
    return new Color(fallback);
  }
}

/**
 * Stormy ocean that fills every horizon around the home islands.
 * Free-play islet gets a lagoon (lower swell + teal); `uMood` calms the whole
 * sea during the free-enter sky lift.
 */
export function addHomeOcean(parent: Group, islands: HomeOceanIsland[]): Group {
  const root = new Group();
  root.userData.homeOcean = true;

  const segs = 96;
  const geo = new PlaneGeometry(HOME_OCEAN_SIZE, HOME_OCEAN_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const deep = hexColor("--maze-ocean-deep", "#1d4f75");
  const mid = hexColor("--maze-ocean", "#2f6f9e");
  const foam = hexColor("--sky-sad-3", "#7a8898");
  const storm = hexColor("--sky-sad-2", "#2a3548");
  // Lagoon / tropical shelf colours (brighter, less grey).
  const calmDeep = hexColor("--sky-ocean-4", "#0a8f9a");
  const calmMid = hexColor("--sky-ocean-1", "#2de2c8");
  const calmFoam = hexColor("--sky-beach-0", "#7af0ff");

  const a0 = islands[0] ?? { x: 0, z: 0, r: 1 };
  const a1 = islands[1] ?? { x: 0, z: 0, r: 0 };

  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMood: { value: 0 },
      uIsle0: { value: new Vector3(a0.x, a0.z, a0.r) },
      uIsle1: { value: new Vector3(a1.x, a1.z, a1.r) },
      uDeep: { value: deep },
      uMid: { value: mid },
      uFoam: { value: foam },
      uStorm: { value: storm },
      uCalmDeep: { value: calmDeep },
      uCalmMid: { value: calmMid },
      uCalmFoam: { value: calmFoam },
      uAmp: { value: HOME_TOWER_H * 0.028 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAmp;
      uniform float uMood;
      uniform vec3 uIsle1;
      varying float vH;
      varying float vCalm;
      varying vec3 vWorld;

      float wave(vec2 p, float t) {
        float w = 0.0;
        w += sin(p.x * 0.055 + t * 1.15) * 0.42;
        w += sin(p.y * 0.042 - t * 0.95) * 0.36;
        w += sin((p.x + p.y) * 0.078 + t * 1.55) * 0.28;
        w += sin((p.x * 0.7 - p.y) * 0.12 + t * 2.1) * 0.16;
        w += sin(length(p) * 0.035 - t * 0.7) * 0.22;
        return w;
      }

      float calmAt(vec2 p) {
        float lagoon = 0.0;
        if (uIsle1.z > 0.05) {
          float d1 = length(p - uIsle1.xy);
          lagoon = 1.0 - smoothstep(uIsle1.z * 1.35, uIsle1.z * 6.0, d1);
        }
        return max(uMood, lagoon);
      }

      void main() {
        vec3 pos = position;
        float calm = calmAt(pos.xz);
        float h = wave(pos.xz, uTime);
        // Soft swell in the lagoon / after mood warms.
        float amp = uAmp * mix(1.0, 0.2, calm);
        pos.y += h * amp;
        vH = h * mix(1.0, 0.45, calm);
        vCalm = calm;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uIsle0;
      uniform vec3 uIsle1;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uFoam;
      uniform vec3 uStorm;
      uniform vec3 uCalmDeep;
      uniform vec3 uCalmMid;
      uniform vec3 uCalmFoam;
      uniform float uMood;
      varying float vH;
      varying float vCalm;
      varying vec3 vWorld;

      void main() {
        vec2 p = vWorld.xz;
        float d0 = length(p - uIsle0.xy);
        if (d0 < uIsle0.z * 0.92) discard;
        float d1 = 1e9;
        if (uIsle1.z > 0.05) {
          d1 = length(p - uIsle1.xy);
          if (d1 < uIsle1.z * 0.92) discard;
        }

        float band = clamp(vH * 0.55 + 0.5, 0.0, 1.0);
        band = floor(band * 4.0 + 0.001) / 4.0;

        vec3 stormCol = mix(uDeep, uMid, band);
        stormCol = mix(stormCol, uStorm, step(band, 0.2) * 0.35);
        stormCol = mix(stormCol, uFoam, smoothstep(0.72, 0.95, band));

        vec3 calmCol = mix(uCalmDeep, uCalmMid, band);
        calmCol = mix(calmCol, uCalmFoam, smoothstep(0.65, 0.95, band) * 0.55);

        float calm = max(vCalm, uMood);
        vec3 col = mix(stormCol, calmCol, calm);

        float nearR = max(uIsle0.z, max(uIsle1.z, 1.0));
        float far = smoothstep(nearR * 2.5, nearR * 18.0, min(d0, d1));
        // Horizon haze softens as the whole sea calms.
        col = mix(col, mix(uStorm, uCalmDeep, uMood), far * mix(0.45, 0.12, uMood));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new Mesh(geo, mat);
  mesh.position.y = HOME_OCEAN_Y;
  mesh.frustumCulled = false;
  mesh.receiveShadow = organicProps;
  mesh.userData.owned = true;
  mesh.userData.ownedMats = true;

  root.add(mesh);
  parent.add(root);
  return root;
}

/** Drive storm swell; frozen crest when reduce-motion is on. */
export function tickHomeOcean(
  ocean: Group,
  time: number,
  reduceMotion: boolean,
): void {
  const mesh = ocean.children[0];
  if (!(mesh instanceof Mesh)) return;
  const mat = mesh.material;
  if (!(mat instanceof ShaderMaterial)) return;
  const uTime = mat.uniforms.uTime;
  if (uTime) uTime.value = reduceMotion ? 0 : time;
}

/** 0 = stormy home sea, 1 = tropical calm (free-enter sky lift). */
export function setHomeOceanMood(ocean: Group, mood: number): void {
  const mesh = ocean.children[0];
  if (!(mesh instanceof Mesh)) return;
  const mat = mesh.material;
  if (!(mat instanceof ShaderMaterial)) return;
  const u = mat.uniforms.uMood;
  if (!u) return;
  const next = Math.max(0, Math.min(1, mood));
  if (Math.abs(u.value - next) < 0.002) return;
  u.value = next;
}
