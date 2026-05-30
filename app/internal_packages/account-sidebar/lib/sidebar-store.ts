import _ from 'underscore';
import ActunaMailStore from 'actunamail-store';
import {
  Actions,
  Account,
  AccountStore,
  ThreadCountsStore,
  WorkspaceStore,
  OutboxStore,
  FocusedPerspectiveStore,
  CategoryStore,
} from 'actunamail-exports';

import SidebarSection from './sidebar-section';
import * as SidebarActions from './sidebar-actions';
import * as AccountCommands from './account-commands';
import { Disposable } from 'event-kit';
import { ISidebarSection } from './types';

const Sections = {
  Standard: 'Standard',
  User: 'User',
};

class SidebarStore extends ActunaMailStore {
  _sections: {
    Standard: ISidebarSection;
    User: ISidebarSection[];
  } = {
    Standard: { title: '', items: [] },
    User: [],
  };
  configSubscription: Disposable;

  constructor() {
    super();

    if (AppEnv.savedState.sidebarKeysCollapsed == null) {
      AppEnv.savedState.sidebarKeysCollapsed = {};
    }
    this._registerCommands();
    this._registerMenuItems();
    this._registerListeners();
    this._updateSections();
  }

  accounts() {
    return AccountStore.accounts();
  }

  sidebarAccountIds() {
    return FocusedPerspectiveStore.sidebarAccountIds();
  }

  standardSection() {
    return this._sections.Standard;
  }

  userSections() {
    return this._sections.User;
  }

  /**
   * Tags section per plan v1.0 #98 + mockup design/mockups/04-tag-picker.html.
   * Integruje TagStore: user tags only (system tags wykluczone — system tags są
   * widoczne jako filter w thread-list / chips, nie sidebar entry).
   *
   * Lazy require — bootstrap order safe.
   */
  tagsSection(): ISidebarSection {
    let tags: Array<{ id: string; name: string; color?: string; systemManaged?: boolean }> = [];
    try {
      const mod = require('../../tag-system/lib/tag-store');
      const TagStore = mod.TagStore;
      if (TagStore && typeof TagStore.list === 'function') {
        tags = TagStore.list().filter((t: any) => !t.systemManaged);
      }
    } catch (e) { /* tag-system not active */ }
    return {
      title: 'Tags',
      items: tags.map(t => ({
        id: `tag-${t.id}`,
        name: t.name,
        iconName: 'tag.png',
        accountIds: [],
        children: [],
        collapsed: false,
        unreadCount: 0,
      } as any)),
    };
  }

  /**
   * Attention Layers section per plan v1.0 #23 Attention-First Manifesto +
   * mockup design/mockups/01-app-shell.html:89.
   * Items: Focused (Priority Inbox high-priority threads — #93),
   *        Pinned (pinned threads — #93),
   *        Snoozed (snoozed threads — #104).
   *
   * Count'y są agregowane z odpowiednich Stores. Każdy item = perspective
   * router (klik dispatches AppEnv.commands lub directly opens filtered view).
   */
  attentionLayersSection(): ISidebarSection {
    let focusedCount = 0;
    let pinnedCount = 0;
    let snoozedCount = 0;
    try {
      const pi = require('../../priority-inbox-pin/lib/pin-store');
      const PriorityStore = pi.PriorityInboxStore || pi.default;
      if (PriorityStore && typeof PriorityStore.count === 'function') {
        focusedCount = PriorityStore.count({ bucket: 'high' }) || 0;
        pinnedCount = PriorityStore.count({ pinned: true }) || 0;
      }
    } catch (e) { /* #93 not active */ }
    try {
      const sn = require('../../snooze/lib/snooze-store');
      const SnoozeStore = sn.SnoozeStore || sn.default;
      if (SnoozeStore && typeof SnoozeStore.count === 'function') {
        snoozedCount = SnoozeStore.count();
      }
    } catch (e) { /* #104 not active */ }
    return {
      title: 'Attention Layers',
      items: [
        {
          id: 'attention-focused',
          name: 'Focused',
          iconName: 'star.png',
          accountIds: [],
          children: [],
          collapsed: false,
          unreadCount: focusedCount,
        } as any,
        {
          id: 'attention-pinned',
          name: 'Pinned',
          iconName: 'star.png',
          accountIds: [],
          children: [],
          collapsed: false,
          unreadCount: pinnedCount,
        } as any,
        {
          id: 'attention-snoozed',
          name: 'Snoozed',
          iconName: 'clock.png',
          accountIds: [],
          children: [],
          collapsed: false,
          unreadCount: snoozedCount,
        } as any,
      ],
    };
  }

  /**
   * Smart Folders section per plan v1.0 mockup design/mockups/01-app-shell.html:123.
   * Integruje #99 SmartFolderStore: każdy zapisany Smart Folder = sidebar item.
   * Empty list = section z 0 items (UI hide jeśli items.length===0).
   *
   * Lazy require dla SmartFolderStore — uniknij circular dep w bootstrap order
   * (account-sidebar może activate przed smart-folder plugin).
   */
  smartFoldersSection(): ISidebarSection {
    let folders: Array<{ id: string; name: string; color?: string }> = [];
    try {
      const mod = require('../../smart-folder/lib/smart-folder-store');
      const Store = mod.SmartFolderStore;
      if (Store && typeof Store.list === 'function') {
        folders = Store.list();
      }
    } catch (e) {
      // smart-folder package not activated jeszcze lub disabled — empty section
    }
    return {
      title: 'Smart Folders',
      items: folders.map(f => ({
        id: `smart-folder-${f.id}`,
        name: f.name,
        iconName: 'tag.png',
        accountIds: [],
        children: [],
        collapsed: false,
        unreadCount: 0,
      } as any)),
    };
  }

  _registerListeners() {
    this.listenTo(Actions.setCollapsedSidebarItem, this._onSetCollapsedByName);
    this.listenTo(SidebarActions.setKeyCollapsed, this._onSetCollapsedByKey);
    this.listenTo(AccountStore, this._onAccountsChanged);
    this.listenTo(FocusedPerspectiveStore, this._onFocusedPerspectiveChanged);
    this.listenTo(WorkspaceStore, this._updateSections);
    this.listenTo(OutboxStore, this._updateSections);
    this.listenTo(ThreadCountsStore, this._updateSections);
    this.listenTo(CategoryStore, this._updateSections);

    this.configSubscription = AppEnv.config.onDidChange(
      'core.workspace.showUnreadForAllCategories',
      this._updateSections
    );
  }

  _onSetCollapsedByKey = (itemKey: string, collapsed: boolean) => {
    const currentValue = AppEnv.savedState.sidebarKeysCollapsed[itemKey];
    if (currentValue !== collapsed) {
      AppEnv.savedState.sidebarKeysCollapsed[itemKey] = collapsed;
      this._updateSections();
    }
  };

  _onSetCollapsedByName = (itemName: string, collapsed: boolean) => {
    let item = this.standardSection().items.find((i) => i.name === itemName);
    if (!item) {
      for (const section of this.userSections()) {
        item = section.items.find((x) => x.name === itemName);
        if (item) {
          break;
        }
      }
    }
    if (!item) {
      return;
    }
    this._onSetCollapsedByKey(item.id, collapsed);
  };

  _registerCommands = (accounts: Account[] = null) => {
    if (accounts == null) {
      accounts = AccountStore.accounts();
    }
    AccountCommands.registerCommands(accounts);
  };

  _registerMenuItems = (accounts: Account[] = null) => {
    if (accounts == null) {
      accounts = AccountStore.accounts();
    }
    AccountCommands.registerMenuItems(accounts, FocusedPerspectiveStore.sidebarAccountIds());
  };

  // TODO Refactor this
  // Listen to changes on the account store only for when the account label
  // or order changes. When accounts or added or removed, those changes will
  // come in through the FocusedPerspectiveStore
  _onAccountsChanged = () => {
    this._updateSections();
  };

  // TODO Refactor this
  // The FocusedPerspectiveStore tells this store the accounts that should be
  // displayed in the sidebar (i.e. unified inbox vs single account) and will
  // trigger whenever an account is added or removed, as well as when a
  // perspective is focused.
  // However, when udpating the SidebarSections, we also depend on the actual
  // accounts in the AccountStore. The problem is that the FocusedPerspectiveStore
  // triggers before the AccountStore is actually updated, so we need to wait for
  // the AccountStore to get updated (via `defer`) before updateing our sidebar
  // sections
  _onFocusedPerspectiveChanged = () => {
    _.defer(() => {
      this._registerCommands();
      this._registerMenuItems();
      this._updateSections();
    });
  };

  _updateSections = () => {
    const accounts = FocusedPerspectiveStore.sidebarAccountIds()
      .map((id) => AccountStore.accountForId(id))
      .filter((a) => !!a);

    if (accounts.length === 0) {
      return;
    }
    const multiAccount = accounts.length > 1;

    this._sections[Sections.Standard] = SidebarSection.standardSectionForAccounts(accounts);
    this._sections[Sections.User] = accounts.map(function (acc) {
      const opts: { title?: string; collapsible?: boolean } = {};
      if (multiAccount) {
        opts.title = acc.label;
        opts.collapsible = true;
      }
      return SidebarSection.forUserCategories(acc, opts);
    });
    this.trigger();
  };
}

export default new SidebarStore();
