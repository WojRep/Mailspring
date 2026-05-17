# Contributing to Actuna Mail

**English** · [Polski](CONTRIBUTING.pl.md)

Actuna Mail is a compliance-hardened fork of Mailspring 1.21.0, currently in pre-alpha.

## Pull requests

We are **not accepting external pull requests** during pre-alpha. The codebase is changing quickly and every change is tied to an audit ticket.

## Independent verification

Verification is the point of this project. What we actively welcome:

- **Reproducing the audit.** [AUDYT-MAILSPRING.md](AUDYT-MAILSPRING.md) documents every egress channel removed from upstream Mailspring; the method is reproducible.
- **Runtime egress checks.** Confirm for yourself that a build emits zero traffic to third-party hosts — see [SECURITY.md](SECURITY.md).
- **Bug reports and security findings.** Email `tech@actuna.pl`. For security vulnerabilities, follow the responsible-disclosure process in [SECURITY.md](SECURITY.md).

Please do **not** open issues on GitHub during pre-alpha — email is the channel.

## Building from source

Build instructions live in the repository's developer documentation (`CLAUDE.md` and the build scripts under `app/build/`). In short: `npm install`, then `npm start` for development or `npm run build` for a production build.

## Code of conduct

This project is released with a Contributor [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

## Contact

`tech@actuna.pl`
