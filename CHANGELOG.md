# Changelog — Actuna Mail

**English** · [Polski](CHANGELOG.pl.md)

Notable changes to Actuna Mail, the compliance-hardened fork of Mailspring 1.21.0. Newest first. The upstream Mailspring changelog is preserved separately in [CHANGELOG-MAILSPRING.md](CHANGELOG-MAILSPRING.md).

## v0.3 — Encryption at rest

Application-layer encryption at rest for the local database and the attachment files.

- **v0.3.16–v0.3.20 — Attachment encryption (`AENC`).** Attachment files in `files/` are encrypted with AES-256-GCM, key derived via HKDF-SHA256 from the database key. Implemented in both the renderer (TypeScript) and the C++ `mailsync` engine, sharing one on-disk format. Inline email images are served through a dedicated `actuna-attachment://` protocol that decrypts in memory; Open / Save / drag-out / Quick Look decrypt to a temporary location outside the synced profile. Legacy plaintext attachments stay readable (graceful passthrough). (backlog ticket 49)
- **v0.3.0–v0.3.15 — Database encryption (SQLCipher, Tier A).** The local `edgehill.db` is encrypted with SQLCipher (AES-256-CBC + HMAC). A random 32-byte key is generated at first launch and protected by the OS keychain via Electron `safeStorage`; the renderer and `mailsync` share it (env var `ACTUNA_DB_KEY`). Default-on for fresh installs, verified by an automated smoke test. The encrypted scope covers message bodies, the full-text search index, contacts and calendars. Onboarding gained a "Privacy by default" slide. (backlog ticket 45)

## v0.2 — Sterilization complete and hardening

- Dependency upgrades closing ~42 Dependabot alerts — Electron 39 → 41 (Chrome 146), DOMPurify, `@xmldom/xmldom`, lodash, postcss, minimatch and others (XSS, XML-injection, ReDoS and code-injection fixes).
- Brand sweep: 16 internal modules renamed `mailspring-*` → `actunamail-*` (481 import paths updated); custom URL scheme `mailspring://` → `actunamail://`; residual Mailspring branding removed from bundle layout and metadata.
- mailsync C++ anti-fork check removed; bundle layout simplified.
- i18n: PL + EN parity enforcement tooling; translation-gap fixes.
- UX / accessibility: hover discoverability (cursor and touch-target sizing), a `<Tooltip>` foundation component (WCAG 1.4.13), semantic accessibility refactor of the sidebar and rules editor.
- Default settings: 24-hour clock, full headers shown.
- SECURITY.md and COMPLIANCE.md rewritten to match the binary.

## v0.1 — Initial fork

- Fork of Mailspring 1.21.0. All ten default third-party egress channels removed — Sentry, native crash reporter, Gravatar, `logo.getmailspring.com`, Plugin Metadata Sync, identity polling, feature-usage events, `/api/resolve-dav-hosts`, `/ping`, and newsletter signup. The Mailspring ID / Foundry identity layer was removed entirely. Full audit in [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md).
- App renamed Mailspring → ActunaMail (user-facing branding); Actuna brand assets added (app icon, tray icons, welcome image).
- GitHub Actions disabled and CI workflows neutralized.
- Initial compliance documentation (SECURITY.md, COMPLIANCE.md).
- Visual / UX fixes.

---

*Version numbers are application versions (`app/package.json`). Each `[v0.x.y]` entry corresponds to an atomic, individually reviewable commit.*
