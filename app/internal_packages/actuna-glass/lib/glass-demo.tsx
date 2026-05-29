/**
 * GlassDemo — actuna-glass translucent surface demo overlay.
 *
 * Bilet MVP #92. Mockup: design/mockups/11-actuna-glass-demo.html.
 *
 * Renderuje modal z 3 tiles per intensity (subtle / medium / strong) nad
 * gradient wallpaper background. Checkbox flips `core.appearance.translucentSurfaces`
 * config flag — live demo różnicy translucent vs solid fallback.
 *
 * - role="dialog" + aria-modal="true" + aria-label (i18n PL+EN).
 * - Esc closes + click backdrop closes.
 * - Honors prefers-reduced-transparency: hook automatically fallback solid.
 */

import React from 'react';
import { GlassDemoStore } from './glass-demo-store';
import { GlassIntensity } from './use-glass-material';

const { localized } = require('actunamail-exports');

const FLAG_KEY = 'core.appearance.translucentSurfaces';

interface State {
  open: boolean;
  flagOn: boolean;
  previousActiveElement: Element | null;
}

/** AppEnv.config.onDidChange returns either a Disposable (z event-kit, real app)
 *  lub plain function (mock w test env). Helper unifies cleanup call. */
type Unsubscribe = (() => void) | { dispose: () => void } | null;

function dispose(u: Unsubscribe): void {
  if (!u) return;
  if (typeof u === 'function') u();
  else if (typeof u.dispose === 'function') u.dispose();
}

export default class GlassDemo extends React.Component<{}, State> {
  static displayName = 'GlassDemo';

  state: State = {
    open: false,
    flagOn: false,
    previousActiveElement: null,
  };

  private _unsubscribeStore: Unsubscribe = null;
  private _unsubscribeConfig: Unsubscribe = null;
  private _dialogRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._unsubscribeStore = GlassDemoStore.listen(() => this._sync());
    if ((window as any).AppEnv?.config?.onDidChange) {
      this._unsubscribeConfig = (window as any).AppEnv.config.onDidChange(
        FLAG_KEY,
        () => this._sync(),
      );
    }
    this._sync();
  }

  componentWillUnmount() {
    dispose(this._unsubscribeStore);
    dispose(this._unsubscribeConfig);
  }

  componentDidUpdate(_: {}, prev: State) {
    if (this.state.open && !prev.open) {
      setTimeout(() => this._dialogRef.current?.focus(), 0);
    }
    if (!this.state.open && prev.open && prev.previousActiveElement) {
      const el = prev.previousActiveElement as HTMLElement;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch (e) { /* el out of DOM */ }
      }
    }
  }

  private _sync = (): void => {
    const open = GlassDemoStore.isOpen();
    const previousActiveElement = open && !this.state.open
      ? document.activeElement
      : this.state.previousActiveElement;
    const flagOn = !!(window as any).AppEnv?.config?.get?.(FLAG_KEY);
    this.setState({ open, flagOn, previousActiveElement });
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      GlassDemoStore.close();
    }
  };

  private _onBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      GlassDemoStore.close();
    }
  };

  private _onToggleFlag = (): void => {
    const newValue = !this.state.flagOn;
    if ((window as any).AppEnv?.config?.set) {
      (window as any).AppEnv.config.set(FLAG_KEY, newValue);
    }
    this.setState({ flagOn: newValue });
  };

  private _renderTile(intensity: GlassIntensity, labelPl: string, labelEn: string) {
    const className = this.state.flagOn
      ? `glass-demo-tile glass-demo-tile--${intensity} actuna-glass actuna-glass--${intensity}`
      : `glass-demo-tile glass-demo-tile--${intensity} actuna-glass-fallback actuna-glass-fallback--${intensity}`;
    return (
      <div key={intensity} className={className} role="group" aria-label={`${labelPl} / ${labelEn}`}>
        <div className="glass-demo-tile-title">{labelPl}</div>
        <div className="glass-demo-tile-subtitle">{labelEn}</div>
        <code className="glass-demo-tile-code">actuna-glass--{intensity}</code>
      </div>
    );
  }

  render() {
    if (!this.state.open) return null;
    const ariaLabel = localized('Demo translucentnych powierzchni / Translucency demo');
    const closeLabel = localized('Zamknij / Close');
    const toggleLabel = localized('Włącz translucent surfaces / Enable translucent surfaces');
    return (
      <div className="glass-demo-backdrop" onClick={this._onBackdropClick}>
        <div
          ref={this._dialogRef}
          className="glass-demo-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={this._onKeyDown}
        >
          <header className="glass-demo-header">
            <h2 className="glass-demo-title">{ariaLabel}</h2>
            <button
              type="button"
              className="glass-demo-close"
              aria-label={closeLabel}
              onClick={() => GlassDemoStore.close()}
            >
              ×
            </button>
          </header>

          <div className="glass-demo-toggle">
            <label>
              <input
                type="checkbox"
                checked={this.state.flagOn}
                onChange={this._onToggleFlag}
              />
              <span>{toggleLabel}</span>
            </label>
            <p className="glass-demo-toggle-note">
              {localized('Respektuje prefers-reduced-transparency + prefers-contrast. / Honors system Reduce Transparency + Increase Contrast preferences.')}
            </p>
          </div>

          <div className="glass-demo-wallpaper">
            <div className="glass-demo-grid">
              {this._renderTile('subtle', 'Subtle', 'subtle (blur 8px)')}
              {this._renderTile('medium', 'Medium', 'medium (blur 16px)')}
              {this._renderTile('strong', 'Strong', 'strong (blur 24px)')}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
