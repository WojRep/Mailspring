// WS2-A: stub replacement for the upstream Sentry error reporter.
//
// Upstream behaviour (Mailspring 1.21.0):
//   const DSN = 'https://...@o70907.ingest.us.sentry.io/4511340571000832';
//   constructor: getMac() -> SHA-256(MAC) as deviceHash and user.id;
//   reportError -> https.request POST /api/<project>/envelope/ with
//   stack frames, plugin IDs, and arbitrary extra payload (see analysis/04).
//
// Actuna Mail does not transmit errors to Sentry. This file remains so
// that any code path that imports SentryErrorReporter still resolves to
// a constructor, but the constructor and reportError do nothing. There
// is no DSN, no getmac, no https.request — even if the file is reached
// by a future regression, no envelope can leave the process.
//
// Compliance: GDPR Art. 5, 6, 13, 25, 32, 44+; KNF Rec. D; NIS2 Art. 21(c).

module.exports = class SentryErrorReporter {
  constructor(_args) {
    // intentionally no MAC fingerprinting, no DSN parsing, no network setup.
  }

  getRelease() {
    return 'actuna';
  }

  reportError(_err, _extra) {
    // No-op. Errors are logged to the local console only by ErrorLogger.
  }
};
