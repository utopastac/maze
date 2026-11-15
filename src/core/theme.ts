export const FLOOR_THEMES = ["futuristic", "desert", "castle", "tomb", "office", "suburbia"] as const;

export type FloorThemeId = (typeof FLOOR_THEMES)[number];

export const DEFAULT_FLOOR_THEME: FloorThemeId = "futuristic";

export const FLOOR_THEME_META: Record<
  FloorThemeId,
  { label: string; floor: string; wall: string; grout: string; frame: string }
> = {
  futuristic: {
    label: "Futuristic",
    floor: "--theme-futuristic-floor",
    wall: "--theme-futuristic-wall",
    grout: "--theme-futuristic-grout",
    frame: "--theme-futuristic-frame",
  },
  desert: {
    label: "Desert",
    floor: "--theme-desert-floor",
    wall: "--theme-desert-wall",
    grout: "--theme-desert-grout",
    frame: "--theme-desert-frame",
  },
  castle: {
    label: "Castle",
    floor: "--theme-castle-floor",
    wall: "--theme-castle-wall",
    grout: "--theme-castle-grout",
    frame: "--theme-castle-frame",
  },
  tomb: {
    label: "Tomb Raider",
    floor: "--theme-tomb-floor",
    wall: "--theme-tomb-wall",
    grout: "--theme-tomb-grout",
    frame: "--theme-tomb-frame",
  },
  office: {
    label: "Office Block",
    floor: "--theme-office-floor",
    wall: "--theme-office-wall",
    grout: "--theme-office-grout",
    frame: "--theme-office-frame",
  },
  suburbia: {
    label: "Suburbia",
    floor: "--theme-suburbia-floor",
    wall: "--theme-suburbia-wall",
    grout: "--theme-suburbia-grout",
    frame: "--theme-suburbia-frame",
  },
};

export function isFloorTheme(value: string): value is FloorThemeId {
  return (FLOOR_THEMES as readonly string[]).includes(value);
}

export function parseFloorTheme(value: unknown): FloorThemeId {
  return typeof value === "string" && isFloorTheme(value) ? value : DEFAULT_FLOOR_THEME;
}

export function themeIndex(theme: FloorThemeId): number {
  return FLOOR_THEMES.indexOf(theme);
}

export function themeFromIndex(index: number): FloorThemeId {
  return FLOOR_THEMES[index] ?? DEFAULT_FLOOR_THEME;
}

export function themeForFloor(index: number): FloorThemeId {
  return FLOOR_THEMES[index % FLOOR_THEMES.length] ?? DEFAULT_FLOOR_THEME;
}
