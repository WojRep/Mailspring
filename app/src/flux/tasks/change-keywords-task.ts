/* eslint no-unused-vars: 0*/
import * as Attributes from '../attributes';
import { ChangeMailTask } from './change-mail-task';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';
import { Thread } from '../models/thread';
import { Message } from '../models/message';

// Tag sync cross-device (bilet #117). Generalizacja ChangePinnedTask (decyzja
// plan_to_version_1.0/46) na dowolne keywordy IMAP: silnik C++ realizuje
// intencję przez storeFlagsAndCustomFlagsByUID (bramka allowsNewPermanentFlags(),
// cichy fallback gdy serwer nie wspiera własnych keywordów — jak `$Pinned`).
// Multi-value toAdd/toRemove — kalka ChangeLabelsTask.
export class ChangeKeywordsTask extends ChangeMailTask {
  static attributes = {
    ...ChangeMailTask.attributes,

    keywordsToAdd: Attributes.Obj({
      modelKey: 'keywordsToAdd',
    }),
    keywordsToRemove: Attributes.Obj({
      modelKey: 'keywordsToRemove',
    }),
  };

  keywordsToAdd: string[];
  keywordsToRemove: string[];

  constructor(
    data: AttributeValues<typeof ChangeKeywordsTask.attributes> & {
      threads?: Thread[];
      messages?: Message[];
    } = {}
  ) {
    super(data);
  }

  label() {
    return this.keywordsToAdd && this.keywordsToAdd.length
      ? localized('Applying tags')
      : localized('Removing tags');
  }

  description() {
    const count = this.threadIds.length;

    if (this.isUndo) {
      return localized(`Undoing changes`);
    }

    if (count > 1) {
      return localized('Changed tags on %@ threads', count);
    }
    return localized('Changed tags');
  }

  willBeQueued() {
    if (this.threadIds.length === 0) {
      throw new Error('ChangeKeywordsTask: You must provide a `threads` Array of models or IDs.');
    }
    if (!Array.isArray(this.keywordsToAdd) || !Array.isArray(this.keywordsToRemove)) {
      throw new Error(
        'ChangeKeywordsTask: You must provide `keywordsToAdd` and `keywordsToRemove` Arrays.'
      );
    }
    super.willBeQueued();
  }

  createUndoTask() {
    const task = super.createUndoTask() as ChangeKeywordsTask;
    const { keywordsToAdd, keywordsToRemove } = task;
    task.keywordsToAdd = keywordsToRemove;
    task.keywordsToRemove = keywordsToAdd;
    return task;
  }
}
