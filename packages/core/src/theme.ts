/**
 * Colour schemes and viewer preferences. Pure functions, so the server can render
 * the right theme on first paint and the client can change it live.
 */

export type ThemeId = 'broadsheet' | 'regiment' | 'custom';
export type MotionPref = 'system' | 'reduce' | 'full';
export type DensityPref = 'comfortable' | 'compact';

export interface Prefs {
  theme: ThemeId;
  /** The colour picked on the wheel (custom theme only). */
  accent: string;
  paper: 'light' | 'dark';
  motion: MotionPref;
  density: DensityPref;
  ticker: boolean;
}

export const PREFS_COOKIE = 'll-prefs';

export const DEFAULT_PREFS: Prefs = {
  theme: 'broadsheet',
  accent: '#1f4e8c',
  paper: 'light',
  motion: 'system',
  density: 'comfortable',
  ticker: true,
};

export const PRESETS = [
  {
    id: 'broadsheet',
    name: 'Broadsheet',
    description: 'Cream & black, like the morning paper.',
    paper: '#efe6d2',
    swatches: ['#efe6d2', '#151311', '#151311'],
  },
  {
    id: 'regiment',
    name: 'Burgundy & Navy',
    description: 'Navy stock, cream type & burgundy banners.',
    paper: '#0f1a2e',
    swatches: ['#0f1a2e', '#f1e8d6', '#8c2232'],
  },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function parsePrefs(raw: string | undefined | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<Prefs>;
    return {
      theme: (['broadsheet', 'regiment', 'custom'] as const).find((t) => t === value.theme) ?? DEFAULT_PREFS.theme,
      accent: typeof value.accent === 'string' && HEX.test(value.accent) ? value.accent : DEFAULT_PREFS.accent,
      paper: value.paper === 'dark' ? 'dark' : 'light',
      motion: (['system', 'reduce', 'full'] as const).find((m) => m === value.motion) ?? 'system',
      density: value.density === 'compact' ? 'compact' : 'comfortable',
      ticker: value.ticker !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const serializePrefs = (prefs: Prefs) => encodeURIComponent(JSON.stringify(prefs));

/* ---------------------------------------------------------------- colour maths */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB hex → OKLCH (L 0–1, C ≈0–0.37, h degrees). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB hex, lowering chroma until the colour fits the sRGB gamut. */
export function oklchToHex(L: number, C: number, h: number): string {
  const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);
  let lo = 0;
  let hi = C;
  let rgb = oklchToLinear(L, C, h);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear(L, lo, h);
  }
  return rgbToHex(rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb);
}

/** HSV (h 0–360, s/v 0–1) → hex, for the colour wheel. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255) as Rgb;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

/** APCA lightness contrast (Lc) of text on a background; magnitude ≥ 60 reads well for body text. */
export function apcaContrast(textHex: string, bgHex: string): number {
  const y = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map((c) => (c / 255) ** 2.4) as Rgb;
    const lum = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return lum < 0.022 ? lum + (0.022 - lum) ** 1.414 : lum;
  };
  const yt = y(textHex);
  const yb = y(bgHex);
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Derives a full newspaper palette from one accent colour. */
export function customThemeVars(accent: string, paper: 'light' | 'dark'): Record<string, string> {
  const { c, h } = hexToOklch(accent);
  const tint = Math.min(0.035, c * 0.22);
  const inkChroma = Math.min(0.05, c * 0.3);

  const light = paper === 'light';
  const tokens = light
    ? {
        paper: oklchToHex(0.945, tint * 0.8, h),
        paper2: oklchToHex(0.972, tint * 0.6, h),
        paper3: oklchToHex(0.905, tint, h),
        ink: oklchToHex(0.2, inkChroma, h),
        ink2: oklchToHex(0.36, inkChroma, h),
        muted: oklchToHex(0.47, inkChroma * 0.8, h),
      }
    : {
        paper: oklchToHex(0.17, Math.min(0.045, c * 0.3), h),
        paper2: oklchToHex(0.205, Math.min(0.045, c * 0.3), h),
        paper3: oklchToHex(0.255, Math.min(0.05, c * 0.32), h),
        ink: oklchToHex(0.94, tint * 0.6, h),
        ink2: oklchToHex(0.83, tint * 0.6, h),
        muted: oklchToHex(0.7, tint * 0.6, h),
      };

  // Text on the accent is whichever of paper/ink reads better (APCA).
  const accentInk =
    Math.abs(apcaContrast(tokens.paper2, accent)) >= Math.abs(apcaContrast(tokens.ink, accent)) ? tokens.paper2 : tokens.ink;
  // Down candles and banners use the accent only when it stands out from the paper.
  const accentReadable = Math.abs(apcaContrast(accent, tokens.paper)) >= 30;

  return {
    '--paper': tokens.paper,
    '--paper-2': tokens.paper2,
    '--paper-3': tokens.paper3,
    '--ink': tokens.ink,
    '--ink-2': tokens.ink2,
    '--muted': tokens.muted,
    '--rule': tokens.ink,
    '--rule-soft': alpha(tokens.ink, light ? 0.18 : 0.22),
    '--accent': accent,
    '--accent-ink': accentInk,
    '--banner': accentReadable ? accent : tokens.ink,
    '--banner-ink': accentReadable ? accentInk : tokens.paper,
    '--candle-down': accentReadable ? accent : tokens.ink,
    '--shadow-ink': light ? tokens.ink : '#000000',
    '--halftone': alpha(tokens.ink, light ? 0.16 : 0.2),
    '--focus': light ? tokens.ink : accentReadable ? accent : tokens.ink,
  };
}

export function themeColorFor(prefs: Prefs): string {
  if (prefs.theme === 'custom') return customThemeVars(prefs.accent, prefs.paper)['--paper']!;
  return PRESETS.find((p) => p.id === prefs.theme)?.paper ?? PRESETS[0].paper;
}

export function isDarkTheme(prefs: Prefs) {
  return prefs.theme === 'regiment' || (prefs.theme === 'custom' && prefs.paper === 'dark');
}

/** Attributes for <html>, so the first paint already uses the viewer's theme. */
export function htmlThemeProps(prefs: Prefs) {
  return {
    'data-theme': prefs.theme,
    'data-paper': isDarkTheme(prefs) ? 'dark' : 'light',
    'data-motion': prefs.motion,
    'data-density': prefs.density,
    style: {
      colorScheme: isDarkTheme(prefs) ? 'dark' : 'light',
      ...(prefs.theme === 'custom' ? customThemeVars(prefs.accent, prefs.paper) : {}),
    } as Record<string, string>,
  };
}

const CUSTOM_KEYS = Object.keys(customThemeVars('#000000', 'light'));

/** Applies preferences to the live document and remembers them in a cookie. */
export function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.paper = isDarkTheme(prefs) ? 'dark' : 'light';
  root.dataset.motion = prefs.motion;
  root.dataset.density = prefs.density;
  root.style.colorScheme = isDarkTheme(prefs) ? 'dark' : 'light';
  for (const key of CUSTOM_KEYS) root.style.removeProperty(key);
  if (prefs.theme === 'custom') {
    for (const [key, value] of Object.entries(customThemeVars(prefs.accent, prefs.paper))) root.style.setProperty(key, value);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColorFor(prefs));
  document.cookie = `${PREFS_COOKIE}=${serializePrefs(prefs)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent('ledgerline:prefs', { detail: prefs }));
}

export function readPrefs(): Prefs {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${PREFS_COOKIE}=`))
    ?.slice(PREFS_COOKIE.length + 1);
  return parsePrefs(raw);
}

/** True when the viewer (or their OS) asked for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  const setting = document.documentElement.dataset.motion;
  if (setting === 'reduce') return true;
  if (setting === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
