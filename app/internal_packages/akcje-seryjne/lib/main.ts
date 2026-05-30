/**
 * Akcje seryjne / Compound Actions plugin entry — bilet MVP #101.
 *
 * activate():
 *   1. CompoundActionStore.init().
 *   2. Bind Ctrl/Cmd+Shift+1..9 → akcje-seryjne:trigger-N → dispatch do bound compound.
 *   3. Cmd+K palette commands (new, manage, export, import) + per-compound entry.
 *   4. Expose AppEnv.akcjeSeryjne API.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import QuickStepsToolbar from './quick-steps-toolbar';
import { CompoundActionStore, CompoundShortcut, DESTRUCTIVE_ACTIONS, BULK_DESTRUCTIVE_THRESHOLD } from './compound-action-store';

let shortcutDisposable: { dispose(): void } | null = null;
let storeUnsub: (() => void) | null = null;

export function activate() {
  CompoundActionStore.init();

  // Mount Quick Steps toolbar w MessageList header — toolbar buttons widoczne
  // gdy są compound actions z showInToolbar=true. Plan v1.0 #101 + mockup
  // 15-compound-actions.html. Slot: MessageList:Header (obok TagChips #98 +
  // PinBadge #93 — wszystkie 3 dzielą ten sam header slot).
  ComponentRegistry.register(QuickStepsToolbar, {
    role: 'MessageList:Header',
  });

  if ((window as any).AppEnv?.commands?.add) {
    const handlers: Record<string, () => void> = {
      'akcje-seryjne:open-wizard': () => openWizard(),
      'akcje-seryjne:open-preferences': () => openPreferences(),
      'akcje-seryjne:export-json': () => exportJSON(),
      'akcje-seryjne:import-json': () => importJSON(),
    };
    for (let n = 1; n <= 9; n++) {
      handlers[`akcje-seryjne:trigger-${n}`] = () => triggerShortcut(n as CompoundShortcut);
    }
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, handlers);
  }

  registerPaletteCommands();
  storeUnsub = CompoundActionStore.listen(() => registerPaletteCommands());

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.akcjeSeryjne = {
    Store: CompoundActionStore,
    constants: {
      DESTRUCTIVE_ACTIONS: Array.from(DESTRUCTIVE_ACTIONS),
      BULK_DESTRUCTIVE_THRESHOLD,
    },
  };
}

export function deactivate() {
  ComponentRegistry.unregister(QuickStepsToolbar);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  if (storeUnsub) {
    storeUnsub();
    storeUnsub = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('akcje-seryjne:new');
    palette.unregister('akcje-seryjne:manage');
    palette.unregister('akcje-seryjne:export');
    palette.unregister('akcje-seryjne:import');
    for (const a of CompoundActionStore.list()) {
      palette.unregister(`akcje-seryjne:run-${a.id}`);
    }
  }
  if ((window as any).AppEnv?.akcjeSeryjne) {
    delete (window as any).AppEnv.akcjeSeryjne;
  }
}

function registerPaletteCommands(): void {
  const palette = (window as any).AppEnv?.commandPalette;
  if (!palette) return;

  // Re-register base commands (idempotent — palette.register should overwrite)
  palette.register({
    id: 'akcje-seryjne:new',
    label: 'Nowa akcja seryjna / New Compound Action',
    section: 'Automation',
    keywords: ['akcja seryjna', 'compound', 'action', 'shortcut'],
    handler: () => openWizard(),
  });
  palette.register({
    id: 'akcje-seryjne:manage',
    label: 'Zarządzaj akcjami seryjnymi / Manage Compound Actions',
    section: 'Settings',
    keywords: ['akcja seryjna', 'compound', 'manage', 'preferences'],
    handler: () => openPreferences(),
  });
  palette.register({
    id: 'akcje-seryjne:export',
    label: 'Eksport akcji seryjnych (JSON)',
    section: 'Settings',
    keywords: ['export', 'compound', 'json'],
    handler: () => exportJSON(),
  });
  palette.register({
    id: 'akcje-seryjne:import',
    label: 'Import akcji seryjnych (JSON)',
    section: 'Settings',
    keywords: ['import', 'compound', 'json'],
    handler: () => importJSON(),
  });

  // Per-compound run entries
  for (const compound of CompoundActionStore.list()) {
    const shortcut = compound.shortcut !== undefined
      ? ['⌘', '⇧', String(compound.shortcut)]
      : undefined;
    palette.register({
      id: `akcje-seryjne:run-${compound.id}`,
      label: compound.name,
      section: 'Automation',
      keywords: ['akcja seryjna', 'compound', compound.name.toLowerCase()],
      shortcut,
      handler: () => runCompound(compound.id),
    });
  }
}

function triggerShortcut(n: CompoundShortcut): void {
  // TODO read current accountId from AppEnv (account context)
  const accountId: string | undefined = (window as any).AppEnv?.currentAccountId;
  const compound = CompoundActionStore.findByShortcut(n, accountId);
  if (!compound) {
    console.info(`[akcje-seryjne] no compound bound to Ctrl/Cmd+Shift+${n}`);
    return;
  }
  runCompound(compound.id);
}

function runCompound(compoundId: string): void {
  console.info('[akcje-seryjne] run compound', compoundId);
  // TODO: pull selected/focused threadIds from FocusedContentStore, preview destructive,
  // confirm if requiresDestructiveConfirm, then dispatch each action via existing Mailspring task system
}

function openWizard(): void {
  console.info('[akcje-seryjne] open wizard');
  // TODO React wizard: name + icon + shortcut (1..9 dropdown) + action chain + per-account scope
}

function openPreferences(): void {
  console.info('[akcje-seryjne] open Preferences > Akcje seryjne');
  // TODO open prefs pane: list + toolbar config + per-account override
}

function exportJSON(): void {
  try {
    const json = CompoundActionStore.exportJSON();
    console.info('[akcje-seryjne] export JSON length:', json.length);
  } catch (e) {
    console.error('[akcje-seryjne] export failed:', e);
  }
}

function importJSON(): void {
  console.info('[akcje-seryjne] open import file picker');
}

export type { CompoundAction, CompoundShortcut, ApplyPreview } from './compound-action-store';
