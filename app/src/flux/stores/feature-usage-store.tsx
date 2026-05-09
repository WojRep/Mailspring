import MailspringStore from 'mailspring-store';

// Actuna Mail does not have a Pro tier, a Foundry-backed identity, or a
// quota system. The original FeatureUsageStore from Mailspring upstream
// gated 'Pro' features (snooze, send-later, grammar-check, etc.) against
// per-user quotas served by id.getmailspring.com. In Actuna Mail every
// feature is unconditionally available.
//
// This file is the stub that preserves the public API surface so callers
// (e.g. send-later, composer-templates, github-contact-card) keep working
// with no behavioural change other than "always available".
//
// Compliance:
//   GDPR Art. 5(1)(c) — eliminating the per-feature usage event removes
//   an unnecessary metadata stream to a third-country processor.
//   Maps to finding #8 (SendFeatureUsageEventTask).

class NoProAccessError extends Error {}

export interface FeatureLexicon {
  headerText: string;
  rechargeText: string;
  iconUrl: string;
}

class _FeatureUsageStore extends MailspringStore {
  NoProAccessError = NoProAccessError;

  // No-op: there is no upgrade flow in Actuna Mail.
  displayUpgradeModal(_feature: string, _lexicon: FeatureLexicon): Promise<void> {
    return Promise.resolve();
  }

  // Every feature is usable, always.
  isUsable(_feature: string): boolean {
    return true;
  }

  // No quota tracking, no remote event.
  async markUsedOrUpgrade(_feature: string, _lexicon: FeatureLexicon): Promise<void> {
    return;
  }

  markUsed(_feature: string): void {
    return;
  }
}

export const FeatureUsageStore = new _FeatureUsageStore();
