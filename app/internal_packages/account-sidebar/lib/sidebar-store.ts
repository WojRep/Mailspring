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
  MailboxPerspective,
  DatabaseStore,
  Thread,
} from 'actunamail-exports';

import SidebarSection, { isSectionCollapsed, toggleSectionCollapsed } from './sidebar-section';
import SidebarItem from './sidebar-item';
import * as SidebarActions from './sidebar-actions';
import * as AccountCommands from './account-commands';
import { Disposable } from 'event-kit';
import { ISidebarSection } from './types';

const Sections = {
  Standard: 'Standard',
  User: 'User',
};

// Smart Folder filtr regułowy (punkt 3): snapshot okna N najnowszych wątków
// filtrowany regułami po stronie JS (wzorzec jak Tagi). Nie skaluje się na całą
// bazę — patrz analysis/ note; ścieżka docelowa to query strukturalny.
const SMART_FOLDER_WINDOW = 5000;

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
    // Bilet #119: każda pozycja tagu = klikalna perspektywa filtrowana
    // (ThreadIdListPerspective po przypisaniach TagStore — wzorzec Snoozed).
    // Filtr w JS (TagStore reverse lookup), zapytanie SQLite po liście id.
    let items: ISidebarSection['items'] = [];
    try {
      const mod = require('../../tag-system/lib/tag-store');
      const TagStore = mod.TagStore;
      if (TagStore && typeof TagStore.list === 'function') {
        const accountIds = AccountStore.accountIds();
        items = TagStore.list()
          .filter((t: any) => !t.systemManaged)
          .map((t: any) => {
            const threadIds: string[] =
              typeof TagStore.threadIdsWithTag === 'function'
                ? TagStore.threadIdsWithTag(t.id)
                : [];
            const perspective = MailboxPerspective.forThreadIds(threadIds, accountIds, t.name);
            // Marker do odświeżenia po zmianie przypisań (staleness) — patrz
            // _refocusTagPerspectiveIfStale(). Nie serializowany (snapshot po
            // restarcie odświeża się przy następnym kliku).
            (perspective as any)._tagPerspectiveId = t.id;
            return SidebarItem.forPerspective(`tag-${t.id}`, perspective, {
              name: t.name,
              iconName: 'tag.png',
              count: threadIds.length,
            });
          });
      }
    } catch (e) {
      /* tag-system not active */
    }
    // Sekcja zwijalna (porządkowanie panelu): collapsed/onCollapseToggled jak
    // sekcje folderów — stan trzymany pod tytułem w savedState.sidebarKeysCollapsed.
    return {
      title: 'Tags',
      items,
      collapsed: isSectionCollapsed('Tags'),
      onCollapseToggled: toggleSectionCollapsed,
    };
  }

  /**
   * Bilet #119: ThreadIdListPerspective jest snapshotem listy id. Gdy user
   * patrzy na widok tagu, a przypisania się zmienią (picker / sync z serwera),
   * re-dispatch świeżej perspektywy tego samego tagu.
   */
  _refocusTagPerspectiveIfStale = () => {
    try {
      const current: any = FocusedPerspectiveStore.current();
      const tagId = current && current._tagPerspectiveId;
      if (!tagId) return;
      const mod = require('../../tag-system/lib/tag-store');
      const TagStore = mod.TagStore;
      const tag = TagStore && TagStore.get ? TagStore.get(tagId) : null;
      if (!tag) return;
      const threadIds: string[] = TagStore.threadIdsWithTag(tagId);
      const existing: string[] = (current.toJSON && current.toJSON().threadIds) || [];
      if (threadIds.slice().sort().join('\n') === existing.slice().sort().join('\n')) return;
      const fresh = MailboxPerspective.forThreadIds(threadIds, AccountStore.accountIds(), tag.name);
      (fresh as any)._tagPerspectiveId = tagId;
      Actions.focusMailboxPerspective(fresh);
    } catch (e) {
      /* tag-system not active */
    }
  };

  /**
   * Priorytety (bilet #120): ćwiartki Eisenhowera / poziomy A-B-C jako
   * klikalne widoki wg rank (grupowanie zamiast sortowania SQL) — pozycja
   * per element aktywnego presetu, perspektywa #119-mechanizmem.
   */
  prioritySection(): ISidebarSection {
    let items: ISidebarSection['items'] = [];
    try {
      const tagMod = require('../../tag-system/lib/tag-store');
      const presetMod = require('../../tag-system/lib/priority-preset-store');
      const TagStore = tagMod.TagStore;
      const PriorityPresetStore = presetMod.PriorityPresetStore;
      const PRESETS = presetMod.PRESETS;
      const active = PriorityPresetStore && PriorityPresetStore.activePreset();
      if (active && PRESETS[active]) {
        const accountIds = AccountStore.accountIds();
        items = PRESETS[active].members
          .slice()
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((m: any) => {
            const threadIds: string[] = TagStore.threadIdsWithTag(m.id);
            const perspective = MailboxPerspective.forThreadIds(threadIds, accountIds, m.name);
            (perspective as any)._tagPerspectiveId = m.id;
            return SidebarItem.forPerspective(`priority-${m.id}`, perspective, {
              name: m.name,
              iconName: 'tag.png',
              count: threadIds.length,
            });
          });
      }
    } catch (e) {
      /* tag-system not active */
    }
    return {
      title: 'Priorytety / Priority',
      items,
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
    const accountIds = AccountStore.accountIds();

    // Pinned/Focused: perspektywa zapytaniowa po zsynchronizowanym `Thread.pinned`
    // (keyword IMAP `$Pinned`) — reflektuje piny z dowolnego urządzenia (decyzja
    // plan_to_version_1.0/46). Focused = Pinned (skrót MVP, user-confirmed).
    // Count badge bierze z PinStore (instant cache); lista z modelu (cross-device).
    // Snoozed: lokalna lista (snooze cross-device to osobny, jeszcze nieukończony
    // feature) — perspektywa ThreadIdListPerspective po SnoozeStore.
    let pinnedCount = 0;
    let snoozedIds: string[] = [];
    try {
      const pinModule = require('../../priority-inbox-pin/lib/pin-store');
      const PinStore = pinModule.PinStore || pinModule.default;
      if (PinStore && typeof PinStore.count === 'function') {
        pinnedCount = PinStore.count();
      }
    } catch (e) {
      /* #93 Pin not active */
    }
    try {
      const sn = require('../../snooze/lib/snooze-store');
      const SnoozeStore = sn.SnoozeStore || sn.default;
      if (SnoozeStore && typeof SnoozeStore.list === 'function') {
        snoozedIds = SnoozeStore.list().map((e: { threadId: string }) => e.threadId);
      }
    } catch (e) {
      /* #104 Snooze not active */
    }

    return {
      title: 'Attention Layers',
      items: [
        // Focused = auto-wykryte ważne (pinned ∪ starred ∪ reguły/AI) — query po
        // modelu. Count pomijamy (wymaga zapytania zliczającego, nie z cache).
        SidebarItem.forPerspective('attention-focused', MailboxPerspective.forFocused(accountIds), {
          name: 'Focused',
          iconName: 'star.png',
        }),
        // Pinned = wyłącznie przypięte (podzbiór Focused). Count z PinStore (cache).
        SidebarItem.forPerspective('attention-pinned', MailboxPerspective.forPinned(accountIds), {
          name: 'Pinned',
          iconName: 'star.png',
          count: pinnedCount,
        }),
        SidebarItem.forPerspective(
          'attention-snoozed',
          MailboxPerspective.forThreadIds(snoozedIds, accountIds, 'Snoozed'),
          { name: 'Snoozed', iconName: 'clock.png', count: snoozedIds.length }
        ),
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
    // Punkt 3: każda pozycja = klikalny filtr regułowy. Placeholder perspektywa
    // (forThreadIds([])) daje podświetlenie `selected`; onSelect liczy snapshot
    // dopasowanych wątków regułami na klik (wzorzec jak Tagi/Snoozed).
    const accountIds = AccountStore.accountIds();
    return {
      title: 'Smart Folders',
      collapsed: isSectionCollapsed('Smart Folders'),
      onCollapseToggled: toggleSectionCollapsed,
      items: folders.map((f) => {
        const placeholder = MailboxPerspective.forThreadIds([], accountIds, f.name);
        (placeholder as any)._smartFolderId = f.id;
        return SidebarItem.forPerspective(`smart-folder-${f.id}`, placeholder, {
          name: f.name,
          iconName: 'tag.png',
          onSelect: () => this._focusSmartFolder(f),
        });
      }),
    };
  }

  /**
   * Punkt 3: na klik Smart Foldera wczytaj okno najnowszych wątków, zmapuj na
   * ThreadMeta, przefiltruj regułami (SmartFolderStore.match) i pokaż wynik jako
   * ThreadIdListPerspective. Snapshot — odświeża się przy ponownym kliku oraz po
   * CRUD reguł (listen → _updateSections). Live-update na nową pocztę odłożony
   * (zbyt kosztowny przy pełnym oknie wątków — patrz nota w planie).
   */
  _focusSmartFolder = (folder: { id: string; name: string }) => {
    try {
      const mod = require('../../smart-folder/lib/smart-folder-store');
      const Store = mod.SmartFolderStore;
      if (!Store || typeof Store.match !== 'function') {
        return;
      }
      const accountIds = AccountStore.accountIds();
      DatabaseStore.findAll(Thread)
        .limit(SMART_FOLDER_WINDOW)
        .then((threads: any[]) => {
          const metas = (threads || []).map((t) => this._threadToSmartFolderMeta(t));
          const ids = Store.match(folder.id, metas).map((m: any) => m.id);
          const perspective = MailboxPerspective.forThreadIds(ids, accountIds, folder.name);
          (perspective as any)._smartFolderId = folder.id;
          Actions.focusMailboxPerspective(perspective);
        });
    } catch (e) {
      /* smart-folder not active */
    }
  };

  /** Mapuje model Thread na ThreadMeta akceptowane przez rule-engine (#99). */
  _threadToSmartFolderMeta = (t: any) => {
    const emails = (t.participants || []).map((p: any) => (p && p.email) || '').filter(Boolean);
    const cats = (t.categories || t.folders || t.labels || [])
      .map((c: any) => (c && (c.displayName || c.name)) || '')
      .filter(Boolean);
    const ts = t.lastMessageReceivedTimestamp || t.firstMessageTimestamp;
    return {
      id: t.id,
      from: emails.join(' '),
      to: emails,
      subject: t.subject || '',
      tags: Array.isArray(t.tags) ? t.tags : Object.keys(t.customKeywords || {}),
      hasAttachment: (t.attachmentCount || 0) > 0,
      attachmentCount: t.attachmentCount || 0,
      date: ts instanceof Date ? ts.getTime() : typeof ts === 'number' ? ts : 0,
      read: t.unread === undefined ? undefined : !t.unread,
      folder: cats.join(' '),
      account: t.accountId,
      starred: t.starred,
      pinned: t.pinned,
    };
  };

  _registerListeners() {
    this.listenTo(Actions.setCollapsedSidebarItem, this._onSetCollapsedByName);
    this.listenTo(SidebarActions.setKeyCollapsed, this._onSetCollapsedByKey);
    this.listenTo(AccountStore, this._onAccountsChanged);
    this.listenTo(FocusedPerspectiveStore, this._onFocusedPerspectiveChanged);
    this.listenTo(WorkspaceStore, this._updateSections);
    this.listenTo(OutboxStore, this._updateSections);
    this.listenTo(ThreadCountsStore, this._updateSections);
    this.listenTo(CategoryStore, this._updateSections);

    // Bilet #119: CRUD/przypisania tagów odświeżają sekcję + liczniki;
    // aktywna perspektywa tagu dostaje świeżą listę id (staleness).
    try {
      const tagMod = require('../../tag-system/lib/tag-store');
      if (tagMod.TagStore && typeof tagMod.TagStore.listen === 'function') {
        tagMod.TagStore.listen(() => {
          this._updateSections();
          this._refocusTagPerspectiveIfStale();
        });
      }
    } catch (e) {
      /* tag-system not active */
    }

    // Punkt 3: CRUD Smart Folderów (create/update/delete) odświeża sekcję.
    try {
      const sfMod = require('../../smart-folder/lib/smart-folder-store');
      if (sfMod.SmartFolderStore && typeof sfMod.SmartFolderStore.listen === 'function') {
        sfMod.SmartFolderStore.listen(() => {
          this._updateSections();
        });
      }
    } catch (e) {
      /* smart-folder not active */
    }

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
