# Actuna Mail

> Email client for the EU. Privacy promises that hold up under audit.

**Actuna Mail** is a desktop email client for macOS, Windows, and Linux, built for individuals and organizations operating under European data protection law. It is a fork of [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) at version 1.21.0.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE.md)
[![Status: pre-alpha](https://img.shields.io/badge/Status-pre--alpha-orange.svg)](#status)
[![Compliance: GDPR · AI Act · KNF · NIS2](https://img.shields.io/badge/Compliance-GDPR%20·%20AI%20Act%20·%20KNF%20·%20NIS2-green.svg)](COMPLIANCE.md)

---

## Why another fork of Mailspring?

Mailspring is a fast, beautiful, open-source email client. We use it. We respect the work Foundry 376 has put into it. But there is a gap between what its [SECURITY.md](https://github.com/Foundry376/Mailspring/blob/master/SECURITY.md) promises and what its code does.

Mailspring's SECURITY.md says, in three sentences:

1. *"your email credentials are stored securely in your system keychain"*
2. *"Mailspring does not transmit, store or process your mail in the cloud"*
3. *"choosing to skip Mailspring ID prevents your data from being transmitted off your machine entirely"*

We audited Mailspring 1.21.0 line by line. Statement #1 is true. Statements #2 and #3 are not — at least, not as the user reads them. The default install of Mailspring contacts at minimum:

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

That is **ten distinct egress channels** to servers in the United States. Several of them carry data of third parties (your contacts, your recipients) who never consented. Under GDPR Article 6 — and in Poland, under the Polish Personal Data Protection Act and the Office for Personal Data Protection (UODO) — that is at minimum a transparency failure (Articles 13, 25), and at points a lawful-basis failure (Articles 6, 7, 28, 32, 44+).

We don't believe Foundry 376 set out to mislead anyone. The leaks have grown organically over years of feature development — Sentry was added for crash debugging, Gravatar for visual polish, Plugin Metadata Sync for the Pro tier. Each one made sense individually. The resulting whole no longer matches the SECURITY.md.

We forked to deliver the experience the SECURITY.md describes — for users who have to.

## Who is this for

- Law firms, accounting firms, tax advisory practices in Poland and the EU operating under GDPR.
- Financial-sector employees subject to **KNF Recommendation D / Recommendation Z**.
- Operators of essential and important entities under **NIS2** (Polish Krajowy System Cyberbezpieczeństwa 2.0).
- Organizations that want to use AI in email workflows without falling under **AI Act** Article 6 / Annex III scope unintentionally.
- Privacy-conscious individuals who want a working email client whose privacy posture they can verify.

## What we change vs upstream Mailspring

In a single line: **we cut every default channel that ships your data, your metadata, or your contacts' data to a third party.** Specifics in [COMPLIANCE.md](COMPLIANCE.md). Branch: `compliance/v0.1`.

| Channel | Status in Mailspring 1.21.0 | Status in Actuna Mail v0.1 |
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

What we **keep**:

- All mail core functionality: IMAP, SMTP, CalDAV, CardDAV.
- Gmail, Microsoft 365, iCloud, Outlook, Yahoo, generic IMAP support.
- OAuth flows (`accounts.google.com`, `login.microsoftonline.com`, `graph.microsoft.com`).
- Local SQLite database, full-text search, threading, conversation view.
- Mailspring's UI, themes, unified inbox, snooze (local), templates (local), spell check (local).
- Plugin SDK for users who want to extend, as long as plugins respect Actuna's egress policy.

Actuna Mail's binary is GPL-3.0, the same license as Mailspring. The work to harden it for compliance is a small fraction of Mailspring's overall codebase — credit for the email client itself goes to [Foundry 376](https://github.com/Foundry376) and the contributors of Mailspring.

## Architecture

Actuna Mail follows a three-layer architecture:

```
┌─────────────────────────────────────────────────┐
│  Actuna Mail (this repository)         GPL-3.0  │
│  - Sterilized fork of Mailspring 1.21.0         │
│  - No third-party data egress by default        │
│  - Plugin SDK preserved                         │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/IPC
                   ▼
┌─────────────────────────────────────────────────┐
│  Actuna Mail Engine                  proprietary│
│  - Local AI router (Claude / Codex CLI)         │
│  - Polish prompt library                        │
│  - License validation                           │
│  - Optional opt-in telemetry                    │
└──────────────────┬──────────────────────────────┘
                   │ subprocess
                   ▼
       claude / codex CLI on the user's machine
       (user's own subscription, not an API key)
```

The Engine layer is **not** part of this repository and **does not** import from this repository. It communicates over a stable HTTP/IPC interface, which keeps the GPL boundary clean.

## Compliance posture

Detailed in [COMPLIANCE.md](COMPLIANCE.md). Summary:

| Framework | Coverage in v0.1 |
|---|---|
| **GDPR / RODO** (EU 2016/679 + PL ust. o ochr. dan. osob.) | Article 5 (data minimization), Article 6 (lawful basis), Article 7 (consent), Article 13/14 (transparency), Article 25 (privacy by design and default), Article 32 (security), Article 44+ (third-country transfers — Schrems II) |
| **AI Act** (EU 2024/1689) | Article 50 (transparency for AI-generated content) — applies once Engine ships in v0.2 |
| **KNF Recommendation D and Z** | Recommendation D (IT governance), Recommendation Z (outsourcing risk) |
| **NIS2** (EU 2022/2555 + PL Krajowy System Cyberbezpieczeństwa 2.0) | Article 21 (risk-management measures, supply chain), Article 23 (incident reporting basis) |

Storage encryption (SQLCipher for `MessageBody` and the FTS index) is on the roadmap for v0.2. Today's v0.1 inherits Mailspring's plain SQLite — protected by FileVault / BitLocker / LUKS at the volume level.

## Status

- **v0.1 (`compliance/v0.1`)** — sterilization patches. Pre-alpha. Build artifact not yet shipped.
- **v0.2** — Actuna Engine integration (Claude / Codex routing), SQLCipher for `MessageBody` and FTS index.
- **v0.3** — branding, packaging, code signing, notarization, own update channel.
- **v1.0** — public launch.

This repository contains the audit packs that drove every change. The audit lives in the parent project — see the audit notes referenced from [SECURITY.md](SECURITY.md).

## Contributing

We are not accepting external pull requests during pre-alpha. The audit work is reproducible from the documentation linked in [SECURITY.md](SECURITY.md) — independent verification is welcome at `tech@actuna.pl`.

## Credits and license

- This is a fork of [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring), © Foundry 376 LLC, GPL-3.0. The underlying email client is the foundation of this work.
- The mail sync engine [Foundry376/Mailspring-Sync](https://github.com/Foundry376/Mailspring-Sync) (vendored as a submodule) is also © Foundry 376, GPL-3.0.
- All modifications in `compliance/v0.1` and beyond are © Actuna, licensed under GPL-3.0.
- The full text of GPL-3.0 is in [LICENSE.md](LICENSE.md).
- "Mailspring" is a trademark of Foundry 376 LLC. We do not use the Mailspring name or logo on Actuna Mail builds. The references in this README are descriptive, in compliance with nominative fair use.

## Contact

- Audit and compliance: `tech@actuna.pl`
- Responsible disclosure: see [SECURITY.md](SECURITY.md)

---

*Mailspring is a great email client. Actuna Mail is the version of Mailspring that the SECURITY.md said we already had.*
