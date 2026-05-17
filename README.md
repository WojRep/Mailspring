# Actuna Mail

> Email client for the EU. Privacy promises that hold up under audit.

**Actuna Mail** is a desktop email client for macOS, Windows, and Linux, built for individuals and organizations operating under European data protection law. It is a fork of [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) at version 1.21.0.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE.md)
[![Status: pre-alpha](https://img.shields.io/badge/Status-pre--alpha-orange.svg)](#status)
[![Compliance: GDPR · AI Act · KNF · NIS2](https://img.shields.io/badge/Compliance-GDPR%20·%20AI%20Act%20·%20KNF%20·%20NIS2-green.svg)](COMPLIANCE.md)

**English** · [Polski](README.pl.md)

---

## Goal

**Actuna Mail** is a compliance-hardened fork of Mailspring 1.21.0. We audited Mailspring line by line, cut every default channel that ships your data, your metadata, or your contacts' data to a third party, and added encryption at rest for the database and attachments.

The goal is an email client whose privacy posture matches what its documentation claims — one that holds up under audit by a law firm, an accounting practice, or a financial-sector compliance officer.

The full audit of what Mailspring 1.21.0 actually does — ten egress channels, the gap against Mailspring's own SECURITY.md, and a channel-by-channel comparison — is in **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)**.

## Who is this for

- Law firms, accounting firms, tax advisory practices in Poland and the EU operating under GDPR.
- Financial-sector employees subject to **KNF Recommendation D / Recommendation Z**.
- Operators of essential and important entities under **NIS2** (Polish Krajowy System Cyberbezpieczeństwa 2.0).
- Organizations that want to use AI in email workflows without falling under **AI Act** Article 6 / Annex III scope unintentionally.
- Privacy-conscious individuals who want a working email client whose privacy posture they can verify.

## Security at a glance

| Security area | Mailspring 1.21.0 | Actuna Mail |
|---|---|---|
| Default third-party egress | 10 channels to US servers (Sentry, crash reporter, Gravatar, metadata sync, identity polling…) | None — every channel removed |
| Database encryption at rest | None — plain SQLite | SQLCipher (AES-256-CBC + HMAC), default-on |
| Attachment encryption at rest | None — plaintext files | AES-256-GCM per file |
| Cloud account / Mailspring ID | Default sign-up flow | Removed entirely — no cloud account |
| Crash reports & telemetry | On by default, no consent | Removed |

Full channel-by-channel breakdown: **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)**.

## What we keep

- All mail core functionality: IMAP, SMTP, CalDAV, CardDAV.
- Gmail, Microsoft 365, iCloud, Outlook, Yahoo, generic IMAP support.
- OAuth flows (`accounts.google.com`, `login.microsoftonline.com`, `graph.microsoft.com`).
- Local SQLite database, full-text search, threading, conversation view.
- Mailspring's UI, themes, unified inbox, snooze (local), templates (local), spell check (local).
- Plugin SDK for users who want to extend, as long as plugins respect Actuna's egress policy.

Actuna Mail's binary is GPL-3.0, the same license as Mailspring. The work to harden it for compliance is a small fraction of Mailspring's overall codebase — credit for the email client itself goes to [Foundry 376](https://github.com/Foundry376) and the contributors of Mailspring.

## Documentation

- **[AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)** — line-by-line security audit of Mailspring 1.21.0 and the full list of removed egress channels.
- **[COMPLIANCE.md](COMPLIANCE.md)** — mapping of every change to GDPR / AI Act / KNF / NIS2 articles.
- **[SECURITY.md](SECURITY.md)** — Actuna Mail's own security posture and responsible-disclosure contact.
- **`verification/`** — runtime egress regression reports; the egress posture is re-verified empirically after every release.

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

| Framework | Coverage |
|---|---|
| **GDPR / RODO** (EU 2016/679 + PL ust. o ochr. dan. osob.) | Article 5 (data minimization), Article 6 (lawful basis), Article 7 (consent), Article 13/14 (transparency), Article 25 (privacy by design and default), Article 32 (security), Article 44+ (third-country transfers — Schrems II) |
| **AI Act** (EU 2024/1689) | Article 50 (transparency for AI-generated content) — applies once Engine ships |
| **KNF Recommendation D and Z** | Recommendation D (IT governance), Recommendation Z (outsourcing risk) |
| **NIS2** (EU 2022/2555 + PL Krajowy System Cyberbezpieczeństwa 2.0) | Article 21 (risk-management measures, supply chain), Article 23 (incident reporting basis) |

Storage encryption is implemented: the local database is encrypted with SQLCipher (AES-256-CBC + HMAC) and attachment files with AES-256-GCM — application-layer encryption at rest, default-on for fresh installs. See [SECURITY.md](SECURITY.md).

## Status

Pre-alpha. The repository contains the audit packs that drove every change; the audit lives in the parent project — see the audit notes referenced from [SECURITY.md](SECURITY.md) and [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md).

## Contributing

We are not accepting external pull requests during pre-alpha. The audit work is reproducible from the documentation linked in [SECURITY.md](SECURITY.md) — independent verification is welcome at `tech@actuna.pl`.

## Credits and license

- This is a fork of [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring), © Foundry 376 LLC, GPL-3.0. The underlying email client is the foundation of this work.
- The mail sync engine [Foundry376/Mailspring-Sync](https://github.com/Foundry376/Mailspring-Sync) (vendored as a submodule) is also © Foundry 376, GPL-3.0.
- All modifications by Actuna are licensed under GPL-3.0.
- The full text of GPL-3.0 is in [LICENSE.md](LICENSE.md).
- "Mailspring" is a trademark of Foundry 376 LLC. We do not use the Mailspring name or logo on Actuna Mail builds. The references in this README are descriptive, in compliance with nominative fair use.

## Contact

- Audit and compliance: `tech@actuna.pl`
- Responsible disclosure: see [SECURITY.md](SECURITY.md)

---

*Mailspring is a great email client. Actuna Mail is the version of Mailspring that the SECURITY.md said we already had.*
