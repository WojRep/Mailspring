/**
 * RFC 8098 MDN (Message Disposition Notification) — bilet MVP #111.
 *
 * Standard read receipt mechanism — NIE invisible tracking pixel.
 * Composer dodaje header `Disposition-Notification-To: sender@example.com`.
 * Recipient widzi dialog "Sender requested read receipt — send?" → manual decision.
 *
 * Tu pure functions:
 *  - buildMdnHeader(senderEmail) → header string.
 *  - detectMdnRequest(headersMap) → senderEmail | null.
 *  - buildMdnResponse(originalMessageId, recipientEmail, disposition) → multipart MDN body.
 */

export type MdnDisposition = 'displayed' | 'deleted' | 'denied';

export interface MdnRequestInfo {
  senderEmail: string;
  /** Original Message-ID header value. */
  originalMessageId?: string;
}

/** Composer: build header dla outgoing message. */
export function buildMdnHeader(senderEmail: string): { name: string; value: string } {
  if (!senderEmail || !senderEmail.includes('@')) {
    throw new Error('[MDN] buildMdnHeader: valid sender email required');
  }
  return {
    name: 'Disposition-Notification-To',
    value: senderEmail.trim(),
  };
}

/** Reading pane: wykryj MDN request w incoming headers. */
export function detectMdnRequest(headers: Record<string, string>): MdnRequestInfo | null {
  // Headers case-insensitive — normalize keys
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v;
  }
  const target = normalized['disposition-notification-to'];
  if (!target) return null;
  const email = target.trim();
  if (!email.includes('@')) return null;
  return {
    senderEmail: email,
    originalMessageId: normalized['message-id'],
  };
}

/**
 * Build RFC 8098 multipart/report MDN response body.
 *
 * disposition:
 *  - 'displayed' — user widział, send receipt.
 *  - 'deleted'   — user usunął bez display.
 *  - 'denied'    — user explicitly odmówił.
 */
export function buildMdnResponse(input: {
  originalMessageId: string;
  recipientEmail: string;
  senderEmail: string;
  disposition: MdnDisposition;
}): string {
  const lines: string[] = [];
  lines.push('Content-Type: multipart/report; report-type=disposition-notification; boundary="mdn_boundary"');
  lines.push(`To: ${input.senderEmail}`);
  lines.push(`From: ${input.recipientEmail}`);
  lines.push('Subject: Disposition notification');
  lines.push('');
  lines.push('--mdn_boundary');
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('');
  lines.push(`This is a notification that the message ${input.originalMessageId} was ${input.disposition}.`);
  lines.push('');
  lines.push('--mdn_boundary');
  lines.push('Content-Type: message/disposition-notification');
  lines.push('');
  lines.push(`Reporting-UA: ActunaMail; (electron)`);
  lines.push(`Original-Recipient: rfc822;${input.recipientEmail}`);
  lines.push(`Final-Recipient: rfc822;${input.recipientEmail}`);
  lines.push(`Original-Message-ID: ${input.originalMessageId}`);
  lines.push(`Disposition: manual-action/MDN-sent-manually; ${input.disposition}`);
  lines.push('');
  lines.push('--mdn_boundary--');
  return lines.join('\r\n');
}
