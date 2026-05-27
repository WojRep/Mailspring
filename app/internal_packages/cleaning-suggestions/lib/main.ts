/**
 * Cleaning Suggestions + Read Later plugin entry — bilet MVP #116.
 */

import { CleaningStore } from './cleaning-store';
import {
  analyzeForSuggestions,
  categorize,
  extractDomain,
  MIN_COUNT_THRESHOLD,
  MIN_AGE_DAYS,
} from './suggestions-engine';

export function activate() {
  CleaningStore.init();

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'cleaning:run-scan',
      label: 'Skanuj inbox — sugestie sprzątania',
      section: 'Mail',
      keywords: ['cleaning', 'scan', 'sugestie', 'cleanup', 'porządki'],
      handler: () => runScan(),
    });
    palette.register({
      id: 'cleaning:first-run',
      label: 'Quick cleanup wizard (first-run)',
      section: 'Mail',
      keywords: ['cleaning', 'wizard', 'first-run', 'onboarding'],
      handler: () => firstRunWizard(),
    });
    palette.register({
      id: 'cleaning:read-later',
      label: 'Read Later — preferencje + digest',
      section: 'Settings',
      keywords: ['read later', 'digest', 'newsletter', 'preferences'],
      handler: () => openReadLaterPrefs(),
    });
    palette.register({
      id: 'cleaning:preferences',
      label: 'Sugestie sprzątania — preferencje',
      section: 'Settings',
      keywords: ['cleaning', 'preferences', 'scope', 'kategorie'],
      handler: () => openPrefs(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.cleaning = {
    Store: CleaningStore,
    analyzeForSuggestions,
    categorize,
    extractDomain,
    constants: {
      MIN_COUNT_THRESHOLD,
      MIN_AGE_DAYS,
    },
  };
}

export function deactivate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    ['cleaning:run-scan', 'cleaning:first-run', 'cleaning:read-later', 'cleaning:preferences']
      .forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.cleaning) {
    delete (window as any).AppEnv.cleaning;
  }
}

function runScan(): void { console.info('[cleaning] run aggregate scan'); }
function firstRunWizard(): void { console.info('[cleaning] open first-run wizard'); }
function openReadLaterPrefs(): void { console.info('[cleaning] open Read Later preferences'); }
function openPrefs(): void { console.info('[cleaning] open Cleaning preferences'); }

export type {
  MessageMeta,
  CleaningSuggestion,
  MessageCategory,
  SuggestOptions,
} from './suggestions-engine';
export type {
  CleaningSettings,
  ReadLaterSettings,
  DigestSchedule,
  SuggestionAction,
  SuggestionRecord,
} from './cleaning-store';
