import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {
  RetinaImg,
  BindGlobalCommands,
  RovingTabIndexToolbar,
  Tooltip,
} from 'actunamail-component-kit';
import {
  localized,
  Actions,
  Thread,
  TaskFactory,
  ChangeLabelsTask,
  CategoryStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
} from 'actunamail-exports';

import ThreadListStore from './thread-list-store';
import {
  FLAG_COLORS,
  flagColorValue,
  flagColorToken,
  flagColorNameKey,
  flagMeaningKey,
} from '../../../src/flag-colors';
import { setFlagColor, clearFlag } from './flag-actions';

export class ArchiveButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ArchiveButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onArchive = (event?: React.MouseEvent) => {
    const tasks = TaskFactory.tasksForArchiving({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads(this.props.items);
    if (!allowed) {
      return false;
    }

    return (
      <BindGlobalCommands commands={{ 'core:archive-item': () => this._onArchive() }}>
        <Tooltip content={localized('Archive')}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={localized('Archive')}
            onClick={this._onArchive}
          >
            <RetinaImg
              name="toolbar-archive.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        </Tooltip>
      </BindGlobalCommands>
    );
  }
}

export class TrashButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'TrashButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onRemove = (event?: React.MouseEvent) => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'trash');
    if (!allowed) {
      return false;
    }

    return (
      <BindGlobalCommands commands={{ 'core:delete-item': () => this._onRemove() }}>
        <Tooltip content={localized('Move to Trash')}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={localized('Move to Trash')}
            onClick={this._onRemove}
          >
            <RetinaImg
              name="toolbar-trash.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        </Tooltip>
      </BindGlobalCommands>
    );
  }
}

class HiddenGenericRemoveButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'HiddenGenericRemoveButton';

  _onRemoveAndShift = ({ offset }) => {
    const dataSource = ThreadListStore.dataSource();
    const focusedId = FocusedContentStore.focusedId('thread');
    const focusedIdx = dataSource.indexOfId(focusedId) + offset;
    let item;
    if (focusedIdx < dataSource.count() && focusedIdx >= 0) {
      item = dataSource.get(focusedIdx);
    }
    this._onRemoveFromView();
    if (item) {
      Actions.setFocus({ collection: 'thread', item });
    }
  };

  _onRemoveFromView = () => {
    const current = FocusedPerspectiveStore.current();
    const tasks = current.tasksForRemovingItems(this.props.items, 'Keyboard Shortcut');
    Actions.queueTasks(tasks);
    Actions.popSheet();
  };

  render() {
    return (
      <BindGlobalCommands
        commands={{
          'core:gmail-remove-from-view': this._onRemoveFromView,
          'core:remove-from-view': this._onRemoveFromView,
          'core:remove-and-previous': () => this._onRemoveAndShift({ offset: -1 }),
          'core:remove-and-next': () => this._onRemoveAndShift({ offset: 1 }),
        }}
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

class HiddenToggleImportantButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'HiddenToggleImportantButton';

  _onSetImportant = (important: boolean) => {
    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(this.props.items, (accountThreads, accountId) => {
        return new ChangeLabelsTask({
          threads: accountThreads,
          source: 'Keyboard Shortcut',
          labelsToAdd: important ? [CategoryStore.getCategoryByRole(accountId, 'important')] : [],
          labelsToRemove: important
            ? []
            : [CategoryStore.getCategoryByRole(accountId, 'important')],
        });
      })
    );
  };

  render() {
    if (!AppEnv.config.get('core.workspace.showImportant')) {
      return false;
    }
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
      this.props.items,
      'important'
    );
    if (!allowed) {
      return false;
    }

    const allImportant = this.props.items.every((item) =>
      item.labels.some((c) => c.role === 'important')
    );

    return (
      <BindGlobalCommands
        key={allImportant ? 'unimportant' : 'important'}
        commands={
          allImportant
            ? { 'core:mark-unimportant': () => this._onSetImportant(false) }
            : { 'core:mark-important': () => this._onSetImportant(true) }
        }
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

export class MarkAsSpamButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'MarkAsSpamButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onNotSpam = (event?: React.MouseEvent) => {
    // TODO BG REPLACE TASK FACTORY
    const tasks = TaskFactory.tasksForMarkingNotSpam({
      source: 'Toolbar Button: Thread List',
      threads: this.props.items,
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  _onMarkAsSpam = (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allInSpam = this.props.items.every((item) => item.folders.some((c) => c.role === 'spam'));

    if (allInSpam) {
      return (
        <BindGlobalCommands
          key="not-spam"
          commands={{ 'core:report-not-spam': () => this._onNotSpam() }}
        >
          <Tooltip content={localized('Not Spam')}>
            <button
              tabIndex={-1}
              className="btn btn-toolbar"
              aria-label={localized('Not Spam')}
              onClick={this._onNotSpam}
            >
              <RetinaImg
                name="toolbar-not-spam.png"
                mode={RetinaImg.Mode.ContentIsMask}
                aria-hidden="true"
              />
            </button>
          </Tooltip>
        </BindGlobalCommands>
      );
    }

    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'spam');
    if (!allowed) {
      return false;
    }
    return (
      <BindGlobalCommands
        key="spam"
        commands={{ 'core:report-as-spam': () => this._onMarkAsSpam() }}
      >
        <Tooltip content={localized('Mark as Spam')}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={localized('Mark as Spam')}
            onClick={this._onMarkAsSpam}
          >
            <RetinaImg
              name="toolbar-spam.png"
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        </Tooltip>
      </BindGlobalCommands>
    );
  }
}

export class ToggleStarredButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ToggleStarredButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onStar = (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads: this.props.items,
        source: 'Toolbar Button: Thread List',
      })
    );
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const postClickStarredState = this.props.items.every((t) => t.starred === false);
    const title = postClickStarredState ? localized('Star') : localized('Unstar');
    const imageName = postClickStarredState ? 'toolbar-star.png' : 'toolbar-star-selected.png';

    return (
      <BindGlobalCommands commands={{ 'core:star-item': () => this._onStar() }}>
        <Tooltip content={title}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={title}
            onClick={this._onStar}
          >
            <RetinaImg name={imageName} mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
          </button>
        </Tooltip>
      </BindGlobalCommands>
    );
  }
}

export class ToggleUnreadButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ToggleUnreadButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onClick = (event) => {
    const targetUnread = this.props.items.every((t) => t.unread === false);
    this._onChangeUnread(targetUnread);
    event.stopPropagation();
    return;
  };

  _onChangeUnread = (targetUnread: boolean) => {
    Actions.queueTask(
      TaskFactory.taskForSettingUnread({
        threads: this.props.items,
        unread: targetUnread,
        source: 'Toolbar Button: Thread List',
      })
    );
    Actions.popSheet();
  };

  render() {
    const targetUnread = this.props.items.every((t) => t.unread === false);
    const fragment = targetUnread ? localized('Unread') : localized('Read');
    const key = targetUnread ? 'unread' : 'read';
    const label = localized(`Mark as %@`, fragment);

    return (
      <BindGlobalCommands
        key={key}
        commands={
          targetUnread
            ? { 'core:mark-as-unread': () => this._onChangeUnread(true) }
            : { 'core:mark-as-read': () => this._onChangeUnread(false) }
        }
      >
        <Tooltip content={label}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={label}
            onClick={this._onClick}
          >
            <RetinaImg
              name={`toolbar-markas${key}.png`}
              mode={RetinaImg.Mode.ContentIsMask}
              aria-hidden="true"
            />
          </button>
        </Tooltip>
      </BindGlobalCommands>
    );
  }
}

interface ThreadArrowButtonState {
  disabled: boolean;
}
class ThreadArrowButton extends React.Component<
  {
    command: string;
    direction: string;
    title: string;
    getStateFromStores: () => ThreadArrowButtonState;
  },
  ThreadArrowButtonState
> {
  static propTypes = {
    getStateFromStores: PropTypes.func,
    direction: PropTypes.string,
    command: PropTypes.string,
    title: PropTypes.string,
  };

  _unsubscribe?: () => void;
  _unsubscribe_focus?: () => void;

  constructor(props) {
    super(props);
    this.state = this.props.getStateFromStores();
  }

  componentDidMount() {
    this._unsubscribe = ThreadListStore.listen(this._onStoreChange);
    this._unsubscribe_focus = FocusedContentStore.listen(this._onStoreChange);
  }

  componentWillUnmount() {
    this._unsubscribe();
    this._unsubscribe_focus();
  }

  _onClick = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (this.state.disabled) {
      return;
    }
    AppEnv.commands.dispatch(this.props.command);
    return;
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !this.state.disabled) {
      e.preventDefault();
      this._onClick(e);
    }
  };

  _onStoreChange = () => {
    this.setState(this.props.getStateFromStores());
  };

  render() {
    const { direction, title } = this.props;
    const { disabled } = this.state;
    const classes = classNames({
      'btn-icon': true,
      'message-toolbar-arrow': true,
      disabled: disabled,
    });

    return (
      <Tooltip content={title}>
        <div
          className={`${classes} ${direction}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={title}
          aria-disabled={disabled}
          onClick={this._onClick}
          onKeyDown={this._onKeyDown}
        >
          <RetinaImg
            name={`toolbar-${direction}-arrow.png`}
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </div>
      </Tooltip>
    );
  }
}

// Kolorowa flaga Apple Mail: przycisk + menu 7 kolorów (1:1 jak Apple) +
// „Wymaż flagę". Wybór koloru zapisuje bity $MailFlagBit* + \Flagged (cross-device).
export class ColoredFlagButton extends React.Component<{ items: Thread[] }, { open: boolean }> {
  static displayName = 'ColoredFlagButton';
  static containerRequired = false;
  static propTypes = { items: PropTypes.array.isRequired };

  state = { open: false };
  _closeListener: (() => void) | null = null;
  _timer: any = null;

  componentDidUpdate(_prevProps, prevState: { open: boolean }) {
    if (this.state.open && !prevState.open) {
      this._closeListener = () => this.setState({ open: false });
      // setTimeout(0): nie łap klika otwierającego; once: zamknij po kliknięciu poza.
      this._timer = setTimeout(() => {
        this._timer = null;
        if (this._closeListener) {
          document.addEventListener('click', this._closeListener, { once: true } as any);
        }
      }, 0);
    } else if (!this.state.open && prevState.open) {
      this._detach(); // menu zamknięte — sprzątnij timer/listener (przegląd: leak/race)
    }
  }

  componentWillUnmount() {
    this._detach();
  }

  _detach() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._closeListener) {
      document.removeEventListener('click', this._closeListener);
      this._closeListener = null;
    }
  }

  _commonFlagValue(): number | null {
    const items = this.props.items || [];
    if (!items.length) return null;
    const vals = items.map((t: any) => flagColorValue(t.customKeywords, t.starred));
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
  }

  _toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState((s) => ({ open: !s.open }));
  };

  _pick = (value: number) => (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFlagColor(this.props.items, value);
    this.setState({ open: false });
  };

  _clear = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearFlag(this.props.items);
    this.setState({ open: false });
  };

  // Escape zamyka menu (WAI-ARIA); klawiatura na pozycjach: Enter/Spacja aktywuje.
  _onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && this.state.open) {
      e.stopPropagation();
      this.setState({ open: false });
    }
  };

  _itemKeyDown = (fn: (e: React.SyntheticEvent) => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e);
    }
  };

  render() {
    const title = localized('Flag');
    const common = this._commonFlagValue();
    const iconColor =
      common !== null ? flagColorToken(common) || 'var(--text-muted)' : 'var(--text-muted)';
    return (
      <div
        className="flag-color-button"
        style={{ position: 'relative', display: 'inline-block' }}
        onKeyDown={this._onKeyDown}
      >
        <Tooltip content={title}>
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            aria-label={title}
            aria-haspopup="true"
            aria-expanded={this.state.open}
            onClick={this._toggleOpen}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 1.5v13"
                stroke={iconColor}
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
              <path d="M4.8 2.2h7.2l-2.1 2.6 2.1 2.6H4.8z" fill={iconColor} />
            </svg>
          </button>
        </Tooltip>
        {this.state.open && (
          <div className="flag-color-menu" role="menu">
            {FLAG_COLORS.map((c) => {
              // override-aware: kolor i nazwa wg ewentualnej kalibracji (setFlagColorOrder).
              const token = flagColorToken(c.value) || c.token;
              const colorLabel = localized(flagColorNameKey(c.value) || c.nameKey);
              const meaningKey = flagMeaningKey(c.value);
              // Znaczenie (akcja kwadrantu) obok koloru, np. „Czerwona · Zrób teraz".
              const label = meaningKey ? `${colorLabel} · ${localized(meaningKey)}` : colorLabel;
              return (
                <div
                  key={c.value}
                  role="menuitemradio"
                  aria-checked={common === c.value}
                  aria-label={label}
                  tabIndex={0}
                  className="flag-color-menu-item"
                  onClick={this._pick(c.value)}
                  onKeyDown={this._itemKeyDown(this._pick(c.value))}
                >
                  <span
                    className="flag-color-swatch"
                    style={{ background: token }}
                    aria-hidden="true"
                  />
                  {label}
                </div>
              );
            })}
            <div
              role="menuitem"
              tabIndex={0}
              className="flag-color-menu-item flag-color-menu-clear"
              onClick={this._clear}
              onKeyDown={this._itemKeyDown(this._clear)}
            >
              {localized('Clear Flag')}
            </div>
          </div>
        )}
      </div>
    );
  }
}

export const FlagButtons = (props: { items: Thread[] }) => (
  <RovingTabIndexToolbar
    label={localized('Flag Actions')}
    className="button-group"
    style={{ order: -103 } as React.CSSProperties}
  >
    <ToggleStarredButton {...props} />
    <ColoredFlagButton {...props} />
    <HiddenToggleImportantButton {...props} />
    <ToggleUnreadButton {...props} />
  </RovingTabIndexToolbar>
);
FlagButtons.displayName = 'FlagButtons';
(FlagButtons as any).containerRequired = false;

export const MoveButtons = (props: { items: Thread[] }) => (
  <RovingTabIndexToolbar
    label={localized('Move Actions')}
    className="button-group"
    style={{ order: -107 } as React.CSSProperties}
  >
    <ArchiveButton {...props} />
    <MarkAsSpamButton {...props} />
    <HiddenGenericRemoveButton {...props} />
    <TrashButton {...props} />
  </RovingTabIndexToolbar>
);
MoveButtons.displayName = 'MoveButtons';
(MoveButtons as any).containerRequired = false;

export const DownButton = () => {
  const getStateFromStores = () => {
    const selectedId = FocusedContentStore.focusedId('thread');
    const lastIndex = ThreadListStore.dataSource().count() - 1;
    const lastItem = ThreadListStore.dataSource().get(lastIndex);
    return {
      disabled: lastItem && lastItem.id === selectedId,
    };
  };

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'down'}
      title={localized('Next thread')}
      command={'core:next-item'}
    />
  );
};
DownButton.displayName = 'DownButton';
DownButton.containerRequired = false;

export const UpButton = () => {
  const getStateFromStores = () => {
    const selectedId = FocusedContentStore.focusedId('thread');
    const item = ThreadListStore.dataSource().get(0);
    return {
      disabled: item && item.id === selectedId,
    };
  };

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'up'}
      title={localized('Previous thread')}
      command={'core:previous-item'}
    />
  );
};
UpButton.displayName = 'UpButton';
UpButton.containerRequired = false;
