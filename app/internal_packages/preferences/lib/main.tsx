/* eslint global-require: 0 */
import {
  localized,
  PreferencesUIStore,
  WorkspaceStore,
  ComponentRegistry,
} from 'actunamail-exports';

import PreferencesRoot from './preferences-root';

export function activate() {
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'General',
      displayName: localized('General'),
      componentClassFn: () => require('./tabs/preferences-general').default,
      order: 1,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Accounts',
      displayName: localized('Accounts'),
      componentClassFn: () => require('./tabs/preferences-accounts').default,
      order: 2,
    })
  );
  // Subscription tab removed in WS1-D: no Mailspring ID / Pro tier in Actuna Mail.
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Appearance',
      displayName: localized('Appearance'),
      componentClassFn: () => require('./tabs/preferences-appearance').default,
      order: 4,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Shortcuts',
      displayName: localized('Shortcuts'),
      componentClassFn: () => require('./tabs/preferences-keymaps').default,
      order: 5,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Mail Rules',
      displayName: localized('Mail Rules'),
      componentClassFn: () => require('./tabs/preferences-mail-rules').default,
      order: 6,
    })
  );
  // Ticket 45e — Magazyn tab: current DB info + v0.2.x archive manual cleanup.
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Storage',
      displayName: localized('Storage'),
      componentClassFn: () => require('./tabs/preferences-storage').default,
      order: 7,
    })
  );

  WorkspaceStore.defineSheet(
    'Preferences',
    {},
    {
      list: ['Preferences'],
      split: ['Preferences'],
      splitVertical: ['Preferences'],
    }
  );

  ComponentRegistry.register(PreferencesRoot, {
    location: WorkspaceStore.Location.Preferences,
  });
}

export function deactivate() {}

export function serialize() {
  return this.state;
}
