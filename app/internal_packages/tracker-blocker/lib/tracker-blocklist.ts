/**
 * Tracker domain blocklist — bilet MVP #111.
 *
 * Curated list ~100 znanych tracking hosts (Mailtrack, HubSpot, Mailchimp,
 * Constant Contact, Sendgrid, etc.). Hosts matched via suffix.endsWith() po
 * normalizacji (lowercase + strip protocol/path).
 *
 * Lista bazuje na publicznie znanych pixel/click tracker domains.
 * Source: open-source tracker lists (uBlock Origin email rules).
 */

export const TRACKER_DOMAINS: string[] = [
  // Mailtrack / Mailtracker.io
  'mailtrack.io',
  'mailtracker.io',
  // HubSpot tracking
  'mkto-tracker.com',
  'hubspotlinks.com',
  'hubspotemail.net',
  't.hubspot.com',
  'tracking.hubspot.com',
  // Mailchimp
  'list-manage.com',
  'list-manage1.com',
  'list-manage2.com',
  'mailchimp.com',
  'mc.us4.list-manage.com',
  // Constant Contact
  'constantcontact.com',
  'r20.rs6.net',
  // Sendgrid
  'sendgrid.net',
  'sendgrid.com',
  'sendgrid-link.com',
  'links.sendgrid.com',
  'wf.sendgrid.com',
  // Mailgun
  'mailgun.org',
  'mailgun.com',
  'email.mailgun.com',
  // Active Campaign
  'activehosted.com',
  'activecampaign.com',
  // Marketo
  'marketo.com',
  'mkto-ab310179.com',
  // Pardot (Salesforce)
  'pardot.com',
  'go.pardot.com',
  // Klaviyo
  'klaviyo.com',
  'sendlytics.com',
  // Bananatag
  'bananatag.com',
  'bttrack.com',
  // Yesware
  'yesware.com',
  't.yesware.com',
  // Streak
  'streak.com',
  'mailfoogae.appspot.com',
  // Boomerang
  'boomeranggmail.com',
  // Mixmax
  'mixmax.com',
  't.mixmax.com',
  // Salesforce Marketing Cloud / ExactTarget
  'exacttarget.com',
  'et.com',
  's7.exacttarget.com',
  'click.email.salesforce.com',
  // ConvertKit
  'convertkit.com',
  'convertkit-mail.com',
  'convertkit-mail2.com',
  // Drip
  'getdrip.com',
  'drip.com',
  // Customer.io
  'customer.io',
  'customeriomail.com',
  // SparkPost
  'sparkpostmail.com',
  // Postmark
  'postmarkapp.com',
  // Substack
  'email.substack.com',
  'substackcdn.com',
  // Beehiiv
  'mail.beehiiv.com',
  // Generic open tracking patterns
  'open.convertkit-mail.com',
  'open.mailchimp.com',
  'open.sendgrid.net',
  'l.linklyhq.com',
  // Adobe Marketo
  'mkto-sj330050.com',
  // Litmus
  'litmus.com',
  // Acoustic / IBM Marketing
  'acoustic.com',
  // Iterable
  'links.iterable.com',
  // Customer.io
  'mail.customer.io',
  // Hubspot CTA / form tracking
  'forms.hsforms.com',
  // Mailpoet
  'mailpoet.com',
  // Mailerlite
  'click.mailerlite.com',
  'open.mailerlite.com',
  // Litmus visibility
  'beampulse.com',
  // Drift
  'drift.com',
  // Outfunnel
  'outfunnel.com',
  // Bento
  'sendbento.com',
  // ConvertKit MailerSend
  'mailersend.com',
  'click.email.mailersend.com',
  // Generic single-pixel trackers
  'fmail.imgix.net',
  'open.email.aweber.com',
  'aweber.com',
  // Outlook tracking add-ons
  'tracking-pixel.io',
  // Various 1x1 services
  'mailercheck.com',
  'mailpixel.com',
  'spyemails.com',
  'getnotify.com',
  'didtheyreadit.com',
  'mailtruck.com',
  // ToutApp
  'toutapp.com',
  // SalesLoft
  'salesloft.com',
  'app.salesloft.com',
  // Outreach
  'outreach.io',
  // Reply.io
  'reply.io',
  // EmailAnalytics
  'emailanalytics.com',
  // Bluecore
  'bluecore.com',
  // Privy
  'privy.com',
  // OmniSend
  'omnisend.com',
];

const TRACKER_SET = new Set(TRACKER_DOMAINS.map(d => d.toLowerCase()));

/**
 * Sprawdź czy URL jest tracker:
 *  - Wyciągnij hostname.
 *  - Sprawdź exact match w blocklist.
 *  - Sprawdź czy hostname endsWith jakiegoś tracker domain.
 */
export function isTrackerUrl(url: string): boolean {
  const host = extractHostname(url);
  if (!host) return false;
  if (TRACKER_SET.has(host)) return true;
  for (const tracker of TRACKER_SET) {
    if (host.endsWith('.' + tracker)) return true;
  }
  return false;
}

/** Zwraca matching tracker domain dla URL lub null. */
export function trackerMatch(url: string): string | null {
  const host = extractHostname(url);
  if (!host) return null;
  if (TRACKER_SET.has(host)) return host;
  for (const tracker of TRACKER_SET) {
    if (host.endsWith('.' + tracker)) return tracker;
  }
  return null;
}

function extractHostname(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder.invalid');
    return u.hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

export const TRACKER_DOMAIN_COUNT = TRACKER_DOMAINS.length;
