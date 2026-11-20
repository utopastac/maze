import {
  Group,
  Mesh,
  Object3D,
  Vector3,
} from "three";

/** Content meadow size multiplier (props, signs, camera framing, FX volume). */
export const MEADOW_SPAN_MULT = 2.8;

export interface PickupBit {
  root: Object3D;
  visual: Mesh;
  cell: string;
  group: Group;
  taken: boolean;
  age: number;
  baseY: number;
  kind: "heart" | "coin" | "star" | "wings" | "ghost";
}

export interface Debris {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  delay: number;
  age: number;
  life: number;
}

export interface Spark {
  mesh: Mesh;
  parent: Group;
  vel: Vector3;
  spin: Vector3;
  age: number;
  life: number;
}

export interface FireworkBit {
  mesh: Mesh;
  parent: Group;
  vel: Vector3;
  spin: Vector3;
  age: number;
  life: number;
  gravity: number;
  drag: number;
  baseScale: number;
}

export interface RainBit {
  mesh: Mesh;
  parent: Group;
  vel: Vector3;
  age: number;
  life: number;
  baseScale: number;
}
