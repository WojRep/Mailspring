# Security

## Posture

Actuna Mail is built on a single principle: **the binary you install must not transmit your data, your metadata, or your contacts' data to any third party that you have not knowingly chosen.**

What this means in practice for Actuna Mail v0.1:

1. **Email credentials** (IMAP/SMTP passwords, OAuth refresh tokens) are stored in the operating system's secure credential store — macOS Keychain via Electron's `safeStorage`, Windows Credential Manager, or Linux Secret Service / GNOME Keyring / KWallet. They never leave the credential store except to be passed in-memory to the local `mailsync` subprocess that connects to your mail provider.

2. **Mail content** (message bodies, attachments, full-text search index) is stored locally in SQLite under the user's application data directory. v0.1 inherits Mailspring's plain SQLite — at-rest protection is provided by the operating system disk encryption (FileVault, BitLocker, LUKS). v0.2 introduces SQLCipher for the message body and FTS index; this is the work tracked in the roadmap.

3. **No third-party error reporting.** No Sentry. No native crash reporter to remote servers. Crashes are logged locally to disk only.

4. **No third-party visual or behavioural lookups.** No Gravatar. No `logo.getmailspring.com`. No Plugin Metadata Sync. No Identity polling.

5. **No auto-update channel** in v0.1. The user controls when an update is applied. Once Actuna's own update channel ships in v0.3, it will be opt-in and signed.

6. **No telemetry.** Not now, and not after the optional Actuna Engine ships. If telemetry ever exists, it will be opt-in, off by default, documented in this file, and limited to non-PII performance metrics.

The full sterilization log — every endpoint removed, every file changed, every line of code patched — is documented in [`COMPLIANCE.md`](COMPLIANCE.md) and tracked on the `compliance/v0.1` branch.

## What goes out over the network in default v0.1

| Destination | Purpose | When |
|---|---|---|
| Your IMAP / SMTP server | Mail core protocol | While the app is running with active accounts |
| Your CalDAV / CardDAV server | Calendar and contact sync | When configured |
| `accounts.google.com`, `oauth2.googleapis.com` | OAuth refresh for Gmail | When the Gmail account's token expires |
| `login.microsoftonline.com`, `graph.microsoft.com` | OAuth refresh for Microsoft 365 / Outlook | When the M365 token expires |
| `lh3.googleusercontent.com`, `lh*.ggpht.com` | Avatar URLs returned in OAuth responses | When rendering Google avatars that came inline |

That is the full list. There are no other defaults. If your network monitor sees Actuna Mail v0.1 reaching anything else, that is a bug — please report it.

## How to verify

Independent verification is the point of this project. We provide:

- The full audit pack — see the project's parent directory at `tech@actuna.pl`.
- Runtime tcpdump scripts (in the audit project) that you can run to confirm zero unauthorized egress.
- Diff against upstream Mailspring 1.21.0: `git diff 1.21.0..compliance/v0.1`.
- Reproducible builds: see the build instructions in this repository's developer documentation.

If something in this document is inconsistent with the binary you installed, the binary is wrong. Please tell us at `tech@actuna.pl` so we can fix it.

## Responsible disclosure

If you believe Actuna Mail has a security vulnerability, please email `tech@actuna.pl` with as much detail as you can provide. Please give us a reasonable window to remediate before publishing details. We will acknowledge within 48 hours during business days.

If you believe a third-party download site is hosting an unofficial build of Actuna Mail under our name, please report it to the same address. Official builds are signed and distributed only from `actuna.pl` (once v0.3 ships).

## Differences from upstream Mailspring SECURITY.md

The upstream Mailspring SECURITY.md, in three sentences, claims:

> 1. *"your email credentials are stored securely in your system keychain"*
> 2. *"Mailspring does not transmit, store or process your mail in the cloud"*
> 3. *"choosing to skip Mailspring ID prevents your data from being transmitted off your machine entirely"*

Statement #1 is true in Mailspring 1.21.0.

Statements #2 and #3 are not true in Mailspring 1.21.0 default install. The full evidence — file path and line number for every contradicting code path — is documented in our audit. We forked specifically to make all three statements true in Actuna Mail. The sterilization patches are atomic, reviewable, and on the `compliance/v0.1` branch.

This is not a criticism of Foundry 376. The leaks accumulated over years of feature development; each one made sense individually. We chose to fork rather than carry that same baggage into a product sold to organizations under GDPR, KNF and NIS2 obligations.

---

*Last reviewed: 2026-05-09. Next review: when v0.1 ships, then quarterly.*
