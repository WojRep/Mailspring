/**
 * Markdown → HTML renderer — bilet MVP #107.
 *
 * Minimal subset wystarczający dla composer:
 *  - Heading: `# H1`, `## H2`, ..., `###### H6`.
 *  - Bold: `**text**`.
 *  - Italic: `_text_`.
 *  - Inline code: `` `code` ``.
 *  - Link: `[label](url)` z URL sanitization.
 *  - Blockquote: `> text`.
 *  - Fenced code block: ``` ```lang\ncode\n``` ``` (highlight.js wire-up odłożone — tutaj `<pre><code class="lang-X">`).
 *  - Horizontal rule: `---` lub `***`.
 *  - Paragraph (double newline split).
 *
 * NOT supported: lists (TODO), images, tables, footnotes, autolinks, raw HTML.
 *
 * Bezpieczeństwo: URL sanitization — odrzuca `javascript:`, `data:` (z wyjątkiem image/*), `vbscript:`.
 * HTML escape we wszystkich text nodach.
 */

export interface RenderResult {
  html: string;
  /** Plain text fallback dla multipart/alternative. */
  plainText: string;
}

const URL_BLACKLIST = /^(javascript|vbscript):/i;

export function renderMarkdown(md: string): RenderResult {
  if (!md) return { html: '', plainText: '' };
  const blocks = md.replace(/\r\n/g, '\n').split(/\n\n+/);
  const htmlBlocks: string[] = [];
  const plainBlocks: string[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trimEnd();
    if (!block.trim()) continue;
    // Fenced code block
    const fenced = block.match(/^```(\w*)\n([\s\S]*?)\n```$/);
    if (fenced) {
      const lang = escapeHtml(fenced[1] || '');
      const code = escapeHtml(fenced[2]);
      const classAttr = lang ? ` class="lang-${lang}"` : '';
      htmlBlocks.push(`<pre><code${classAttr}>${code}</code></pre>`);
      plainBlocks.push(fenced[2]);
      continue;
    }
    // Heading
    const heading = block.match(/^(#{1,6})\s+(.*)$/m);
    if (heading && !block.includes('\n')) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      htmlBlocks.push(`<h${level}>${text}</h${level}>`);
      plainBlocks.push(stripInline(heading[2]));
      continue;
    }
    // Horizontal rule
    if (/^[-*]{3,}$/.test(block)) {
      htmlBlocks.push('<hr/>');
      plainBlocks.push('---');
      continue;
    }
    // Blockquote (multi-line `>` prefix)
    if (/^>\s/.test(block)) {
      const lines = block.split('\n').map(l => l.replace(/^>\s?/, ''));
      const inner = renderInline(lines.join(' '));
      htmlBlocks.push(`<blockquote>${inner}</blockquote>`);
      plainBlocks.push(lines.map(l => `> ${l}`).join('\n'));
      continue;
    }
    // Paragraph
    const para = block.split('\n').map(l => renderInline(l)).join('<br/>');
    htmlBlocks.push(`<p>${para}</p>`);
    plainBlocks.push(stripInline(block));
  }

  return {
    html: htmlBlocks.join('\n'),
    plainText: plainBlocks.join('\n\n'),
  };
}

export function renderInline(text: string): string {
  let s = escapeHtml(text);
  // Inline code FIRST (zapobiega match'om wewnątrz)
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic (single _underscore_, no inner spaces wymóg)
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Link: [label](url) z URL sanitization
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return label;
    return `<a href="${safeUrl}">${label}</a>`;
  });
  return s;
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (URL_BLACKLIST.test(trimmed)) return '';
  if (/^data:/i.test(trimmed)) {
    // data: dozwolone tylko dla obrazów
    return /^data:image\//i.test(trimmed) ? escapeAttr(trimmed) : '';
  }
  return escapeAttr(trimmed);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
