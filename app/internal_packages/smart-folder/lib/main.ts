/**
 * Smart Folder plugin entry — bilet MVP #99.
 *
 * activate():
 *   1. SmartFolderStore.init().
 *   2. Bind mod-shift-n → open wizard.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.smartFolder API z parseSearchSyntax dla #98 tag picker integration.
 */

import { SmartFolderStore } from './smart-folder-store';
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

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.smartFolder = {
    Store: SmartFolderStore,
    evalRule,
    evalRules,
    filterThreads,
    parseSearchSyntax,
  };
}

export function deactivate() {
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
  console.info('[smart-folder] open wizard');
  // TODO React wizard modal — Mockup: design/mockups/14-smart-folder-wizard.html
}

function closeWizard(): void {
  // TODO
}

function exportJSON(): void {
  try {
    const json = SmartFolderStore.exportJSON();
    // TODO show save dialog or copy to clipboard
    console.info('[smart-folder] export JSON length:', json.length);
  } catch (e) {
    console.error('[smart-folder] export failed:', e);
  }
}

function importJSON(): void {
  console.info('[smart-folder] open import file picker');
  // TODO file picker → SmartFolderStore.importJSON(content)
}

export type { Rule, MatchMode, ThreadMeta, SmartFolderDefinition };
