import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import AccountSidebar from './components/account-sidebar';
import SyncNowButton from './components/sync-now-button';

export function activate(state) {
  ComponentRegistry.register(AccountSidebar, { location: WorkspaceStore.Location.RootSidebar });
  ComponentRegistry.register(SyncNowButton, {
    location: WorkspaceStore.Location.RootSidebar.Toolbar,
  });
}

export function deactivate(state) {
  ComponentRegistry.unregister(AccountSidebar);
  ComponentRegistry.unregister(SyncNowButton);
}
