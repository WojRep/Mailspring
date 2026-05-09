# CI/CD security posture (Actuna Mail v0.1)

This document describes the GitHub Actions / CI/CD posture of the
`WojRep/ActunaMail` repository during the v0.1 sterilization phase.
It is the audit trail for `Settings → Actions` and the workflow files
in `.github/workflows/`.

## Threat model

A fork inherits the workflow definitions but not the secrets of its
parent. In our case the parent (`Foundry376/Mailspring`) ships five
workflows that depend on:

- AWS credentials for distribution to S3
- Apple codesigning keys + provisioning profile
- Apple notary credentials
- Windows Authenticode certificate
- a long list of npm postinstall scripts run during `npm ci`

If a fork operator (us) ignores these workflows, the worst-case
outcomes are:

1. **Noisy failures** — every PR or push to `master` triggers tests
   that immediately fail when the upstream secrets are missing.
   Costs us no money on a private repo, but burns reviewers' time.
2. **Postinstall script execution** — a compromised npm dependency
   could run arbitrary code on a GitHub-hosted runner with the
   default `GITHUB_TOKEN` (which has write access to issues, PRs,
   actions, packages, contents on public repos and read on private).
   This is a real supply-chain vector.
3. **Accidental release** — `workflow_dispatch` triggers on the
   build workflows would attempt a build + sign + upload. With our
   missing secrets they fail, but a future operator with secrets
   set up incorrectly could publish under the Mailspring identity.

## Posture decisions

Three layers of control, defense in depth:

### Layer 1 — Repository-level Actions disable

```bash
gh api -X PUT /repos/WojRep/ActunaMail/actions/permissions \
  -H "Accept: application/vnd.github+json" \
  --input - <<<'{"enabled":false}'
```

State after the change:

```
GET /repos/WojRep/ActunaMail/actions/permissions
{"enabled":false,"sha_pinning_required":false}
```

This blocks all workflow runs at the repo level. Re-enable from
Settings → Actions → "Allow all actions and reusable workflows"
when v0.3 ships its own CI.

### Layer 2 — Workflow file neutralization

All five upstream workflow files are replaced with no-op stubs on the
`compliance/v0.1` branch. Each stub:

- has `on: workflow_dispatch:` (manual only, no auto-trigger),
- runs no real job (`if: ${{ false }}` guard),
- preserves the file path so the diff against upstream is reviewable,
- carries a header comment explaining what was removed and why.

The diff is `git diff main..compliance/v0.1 -- .github/workflows/`.

If Layer 1 is accidentally re-enabled, Layer 2 still ensures no real
work runs. A future operator who wants to restore a workflow must
explicitly remove the `if: false` guard and add real triggers, which
forces the operator to think.

### Layer 3 — Secret hygiene verified

After fork creation:

```bash
gh api /repos/WojRep/ActunaMail/actions/secrets
# {"total_count":0,"secrets":[]}
gh api /repos/WojRep/ActunaMail/actions/variables
# {"variables":[],"total_count":0}
```

GitHub does not propagate secrets to forks; verified empty. The
repository inherits no AWS access keys, no codesign certificates,
no Apple credentials, no Windows Authenticode certs. If any of these
are needed in v0.3 they will be added under Actuna's accounts, with
documented purpose, scope, and rotation policy.

### Layer 4 — Branch protection (deferred — Free private limitation)

GitHub branch protection rules and the newer rulesets API both
return `403 "Upgrade to GitHub Pro or make this repository public"`
on the GitHub Free plan for private repositories. While the
repository is in this state, branch protection is provided by
operator discipline rather than the platform:

- No force pushes to `main` (operator practice; a single `--force`
  could rewrite history, so commits to `main` are append-only by
  convention until the protection feature is unlocked).
- Compliance branches (`compliance/v*`) may force push; this is
  desired for the rebase / fixup workflow during sterilization.
- Linear history is enforced by squash-only merges on PRs.

When the repository is flipped to public (Phase 3 launch) or upgraded
to a paid tier, the following rulesets land in the same commit that
flips visibility:

```bash
gh api -X POST /repos/WojRep/ActunaMail/rulesets --input - <<<'{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"}
  ]
}'
```

### Layer 5 — Repository hardening (applied)

These settings are available on Free private repos and are now active:

- `allow_merge_commit: false` (no merge commits, only squash/rebase).
- `allow_auto_merge: false` (no automated merges bypassing manual review).
- `delete_branch_on_merge: true` (clean up).
- `has_wiki: false` (no separate content surface; everything lives
  in the repo).
- Dependabot vulnerability alerts: enabled (security-positive,
  notifies maintainers of known CVEs in `npm` deps).

GitHub Advanced Security (secret scanning, push protection,
code scanning) requires either a public repo or a paid tier, and
is deferred to the Phase 3 launch.

### Layer 6 — Sister forks

The same hardening is applied to the two other repositories created
during the audit phase:

- `WojRep/Mailspring` — Actions disabled, zero secrets.
- `WojRep/Mailspring-Sync` — Actions disabled, zero secrets.

These remain as the audit-base forks; they are not used for
distribution.

## Re-enabling CI in v0.3

When Actuna's own CI ships in v0.3, the procedure is:

1. Open a PR titled `ci: enable own pipeline (v0.3)`.
2. Add the new workflow files under `.github/workflows/`.
3. Each workflow file must have a header comment listing:
   - what triggers are configured and why,
   - what secrets it reads and where the corresponding secret was
     added (Actions secret, environment secret, organization
     secret),
   - what permissions it requests (`permissions:` block, restricted
     to the minimum),
   - what artifacts or external services it touches.
4. Use `npm ci --ignore-scripts` for any install step that does not
   strictly need postinstall hooks. Pin third-party actions by
   commit SHA (the `gh api ... sha_pinning_required: true` setting
   can be flipped on at the same time).
5. Update `COMPLIANCE.md` referencing the new pipeline, in the
   section on supply chain security (NIS2 Article 21(c)).
6. Re-enable Actions at Settings → Actions, selecting
   "Allow Actuna and select non-Actuna actions" with the explicit
   list.

## Audit trail for re-enabling

Any change to this file or to `.github/workflows/` should be a
separate commit referencing this document. Git history is the audit
trail. The first commit on `compliance/v0.1` that touched these
files is the one that introduced this document.
