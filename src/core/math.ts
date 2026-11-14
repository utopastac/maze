export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Pitch about X, then roll about Z. Both are radians. */
export function quatFromTilt(pitch: number, roll: number): Quat {
  const hx = pitch * 0.5;
  const hz = roll * 0.5;
  const sx = Math.sin(hx);
  const cx = Math.cos(hx);
  const sz = Math.sin(hz);
  const cz = Math.cos(hz);
  return {
    x: cz * sx,
    y: sz * sx,
    z: sz * cx,
    w: cz * cx,
  };
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}
