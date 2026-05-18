import React from 'react';
import { ListensToFluxStore, RetinaImg } from 'actunamail-component-kit';
import {
  localized,
  Actions,
  Folder,
  PropTypes,
  TaskQueue,
  ExpungeAllInFolderTask,
  DestroyCategoryTask,
  CategoryStore,
  RegExpUtils,
  FocusedPerspectiveStore,
  ThreadCountsStore,
} from 'actunamail-exports';

interface ThreadListEmptyFolderBarProps {
  role: string;
  folders: Folder[];
  count: number;
  busy: boolean;
}

class ThreadListEmptyFolderBar extends React.Component<ThreadListEmptyFolderBarProps> {
  static displayName = 'ThreadListEmptyFolderBar';

  // Folders that were moved into Trash (ticket #48) are separate IMAP folders.
  // ExpungeAllInFolderTask only clears messages, so "Empty Trash" must also
  // destroy those nested folders (ticket #59 — user report 2026-05-18).
  _foldersNestedInTrash(): Folder[] {
    const re = RegExpUtils.subcategorySplitRegex();
    const nested: Folder[] = [];
    for (const folder of this.props.folders) {
      const folderKey = folder.displayName.replace(re, '/');
      for (const cat of CategoryStore.userCategories(folder.accountId)) {
        const key = cat.displayName.replace(re, '/');
        if (key !== folderKey && key.startsWith(`${folderKey}/`) && cat instanceof Folder) {
          nested.push(cat);
        }
      }
    }
    return nested;
  }

  _onClick = () => {
    const { folders, role } = this.props;
    const nested = this._foldersNestedInTrash();

    const detail = nested.length
      ? localized(
          'All messages and %@ folder(s) inside will be permanently deleted.',
          `${nested.length}`
        )
      : localized('All messages inside will be permanently deleted.');
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      message: role === 'trash' ? localized('Empty Trash?') : localized('Empty Spam?'),
      detail,
      buttons: [localized('Empty'), localized('Cancel')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) {
      return;
    }

    Actions.queueTasks([
      ...folders.map(
        (folder) => new ExpungeAllInFolderTask({ accountId: folder.accountId, folder })
      ),
      ...nested.map((cat) => new DestroyCategoryTask({ path: cat.path, accountId: cat.accountId })),
    ]);
  };

  render() {
    const { role, count, busy } = this.props;
    // Ticket #59 A: the "Empty Trash" action must be discoverable whenever
    // the user is in Trash/Spam — it is no longer gated on the thread count
    // (which can be stale/missing in ThreadCountsStore). The notice line is
    // shown only when an actual count is available.
    if (!role) {
      return false;
    }
    const term = role === 'trash' ? localized('Deleted').toLocaleLowerCase() : role;
    const emptyLabel = role === 'trash' ? localized('Empty Trash') : localized('Empty Spam');
    const hasCount = typeof count === 'number' && count > 0;

    return (
      <div className="thread-list-empty-folder-bar">
        {hasCount && (
          <div className="notice">
            {count > 1
              ? localized(`Showing %@ threads with %@ messages`, count.toLocaleString(), term)
              : localized(`Showing 1 thread with %@ messages`, term)}
          </div>
        )}
        {busy ? (
          <div className="btn">
            <RetinaImg
              style={{ width: 16, height: 16 }}
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentPreserve}
            />
          </div>
        ) : (
          <div
            className="btn"
            role="button"
            tabIndex={0}
            onClick={this._onClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._onClick();
              }
            }}
          >
            {emptyLabel}
          </div>
        )}
      </div>
    );
  }
}

export default ListensToFluxStore(ThreadListEmptyFolderBar, {
  stores: [TaskQueue, ThreadCountsStore, FocusedPerspectiveStore],
  getStateFromStores: (props) => {
    const p = FocusedPerspectiveStore.current();
    const folders = (p && p.categories()) || [];

    if (
      !folders.length ||
      !folders.every((c) => c instanceof Folder && (c.role === 'trash' || c.role === 'spam'))
    ) {
      return { role: null, folders: null };
    }

    return {
      folders,
      role: folders[0].role,
      busy: TaskQueue.findTasks(ExpungeAllInFolderTask).some((t) =>
        folders.map((f) => f.accountId).includes(t.accountId)
      ),
      count: folders.reduce(
        (sum, { id }) => sum + (ThreadCountsStore.totalCountForCategoryId(id) ?? 0),
        0
      ),
    };
  },
});
