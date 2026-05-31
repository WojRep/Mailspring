/* eslint no-unused-vars: 0*/
import * as Attributes from '../attributes';
import { ChangeMailTask } from './change-mail-task';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';
import { Thread } from '../models/thread';
import { Message } from '../models/message';

// Pin cross-device (decyzja plan_to_version_1.0/46). Kalka ChangeStarredTask:
// niesie intencję "przypnij/odepnij", którą silnik C++ realizuje keywordem IMAP
// `$Pinned` (storeFlagsAndCustomFlagsByUID, bramka allowsNewPermanentFlags()).
export class ChangePinnedTask extends ChangeMailTask {
  static attributes = {
    ...ChangeMailTask.attributes,

    pinned: Attributes.Boolean({
      modelKey: 'pinned',
    }),
  };

  pinned: boolean;

  constructor(
    data: AttributeValues<typeof ChangePinnedTask.attributes> & {
      threads?: Thread[];
      messages?: Message[];
    } = {}
  ) {
    super(data);
  }

  label() {
    return this.pinned ? localized('Pinning') : localized('Unpinning');
  }

  description() {
    const count = this.threadIds.length;

    if (this.isUndo) {
      return localized(`Undoing changes`);
    }

    if (count > 1) {
      return this.pinned
        ? localized('Pinned %@ threads', count)
        : localized('Unpinned %@ threads', count);
    }
    return this.pinned ? localized('Pinned') : localized('Unpinned');
  }

  willBeQueued() {
    if (this.threadIds.length === 0) {
      throw new Error('ChangePinnedTask: You must provide a `threads` Array of models or IDs.');
    }
    super.willBeQueued();
  }

  createUndoTask() {
    const task = super.createUndoTask() as ChangePinnedTask;
    task.pinned = !this.pinned;
    return task;
  }
}
