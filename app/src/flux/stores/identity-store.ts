import ActunaMailStore from 'actunamail-store';

// Actuna Mail does not have a ActunaMail ID concept. Per
// analysis/05-remediation-plan.md and the user directive of 2026-05-09
// ("Całkowite usunięcie"), the entire identity flow with
// id.getmailspring.com is removed.
//
// Removed in this stub vs upstream ActunaMail 1.21.0:
//   - 10-minute polling of /api/me (finding #6, finding T3.A).
//   - fetchSingleSignOnURL via /api/login-link.
//   - fetchIdentity (with the HIGH-PII reportError on /api/me invalid
//     JSON, see analysis/04-reportError-callsites-payload.md D5 finding D5).
//   - saveIdentity writing identity token to plain config.json
//     (analysis/07-storage-static-analysis.md D5).
//   - hasProFeatures / Pro tier concept.
//
// Public API surface preserved so call sites elsewhere keep typechecking:
//   IdentityStore.identity()        -> always null
//   IdentityStore.identityId()      -> always null
//   IdentityStore.hasProFeatures()  -> always false
//   IdentityStore.saveIdentity(_)   -> async no-op
//   IdentityStore.fetchIdentity()   -> always null
//   IdentityStore.fetchSingleSignOnURL(path) -> rejects, no Foundry SSO
//
// Compliance:
//   GDPR Art. 5(1)(c) — eliminates 10-minute identity poll.
//   GDPR Art. 6 / Art. 7 — no consent flow needed because no processing.
//   GDPR Art. 44+ — eliminates Schrems II transfers to id.getmailspring.com.
//   NIS2 Art. 21(c) — supply chain risk eliminated.

export interface IIdentity {
  id: string;
  token: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  stripePlan: string;
  stripePlanEffective: string;
  featureUsage: {
    [featureKey: string]: {
      featureLimitName: 'pro';
      usedInPeriod: number;
      quota: number;
      period: 'weekly' | 'monthly';
    };
  };
}

export type IdentityAuthResponse = IIdentity | { skipped: true };

export const EMPTY_FEATURE_USAGE = {
  featureLimitName: 'pro',
  period: 'monthly',
  usedInPeriod: 0,
  quota: 0,
};

class _IdentityStore extends ActunaMailStore {
  constructor() {
    super();
    // No polling, no config listener, no logout listener.
  }

  identity(): IIdentity | null {
    return null;
  }

  identityId(): string | null {
    return null;
  }

  hasProFeatures(): boolean {
    return false;
  }

  async saveIdentity(_identity: IIdentity | null): Promise<void> {
    return;
  }

  async fetchIdentity(): Promise<IIdentity | null> {
    return null;
  }

  async fetchSingleSignOnURL(_path: string, _opts: any = {}): Promise<string> {
    return Promise.reject(
      new Error(
        'fetchSingleSignOnURL is not available in Actuna Mail (ActunaMail ID disabled).'
      )
    );
  }
}

export const IdentityStore = new _IdentityStore();
