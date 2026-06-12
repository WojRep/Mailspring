/* eslint global-require: 0 */
/* eslint no-use-before-define: 0 */
import _ from 'underscore';

import { localized } from './intl';
import * as Utils from './flux/models/utils';
import { TaskFactory } from './flux/tasks/task-factory';
import { AccountStore } from './flux/stores/account-store';
import CategoryStore from './flux/stores/category-store';
import DatabaseStore from './flux/stores/database-store';
import OutboxStore from './flux/stores/outbox-store';
import ThreadCountsStore from './flux/stores/thread-counts-store';
import FolderSyncProgressStore from './flux/stores/folder-sync-progress-store';
import { MutableQuerySubscription } from './flux/models/mutable-query-subscription';
import { Matcher } from './flux/attributes';
import UnreadQuerySubscription from './flux/models/unread-query-subscription';
import { Thread } from './flux/models/thread';
import { Category } from './flux/models/category';
import { Label } from './flux/models/label';
import { Folder } from './flux/models/folder';
import { Task } from './flux/tasks/task';
import * as Actions from './flux/actions';
import { QuerySubscription } from 'actunamail-exports';

let WorkspaceStore = null;
let ChangeStarredTask = null;
let ChangePinnedTask = null;
let ChangeLabelsTask = null;
let ChangeFolderTask = null;
let ChangeUnreadTask = null;
let FocusedPerspectiveStore = null;

// This is a class cluster. Subclasses are not for external use!
// https://developer.apple.com/library/ios/documentation/General/Conceptual/CocoaEncyclopedia/ClassClusters/ClassClusters.html

export class MailboxPerspective {
  // Factory Methods
  static forNothing() {
    return new EmptyMailboxPerspective();
  }

  static forDrafts(accountsOrIds: string[]) {
    return new DraftsMailboxPerspective(accountsOrIds);
  }

  static forCategory(category: Category) {
    return category ? new CategoryMailboxPerspective([category]) : this.forNothing();
  }

  static forCategories(categories: Category[]) {
    const valid = categories.filter(Boolean);
    return valid.length > 0 ? new CategoryMailboxPerspective(valid) : this.forNothing();
  }

  static forStandardCategories(accountsOrIds: string[], ...names: string[]) {
    const categories = CategoryStore.getCategoriesWithRoles(accountsOrIds, ...names);
    return this.forCategories(categories);
  }

  static forStarred(accountsOrIds: string[]) {
    return new StarredMailboxPerspective(accountsOrIds);
  }

  // Pin cross-device (decyzja plan_to_version_1.0/46): virtual folder of threads
  // carrying the synced `Thread.pinned` flag (IMAP keyword `$Pinned`). Queries the
  // attribute directly, so it reflects pins made on any device.
  static forPinned(accountsOrIds: string[]) {
    return new PinnedMailboxPerspective(accountsOrIds);
  }

  // Focused = automatycznie wykryte ważne wątki (decyzja 46 + user 2026-05-31):
  // przypięte ∪ oznaczone gwiazdką (ważne) ∪ reguły biznesowe/AI (FocusedStore).
  // Pinned jest podzbiorem Focused.
  static forFocused(accountsOrIds: string[]) {
    return new FocusedMailboxPerspective(accountsOrIds);
  }

  // Virtual folder of an explicit, caller-supplied set of threads — used
  // by the Actuna AI assistant to surface AI-selected results in the main
  // thread list. Non-mutating: a pure view.
  static forThreadIds(threadIds: string[], accountIds: string[], name?: string) {
    return new ThreadIdListPerspective(threadIds, accountIds, name);
  }

  static forUnread(categories: Category[]) {
    return categories.length > 0 ? new UnreadMailboxPerspective(categories) : this.forNothing();
  }

  static forInbox(accountsOrIds: string[]) {
    return this.forStandardCategories(accountsOrIds, 'inbox');
  }

  static fromJSON(json: { type: string; serializedCategories?: string; accountIds: string[] }) {
    try {
      if (json.type === CategoryMailboxPerspective.name) {
        const categories = JSON.parse(json.serializedCategories).map(Utils.convertToModel);
        return this.forCategories(categories);
      }
      if (json.type === UnreadMailboxPerspective.name) {
        const categories = JSON.parse(json.serializedCategories).map(Utils.convertToModel);
        return this.forUnread(categories);
      }
      if (json.type === StarredMailboxPerspective.name) {
        return this.forStarred(json.accountIds);
      }
      if (json.type === DraftsMailboxPerspective.name) {
        return this.forDrafts(json.accountIds);
      }
      if (json.type === ThreadIdListPerspective.name) {
        const j = json as typeof json & { threadIds?: string[]; name?: string };
        return this.forThreadIds(j.threadIds || [], j.accountIds, j.name);
      }
      return this.forInbox(json.accountIds);
    } catch (error) {
      AppEnv.reportError(new Error(`Could not restore mailbox perspective: ${error}`));
      return null;
    }
  }

  // Instance Methods

  accountIds: string[];
  name: string;
  iconName: string;
  _categoriesSharedRole?: string;

  constructor(accountIds: string[]) {
    this.accountIds = accountIds;
    if (
      !(accountIds instanceof Array) ||
      !accountIds.every((aid) => typeof aid === 'string' || typeof aid === 'number')
    ) {
      throw new Error(`${this.constructor.name}: You must provide an array of string "accountIds"`);
    }
  }

  toJSON() {
    return { accountIds: this.accountIds, type: this.constructor.name };
  }

  isEqual(other: MailboxPerspective) {
    if (!other || this.constructor !== other.constructor) {
      return false;
    }
    if (other.name !== this.name) {
      return false;
    }
    if (!_.isEqual(this.accountIds, other.accountIds)) {
      return false;
    }
    return true;
  }

  isInbox() {
    return this.categoriesSharedRole() === 'inbox';
  }

  isSent() {
    return this.categoriesSharedRole() === 'sent';
  }

  isTrash() {
    return this.categoriesSharedRole() === 'trash';
  }

  isArchive() {
    return false;
  }

  emptyMessage() {
    return localized('No Messages');
  }

  categories() {
    return [];
  }

  sheet() {
    if (!WorkspaceStore || !WorkspaceStore.Sheet) {
      WorkspaceStore = require('./flux/stores/workspace-store').default;
    }
    return WorkspaceStore.Sheet && WorkspaceStore.Sheet.Threads;
  }

  // overwritten in CategoryMailboxPerspective
  hasSyncingCategories(): boolean {
    return false;
  }

  categoriesSharedRole(): string {
    this._categoriesSharedRole =
      this._categoriesSharedRole || Category.categoriesSharedRole(this.categories());
    return this._categoriesSharedRole;
  }

  category(): Category | null {
    return this.categories().length === 1 ? this.categories()[0] : null;
  }

  threads(): QuerySubscription<Thread> {
    throw new Error('threads: Not implemented in base class.');
  }

  unreadCount(): number {
    return 0;
  }

  // Public:
  // - accountIds {Array} Array of unique account ids associated with the threads
  // that want to be included in this perspective
  //
  // Returns true if the accountIds are part of the current ids, or false
  // otherwise. This means that it checks if I am attempting to move threads
  // between the same set of accounts:
  //
  // E.g.:
  // perpective = Starred for accountIds: a1, a2
  // thread1 has accountId a3
  // thread2 has accountId a2
  //
  // perspective.canReceiveThreadsFromAccountIds([a2, a3]) -> false -> I cant move those threads to Starred
  // perspective.canReceiveThreadsFromAccountIds([a2]) -> true -> I can move that thread to Starred
  canReceiveThreadsFromAccountIds(accountIds): boolean {
    if (!accountIds || accountIds.length === 0) {
      return false;
    }
    const areIncomingIdsInCurrent = _.difference(accountIds, this.accountIds).length === 0;
    return areIncomingIdsInCurrent;
  }

  receiveThreadIds(threadIds: Array<Thread | string>) {
    DatabaseStore.modelify<Thread>(Thread, threadIds).then((threads) => {
      const tasks = TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
        return this.actionsForReceivingThreads(accountThreads, accountId);
      });
      if (tasks.length > 0) {
        Actions.queueTasks(tasks);
      }
    });
  }

  actionsForReceivingThreads(threads: Thread[], accountId: string): Task | Task[] {
    // eslint-disable-line
    throw new Error('actionsForReceivingThreads: Not implemented in base class.');
  }

  canArchiveThreads(threads: Thread[]) {
    if (this.isArchive()) {
      return false;
    }
    const accounts = AccountStore.accountsForItems(threads);
    return accounts.every((acc) => acc.canArchiveThreads());
  }

  canTrashThreads(threads: Thread[]) {
    return this.canMoveThreadsTo(threads, 'trash');
  }

  canMoveThreadsTo(threads: Thread[], standardCategoryName: string) {
    if (this.categoriesSharedRole() === standardCategoryName) {
      return false;
    }
    return AccountStore.accountsForItems(threads).every(
      (acc) => CategoryStore.getCategoryByRole(acc, standardCategoryName) !== null
    );
  }

  tasksForRemovingItems(threads: Thread[], source?: string) {
    if (!(threads instanceof Array)) {
      throw new Error('tasksForRemovingItems: you must pass an array of threads or thread ids');
    }
    return [];
  }
}

class DraftsMailboxPerspective extends MailboxPerspective {
  name = localized('Drafts');
  iconName = 'drafts.png';
  drafts = true; // The DraftListStore looks for this

  threads() {
    return null;
  }

  unreadCount() {
    let count = 0;
    for (const aid of this.accountIds) {
      count += OutboxStore.itemsForAccount(aid).length;
    }
    return count;
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  sheet() {
    if (!WorkspaceStore || !WorkspaceStore.Sheet) {
      WorkspaceStore = require('./flux/stores/workspace-store').default;
    }
    return WorkspaceStore.Sheet && WorkspaceStore.Sheet.Drafts;
  }
}

class StarredMailboxPerspective extends MailboxPerspective {
  starred = true;
  name = localized('Starred');
  iconName = 'starred.png';

  threads() {
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where([Thread.attributes.starred.equal(true), Thread.attributes.inAllMail.equal(true)])
      .limit(0);

    // Adding a "account_id IN (a,b,c)" clause to our query can result in a full
    // table scan. Don't add the where clause if we know we want results from all.
    if (this.accountIds.length < AccountStore.accounts().length) {
      query.where(Thread.attributes.accountId.in(this.accountIds));
    }

    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  canReceiveThreadsFromAccountIds(threads: string[]) {
    return super.canReceiveThreadsFromAccountIds(threads);
  }

  actionsForReceivingThreads(threads: Thread[], accountId: string) {
    ChangeStarredTask =
      ChangeStarredTask || require('./flux/tasks/change-starred-task').ChangeStarredTask;
    return new ChangeStarredTask({
      accountId,
      threads,
      starred: true,
      source: 'Dragged Into List',
    });
  }

  tasksForRemovingItems(threads: Thread[], source?: string) {
    const task = TaskFactory.taskForInvertingStarred({
      threads: threads,
      source: 'Removed From List',
    });
    return [task];
  }
}

/*
 * Pin cross-device (decyzja plan_to_version_1.0/46). Mirrors StarredMailboxPerspective
 * but on the synced `Thread.pinned` attribute (IMAP keyword `$Pinned`). Drag-in pins,
 * remove-from-list unpins — both via ChangePinnedTask, so they sync across devices.
 */
class PinnedMailboxPerspective extends MailboxPerspective {
  pinned = true;
  name = localized('Pinned');
  iconName = 'star.png';

  threads() {
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where([Thread.attributes.pinned.equal(true), Thread.attributes.inAllMail.equal(true)])
      .limit(0);

    if (this.accountIds.length < AccountStore.accounts().length) {
      query.where(Thread.attributes.accountId.in(this.accountIds));
    }

    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  canReceiveThreadsFromAccountIds(threads: string[]) {
    return super.canReceiveThreadsFromAccountIds(threads);
  }

  actionsForReceivingThreads(threads: Thread[], accountId: string) {
    ChangePinnedTask =
      ChangePinnedTask || require('./flux/tasks/change-pinned-task').ChangePinnedTask;
    return new ChangePinnedTask({
      accountId,
      threads,
      pinned: true,
      source: 'Dragged Into List',
    });
  }

  tasksForRemovingItems(threads: Thread[]) {
    ChangePinnedTask =
      ChangePinnedTask || require('./flux/tasks/change-pinned-task').ChangePinnedTask;
    return [
      new ChangePinnedTask({
        threads,
        pinned: false,
        source: 'Removed From List',
      }),
    ];
  }
}

/*
 * Focused (decyzja plan_to_version_1.0/46 + user 2026-05-31): automatyczne
 * wykrywanie ważnych maili w INBOX. Query: `pinned = true OR starred = true OR
 * id IN extraIds`, gdzie extraIds = reguły biznesowe (klasyfikator) ∪ AI
 * (opt-in plugin), dostarczane przez FocusedStore. Pinned ⊆ Focused. Pure view.
 */
class FocusedMailboxPerspective extends MailboxPerspective {
  pinned = false;
  name = localized('Focused');
  iconName = 'star.png';

  // Lazy + decoupled: FocusedStore żyje w pluginie priority-inbox-pin. Brak
  // pluginu / AI → extraIds = [] (Focused = pinned ∪ starred).
  private _extraIds(): string[] {
    try {
      const mod = require('../internal_packages/priority-inbox-pin/lib/focused-store');
      const FocusedStore = mod && (mod.FocusedStore || mod.default);
      return FocusedStore && typeof FocusedStore.extraIds === 'function'
        ? FocusedStore.extraIds()
        : [];
    } catch (e) {
      return [];
    }
  }

  threads() {
    const orMatchers: Matcher[] = [
      Thread.attributes.pinned.equal(true),
      Thread.attributes.starred.equal(true),
    ];
    const extra = this._extraIds();
    if (extra.length > 0) {
      orMatchers.push(Thread.attributes.id.in(extra));
    }
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where([new Matcher.Or(orMatchers), Thread.attributes.inAllMail.equal(true)])
      .limit(0);

    if (this.accountIds.length < AccountStore.accounts().length) {
      query.where(Thread.attributes.accountId.in(this.accountIds));
    }

    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  // Pure view — Focused jest wyliczany, nie przyjmuje drag-in ani usuwania.
  canReceiveThreadsFromAccountIds() {
    return false;
  }

  tasksForRemovingItems() {
    return [];
  }
}

/*
 * A perspective that shows an explicit, caller-supplied list of threads —
 * a "virtual folder" of threads selected by a feature (e.g. the Actuna AI
 * assistant). Non-mutating: it applies no labels, folders or flags; it is
 * purely a view. Threads are ordered by date (most recent first).
 */
class ThreadIdListPerspective extends MailboxPerspective {
  _threadIds: string[];
  name: string;
  iconName = 'search.png';

  constructor(threadIds: string[], accountIds: string[], name?: string) {
    super(accountIds);
    if (!Array.isArray(threadIds)) {
      throw new Error('ThreadIdListPerspective: threadIds must be an array');
    }
    this._threadIds = threadIds;
    this.name = name || localized('AI Assistant');
  }

  toJSON() {
    const json = super.toJSON() as ReturnType<MailboxPerspective['toJSON']> & {
      threadIds: string[];
      name: string;
    };
    json.threadIds = this._threadIds;
    json.name = this.name;
    return json;
  }

  isEqual(other: MailboxPerspective) {
    return (
      super.isEqual(other) &&
      other instanceof ThreadIdListPerspective &&
      _.isEqual(this._threadIds, other._threadIds)
    );
  }

  threads() {
    const query = DatabaseStore.findAll<Thread>(Thread).limit(0);
    if (this._threadIds.length > 0) {
      // #124 (decyzja usera): widok pokazuje WSZYSTKIE wątki z listy — także
      // przeniesione do Kosza/Spamu; przynależność do folderu komunikuje chip
      // folderu przy wierszu (MailLabelSet, widoki wirtualne). Licznik widoku
      // zgadza się wtedy z długością listy.
      query.where(Thread.attributes.id.in(this._threadIds));
    } else {
      // Never-matching condition — an empty virtual folder, no crash.
      query.where(Thread.attributes.id.equal('__actuna_none__'));
    }
    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  // A view only — no drag-drop in, no special removal behaviour.
  canReceiveThreadsFromAccountIds() {
    return false;
  }

  tasksForRemovingItems() {
    return [];
  }
}

class EmptyMailboxPerspective extends MailboxPerspective {
  constructor() {
    super([]);
  }

  threads() {
    // We need a Thread query that will not return any results and take no time.
    // We use lastMessageReceivedTimestamp because it is the first column on an
    // index so this returns zero items nearly instantly. In the future, we might
    // want to make a Query.forNothing() to go along with MailboxPerspective.forNothing()
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where({ lastMessageReceivedTimestamp: -1 })
      .limit(0);
    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }
}

class CategoryMailboxPerspective extends MailboxPerspective {
  _categories: Category[];

  constructor(_categories: Category[]) {
    super([...new Set(_categories.map((c) => c.accountId))]);
    this._categories = _categories;

    if (this._categories.length === 0) {
      throw new Error('CategoryMailboxPerspective: You must provide at least one category.');
    }

    // Note: We pick the display name and icon assuming that you won't create a
    // perspective with Inbox and Sent or anything crazy like that... todo?
    this.name = this._categories[0].displayName;
    if (this._categories[0].role) {
      this.iconName = `${this._categories[0].role}.png`;
    } else {
      this.iconName = this._categories[0] instanceof Label ? 'label.png' : 'folder.png';
    }
  }

  toJSON() {
    const json: any = super.toJSON();
    json.serializedCategories = JSON.stringify(this._categories);
    return json;
  }

  isEqual(other: MailboxPerspective) {
    return (
      super.isEqual(other) &&
      _.isEqual(
        this.categories().map((c) => c.id),
        other.categories().map((c) => c.id)
      )
    );
  }

  threads(): QuerySubscription<Thread> {
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where([Thread.attributes.categories.containsAny(this.categories().map((c) => c.id))])
      .limit(0);

    if (this.isSent()) {
      query.order(Thread.attributes.lastMessageSentTimestamp.descending());
    }

    if (this.isInbox()) {
      // Pin cross-device (decyzja plan_to_version_1.0/46): przypięte wątki na
      // górze skrzynki. Sort na poziomie zapytania po kolumnie `pinned` —
      // bezpieczny dla wirtualizacji (w przeciwieństwie do reorderu po stronie
      // klienta). Wtórnie sortujemy po dacie otrzymania (jak dotychczas).
      query.order([
        Thread.attributes.pinned.descending(),
        Thread.attributes.lastMessageReceivedTimestamp.descending(),
      ]);
    }

    if (!['spam', 'trash'].includes(this.categoriesSharedRole())) {
      query.where({ inAllMail: true });
    }

    if (this._categories.length > 1 && this.accountIds.length < this._categories.length) {
      // The user has multiple categories in the same account selected, which
      // means our result set could contain multiple copies of the same threads
      // (since we do an inner join) and we need SELECT DISTINCT. Note that this
      // can be /much/ slower and we shouldn't do it if we know we don't need it.
      query.distinct();
    }

    return new MutableQuerySubscription<Thread>(query, {
      emitResultSet: true,
      updateOnSeparateThread: true,
    });
  }

  unreadCount() {
    let sum = 0;
    for (const cat of this._categories) {
      sum += ThreadCountsStore.unreadCountForCategoryId(cat.id);
    }
    return sum;
  }

  categories() {
    return this._categories;
  }

  hasSyncingCategories() {
    return this._categories.some((cat) => {
      const representedFolder =
        cat instanceof Folder ? cat : CategoryStore.getAllMailCategory(cat.accountId);
      return (
        representedFolder &&
        FolderSyncProgressStore.isSyncingAccount(cat.accountId, representedFolder.path)
      );
    });
  }

  isArchive() {
    return this._categories.every((cat) => cat.isArchive());
  }

  canReceiveThreadsFromAccountIds(threads: string[]) {
    return (
      super.canReceiveThreadsFromAccountIds(threads) &&
      !this._categories.some((c) => c.isLockedCategory())
    );
  }

  actionsForReceivingThreads(threads: Thread[], accountId: string) {
    FocusedPerspectiveStore =
      FocusedPerspectiveStore || require('./flux/stores/focused-perspective-store').default;
    ChangeLabelsTask =
      ChangeLabelsTask || require('./flux/tasks/change-labels-task').ChangeLabelsTask;
    ChangeFolderTask =
      ChangeFolderTask || require('./flux/tasks/change-folder-task').ChangeFolderTask;

    const current = FocusedPerspectiveStore.current();

    // This assumes that the we don't have more than one category per
    // accountId attached to this perspective
    if (Category.LockedRoles.includes(current.categoriesSharedRole())) {
      return [];
    }

    const myCat = this.categories().find((c) => c.accountId === accountId);
    const currentCat = current.categories().find((c) => c.accountId === accountId);

    // Don't drag and drop on ourselves
    // NOTE: currentCat can be nil in case of SearchPerspective
    if (currentCat && myCat.id === currentCat.id) {
      return [];
    }

    if (myCat.role === 'all' && currentCat && currentCat instanceof Label) {
      // dragging from a label into All Mail? Make this an "archive" by removing the
      // label. Otherwise (Since labels are subsets of All Mail) it'd have no effect.
      return [
        new ChangeLabelsTask({
          threads,
          source: 'Dragged into list',
          labelsToAdd: [],
          labelsToRemove: [currentCat],
        }),
      ];
    }
    if (myCat instanceof Folder) {
      // dragging to a folder like spam, trash or any IMAP folder? Just change the folder.
      return [
        new ChangeFolderTask({
          threads,
          source: 'Dragged into list',
          folder: myCat,
        }),
      ];
    }

    if (myCat instanceof Label && currentCat && currentCat instanceof Folder) {
      // dragging from trash or spam into a label? We need to both apply the label and
      // move to the "All Mail" folder.
      return [
        new ChangeFolderTask({
          threads,
          source: 'Dragged into list',
          folder: CategoryStore.getCategoryByRole(accountId, 'all'),
        }),
        new ChangeLabelsTask({
          threads,
          source: 'Dragged into list',
          labelsToAdd: [myCat],
          labelsToRemove: [],
        }),
      ];
    }
    // label to label
    return [
      new ChangeLabelsTask({
        threads,
        source: 'Dragged into list',
        labelsToAdd: [myCat],
        labelsToRemove: currentCat ? [currentCat] : [],
      }),
    ];
  }

  // Public:
  // Returns the tasks for removing threads from this perspective and moving them
  // to the default destination based on the current view:
  //
  // if you're looking at a folder:
  // - spam: null
  // - trash: null
  // - archive: trash
  // - all others: "finished category (archive or trash)"

  // if you're looking at a label
  // - if finished category === "archive" remove the label
  // - if finished category === "trash" move to trash folder, keep labels intact
  //
  tasksForRemovingItems(threads: Thread[], source = 'Removed from list') {
    ChangeLabelsTask =
      ChangeLabelsTask || require('./flux/tasks/change-labels-task').ChangeLabelsTask;
    ChangeFolderTask =
      ChangeFolderTask || require('./flux/tasks/change-folder-task').ChangeFolderTask;

    // If you are viewing the archive, "remove" goes to the trash, since obeying
    // your rpreference would mean possibly doing nothing (if you default to archive.)
    if (this.isArchive()) {
      return TaskFactory.tasksForMovingToTrash({ threads, source });
    }

    // If you are viewing spam or trash, "remove" does nothing
    if (['spam', 'trash'].includes(this.categoriesSharedRole())) {
      return [];
    }

    return TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const acct = AccountStore.accountForId(accountId);
      const preferred = acct.preferredRemovalDestination();
      const cat = this.categories().find((c) => c.accountId === accountId);
      if (cat instanceof Label && preferred.role !== 'trash') {
        const inboxCat = CategoryStore.getInboxCategory(accountId);
        return new ChangeLabelsTask({
          threads: accountThreads,
          labelsToAdd: [],
          labelsToRemove: [cat, inboxCat],
          source: source,
        });
      }
      return new ChangeFolderTask({
        threads: accountThreads,
        folder: preferred,
        source: source,
      });
    });
  }
}

class UnreadMailboxPerspective extends CategoryMailboxPerspective {
  unread = true;
  name = localized('Unread');
  iconName = 'unread.png';

  threads(): QuerySubscription<Thread> {
    return new UnreadQuerySubscription(this.categories().map((c) => c.id));
  }

  unreadCount() {
    return 0;
  }

  actionsForReceivingThreads(threads: Thread[], accountId: string) {
    ChangeUnreadTask =
      ChangeUnreadTask || require('./flux/tasks/change-unread-task').ChangeUnreadTask;
    const tasks = super.actionsForReceivingThreads(threads, accountId);
    tasks.push(
      new ChangeUnreadTask({
        threads: threads,
        unread: true,
        source: 'Dragged Into List',
      })
    );
    return tasks;
  }

  tasksForRemovingItems(threads: Thread[], source?: string) {
    ChangeUnreadTask =
      ChangeUnreadTask || require('./flux/tasks/change-unread-task').ChangeUnreadTask;

    const tasks = super.tasksForRemovingItems(threads, source);
    tasks.push(
      new ChangeUnreadTask({ threads, unread: false, source: source || 'Removed From List' })
    );
    return tasks;
  }
}
