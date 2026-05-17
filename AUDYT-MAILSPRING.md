# Audit — Mailspring 1.21.0

**English** · [Polski](AUDYT-MAILSPRING.pl.md)

This document records the line-by-line security audit of
[Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) 1.21.0 that
motivated the Actuna Mail fork. The summary lives in the project
[README.md](README.md); the detail lives here.

## The gap between SECURITY.md and the code

Mailspring is a fast, beautiful, open-source email client. We use it. We
respect the work Foundry 376 has put into it. But there is a gap between what
its [SECURITY.md](https://github.com/Foundry376/Mailspring/blob/master/SECURITY.md)
promises and what its code does.

Mailspring's SECURITY.md says, in three sentences:

1. *"your email credentials are stored securely in your system keychain"*
2. *"Mailspring does not transmit, store or process your mail in the cloud"*
3. *"choosing to skip Mailspring ID prevents your data from being transmitted off your machine entirely"*

We audited Mailspring 1.21.0 line by line. Statement #1 is true. Statements #2
and #3 are not — at least, not as the user reads them. The default install of
Mailspring contacts at minimum:

- **Sentry (USA)** — every error report, with stack traces, plugin IDs, and a SHA-256 of your MAC address as device fingerprint. Hardcoded DSN, no opt-out, no consent, no DPA.
- **Native crash reporter (USA)** — minidumps of process memory, on every crash, sent to `id.getmailspring.com/report-crash`. Memory may include passwords, tokens, draft emails.
- **`id.getmailspring.com/onboarding`** — webview that loads on first launch, **before** the user clicks "Skip".
- **Newsletter signup** — `componentDidMount` calls `POST /newsletter`. No opt-in checkbox.
- **Gravatar (Automattic, USA)** — `https://www.gravatar.com/avatar/<sha256(email)>` for every contact rendered. Each request leaks the corresponding contact's email to a third party.
- **`logo.getmailspring.com`** — company logos in signatures, looked up by user's email domain.
- **Plugin Metadata Sync** — `id.getmailspring.com/metadata/...` and a long-lived HTTP stream `/deltas/.../streaming?ih=<your-imap-host>`. For Pro features (snooze, send-later, tracking, sharing). Includes IP addresses of recipients (open/click tracking) and your IMAP host as a URL parameter.
- **Identity polling** — `/api/me` every 10 minutes for the lifetime of the app.
- **Send Feature Usage Event** — every Pro feature use, even on the Basic plan.

Plus two more uncovered in our deeper C++ audit:

- **`/api/resolve-dav-hosts`** — sends `{ domain, imapHost }` when adding accounts with CardDAV/CalDAV, **even with no Mailspring ID**.
- **`/ping`** in install-check mode.

That is **ten distinct egress channels** to servers in the United States.
Several of them carry data of third parties (your contacts, your recipients)
who never consented. Under GDPR Article 6 — and in Poland, under the Polish
Personal Data Protection Act and the Office for Personal Data Protection
(UODO) — that is at minimum a transparency failure (Articles 13, 25), and at
points a lawful-basis failure (Articles 6, 7, 28, 32, 44+).

We don't believe Foundry 376 set out to mislead anyone. The leaks have grown
organically over years of feature development — Sentry was added for crash
debugging, Gravatar for visual polish, Plugin Metadata Sync for the Pro tier.
Each one made sense individually. The resulting whole no longer matches the
SECURITY.md. We forked to deliver the experience the SECURITY.md describes —
for users who have to.

## What we change vs upstream Mailspring

In a single line: **we cut every default channel that ships your data, your
metadata, or your contacts' data to a third party.** Specifics in
[COMPLIANCE.md](COMPLIANCE.md).

| Channel | Status in Mailspring 1.21.0 | Status in Actuna Mail |
|---|---|---|
| Sentry error reporting | Hardcoded, no opt-out | Removed |
| Native crash reporter (`id.getmailspring.com/report-crash`) | Always on | Removed |
| Auto-newsletter signup | Auto-subscribe in `componentDidMount` | Removed |
| Gravatar lookup for every contact | Always on | Removed (local fallback) |
| `logo.getmailspring.com` company logo | Always on in signatures | Removed |
| Plugin Metadata Sync (Pro features) | Always on with Mailspring ID | Removed (no Mailspring ID concept) |
| Identity polling `/api/me` every 10 min | Always on with ID | Removed |
| `SendFeatureUsageEventTask` per feature use | Always on | Removed |
| `/api/resolve-dav-hosts` (mailsync C++) | Auto on CardDAV/CalDAV setup | Removed (manual config) |
| `/ping` install-check (mailsync C++) | On Test button | Removed |
| Mailspring ID account & onboarding webview | Default flow | Completely removed |
| Auto-update channel `updates.getmailspring.com` | Default | Disabled until our own channel ships |
| 8 plugins requiring Mailspring ID | Default available | Removed (activity, link/open-tracking, participant-profile, send-reminders, thread-sharing, thread-snooze, translation) |
| `composer-grammar-check` (sends drafts to LanguageTool via Foundry) | Default off, opt-in | Removed |

The egress posture is re-verified empirically after every release — see the
runtime egress regression reports under `verification/`.
