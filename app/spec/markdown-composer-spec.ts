/**
 * Bilet MVP #107 — Markdown renderer + Slash command registry unit tests.
 */

import {
  renderMarkdown,
  renderInline,
  sanitizeUrl,
} from '../internal_packages/markdown-composer/lib/markdown-renderer';
import {
  SlashCommandRegistry,
  registerBuiltinSlashCommands,
} from '../internal_packages/markdown-composer/lib/slash-command-registry';

describe('Markdown composer — bilet MVP #107', () => {

  describe('renderInline', () => {
    it('bold **text**', () => {
      expect(renderInline('Hello **world**')).toBe('Hello <strong>world</strong>');
    });

    it('italic _text_', () => {
      expect(renderInline('_emphasis_')).toBe('<em>emphasis</em>');
    });

    it('inline code', () => {
      expect(renderInline('`x = 1`')).toBe('<code>x = 1</code>');
    });

    it('link [label](url)', () => {
      expect(renderInline('[click](https://x.com)')).toBe('<a href="https://x.com">click</a>');
    });

    it('escapes HTML in text', () => {
      expect(renderInline('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });

    it('combines bold + link', () => {
      const out = renderInline('**[link](https://x.com)**');
      expect(out).toContain('<strong>');
      expect(out).toContain('<a href="https://x.com">link</a>');
    });

    it('URL sanitization — javascript: rejected', () => {
      const out = renderInline('[bad](javascript:alert(1))');
      expect(out).toBe('bad');
      expect(out).not.toContain('javascript');
    });

    it('URL sanitization — vbscript: rejected', () => {
      const out = renderInline('[bad](vbscript:msgbox(1))');
      expect(out).toBe('bad');
    });
  });

  describe('renderMarkdown', () => {
    it('heading H1..H6', () => {
      expect(renderMarkdown('# H1').html).toBe('<h1>H1</h1>');
      expect(renderMarkdown('### H3').html).toBe('<h3>H3</h3>');
      expect(renderMarkdown('###### H6').html).toBe('<h6>H6</h6>');
    });

    it('blockquote', () => {
      const r = renderMarkdown('> Hello\n> World');
      expect(r.html).toContain('<blockquote>');
      expect(r.html).toContain('Hello');
      expect(r.html).toContain('World');
    });

    it('fenced code block z lang', () => {
      const r = renderMarkdown('```ts\nconst x = 1;\n```');
      expect(r.html).toContain('<pre><code class="lang-ts">');
      expect(r.html).toContain('const x = 1;');
    });

    it('fenced code block bez lang', () => {
      const r = renderMarkdown('```\nplain\n```');
      expect(r.html).toContain('<pre><code>plain</code></pre>');
    });

    it('horizontal rule', () => {
      expect(renderMarkdown('---').html).toBe('<hr/>');
      expect(renderMarkdown('***').html).toBe('<hr/>');
    });

    it('paragraph z inline', () => {
      const r = renderMarkdown('Hello **bold** world');
      expect(r.html).toContain('<p>');
      expect(r.html).toContain('<strong>bold</strong>');
    });

    it('multi-paragraph split', () => {
      const r = renderMarkdown('First para\n\nSecond para');
      expect(r.html.match(/<p>/g)?.length).toBe(2);
    });

    it('plainText fallback strips markup', () => {
      const r = renderMarkdown('**bold** _italic_ `code`');
      expect(r.plainText).toBe('bold italic code');
    });

    it('empty input → empty result', () => {
      expect(renderMarkdown('')).toEqual({ html: '', plainText: '' });
    });
  });

  describe('sanitizeUrl', () => {
    it('akceptuje https/http', () => {
      expect(sanitizeUrl('https://x.com')).toBe('https://x.com');
      expect(sanitizeUrl('http://x.com')).toBe('http://x.com');
    });

    it('akceptuje mailto:', () => {
      expect(sanitizeUrl('mailto:bob@x.com')).toBe('mailto:bob@x.com');
    });

    it('odrzuca javascript:', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('odrzuca vbscript:', () => {
      expect(sanitizeUrl('vbscript:msgbox')).toBe('');
    });

    it('odrzuca data:text/html', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('akceptuje data:image/png', () => {
      expect(sanitizeUrl('data:image/png;base64,AAA')).toBeTruthy();
    });
  });
});

describe('Slash command registry — bilet MVP #107', () => {

  beforeEach(() => {
    SlashCommandRegistry._reset();
  });

  describe('register / unregister / list', () => {
    it('register wymaga slug + label', () => {
      expect(() => SlashCommandRegistry.register({ slug: '', label: 'X', handler: () => '' }))
        .toThrowError(/slug \+ label/);
    });

    it('register odrzuca slug ze spacją', () => {
      expect(() => SlashCommandRegistry.register({ slug: 'has space', label: 'X', handler: () => '' }))
        .toThrowError(/cannot contain space/);
    });

    it('register + get case-insensitive', () => {
      SlashCommandRegistry.register({ slug: 'TaG', label: 'Tag', handler: () => '' });
      expect(SlashCommandRegistry.get('tag')?.label).toBe('Tag');
      expect(SlashCommandRegistry.get('TAG')?.label).toBe('Tag');
    });

    it('list sortuje po slug', () => {
      SlashCommandRegistry.register({ slug: 'zeta', label: 'Z', handler: () => '' });
      SlashCommandRegistry.register({ slug: 'alpha', label: 'A', handler: () => '' });
      const slugs = SlashCommandRegistry.list().map(c => c.slug);
      expect(slugs).toEqual(['alpha', 'zeta']);
    });

    it('unregister', () => {
      SlashCommandRegistry.register({ slug: 'x', label: 'X', handler: () => '' });
      expect(SlashCommandRegistry.unregister('x')).toBe(true);
      expect(SlashCommandRegistry.unregister('x')).toBe(false);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registerBuiltinSlashCommands();
    });

    it('empty query → wszystkie', () => {
      expect(SlashCommandRegistry.search('').length).toBeGreaterThanOrEqual(7);
    });

    it('prefix match scoring (highest)', () => {
      const results = SlashCommandRegistry.search('co');
      expect(results[0].slug).toBe('code');
    });

    it('label match', () => {
      const results = SlashCommandRegistry.search('Blockquote');
      expect(results[0].slug).toBe('quote');
    });

    it('keyword match', () => {
      const results = SlashCommandRegistry.search('cytat');
      expect(results[0].slug).toBe('quote');
    });

    it('respektuje limit', () => {
      expect(SlashCommandRegistry.search('', 3).length).toBe(3);
    });
  });

  describe('parse', () => {
    it('parse "/slug"', () => {
      expect(SlashCommandRegistry.parse('/code')).toEqual({ slug: 'code' });
    });

    it('parse "/slug arg"', () => {
      expect(SlashCommandRegistry.parse('/code ts')).toEqual({ slug: 'code', arg: 'ts' });
    });

    it('parse case insensitive slug', () => {
      expect(SlashCommandRegistry.parse('/CODE ts')?.slug).toBe('code');
    });

    it('parse multi-word arg', () => {
      expect(SlashCommandRegistry.parse('/link https://x.com')?.arg).toBe('https://x.com');
    });

    it('parse bez "/" → null', () => {
      expect(SlashCommandRegistry.parse('code')).toBeNull();
    });

    it('parse "/" sam → null', () => {
      expect(SlashCommandRegistry.parse('/')).toBeNull();
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      registerBuiltinSlashCommands();
    });

    it('/code ts → fenced block z lang', async () => {
      const out = await SlashCommandRegistry.execute('/code ts');
      expect(out).toBe('```ts\n\n```');
    });

    it('/code bez lang', async () => {
      const out = await SlashCommandRegistry.execute('/code');
      expect(out).toBe('```\n\n```');
    });

    it('/quote → blockquote prefix', async () => {
      expect(await SlashCommandRegistry.execute('/quote')).toBe('> ');
    });

    it('/divider → HR', async () => {
      expect(await SlashCommandRegistry.execute('/divider')).toBe('\n---\n');
    });

    it('/link url', async () => {
      expect(await SlashCommandRegistry.execute('/link https://x.com')).toBe('[](https://x.com)');
    });

    it('/link bez url → template', async () => {
      expect(await SlashCommandRegistry.execute('/link')).toBe('[label](url)');
    });

    it('nieznany command → null', async () => {
      expect(await SlashCommandRegistry.execute('/nope')).toBeNull();
    });
  });

  describe('builtin commands', () => {
    it('rejestruje 7 builtin commands (code/link/quote/divider/template/snooze/sendlater)', () => {
      registerBuiltinSlashCommands();
      expect(SlashCommandRegistry.count()).toBe(7);
      expect(SlashCommandRegistry.get('code')).toBeTruthy();
      expect(SlashCommandRegistry.get('link')).toBeTruthy();
      expect(SlashCommandRegistry.get('quote')).toBeTruthy();
      expect(SlashCommandRegistry.get('divider')).toBeTruthy();
      expect(SlashCommandRegistry.get('template')).toBeTruthy();
      expect(SlashCommandRegistry.get('snooze')).toBeTruthy();
      expect(SlashCommandRegistry.get('sendlater')).toBeTruthy();
    });
  });

  describe('listen', () => {
    it('emit na register/unregister', () => {
      let n = 0;
      const unsub = SlashCommandRegistry.listen(() => n++);
      SlashCommandRegistry.register({ slug: 'x', label: 'X', handler: () => '' });
      SlashCommandRegistry.unregister('x');
      expect(n).toBe(2);
      unsub();
    });
  });
});
