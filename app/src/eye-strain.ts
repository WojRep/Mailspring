// Tryb redukcji zmęczenia oczu (eye-strain reduction) — ciepła, regulowana
// nakładka filtra na cały interfejs. Decyzja użytkownika: poziomy off/low/high,
// implementacja jako komponowalny ciepły filtr (nad jasny/ciemny/systemowy).
//
// Zalecenia okulistów + WCAG:
//  - sepia() ociepla temperaturę barwową i redukuje udział światła niebieskiego,
//  - brightness(<1) ścina glare jaskrawej bieli (np. białe tło maila),
//  - filtr jest TEN SAM dla tekstu i tła → ratio kontrastu zachowane,
//  - parametry dobrane tak, by kontrast tekstu pozostał ≥ WCAG AA (test:
//    eye-strain-reduction-spec.ts weryfikuje na reprezentatywnych parach).
//
// Filtr aplikujemy na elemencie root (`html`) — root jest już initial containing
// block, więc `filter` nie przesuwa elementów `position: fixed` (modale/popovery).

export type EyeStrainLevel = 'off' | 'low' | 'high';

export interface EyeStrainParams {
  sepia: number;
  saturate: number;
  brightness: number;
  hueRotate: number; // stopnie
}

export const EYE_STRAIN_LEVELS: Record<'low' | 'high', EyeStrainParams> = {
  low: { sepia: 0.12, saturate: 0.96, brightness: 0.98, hueRotate: 0 },
  high: { sepia: 0.24, saturate: 0.92, brightness: 0.94, hueRotate: -6 },
};

export const EYE_STRAIN_SOURCE_PATH = 'eye-strain:dynamic';

/** Łańcuch filtra CSS dla poziomu (pusty dla 'off'/nieznanych). */
export function eyeStrainFilterForLevel(level: string): string {
  const p = (EYE_STRAIN_LEVELS as any)[level] as EyeStrainParams | undefined;
  if (!p) return '';
  let f = `sepia(${p.sepia}) saturate(${p.saturate}) brightness(${p.brightness})`;
  if (p.hueRotate) f += ` hue-rotate(${p.hueRotate}deg)`;
  return f;
}

/**
 * Arkusz CSS nakładany na root (html) — pusty string dla 'off'.
 * Owinięty w @media screen: tryb komfortu ekranu NIE może barwić wydruków
 * (Ctrl+P / eksport PDF maila renderuje się bez ciepłego odcienia).
 */
export function buildEyeStrainCSS(level: string): string {
  const f = eyeStrainFilterForLevel(level);
  if (!f) return '';
  return `@media screen { html { filter: ${f}; } }`;
}

interface StyleSheetApi {
  addStyleSheet: (
    source: string,
    opts: { sourcePath: string; priority: number }
  ) => { dispose: () => void };
}

/**
 * Wstrzykuje/usuwa arkusz nakładki (wzorzec jak ThemeManager.applySystemAccent).
 * Zawsze disposuje poprzedni Disposable; dla 'off' zwraca null.
 */
export function applyEyeStrainStylesheet(
  styles: StyleSheetApi,
  level: string,
  prevDisposable: { dispose: () => void } | null
): { dispose: () => void } | null {
  if (prevDisposable) {
    prevDisposable.dispose();
  }
  const css = buildEyeStrainCSS(level);
  if (!css) return null;
  return styles.addStyleSheet(css, { sourcePath: EYE_STRAIN_SOURCE_PATH, priority: 3 });
}

// === Mirror matematyki filtra CSS (W3C Filter Effects) — wyłącznie do
// weryfikacji WCAG w testach; produkcja używa natywnego CSS `filter`. Trzymane
// obok EYE_STRAIN_LEVELS, żeby parametry i weryfikacja nie rozjechały się. ===

function mul3(m: number[], v: number[]): number[] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function sepiaMatrix(amount: number): number[] {
  const a = 1 - amount;
  return [
    0.393 + 0.607 * a,
    0.769 - 0.769 * a,
    0.189 - 0.189 * a,
    0.349 - 0.349 * a,
    0.686 + 0.314 * a,
    0.168 - 0.168 * a,
    0.272 - 0.272 * a,
    0.534 - 0.534 * a,
    0.131 + 0.869 * a,
  ];
}

function saturateMatrix(s: number): number[] {
  return [
    0.213 + 0.787 * s,
    0.715 - 0.715 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 + 0.285 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 - 0.715 * s,
    0.072 + 0.928 * s,
  ];
}

function hueRotateMatrix(deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];
}

/** Zastosuj łańcuch filtra (sepia→saturate→brightness→hue-rotate) na RGB 0-255. */
export function eyeStrainTransformRgb(rgb: number[], level: string): number[] {
  const p = (EYE_STRAIN_LEVELS as any)[level] as EyeStrainParams | undefined;
  if (!p) return rgb.slice();
  let v = rgb.map((c) => c / 255);
  v = mul3(sepiaMatrix(p.sepia), v);
  v = mul3(saturateMatrix(p.saturate), v);
  v = v.map((c) => c * p.brightness);
  if (p.hueRotate) v = mul3(hueRotateMatrix(p.hueRotate), v);
  return v.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255));
}
