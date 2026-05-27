/**
 * List-Unsubscribe header parser — bilet MVP #115.
 *
 * RFC 2369 List-Unsubscribe header:
 *   List-Unsubscribe: <mailto:unsub@example.com>, <https://example.com/unsub?id=abc>
 *
 * RFC 8058 List-Unsubscribe-Post one-click:
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * Parser extracts mailto + HTTP URL + one-click flag.
 */

export interface UnsubscribeInfo {
  /** mailto: URL (preferred dla automation). */
  mailto?: string;
  /** HTTP(s) URL — wymaga external browser open. */
  httpUrl?: string;
  /** RFC 8058 one-click — POST do httpUrl bez confirmation page. */
  oneClick: boolean;
}

/**
 * Parse `List-Unsubscribe` header value (z optional `List-Unsubscribe-Post`).
 *
 * Returns null gdy żaden valid URL nie znaleziony.
 */
export function parseListUnsubscribe(
  listUnsubscribeValue: string | undefined,
  listUnsubscribePostValue?: string | undefined,
): UnsubscribeInfo | null {
  if (!listUnsubscribeValue) return null;

  // RFC 2369: comma-separated `<URL>` entries
  const urlMatches = listUnsubscribeValue.matchAll(/<([^>]+)>/g);
  let mailto: string | undefined;
  let httpUrl: string | undefined;

  for (const m of urlMatches) {
    const url = m[1].trim();
    if (url.toLowerCase().startsWith('mailto:')) {
      if (!mailto) mailto = url;
    } else if (/^https?:\/\//i.test(url)) {
      if (!httpUrl) httpUrl = url;
    }
  }

  if (!mailto && !httpUrl) return null;

  // RFC 8058 one-click detection
  const oneClick = /List-Unsubscribe=One-Click/i.test(listUnsubscribePostValue || '');

  return { mailto, httpUrl, oneClick };
}

/**
 * Extract sender email z parsed mailto URL.
 *
 * `mailto:unsub@example.com?subject=foo` → `unsub@example.com`.
 */
export function extractMailtoAddress(mailto: string): string | null {
  if (!mailto.toLowerCase().startsWith('mailto:')) return null;
  const rest = mailto.slice(7); // strip 'mailto:'
  const qIdx = rest.indexOf('?');
  const addr = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  return addr.trim() || null;
}
