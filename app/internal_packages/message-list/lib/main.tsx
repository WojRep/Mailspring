import {
  MailboxPerspective,
  ComponentRegistry,
  WorkspaceStore,
  DatabaseStore,
  Actions,
  Thread,
} from 'actunamail-exports';

import { MessageListHiddenMessagesToggle } from './message-list-hidden-messages-toggle';
import MessageList from './message-list';
import { SidebarPluginContainer } from './sidebar-plugin-container';

// The MessageListSidebar column only earns its space when at least one
// plugin is registered to the `MessageListSidebar:ContactCard` role. With
// no such plugin the column would render as an empty white strip, so we
// register SidebarPluginContainer only while the role is populated and
// keep it in sync as plugins activate / deactivate.
let _sidebarRegistered = false;
let _sidebarUnlisten: (() => void) | null = null;

function _syncSidebarPluginContainer() {
  const hasContactCard =
    ComponentRegistry.findComponentsMatching({
      role: 'MessageListSidebar:ContactCard',
    }).length > 0;

  if (hasContactCard && !_sidebarRegistered) {
    ComponentRegistry.register(SidebarPluginContainer, {
      location: WorkspaceStore.Location.MessageListSidebar,
    });
    _sidebarRegistered = true;
  } else if (!hasContactCard && _sidebarRegistered) {
    ComponentRegistry.unregister(SidebarPluginContainer);
    _sidebarRegistered = false;
  }
}

export function activate() {
  if (AppEnv.isMainWindow()) {
    // Register Message List Actions we provide globally
    ComponentRegistry.register(MessageList, {
      location: WorkspaceStore.Location.MessageList,
    });
    _sidebarUnlisten = ComponentRegistry.listen(_syncSidebarPluginContainer);
    _syncSidebarPluginContainer();
    ComponentRegistry.register(MessageListHiddenMessagesToggle, {
      role: 'MessageListHeaders',
    });
  } else {
    // This is for the thread-popout window.
    const { threadId, perspectiveJSON } = AppEnv.getWindowProps();
    ComponentRegistry.register(MessageList, { location: WorkspaceStore.Location.Center });

    // We need to locate the thread and focus it so that the MessageList displays it
    DatabaseStore.find<Thread>(Thread, threadId).then((thread) =>
      Actions.setFocus({ collection: 'thread', item: thread })
    );

    // Set the focused perspective and hide the proper messages
    // (e.g. we should hide deleted items from the inbox, but not from trash)
    Actions.focusMailboxPerspective(MailboxPerspective.fromJSON(perspectiveJSON));
    ComponentRegistry.register(MessageListHiddenMessagesToggle, {
      role: 'MessageListHeaders',
    });
  }
}

export function deactivate() {
  ComponentRegistry.unregister(MessageList);
  if (_sidebarUnlisten) {
    _sidebarUnlisten();
    _sidebarUnlisten = null;
  }
  if (_sidebarRegistered) {
    ComponentRegistry.unregister(SidebarPluginContainer);
    _sidebarRegistered = false;
  }
}
