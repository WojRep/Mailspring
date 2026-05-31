/* eslint global-require: 0*/
import {
  localized,
  Thread,
  Actions,
  Message,
  TaskFactory,
  DatabaseStore,
  FocusedPerspectiveStore,
  GetMessageRFC2822Task,
  SyncbackDraftTask,
  DraftFactory,
  AccountStore,
  TaskQueue,
  EmlUtils,
  createLogger,
} from 'actunamail-exports';

const log = createLogger('ThreadListContextMenu');

type TemplateItem =
  | {
      label: string;
      click: () => void;
    }
  | { type: 'separator' };

export default class ThreadListContextMenu {
  threadIds: string[];
  accountIds: string[];
  threads?: Thread[];

  constructor({ threadIds = [], accountIds = [] }) {
    this.threadIds = threadIds;
    this.accountIds = accountIds;
  }

  menuItemTemplate() {
    return DatabaseStore.modelify<Thread>(Thread, this.threadIds)
      .then((threads) => {
        this.threads = threads;

        return Promise.all<TemplateItem>([
          this.findWithFrom(),
          this.findWithSubject(),
          { type: 'separator' },
          this.replyItem(),
          this.replyAllItem(),
          this.forwardItem(),
          this.forwardAsAttachmentItem(),
          { type: 'separator' },
          this.archiveItem(),
          this.markAsReadItem(),
          this.starItem(),
          { type: 'separator' },
          // Wave 3-8 items (plan v1.0 #93/#96/#98/#104)
          this.pinItem(),
          this.snoozeItem() as any,
          this.addTagItem(),
          this.timeIntentItem() as any,
          { type: 'separator' },
          this.trashItem(),
          this.markAsSpamItem(),
          { type: 'separator' },
          this.createMailboxLinkItem(),
          { type: 'separator' },
          this.saveAsEmlItem(),
        ]);
      })
      .then((menuItems) => {
        const compacted = menuItems.filter(Boolean);
        return compacted.filter((item, index) => {
          if ((item as any).type !== 'separator') return true;
          // Remove leading, trailing, and consecutive separators
          if (index === 0 || index === compacted.length - 1) return false;
          if ((compacted[index - 1] as any).type === 'separator') return false;
          return true;
        });
      });
  }

  findWithFrom(): TemplateItem | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }
    const first = this.threads[0];
    const from = first.participants.find((p) => !p.isMe()) || first.participants[0];

    return {
      label: localized(`Search for`) + ' ' + from.email,
      click: () => {
        Actions.searchQuerySubmitted(`"${from.email.replace('"', '""')}"`);
      },
    };
  }

  findWithSubject(): TemplateItem | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }
    const subject = this.threads[0].subject;

    return {
      label:
        localized(`Search for`) +
        ' ' +
        (subject.length > 35 ? `${subject.substr(0, 35)}...` : subject),
      click: () => {
        Actions.searchQuerySubmitted(`subject:"${subject}"`);
      },
    };
  }

  replyItem(): TemplateItem | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }
    return {
      label: localized('Reply'),
      click: () => {
        Actions.composeReply({
          threadId: this.threadIds[0],
          popout: true,
          type: 'reply',
          behavior: 'prefer-existing-if-pristine',
        });
      },
    };
  }

  replyAllItem(): Promise<TemplateItem> | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }

    return DatabaseStore.findBy<Message>(Message, { threadId: this.threadIds[0] })
      .order(Message.attributes.date.descending())
      .limit(1)
      .then((message) => {
        if (message && message.canReplyAll()) {
          return {
            label: localized('Reply All'),
            click: () => {
              Actions.composeReply({
                threadId: this.threadIds[0],
                popout: true,
                type: 'reply-all',
                behavior: 'prefer-existing-if-pristine',
              });
            },
          };
        }
        return null;
      });
  }

  forwardItem(): TemplateItem | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }
    return {
      label: localized('Forward'),
      click: () => {
        Actions.composeForward({ threadId: this.threadIds[0], popout: true });
      },
    };
  }

  forwardAsAttachmentItem(): TemplateItem | null {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }
    return {
      label: localized('Forward as Attachment'),
      click: async () => {
        const thread = this.threads[0];
        const messages = await DatabaseStore.findAll<Message>(Message, { threadId: thread.id })
          .order(Message.attributes.date.descending())
          .limit(1);
        if (!messages.length) return;

        const message = messages[0];
        const pathModule = require('path');
        const fs = require('fs');
        const tempDir = pathModule.join(
          require('@electron/remote').app.getPath('temp'),
          `actunamail-fwd-${message.id}`
        );
        fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = pathModule.join(tempDir, 'Forwarded Message.eml');

        const task = new GetMessageRFC2822Task({
          messageId: message.id,
          accountId: message.accountId,
          filepath: tempPath,
        });
        Actions.queueTask(task);
        await TaskQueue.waitForPerformRemote(task);

        if (!fs.existsSync(tempPath)) {
          AppEnv.showErrorDialog(
            localized('Could not download the original message. Please try again.')
          );
          return;
        }

        const account = AccountStore.accountForId(message.accountId);
        const draft = await DraftFactory.createDraft({
          subject: `Fwd: ${message.subject || ''}`,
          from: [account.defaultMe()],
          accountId: message.accountId,
        });

        const syncTask = new SyncbackDraftTask({ draft });
        Actions.queueTask(syncTask);
        await TaskQueue.waitForPerformLocal(syncTask);

        Actions.addAttachment({
          filePath: tempPath,
          headerMessageId: draft.headerMessageId,
          onCreated: () => {
            Actions.composePopoutDraft(draft.headerMessageId);
          },
        });
      },
    };
  }

  archiveItem(): TemplateItem | null {
    const perspective = FocusedPerspectiveStore.current();
    const allowed = perspective.canArchiveThreads(this.threads);
    if (!allowed) {
      return null;
    }
    return {
      label: localized('Archive'),
      click: () => {
        const tasks = TaskFactory.tasksForArchiving({
          source: 'Context Menu: Thread List',
          threads: this.threads,
        });
        Actions.queueTasks(tasks);
      },
    };
  }

  trashItem(): TemplateItem | null {
    const perspective = FocusedPerspectiveStore.current();
    const allowed = perspective.canMoveThreadsTo(this.threads, 'trash');
    if (!allowed) {
      return null;
    }
    return {
      label: localized('Trash'),
      click: () => {
        const tasks = TaskFactory.tasksForMovingToTrash({
          source: 'Context Menu: Thread List',
          threads: this.threads,
        });
        Actions.queueTasks(tasks);
      },
    };
  }

  markAsReadItem(): TemplateItem | null {
    const unread = this.threads.every((t) => t.unread === false);
    const dir = unread ? localized('Unread') : localized('Read');

    return {
      label: localized(`Mark as %@`, dir),
      click: () => {
        Actions.queueTask(
          TaskFactory.taskForInvertingUnread({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          })
        );
      },
    };
  }

  markAsSpamItem(): TemplateItem | null {
    const allInSpam = this.threads.every((item) => item.folders.some((c) => c.role === 'spam'));
    const dir = allInSpam ? localized('Not Spam') : localized('Spam');

    return {
      label: localized(`Mark as %@`, dir),
      click: () => {
        Actions.queueTasks(
          allInSpam
            ? TaskFactory.tasksForMarkingNotSpam({
                source: 'Context Menu: Thread List',
                threads: this.threads,
              })
            : TaskFactory.tasksForMarkingAsSpam({
                source: 'Context Menu: Thread List',
                threads: this.threads,
              })
        );
      },
    };
  }

  starItem(): TemplateItem | null {
    const starred = this.threads.every((t) => t.starred === false);

    let label = localized('Star');
    if (!starred) {
      label = this.threadIds.length > 1 ? localized('Remove Stars') : localized('Remove Star');
    }

    return {
      label: label,
      click: () => {
        Actions.queueTask(
          TaskFactory.taskForInvertingStarred({
            source: 'Context Menu: Thread List',
            threads: this.threads,
          })
        );
      },
    };
  }

  // ======================================================================
  // Wave 3-8 context menu items (plan v1.0 #93/#96/#98/#104).
  // Per user-reported gap 2026-05-31 'dlaczego nie ma tych opcji w menu
  // kontekstowym pod prawym przyciskiem?'. Każda metoda safely lazy-requires
  // odpowiedni store + zwraca null/no-op gdy package nie aktywny.
  // ======================================================================

  pinItem(): TemplateItem | null {
    let PinStore: any = null;
    try { PinStore = require('../../priority-inbox-pin/lib/pin-store').PinStore; } catch (e) { /* #93 inactive */ }
    const ids = this.threadIds;
    if (!ids || ids.length === 0) return null;
    const allPinned = PinStore && ids.every((id) => PinStore.isPinned(id));
    const label = allPinned
      ? (ids.length > 1 ? localized('Odepnij wszystkie / Unpin all') : localized('Odepnij / Unpin'))
      : (ids.length > 1 ? localized('Przypnij wszystkie / Pin all') : localized('Przypnij jako ważne / Pin as important'));
    return {
      label,
      click: () => {
        if (!PinStore) return;
        for (const id of ids) {
          if (allPinned) PinStore.unpin(id);
          else PinStore.pin(id);
        }
      },
    } as TemplateItem;
  }

  snoozeItem(): any {
    let SnoozeStore: any = null;
    try { SnoozeStore = require('../../snooze/lib/snooze-store').SnoozeStore; } catch (e) { /* #104 inactive */ }
    const ids = this.threadIds;
    if (!ids || ids.length === 0) return null;
    const presets = [
      { label: localized('Za godzinę / In 1 hour'), ms: 60 * 60 * 1000 },
      { label: localized('Dziś wieczorem / This evening (18:00)'), ms: -1, preset: 'evening' },
      { label: localized('Jutro rano / Tomorrow morning (9:00)'), ms: -1, preset: 'tomorrow' },
      { label: localized('Za tydzień / In 1 week'), ms: 7 * 24 * 60 * 60 * 1000 },
    ];
    return {
      label: localized('Odłóż / Snooze'),
      submenu: presets.map((p) => ({
        label: p.label,
        click: () => {
          if (!SnoozeStore) return;
          const wakeAt = p.ms > 0 ? Date.now() + p.ms : this._computePresetWake(p.preset);
          for (const id of ids) {
            try {
              if (typeof SnoozeStore.snoozeUntil === 'function') {
                SnoozeStore.snoozeUntil(id, wakeAt, { preset: p.preset });
              } else if (typeof SnoozeStore.snooze === 'function') {
                SnoozeStore.snooze({ threadId: id, wakeAt, preset: p.preset });
              }
            } catch (e) { /* */ }
          }
        },
      })),
    };
  }

  private _computePresetWake(preset: string | undefined): number {
    const d = new Date();
    if (preset === 'evening') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    if (preset === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
    return Date.now() + 60 * 60 * 1000;
  }

  addTagItem(): TemplateItem | null {
    let TagSystemUIBus: any = null;
    try { TagSystemUIBus = require('../../tag-system/lib/tag-system-ui-bus').TagSystemUIBus; } catch (e) { /* #98 inactive */ }
    const ids = this.threadIds;
    if (!ids || ids.length === 0) return null;
    return {
      label: localized('Dodaj tag / Add tag') + ' (⌘L)',
      click: () => {
        if (!TagSystemUIBus) return;
        TagSystemUIBus.openPicker(ids[0]);
      },
    };
  }

  timeIntentItem(): any {
    let TimeIntentStore: any = null;
    try {
      const mod = require('../../time-intent-tags/lib/time-intent-store');
      TimeIntentStore = mod.TimeIntentStore || mod.default;
    } catch (e) { /* #96 inactive */ }
    const ids = this.threadIds;
    if (!ids || ids.length === 0) return null;
    const setIntent = (intent: string) => {
      if (!TimeIntentStore || typeof TimeIntentStore.set !== 'function') return;
      for (const id of ids) {
        try { TimeIntentStore.set(id, intent); } catch (e) { /* */ }
      }
    };
    return {
      label: localized('Intencja czasu / Time intent'),
      submenu: [
        { label: localized('Dzisiaj / Today'), click: () => setIntent('today') },
        { label: localized('Nadchodzące / Upcoming'), click: () => setIntent('upcoming') },
        { label: localized('Kiedykolwiek / Anytime'), click: () => setIntent('anytime') },
      ],
    };
  }

  createMailboxLinkItem() {
    if (this.threadIds.length !== 1 || !this.threads[0]) {
      return null;
    }

    return {
      label: localized('Copy mailbox permalink'),
      click: async () => {
        const id = this.threadIds[0];
        const thread = await DatabaseStore.findBy<Thread>(Thread, { id }).limit(1);
        if (!thread) return;
        navigator.clipboard
          .writeText(thread.getMailboxPermalink())
          .catch((err) => log.error({ err }, 'Failed to copy to clipboard'));
      },
    };
  }

  saveAsEmlItem(): TemplateItem {
    const label =
      this.threadIds.length > 1
        ? localized('Save %1$@ threads as .eml...', this.threadIds.length)
        : localized('Save as .eml...');

    return {
      label,
      click: async () => {
        if (this.threadIds.length === 1) {
          const thread = this.threads[0];
          const messages = await DatabaseStore.findAll<Message>(Message, { threadId: thread.id })
            .order(Message.attributes.date.descending())
            .limit(1);
          if (!messages.length) return;

          const message = messages[0];
          const defaultFilename = EmlUtils.defaultEmlFilename(message.subject);

          AppEnv.showSaveDialog({ defaultPath: defaultFilename }, async (savePath) => {
            if (!savePath) return;
            const task = new GetMessageRFC2822Task({
              messageId: message.id,
              accountId: message.accountId,
              filepath: savePath,
            });
            Actions.queueTask(task);
          });
        } else {
          AppEnv.showOpenDialog(
            {
              title: localized('Save .eml files to...'),
              buttonLabel: localized('Save All'),
              properties: ['openDirectory', 'createDirectory'],
            },
            async (selected) => {
              if (!selected || selected.length === 0) return;
              const outputDir = selected[0];
              const path = require('path');

              for (const thread of this.threads) {
                const messages = await DatabaseStore.findAll<Message>(Message, {
                  threadId: thread.id,
                })
                  .order(Message.attributes.date.descending())
                  .limit(1);
                if (!messages.length) continue;

                const message = messages[0];
                const filename = EmlUtils.defaultEmlFilename(message.subject);

                const task = new GetMessageRFC2822Task({
                  messageId: message.id,
                  accountId: message.accountId,
                  filepath: path.join(outputDir, filename),
                });
                Actions.queueTask(task);
              }
            }
          );
        }
      },
    };
  }

  displayMenu() {
    this.menuItemTemplate().then((template) => {
      require('@electron/remote').Menu.buildFromTemplate(template).popup({});
    });
  }
}
