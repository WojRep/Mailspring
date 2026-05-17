# Security

**English** · [Polski](SECURITY.pl.md)

## Posture

Actuna Mail is built on a single principle: **the binary you install must not transmit your data, your metadata, or your contacts' data to any third party that you have not knowingly chosen.**

What this means in practice:

1. **Email credentials** (IMAP/SMTP passwords, OAuth refresh tokens) are stored in the operating system's secure credential store — macOS Keychain via Electron's `safeStorage`, Windows Credential Manager, or Linux Secret Service / GNOME Keyring / KWallet. They never leave the credential store except to be passed in-memory to the local `mailsync` subprocess that connects to your mail provider.

2. **Mail content** (message bodies, full-text search index, contacts, calendars) is stored locally in SQLite under the user's application data directory at `~/Library/Application Support/ActunaMail/edgehill.db` (macOS) or platform equivalent. This database is **encrypted at rest with SQLCipher** (AES-256-CBC + HMAC) — Tier A: a random 32-byte key generated at first launch and protected by the OS keychain via Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux GNOME Keyring or KWallet). Encryption is default-on for fresh installs; the renderer and the C++ `mailsync` engine both open the same encrypted database. Tier B (opt-in master password, Argon2id) is tracked as a backlog item.

3. **Attachments** stored as files under `files/` are **encrypted at rest** — AES-256-GCM per file, with a key derived via HKDF-SHA256 from the same SQLCipher DBKey (no separate secret to manage). Both the renderer and the C++ `mailsync` engine read and write the shared `AENC` on-disk format, and inline images / previews / Open / drag-out decrypt transparently. Application-layer encryption at rest covers the database and the attachment files.

4. **No third-party error reporting.** No Sentry. No native crash reporter to remote servers. Crashes are logged locally to disk only. Electron Crashpad and Breakpad are disabled at three layers (renderer code, main process flags, mailsync C++ env).

5. **No third-party visual or behavioural lookups.** No Gravatar. No `logo.getmailspring.com`. No Plugin Metadata Sync. No Identity polling. The Mailspring identity/Foundry layer was removed entirely (the `Identity` store is gutted and returns `null`; `IDENTITY_SERVER` env var passed empty to mailsync).

6. **No auto-update channel.** The user controls when an update is applied. Once Actuna's own update channel ships, it will be opt-in and signed.

7. **No telemetry.** Not now, and not after the optional Actuna Engine ships. If telemetry ever exists, it will be opt-in, off by default, documented in this file, and limited to non-PII performance metrics.

8. **Custom URL schemes are internal.** The renderer uses an `actunamail://` scheme for asset loading and a sibling `actuna-attachment://` scheme that streams decrypted inline images to the message iframe. The `actunamail://ai/...` namespace is reserved for future opt-in deep-links to AI features under AI Act Art. 5/52 constraints.

The full sterilization log — every endpoint removed, every file changed, every line of code patched — is documented in [`COMPLIANCE.md`](COMPLIANCE.md); the per-release history is in [`CHANGELOG.md`](CHANGELOG.md).

## What goes out over the network by default

| Destination | Purpose | When |
|---|---|---|
| Your IMAP / SMTP server | Mail core protocol | While the app is running with active accounts |
| Your CalDAV / CardDAV server | Calendar and contact sync | When configured |
| `accounts.google.com`, `oauth2.googleapis.com` | OAuth refresh for Gmail | When the Gmail account's token expires |
| `login.microsoftonline.com`, `graph.microsoft.com` | OAuth refresh for Microsoft 365 / Outlook | When the M365 token expires |
| `lh3.googleusercontent.com`, `lh*.ggpht.com` | Avatar URLs returned in OAuth responses | When rendering Google avatars that came inline |

That is the full list. There are no other defaults. If your network monitor sees Actuna Mail reaching anything else, that is a bug — please report it.

**Empirical baseline:** the runtime egress regression reports under [`verification/`](verification/) (KROK 5 procedure — a tcpdump capture during a fresh launch, and longer with an active IMAP/SMTP/CardDAV account) confirm **zero hits** to forbidden hosts: `*.getmailspring.com`, `*.sentry.io`, `*.gravatar.com`, `*.wp.com`. The egress posture is re-verified after every release.

## How to verify

Independent verification is the point of this project. We provide:

- The full audit pack — see the project's parent directory at `tech@actuna.pl`.
- Runtime tcpdump scripts (in the audit project) that you can run to confirm zero unauthorized egress.
- A diff against upstream Mailspring 1.21.0.
- Reproducible builds: see the build instructions in this repository's developer documentation.

If something in this document is inconsistent with the binary you installed, the binary is wrong. Please tell us at `tech@actuna.pl` so we can fix it.

## Responsible disclosure

If you believe Actuna Mail has a security vulnerability, please email `tech@actuna.pl` with as much detail as you can provide. Please give us a reasonable window to remediate before publishing details. We will acknowledge within 48 hours during business days.

If you believe a third-party download site is hosting an unofficial build of Actuna Mail under our name, please report it to the same address. Official builds are signed and distributed only from `actuna.pl`.

## Differences from upstream Mailspring SECURITY.md

The upstream Mailspring SECURITY.md, in three sentences, claims:

> 1. *"your email credentials are stored securely in your system keychain"*
> 2. *"Mailspring does not transmit, store or process your mail in the cloud"*
> 3. *"choosing to skip Mailspring ID prevents your data from being transmitted off your machine entirely"*

Statement #1 is true in Mailspring 1.21.0.

Statements #2 and #3 are not true in Mailspring 1.21.0 default install. The full evidence — file path and line number for every contradicting code path — is in [`AUDYT-MAILSPRING.md`](AUDYT-MAILSPRING.md) and the audit pack. We forked specifically to make all three statements true in Actuna Mail.

This is not a criticism of Foundry 376. The leaks accumulated over years of feature development; each one made sense individually. We chose to fork rather than carry that same baggage into a product sold to organizations under GDPR, KNF and NIS2 obligations.

## Release history

Security-relevant changes per release are recorded in [`CHANGELOG.md`](CHANGELOG.md).

---

*Reviewed at each release, and whenever the endpoint table or sterilization layer changes.*
