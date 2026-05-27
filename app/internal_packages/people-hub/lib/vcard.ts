/**
 * vCard 3.0 + 4.0 parser + serializer — RFC 2426 / RFC 6350.
 *
 * Minimal subset:
 *  - FN (formatted name) — required.
 *  - N (structured name: family;given;additional;prefix;suffix).
 *  - EMAIL (multi).
 *  - TEL (multi).
 *  - ORG.
 *  - TITLE.
 *  - NOTE.
 *  - URL.
 *
 * Quoted-printable / base64 photos — odłożone.
 */

export interface VCardEmail {
  value: string;
  /** TYPE param: home/work/etc. */
  type?: string;
}

export interface VCardTel {
  value: string;
  type?: string;
}

export interface VCard {
  version: '3.0' | '4.0';
  /** FN — formatted name (required). */
  fn: string;
  /** N — structured name parts (family;given;additional;prefix;suffix). */
  n?: {
    family?: string;
    given?: string;
    additional?: string;
    prefix?: string;
    suffix?: string;
  };
  emails: VCardEmail[];
  tels: VCardTel[];
  org?: string;
  title?: string;
  note?: string;
  url?: string;
}

/** Parse single vCard. Throws on malformed. */
export function parseVCard(text: string): VCard {
  const lines = unfoldLines(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (!lines[0] || !/^BEGIN:VCARD$/i.test(lines[0])) {
    throw new Error('[vCard] missing BEGIN:VCARD');
  }
  if (!lines[lines.length - 1] || !/^END:VCARD$/i.test(lines[lines.length - 1])) {
    throw new Error('[vCard] missing END:VCARD');
  }

  const card: VCard = {
    version: '3.0',
    fn: '',
    emails: [],
    tels: [],
  };

  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const headPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [propName, ...paramParts] = headPart.split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eqIdx = p.indexOf('=');
      if (eqIdx > 0) {
        params[p.slice(0, eqIdx).toUpperCase()] = p.slice(eqIdx + 1);
      } else {
        params.TYPE = params.TYPE ? `${params.TYPE},${p}` : p;
      }
    }
    const prop = propName.toUpperCase();
    switch (prop) {
      case 'VERSION':
        if (value === '4.0' || value === '3.0') card.version = value;
        break;
      case 'FN':
        card.fn = unescapeValue(value);
        break;
      case 'N': {
        const parts = value.split(';');
        card.n = {
          family: unescapeValue(parts[0] || ''),
          given: unescapeValue(parts[1] || ''),
          additional: unescapeValue(parts[2] || ''),
          prefix: unescapeValue(parts[3] || ''),
          suffix: unescapeValue(parts[4] || ''),
        };
        break;
      }
      case 'EMAIL':
        card.emails.push({ value: unescapeValue(value), type: params.TYPE });
        break;
      case 'TEL':
        card.tels.push({ value: unescapeValue(value), type: params.TYPE });
        break;
      case 'ORG':
        card.org = unescapeValue(value);
        break;
      case 'TITLE':
        card.title = unescapeValue(value);
        break;
      case 'NOTE':
        card.note = unescapeValue(value);
        break;
      case 'URL':
        card.url = unescapeValue(value);
        break;
    }
  }

  if (!card.fn && card.n) {
    card.fn = [card.n.given, card.n.family].filter(Boolean).join(' ').trim();
  }
  if (!card.fn) throw new Error('[vCard] FN required (or derivable from N)');

  return card;
}

/** Parse multiple vCards (concatenated). */
export function parseVCards(text: string): VCard[] {
  const out: VCard[] = [];
  const blocks = text.split(/(?=BEGIN:VCARD)/i);
  for (const block of blocks) {
    if (!/BEGIN:VCARD/i.test(block)) continue;
    try {
      out.push(parseVCard(block));
    } catch (e) {
      console.error('[vCard] skip invalid card:', e);
    }
  }
  return out;
}

/** Serialize single vCard. */
export function serializeVCard(card: VCard): string {
  const lines: string[] = ['BEGIN:VCARD', `VERSION:${card.version}`];
  lines.push(`FN:${escapeValue(card.fn)}`);
  if (card.n) {
    lines.push(`N:${escapeValue(card.n.family || '')};${escapeValue(card.n.given || '')};${escapeValue(card.n.additional || '')};${escapeValue(card.n.prefix || '')};${escapeValue(card.n.suffix || '')}`);
  }
  for (const e of card.emails) {
    const typeParam = e.type ? `;TYPE=${e.type}` : '';
    lines.push(`EMAIL${typeParam}:${escapeValue(e.value)}`);
  }
  for (const t of card.tels) {
    const typeParam = t.type ? `;TYPE=${t.type}` : '';
    lines.push(`TEL${typeParam}:${escapeValue(t.value)}`);
  }
  if (card.org) lines.push(`ORG:${escapeValue(card.org)}`);
  if (card.title) lines.push(`TITLE:${escapeValue(card.title)}`);
  if (card.note) lines.push(`NOTE:${escapeValue(card.note)}`);
  if (card.url) lines.push(`URL:${escapeValue(card.url)}`);
  lines.push('END:VCARD');
  return lines.map(foldLine).join('\r\n');
}

/** Serialize multiple cards. */
export function serializeVCards(cards: VCard[]): string {
  return cards.map(serializeVCard).join('\r\n');
}

// === internals ===

function unfoldLines(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = i === 0 ? line.slice(0, 75) : ' ' + line.slice(i, i + 74);
    out.push(chunk);
    i += chunk.length - (i === 0 ? 0 : 1);
  }
  return out.join('\r\n');
}

function escapeValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function unescapeValue(v: string): string {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      const next = v[i + 1];
      if (next === 'n' || next === 'N') { out += '\n'; i++; }
      else if (next === ',' || next === ';' || next === '\\') { out += next; i++; }
      else { out += v[i]; }
    } else {
      out += v[i];
    }
  }
  return out;
}
