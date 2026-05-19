# Compliance

**English** · [Polski](COMPLIANCE.pl.md)

Actuna Mail is built to defensible compliance with four overlapping regimes that apply to organizations operating in Poland and the European Union:

- **GDPR** — Regulation (EU) 2016/679, with Polish implementation in *ustawa o ochronie danych osobowych* (10 May 2018) and the supervisory role of the Office for Personal Data Protection (UODO).
- **AI Act** — Regulation (EU) 2024/1689.
- **KNF** — guidelines from the Polish Financial Supervision Authority, in particular Recommendation D (IT governance), Recommendation Z (outsourcing risk), and the *Communiqué on the use of cloud services* of 23 January 2020.
- **NIS2** — Directive (EU) 2022/2555, with Polish implementation in the *Krajowy System Cyberbezpieczeństwa 2.0*.

This document is a working compliance map between **the actual code in this repository** and **specific articles of the four regimes**. It is not a legal opinion and it does not substitute for a Data Protection Impact Assessment (DPIA), a Transfer Impact Assessment (TIA), or counsel from a qualified lawyer. It is meant to be precise enough that an auditor or DPO can verify each claim.

## How this document is organized

For each regime we list the articles that reach a desktop email client of this kind. For each article we state:

- **What the regulation requires.** A short, faithful paraphrase.
- **What upstream Mailspring 1.21.0 does.** With file path and line number.
- **What Actuna Mail does.** With reference to the patch.
- **Verification.** How an auditor can confirm.

Every "what upstream does" claim is sourced from the audit in the parent project of this fork. The audit itself is reproducible — clone Mailspring 1.21.0 at commit `561a81a3` and run the same greps. We deliberately make the contrast verifiable rather than rhetorical.

---

## GDPR / RODO

### Article 5(1)(a) — Lawful, fair, transparent processing

**Required.** Personal data must be processed lawfully, fairly, and transparently in relation to the data subject.

**Mailspring 1.21.0.** The default install contacts at minimum ten distinct external endpoints (see [SECURITY.md](SECURITY.md) and [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md)) without prior notice in the application's first-run UX. The SECURITY.md document distributed with the source promises behaviour that the binary does not exhibit.

**Actuna Mail.** All ten egress channels are removed by default. The repository contains atomic commits, one per channel, each citing the line numbers in upstream that were patched. The SECURITY.md is faithful to the binary.

**Verification.** Run the runtime tcpdump scripts shipped with the audit project, in `post-patch` mode, against a build of this repository. Expected output: zero requests to `*.getmailspring.com`, `*.sentry.io`, `*.gravatar.com`, `*.wp.com` for the lifetime of the process.

### Article 5(1)(c) — Data minimization

**Required.** Personal data must be adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed.

**Mailspring 1.21.0.**
- `IdentityStore` polls `/api/me` every 10 minutes for the lifetime of the app, even after the identity is unchanged.
- `SendFeatureUsageEventTask` is queued every time a Pro feature is used, even on the Basic plan with no quota to enforce server-side.
- The streaming connection at `/deltas/<accountId>/streaming?ih=<imapHost>` carries the user's IMAP host as a URL parameter for the duration of the session.

**Actuna Mail.** Identity polling is removed. `SendFeatureUsageEventTask` is removed. The streaming connection is removed (the Mailspring ID concept is removed entirely; see Article 7).

**Verification.** `grep -rn "fetchIdentity\|SendFeatureUsageEventTask\|MetadataWorker" app/ mailsync/MailSync/` returns nothing relevant.

### Article 6 — Lawful basis

**Required.** Each processing operation must have a lawful basis (consent, contract, legal obligation, vital interests, public task, or legitimate interests).

**Mailspring 1.21.0.** Sentry, Gravatar, `logo.getmailspring.com`, identity polling, Plugin Metadata Sync, `/api/resolve-dav-hosts`, and the onboarding webview all run by default. None of them have an explicit lawful basis disclosed in the application UI. The argument that error reporting is a legitimate interest under Article 6(1)(f) does not survive the balancing test when the data is shipped to the United States with no DPA, no TIA, and no opt-out — particularly given the SECURITY.md promise to the contrary.

**Actuna Mail.** The processing operations whose lawful basis is doubtful are removed. What remains:
- IMAP / SMTP / CalDAV / CardDAV traffic to the user's chosen mail provider (Article 6(1)(b) — performance of contract).
- OAuth refresh against Google / Microsoft (Article 6(1)(b)).
- That is the entire list.

**Verification.** Compare the network destinations table in SECURITY.md with the runtime tcpdump output.

### Article 7(2) — Conditions for consent

**Required.** Consent must be freely given, specific, informed, and unambiguous, and the request must be clearly distinguishable from other matters.

**Mailspring 1.21.0.** `app/internal_packages/onboarding/lib/newsletter-signup.tsx:67-72` calls `POST /newsletter` from `componentDidMount`. There is no checkbox, no opt-in dialog, no record of consent. Any user who completes onboarding is enrolled.

**Actuna Mail.** The newsletter signup module is removed in its entirety. There is no newsletter to subscribe to.

**Verification.** `ls app/internal_packages/onboarding/lib/newsletter*` returns no files.

### Articles 13 / 14 — Information to data subjects

**Required.** When personal data is collected, the controller must provide identity, purposes, lawful basis, recipients, retention, rights, and so on, at the time of collection.

**Mailspring 1.21.0.** SECURITY.md is the closest thing to an in-app information notice and it does not match the code. The privacy policy at `getmailspring.com/privacy-policy` is reachable only by leaving the application.

**Actuna Mail.** SECURITY.md is rewritten to match the binary. The binary itself does not collect personal data for any purpose other than connecting the user to their own mail provider, so the Articles 13/14 burden is dramatically reduced compared to upstream Mailspring. When the optional Actuna Engine ships, the AI router will surface its own information notice at first use.

### Article 25 — Data protection by design and by default

**Required.** Appropriate technical and organisational measures must be implemented, by default, so that only personal data necessary for each specific purpose is processed.

**Mailspring 1.21.0.** The default state is "everything on" — Sentry, crash reporter, Gravatar, identity polling, every Pro plugin loaded. The user must take action to opt out of channels that they have not been informed about.

**Actuna Mail.** The default state is "nothing on except what is necessary to deliver mail." This is the Article 25 standard.

### Article 28 — Processor relationships

**Required.** When a controller engages a processor, there must be a written contract (DPA) covering the matters listed in Article 28(3).

**Mailspring 1.21.0.** Every Gravatar lookup involves Automattic, Inc. as a third party processing personal data of the *user's contacts* (the contact's email is hashed and sent). Without a DPA between the Mailspring user (acting as controller) and Automattic, this is unsupported processing. The same applies to Sentry (Functional Software, Inc.) for stack traces and device fingerprints.

**Actuna Mail.** Both processors are removed. There is no third-party processor in the default configuration.

### Article 32 — Security of processing

**Required.** Appropriate technical and organisational measures including, where appropriate, pseudonymisation and encryption of personal data.

**Mailspring 1.21.0.** Account credentials are correctly placed in the OS keychain. Mail bodies are stored in plain SQLite (`MessageBody.value TEXT`), and the full-text search index (`ThreadSearch` fts5) carries `subject, to_, from_, body` in plain text. Attachment files are stored in plaintext. There is no application-layer encryption at rest.

**Actuna Mail.** OS-keychain handling for credentials inherited (good). The local database `edgehill.db` is **encrypted at rest with SQLCipher** (AES-256-CBC + HMAC) — Tier A: a random 32-byte key generated at first launch, protected by the OS keychain via Electron `safeStorage`, default-on for fresh installs, used by both the renderer and the C++ `mailsync` engine. This covers message bodies, the FTS search index, contacts and calendars. Tier A is verified on macOS (smoke test 9/9, KROK 5 egress retest clean); the Windows and Linux `mailsync` rebuilds are tracked in backlog ticket #52. Tier B (opt-in master password → Argon2id KDF, for the strict KNF reading) is implemented (ticket #46): a user-set master password wraps the DBKey, with a recovery code and idle/sleep/screen-lock auto-lock. **Attachment files** under `files/` are **also encrypted at rest** (AES-256-GCM per file, key derived via HKDF-SHA256 from the same DBKey), implemented in both the renderer and the C++ `mailsync` engine. Application-layer encryption at rest covers the database and the attachment files; no at-rest gap remains. The crash reporter that previously sent process memory to the United States is removed.

### Article 35 — DPIA

**Required.** When processing is likely to result in high risk, a DPIA is required before processing begins.

**Actuna Mail.** Email content is sensitive by definition (it routinely includes special-category data and confidential business communications). Operators deploying Actuna Mail to personnel handling regulated communications should perform a DPIA. We provide a starter template covering the application's actual data flows in the compliance pack.

### Article 44 et seq. — Transfers to third countries (Schrems II)

**Required.** Transfers of personal data to a third country are permitted only on one of the bases in Articles 45–49, with appropriate safeguards.

**Mailspring 1.21.0.** Every default channel except the user's own mail server lands in the United States: Sentry (`o70907.ingest.us.sentry.io`), Foundry's identity service (`id.getmailspring.com`), Gravatar (Automattic), the crash reporter. Schrems II requires a Transfer Impact Assessment when relying on Standard Contractual Clauses; none is provided.

**Actuna Mail.** All default transfers to the United States are removed. The remaining destinations are the user's chosen mail provider and the user's chosen OAuth provider (Google or Microsoft, where transfers are governed by the user's separate relationship with that provider).

---

## AI Act

### Article 50 — Transparency for AI-generated content

**Required.** Providers of generative AI systems must ensure that AI-generated text, when published to inform the public, is detectable as AI-generated, and users must be informed when they interact with an AI system.

**Actuna Mail.** No AI features are present in the mail client itself.

**Actuna Engine (planned).** The Actuna Engine will route to the user's own Claude or Codex CLI subscription. Drafts authored or edited with AI assistance will be marked in the application as such. The marking will be opt-in to send (a literal "Mark as AI-assisted" checkbox in the composer) and never silently injected.

### Article 6 / Annex III — High-risk classification

**Mailspring 1.21.0 / Actuna Mail.** Neither system performs any of the activities listed in Annex III. Article 6 high-risk classification does not apply.

When Actuna ships AI assistance, we will revisit this. Routine email composition assistance is generally not Annex III, but operators in regulated sectors (recruitment, credit, insurance) should review their specific use case.

---

## KNF

### Recommendation D — Areas of IT management

**Recommendation D**, in particular sections on data classification, supply chain, change management, and incident reporting, expects supervised entities to manage IT systems with documented controls.

**Actuna Mail — contribution.**
- Documented data classification: which fields are PII (in `analysis/07-storage-static-analysis.md` of the audit project).
- Documented supply chain: every external endpoint is in [SECURITY.md](SECURITY.md), every npm dependency in `package-lock.json`, every C++ dependency in `mailsync/Vendor/` and `mailsync/vcpkg.json`.
- Change management: every modification from upstream is one atomic, individually reviewable commit.
- Incident response: documented in this file under Article 23 NIS2.
- **Logging and audit trail (§22).** Application logging uses a structured JSON-line logger (`pino`) with a runtime redaction layer that masks credentials, tokens and DB keys before any record is written; the legacy `debug` fork carrying two ReDoS CVEs is removed. The C++ `mailsync` engine emits the same JSON-line schema. An **opt-in, off-by-default** local audit trail (`core.audit.enabled`) records security-relevant events (account add/remove, sync) to a local file, never transmitted over the network. This moves Recommendation D §22 (audit trail) from *neutral* to *implemented baseline*. Implemented in backlog ticket #04 (Mandarynka logger). Tier-B unlock/password-change audit events are wired when ticket #46 lands.

### Recommendation Z — Outsourcing risk

**Recommendation Z** treats the use of third-party services for processing client data as an outsourcing relationship that requires risk assessment, written agreements, exit plans, and control over location.

**Mailspring 1.21.0.** The default install establishes outsourcing relationships with Sentry, Automattic (Gravatar), and Foundry 376 (Plugin Metadata Sync, identity, crash reports), with no written agreement available to the deploying entity.

**Actuna Mail.** All default outsourcing relationships outside of the user's own mail provider and OAuth issuer are removed.

### KNF Communiqué of 23 January 2020 — Cloud as significant outsourcing

The 2020 communiqué treats reliance on cloud services as significant outsourcing for supervised financial entities. It requires risk classification, exit plans, and notification to KNF in some cases.

**Actuna Mail.** No cloud dependency for any default function. The user's mail provider and OAuth issuer are governed by the supervised entity's existing arrangements with those providers.

---

## NIS2

### Article 21 — Risk-management measures

**Required.** Essential and important entities must take appropriate and proportionate technical, operational and organisational measures. Per Article 21(2) these include (a) policies on risk analysis and information system security, (b) incident handling, (c) business continuity and crisis management, (d) supply chain security, (e) security in network and information systems acquisition, development and maintenance, including vulnerability handling and disclosure, (f) policies and procedures to assess the effectiveness of the measures, (g) basic cyber hygiene practices and cybersecurity training, (h) policies and procedures regarding the use of cryptography and, where appropriate, encryption, (i) human resources security, access control policies and asset management, (j) multi-factor or continuous authentication and secured communications, where appropriate.

**Actuna Mail — contribution.**
- (d) Supply chain security — full documented and pruned dependency list, no telemetry to U.S. providers in default configuration.
- (e) Vulnerability handling — responsible disclosure process documented in [SECURITY.md](SECURITY.md).
- (h) Cryptography and encryption — credentials in OS keychain (inherited from Mailspring, correctly used); the local database is encrypted with SQLCipher and attachment files with AES-256-GCM (application-layer encryption at rest, default-on).

This does not by itself satisfy Article 21 — the deploying entity must add organisational measures around the application — but it removes the technical obstacles that upstream Mailspring would have introduced.

### Article 23 — Incident reporting

**Required.** Significant incidents must be reported to the CSIRT or the competent authority within 24 hours of becoming aware (early warning), with a fuller report within 72 hours.

**Actuna Mail.** The application does not produce its own incidents, but it can be implicated by an incident in the deploying entity's environment. We provide:
- An incident response template in the compliance pack.
- A guarantee that no internal information is silently transmitted to a third-party error tracking service that the entity does not control.
- Local crash logs that the entity's own forensic process can access without involving Foundry, Sentry, or any other third party.

### Article 32 — Management responsibility

**Required.** Management bodies of essential and important entities must approve cybersecurity risk-management measures and supervise their implementation. Members are personally liable.

**Comment.** The deployment of an email client is an operational decision; the choice of *which* email client implicates Article 32 only if the choice is materially worse than alternatives. Choosing an email client that ships ten distinct egress channels to the United States by default, without disclosure, is the kind of decision a board would not want to defend in front of a regulator after an incident. Choosing one that does not is materially safer.

---

## Storage encryption

The application encrypts mail data at rest at the application layer — independent of, and in addition to, any volume-level encryption.

**Database at rest — ENCRYPTED (SQLCipher, Tier A).** The local mail database `edgehill.db` is encrypted at rest with SQLCipher (AES-256-CBC + HMAC). The encrypted scope covers:
- Full HTML message bodies (`MessageBody.value`).
- Full-text search index over subject / to / from / body (`ThreadSearch` fts5) — encrypted at the storage-page level, so search still works.
- Full contact book (`Contact` and `ContactSearch` fts5).
- Full calendar events with descriptions (`Event` and `EventSearch` fts5).

Tier A: a random 32-byte key generated at first launch, protected by the OS keychain via Electron `safeStorage`, default-on for fresh installs. Verified end-to-end (`scripts/test-tier-a-smoke.js`). **Tier B (opt-in master password → Argon2id KDF) is implemented** (ticket #46): the DBKey is wrapped under a master-password-derived key (64 MiB / t=3 / p=1), with a recovery code, a startup unlock gate, and idle / sleep / screen-lock auto-lock. Tier B provides the formalised cryptographic-key management — creation, storage, distribution, archiving, protection against unauthorised modification and disclosure — required by KNF Rekomendacja D (2013, Uchwała KNF 7/2013), **Rekomendacja 11 pkt 11.11**. Code-complete and spec-covered on macOS; cross-platform build verification tracked with #52.

**Attachments on disk — ENCRYPTED (`AENC` format).** `~/Library/Application Support/ActunaMail/files/<id>/<filename>` (macOS path; equivalent on other OSes). Each attachment file is encrypted with AES-256-GCM (on-disk `AENC` format: magic + version + 96-bit nonce + ciphertext + GCM tag). The key is derived once via HKDF-SHA256 from the SQLCipher DBKey — same trust model as the database, no separate secret. The C++ `mailsync` engine encrypts on IMAP receive and decrypts on send; the renderer encrypts draft attachments and decrypts for Save / Open / drag-out / inline images / previews. Legacy plaintext attachments from before this feature shipped are still readable (graceful passthrough); there is no migration pass (fresh-install policy).

**Volume-level encryption** (FileVault / BitLocker / LUKS) remains good defence-in-depth but is not required to close any application-layer at-rest gap — both the database and the attachment files are encrypted regardless.

**KNF Recommendation D / NIS2 Article 21.** The at-rest encryption gap that was the single biggest item between the early fork and a strict-reading defensible deployment is now CLOSED — application-layer encryption covers the database (SQLCipher Tier A, and optional Tier B master password) and the attachment files (AES-256-GCM). Tier B adds the formalised, user-controlled cryptographic-key management that KNF Rekomendacja D (2013, Uchwała KNF 7/2013) Rekomendacja 11 pkt 11.11 expects. Design rationale: `analysis/13-sqlcipher-migration-design.md`; code-verified audit: `analysis/15-storage-audit-code-verified.md`.

---

## Compliance pack

The compliance artifacts shipped with the project:

- This document and [SECURITY.md](SECURITY.md).
- [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md) — the line-by-line audit of upstream Mailspring.
- The atomic, per-change commit history of this repository.
- The audit pack in the parent project.
- The runtime egress verification reports under `verification/` in the audit project.

Planned / in progress:

- DPIA template specific to Actuna Mail's data flows.
- TIA template covering the residual transfers (OAuth providers, user's own mail server).
- DPA template for Actuna's role when a Hosted tier ships.
- SBOM (CycloneDX) for both the Electron application and the C++ mail sync engine.
- Public privacy policy on `actuna.pl`.
- Customer-facing compliance package for KNF / NIS2 deployments.
- Apple Developer ID Application cert + notarization (on hold per user direction — a working application first).

---

*This document is part of Actuna Mail and is licensed under the same terms as the rest of the source: GPL-3.0.*
