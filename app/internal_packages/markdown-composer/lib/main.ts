/**
 * Markdown composer plugin entry — bilet MVP #107.
 *
 * activate():
 *   1. Register builtin slash commands (/code, /link, /quote, /divider, /template, /snooze, /sendlater).
 *   2. Bind Cmd+Shift+M → toggle markdown preview.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.markdownComposer.{render, SlashRegistry} API.
 */

import { renderMarkdown, renderInline, sanitizeUrl } from './markdown-renderer';
import { SlashCommandRegistry, registerBuiltinSlashCommands } from './slash-command-registry';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  registerBuiltinSlashCommands();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'markdown-composer:toggle-preview': () => togglePreview(),
      'markdown-composer:open-slash-picker': () => openSlashPicker(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'markdown-composer:toggle-preview',
      label: 'Markdown preview toggle',
      section: 'Compose',
      keywords: ['markdown', 'preview', 'composer', 'render'],
      shortcut: ['⌘', '⇧', 'M'],
      handler: () => togglePreview(),
    });
    palette.register({
      id: 'markdown-composer:slash-picker',
      label: 'Slash command picker / (insert)',
      section: 'Compose',
      keywords: ['slash', 'picker', 'command', 'composer'],
      handler: () => openSlashPicker(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.markdownComposer = {
    render: renderMarkdown,
    renderInline,
    sanitizeUrl,
    SlashRegistry: SlashCommandRegistry,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('markdown-composer:toggle-preview');
    palette.unregister('markdown-composer:slash-picker');
  }
  SlashCommandRegistry._reset();
  if ((window as any).AppEnv?.markdownComposer) {
    delete (window as any).AppEnv.markdownComposer;
  }
}

function togglePreview(): void {
  console.info('[markdown-composer] toggle preview pane');
}

function openSlashPicker(): void {
  console.info('[markdown-composer] open slash picker');
}

export type { RenderResult } from './markdown-renderer';
export type { SlashCommand } from './slash-command-registry';
