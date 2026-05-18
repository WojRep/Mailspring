import React from 'react';
import { ListensToFluxStore, RetinaImg } from 'actunamail-component-kit';
import {
  localized,
  Actions,
  Folder,
  PropTypes,
  TaskQueue,
  ExpungeAllInFolderTask,
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

  _onClick = () => {
    const { folders } = this.props;

    Actions.queueTasks(
      folders.map(
        (folder) =>
          new ExpungeAllInFolderTask({
            accountId: folder.accountId,
            folder,
          })
      )
    );
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
