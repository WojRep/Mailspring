import { Message, Thread } from 'actunamail-exports';

export interface ThreadWithMessagesMetadata extends Thread {
  __messages: Message[];
}
