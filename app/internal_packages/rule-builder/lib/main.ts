/**
 * Rule builder plugin entry — bilet MVP #100.
 *
 * activate():
 *   1. RuleStore.init().
 *   2. Bind mod-alt-r → open sentence builder.
 *   3. Bind mod-alt-shift-r → Run Rules Now.
 *   4. Cmd+K palette commands (open / run now / create from email / export / import).
 *   5. Expose AppEnv.rules API.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import RuleBuilder from './rule-builder';
import { RuleStore } from './rule-store';
import { RuleBuilderUIBus } from './rule-builder-ui-bus';
import {
  AutomationRule,
  Action,
  ActionType,
  TriggerType,
  RuleAuditEntry,
  ACTION_LABELS_PL,
  ACTION_LABELS_EN,
  TRIGGER_LABELS_PL,
  TRIGGER_LABELS_EN,
  BULK_CONFIRM_THRESHOLD,
  CONSENT_REQUIRED_ACTIONS,
} from './rule-types';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  RuleStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'rule-builder:open-builder': () => openBuilder(),
      'rule-builder:run-rules-now': () => openRunRulesNow(),
      'rule-builder:create-from-email': () => openCreateFromEmail(),
      'rule-builder:export-json': () => exportJSON(),
      'rule-builder:import-json': () => importJSON(),
      'rule-builder:open-preferences': () => openPreferences(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'rule-builder:new',
      label: 'Nowa reguła / New Rule',
      section: 'Automation',
      keywords: ['rule', 'reguła', 'automation', 'filter', 'workflow'],
      shortcut: ['⌘', '⌥', 'R'],
      handler: () => openBuilder(),
    });
    palette.register({
      id: 'rule-builder:run-now',
      label: 'Uruchom reguły teraz / Run Rules Now',
      section: 'Automation',
      keywords: ['run', 'execute', 'rule', 'now'],
      shortcut: ['⌘', '⌥', '⇧', 'R'],
      handler: () => openRunRulesNow(),
    });
    palette.register({
      id: 'rule-builder:create-from-email',
      label: 'Utwórz regułę z tego maila',
      section: 'Automation',
      keywords: ['rule', 'create', 'from', 'email', 'message'],
      handler: () => openCreateFromEmail(),
    });
    palette.register({
      id: 'rule-builder:preferences',
      label: 'Zarządzaj regułami (Preferences > Rules)',
      section: 'Settings',
      keywords: ['rules', 'manage', 'preferences', 'automation'],
      handler: () => openPreferences(),
    });
    palette.register({
      id: 'rule-builder:export',
      label: 'Eksport reguł (JSON)',
      section: 'Settings',
      keywords: ['export', 'rules', 'json', 'backup'],
      handler: () => exportJSON(),
    });
    palette.register({
      id: 'rule-builder:import',
      label: 'Import reguł (JSON)',
      section: 'Settings',
      keywords: ['import', 'rules', 'json', 'restore'],
      handler: () => importJSON(),
    });
  }

  ComponentRegistry.register(RuleBuilder, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.rules = {
    Store: RuleStore,
    UIBus: RuleBuilderUIBus,
    Labels: {
      action_pl: ACTION_LABELS_PL,
      action_en: ACTION_LABELS_EN,
      trigger_pl: TRIGGER_LABELS_PL,
      trigger_en: TRIGGER_LABELS_EN,
    },
    constants: {
      BULK_CONFIRM_THRESHOLD,
      CONSENT_REQUIRED_ACTIONS: Array.from(CONSENT_REQUIRED_ACTIONS),
    },
  };
}

export function deactivate() {
  ComponentRegistry.unregister(RuleBuilder);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    [
      'rule-builder:new',
      'rule-builder:run-now',
      'rule-builder:create-from-email',
      'rule-builder:preferences',
      'rule-builder:export',
      'rule-builder:import',
    ].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.rules) {
    delete (window as any).AppEnv.rules;
  }
}

function openBuilder(): void {
  RuleBuilderUIBus.openBuilder(null);
}

function openRunRulesNow(): void {
  // Lightweight Run Now picker — osobny modal odłożony na follow-up
  // (Preferences > Rules list view). Tu wystarczy hint UI dla MVP +
  // dispatch handler dla command-palette commands; future RunRulesNowDialog
  // component będzie subskrybować RuleBuilderUIBus.isRunNowOpen() (już ready).
  RuleBuilderUIBus.openRunNow();
  console.info('[rule-builder] Run Rules Now picker — picker UI TODO (follow-up ticket)');
}

function openCreateFromEmail(): void {
  // Pull focused thread metadata → seed conditions w pre-fill.
  // MVP: just open empty builder; future enhancement (osobny ticket)
  // will inject selected thread metadata jako default conditions.
  RuleBuilderUIBus.openBuilder(null);
}

function openPreferences(): void {
  console.info('[rule-builder] open Preferences > Rules list');
  // TODO open prefs tab — list with [Server]/[Local] badge + hits counter + ⋮ menu
}

function exportJSON(): void {
  try {
    const json = RuleStore.exportJSON();
    console.info('[rule-builder] export JSON length:', json.length);
    // TODO save dialog
  } catch (e) {
    console.error('[rule-builder] export failed:', e);
  }
}

function importJSON(): void {
  console.info('[rule-builder] open import file picker');
  // TODO file picker → RuleStore.importJSON(content)
}

export type { AutomationRule, Action, ActionType, TriggerType, RuleAuditEntry };
