/**
 * @mention picker plugin entry — bilet MVP #108.
 *
 * activate():
 *   1. Cmd+K palette command (manual trigger).
 *   2. Expose AppEnv.mentionPicker API.
 *
 * Composer wire-up (input event listener → detectMentionTrigger → picker dropdown)
 * odłożone do UI ticket — wymaga React komponent + edytor integration.
 */

import {
  detectMentionTrigger,
  searchMentions,
  searchMentionsWithFallback,
  buildMentionInsertion,
  renderMentionFallback,
  extractEmailFromMention,
  MENTION_TRIGGER_MIN_CHARS,
} from './mention-engine';
import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import MentionDropdown from './mention-dropdown';
import { MentionUIBus } from './mention-ui-bus';

export function activate() {
  ComponentRegistry.register(MentionDropdown, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'mention-picker:open',
      label: 'Wstaw @mention osoby / Insert @mention',
      section: 'Compose',
      keywords: ['mention', 'wzmianka', 'tag person', 'people'],
      handler: () => openManually(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.mentionPicker = {
    detectTrigger: detectMentionTrigger,
    search: searchMentions,
    searchWithFallback: searchMentionsWithFallback,
    buildInsertion: buildMentionInsertion,
    renderFallback: renderMentionFallback,
    extractEmail: extractEmailFromMention,
    constants: {
      MENTION_TRIGGER_MIN_CHARS,
    },
  };
}

export function deactivate() {
  ComponentRegistry.unregister(MentionDropdown);
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('mention-picker:open');
  }
  if ((window as any).AppEnv?.mentionPicker) {
    delete (window as any).AppEnv.mentionPicker;
  }
}

function openManually(): void {
  MentionUIBus.openWithQuery('');
}

export type { MentionMatch, MentionInsertion, MentionInsertMode } from './mention-engine';
