/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';
import {
  Account,
  CategoryStore,
  Label,
  ExtensionRegistry,
  RegExpUtils,
  localized,
} from 'actunamail-exports';

import SidebarItem, { createCategory } from './sidebar-item';
import * as SidebarActions from './sidebar-actions';
import { ISidebarSection, ISidebarItem } from './types';

function isSectionCollapsed(title) {
  if (AppEnv.savedState.sidebarKeysCollapsed[title] !== undefined) {
    return AppEnv.savedState.sidebarKeysCollapsed[title];
  } else {
    return false;
  }
}

function toggleSectionCollapsed(section) {
  if (!section) {
    return;
  }
  SidebarActions.setKeyCollapsed(section.title, !isSectionCollapsed(section.title));
}

// Normalized "/"-joined hierarchy key for a category, so folders nested with
// different IMAP delimiters (. / \) compare consistently.
function categoryHierarchyKey(category): string {
  return category.displayName.replace(RegExpUtils.subcategorySplitRegex(), '/');
}

// Ticket #48 moves a deleted folder into Trash via IMAP RENAME, so it becomes a
// user category whose path lives under the Trash folder. Ticket #54: such folders
// must appear nested inside Trash, not as flat top-level entries in the folder list.
function trashHierarchyKey(account): string | null {
  const trash = CategoryStore.getTrashCategory(account);
  return trash ? categoryHierarchyKey(trash) : null;
}

function isInsideTrash(category, trashKey: string | null): boolean {
  if (!trashKey) {
    return false;
  }
  const key = categoryHierarchyKey(category);
  return key !== trashKey && key.startsWith(`${trashKey}/`);
}

// Builds the nested sidebar items for user folders that were moved into Trash, so
// they render as children of the Trash item rather than flat top-level entries.
function userCategoryItemsInTrash(account): ISidebarItem[] {
  const trashKey = trashHierarchyKey(account);
  if (!trashKey) {
    return [];
  }
  const items: ISidebarItem[] = [];
  const seenItems: { [key: string]: ISidebarItem } = {};
  for (const category of CategoryStore.userCategories(account)) {
    if (!isInsideTrash(category, trashKey)) {
      continue;
    }
    const itemKey = categoryHierarchyKey(category);

    let parent: ISidebarItem = null;
    let parentKey: string = null;
    const parentComponents = itemKey.split('/');
    for (let i = parentComponents.length - 1; i >= 1; i--) {
      parentKey = parentComponents.slice(0, i).join('/');
      parent = seenItems[parentKey];
      if (parent) {
        break;
      }
    }

    let item: ISidebarItem;
    if (parent) {
      const itemDisplayName = category.displayName.substr(parentKey.length + 1);
      item = SidebarItem.forCategories([category], {
        name: itemDisplayName,
        deletePermanently: true,
      });
      parent.children.push(item);
    } else {
      // Direct child of Trash — drop the "Trash/" prefix from the displayed name.
      const itemDisplayName = category.displayName.substr(trashKey.length + 1);
      item = SidebarItem.forCategories([category], {
        name: itemDisplayName,
        deletePermanently: true,
      });
      items.push(item);
    }
    seenItems[itemKey] = item;
  }
  return items;
}

class SidebarSection {
  static empty(title): ISidebarSection {
    return {
      title,
      items: [],
    };
  }

  static standardSectionForAccount(account): ISidebarSection {
    if (!account) {
      throw new Error('standardSectionForAccount: You must pass an account.');
    }

    const cats = CategoryStore.standardCategories(account);
    if (cats.length === 0) {
      return this.empty(account.label);
    }

    const items = _.reject(cats, (cat) => ['drafts'].includes(cat.role)).map((cat) => {
      const opts: Partial<ISidebarItem> = { editable: false, deletable: false };
      // Nest folders that were deleted into Trash (ticket #54) under the Trash item.
      if (cat.role === 'trash') {
        opts.children = userCategoryItemsInTrash(account);
      }
      return SidebarItem.forCategories([cat], opts);
    });

    const unreadItem = SidebarItem.forUnread([account.id]);
    const starredItem = SidebarItem.forStarred([account.id]);
    const draftsItem = SidebarItem.forDrafts([account.id]);

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.splice(1, 0, unreadItem, starredItem);
    items.push(draftsItem);

    ExtensionRegistry.AccountSidebar.extensions()
      .filter((ext) => ext.sidebarItem != null)
      .forEach((ext) => {
        const { id, name, iconName, perspective, insertAtTop } = ext.sidebarItem([account.id]);
        const item = SidebarItem.forPerspective(id, perspective, { name, iconName });
        if (insertAtTop) {
          return items.splice(3, 0, item);
        } else {
          return items.push(item);
        }
      });

    return {
      title: account.label,
      items,
    };
  }

  static standardSectionForAccounts(accounts?: Account[]): ISidebarSection {
    let children;
    if (!accounts || accounts.length === 0) {
      return this.empty(localized('All Accounts'));
    }
    if (CategoryStore.categories().length === 0) {
      return this.empty(localized('All Accounts'));
    }
    if (accounts.length === 1) {
      return this.standardSectionForAccount(accounts[0]);
    }

    const standardNames = ['inbox', 'important', 'sent', ['archive', 'all'], 'spam', 'trash'];
    const items = [];

    for (const nameOrNames of standardNames) {
      const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
      const categories = CategoryStore.getCategoriesWithRoles(accounts, ...names);
      if (categories.length === 0) {
        continue;
      }

      children = [];
      // eslint-disable-next-line
      accounts.forEach((acc) => {
        const cat = _.first(
          (names as string[])
            .map((name) => CategoryStore.getCategoryByRole(acc, name))
            .filter(Boolean)
        );
        if (!cat) {
          return;
        }
        children.push(
          SidebarItem.forCategories([cat], { name: acc.label, editable: false, deletable: false })
        );
      });

      items.push(
        SidebarItem.forCategories(categories, { children, editable: false, deletable: false })
      );
    }

    const accountIds = accounts.map((a) => a.id);

    const starredItem = SidebarItem.forStarred(accountIds, {
      children: accounts.map((acc) => SidebarItem.forStarred([acc.id], { name: acc.label })),
    });
    const unreadItem = SidebarItem.forUnread(accountIds, {
      children: accounts.map((acc) => SidebarItem.forUnread([acc.id], { name: acc.label })),
    });
    const draftsItem = SidebarItem.forDrafts(accountIds, {
      children: accounts.map((acc) => SidebarItem.forDrafts([acc.id], { name: acc.label })),
    });

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.splice(1, 0, unreadItem, starredItem);
    items.push(draftsItem);

    ExtensionRegistry.AccountSidebar.extensions()
      .filter((ext) => ext.sidebarItem != null)
      .forEach((ext) => {
        const { id, name, iconName, perspective, insertAtTop } = ext.sidebarItem(accountIds);
        const item = SidebarItem.forPerspective(id, perspective, {
          name,
          iconName,
          children: accounts.map((acc) => {
            const subItem = ext.sidebarItem([acc.id]);
            return SidebarItem.forPerspective(subItem.id + `-${acc.id}`, subItem.perspective, {
              name: acc.label,
              iconName: subItem.iconName,
            });
          }),
        });
        if (insertAtTop) {
          items.splice(3, 0, item);
        } else {
          items.push(item);
        }
      });

    return {
      title: localized('All Accounts'),
      items,
    };
  }

  static forUserCategories(
    account: Account,
    { title, collapsible }: { title?: string; collapsible?: boolean } = {}
  ): ISidebarSection {
    let onCollapseToggled;
    if (!account) {
      return;
    }
    // Compute hierarchy for user categories using known "path" separators
    // NOTE: This code uses the fact that userCategoryItems is a sorted set, eg:
    //
    // Inbox
    // Inbox.FolderA
    // Inbox.FolderA.FolderB
    // Inbox.FolderB
    //
    const items: ISidebarItem[] = [];
    const seenItems: { [key: string]: ISidebarItem } = {};
    // Single-account view nests deleted folders under Trash (see
    // standardSectionForAccount); keep them out of the flat folder list here.
    // Multi-account view (`collapsible`) keeps the previous flat behavior.
    const trashKey = collapsible ? null : trashHierarchyKey(account);
    for (const category of CategoryStore.userCategories(account)) {
      if (isInsideTrash(category, trashKey)) {
        continue;
      }
      // https://regex101.com/r/jK8cC2/1
      let item: ISidebarItem = null;
      const re = RegExpUtils.subcategorySplitRegex();
      const itemKey = category.displayName.replace(re, '/');

      let parent = null;
      let parentKey: string = null;
      const parentComponents = itemKey.split('/');
      for (let i = parentComponents.length; i >= 1; i--) {
        parentKey = parentComponents.slice(0, i).join('/');
        parent = seenItems[parentKey];
        if (parent) {
          break;
        }
      }

      if (parent) {
        const itemDisplayName = category.displayName.substr(parentKey.length + 1);
        item = SidebarItem.forCategories([category], { name: itemDisplayName });
        parent.children.push(item);
      } else {
        item = SidebarItem.forCategories([category]);
        items.push(item);
      }
      seenItems[itemKey] = item;
    }

    const inbox = CategoryStore.getInboxCategory(account);
    let iconName = null;

    if (inbox && inbox.constructor === Label) {
      if (title == null) {
        title = localized('Labels');
      }
      iconName = 'tag.png';
    } else {
      if (title == null) {
        title = localized('Folders');
      }
      iconName = 'folder.png';
    }
    const collapsed = isSectionCollapsed(title);
    if (collapsible) {
      onCollapseToggled = toggleSectionCollapsed;
    }
    const titleColor = account.color;

    return {
      title,
      iconName,
      items,
      collapsed,
      titleColor,
      onCollapseToggled,
      onItemCreated(displayName) {
        createCategory(account.id, displayName);
      },
    };
  }
}

export default SidebarSection;
