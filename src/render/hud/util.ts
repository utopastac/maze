import { MeshStandardMaterial } from "three";

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = clamp01(t);
  return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2;
}

export function stdMat(
  color: string,
  emissive: string,
  emissiveIntensity: number,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.4,
    metalness: 0.1,
  });
}

export function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function tokenHex(name: string, fallback: string): number {
  const raw = tokenColor(name, fallback).replace("#", "").trim();
  const hex = raw.length === 3
    ? raw.split("").map((ch) => ch + ch).join("")
    : raw.padStart(6, "0").slice(0, 6);
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}
