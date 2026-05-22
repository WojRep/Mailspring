# Security

**English** · [Polski](SECURITY.pl.md)

## Posture

Actuna Mail is built on a single principle: **the binary you install must not transmit your data, your metadata, or your contacts' data to any third party that you have not knowingly chosen.**

What this means in practice:

1. **Email credentials** (IMAP/SMTP passwords, OAuth refresh tokens) are stored in the operating system's secure credential store — macOS Keychain via Electron's `safeStorage`, Windows Credential Manager, or Linux Secret Service / GNOME Keyring / KWallet. They never leave the credential store except to be passed in-memory to the local `mailsync` subprocess that connects to your mail provider.

2. **Mail content** (message bodies, full-text search index, contacts, calendars) is stored locally in SQLite under the user's application data directory at `~/Library/Application Support/ActunaMail/edgehill.db` (macOS) or platform equivalent. This database is **encrypted at rest with SQLCipher** (AES-256-CBC + HMAC) — Tier A: a random 32-byte key generated at first launch and protected by the OS keychain via Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux GNOME Keyring or KWallet). Encryption is default-on for fresh installs; the renderer and the C++ `mailsync` engine both open the same encrypted database. Tier A is verified on macOS (smoke test 9/9, KROK 5 egress retest clean); the Windows and Linux `mailsync` rebuilds and installer artifacts are tracked in backlog ticket #52. **Tier B** (opt-in master password) is also available: the user sets a master password in Preferences → Security, the database key is wrapped with an Argon2id-derived key (64 MiB / t=3 / p=1) instead of the OS keychain, and the app must be unlocked on every launch and re-locks on idle timeout / sleep / screen-lock. The runtime re-lock is a UI overlay that blocks access to mail content; the database key is fully evicted from process memory on app quit, and every cold start requires the master password. A recovery code is issued at setup for the forgotten-password path. Tier B is recommended for KNF-regulated deployments.

3. **Attachments** stored as files under `files/` are **encrypted at rest** — AES-256-GCM per file, with a key derived via HKDF-SHA256 from the same SQLCipher DBKey (no separate secret to manage). Both the renderer and the C++ `mailsync` engine read and write the shared `AENC` on-disk format, and inline images / previews / Open / drag-out decrypt transparently. Application-layer encryption at rest covers the database and the attachment files.

4. **No third-party error reporting.** No Sentry. No native crash reporter to remote servers. Crashes are logged locally to disk only. Electron Crashpad and Breakpad are disabled at three layers (renderer code, main process flags, mailsync C++ env).

5. **No third-party visual or behavioural lookups.** No Gravatar. No `logo.getmailspring.com`. No Plugin Metadata Sync. No Identity polling. The Mailspring identity/Foundry layer was removed entirely (the `Identity` store is gutted and returns `null`; `IDENTITY_SERVER` env var passed empty to mailsync).

6. **No auto-update channel.** The user controls when an update is applied. Once Actuna's own update channel ships, it will be opt-in and signed.

7. **No telemetry.** Not now, and not after the optional Actuna Engine ships. If telemetry ever exists, it will be opt-in, off by default, documented in this file, and limited to non-PII performance metrics.

8. **Custom URL schemes are internal.** The renderer uses an `actunamail://` scheme for asset loading and a sibling `actuna-attachment://` scheme that streams decrypted inline images to the message iframe. The `actunamail://ai/...` namespace is reserved for future opt-in deep-links to AI features under AI Act Art. 5/52 constraints.

9. **Structured logging with runtime redaction.** Application logs use a structured JSON-line logger (`pino`), replacing the legacy `emorikawa/debug#nylas` fork (which carried two ReDoS CVEs). Every log record passes through a redaction layer that masks credentials — passwords, OAuth/refresh/access tokens, client secrets, cookies, DB keys, Argon2 material, plus JWT-shaped and long base64 values found anywhere in a record — before it is written; in production the user's email address is reduced to an 8-character hash. Redaction is bypassed only under debug-level logging (`ACTUNA_LOG_LEVEL=debug`), a developer setting — production builds redact by default. Renderer log lines are forwarded over IPC to the main process, the only component with log-file access (renderers cannot write the log file). The C++ `mailsync` engine emits the same JSON-line schema. An **opt-in, off-by-default** local audit trail (`core.audit.enabled`) records account and sync events to a local file under the config directory — never transmitted over the network. Implemented in backlog ticket #04.

The full sterilization log — every endpoint removed, every file changed, every line of code patched — is documented in [`COMPLIANCE.md`](COMPLIANCE.md); the per-release history is in [`CHANGELOG.md`](CHANGELOG.md).

## Backup and restore

The application data directory (`~/Library/Application Support/ActunaMail/` on macOS, platform equivalents elsewhere) holds the encrypted database `edgehill.db`, the encrypted attachment files under `files/`, and `db-key.enc` — the SQLCipher database key wrapped by the OS credential store via Electron `safeStorage`.

**Backing up that directory is safe.** Even though the backup includes `db-key.enc`, the key inside it cannot be read without the OS credential store, and that store is machine/profile-bound and not cloud-synced:

- **macOS** — Chromium's `os_crypt` (which `safeStorage` uses) stores the "Safe Storage" key via `crypto::AppleKeychain`, the legacy `SecKeychain*` generic-password API. Legacy keychain items are structurally **not** iCloud-synchronizable — `kSecAttrSynchronizable` is an attribute of the modern `SecItem*` data-protection keychain only and cannot be set on legacy items. The Safe Storage key therefore never syncs to iCloud Keychain.
- **Windows** — DPAPI (`CryptProtectData`), scoped to the Windows user profile.
- **Linux** — the Secret Service (GNOME Keyring / KWallet), local to the machine.

So a copy of `db-key.enc` in a cloud backup (Time Machine, iCloud Drive, Dropbox, OneDrive) is opaque ciphertext on any other machine — restoring the folder elsewhere does **not** expose mail content.

Two consequences follow:

1. **Restoring the profile onto a different machine will not open the database** — the wrapping key lives in the original machine's credential store. This is an availability trade-off, not a confidentiality leak; mail re-syncs from the IMAP server. For machine-independent restore, enable **Tier B** (master password): the master password unwraps the database key on any machine, and the recovery code issued at setup is the escrow path.
2. **For confidentiality against a same-user attacker** (malware running as your user account can read the credential store), Tier A is not sufficient — enable **Tier B**.

`db-key.enc` is deliberately kept co-located with `edgehill.db` in the profile directory: relocating it outside typical backup scope would break atomic profile backup/restore and add no confidentiality benefit (the co-located blob is useless without the machine credential store). See backlog ticket #46 (Tier B) for the master-password path.

## Logs and audit trail at rest

Unlike the database and attachments, the diagnostic log (`<logs>/<date>.log`) and the opt-in audit trail (`<config>/audit/<date>.audit.log`) are written as **plaintext** files. After redaction they no longer carry credentials, but they still contain personal data in the GDPR sense — account identifiers, provider names, a hashed email, and free-text message strings. They are the only PII artefact at rest outside the SQLCipher / AES-GCM encryption.

- **At-rest protection** — protect the logs by enabling full-volume encryption (FileVault on macOS, BitLocker on Windows, LUKS on Linux). ActunaMail does not separately encrypt the log files; volume encryption is the expected control. Regulated deployments should treat the log and audit directories as in-scope for their data-protection measures.
- **Redaction bypass is dev-only** — the redaction layer can be disabled with `ACTUNA_LOG_LEVEL=debug` for debugging, but only in a non-packaged **dev build**. A packaged production build always redacts, even if that environment variable is set — the variable alone cannot expose credentials in a shipped build.
- **Audit-trail retention** — audit files rotate per day; files older than 90 days are pruned automatically. This local default bounds disk use; a deploying organisation sets its own legal retention period and, where it needs longer retention or tamper-evidence, should forward the audit files to its SIEM / archival system. The local trail is append-only by convention but is **not** cryptographically tamper-evident.
- **`actuna-log` IPC channel** — renderer log lines are forwarded to the main process over an `actuna-log` IPC channel, which appends them to the shared log file. A compromised renderer could write arbitrary strings into the log. This is a low-severity threat: a renderer already executes application code, and the log is local-only. It is recorded here for completeness of the threat model.

> **Developer note** (non-compliance): the redaction layer's `BASE64_VALUE` rule masks any standalone string longer than 40 base64 characters. This can also mask long *legitimate* identifiers that are not secrets (e.g. part of a Message-ID or a MIME boundary). This is a deliberate fail-safe bias — over-redacting a non-secret is preferable to leaking one.

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

## Optional egress — AI Assistant (opt-in, off by default)

The optional **AI Assistant** (the `actuna-ai` plugin) can send the
content of a conversation you select to an external AI model. This is
**not a default**: the feature is off on a fresh install and must be
turned on per account in Preferences → AI Assistant.

| Destination | Purpose | When |
|---|---|---|
| `api.anthropic.com` | AI processing of a conversation you explicitly act on | Only when the AI Assistant is enabled, the account is opted in, and you run an AI action |

Properties of this path:

- **Bring-Your-Own.** The request goes through *your own* `claude` CLI,
  authenticated to *your own* Anthropic account. Actuna Mail does not
  mediate, store or relay AI credentials and does not resell inference.
- **Separate process.** The AI logic runs in a separate `actuna-engine`
  process, not inside Actuna Mail. The mail client never embeds it.
- **Consent-gated twice.** The plugin will not send a request without
  per-account consent; the engine independently refuses any request that
  does not carry consent.
- **Verifiable.** The KROK 5 egress regression confirms **zero hits** to
  `api.anthropic.com` when the AI Assistant is off or idle; hits appear
  only while an AI action you started is running.
- **Transfer outside the EEA.** `api.anthropic.com` is operated in the
  USA. Before enabling this for regulated or sensitive correspondence,
  read the Data Protection Impact Assessment
  (`../docs/legal/dpia-ai-sidebar.md`).
- **Agentic chat — actions are local.** The AI Assistant includes a chat
  that can also *perform* mailbox actions (move, label, send, etc.). Those
  actions run locally through Actuna Mail's own task system — they add **no**
  new network egress. Every mailbox-changing action requires an explicit
  per-action confirmation click. The egress host above is unchanged: the
  only thing that leaves the device is the AI request, to `api.anthropic.com`,
  via your own `claude` CLI. See the DPIA Addendum A for the agentic-chat
  risk assessment.

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
