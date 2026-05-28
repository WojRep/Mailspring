/**
 * actuna-glass plugin entry — bilet MVP #92.
 *
 * activate():
 *   1. Register feature flag `core.appearance.translucentSurfaces` (default OFF
 *      dla a11y safety — user explicit enable w Preferences > Appearance).
 *   2. Expose `AppEnv.glass.{useGlassMaterial, isGlassMaterialEnabled}` public API.
 *
 * Styles `app/internal_packages/actuna-glass/styles/glass.less` ładowane przez
 * ActunaMail style pipeline (auto-discovery internal_packages styles).
 *
 * Klasa `.actuna-glass` base jest również w `app/static/style/base/tokens.less`
 * — używana globalnie przez inne komponenty bezpośrednio przez className
 * (np. Command Palette #89 ma `actuna-glass` w command-palette.tsx).
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import { useGlassMaterial, isGlassMaterialEnabled } from './use-glass-material';
import { GlassDemoStore } from './glass-demo-store';
import GlassDemo from './glass-demo';

const FLAG_KEY = 'core.appearance.translucentSurfaces';

export function activate() {
  // Register config schema (default OFF)
  if ((window as any).AppEnv?.config?.setSchema) {
    (window as any).AppEnv.config.setSchema(FLAG_KEY, {
      type: 'boolean',
      default: false,
      title: 'Subtle translucency (actuna-glass)',
      description: 'Aktywuje translucent material surfaces w Command Palette, popover, toast. Wymaga supportu backdrop-filter (zwykle macOS / nowsze przeglądarki). Honor system Reduce Transparency.',
    });
  }

  // Mount GlassDemo overlay — renders fixed-position only when GlassDemoStore.open().
  ComponentRegistry.register(GlassDemo, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  // Cmd+K palette command.
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'glass:show-demo',
      label: 'Pokaż demo translucentnych powierzchni / Show translucency demo',
      section: 'View',
      keywords: ['glass', 'translucency', 'demo', 'translucent', 'surface', 'wygląd'],
      handler: () => GlassDemoStore.open(),
    });
  }

  // Public API
  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.glass = {
    useGlassMaterial,
    isGlassMaterialEnabled,
    FLAG_KEY,
    Demo: GlassDemoStore,
  };
}

export function deactivate() {
  ComponentRegistry.unregister(GlassDemo);
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) palette.unregister('glass:show-demo');
  if ((window as any).AppEnv?.glass) {
    delete (window as any).AppEnv.glass;
  }
  // Config schema persists — nie deregistrujemy.
}
