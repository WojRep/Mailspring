/**
 * useGlassMaterial — React hook dla actuna-glass translucent surfaces.
 *
 * Bilet MVP #92. Mockup: design/mockups/11-actuna-glass-demo.html.
 *
 * Usage:
 *   const { className, style } = useGlassMaterial({ intensity: 'medium' });
 *   <div className={className} style={style}>...</div>
 *
 * Reactive:
 *   - Reaguje na `core.appearance.translucentSurfaces` feature flag
 *     (Preferences > Appearance > Subtle translucency).
 *   - Reaguje na `prefers-reduced-transparency` system setting.
 *   - Reaguje na `prefers-contrast: more` (high contrast forces solid).
 *
 * Gdy disabled (flag off lub reduced-transparency) → fallback solid
 * `var(--surface-elevated-2)`. Bez backdrop-filter (zero performance cost).
 */

import { useEffect, useState } from 'react';

export type GlassIntensity = 'subtle' | 'medium' | 'strong';

export interface UseGlassMaterialOptions {
  intensity?: GlassIntensity;
  /** Force enabled regardless of system / preferences (e.g. demo views). */
  force?: boolean;
}

export interface UseGlassMaterialResult {
  className: string;
  style: React.CSSProperties;
  /** Aktualny effective state (po wszystkich media queries + flag). */
  active: boolean;
}

const FLAG_KEY = 'core.appearance.translucentSurfaces';

/** Sprawdza czy translucency jest enabled (flag + system preferences). */
function isTranslucencyEnabled(force = false): boolean {
  if (force) return true;
  if (typeof window === 'undefined') return false;

  // Feature flag check
  const flagOn = !!(window as any).AppEnv?.config?.get?.(FLAG_KEY);
  if (!flagOn) return false;

  // System preferences
  try {
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
    if (window.matchMedia('(prefers-contrast: more)').matches) return false;
  } catch (e) {
    // matchMedia not supported (very old environment) — assume disabled
    return false;
  }

  return true;
}

/** Hook returning className + inline style + active state. */
export function useGlassMaterial(opts: UseGlassMaterialOptions = {}): UseGlassMaterialResult {
  const intensity: GlassIntensity = opts.intensity || 'medium';
  const [active, setActive] = useState(() => isTranslucencyEnabled(opts.force));

  useEffect(() => {
    const update = () => setActive(isTranslucencyEnabled(opts.force));

    // Listen to media query changes
    const mqReduced = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const mqContrast = window.matchMedia('(prefers-contrast: more)');

    const handler = () => update();
    mqReduced.addEventListener?.('change', handler);
    mqContrast.addEventListener?.('change', handler);

    // Listen to AppEnv.config changes.
    // Note: onDidChange may return a Disposable {dispose()} (event-kit) lub plain
    // function (test mock). Cleanup helper unifies both.
    let unsubscribeConfig: (() => void) | { dispose: () => void } | null = null;
    if ((window as any).AppEnv?.config?.onDidChange) {
      unsubscribeConfig = (window as any).AppEnv.config.onDidChange(FLAG_KEY, update);
    }

    return () => {
      mqReduced.removeEventListener?.('change', handler);
      mqContrast.removeEventListener?.('change', handler);
      if (unsubscribeConfig) {
        if (typeof unsubscribeConfig === 'function') unsubscribeConfig();
        else if (typeof (unsubscribeConfig as { dispose?: () => void }).dispose === 'function') {
          (unsubscribeConfig as { dispose: () => void }).dispose();
        }
      }
    };
  }, [opts.force]);

  const className = active
    ? `actuna-glass actuna-glass--${intensity}`
    : `actuna-glass-fallback actuna-glass-fallback--${intensity}`;

  // Inline overrides per intensity (CSS classes powyżej w glass.less + tokens.less)
  return { className, style: {}, active };
}

/** Convenience export — sprawdza state bez hook (np. dla non-React kodu). */
export function isGlassMaterialEnabled(force = false): boolean {
  return isTranslucencyEnabled(force);
}
