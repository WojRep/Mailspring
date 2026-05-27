/**
 * People Hub plugin entry — bilet MVP #103.
 *
 * activate():
 *   1. PeopleHubStore.init() + CardDAVAdapter.init().
 *   2. Bind Cmd+Shift+P → people-hub:open.
 *   3. Cmd+K palette commands (open / new group / import vCard / export vCard / add CardDAV).
 *   4. Expose AppEnv.peopleHub API.
 */

import { PeopleHubStore } from './people-hub-store';
import { CardDAVAdapter } from './carddav-adapter';
import { parseVCards, serializeVCards } from './vcard';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  PeopleHubStore.init();
  CardDAVAdapter.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'people-hub:open': () => openHub(),
      'people-hub:new-group': () => openNewGroup(),
      'people-hub:import-vcard': () => importVCard(),
      'people-hub:export-vcard': () => exportVCard(),
      'people-hub:add-carddav': () => openAddCardDAV(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'people-hub:open',
      label: 'Otwórz People hub / Open People Hub',
      section: 'View',
      keywords: ['people', 'contacts', 'osoby', 'kontakty', 'hub'],
      shortcut: ['⌘', '⇧', 'P'],
      handler: () => openHub(),
    });
    palette.register({
      id: 'people-hub:new-group',
      label: 'Nowa grupa nadawców / New Sender Group',
      section: 'Contacts',
      keywords: ['group', 'grupa', 'sender', 'people', 'new'],
      handler: () => openNewGroup(),
    });
    palette.register({
      id: 'people-hub:import-vcard',
      label: 'Importuj vCard (.vcf)',
      section: 'Contacts',
      keywords: ['vcard', 'import', 'contacts', 'vcf'],
      handler: () => importVCard(),
    });
    palette.register({
      id: 'people-hub:export-vcard',
      label: 'Eksportuj kontakty do vCard 4.0',
      section: 'Contacts',
      keywords: ['vcard', 'export', 'contacts'],
      handler: () => exportVCard(),
    });
    palette.register({
      id: 'people-hub:add-carddav',
      label: 'Dodaj konto CardDAV',
      section: 'Settings',
      keywords: ['carddav', 'sync', 'icloud', 'fastmail', 'nextcloud'],
      handler: () => openAddCardDAV(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.peopleHub = {
    Store: PeopleHubStore,
    CardDAV: CardDAVAdapter,
    vCard: { parseVCards, serializeVCards },
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    [
      'people-hub:open',
      'people-hub:new-group',
      'people-hub:import-vcard',
      'people-hub:export-vcard',
      'people-hub:add-carddav',
    ].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.peopleHub) {
    delete (window as any).AppEnv.peopleHub;
  }
}

function openHub(): void {
  console.info('[people-hub] open hub view');
  // TODO React list: search, filter by tag, sort (Recent / Name / Org), groups section
}

function openNewGroup(): void {
  console.info('[people-hub] open new group wizard');
  // TODO modal: name + color + autoDomain optional + manualEmails picker
}

function importVCard(): void {
  console.info('[people-hub] open file picker for .vcf');
  // TODO file picker → PeopleHubStore.importVCards(content)
}

function exportVCard(): void {
  try {
    const vcf = PeopleHubStore.exportVCards();
    console.info('[people-hub] export vCard length:', vcf.length);
    // TODO save dialog → write .vcf
  } catch (e) {
    console.error('[people-hub] export failed:', e);
  }
}

function openAddCardDAV(): void {
  console.info('[people-hub] open Add CardDAV account dialog');
  // TODO Preferences > Accounts > Add CardDAV (provider dropdown + URL + credentials + sync interval)
}

export type { SenderGroup, AutocompleteEntry } from './people-hub-store';
export type { CardDAVAccount, CardDAVProvider, SyncResult } from './carddav-adapter';
export type { VCard, VCardEmail, VCardTel } from './vcard';
