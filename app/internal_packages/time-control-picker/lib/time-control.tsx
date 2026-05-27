/**
 * Shared time-control picker — React component dla bilety MVP #90.
 *
 * Mockup: plan_to_version_1.0/design/mockups/07-snooze-picker.html
 *
 * Props:
 *   mode: 'snooze' | 'send-later' | 'reminder'   — wpływa na quick options
 *   onPick(date): wybór dokonany
 *   onCancel(): user zamknął
 *   recipientTimezone?: string (np. 'Europe/Warsaw') — warning gdy poza godzinami
 *
 * Reuse: #104 Snooze · #105 Send Later · #106 Follow-up · #100 scheduled rules.
 */

import React from 'react';
import { parseNaturalLanguage, ParseResult } from './natural-language-parser';

const { localized } = require('actunamail-exports');

export type TimeControlMode = 'snooze' | 'send-later' | 'reminder';

interface QuickOption {
  id: string;
  label: string;
  computeDate(): Date;
  showInModes: TimeControlMode[];
  shortcut?: string;
}

function nextWorkdayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextOccurrenceAt(targetDay: number, hour: number, minute = 0): Date {
  const d = new Date();
  let daysAhead = (targetDay - d.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const QUICK_OPTIONS: QuickOption[] = [
  {
    id: 'later-today',
    label: localized('Później dziś (15:00)'),
    computeDate: () => {
      const d = new Date();
      d.setHours(15, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
    showInModes: ['snooze', 'send-later', 'reminder'],
    shortcut: '1',
  },
  {
    id: 'tomorrow-morning',
    label: localized('Jutro rano (9:00)'),
    computeDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
    showInModes: ['snooze', 'send-later', 'reminder'],
    shortcut: '2',
  },
  {
    id: 'tomorrow-evening',
    label: localized('Jutro wieczorem (18:00)'),
    computeDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
      return d;
    },
    showInModes: ['snooze', 'send-later'],
    shortcut: '3',
  },
  {
    id: 'this-weekend',
    label: localized('Ten weekend (sobota 9:00)'),
    computeDate: () => nextOccurrenceAt(6, 9),
    showInModes: ['snooze', 'reminder'],
    shortcut: '4',
  },
  {
    id: 'next-week',
    label: localized('Następny tydzień (pn 9:00)'),
    computeDate: () => nextOccurrenceAt(1, 9),
    showInModes: ['snooze', 'send-later', 'reminder'],
    shortcut: '5',
  },
  {
    id: 'next-month',
    label: localized('Następny miesiąc (1, 9:00)'),
    computeDate: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
    showInModes: ['snooze', 'reminder'],
    shortcut: '6',
  },
  {
    id: 'in-3-days',
    label: localized('Za 3 dni (9:00)'),
    computeDate: () => nextWorkdayAt(9),
    showInModes: ['reminder'],
    shortcut: '6',
  },
];

interface Props {
  mode?: TimeControlMode;
  onPick: (date: Date) => void;
  onCancel: () => void;
  /** Recipient timezone (informational — warning gdy poza working hours). */
  recipientTimezone?: string;
}

interface State {
  selectedIndex: number;
  nlInput: string;
  nlParsed: ParseResult | null;
  customDate: string;
  customTime: string;
}

export default class TimeControlPicker extends React.Component<Props, State> {
  static defaultProps: Partial<Props> = { mode: 'snooze' };

  state: State = {
    selectedIndex: 1, // default to "Tomorrow morning"
    nlInput: '',
    nlParsed: null,
    customDate: '',
    customTime: '09:00',
  };

  private _inputRef = React.createRef<HTMLInputElement>();

  componentDidMount() {
    // Default custom-date = jutro
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    this.setState({ customDate: iso });
    setTimeout(() => this._inputRef.current?.focus(), 50);
  }

  private _getVisibleQuickOptions(): QuickOption[] {
    const mode = this.props.mode || 'snooze';
    return QUICK_OPTIONS.filter(q => q.showInModes.includes(mode));
  }

  private _onNlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nlInput = e.target.value;
    const nlParsed = parseNaturalLanguage(nlInput);
    this.setState({ nlInput, nlParsed });
  };

  private _onPickQuick = (q: QuickOption) => {
    this.props.onPick(q.computeDate());
  };

  private _onPickCustom = () => {
    const { customDate, customTime } = this.state;
    if (!customDate) return;
    const [h, m] = customTime.split(':').map(n => parseInt(n, 10));
    const d = new Date(`${customDate}T00:00:00`);
    d.setHours(h || 9, m || 0, 0, 0);
    this.props.onPick(d);
  };

  private _onPickNl = () => {
    if (this.state.nlParsed) this.props.onPick(this.state.nlParsed.date);
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const visible = this._getVisibleQuickOptions();
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.props.onCancel();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.setState({ selectedIndex: Math.min(visible.length - 1, this.state.selectedIndex + 1) });
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setState({ selectedIndex: Math.max(0, this.state.selectedIndex - 1) });
        break;
      case 'Enter':
        if (this.state.nlParsed && document.activeElement === this._inputRef.current) {
          e.preventDefault();
          this._onPickNl();
        } else if (visible[this.state.selectedIndex]) {
          e.preventDefault();
          this._onPickQuick(visible[this.state.selectedIndex]);
        }
        break;
      default:
        // Quick pick by number
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= visible.length) {
          const target = visible.find(q => q.shortcut === String(num));
          if (target) {
            e.preventDefault();
            this._onPickQuick(target);
          }
        }
    }
  };

  render() {
    const visible = this._getVisibleQuickOptions();
    const modeLabels: Record<TimeControlMode, string> = {
      'snooze': localized('Odłóż do…'),
      'send-later': localized('Wyślij później…'),
      'reminder': localized('Przypomnij…'),
    };

    return (
      <div
        className="time-control-picker"
        role="dialog"
        aria-modal="true"
        aria-label={modeLabels[this.props.mode || 'snooze']}
        onKeyDown={this._onKeyDown}
      >
        <div className="tcp-header">
          <span className="tcp-icon" aria-hidden="true">⏰</span>
          <h3 className="tcp-title">{modeLabels[this.props.mode || 'snooze']}</h3>
        </div>

        <div className="tcp-section">
          <div className="tcp-section-label">{localized('Szybkie opcje / Quick options')}</div>
          <div className="tcp-quick-grid">
            {visible.map((q, idx) => (
              <button
                key={q.id}
                className={`tcp-quick-option ${idx === this.state.selectedIndex ? 'focused' : ''}`}
                onClick={() => this._onPickQuick(q)}
                onMouseEnter={() => this.setState({ selectedIndex: idx })}
                aria-label={`${q.label} — ${describe(q.computeDate())}`}
              >
                <span className="tcp-quick-label">{q.label}</span>
                <span className="tcp-quick-when">{describe(q.computeDate())}</span>
                {q.shortcut && <span className="tcp-quick-key"><kbd>{q.shortcut}</kbd></span>}
              </button>
            ))}
          </div>
        </div>

        <div className="tcp-section">
          <label className="tcp-section-label" htmlFor="tcp-nl">
            {localized('Lub wpisz / Or type natural language')}
          </label>
          <input
            ref={this._inputRef}
            id="tcp-nl"
            className="tcp-nl-input"
            type="text"
            value={this.state.nlInput}
            onChange={this._onNlChange}
            placeholder={localized('np. "jutro 14:00", "za 3 dni", "next monday 9am"')}
            autoComplete="off"
            spellCheck={false}
          />
          {this.state.nlParsed && (
            <div className="tcp-nl-preview" aria-live="polite">
              <span aria-hidden="true">✓</span> {localized('Sparsowane:')} <strong>{this.state.nlParsed.description}</strong>
              <button className="tcp-nl-confirm" onClick={this._onPickNl}>{localized('Wybierz')}</button>
            </div>
          )}
        </div>

        <div className="tcp-section">
          <div className="tcp-section-label">{localized('Lub wybierz datę i godzinę')}</div>
          <div className="tcp-custom-row">
            <input
              className="tcp-date"
              type="date"
              value={this.state.customDate}
              onChange={e => this.setState({ customDate: e.target.value })}
              aria-label={localized('Data')}
            />
            <input
              className="tcp-time"
              type="time"
              value={this.state.customTime}
              onChange={e => this.setState({ customTime: e.target.value })}
              aria-label={localized('Godzina')}
            />
            <button className="tcp-custom-confirm" onClick={this._onPickCustom}>
              {localized('Wybierz')}
            </button>
          </div>
        </div>

        <div className="tcp-footer">
          <span className="tcp-footer-hint">
            <kbd>1</kbd>–<kbd>{visible.length}</kbd> {localized('quick pick')} ·
            <kbd>↵</kbd> {localized('wybierz')} ·
            <kbd>esc</kbd> {localized('anuluj')}
          </span>
          <button className="tcp-cancel" onClick={this.props.onCancel}>
            {localized('Anuluj / Cancel')}
          </button>
        </div>
      </div>
    );
  }
}

function describe(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch (e) {
    return d.toLocaleString();
  }
}
