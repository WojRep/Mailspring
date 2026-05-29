/**
 * SnoozePicker — Cmd+Shift+H modal dla snooze threadu na preset lub custom date.
 *
 * Bilet MVP #104. Mockup referencyjny: design/mockups/15-snooze-picker.html.
 *
 * Funkcje:
 *  - 7 preset buttons z PL+EN labels + computed wake date (formatowany lokalnie).
 *  - "Wybierz datę i godzinę…" toggle do datetime-local input fallback (#90
 *    shared time picker odłożony — natural input wystarczy dla MVP).
 *  - "Un-snooze" button gdy threadId już w SnoozeStore (modify path).
 *  - Optional warning gdy account serverSupport === 'local_only'.
 *  - role="dialog" + aria-modal + aria-label PL+EN.
 *  - Escape close + backdrop click close + focus management.
 *  - Glass surface via actuna-glass (#92).
 */

import React from 'react';
import { SnoozeUIBus } from './snooze-ui-bus';
import { SnoozeStore, SnoozeEntry } from './snooze-store';
import { SnoozePreset, PRESET_LABELS_PL, PRESET_LABELS_EN, resolvePreset } from './snooze-presets';

const { localized } = require('actunamail-exports');

const PRESETS: SnoozePreset[] = [
  'later_today',
  'tomorrow_morning',
  'tomorrow_evening',
  'this_weekend',
  'next_week',
  'next_month',
  'someday',
];

interface State {
  open: boolean;
  threadId: string | null;
  existing: SnoozeEntry | null;
  showCustom: boolean;
  customValue: string;
  previousActiveElement: Element | null;
}

function formatWake(wakeAt: number): string {
  try {
    const d = new Date(wakeAt);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return new Date(wakeAt).toISOString();
  }
}

/** Returns a datetime-local input default `YYYY-MM-DDTHH:mm` for now + 1h. */
function defaultCustomValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default class SnoozePicker extends React.Component<{}, State> {
  static displayName = 'SnoozePicker';
  static containerRequired = false;

  state: State = {
    open: false,
    threadId: null,
    existing: null,
    showCustom: false,
    customValue: defaultCustomValue(),
    previousActiveElement: null,
  };

  private _unsubscribeBus: (() => void) | null = null;
  private _unsubscribeStore: (() => void) | null = null;
  private _dialogRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._unsubscribeBus = SnoozeUIBus.listen(() => this._syncFromBus());
    this._unsubscribeStore = SnoozeStore.listen(() => this._syncFromStore());
    this._syncFromBus();
  }

  componentWillUnmount() {
    if (this._unsubscribeBus) this._unsubscribeBus();
    if (this._unsubscribeStore) this._unsubscribeStore();
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

  private _syncFromBus = (): void => {
    const open = SnoozeUIBus.isPickerOpen();
    const threadId = SnoozeUIBus.getPickerThreadId();
    const previousActiveElement = open && !this.state.open
      ? document.activeElement
      : this.state.previousActiveElement;
    const existing = threadId ? SnoozeStore.get(threadId) || null : null;
    this.setState({
      open,
      threadId,
      existing,
      showCustom: false,
      customValue: defaultCustomValue(),
      previousActiveElement,
    });
  };

  private _syncFromStore = (): void => {
    if (!this.state.open || !this.state.threadId) return;
    this.setState({ existing: SnoozeStore.get(this.state.threadId) || null });
  };

  private _close = (): void => {
    SnoozeUIBus.closePicker();
  };

  private _onPresetClick = (preset: SnoozePreset): void => {
    if (!this.state.threadId) {
      this._close();
      return;
    }
    if (this.state.existing) {
      const wakeAt = resolvePreset(preset, new Date());
      SnoozeStore.modify(this.state.threadId, wakeAt);
    } else {
      SnoozeStore.snoozeByPreset(this.state.threadId, preset);
    }
    this._close();
  };

  private _onUnsnooze = (): void => {
    if (!this.state.threadId) return;
    SnoozeStore.unsnooze(this.state.threadId);
    this._close();
  };

  private _onCustomChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ customValue: e.target.value });
  };

  private _onCustomConfirm = (): void => {
    if (!this.state.threadId) return;
    const wakeAt = new Date(this.state.customValue).getTime();
    if (!Number.isFinite(wakeAt) || wakeAt <= Date.now()) {
      return;
    }
    if (this.state.existing) {
      SnoozeStore.modify(this.state.threadId, wakeAt);
    } else {
      SnoozeStore.snoozeUntil(this.state.threadId, wakeAt);
    }
    this._close();
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._close();
    }
  };

  private _onBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      this._close();
    }
  };

  render() {
    if (!this.state.open) return null;
    const ariaLabel = localized('Wybierz czas snooze / Pick snooze time');
    const closeLabel = localized('Zamknij / Close');
    const customToggleLabel = this.state.showCustom
      ? localized('Schowaj kalendarz / Hide calendar')
      : localized('Wybierz datę i godzinę… / Pick date and time…');
    const customConfirmLabel = localized('Zatwierdź / Confirm');
    const unsnoozeLabel = localized('Anuluj snooze (wróć teraz) / Un-snooze (back now)');
    const existing = this.state.existing;

    return (
      <div className="snooze-picker-backdrop" onClick={this._onBackdropClick}>
        <div
          ref={this._dialogRef}
          className="snooze-picker actuna-glass actuna-glass--medium"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={this._onKeyDown}
        >
          <header className="snooze-picker-header">
            <h2 className="snooze-picker-title">{ariaLabel}</h2>
            <button
              type="button"
              className="snooze-picker-close"
              aria-label={closeLabel}
              onClick={this._close}
            >
              ×
            </button>
          </header>

          {existing && (
            <div className="snooze-picker-existing" role="status">
              {localized('Aktualnie zaplanowany powrót / Currently scheduled wake')}:
              {' '}<strong>{formatWake(existing.wakeAt)}</strong>
              {existing.serverSupport === 'local_only' && (
                <div className="snooze-picker-warning" role="note">
                  {localized('Snooze działa tylko gdy aplikacja jest uruchomiona. / Snooze only works while the app is running.')}
                </div>
              )}
            </div>
          )}

          <div className="snooze-picker-presets" role="group" aria-label={localized('Szybkie wybory / Quick presets')}>
            {PRESETS.map((preset) => {
              const wakeAt = resolvePreset(preset, new Date());
              return (
                <button
                  key={preset}
                  type="button"
                  className="snooze-preset-btn"
                  onClick={() => this._onPresetClick(preset)}
                  data-preset={preset}
                >
                  <span className="snooze-preset-label">
                    {PRESET_LABELS_PL[preset]} / {PRESET_LABELS_EN[preset]}
                  </span>
                  <span className="snooze-preset-time" aria-hidden="true">
                    {formatWake(wakeAt)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="snooze-picker-custom-section">
            <button
              type="button"
              className="snooze-picker-custom-toggle"
              aria-expanded={this.state.showCustom}
              onClick={() => this.setState({ showCustom: !this.state.showCustom })}
            >
              {customToggleLabel}
            </button>
            {this.state.showCustom && (
              <div className="snooze-picker-custom" role="group">
                <input
                  type="datetime-local"
                  className="snooze-picker-custom-input"
                  value={this.state.customValue}
                  onChange={this._onCustomChange}
                  aria-label={localized('Data i godzina powrotu / Wake date and time')}
                />
                <button
                  type="button"
                  className="snooze-picker-custom-confirm"
                  onClick={this._onCustomConfirm}
                >
                  {customConfirmLabel}
                </button>
              </div>
            )}
          </div>

          {existing && (
            <footer className="snooze-picker-footer">
              <button
                type="button"
                className="snooze-picker-unsnooze"
                onClick={this._onUnsnooze}
              >
                {unsnoozeLabel}
              </button>
            </footer>
          )}
        </div>
      </div>
    );
  }
}
