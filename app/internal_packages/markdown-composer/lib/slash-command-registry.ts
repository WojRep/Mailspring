/**
 * Slash Command Registry — bilet MVP #107.
 *
 * Plugin API: Composer.registerSlashCommand({slug, label, handler}).
 * Picker w composer body wywoływany po `/` z pasującym query → handler insert text.
 */

export interface SlashCommand {
  slug: string;
  label: string;
  description?: string;
  keywords?: string[];
  /**
   * Handler zwraca text do insert w composer position.
   * Argumenty: arg string (po slugu, oddzielony spacją, np. "/code ts" → arg = "ts").
   */
  handler: (arg?: string) => string | Promise<string>;
}

class SlashCommandRegistryImpl {
  private _commands: Map<string, SlashCommand> = new Map();
  private _listeners: Set<() => void> = new Set();

  register(cmd: SlashCommand): void {
    if (!cmd.slug || !cmd.label) {
      throw new Error('[Slash] register: slug + label required');
    }
    if (cmd.slug.includes(' ')) {
      throw new Error('[Slash] slug cannot contain space');
    }
    this._commands.set(cmd.slug.toLowerCase(), cmd);
    this._emit();
  }

  unregister(slug: string): boolean {
    const had = this._commands.delete(slug.toLowerCase());
    if (had) this._emit();
    return had;
  }

  get(slug: string): SlashCommand | undefined {
    return this._commands.get(slug.toLowerCase());
  }

  list(): SlashCommand[] {
    return Array.from(this._commands.values()).sort((a, b) => a.slug.localeCompare(b.slug));
  }

  count(): number {
    return this._commands.size;
  }

  /** Match commands by query — slug prefix lub label/keywords substring. */
  search(query: string, limit = 8): SlashCommand[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.list().slice(0, limit);
    const matches: Array<{ cmd: SlashCommand; score: number }> = [];
    for (const cmd of this._commands.values()) {
      let score = 0;
      if (cmd.slug.startsWith(q)) score += 10;
      else if (cmd.slug.includes(q)) score += 5;
      if (cmd.label.toLowerCase().includes(q)) score += 3;
      if (cmd.keywords?.some(k => k.toLowerCase().includes(q))) score += 2;
      if (score > 0) matches.push({ cmd, score });
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map(m => m.cmd);
  }

  /** Parse "/slug arg" — split on first space. */
  parse(input: string): { slug: string; arg?: string } | null {
    if (!input.startsWith('/')) return null;
    const rest = input.slice(1).trim();
    if (!rest) return null;
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx < 0) return { slug: rest.toLowerCase() };
    return {
      slug: rest.slice(0, spaceIdx).toLowerCase(),
      arg: rest.slice(spaceIdx + 1),
    };
  }

  /** Execute command by parsed input. */
  async execute(input: string): Promise<string | null> {
    const parsed = this.parse(input);
    if (!parsed) return null;
    const cmd = this.get(parsed.slug);
    if (!cmd) return null;
    return await cmd.handler(parsed.arg);
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._commands.clear();
    this._listeners.clear();
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Slash] listener error', e); }
    }
  }
}

export const SlashCommandRegistry = new SlashCommandRegistryImpl();

/** Built-in slash commands per #107 AC. */
export function registerBuiltinSlashCommands(): void {
  SlashCommandRegistry.register({
    slug: 'code',
    label: 'Code block',
    description: 'Insert fenced code block z optional language',
    keywords: ['code', 'kod', 'block', 'pre'],
    handler: (lang) => {
      const l = (lang || '').trim();
      return l ? `\`\`\`${l}\n\n\`\`\`` : '```\n\n```';
    },
  });
  SlashCommandRegistry.register({
    slug: 'link',
    label: 'Link',
    description: 'Insert [label](url)',
    keywords: ['link', 'hyperlink', 'url'],
    handler: (url) => {
      const u = (url || '').trim();
      return u ? `[](${u})` : '[label](url)';
    },
  });
  SlashCommandRegistry.register({
    slug: 'quote',
    label: 'Blockquote',
    description: 'Insert blockquote prefix',
    keywords: ['quote', 'cytat', 'blockquote'],
    handler: () => '> ',
  });
  SlashCommandRegistry.register({
    slug: 'divider',
    label: 'Divider / horizontal rule',
    description: 'Insert horizontal rule (---)',
    keywords: ['divider', 'rule', 'hr', 'separator', 'separator'],
    handler: () => '\n---\n',
  });
  SlashCommandRegistry.register({
    slug: 'template',
    label: 'Template',
    description: 'Insert template z biblioteki (placeholder — TODO biblioteka)',
    keywords: ['template', 'szablon'],
    handler: (name) => `[Template: ${name || 'unnamed'} — TODO]`,
  });
  // Bridge commands do #104/#105
  SlashCommandRegistry.register({
    slug: 'snooze',
    label: 'Snooze (bridge do #104)',
    keywords: ['snooze', 'odłóż'],
    handler: () => '',
  });
  SlashCommandRegistry.register({
    slug: 'sendlater',
    label: 'Send Later (bridge do #105)',
    keywords: ['send later', 'wyślij później', 'schedule'],
    handler: () => '',
  });
}
