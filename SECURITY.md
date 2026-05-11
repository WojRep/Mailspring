# Security

## Posture

Actuna Mail is built on a single principle: **the binary you install must not transmit your data, your metadata, or your contacts' data to any third party that you have not knowingly chosen.**

What this means in practice for ActunaMail v0.2.0 (current shipped release):

1. **Email credentials** (IMAP/SMTP passwords, OAuth refresh tokens) are stored in the operating system's secure credential store — macOS Keychain via Electron's `safeStorage`, Windows Credential Manager, or Linux Secret Service / GNOME Keyring / KWallet. They never leave the credential store except to be passed in-memory to the local `mailsync` subprocess that connects to your mail provider.

2. **Mail content** (message bodies, attachments, full-text search index) is stored locally in SQLite under the user's application data directory at `~/Library/Application Support/ActunaMail/edgehill.db` (macOS) or platform equivalent. v0.2.0 inherits Mailspring's plain SQLite — at-rest protection is currently provided by the operating system disk encryption (FileVault, BitLocker, LUKS). Application-level encryption via SQLCipher is on the roadmap (design memo in Sprint 6 ticket 03, implementation targeted for v0.3 with two tiers: transparent OS-keychain-derived key for consumer use, and opt-in master password for KNF-regulated use).

3. **No third-party error reporting.** No Sentry. No native crash reporter to remote servers. Crashes are logged locally to disk only. Electron Crashpad and Breakpad are disabled at three layers (renderer code, main process flags, mailsync C++ env).

4. **No third-party visual or behavioural lookups.** No Gravatar. No `logo.getmailspring.com`. No Plugin Metadata Sync. No Identity polling. The Mailspring identity/Foundry layer was removed entirely (the `Identity` store is gutted and returns `null`; `IDENTITY_SERVER` env var passed empty to mailsync).

5. **No auto-update channel** in v0.2.0. The user controls when an update is applied. Once Actuna's own update channel ships (post Faza B Apple Developer ID enrollment, queued as ticket 07), it will be opt-in and signed.

6. **No telemetry.** Not now, and not after the optional Actuna Engine ships. If telemetry ever exists, it will be opt-in, off by default, documented in this file, and limited to non-PII performance metrics.

7. **Custom URL scheme renamed** in v0.2.l from `mailspring://` to `actunamail://` (42 callsites migrated). The scheme is internal to the renderer for asset loading; it is also reserved for future opt-in deep-links to AI features (`actunamail://ai/...` namespace, ticket 16 EPIC) under AI Act Art. 5/52 constraints.

The full sterilization log — every endpoint removed, every file changed, every line of code patched — is documented in [`COMPLIANCE.md`](COMPLIANCE.md) and tracked on the `compliance/v0.2` branch (tagged `v0.2.0`).

## What goes out over the network in default v0.2.0

| Destination | Purpose | When |
|---|---|---|
| Your IMAP / SMTP server | Mail core protocol | While the app is running with active accounts |
| Your CalDAV / CardDAV server | Calendar and contact sync | When configured |
| `accounts.google.com`, `oauth2.googleapis.com` | OAuth refresh for Gmail | When the Gmail account's token expires |
| `login.microsoftonline.com`, `graph.microsoft.com` | OAuth refresh for Microsoft 365 / Outlook | When the M365 token expires |
| `lh3.googleusercontent.com`, `lh*.ggpht.com` | Avatar URLs returned in OAuth responses | When rendering Google avatars that came inline |

That is the full list. There are no other defaults. If your network monitor sees ActunaMail v0.2.0 reaching anything else, that is a bug — please report it.

**Empirical baseline:** [`verification/test-1-post-patch-v02.txt`](../verification/test-1-post-patch-v02.txt) (KROK 5 procedure, 10-minute tcpdump capture with active IMAP/SMTP/CardDAV account) confirms **zero hits** to forbidden hosts: `*.getmailspring.com`, `*.sentry.io`, `*.gravatar.com`, `*.wp.com`.

## How to verify

Independent verification is the point of this project. We provide:

- The full audit pack — see the project's parent directory at `tech@actuna.pl`.
- Runtime tcpdump scripts (in the audit project) that you can run to confirm zero unauthorized egress.
- Diff against upstream Mailspring 1.21.0: `git diff 1.21.0..v0.2.0`.
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

## Changes since v0.1 (v0.2.0 release notes — security-relevant)

| Sprint | Series | Security-relevant delta |
|---|---|---|
| 4 | v0.2.e | Dependency upgrades closing 42 of 52 Dependabot alerts. Electron 39.2.7 → 41.5.0 (Chrome 146), DOMPurify 3.3.1 → 3.4.2 (8 XSS-bypass alerts), `@xmldom/xmldom` 0.8.11 → 0.8.13 (5 XML injection alerts), lodash 4.17.21 → 4.18.1 (code injection via `_.template`), `postcss` 8.4.38 → 8.5.14 (XSS via `</style>`), `minimatch` and `brace-expansion` ReDoS fixes. Remaining 5 architectural deferrals documented in `analysis/10-sprint4-dependabot-triage.md`. |
| 5 | v0.2.f | SMTP test email content reads localized `ACTUNA_TEST_*` env vars (mailcore2 modified). GPL-3.0 §5(a) attribution added at top of `all_licenses.html` (PL + EN bilingual). |
| 5 | v0.2.h | i18n parity enforcement script (`scripts/check-i18n-parity.js`) ensures PL+EN translations stay in lockstep; prevents silent locale drift. `intl.ts:252` placeholder math bug fix (zero-indexing). |
| 5 | v0.2.j | mailsync C++ anti-fork check (substring "mailspring" in executable path) removed. Bundle layout simplified — mailsync now lives at the natural `app.asar.unpacked/mailsync` path. No security regression: the removed check was anti-fork, not anti-tampering. Code-signing (ad-hoc) verifies binary integrity. |
| 5 | v0.2.k | Custom URL scheme `mailspring://` renamed to `actunamail://` in renderer + main process. Internal scheme registration via `registerSchemesAsPrivileged` updated. Reserved `actunamail://ai/...` namespace for future AI integration (opt-in, AI Act Art. 5/52 documented). |
| 5 | v0.2.l | 16 internal modules renamed from `mailspring-*` to `actunamail-*` (including `actunamail-exports`, `actunamail-component-kit`, `actunamail-store`). 481 import paths updated. `.eslintrc` whitelist updated. `engines.mailspring` in 42 internal_packages intentionally deferred to a separate refactor ticket (PackageManager coupling). |
| 6 | v0.2.m | UX hover discoverability — global CSS rules for cursor pointer on interactive elements, touch target min-size 36px (desktop) / 44px (touch via `@media (pointer: coarse)`), subtle active-state scale feedback. No security impact. |
| 6 | v0.2.n | Tooltip foundation component (`<Tooltip>`) wrapping `@floating-ui/react@^0.20` (React 16 compatible). WCAG 1.4.13 compliant. Facade pattern enables 1-file swap to React Native compatible package on future mobile path. |
| 6 | v0.2.o | Retroactive TDD coverage for Sprint 5 untested production code — 3 spec files (page-compliance, check-i18n-parity, intl extended). Methodology debt paid down. |

**Tagged release:** [`v0.2.0`](https://github.com/WojRep/ActunaMail/releases/tag/v0.2.0) on `WojRep/ActunaMail` `compliance/v0.2` branch.

**Submodule pinned:** `WojRep/Mailspring-Sync` tag `actuna-v0.2.0` (commit `4441196`, anti-fork check removed).

---

*Last reviewed: 2026-05-11 (Sprint 6 close-out for ticket 05). Next review: at each sprint close, or whenever the endpoint table or sterilization layer changes.*
