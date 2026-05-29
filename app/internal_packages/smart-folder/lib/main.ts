/**
 * Smart Folder plugin entry — bilet MVP #99.
 *
 * activate():
 *   1. SmartFolderStore.init().
 *   2. Bind mod-shift-n → open wizard.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.smartFolder API z parseSearchSyntax dla #98 tag picker integration.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import SmartFolderWizard from './smart-folder-wizard';
import { SmartFolderStore } from './smart-folder-store';
import { SmartFolderUIBus } from './smart-folder-ui-bus';
import {
  evalRule,
  evalRules,
  filterThreads,
  parseSearchSyntax,
  Rule,
  MatchMode,
  ThreadMeta,
  SmartFolderDefinition,
} from './rule-engine';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  SmartFolderStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'smart-folder:open-wizard': () => openWizard(),
      'smart-folder:close-wizard': () => closeWizard(),
      'smart-folder:export-json': () => exportJSON(),
      'smart-folder:import-json': () => importJSON(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'smart-folder:new',
      label: 'Nowy Smart Folder / New Smart Folder',
      section: 'View',
      keywords: ['smart folder', 'wizard', 'filter', 'virtual'],
      shortcut: ['⌘', '⇧', 'N'],
      handler: () => openWizard(),
    });
    palette.register({
      id: 'smart-folder:export',
      label: 'Eksport Smart Folders (JSON)',
      section: 'View',
      keywords: ['export', 'smart folder', 'json'],
      handler: () => exportJSON(),
    });
    palette.register({
      id: 'smart-folder:import',
      label: 'Import Smart Folders (JSON)',
      section: 'View',
      keywords: ['import', 'smart folder', 'json'],
      handler: () => importJSON(),
    });
  }

  ComponentRegistry.register(SmartFolderWizard, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.smartFolder = {
    Store: SmartFolderStore,
    UIBus: SmartFolderUIBus,
    evalRule,
    evalRules,
    filterThreads,
    parseSearchSyntax,
  };
}

export function deactivate() {
  ComponentRegistry.unregister(SmartFolderWizard);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('smart-folder:new');
    palette.unregister('smart-folder:export');
    palette.unregister('smart-folder:import');
  }
  if ((window as any).AppEnv?.smartFolder) {
    delete (window as any).AppEnv.smartFolder;
  }
}

function openWizard(): void {
  SmartFolderUIBus.openWizard(null);
}

function closeWizard(): void {
  SmartFolderUIBus.closeWizard();
}

function exportJSON(): void {
  // File-system save dialog jest osobnym ticketem (drag-drop w Preferences).
  // Tu udostępniamy JSON do clipboard fallback przez modern API.
  try {
    const json = SmartFolderStore.exportJSON();
    if ((navigator as any)?.clipboard?.writeText) {
      (navigator as any).clipboard.writeText(json).catch(() => { /* silent */ });
    }
    console.info('[smart-folder] export JSON length:', json.length);
  } catch (e) {
    console.error('[smart-folder] export failed:', e);
  }
}

function importJSON(): void {
  // File picker UX → osobny ticket (Preferences drag-drop).
  // Tu pozostawiamy hook dla future integration.
  console.info('[smart-folder] open import file picker — TODO Preferences ticket');
}

export type { Rule, MatchMode, ThreadMeta, SmartFolderDefinition };
